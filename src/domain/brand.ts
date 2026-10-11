import { z } from "zod";

export const FONTS = {
  classic: {
    label: "Georgia headings · Arial text",
    heading: "Georgia, 'Times New Roman', serif",
    body: "Arial, Helvetica, sans-serif",
  },
  modern: {
    label: "Helvetica throughout",
    heading: "Helvetica, Arial, sans-serif",
    body: "Helvetica, Arial, sans-serif",
  },
  friendly: {
    label: "Trebuchet headings · Verdana text",
    heading: "'Trebuchet MS', Arial, sans-serif",
    body: "Verdana, Geneva, sans-serif",
  },
  inter: {
    label: "Inter (web font)",
    heading: "Inter, Arial, sans-serif",
    body: "Inter, Arial, sans-serif",
    webfont: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
  },
} as const;

export type FontKey = keyof typeof FONTS;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const brandSchema = z.object({
  name: z.string().min(1),
  logoText: z.string().min(1),
  logoUrl: z.string().url().optional(),
  colors: z.object({ primary: hex, text: hex, muted: hex, background: hex, card: hex }),
  font: z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]),
  button: z.enum(["rounded", "pill", "square"]),
  cardRadius: z.number().int().min(0).max(24),
  footer: z.string(),
  tone: z.string(),
});

export type Brand = z.infer<typeof brandSchema>;

export const PRESETS: Brand[] = [
  {
    name: "Forest",
    logoText: "Your company",
    colors: { primary: "#2f5d4a", text: "#1d2b24", muted: "#7a857f", background: "#f4f1ec", card: "#ffffff" },
    font: "classic",
    button: "rounded",
    cardRadius: 12,
    footer: "Your Company Ltd · City",
    tone: "Calm and warm. Short sentences. Never blame the reader. Always say what happens next.",
  },
  {
    name: "Clinical blue",
    logoText: "Your company",
    colors: { primary: "#1f5fbf", text: "#14213d", muted: "#6b7686", background: "#eef3fa", card: "#ffffff" },
    font: "modern",
    button: "square",
    cardRadius: 4,
    footer: "Your Company Ltd · City",
    tone: "Clear and factual. Lead with the action.",
  },
  {
    name: "Coral",
    logoText: "Your company",
    colors: { primary: "#d0573f", text: "#2d1f1b", muted: "#8a7670", background: "#fbf1ec", card: "#ffffff" },
    font: "friendly",
    button: "pill",
    cardRadius: 20,
    footer: "Your Company Ltd · City",
    tone: "Friendly and encouraging.",
  },
  {
    name: "Minimal",
    logoText: "Your company",
    colors: { primary: "#111111", text: "#111111", muted: "#777777", background: "#ffffff", card: "#ffffff" },
    font: "inter",
    button: "square",
    cardRadius: 0,
    footer: "Your Company Ltd · City",
    tone: "Brief. No exclamation marks.",
  },
];

export const DEFAULT_BRAND = PRESETS[0]!;
