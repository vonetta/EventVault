import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Guest } from "@/lib/models";
import { setGuestSession } from "@/lib/auth";
import { normalizeTicketCode } from "@/lib/tickets";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticketCode = normalizeTicketCode(String(body.ticketCode || ""));

    if (!ticketCode) {
      return NextResponse.json({ error: "Ticket code is required" }, { status: 400 });
    }

    await connectDB();
    const guest = await Guest.findOne({ ticketCode });

    if (!guest) {
      return NextResponse.json({ error: "Invalid ticket code" }, { status: 401 });
    }

    await setGuestSession({
      guestId: String(guest._id),
      eventId: String(guest.eventId),
      tier: guest.tier,
      name: guest.name,
    });

    return NextResponse.json({
      ok: true,
      tier: guest.tier,
      name: guest.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
