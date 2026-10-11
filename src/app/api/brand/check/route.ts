import { NextResponse } from "next/server";
import { z } from "zod";
import { checkHtml } from "~/domain/email";
import { authorizeApi } from "~/server/auth";
import { getBrand } from "~/server/settings";

export async function POST(request: Request) {
  if (!(await authorizeApi(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z.object({ html: z.string().min(1).max(500_000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "expected { html }" }, { status: 400 });
  return NextResponse.json({ issues: checkHtml(body.data.html, await getBrand()) });
}
