import { requireAdmin } from "~/server/auth";
import { WorkflowsView } from "./view";

export default async function WorkflowsPage() {
  await requireAdmin();
  return <WorkflowsView />;
}
