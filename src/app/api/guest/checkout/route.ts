import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { assertSameOrigin, unauthorized } from "@/lib/auth";
import { resolveGuestSession } from "@/lib/guest-session";
import { Event, Guest, Media, Purchase } from "@/lib/models";
import { requireProductionAppUrl } from "@/lib/env";
import {
  getStripe,
  paymentsConfigured,
  personalPhotoCurrency,
  personalPhotoPriceCents,
} from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Start unlocking a guest's individual photos. Returns a Stripe Checkout URL
 * when payments are configured; in development (no Stripe keys) it unlocks
 * immediately so the flow can be exercised end-to-end.
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

  const limited = await rateLimit(`checkout:${guest._id}:${clientIp(request)}`, 10, 60_000);
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

  const personalCount = await Media.countDocuments({
    eventId: guest.eventId,
    kind: "personal_photo",
    guestId: guest._id,
  });
  if (personalCount === 0) {
    return NextResponse.json(
      { error: "You don't have any individual photos to unlock yet." },
      { status: 400 },
    );
  }

  const event = await Event.findById(guest.eventId);
  const eventName = event?.name || "your event";
  const amount = personalPhotoPriceCents();
  const currency = personalPhotoCurrency();

  if (paymentsConfigured()) {
    const appUrl = requireProductionAppUrl();
    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amount,
              product_data: { name: `Individual photos — ${eventName}` },
            },
          },
        ],
        client_reference_id: String(guest._id),
        metadata: { guestId: String(guest._id), eventId: String(guest.eventId) },
        success_url: `${appUrl}/vault?paid=1`,
        cancel_url: `${appUrl}/vault?canceled=1`,
      });
      if (!session.url) {
        return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
      }
      return NextResponse.json({ url: session.url });
    } catch {
      return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    }
  }

  // No Stripe configured. In development, unlock immediately so the paywall can
  // be tested; in production, refuse rather than give photos away for free.
  if (process.env.NODE_ENV !== "production") {
    await Guest.updateOne(
      { _id: guest._id },
      { $set: { personalPhotosPaid: true, personalPhotosPaidAt: new Date() } },
    );
    await Purchase.create({
      eventId: guest.eventId,
      guestId: guest._id,
      amount,
      currency,
      stripeSessionId: `dev_${Date.now()}`,
      status: "paid",
    });
    return NextResponse.json({ paid: true, dev: true });
  }

  return NextResponse.json(
    { error: "Photo purchases are not set up yet. Please contact the organizer." },
    { status: 503 },
  );
}
