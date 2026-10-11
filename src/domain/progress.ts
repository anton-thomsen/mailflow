import { compile, type Duration, parseWorkflow } from "./workflow";

export function describeDuration(d: Duration) {
  const unit = d.amount === 1 ? d.unit.slice(0, -1) : d.unit;
  return `${d.amount} ${unit}`;
}

export interface RunPosition {
  status: "active" | "completed" | "stopped" | "failed";
  cursor: string | null;
  dueAt: Date | null;
  attempts: number;
  definition: unknown;
  lastEntry?: string;
}

// Plain-language answer to "where is this person in the workflow?". The engine moves the cursor past a
// wait and sets dueAt, so a future dueAt means "waiting", and the cursor is what happens after it.
export function describePosition(
  run: RunPosition,
  templateName: (slug: string) => string,
  formatDate: (d: Date) => string,
  now = new Date(),
): string {
  switch (run.status) {
    case "completed":
      return "Reached the end";
    case "stopped":
      return run.lastEntry ?? "Stopped";
    case "failed":
      return "Stopped for a person to look at";
  }
  if (run.cursor === null) return "Finishing";
  const step = compile(parseWorkflow(run.definition)).nodes.get(run.cursor)?.step;
  if (!step) return `At unknown step "${run.cursor}"`;
  const next =
    step.kind === "send"
      ? `send ${templateName(step.template)}`
      : step.kind === "check"
        ? `check ${step.check}`
        : `wait ${describeDuration(step.duration)}`;
  if (run.dueAt && run.dueAt > now) {
    const until = `${run.attempts > 0 ? "Retrying" : "Waiting until"} ${formatDate(run.dueAt)}`;
    return run.attempts > 0 ? `${until} to ${next}` : `${until}, then ${next}`;
  }
  return `About to ${next}`;
}
