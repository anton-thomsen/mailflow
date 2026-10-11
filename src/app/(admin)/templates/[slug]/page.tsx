import { requireAdmin } from "~/server/auth";
import { TemplatesView } from "../view";

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  await requireAdmin();
  const { v } = await searchParams;
  return <TemplatesView slug={(await params).slug} version={v ? Number(v) : undefined} />;
}
