import { NextResponse } from "next/server";
import { verify } from "~/domain/signing";
import { config } from "~/server/config";
import { db } from "~/server/db";
import { eventSchema, ingestEvent } from "~/server/engine";

const MAX_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verify(config().MAILFLOW_SECRET, "event", body, request.headers.get("x-mailflow-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const event = eventSchema.safeParse(json);
  if (!event.success) return NextResponse.json({ error: event.error.flatten() }, { status: 400 });
  return NextResponse.json(await ingestEvent({ db }, event.data));
}
