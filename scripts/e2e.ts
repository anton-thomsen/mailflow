// End-to-end check against real services: signed HTTP events into a running mailflow, delivery through a
// real Listmonk into Mailpit, and signed checks against a stand-in host app. Only the clock is simulated,
// by calling the engine's tick() with a chosen time against the same database the server uses.
//
// Needs `docker compose -f dev/compose.yml up -d` and a .env with the Listmonk token (see README).
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

process.loadEnvFile(".env");
const DATABASE_URL = `${process.env.DATABASE_URL!.split("?")[0]}?schema=e2e`;
process.env.DATABASE_URL = DATABASE_URL;
process.env.WORKER = "off";

const PORT = 58200;
const HOST_PORT = new URL(process.env.HOST_URL!).port;
const MAILPIT = "http://127.0.0.1:58025";
const DAY = 86_400_000;
// Simulated day 0 starts once the events are in, so every run is already due at day 0.
let t0 = new Date();
const at = (days: number) => new Date(t0.getTime() + days * DAY);

const { sign, verify } = await import("~/domain/signing");
const { deps } = await import("~/server/deps");
const { tick } = await import("~/server/engine");
const { installExample } = await import("~/server/install");
const secret = process.env.MAILFLOW_SECRET!;

let failures = 0;
function expect(ok: boolean, label: string) {
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

// Stand-in host app: answers "payment-settled" from this set, and rejects unsigned calls.
const paid = new Set<string>();
const hostCalls: string[] = [];
const host = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    if (!verify(secret, "check", body, req.headers["x-mailflow-signature"] as string)) {
      res.writeHead(401).end();
      return;
    }
    const { recipientId, check } = JSON.parse(body) as { recipientId: string; check: string };
    hostCalls.push(`${check}:${recipientId}`);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result: paid.has(recipientId) }));
  });
});
await new Promise<void>((r) => host.listen(Number(HOST_PORT), "127.0.0.1", r));

async function listmonk(path: string, init: RequestInit = {}) {
  const res = await fetch(`${process.env.LISTMONK_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `token ${process.env.LISTMONK_API_USER}:${process.env.LISTMONK_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`listmonk ${path} ${res.status} ${await res.text()}`);
}

await listmonk("/api/settings/smtp", {
  method: "PUT",
  body: JSON.stringify([
    {
      enabled: true,
      host: "mailpit",
      port: 1025,
      auth_protocol: "none",
      username: "",
      password: "",
      hello_hostname: "",
      max_conns: 10,
      idle_timeout: "15s",
      wait_timeout: "5s",
      max_msg_retries: 2,
      msg_retry_delay: "10ms",
      tls_type: "none",
      tls_skip_verify: true,
      email_headers: [],
      from_addresses: [],
    },
  ]),
});
await new Promise((r) => setTimeout(r, 3000));
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });

execSync("npx prisma migrate deploy", { stdio: "ignore", env: process.env });
await deps.db.$executeRawUnsafe(
  'TRUNCATE "Event", "Delivery", "RunEntry", "Run", "Workflow", "TemplateVersion", "Template", "Setting" CASCADE',
);
await installExample(deps.db, "live");

const server: ChildProcess = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  env: process.env,
  stdio: "ignore",
  detached: true,
});
const stop = () => {
  try {
    process.kill(-server.pid!, "SIGTERM");
  } catch {}
  host.close();
};
for (let i = 0; i < 120; i++) {
  const ok = await fetch(`http://127.0.0.1:${PORT}/api/health`).then(
    (r) => r.ok,
    () => false,
  );
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
}

async function post(event: object, signature?: string) {
  const body = JSON.stringify(event);
  const res = await fetch(`http://127.0.0.1:${PORT}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mailflow-Signature": signature ?? sign(secret, "event", body) },
    body,
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const failedEvent = (who: string) => ({
  id: `evt_failed_${who}`,
  type: "payment_failed",
  recipient: { id: who, email: `${who}@example.com` },
  data: { first_name: who[0]!.toUpperCase() + who.slice(1), payment_link: `https://pay.example/${who}` },
});

