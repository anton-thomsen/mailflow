import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "~/domain/brand";
import { checkHtml, renderEmail } from "~/domain/email";

const blocks = (text: string, href = "https://pay.example") => ({
  kind: "blocks" as const,
  blocks: [
    { type: "heading" as const, text },
    { type: "button" as const, label: "Pay", href },
  ],
});

describe("renderEmail", () => {
  it("escapes merge values so a name can't inject HTML", async () => {
    const r = await renderEmail(DEFAULT_BRAND, "Hi {{name}}", blocks("Hi {{name}}"), {
      name: '<img src=x onerror="alert(1)">',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).toContain("&#60;img");
    expect(r.subject).toBe('Hi <img src=x onerror="alert(1)">');
  });

  it("uses the fallback when a field is empty, and reports a field with no fallback", async () => {
    const ok = await renderEmail(DEFAULT_BRAND, "s", blocks("Hi {{ first_name | there }}"), {});
    expect(ok.ok && ok.html.includes("Hi there")).toBe(true);
    expect(await renderEmail(DEFAULT_BRAND, "{{ code }}", blocks("x"), {})).toEqual({
      ok: false,
      missing: ["code"],
      badLinks: [],
    });
  });

  it("refuses a button whose link isn't http, https or mailto", async () => {
    const r = await renderEmail(DEFAULT_BRAND, "s", blocks("x", "{{ link }}"), { link: "javascript:alert(1)" });
    expect(r).toEqual({ ok: false, missing: [], badLinks: ["javascript:alert(1)"] });
  });

  it("applies the brand colours and adds an unsubscribe link only when one is given", async () => {
    const without = await renderEmail(DEFAULT_BRAND, "s", blocks("x"), {});
    const withLink = await renderEmail(DEFAULT_BRAND, "s", blocks("x"), { unsubscribe_url: "https://u.example/1" });
    expect(without.ok && without.html.includes(DEFAULT_BRAND.colors.primary)).toBe(true);
    expect(without.ok && without.html.includes("Unsubscribe")).toBe(false);
    expect(withLink.ok && withLink.html.includes('href="https://u.example/1"')).toBe(true);
  });
});

describe("checkHtml", () => {
  it("blocks scripts and flags off-brand colours, fonts and width", () => {
    const issues = checkHtml(
      '<table width="680"><tr><td style="font-family:Impact;color:#e63946" onclick="x()">Hi</td></tr></table><script>1</script>',
      DEFAULT_BRAND,
    );
    expect(issues.filter((i) => i.level === "error")).toHaveLength(2);
    expect(issues.map((i) => i.text).join("\n")).toMatch(/#e63946[\s\S]*Impact[\s\S]*600px/);
  });

  it("passes HTML that only uses the brand", () => {
    expect(checkHtml(`<p style="color:${DEFAULT_BRAND.colors.text};font-family:Arial">Hi</p>`, DEFAULT_BRAND)).toEqual(
      [],
    );
  });
});
