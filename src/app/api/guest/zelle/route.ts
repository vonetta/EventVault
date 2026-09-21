import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { assertSameOrigin, unauthorized } from "@/lib/auth";
import { resolveGuestSession } from "@/lib/guest-session";
import { Guest, Media } from "@/lib/models";
import { countIndividualPhotos } from "@/lib/individual-photos";
import { zelleConfigured, zellePaymentInfo } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/audit";

/** Return Zelle unlock instructions for the current guest (no Stripe). */
export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = await resolveGuestSession();
  if (!resolved) return unauthorized("Enter a valid ticket code");
  const { guest, session } = resolved;

  await connectDB();

  const [personalCount, sessionCount] = await Promise.all([
    countIndividualPhotos(guest.eventId, guest._id),
    Media.countDocuments({ eventId: guest.eventId, kind: "session_video" }),
  ]);

  return NextResponse.json({
    paid: Boolean(guest.personalPhotosPaid) || Boolean(session.adminPreview),
    pending: Boolean(guest.zellePaymentPending) && !guest.personalPhotosPaid,
    hasUnlockable: personalCount > 0 || sessionCount > 0,
    zelle: zellePaymentInfo(guest.ticketCode),
    configured: zelleConfigured(),
  });
}

/**
 * Guest confirms they sent Zelle. Does NOT unlock photos — an admin marks
 * them paid after the transfer shows up (no Stripe / no processor fee).
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = await resolveGuestSession();
  if (!resolved) return unauthorized("Enter a valid ticket code");
  const { guest } = resolved;

  const limited = await rateLimit(`zelle-pending:${guest._id}:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  await connectDB();

  if (guest.personalPhotosPaid) {
    return NextResponse.json({ paid: true, alreadyPaid: true });
  }

  if (!zelleConfigured()) {
    return NextResponse.json(
      { error: "Zelle unlock is not set up yet. Please contact the organizer." },
      { status: 503 },
    );
  }

  const [personalCount, sessionCount] = await Promise.all([
    countIndividualPhotos(guest.eventId, guest._id),
    Media.countDocuments({ eventId: guest.eventId, kind: "session_video" }),
  ]);
  if (personalCount === 0 && sessionCount === 0) {
    return NextResponse.json(
      { error: "There's nothing to unlock for you yet." },
      { status: 400 },
    );
  }

  await Guest.updateOne(
    { _id: guest._id },
    {
      $set: {
        zellePaymentPending: true,
        zellePaymentPendingAt: new Date(),
      },
    },
  );

  await logActivity(request, {
    action: "guest_zelle_pending",
    actor: "guest",
    actorName: guest.name,
    guestId: String(guest._id),
    eventId: String(guest.eventId),
    details: {
      summary: `${guest.name} · waiting for payment confirm`,
      meta: {
        personalPhotos: personalCount,
        sessions: sessionCount,
      },
    },
  });

  return NextResponse.json({
    pending: true,
    message:
      "Thanks — once your Zelle is confirmed, your photos will unlock. This usually doesn’t take long.",
    zelle: zellePaymentInfo(guest.ticketCode),
  });
}
