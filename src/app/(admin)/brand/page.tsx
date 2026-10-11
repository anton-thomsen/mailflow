import { listTemplates } from "~/server/admin";
import { requireAdmin } from "~/server/auth";
import { getBrand } from "~/server/settings";
import { BrandEditor } from "./editor";

export default async function BrandPage() {
  await requireAdmin();
  const [brand, templates] = await Promise.all([getBrand(), listTemplates()]);
  return (
    <BrandEditor
      saved={brand}
      templates={templates.filter((t) => t.kind === "blocks").map(({ slug, name }) => ({ slug, name }))}
    />
  );
}
