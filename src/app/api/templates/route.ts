import { NextResponse } from "next/server";
import { z } from "zod";
import { contentSchema } from "~/domain/email";
import { authorizeApi } from "~/server/auth";
import { saveDraft } from "~/server/templates";

const draftSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(200),
  content: contentSchema,
});

// Uploads always land as an unpublished draft. A person publishes it in the admin UI.
export async function POST(request: Request) {
  if (!(await authorizeApi(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = draftSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  return NextResponse.json(await saveDraft(body.data), { status: 201 });
}
