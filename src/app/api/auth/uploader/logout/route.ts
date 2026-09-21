import { NextResponse } from "next/server";
import { assertSameOrigin, clearUploaderSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await logActivity(request, {
    action: "uploader_logout",
    actor: "uploader",
    actorName: "Photo team",
  });
  await clearUploaderSession();
  return NextResponse.json({ ok: true });
}
