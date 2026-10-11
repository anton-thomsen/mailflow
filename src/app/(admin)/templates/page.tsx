import { requireAdmin } from "~/server/auth";
import { TemplatesView } from "./view";

export default async function TemplatesPage() {
  await requireAdmin();
  return <TemplatesView />;
}
