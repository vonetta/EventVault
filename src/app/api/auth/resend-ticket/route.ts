import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Event, Guest } from "@/lib/models";
import { assertSameOrigin } from "@/lib/auth";
import { sendTicketEmail } from "@/lib/email";
import { resendTicketSchema } from "@/lib/validate";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const GENERIC_OK = {
  ok: true,
  message:
    "If that email is on the guest list, your ticket code is on its way. Check your inbox and spam folder.",
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(request);
  const ipLimited = await rateLimit(`resend-ticket:${ip}`, 5, 60 * 60_000);
  if (!ipLimited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(ipLimited.retryAfterSec) } },
    );
  }

  try {
    const body = resendTicketSchema.parse(await request.json());

    const emailLimited = await rateLimit(`resend-ticket-email:${body.email}`, 3, 60 * 60_000);
    if (!emailLimited.ok) {
      return NextResponse.json(GENERIC_OK);
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json(
        { error: "Ticket resend is not available right now. Contact the event organizer." },
        { status: 503 },
      );
    }

    await connectDB();
    const guest = await Guest.findOne({ email: body.email });

    if (guest) {
      const event = await Event.findById(guest.eventId);
      if (event && guest.email) {
        void sendTicketEmail({
          to: guest.email,
          guestName: guest.name,
          eventName: event.name,
          ticketCode: guest.ticketCode,
          tier: guest.tier,
        }).catch(() => {
          // Same generic response either way — do not leak send failures.
        });
      }
    }

    return NextResponse.json(GENERIC_OK);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not process request" }, { status: 500 });
  }
}
