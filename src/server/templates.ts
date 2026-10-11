import { type Content, checkHtml, contentSchema } from "~/domain/email";
import { db } from "./db";
import { getBrand } from "./settings";

export async function saveDraft(draft: { slug: string; name: string; subject: string; content: Content }) {
  return db.$transaction(async (tx) => {
    const template = await tx.template.upsert({
      where: { slug: draft.slug },
      create: { slug: draft.slug, name: draft.name },
      update: { name: draft.name },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const version = (template.versions[0]?.version ?? 0) + 1;
    await tx.templateVersion.create({
      data: { templateId: template.id, version, subject: draft.subject, content: draft.content },
    });
    return { slug: template.slug, version, published: false };
  });
}

export async function publish(slug: string, version: number) {
  const template = await db.template.findUniqueOrThrow({ where: { slug } });
  const row = await db.templateVersion.findUniqueOrThrow({
    where: { templateId_version: { templateId: template.id, version } },
  });
  const content = contentSchema.parse(row.content);
  if (content.kind === "html" && checkHtml(content.html, await getBrand()).some((i) => i.level === "error")) {
    throw new Error("This HTML has brand-check errors and can't be published");
  }
  await db.templateVersion.update({
    where: { templateId_version: { templateId: template.id, version } },
    data: { publishedAt: new Date() },
  });
}
