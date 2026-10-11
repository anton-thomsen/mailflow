import { createHmac, timingSafeEqual } from "node:crypto";

// Header format: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<purpose>.<t>.<body>">`.
// The purpose stops a signature made for one use (an event) being replayed as another (a check).
export type Purpose = "event" | "check" | "sso" | "session";

const TOLERANCE_S = 300;

function mac(secret: string, purpose: Purpose, t: number, body: string) {
  return createHmac("sha256", secret).update(`${purpose}.${t}.${body}`).digest("hex");
}

export function sign(secret: string, purpose: Purpose, body: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${mac(secret, purpose, t, body)}`;
}

export function verify(secret: string, purpose: Purpose, body: string, header: string | null, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const expected = Buffer.from(mac(secret, purpose, t, body), "hex");
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Self-contained tokens for sign-in links and the session cookie: base64url(json).signature
export function issueToken(
  secret: string,
  purpose: "sso" | "session",
  claims: { email: string; name?: string },
  ttlS: number,
  now = Date.now(),
) {
  const payload = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + ttlS })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`${purpose}.${payload}`).digest("base64url")}`;
}

export function readToken(secret: string, purpose: "sso" | "session", token: string | undefined, now = Date.now()) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${purpose}.${payload}`).digest("base64url"));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    email: string;
    name?: string;
    exp: number;
  };
  return claims.exp > now / 1000 ? claims : null;
}
