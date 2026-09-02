import { NextResponse } from "next/server";
import { assertSameOrigin, clearGuestSession, isAdminAuthenticated, unauthorized } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await clearGuestSession();
  return NextResponse.json({ ok: true });
}
