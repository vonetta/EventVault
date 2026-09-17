import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { connectDB } from "@/lib/db";
import { Guest, Purchase } from "@/lib/models";
import { getStripe } from "@/lib/payments";

/**
 * Stripe calls this after a successful Checkout. It verifies the signature and
 * marks the guest as having unlocked their individual photos. This endpoint is
 * intentionally not same-origin gated (Stripe is the caller).
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const guestId = session.metadata?.guestId || session.client_reference_id || "";
    if (guestId) {
      await connectDB();
      const guest = await Guest.findById(guestId);
      if (guest && !guest.personalPhotosPaid) {
        guest.personalPhotosPaid = true;
        guest.personalPhotosPaidAt = new Date();
        await guest.save();
        // Idempotent on the Stripe session id.
        const existing = await Purchase.findOne({ stripeSessionId: session.id });
        if (!existing) {
          await Purchase.create({
            eventId: guest.eventId,
            guestId: guest._id,
            amount: session.amount_total ?? 0,
            currency: session.currency || "usd",
            stripeSessionId: session.id,
            status: "paid",
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
