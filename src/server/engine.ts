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

// Thrown by `deliver` when Listmonk definitely did not accept the email, so sending again is safe.
// Any other error (a timeout, a dropped connection) leaves it unknown whether the email went out.
export class DeliveryRefused extends Error {
  override name = "DeliveryRefused";
}

const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;

export type IngestResult = { duplicate: true } | { duplicate: false; started: string[]; stopped: string[] };

// One transaction, so a crash can never record an event without also acting on it. Two concurrent
// deliveries of the same event collide on a unique index; the retry then sees the first one's result.
export async function ingestEvent({ db }: Pick<Deps, "db">, event: HostEvent, now = new Date()): Promise<IngestResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction((tx) => applyEvent(tx, event, now));
    } catch (e) {
      if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

async function applyEvent(tx: Prisma.TransactionClient, event: HostEvent, now: Date): Promise<IngestResult> {
  if (await tx.event.findUnique({ where: { id: event.id }, select: { id: true } })) return { duplicate: true };
  await tx.event.create({
    data: { id: event.id, type: event.type, recipientId: event.recipient.id, payload: event, receivedAt: now },
  });

  const stopped: string[] = [];
  const active = await tx.run.findMany({ where: { recipientId: event.recipient.id, status: "active" } });
  for (const run of active) {
    if (!parseWorkflow(run.definition).stopOn.includes(event.type)) continue;
    await tx.run.update({
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
  const live = await tx.workflow.findMany({ where: { status: "live" } });
  for (const workflow of live) {
    const definition = parseWorkflow(workflow.definition);
    if (definition.trigger !== event.type) continue;
    const already = await tx.run.findFirst({
      where: { workflowId: workflow.id, recipientId: event.recipient.id, status: "active" },
      select: { id: true },
    });
    if (already) continue;
    const run = await tx.run.create({
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
  }
  return { duplicate: false, started, stopped };
}

// Claims one due run at a time with a fresh lease, so a slow run never lets the lease on a
// later one expire while it waits its turn. Returns how many runs it touched.
export async function tick(deps: Deps, now = new Date(), limit = 25): Promise<number> {
  let touched = 0;
  for (; touched < limit; touched++) {
    const [claimed] = await deps.db.$queryRaw<{ id: string }[]>`
      UPDATE "Run" SET "leaseUntil" = ${new Date(now.getTime() + LEASE_MS)}
      WHERE id = (
        SELECT id FROM "Run"
        WHERE status = 'active' AND "dueAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
        ORDER BY "dueAt" LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    if (!claimed) break;
    await drive(deps, claimed.id, now);
  }
  return touched;
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

  let deliveryId: string;
  if (existing) {
    // Only the worker that flips failed -> pending may send; a second worker finds nothing to flip.
    const taken = await deps.db.delivery.updateMany({
      where: { id: existing.id, status: "failed" },
      data: { status: "pending", error: null, templateVersion: version.version, subject: rendered.subject },
    });
    if (taken.count === 0) return { retry: "Another worker is sending this email" };
    deliveryId = existing.id;
  } else {
    deliveryId = (
      await deps.db.delivery.create({
        data: {
          runId: run.id,
          stepId,
          templateSlug: action.template,
          templateVersion: version.version,
          subject: rendered.subject,
          createdAt: now,
        },
      })
    ).id;
  }
  try {
    await deps.deliver({ to: run.email, subject: rendered.subject, html: rendered.html });
  } catch (e) {
    if (!(e instanceof DeliveryRefused)) {
      await deps.db.delivery.update({ where: { id: deliveryId }, data: { error: message(e) } });
      return {
        fail: `Listmonk did not answer for "${action.template}", so the email may have gone out. Check the inbox before retrying. (${message(e)})`,
      };
    }
    await deps.db.delivery.update({ where: { id: deliveryId }, data: { status: "failed", error: message(e) } });
    return { retry: `Listmonk refused "${action.template}": ${message(e)}` };
  }
  await deps.db.delivery.update({ where: { id: deliveryId }, data: { status: "accepted" } });
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
