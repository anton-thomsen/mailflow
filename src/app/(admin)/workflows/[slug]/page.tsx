import { requireAdmin } from "~/server/auth";
import { WorkflowsView } from "../view";

export default async function WorkflowPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  return <WorkflowsView slug={(await params).slug} />;
}
