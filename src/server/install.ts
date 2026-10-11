import type { PrismaClient, WorkflowStatus } from "@prisma/client";
import { exampleTemplates, exampleWorkflow } from "./example";

// Safe to run on every boot: it only creates what is missing and never overwrites edits.
export async function installExample(db: PrismaClient, status: WorkflowStatus = "draft", now = new Date()) {
  await db.workflow.upsert({
    where: { slug: exampleWorkflow.slug },
    create: { slug: exampleWorkflow.slug, status, definition: exampleWorkflow },
    update: {},
  });
  for (const t of exampleTemplates) {
    await db.template.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        name: t.name,
        versions: { create: { version: 1, subject: t.subject, content: t.content, publishedAt: now } },
      },
      update: {},
    });
  }
}