async function mail() {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=100`);
  const { messages } = (await res.json()) as {
    messages: { ID: string; Subject: string; To: { Address: string }[]; From: { Address: string } }[];
  };
  return messages.reverse();
}

async function settle(expected: number) {
  for (let i = 0; i < 30; i++) {
    if ((await mail()).length >= expected) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return mail();
}

async function runDays(days: number[]) {
  for (const d of days) await tick(deps, at(d));
}

try {
  expect((await post(failedEvent("alex"), "t=1,v1=00")).status === 401, "an unsigned event is rejected with 401");

  const first = await post(failedEvent("alex"));
  expect(
    first.status === 200 && (first.json.started as string[]).length === 1,
    "a signed payment_failed event starts a run",
  );
  expect(
    (await post(failedEvent("alex"))).json.duplicate === true,
    "the same event sent twice is recognised as a duplicate",
  );
  await post(failedEvent("sam"));
  await post(failedEvent("kim"));
  t0 = new Date();

  await runDays([0]);
  let inbox = await settle(3);
  expect(inbox.length === 3, `day 0: three first notices arrive in Mailpit (got ${inbox.length})`);

  await runDays([1]);
  const paidEvent = {
    id: "evt_paid_sam",
    type: "payment_succeeded",
    recipient: { id: "sam", email: "sam@example.com" },
    data: {},
  };
  expect(
    ((await post(paidEvent)).json.stopped as string[]).length === 1,
    "day 1: sam pays and the payment_succeeded event stops sam's run",
  );
  await runDays([2, 3]);
  inbox = await settle(5);
  expect(inbox.length === 5, `day 3: reminders go to alex and kim only (inbox has ${inbox.length})`);
  expect(!inbox.slice(3).some((m) => m.To[0]!.Address === "sam@example.com"), "day 3: sam gets no reminder");

  paid.add("kim");
  await runDays([5, 7, 8]);
  inbox = await settle(6);
  expect(inbox.length === 6, `day 7: only alex gets the last notice (inbox has ${inbox.length})`);
  expect(
    inbox[5]?.To[0]?.Address === "alex@example.com" && inbox[5]?.Subject === "Your payment is still outstanding",
    "day 7: the last notice is alex's",
  );
  expect(hostCalls.includes("payment-settled:kim"), "mailflow asked the host app whether kim had paid");

  const perPerson = (who: string) =>
    inbox.filter((m) => m.To[0]!.Address === `${who}@example.com`).map((m) => m.Subject);
  expect(
    JSON.stringify(perPerson("alex")) ===
      JSON.stringify([
        "We couldn't take your payment",
        "A quick reminder about your payment",
        "Your payment is still outstanding",
      ]),
    "alex: first notice, reminder, last notice",
  );
  expect(
    JSON.stringify(perPerson("sam")) === JSON.stringify(["We couldn't take your payment"]),
    "sam: first notice only",
  );
  expect(
    JSON.stringify(perPerson("kim")) ===
      JSON.stringify(["We couldn't take your payment", "A quick reminder about your payment"]),
    "kim: first notice and reminder",
  );

  const runs = await deps.db.run.findMany({ orderBy: { recipientId: "asc" } });
  expect(
    runs.map((r) => `${r.recipientId}:${r.status}`).join(",") === "alex:completed,kim:completed,sam:stopped",
    "runs end as alex completed, kim completed, sam stopped",
  );

  const firstAlex = inbox.find((m) => m.To[0]!.Address === "alex@example.com")!;
  const html = (await (await fetch(`${MAILPIT}/api/v1/message/${firstAlex.ID}`)).json()) as {
    HTML: string;
    From: { Address: string };
  };
  expect(
    html.HTML.includes("Hi Alex,") && html.HTML.includes('href="https://pay.example/alex"'),
    "the email carries the merged name and payment link",
  );
  expect(html.From.Address === "mail@example.com", "the email is sent from MAIL_FROM");
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/e2e-first-email.html", html.HTML);
} finally {
  stop();
  await deps.db.$disconnect();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
