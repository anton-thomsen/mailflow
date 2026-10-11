import { Prisma, type PrismaClient, type Run } from "@prisma/client";
import { z } from "zod";
import type { Brand } from "~/domain/brand";
import { contentSchema, type MergeData, renderEmail } from "~/domain/email";
import { type Action, actionAt, compile, parseWorkflow } from "~/domain/workflow";

export const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  recipient: z.object({ id: z.string().min(1).max(200), email: z.string().email() }),
  data: z.record(z.string()).default({}),
  occurredAt: z.string().datetime().optional(),
});

export type HostEvent = z.infer<typeof eventSchema>;

export interface Deps {
  db: PrismaClient;
  brand: () => Promise<Brand>;
  deliver: (email: { to: string; subject: string; html: string }) => Promise<void>;
  check: (request: { check: string; recipientId: string; runId: string; data: MergeData }) => Promise<boolean>;
}

const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;

export type IngestResult = { duplicate: true } | { duplicate: false; started: string[]; stopped: string[] };

export async function ingestEvent({ db }: Pick<Deps, "db">, event: HostEvent, now = new Date()): Promise<IngestResult> {
  try {
    await db.event.create({
      data: { id: event.id, type: event.type, recipientId: event.recipient.id, payload: event, receivedAt: now },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { duplicate: true };
    throw e;
  }

  const stopped: string[] = [];
  const active = await db.run.findMany({ where: { recipientId: event.recipient.id, status: "active" } });
  for (const run of active) {
    if (!parseWorkflow(run.definition).stopOn.includes(event.type)) continue;
    await db.run.update({
      where: { id: run.id },
      data: {
        status: "stopped",
        cursor: null,
        dueAt: null,
        entries: { create: { at: now, kind: "stopped", detail: `Stopped by ${event.type}` } },
      },
    });
    stopped.push(run.id);
  }

  const started: string[] = [];
  const live = await db.workflow.findMany({ where: { status: "live" } });
  for (const workflow of live) {
    const definition = parseWorkflow(workflow.definition);
    if (definition.trigger !== event.type) continue;
    try {
      const run = await db.run.create({
        data: {
          workflowId: workflow.id,
          definition,
          recipientId: event.recipient.id,
          email: event.recipient.email,
          data: event.data,
          cursor: compile(definition).first,
          dueAt: now,
          createdAt: now,
          entries: { create: { at: now, kind: "started", detail: `Started by ${event.type}` } },
        },
      });
      started.push(run.id);
    } catch (e) {
      // Already in this workflow: the partial unique index keeps one active run per recipient.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return { duplicate: false, started, stopped };
}

// Claims due runs with a lease so two workers never process the same run, then drives each one
// until it waits, finishes, or fails. Returns how many runs it touched.
export async function tick(deps: Deps, now = new Date()): Promise<number> {
  const claimed = await deps.db.$queryRaw<{ id: string }[]>`
    UPDATE "Run" SET "leaseUntil" = ${new Date(now.getTime() + LEASE_MS)}
    WHERE id IN (
      SELECT id FROM "Run"
      WHERE status = 'active' AND "dueAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
      ORDER BY "dueAt" LIMIT 25 FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  for (const { id } of claimed) await drive(deps, id, now);
  return claimed.length;
}

type Outcome =
  | { cursor: string | null; dueAt: Date; entry?: { kind: string; detail: string } }
  | { retry: string }
  | { fail: string };

async function drive(deps: Deps, runId: string, now: Date) {
  for (;;) {
    const run = await deps.db.run.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== "active") return;
    if (run.cursor === null) {
      await finish(deps.db, run, now, {
        status: "completed",
        kind: "completed",
        detail: "Reached the end of the workflow",
      });
      return;
    }
    if (run.dueAt && run.dueAt > now) {
      await deps.db.run.update({ where: { id: run.id }, data: { leaseUntil: null } });
      return;
    }
    const action = actionAt(compile(parseWorkflow(run.definition)), run.cursor);
    const outcome = await perform(deps, run, run.cursor, action, now);
    if ("fail" in outcome) {
      await finish(deps.db, run, now, {
        status: "failed",
        kind: "failed",
        detail: outcome.fail,
        failure: outcome.fail,
      });
      return;
    }
    if ("retry" in outcome) {
      const attempts = run.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const detail = `Gave up after ${attempts} attempts: ${outcome.retry}`;
        await finish(deps.db, run, now, { status: "failed", kind: "failed", detail, failure: detail });
        return;
      }
      const dueAt = new Date(now.getTime() + 2 ** attempts * 60_000);
      await deps.db.run.update({
        where: { id: run.id },
        data: {
          attempts,
          dueAt,
          leaseUntil: null,
          entries: { create: { at: now, kind: "retry", stepId: run.cursor, detail: outcome.retry } },
        },
      });
      return;
    }
    await deps.db.run.update({
      where: { id: run.id },
      data: {
        cursor: outcome.cursor,
        dueAt: outcome.dueAt,
        attempts: 0,
        entries: outcome.entry ? { create: { at: now, stepId: run.cursor, ...outcome.entry } } : undefined,
      },
    });
  }
}

async function perform(deps: Deps, run: Run, stepId: string, action: Action, now: Date): Promise<Outcome> {
  switch (action.kind) {
    case "wait":
      return {
        cursor: action.next,
        dueAt: new Date(now.getTime() + action.ms),
        entry: { kind: "waiting", detail: `Waiting until ${new Date(now.getTime() + action.ms).toISOString()}` },
      };
    case "check": {
      let result: boolean;
      try {
        result = await deps.check({
          check: action.check,
          recipientId: run.recipientId,
          runId: run.id,
          data: run.data as MergeData,
        });
      } catch (e) {
        return { retry: `Check "${action.check}" failed: ${message(e)}` };
      }
      return {
        cursor: result ? action.yes : action.no,
        dueAt: now,
        entry: { kind: "checked", detail: `${action.check}: ${result ? "yes" : "no"}` },
      };
    }
    case "send":
      return send(deps, run, stepId, action, now);
  }
}

// At most once per step. The delivery row is written before calling Listmonk, so a crash
// between the call and the bookkeeping leaves a pending row, and the run stops for a human
// instead of risking a second email.
async function send(
  deps: Deps,
  run: Run,
  stepId: string,
  action: Extract<Action, { kind: "send" }>,
  now: Date,
): Promise<Outcome> {
  const existing = await deps.db.delivery.findUnique({ where: { runId_stepId: { runId: run.id, stepId } } });
  if (existing?.status === "accepted") return { cursor: action.next, dueAt: now };
  if (existing?.status === "pending")
    return { fail: "A previous send was interrupted. Check the inbox before retrying." };

  const template = await deps.db.template.findUnique({
    where: { slug: action.template },
    include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: "desc" }, take: 1 } },
  });
  const version = template?.versions[0];
  if (!version) return { fail: `Template "${action.template}" has no published version` };

  const rendered = await renderEmail(
    await deps.brand(),
    version.subject,
    contentSchema.parse(version.content),
    run.data as MergeData,
  );
  if (!rendered.ok) {
    const problems = [...rendered.missing.map((f) => `missing ${f}`), ...rendered.badLinks.map((l) => `bad link ${l}`)];
    return { fail: `Can't render "${action.template}": ${problems.join(", ")}` };
  }

  const delivery = existing
    ? await deps.db.delivery.update({
        where: { id: existing.id },
        data: { status: "pending", error: null, templateVersion: version.version, subject: rendered.subject },
      })
    : await deps.db.delivery.create({
        data: {
          runId: run.id,
          stepId,
          templateSlug: action.template,
          templateVersion: version.version,
          subject: rendered.subject,
          createdAt: now,
        },
      });
  try {
    await deps.deliver({ to: run.email, subject: rendered.subject, html: rendered.html });
  } catch (e) {
    await deps.db.delivery.update({ where: { id: delivery.id }, data: { status: "failed", error: message(e) } });
    return { retry: `Listmonk refused "${action.template}": ${message(e)}` };
  }
  await deps.db.delivery.update({ where: { id: delivery.id }, data: { status: "accepted" } });
  return {
    cursor: action.next,
    dueAt: now,
    entry: { kind: "sent", detail: `Sent "${template!.name}" v${version.version}: ${rendered.subject}` },
  };
}

async function finish(
  db: PrismaClient,
  run: Run,
  now: Date,
  end: { status: "completed" | "failed"; kind: string; detail: string; failure?: string },
) {
  await db.run.update({
    where: { id: run.id },
    data: {
      status: end.status,
      cursor: null,
      dueAt: null,
      leaseUntil: null,
      failure: end.failure,
      entries: { create: { at: now, kind: end.kind, detail: end.detail } },
    },
  });
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
