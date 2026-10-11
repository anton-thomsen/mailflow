import { type Content, contentSchema, type MergeData, renderEmail } from "~/domain/email";
import { db } from "./db";
import { getBrand } from "./settings";

const FALLBACK_SAMPLE: MergeData = { first_name: "Alex", payment_link: "https://example.com/pay" };

// Previews use the merge data of the most recent real event, so they look like what recipients get.
export async function sampleData(): Promise<MergeData> {
  const events = await db.event.findMany({ orderBy: { receivedAt: "desc" }, take: 50, select: { payload: true } });
  for (const { payload } of events) {
    const data = (payload as { data?: unknown } | null)?.data;
    if (data && typeof data === "object" && Object.keys(data).length > 0) return data as MergeData;
  }
  return FALLBACK_SAMPLE;
}

export async function renderPreview(subject: string, content: Content, brand?: Awaited<ReturnType<typeof getBrand>>) {
  return renderEmail(brand ?? (await getBrand()), subject, content, await sampleData());
}

export async function templateNames(): Promise<Map<string, string>> {
  const rows = await db.template.findMany({ select: { slug: true, name: true } });
  return new Map(rows.map((r) => [r.slug, r.name]));
}

const DAY = 86_400_000;

export async function listWorkflows(now = new Date()) {
  const [workflows, active, finished] = await Promise.all([
    db.workflow.findMany({ orderBy: { createdAt: "asc" } }),
    db.run.groupBy({ by: ["workflowId"], where: { status: "active" }, _count: true }),
    db.run.groupBy({
      by: ["workflowId"],
      where: { status: { in: ["completed", "stopped"] }, updatedAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      _count: true,
    }),
  ]);
  const count = (rows: { workflowId: string; _count: number }[], id: string) =>
    rows.find((r) => r.workflowId === id)?._count ?? 0;
  return workflows.map((w) => ({
    ...w,
    activeRuns: count(active, w.id),
    finished30d: count(finished, w.id),
  }));
}

export async function listTemplates() {
  const templates = await db.template.findMany({
    orderBy: { createdAt: "asc" },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  return templates.map((t) => {
    const latest = t.versions[0];
    return {
      slug: t.slug,
      name: t.name,
      kind: latest ? contentSchema.parse(latest.content).kind : null,
      latestVersion: latest?.version ?? 0,
      published: t.versions.some((v) => v.publishedAt),
      latestIsDraft: latest ? latest.publishedAt === null : false,
    };
  });
}

export async function getTemplate(slug: string) {
  return db.template.findUnique({ where: { slug }, include: { versions: { orderBy: { version: "desc" } } } });
}

export async function listRuns() {
  return db.run.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      workflow: { select: { slug: true } },
      entries: { orderBy: { at: "desc" }, take: 1, select: { detail: true } },
    },
  });
}

export async function getRun(id: string) {
  return db.run.findUnique({
    where: { id },
    include: {
      workflow: { select: { slug: true } },
      entries: { orderBy: { at: "asc" } },
      deliveries: { orderBy: { createdAt: "asc" } },
    },
  });
}
