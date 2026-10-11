import { sign } from "~/domain/signing";
import { config } from "./config";
import type { Deps } from "./engine";

export const check: Deps["check"] = async (request) => {
  const c = config();
  const body = JSON.stringify(request);
  const res = await fetch(`${c.HOST_URL.replace(/\/$/, "")}/checks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mailflow-Signature": sign(c.MAILFLOW_SECRET, "check", body) },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`host answered ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  if (typeof json.result !== "boolean") throw new Error("host answer has no boolean result");
  return json.result;
};
