import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Guest } from "@/lib/models";
import { setGuestSession, clearAdminSession, assertSameOrigin } from "@/lib/auth";
import { guestSessionPayload } from "@/lib/guest-session";
import { normalizeTicketCode } from "@/lib/tickets";
import { ticketLoginSchema } from "@/lib/validate";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(request);
  const limited = await rateLimit(`ticket:${ip}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  try {
    const body = ticketLoginSchema.parse(await request.json());
    const ticketCode = normalizeTicketCode(body.ticketCode);

    const codeLimited = await rateLimit(`ticket-code:${ticketCode}`, 10, 60_000);
    if (!codeLimited.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Try again shortly." },
        { status: 429 },
      );
    }

    await connectDB();
    const guest = await Guest.findOne({ ticketCode });

    if (!guest) {
      await logActivity(request, {
        action: "guest_login_failed",
        actor: "guest",
        actorName: "Unknown",
        details: {
          summary: "Wrong ticket code",
          meta: { reason: "invalid_code" },
        },
      });
      return NextResponse.json({ error: "Invalid ticket code" }, { status: 401 });
    }

    guest.lastLoginAt = new Date();
    guest.loginCount = (guest.loginCount || 0) + 1;
    await guest.save();

    await clearAdminSession();
    await setGuestSession(guestSessionPayload(guest));

    const sharedLogin = Boolean(guest.sharedGroupId);
    await logActivity(request, {
      action: "guest_login",
      actor: "guest",
      actorName: guest.name,
      guestId: String(guest._id),
      eventId: String(guest.eventId),
      details: {
        summary: sharedLogin
          ? `${guest.name} · group shared login`
          : `${guest.name} · ${String(guest.tier).toUpperCase()}`,
        meta: {
          tier: guest.tier,
          sharedLogin,
          loginCount: guest.loginCount,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      tier: guest.tier,
      name: guest.name,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
