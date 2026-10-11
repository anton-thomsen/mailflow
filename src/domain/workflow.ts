import { z } from "zod";

const durationSchema = z.object({
  amount: z.number().int().positive(),
  unit: z.enum(["minutes", "hours", "days"]),
});

export type Duration = z.infer<typeof durationSchema>;

export type Step =
  | { id: string; kind: "send"; template: string }
  | { id: string; kind: "wait"; duration: Duration }
  | { id: string; kind: "check"; check: string; yes: Step[]; no: Step[] };

const stepSchema: z.ZodType<Step> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ id: z.string().min(1), kind: z.literal("send"), template: z.string().min(1) }),
    z.object({ id: z.string().min(1), kind: z.literal("wait"), duration: durationSchema }),
    z.object({
      id: z.string().min(1),
      kind: z.literal("check"),
      check: z.string().min(1),
      yes: z.array(stepSchema),
      no: z.array(stepSchema),
    }),
  ]),
);

export const workflowSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  trigger: z.string().min(1),
  stopOn: z.array(z.string().min(1)),
  steps: z.array(stepSchema).min(1),
});

export type WorkflowDefinition = z.infer<typeof workflowSchema>;

// A run's position is a step id. Branches never rejoin, so `next` is the following sibling
// in the same list, and the end of any list ends the run.
export interface Program {
  first: string;
  nodes: Map<string, { step: Step; next: string | null }>;
}

export function compile(definition: WorkflowDefinition): Program {
  const nodes: Program["nodes"] = new Map();
  const walk = (steps: Step[]) => {
    steps.forEach((step, i) => {
      if (nodes.has(step.id)) throw new Error(`Duplicate step id "${step.id}"`);
      nodes.set(step.id, { step, next: steps[i + 1]?.id ?? null });
      if (step.kind === "check") {
        walk(step.yes);
        walk(step.no);
      }
    });
  };
  walk(definition.steps);
  return { first: definition.steps[0]!.id, nodes };
}

export function parseWorkflow(raw: unknown): WorkflowDefinition {
  const definition = workflowSchema.parse(raw);
  compile(definition);
  return definition;
}

export type Action =
  | { kind: "send"; template: string; next: string | null }
  | { kind: "wait"; ms: number; next: string | null }
  | { kind: "check"; check: string; yes: string | null; no: string | null };

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;

export function durationMs(d: Duration) {
  return d.amount * UNIT_MS[d.unit];
}

export function actionAt(program: Program, cursor: string): Action {
  const node = program.nodes.get(cursor);
  if (!node) throw new Error(`Unknown step "${cursor}"`);
  const { step, next } = node;
  switch (step.kind) {
    case "send":
      return { kind: "send", template: step.template, next };
    case "wait":
      return { kind: "wait", ms: durationMs(step.duration), next };
    case "check":
      return { kind: "check", check: step.check, yes: step.yes[0]?.id ?? null, no: step.no[0]?.id ?? null };
  }
}

export function templatesUsed(definition: WorkflowDefinition): string[] {
  const out = new Set<string>();
  const walk = (steps: Step[]) => {
    for (const s of steps) {
      if (s.kind === "send") out.add(s.template);
      if (s.kind === "check") {
        walk(s.yes);
        walk(s.no);
      }
    }
  };
  walk(definition.steps);
  return [...out];
}
