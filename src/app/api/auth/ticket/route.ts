import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Guest } from "@/lib/models";
import { setGuestSession, assertSameOrigin } from "@/lib/auth";
import { guestSessionPayload } from "@/lib/guest-session";
import { normalizeTicketCode } from "@/lib/tickets";
import { ticketLoginSchema } from "@/lib/validate";
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
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
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
      return NextResponse.json({ error: "Invalid ticket code" }, { status: 401 });
    }

    await setGuestSession(guestSessionPayload(guest));

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
