import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readToken } from "~/domain/signing";
import { config } from "./config";

export const SESSION_COOKIE = "mf_session";
// Short, because removing someone's admin rights in the host app only takes effect when this expires.
export const SESSION_TTL_S = 3600;

export async function currentAdmin() {
  return readToken(config().MAILFLOW_SECRET, "session", (await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) redirect("/signed-out");
  return admin;
}

// The AI skills use a bearer token; a signed-in admin's browser uses the session cookie.
export async function authorizeApi(request: Request) {
  const token = config().MAILFLOW_API_TOKEN;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (token && bearer && bearer.length === token.length && timingSafeEqual(Buffer.from(bearer), Buffer.from(token)))
    return true;
  return (await currentAdmin()) !== null;
}

// Same-site paths only: "//host" and "/\\host" would send the admin to another site.
export function safeNext(next: string | null) {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}
