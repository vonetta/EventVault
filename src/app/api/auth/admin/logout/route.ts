import { NextResponse } from "next/server";
import { assertSameOrigin, clearAllSessions } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await logActivity(request, {
    action: "admin_logout",
    actor: "admin",
    actorName: "Admin",
  });
  await clearAllSessions();
  return NextResponse.json({ ok: true });
}
