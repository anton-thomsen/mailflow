import { NextResponse } from "next/server";
import { authorizeApi } from "~/server/auth";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

// The fields a template can rely on are the ones the host actually sends, so read them from recent events.
export async function GET(request: Request) {
  if (!(await authorizeApi(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const events = await db.event.findMany({
    orderBy: { receivedAt: "desc" },
    take: 200,
    select: { type: true, payload: true },
  });
  const byEvent: Record<string, Set<string>> = {};
  for (const e of events) {
    const data = (e.payload as { data?: Record<string, string> }).data ?? {};
    byEvent[e.type] ??= new Set();
    for (const key of Object.keys(data)) byEvent[e.type]!.add(key);
  }
  return NextResponse.json({
    events: Object.fromEntries(Object.entries(byEvent).map(([type, keys]) => [type, [...keys].sort()])),
    syntax: "{{ field }} or {{ field | fallback }}",
  });
}
