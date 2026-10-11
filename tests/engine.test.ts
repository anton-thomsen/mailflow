import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "~/domain/brand";
import { DeliveryRefused, type Deps, type HostEvent, ingestEvent, tick } from "~/server/engine";
import { installExample } from "~/server/install";

const db = new PrismaClient();
const DAY = 86_400_000;
const t0 = new Date("2026-10-12T09:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY);

let sent: { to: string; subject: string; html: string }[];
let paidFrom: Date | null;
let checkFails: boolean;
let deliverFails: number;
let deliverDelayMs: number;
let deliverTimesOut: boolean;

function deps(now: () => Date = () => t0): Deps {
  return {
    db,
    brand: async () => DEFAULT_BRAND,
    deliver: async (email) => {
      if (deliverFails > 0) {
        deliverFails--;
        throw new DeliveryRefused("listmonk 500");
      }
      if (deliverTimesOut) {
        sent.push(email);
        throw new Error("The operation was aborted due to timeout");
      }
      if (deliverDelayMs) await new Promise((r) => setTimeout(r, deliverDelayMs));
      sent.push(email);
    },
    check: async ({ check }) => {
      if (checkFails) throw new Error("host unreachable");
      expect(check).toBe("payment-settled");
      return paidFrom !== null && now() >= paidFrom;
    },
  };
}

function failed(
  id = "evt_1",
  data: Record<string, string> = { first_name: "Alex", payment_link: "https://pay.example/inv_1" },
): HostEvent {
  return { id, type: "payment_failed", recipient: { id: "cus_1", email: "alex@example.com" }, data };
}

const succeeded: HostEvent = {
  id: "evt_paid",
  type: "payment_succeeded",
  recipient: { id: "cus_1", email: "alex@example.com" },
  data: {},
};

async function runDays(days: number[]) {
  for (const d of days)
    await tick(
      deps(() => at(d)),
      at(d),
    );
}

async function theRun() {
  return db.run.findFirstOrThrow({ include: { entries: { orderBy: { at: "asc" } } } });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Event", "Delivery", "RunEntry", "Run", "Workflow", "TemplateVersion", "Template" CASCADE',
  );
  await installExample(db, "live", t0);
  sent = [];
  paidFrom = null;
  checkFails = false;
  deliverFails = 0;
  deliverDelayMs = 0;
  deliverTimesOut = false;
});

afterAll(() => db.$disconnect());

