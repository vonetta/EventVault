import { NextResponse } from "next/server";
import { assertSameOrigin, clearAllSessions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await clearAllSessions();
  return NextResponse.json({ ok: true });
}
