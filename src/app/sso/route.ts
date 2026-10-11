import { issueToken, readToken } from "~/domain/signing";
import { SESSION_COOKIE, SESSION_TTL_S, safeNext } from "~/server/auth";
import { config } from "~/server/config";

// The host app signs a short-lived link for an admin it has already authenticated. Redirects use a
// relative Location: behind a proxy, request.url carries the internal host, not the one the browser used.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = config().MAILFLOW_SECRET;
  const claims = readToken(secret, "sso", url.searchParams.get("token") ?? undefined);
  if (!claims) return new Response(null, { status: 303, headers: { Location: "/signed-out" } });
  const https = request.headers.get("x-forwarded-proto") === "https" || url.protocol === "https:";
  const cookie = [
    `${SESSION_COOKIE}=${issueToken(secret, "session", { email: claims.email, name: claims.name }, SESSION_TTL_S)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_S}`,
    ...(https ? ["Secure"] : []),
  ].join("; ");
  return new Response(null, {
    status: 303,
    headers: { Location: safeNext(url.searchParams.get("next")), "Set-Cookie": cookie },
  });
}
