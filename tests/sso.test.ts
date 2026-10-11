import { describe, expect, it } from "vitest";
import { issueToken } from "~/domain/signing";

process.env.MAILFLOW_SECRET = "s".repeat(32);
process.env.HOST_URL = "https://app.example.com/webhooks/mailflow";
process.env.LISTMONK_URL = "http://listmonk.local";
process.env.LISTMONK_API_USER = "u";
process.env.LISTMONK_API_TOKEN = "t";
process.env.MAIL_FROM = "a@example.com";

const { GET } = await import("~/app/sso/route");
const { safeNext } = await import("~/server/auth");
const token = () => issueToken("s".repeat(32), "sso", { email: "admin@example.com" }, 60);

describe("sso", () => {
  it("signs the admin in with a relative redirect, whatever host the server thinks it has", async () => {
    const res = await GET(new Request(`http://localhost:3000/sso?token=${token()}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toMatch(/^mf_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/);
  });

  it("marks the cookie Secure behind an https proxy", async () => {
    const res = await GET(
      new Request(`http://10.0.0.5:3000/sso?token=${token()}`, { headers: { "x-forwarded-proto": "https" } }),
    );
    expect(res.headers.get("set-cookie")).toContain("; Secure");
  });

  it("sends a bad token to the signed-out page without a cookie", async () => {
    const res = await GET(new Request("http://localhost:3000/sso?token=nope"));
    expect(res.headers.get("location")).toBe("/signed-out");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("only follows same-site next paths", () => {
    expect(safeNext("/templates")).toBe("/templates");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
