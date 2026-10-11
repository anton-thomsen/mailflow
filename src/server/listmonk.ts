import { config } from "./config";

const TEMPLATE_NAME = "mailflow-passthrough";
let templateId: number | undefined;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = config();
  const res = await fetch(new URL(path, c.LISTMONK_URL), {
    ...init,
    headers: {
      Authorization: `token ${c.LISTMONK_API_USER}:${c.LISTMONK_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Listmonk ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { data: T }).data;
}

// mailflow renders the whole email itself; Listmonk only needs one template that passes it through.
async function passthroughTemplate() {
  if (templateId) return templateId;
  const existing = await call<{ id: number; name: string; type: string }[]>("/api/templates?no_body=true");
  const found = existing.find((t) => t.name === TEMPLATE_NAME && t.type === "tx");
  templateId =
    found?.id ??
    (
      await call<{ id: number }>("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          name: TEMPLATE_NAME,
          type: "tx",
          subject: "{{ .Tx.Data.subject }}",
          body: "{{ .Tx.Data.html | Safe }}",
        }),
      })
    ).id;
  return templateId;
}

// Resolves when Listmonk has queued the message. Listmonk gives no delivery receipt.
export async function deliver(email: { to: string; subject: string; html: string }) {
  await call("/api/tx", {
    method: "POST",
    body: JSON.stringify({
      subscriber_emails: [email.to],
      subscriber_mode: "external",
      template_id: await passthroughTemplate(),
      from_email: config().MAIL_FROM,
      // Inside data, not `subject`: Listmonk would parse a subject containing "{{" as a template.
      data: { subject: email.subject, html: email.html },
    }),
  });
}
