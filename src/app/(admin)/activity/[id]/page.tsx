import Link from "next/link";
import { notFound } from "next/navigation";
import { describePosition } from "~/domain/progress";
import { parseWorkflow } from "~/domain/workflow";
import { getRun, templateNames } from "~/server/admin";
import { requireAdmin } from "~/server/auth";
import { Badge, Card, formatDate, Muted, SectionTitle, type Tone } from "../../../_components/ui";
import { RunStatusBadge } from "../status";

const DELIVERY_TONE: Record<string, Tone> = { accepted: "green", pending: "amber", failed: "red" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const [run, names] = await Promise.all([getRun((await params).id), templateNames()]);
  if (!run) notFound();
  const definition = parseWorkflow(run.definition);
  const position = describePosition(
    { ...run, lastEntry: run.entries.at(-1)?.detail },
    (slug) => names.get(slug) ?? slug,
    formatDate,
  );

  return (
    <div className="flex flex-col gap-5">
      <Link href="/activity" className="text-sm text-stone-500 hover:text-stone-800">
        ← Activity
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{run.email}</h1>
        <RunStatusBadge status={run.status} />
        <span className="text-sm text-stone-500">
          in{" "}
          <Link href={`/workflows/${run.workflow.slug}`} className="text-stone-700 underline-offset-2 hover:underline">
            {definition.name}
          </Link>{" "}
          · started {formatDate(run.createdAt)} · recipient id <span className="font-mono">{run.recipientId}</span>
        </span>
      </div>
      <p className="text-sm text-stone-700">{position}</p>

      {run.status === "failed" && run.failure ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200 ring-inset">
          <p className="font-medium">Needs attention</p>
          <p className="mt-1">{run.failure}</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle>History</SectionTitle>
          <ol className="mt-3 flex flex-col">
            {run.entries.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[120px_80px_minmax(0,1fr)] gap-3 border-t border-stone-100 py-2 text-sm first:border-t-0"
              >
                <span className="whitespace-nowrap text-stone-500 tabular-nums">{formatDate(e.at)}</span>
                <span className="font-medium text-stone-700">{e.kind}</span>
                <span className="text-stone-700">{readableDetail(e.detail)}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <SectionTitle>Emails</SectionTitle>
          {run.deliveries.length === 0 ? (
            <Muted className="mt-3">Nothing sent yet.</Muted>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="pb-2 font-medium">Step</th>
                  <th className="pb-2 font-medium">Template</th>
                  <th className="pb-2 font-medium">Subject</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {run.deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-stone-100 align-top">
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap text-stone-500">{d.stepId}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/templates/${d.templateSlug}?v=${d.templateVersion}`} className="hover:underline">
                        {names.get(d.templateSlug) ?? d.templateSlug}
                      </Link>{" "}
                      <span className="text-xs text-stone-500">v{d.templateVersion}</span>
                    </td>
                    <td className="py-2 pr-3 text-stone-700">{d.subject}</td>
                    <td className="py-2">
                      <Badge tone={DELIVERY_TONE[d.status] ?? "neutral"}>
                        {d.status === "accepted" ? "Sent" : d.status}
                      </Badge>
                      {d.error ? <p className="mt-1 text-xs text-red-700">{d.error}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Muted className="mt-3">Sent means Listmonk accepted the email. Listmonk gives no delivery receipt.</Muted>
        </Card>
      </div>
    </div>
  );
}

// The engine writes machine timestamps into history details; show them like every other date here.
function readableDetail(detail: string) {
  return detail.replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g, (iso) => formatDate(new Date(iso)));
}
