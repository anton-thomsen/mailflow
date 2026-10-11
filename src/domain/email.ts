import mjml2html from "mjml";
import { z } from "zod";
import { type Brand, FONTS } from "./brand";

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1) }),
  z.object({ type: z.literal("text"), text: z.string().min(1) }),
  z.object({ type: z.literal("button"), label: z.string().min(1), href: z.string().min(1) }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("small"), text: z.string().min(1) }),
]);

export type Block = z.infer<typeof blockSchema>;

export const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blocks"), blocks: z.array(blockSchema).min(1) }),
  z.object({ kind: z.literal("html"), html: z.string().min(1) }),
]);

export type Content = z.infer<typeof contentSchema>;

export type MergeData = Record<string, string>;

export type Rendered =
  | { ok: true; subject: string; html: string }
  | { ok: false; missing: string[]; badLinks: string[] };

const FIELD = /\{\{\s*([a-z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/gi;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// `{{ name }}` or `{{ name | fallback }}`. A field with no value and no fallback is reported, never sent blank.
function merge(text: string, data: MergeData, missing: Set<string>, encode: (s: string) => string) {
  return text.replace(FIELD, (_, key: string, fallback: string | undefined) => {
    const value = data[key];
    if (value !== undefined && value !== "") return encode(value);
    if (fallback !== undefined) return encode(fallback);
    missing.add(key);
    return "";
  });
}

export function fieldsUsed(content: Content, subject: string): string[] {
  const source = `${subject} ${content.kind === "html" ? content.html : JSON.stringify(content.blocks)}`;
  return [...new Set([...source.matchAll(FIELD)].map((m) => m[1]!))];
}

const BUTTON_RADIUS = { rounded: "8px", pill: "999px", square: "0px" } as const;

function blocksToMjml(brand: Brand, blocks: Block[], data: MergeData, missing: Set<string>, badLinks: string[]) {
  const c = brand.colors;
  const f = FONTS[brand.font];
  const text = (s: string) => merge(escapeHtml(s), data, missing, escapeHtml).replace(/\n/g, "<br/>");
  const body = blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<mj-text font-family="${f.heading}" font-size="22px" line-height="30px" padding-bottom="12px">${text(b.text)}</mj-text>`;
        case "text":
          return `<mj-text>${text(b.text)}</mj-text>`;
        case "button": {
          const href = merge(b.href, data, missing, (s) => s);
          if (href && !/^(https?:\/\/|mailto:)/.test(href)) badLinks.push(href);
          return `<mj-button href="${escapeHtml(href)}" background-color="${c.primary}" border-radius="${BUTTON_RADIUS[brand.button]}" font-weight="600" align="left">${text(b.label)}</mj-button>`;
        }
        case "divider":
          return `<mj-divider border-color="${c.muted}" border-width="1px" padding="8px 0 16px" />`;
        default:
          return `<mj-text font-size="13px" line-height="20px" color="${c.muted}">${text(b.text)}</mj-text>`;
      }
    })
    .join("\n");
  const unsubscribe = data.unsubscribe_url
    ? `<br/><a href="${escapeHtml(data.unsubscribe_url)}" style="color:${c.muted}">Unsubscribe</a>`
    : "";
  const logo = brand.logoUrl
    ? `<mj-image src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.logoText)}" width="140px" align="left" padding="0 4px 16px" />`
    : `<mj-text font-family="${f.heading}" font-size="18px" font-weight="600" color="${c.primary}" padding="0 4px 16px">${escapeHtml(brand.logoText)}</mj-text>`;
  const webfont = "webfont" in f ? `<mj-font name="Inter" href="${f.webfont}" />` : "";
  const cardBorder = c.card.toLowerCase() === c.background.toLowerCase() ? ' border="1px solid #e5e5e5"' : "";
  return `<mjml>
<mj-head>${webfont}
<mj-attributes>
<mj-all font-family="${f.body}" />
<mj-text font-size="15px" line-height="24px" color="${c.text}" padding="0 0 12px" />
<mj-button font-size="15px" padding="12px 0 20px" inner-padding="12px 22px" color="#ffffff" />
</mj-attributes>
</mj-head>
<mj-body background-color="${c.background}" width="560px">
<mj-section padding="28px 16px 0"><mj-column>${logo}</mj-column></mj-section>
<mj-section background-color="${c.card}" border-radius="${brand.cardRadius}px" padding="32px"${cardBorder}><mj-column>
${body}
</mj-column></mj-section>
<mj-section padding="16px 4px 28px"><mj-column><mj-text font-size="12px" line-height="18px" color="${c.muted}">${escapeHtml(brand.footer)}${unsubscribe}</mj-text></mj-column></mj-section>
</mj-body>
</mjml>`;
}

export async function renderEmail(brand: Brand, subject: string, content: Content, data: MergeData): Promise<Rendered> {
  const missing = new Set<string>();
  const badLinks: string[] = [];
  const mergedSubject = merge(subject, data, missing, (s) => s);
  let html: string;
  if (content.kind === "blocks") {
    const result = await mjml2html(blocksToMjml(brand, content.blocks, data, missing, badLinks), {
      validationLevel: "strict",
    });
    html = result.html;
  } else {
    html = merge(content.html, data, missing, escapeHtml);
  }
  if (missing.size || badLinks.length) return { ok: false, missing: [...missing], badLinks };
  return { ok: true, subject: mergedSubject, html };
}

export interface CheckIssue {
  level: "error" | "warning";
  text: string;
}

// Block templates are on-brand by construction; this runs on pasted HTML only.
export function checkHtml(html: string, brand: Brand): CheckIssue[] {
  const issues: CheckIssue[] = [];
  if (/<script\b/i.test(html)) issues.push({ level: "error", text: "Contains a script. Email clients strip scripts." });
  if (/\son[a-z]+\s*=/i.test(html) || /javascript:/i.test(html)) {
    issues.push({ level: "error", text: "Contains JavaScript in an attribute or link." });
  }
  const palette = new Set(
    [...Object.values(brand.colors), "#ffffff", "#fff", "#000000", "#000"].map((x) => x.toLowerCase()),
  );
  const colors = [...new Set((html.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? []).map((x) => x.toLowerCase()))];
  const offPalette = colors.filter((x) => !palette.has(x));
  if (offPalette.length)
    issues.push({ level: "warning", text: `Colours outside the brand palette: ${offPalette.join(", ")}` });
  const allowed = `${FONTS[brand.font].heading},${FONTS[brand.font].body}`.toLowerCase();
  const fonts = [
    ...new Set(
      [...html.matchAll(/font-family:\s*([^;"]+)/gi)].map((m) =>
        m[1]!
          .split(",")[0]!
          .trim()
          .replace(/['"]|&quot;|&#39;/g, ""),
      ),
    ),
  ];
  const offFonts = fonts.filter((x) => !allowed.includes(x.toLowerCase()));
  if (offFonts.length)
    issues.push({ level: "warning", text: `Fonts not in the brand profile: ${offFonts.join(", ")}` });
  const widths = [...html.matchAll(/width\s*[=:]\s*"?(\d+)(?:px)?/gi)].map((m) => Number(m[1]));
  if (widths.some((w) => w > 600))
    issues.push({ level: "warning", text: "Wider than 600px. It will scroll sideways on phones." });
  return issues;
}
