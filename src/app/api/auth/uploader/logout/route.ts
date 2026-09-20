import { NextResponse } from "next/server";
import { assertSameOrigin, clearUploaderSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await clearUploaderSession();
  return NextResponse.json({ ok: true });
}
