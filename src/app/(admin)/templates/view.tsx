import Link from "next/link";
import { notFound } from "next/navigation";
import { type CheckIssue, checkHtml, contentSchema } from "~/domain/email";
import { getTemplate, listTemplates, renderPreview } from "~/server/admin";
import { getBrand } from "~/server/settings";
import { Badge, Card, cn, formatDate, Muted, SectionTitle } from "../../_components/ui";
import { createHtmlDraft, publishVersion, sendTest } from "../actions";
import { ActionButton, CopyPromptButton, PasteHtmlForm } from "./client";

const SOURCE = { blocks: "Blocks", html: "Pasted HTML" } as const;

export async function TemplatesView({ slug, version }: { slug?: string; version?: number }) {
  const templates = await listTemplates();
  const selectedSlug = slug ?? templates[0]?.slug;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Card className="p-4 text-sm">
          <SectionTitle>Write with AI</SectionTitle>
          <p className="mt-1 text-stone-600">
            The <code className="rounded bg-stone-100 px-1 text-xs">write-email</code> skill runs in your own AI tool.
            It reads your brand and merge fields from mailflow, writes the email as blocks, and uploads a draft. Blocks
            are always on-brand.
          </p>
          <CopyPromptButton />
        </Card>
        <Card className="border-dashed p-4 text-sm">
          <SectionTitle>Paste HTML</SectionTitle>
          <p className="mt-1 text-stone-600">
            Any HTML works. It's checked against your brand, and errors block publishing.
          </p>
          <PasteHtmlForm action={createHtmlDraft} />
        </Card>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-stone-100">
            {templates.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/templates/${t.slug}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-stone-50",
                    t.slug === selectedSlug && "bg-stone-100/70",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block truncate text-xs text-stone-500">
                      v{t.latestVersion} · {t.kind ? SOURCE[t.kind] : "empty"} · {t.slug}
                    </span>
                  </span>
                  {t.latestIsDraft && t.published ? <Badge tone="amber">Draft v{t.latestVersion}</Badge> : null}
                  <Badge tone={t.published ? "green" : "neutral"}>{t.published ? "Published" : "Draft"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {selectedSlug ? (
        <TemplateDetail slug={selectedSlug} version={version} />
      ) : (
        <Muted className="text-sm">No templates yet.</Muted>
      )}
    </div>
  );
}

async function TemplateDetail({ slug, version }: { slug: string; version?: number }) {
  const template = await getTemplate(slug);
  if (!template) notFound();
  const row = version ? template.versions.find((v) => v.version === version) : template.versions[0];
  if (!row) notFound();
  const content = contentSchema.parse(row.content);
  const brand = await getBrand();
  const rendered = await renderPreview(row.subject, content, brand);
  const issues = content.kind === "html" ? checkHtml(content.html, brand) : null;
  const fields = { slug, version: row.version };

  return (
    <Card className="flex min-w-0 flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{template.name}</h1>
          <p className="mt-0.5 text-sm text-stone-600">
            <span className="text-stone-400">Subject</span> {row.subject}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <ActionButton
            action={sendTest}
            fields={fields}
            label="Send test to me"
            pendingLabel="Sending…"
            variant="outline"
          />
          {row.publishedAt ? null : (
            <ActionButton
              action={publishVersion}
              fields={fields}
              label="Publish this version"
              pendingLabel="Publishing…"
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {template.versions.map((v) => (
          <Link
            key={v.version}
            href={`/templates/${slug}?v=${v.version}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
              v.version === row.version
                ? "border-stone-400 bg-stone-100 font-medium"
                : "border-stone-200 hover:bg-stone-50",
            )}
          >
            v{v.version}
            <span className={v.publishedAt ? "text-emerald-700" : "text-stone-500"}>
              {v.publishedAt ? `published ${formatDate(v.publishedAt)}` : "draft"}
            </span>
          </Link>
        ))}
      </div>

      {issues ? <BrandCheck issues={issues} /> : null}

      {rendered.ok ? (
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={rendered.html}
          className="h-[600px] w-full rounded-lg border border-stone-200 bg-white"
        />
      ) : (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">This version can't be rendered with the sample data.</p>
          {rendered.missing.length ? <p className="mt-1">Missing fields: {rendered.missing.join(", ")}</p> : null}
          {rendered.badLinks.length ? <p className="mt-1">Bad links: {rendered.badLinks.join(", ")}</p> : null}
        </div>
      )}
      <Muted>
        {content.kind === "blocks"
          ? `Rendered with the ${brand.name} brand and merge data from the latest event.`
          : "Pasted HTML is shown as-is with merge data from the latest event. The preview runs sandboxed, without scripts."}
      </Muted>
    </Card>
  );
}

function BrandCheck({ issues }: { issues: CheckIssue[] }) {
  if (issues.length === 0) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset">
        Brand check passed
      </p>
    );
  }
  const blocking = issues.some((i) => i.level === "error");
  return (
    <div
      className={cn(
        "rounded-lg px-4 py-3 text-sm ring-1 ring-inset",
        blocking ? "bg-red-50/60 ring-red-200" : "bg-amber-50 ring-amber-200",
      )}
    >
      <p className="font-medium">
        Brand check: {issues.length} {issues.length === 1 ? "issue" : "issues"}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {issues.map((i) => (
          <li key={i.text} className="flex items-start gap-2">
            <Badge tone={i.level === "error" ? "red" : "amber"}>
              {i.level === "error" ? "Blocks publish" : "Warning"}
            </Badge>
            <span className="text-stone-700">{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
