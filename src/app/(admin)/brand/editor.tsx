"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { type Brand, brandSchema, FONTS, type FontKey, PRESETS } from "~/domain/brand";
import { Badge, Button, Card, cn, inputClass, Muted, SectionTitle } from "../../_components/ui";
import { type Preview, previewEmail, saveBrandAction } from "../actions";

const COLOR_LABELS: Record<keyof Brand["colors"], string> = {
  primary: "Primary (buttons, logo)",
  text: "Text",
  muted: "Muted text",
  background: "Page background",
  card: "Card",
};

export function BrandEditor({ saved, templates }: { saved: Brand; templates: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [templateSlug, setTemplateSlug] = useState(templates[0]?.slug ?? "");
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!templateSlug) return;
    let current = true;
    const timer = setTimeout(async () => {
      const result = await previewEmail(draft, templateSlug);
      if (current) setPreview(result);
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [draft, templateSlug]);

  function set<K extends keyof Brand>(key: K, value: Brand[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function exportJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "brand.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File) {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setNotice({ ok: false, message: `${file.name} isn't valid JSON.` });
      return;
    }
    const parsed = brandSchema.safeParse(raw);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "file"))];
      setNotice({ ok: false, message: `${file.name} isn't a brand profile. Check: ${fields.join(", ")}.` });
      return;
    }
    setDraft(parsed.data);
    setNotice({ ok: true, message: `Imported ${file.name}. Save to keep it.` });
  }

  function save() {
    startSaving(async () => {
      const result = await saveBrandAction(draft);
      setNotice(result);
      if (result?.ok) {
        setBaseline(draft);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Section title="Start from a preset">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setDraft({ ...p, logoText: draft.logoText, footer: draft.footer })}
                className={cn(
                  "rounded-lg border p-2.5 text-left hover:bg-stone-50",
                  draft.name === p.name ? "border-stone-800 ring-2 ring-stone-800/10" : "border-stone-200",
                )}
              >
                <span className="flex gap-1">
                  {(["primary", "text", "background"] as const).map((role) => (
                    <span
                      key={role}
                      className="size-5 rounded-full border border-black/10"
                      style={{ background: p.colors[role] }}
                    />
                  ))}
                </span>
                <span className="mt-2 block text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-stone-500">{FONTS[p.font].label}</span>
              </button>
            ))}
          </div>
          <Muted className="mt-3">
            To draft a profile from a website, run the{" "}
            <code className="rounded bg-stone-100 px-1">create-brand-profile</code> skill and import its JSON here.
          </Muted>
        </Section>

        <Section title="Logo">
          <input
            aria-label="Logo text"
            value={draft.logoText}
            onChange={(e) => set("logoText", e.target.value)}
            className={inputClass}
          />
          <Muted className="mt-1">A text wordmark, drawn in the primary colour.</Muted>
        </Section>

        <Section title="Colours">
          <div className="flex flex-col gap-2">
            {(Object.keys(COLOR_LABELS) as (keyof Brand["colors"])[]).map((k) => (
              <label key={k} className="flex items-center gap-3 text-sm">
                <input
                  type="color"
                  aria-label={COLOR_LABELS[k]}
                  value={draft.colors[k]}
                  onChange={(e) => set("colors", { ...draft.colors, [k]: e.target.value })}
                  className="h-8 w-9 cursor-pointer rounded border border-stone-300 bg-white p-0.5"
                />
                <span className="flex-1">{COLOR_LABELS[k]}</span>
                <span className="font-mono text-xs text-stone-500">{draft.colors[k]}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section title="Fonts">
          <select
            aria-label="Fonts"
            value={draft.font}
            onChange={(e) => set("font", e.target.value as FontKey)}
            className={inputClass}
          >
            {(Object.keys(FONTS) as FontKey[]).map((k) => (
              <option key={k} value={k}>
                {FONTS[k].label}
              </option>
            ))}
          </select>
          <Muted className="mt-1">
            {draft.font === "inter"
              ? "Loaded as a web font. Clients that block web fonts fall back to Arial."
              : "Installed on almost every device, so every client shows it."}
          </Muted>
        </Section>

        <Section title="Shape">
          <Muted className="mb-1.5">Buttons</Muted>
          <div className="flex gap-2">
            {(["rounded", "pill", "square"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => set("button", b)}
                className={cn(
                  "flex-1 border px-3 py-1.5 text-sm capitalize",
                  b === "rounded" && "rounded-lg",
                  b === "pill" && "rounded-full",
                  draft.button === b
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white hover:bg-stone-50",
                )}
              >
                {b}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <span className="text-xs text-stone-500">Card corners</span>
            <input
              type="range"
              min={0}
              max={24}
              value={draft.cardRadius}
              onChange={(e) => set("cardRadius", Number(e.target.value))}
              className="flex-1 accent-stone-800"
            />
            <span className="w-10 text-right font-mono text-xs">{draft.cardRadius}px</span>
          </label>
        </Section>

        <Section title="Footer">
          <textarea
            aria-label="Footer"
            rows={2}
            value={draft.footer}
            onChange={(e) => set("footer", e.target.value)}
            className={inputClass}
          />
          <Muted className="mt-1">
            When your app sends an <code>unsubscribe_url</code>, an unsubscribe link is added below it.
          </Muted>
        </Section>

        <Section title="Tone of voice">
          <textarea
            aria-label="Tone of voice"
            rows={3}
            value={draft.tone}
            onChange={(e) => set("tone", e.target.value)}
            className={inputClass}
          />
          <Muted className="mt-1">The AI skills read this when they write an email.</Muted>
        </Section>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <Card className="flex flex-col gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? <Badge tone="amber">Unsaved changes</Badge> : <Badge tone="green">Saved</Badge>}
            <div className="ml-auto flex gap-1.5">
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                Import JSON
              </Button>
              <Button variant="ghost" onClick={exportJson}>
                Export JSON
              </Button>
              <Button variant="outline" disabled={!dirty} onClick={() => setDraft(baseline)}>
                Discard
              </Button>
              <Button disabled={!dirty || saving} onClick={save}>
                {saving ? "Saving…" : "Save brand"}
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importJson(file);
              }}
            />
          </div>
          <Muted>
            {notice ? (
              <span className={notice.ok ? "text-emerald-700" : "text-red-700"}>{notice.message}</span>
            ) : (
              "Every template renders with this brand. Published emails pick up a saved change on their next send."
            )}
          </Muted>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Preview template"
              value={templateSlug}
              onChange={(e) => setTemplateSlug(e.target.value)}
              className={cn(inputClass, "max-w-sm")}
            >
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>
                  Preview: {t.name}
                </option>
              ))}
            </select>
            <div className="ml-auto flex rounded-lg border border-stone-200 p-0.5 text-xs">
              {(["desktop", "phone"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWidth(w)}
                  className={cn(
                    "rounded-md px-2.5 py-1 capitalize",
                    width === w ? "bg-stone-100 font-medium text-stone-900" : "text-stone-500",
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-center rounded-lg bg-stone-100 p-3">
            {templates.length === 0 ? (
              <Muted className="py-10">Add a block template to preview the brand.</Muted>
            ) : preview && !preview.ok ? (
              <p className="py-10 text-sm text-red-700">{preview.message}</p>
            ) : (
              <iframe
                title="Brand preview"
                sandbox=""
                srcDoc={preview?.ok ? preview.html : ""}
                className={cn(
                  "h-[620px] rounded-md border border-stone-200 bg-white transition-[width]",
                  width === "phone" ? "w-[375px]" : "w-full",
                )}
              />
            )}
          </div>
        </Card>

        <Card className="p-4 text-sm">
          <SectionTitle>Used by the AI skills</SectionTitle>
          <Muted className="mt-1">The skills fetch this profile, so AI-written emails match what you save here.</Muted>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs text-stone-700">
            <li>
              <code className="rounded bg-stone-100 px-1.5 py-0.5">write-email</code> writes blocks in your tone and
              uploads them as a draft
            </li>
            <li>
              <code className="rounded bg-stone-100 px-1.5 py-0.5">check-email</code> checks pasted HTML against the
              palette and fonts
            </li>
            <li>
              <code className="rounded bg-stone-100 px-1.5 py-0.5">create-brand-profile</code> drafts a profile from a
              website
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-2.5">
        <SectionTitle>{title}</SectionTitle>
      </div>
      {children}
    </Card>
  );
}
