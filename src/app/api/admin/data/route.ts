import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, unauthorized } from "@/lib/auth";
import { Day, Event, Guest, Media, Session } from "@/lib/models";
import { createTicketCode } from "@/lib/tickets";

export async function GET() {
  if (!(await isAdminAuthenticated())) return unauthorized();

  await connectDB();
  const event = await Event.findOne().sort({ createdAt: 1 });
  if (!event) {
    return NextResponse.json({ event: null });
  }

  const [days, sessions, guests, media] = await Promise.all([
    Day.find({ eventId: event._id }).sort({ sortOrder: 1 }),
    Session.find({ eventId: event._id }).sort({ sortOrder: 1 }),
    Guest.find({ eventId: event._id }).sort({ name: 1 }),
    Media.find({ eventId: event._id }).sort({ createdAt: -1 }),
  ]);

  return NextResponse.json({ event, days, sessions, guests, media });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  const body = await request.json();
  const action = String(body.action || "");

  await connectDB();

  if (action === "bootstrap") {
    const existing = await Event.findOne();
    if (existing) {
      return NextResponse.json({ event: existing, created: false });
    }

    const event = await Event.create({
      name: body.name || "Retreat Weekend",
      slug: body.slug || "retreat-weekend",
      description: body.description || "3-day event media vault",
      startsOn: body.startsOn || "",
      endsOn: body.endsOn || "",
    });

    const dayLabels = body.days?.length
      ? body.days
      : ["Day 1", "Day 2", "Day 3"];

    const days = await Day.insertMany(
      dayLabels.map((label: string, index: number) => ({
        eventId: event._id,
        label,
        sortOrder: index,
      })),
    );

    return NextResponse.json({ event, days, created: true });
  }

  if (action === "add_session") {
    const session = await Session.create({
      eventId: body.eventId,
      dayId: body.dayId,
      title: body.title,
      speaker: body.speaker || "",
      startsAt: body.startsAt || "",
      description: body.description || "",
      sortOrder: Number(body.sortOrder || 0),
    });
    return NextResponse.json({ session });
  }

  if (action === "import_guests") {
    const rows = Array.isArray(body.guests) ? body.guests : [];
    const created = [];

    for (const row of rows) {
      const name = String(row.name || "").trim();
      if (!name) continue;

      const tier = row.tier === "vip" ? "vip" : "standard";
      let ticketCode = createTicketCode();
      // Extremely unlikely collision loop
      for (let i = 0; i < 5; i++) {
        const exists = await Guest.findOne({ ticketCode });
        if (!exists) break;
        ticketCode = createTicketCode();
      }

      const guest = await Guest.create({
        eventId: body.eventId,
        name,
        email: String(row.email || "").trim(),
        tier,
        ticketCode,
      });
      created.push(guest);
    }

    return NextResponse.json({ guests: created, count: created.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
