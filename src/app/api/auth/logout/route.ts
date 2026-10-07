import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  clearAllSessions,
  isAdminAuthenticated,
  isUploaderAuthenticated,
} from "@/lib/auth";
import { resolveGuestSession } from "@/lib/guest-session";
import { logActivity } from "@/lib/audit";
import { requestUserAgent, summarizeUserAgent } from "@/lib/request-meta";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const guestResolved = await resolveGuestSession();
  if (guestResolved) {
    const galleryLogin = Boolean(guestResolved.guest.sharedEventGalleryId);
    const device = summarizeUserAgent(requestUserAgent(request));
    await logActivity(request, {
      action: "guest_logout",
      actor: "guest",
      actorName: galleryLogin
        ? `Gallery visitor · ${device}`
        : guestResolved.guest.name,
      guestId: String(guestResolved.guest._id),
      eventId: String(guestResolved.guest.eventId),
      details: {
        summary: galleryLogin
          ? `Signed out of Whole-event vault · ${device}`
          : undefined,
        meta: { galleryLogin, device },
      },
    });
  } else if (await isAdminAuthenticated()) {
    await logActivity(request, {
      action: "admin_logout",
      actor: "admin",
      actorName: "Admin",
    });
  } else if (await isUploaderAuthenticated()) {
    await logActivity(request, {
      action: "uploader_logout",
      actor: "uploader",
      actorName: "Photo team",
    });
  }

  await clearAllSessions();
  return NextResponse.json({ ok: true });
}