describe("failed-payment workflow", () => {
  it("sends all three emails to someone who never pays, then completes", async () => {
    await ingestEvent({ db }, failed(), t0);
    await runDays([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    expect(sent.map((e) => e.subject)).toEqual([
      "We couldn't take your payment",
      "A quick reminder about your payment",
      "Your payment is still outstanding",
    ]);
    expect(sent[0]!.html).toContain("Hi Alex,");
    expect(sent[0]!.html).toContain('href="https://pay.example/inv_1"');
    expect((await theRun()).status).toBe("completed");
  });

  it("stops after the first email when payment succeeds on day 2", async () => {
    await ingestEvent({ db }, failed(), t0);
    await runDays([0, 1]);
    await ingestEvent({ db }, succeeded, at(2));
    await runDays([2, 3, 7, 8]);

    expect(sent).toHaveLength(1);
    const run = await theRun();
    expect(run.status).toBe("stopped");
    expect(run.entries.at(-1)!.detail).toBe("Stopped by payment_succeeded");
  });

  it("asks the host before each reminder, so a payment on day 5 without an event still ends the run", async () => {
    paidFrom = at(5);
    await ingestEvent({ db }, failed(), t0);
    await runDays([0, 3, 5, 7, 8]);

    expect(sent.map((e) => e.subject)).toEqual([
      "We couldn't take your payment",
      "A quick reminder about your payment",
    ]);
    const run = await theRun();
    expect(run.status).toBe("completed");
    expect(run.entries.map((e) => e.detail)).toContain("payment-settled: yes");
  });

  it("sends nothing when the payment succeeded before the failure event arrived", async () => {
    paidFrom = t0;
    await ingestEvent({ db }, succeeded, t0);
    await ingestEvent({ db }, failed(), t0);
    await runDays([0, 3, 7]);
    expect(sent).toHaveLength(0);
    expect((await theRun()).entries.map((e) => e.detail)).toContain("payment-settled: yes");
  });

  it("records one event and one run when the same event arrives twice at once", async () => {
    const results = await Promise.all([ingestEvent({ db }, failed(), t0), ingestEvent({ db }, failed(), t0)]);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(await db.event.count()).toBe(1);
    expect(await db.run.count()).toBe(1);
  });

  it("ignores a repeated event and a second failure while a run is active", async () => {
    expect(await ingestEvent({ db }, failed(), t0)).toMatchObject({ duplicate: false });
    expect(await ingestEvent({ db }, failed(), t0)).toEqual({ duplicate: true });
    expect(await ingestEvent({ db }, failed("evt_2"), at(1))).toEqual({ duplicate: false, started: [], stopped: [] });
    expect(await db.run.count()).toBe(1);
  });

  it("starts nothing while the workflow is not live", async () => {
    await db.workflow.updateMany({ data: { status: "paused" } });
    await ingestEvent({ db }, failed(), t0);
    expect(await db.run.count()).toBe(0);
  });

  it("sends once when several workers tick while a send is in flight", async () => {
    deliverDelayMs = 200;
    await ingestEvent({ db }, failed(), t0);
    await Promise.all([tick(deps(), t0), tick(deps(), t0), tick(deps(), t0)]);
    expect(sent).toHaveLength(1);
    expect((await db.run.findFirstOrThrow()).status).toBe("active");
  });
});

describe("failures", () => {
  it("retries a refused send and then sends exactly once", async () => {
    deliverFails = 1;
    await ingestEvent({ db }, failed(), t0);
    await tick(deps(), t0);
    expect(sent).toHaveLength(0);
    const later = new Date(t0.getTime() + 2 * 60_000);
    await tick(
      deps(() => later),
      later,
    );
    expect(sent).toHaveLength(1);
    expect(await db.delivery.findMany()).toMatchObject([{ status: "accepted", stepId: "first-notice" }]);
  });

  it("never resends when Listmonk times out, because the email may have gone out", async () => {
    deliverTimesOut = true;
    await ingestEvent({ db }, failed(), t0);
    await runDays([0, 1, 3]);
    expect(sent).toHaveLength(1);
    expect(await db.delivery.findFirstOrThrow()).toMatchObject({ status: "pending" });
    expect((await db.run.findFirstOrThrow()).failure).toContain("may have gone out");
  });

  it("never resends after an interrupted send and flags the run for a human", async () => {
    await ingestEvent({ db }, failed(), t0);
    const run = await db.run.findFirstOrThrow();
    await db.delivery.create({
      data: { runId: run.id, stepId: "first-notice", templateSlug: "payment-failed", templateVersion: 1, subject: "x" },
    });
    await tick(deps(), t0);

    expect(sent).toHaveLength(0);
    expect(await db.run.findFirstOrThrow()).toMatchObject({
      status: "failed",
      failure: expect.stringContaining("interrupted"),
    });
  });

  it("never emails without an answer from the host, and gives up after five attempts", async () => {
    checkFails = true;
    await ingestEvent({ db }, failed(), t0);
    let now = t0;
    for (let i = 0; i < 12; i++) {
      await tick(
        deps(() => now),
        now,
      );
      now = new Date(now.getTime() + DAY);
    }
    expect(sent).toHaveLength(0);
    const run = await db.run.findFirstOrThrow();
    expect(run.status).toBe("failed");
    expect(run.failure).toContain("Gave up after 5 attempts");
  });

  it("fails instead of sending when a required field is missing", async () => {
    await ingestEvent({ db }, failed("evt_1", { first_name: "Alex" }), t0);
    await tick(deps(), t0);
    expect(sent).toHaveLength(0);
    expect((await db.run.findFirstOrThrow()).failure).toBe('Can\'t render "payment-failed": missing payment_link');
  });

  it("fails when the template has no published version", async () => {
    await db.templateVersion.updateMany({ data: { publishedAt: null } });
    await ingestEvent({ db }, failed(), t0);
    await tick(deps(), t0);
    expect((await db.run.findFirstOrThrow()).failure).toBe('Template "payment-failed" has no published version');
  });
});
