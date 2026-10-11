import type { WorkflowStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { describeDuration } from "~/domain/progress";
import { parseWorkflow, type Step } from "~/domain/workflow";
import { listWorkflows, templateNames } from "~/server/admin";
import { Badge, Card, cn, Muted, type Tone } from "../../_components/ui";
import { setWorkflowStatus } from "../actions";

export const STATUS_TONE: Record<WorkflowStatus, Tone> = { live: "green", paused: "amber", draft: "neutral" };

export async function WorkflowsView({ slug }: { slug?: string }) {
  const [workflows, names] = await Promise.all([listWorkflows(), templateNames()]);
  if (workflows.length === 0) {
    return <Muted className="text-sm">No workflows yet. Create one through the API.</Muted>;
  }
  const selected = slug ? workflows.find((w) => w.slug === slug) : workflows[0];
  if (!selected) notFound();
  const definition = parseWorkflow(selected.definition);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav className="flex flex-col gap-2">
        {workflows.map((w) => (
          <Link
            key={w.id}
            href={`/workflows/${w.slug}`}
            className={cn(
              "rounded-xl border bg-white px-4 py-3 hover:border-stone-300",
              w.id === selected.id ? "border-stone-400 shadow-sm" : "border-stone-200",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{parseWorkflow(w.definition).name}</span>
              <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
            </span>
            <span className="mt-1 block text-xs text-stone-500">
              {w.activeRuns} in progress · {w.finished30d} finished in 30 days
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">{definition.name}</h1>
          <span className="font-mono text-xs text-stone-500">{selected.slug}</span>
          <div className="ml-auto flex rounded-lg border border-stone-200 bg-white p-0.5">
            {(["live", "paused", "draft"] as const).map((status) => (
              <form key={status} action={setWorkflowStatus.bind(null, selected.slug, status)}>
                <button
                  type="submit"
                  disabled={selected.status === status}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm capitalize",
                    selected.status === status
                      ? "bg-stone-900 font-medium text-white"
                      : "text-stone-600 hover:bg-stone-100",
                  )}
                >
                  {status === "live" ? "Live" : status === "paused" ? "Paused" : "Draft"}
                </button>
              </form>
            ))}
          </div>
        </div>
        <Muted>
          {selected.status === "live"
            ? `Live: every ${definition.trigger} event starts a run.`
            : selected.status === "paused"
              ? "Paused: no new runs start. Runs already in progress carry on."
              : "Draft: no runs start until you set it live."}
        </Muted>

        <Card
          className="relative overflow-auto bg-stone-50 p-8"
          style={{
            backgroundImage: "radial-gradient(circle, #d6d3d1 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <div className="flex min-w-fit flex-col items-center pb-2">
            <Node kind="trigger" label={`When ${definition.trigger}`} />
            <Flow steps={definition.steps} names={names} />
          </div>
          {definition.stopOn.length > 0 ? (
            <div className="absolute top-4 right-4 w-56 rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-sm">
              <p className="font-semibold text-stone-800">Stops as soon as:</p>
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-stone-600">
                {definition.stopOn.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
        <Muted>Steps are edited through the API for now.</Muted>
      </div>
    </div>
  );
}

const NODE = {
  trigger: { tag: "Trigger", className: "border-(--accent) bg-(--accent) text-white" },
  send: { tag: "Email", className: "border-stone-300 bg-white" },
  wait: { tag: "Wait", className: "border-dashed border-stone-300 bg-stone-100" },
  check: { tag: "Ask your app", className: "border-amber-300 bg-amber-50" },
} as const;

function Node({ kind, label, detail }: { kind: keyof typeof NODE; label: string; detail?: string }) {
  return (
    <div className={cn("w-60 rounded-xl border-2 px-3 py-2 text-center text-sm shadow-sm", NODE[kind].className)}>
      <p className="text-[10px] font-semibold tracking-wider uppercase opacity-60">{NODE[kind].tag}</p>
      <p className="font-medium">{label}</p>
      {detail ? <p className="font-mono text-[11px] opacity-60">{detail}</p> : null}
    </div>
  );
}

function Edge({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-5 w-px bg-stone-300" />
      {label ? (
        <span className="rounded bg-white px-1.5 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200">
          {label}
        </span>
      ) : null}
      <div className="h-3 w-px bg-stone-300" />
      <div className="h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-stone-300" />
    </div>
  );
}

function End({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center">
      <Edge label={label} />
      <span className="rounded-full border border-stone-300 bg-white px-3 py-0.5 text-xs font-medium text-stone-500">
        End
      </span>
    </div>
  );
}

// The bar runs from this branch's centre to the shared edge, so the two halves join under the check node.
function Branch({ side, children }: { side: "left" | "right"; children: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center px-6">
      <div
        className={cn("absolute top-0 h-px bg-stone-300", side === "left" ? "right-0 left-1/2" : "right-1/2 left-0")}
      />
      {children}
    </div>
  );
}

function Flow({ steps, names, firstLabel }: { steps: Step[]; names: Map<string, string>; firstLabel?: string }) {
  if (steps.length === 0) return <End label={firstLabel} />;
  const last = steps[steps.length - 1]!;
  return (
    <div className="flex flex-col items-center">
      {steps.map((s, i) => (
        <div key={s.id} className="flex flex-col items-center">
          <Edge label={i === 0 ? firstLabel : undefined} />
          {s.kind === "send" ? (
            <Node kind="send" label={names.get(s.template) ?? "Missing template"} detail={s.template} />
          ) : s.kind === "wait" ? (
            <Node kind="wait" label={`Wait ${describeDuration(s.duration)}`} />
          ) : (
            <>
              <Node kind="check" label={s.check} />
              <div className="h-4 w-px bg-stone-300" />
              <div className="flex items-start">
                <Branch side="left">
                  <Flow steps={s.yes} names={names} firstLabel="Yes" />
                </Branch>
                <Branch side="right">
                  <Flow steps={s.no} names={names} firstLabel="No" />
                </Branch>
              </div>
            </>
          )}
        </div>
      ))}
      {last.kind === "check" ? null : <End />}
    </div>
  );
}
