"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { brandSchema } from "~/domain/brand";
import { contentSchema } from "~/domain/email";
import { renderPreview } from "~/server/admin";
import { requireAdmin } from "~/server/auth";
import { db } from "~/server/db";
import { deliver } from "~/server/listmonk";
import { saveBrand } from "~/server/settings";
import { publish, saveDraft } from "~/server/templates";

export type ActionResult = { ok: boolean; message: string } | null;

const statusSchema = z.enum(["draft", "live", "paused"]);

export async function setWorkflowStatus(slug: string, status: string) {
  await requireAdmin();
  await db.workflow.update({ where: { slug }, data: { status: statusSchema.parse(status) } });
  revalidatePath("/workflows", "layout");
}

const versionRef = z.object({ slug: z.string().min(1), version: z.coerce.number().int().positive() });

export async function publishVersion(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const { slug, version } = versionRef.parse(Object.fromEntries(form));
  try {
    await publish(slug, version);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/templates", "layout");
  return { ok: true, message: `Version ${version} is published. Workflows send it from now on.` };
}

export async function sendTest(_: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { slug, version } = versionRef.parse(Object.fromEntries(form));
  const row = await db.templateVersion.findFirst({ where: { version, template: { slug } } });
  if (!row) return { ok: false, message: "That version no longer exists." };
  const rendered = await renderPreview(row.subject, contentSchema.parse(row.content));
  if (!rendered.ok) return { ok: false, message: "This version can't be rendered with the sample data." };
  try {
    await deliver({ to: admin.email, subject: `[Test] ${rendered.subject}`, html: rendered.html });
  } catch (e) {
    return { ok: false, message: `Not sent. ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, message: `Sent to ${admin.email}.` };
}

const htmlDraftSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, digits and dashes only"),
  subject: z.string().trim().min(1, "Write a subject").max(200),
  html: z.string().trim().min(1, "Paste some HTML"),
});

export async function createHtmlDraft(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = htmlDraftSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(". ") };
  const { name, slug, subject, html } = parsed.data;
  const draft = await saveDraft({ slug, name, subject, content: { kind: "html", html } });
  revalidatePath("/templates", "layout");
  redirect(`/templates/${draft.slug}?v=${draft.version}`);
}

export type Preview = { ok: true; html: string } | { ok: false; message: string };

export async function previewEmail(brand: unknown, templateSlug: string): Promise<Preview> {
  await requireAdmin();
  const parsed = brandSchema.safeParse(brand);
  if (!parsed.success) return { ok: false, message: "The brand has invalid values." };
  const latest = await db.templateVersion.findFirst({
    where: { template: { slug: templateSlug } },
    orderBy: { version: "desc" },
  });
  if (!latest) return { ok: false, message: "No such template." };
  const rendered = await renderPreview(latest.subject, contentSchema.parse(latest.content), parsed.data);
  if (!rendered.ok) {
    return { ok: false, message: `Can't render: ${[...rendered.missing, ...rendered.badLinks].join(", ")}` };
  }
  return { ok: true, html: rendered.html };
}

export async function saveBrandAction(brand: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = brandSchema.safeParse(brand);
  if (!parsed.success) return { ok: false, message: "The brand has invalid values and was not saved." };
  await saveBrand(parsed.data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
