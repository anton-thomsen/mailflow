import { NextResponse } from "next/server";
import { authorizeApi } from "~/server/auth";
import { getBrand } from "~/server/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorizeApi(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getBrand());
}
