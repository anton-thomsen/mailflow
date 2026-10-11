import Link from "next/link";
import { describePosition } from "~/domain/progress";
import { parseWorkflow } from "~/domain/workflow";
import { listRuns, templateNames } from "~/server/admin";
import { requireAdmin } from "~/server/auth";
import { Card, formatDate, Muted } from "../../_components/ui";
import { RunStatusBadge } from "./status";

export default async function ActivityPage() {
  await requireAdmin();
  const [runs, names] = await Promise.all([listRuns(), templateNames()]);
  const templateName = (slug: string) => names.get(slug) ?? slug;
  if (runs.length === 0)
    return <Muted className="text-sm">No runs yet. They appear here when your app sends events.</Muted>;
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs text-stone-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Recipient</th>
            <th className="px-4 py-2.5 font-medium">Workflow</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Where they are</th>
            <th className="px-4 py-2.5 font-medium">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {runs.map((run) => (
            <tr key={run.id} className="relative hover:bg-stone-50">
              <td className="px-4 py-3 font-medium">
                <Link href={`/activity/${run.id}`} className="after:absolute after:inset-0">
                  {run.email}
                </Link>
              </td>
              <td className="px-4 py-3 text-stone-600">{parseWorkflow(run.definition).name}</td>
              <td className="px-4 py-3">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3 text-stone-700">
                {describePosition({ ...run, lastEntry: run.entries[0]?.detail }, templateName, formatDate)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-stone-500 tabular-nums">{formatDate(run.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
