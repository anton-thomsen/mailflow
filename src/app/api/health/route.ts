import { NextResponse } from "next/server";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await db.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true });
}
