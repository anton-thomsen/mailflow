import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // Shared with the host app. Signs events in, checks out and admin sign-in links.
  MAILFLOW_SECRET: z.string().min(32),
  // Base URL mailflow calls for checks, e.g. https://app.example.com/api/mailflow
  HOST_URL: z.string().url(),
  // Where admins are sent back to, and where the "Back" link points.
  HOST_ADMIN_URL: z.string().url().optional(),
  LISTMONK_URL: z.string().url(),
  LISTMONK_API_USER: z.string().min(1),
  LISTMONK_API_TOKEN: z.string().min(1),
  MAIL_FROM: z.string().min(3),
  // Bearer token for the AI skills and scripts. Unset disables the token API.
  MAILFLOW_API_TOKEN: z.string().min(32).optional(),
  WORKER: z.enum(["on", "off"]).default("on"),
  WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

// Parsed on first use rather than at import, so `next build` works without runtime secrets.
export function config(): Config {
  cached ??= schema.parse({ ...process.env, MAILFLOW_API_TOKEN: process.env.MAILFLOW_API_TOKEN || undefined });
  return cached;
}
