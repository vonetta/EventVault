import { NextResponse } from "next/server";
import { assertSameOrigin, clearGuestSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await clearGuestSession();
  return NextResponse.json({ ok: true });
}
