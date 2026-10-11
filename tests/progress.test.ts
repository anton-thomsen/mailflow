import { describe, expect, it } from "vitest";
import { describePosition, type RunPosition } from "~/domain/progress";
import { exampleWorkflow } from "~/server/example";

const now = new Date("2026-10-11T12:00:00Z");
const later = new Date("2026-10-14T12:00:00Z");
const name = (slug: string) => `"${slug}"`;
const iso = (d: Date) => d.toISOString();
const run = (over: Partial<RunPosition>): RunPosition => ({
  status: "active",
  cursor: "first-notice",
  dueAt: now,
  attempts: 0,
  definition: exampleWorkflow,
  ...over,
});

describe("describePosition", () => {
  it("names the template a due send step is about to send", () => {
    expect(describePosition(run({}), name, iso, now)).toBe('About to send "payment-failed"');
  });

  it("reports a future due time as waiting, followed by the step after the wait", () => {
    expect(describePosition(run({ cursor: "paid-after-3d", dueAt: later }), name, iso, now)).toBe(
      "Waiting until 2026-10-14T12:00:00.000Z, then check payment-settled",
    );
  });

  it("reports a retry rather than a wait when attempts have failed", () => {
    expect(describePosition(run({ cursor: "reminder", dueAt: later, attempts: 2 }), name, iso, now)).toBe(
      'Retrying 2026-10-14T12:00:00.000Z to send "payment-reminder"',
    );
  });

  it("uses the last history entry for a stopped run", () => {
    expect(
      describePosition(run({ status: "stopped", cursor: null, lastEntry: "Stopped by payment_succeeded" }), name, iso),
    ).toBe("Stopped by payment_succeeded");
  });
});
