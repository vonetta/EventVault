import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, unauthorized, assertSameOrigin } from "@/lib/auth";
import { Day, Event, Guest, Media, Session } from "@/lib/models";
import { createTicketCode } from "@/lib/tickets";
import { adminActionSchema } from "@/lib/validate";
import { emailConfigured, sendTicketEmail } from "@/lib/email";
import type { z } from "zod";

type AdminAction = z.infer<typeof adminActionSchema>;

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function uniqueTicketCode() {
  let ticketCode = createTicketCode();
  for (let i = 0; i < 8; i++) {
    const exists = await Guest.findOne({ ticketCode });
    if (!exists) return ticketCode;
    ticketCode = createTicketCode();
  }
  return ticketCode;
}

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  await connectDB();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  const events = await Event.find().sort({ createdAt: -1 });
  if (!events.length) {
    return NextResponse.json({ event: null, events: [], emailConfigured: emailConfigured() });
  }

  const event =
    (eventId && events.find((item) => String(item._id) === eventId)) || events[0];

  const [days, sessions, guests, media] = await Promise.all([
    Day.find({ eventId: event._id }).sort({ sortOrder: 1 }),
    Session.find({ eventId: event._id }).sort({ sortOrder: 1 }),
    Guest.find({ eventId: event._id }).sort({ name: 1 }),
    Media.find({ eventId: event._id }).sort({ createdAt: -1 }),
  ]);

  return NextResponse.json({
    event,
    events,
    days,
    sessions,
    guests,
    media: media.map((item) => ({
      _id: item._id,
      kind: item.kind,
      title: item.title,
      filename: item.filename,
      contentType: item.contentType,
      guestId: item.guestId,
      sessionId: item.sessionId,
      storageProvider: item.storageProvider,
      youtubeId: item.youtubeId,
      availableUntil: item.availableUntil,
      createdAt: item.createdAt,
      // storageKey intentionally omitted from admin list payloads
    })),
    emailConfigured: emailConfigured(),
  });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: AdminAction;
  try {
    body = adminActionSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();

  if (body.action === "bootstrap" || body.action === "create_event") {
    if (body.action === "bootstrap") {
      const existing = await Event.findOne();
      if (existing) {
        return NextResponse.json({ event: existing, created: false });
      }
    }

    const name = body.name || "Retreat Weekend";
    const slugBase = body.slug || slugify(name) || "event";
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const clash = await Event.findOne({ slug });
      if (!clash) break;
      slug = `${slugBase}-${i + 2}`;
    }

    const event = await Event.create({
      name,
      slug,
      description: body.description || "Event media vault",
      startsOn: "",
      endsOn: "",
    });

    const dayLabels = body.days?.length ? body.days : ["Day 1", "Day 2", "Day 3"];
    const days = await Day.insertMany(
      dayLabels.map((label: string, index: number) => ({
        eventId: event._id,
        label,
        sortOrder: index,
      })),
    );

    return NextResponse.json({ event, days, created: true });
  }

  if (body.action === "add_session") {
    const event = await Event.findById(body.eventId);
    const day = await Day.findById(body.dayId);
    if (!event || !day || String(day.eventId) !== String(event._id)) {
      return NextResponse.json({ error: "Invalid event or day" }, { status: 400 });
    }

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

  if (body.action === "import_guests") {
    const event = await Event.findById(body.eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const created = [];
    const updated = [];
    const emailed = [];
    const emailErrors = [];

    for (const row of body.guests) {
      const name = row.name.trim();
      const email = (row.email || "").trim().toLowerCase();
      const tier = row.tier === "vip" ? "vip" : "standard";

      let guest =
        email
          ? await Guest.findOne({ eventId: body.eventId, email })
          : null;

      if (guest) {
        guest.name = name;
        guest.tier = tier;
        if (email) guest.email = email;
        await guest.save();
        updated.push(guest);
      } else {
        guest = await Guest.create({
          eventId: body.eventId,
          name,
          email,
          tier,
          ticketCode: await uniqueTicketCode(),
        });
        created.push(guest);
      }

      if (body.sendEmail && guest.email) {
        const result = await sendTicketEmail({
          to: guest.email,
          guestName: guest.name,
          eventName: event.name,
          ticketCode: guest.ticketCode,
          tier: guest.tier,
        });
        if (result.sent) emailed.push(guest.email);
        else emailErrors.push({ email: guest.email, reason: result.reason });
      }
    }

    return NextResponse.json({
      guests: [...created, ...updated],
      created: created.length,
      updated: updated.length,
      count: created.length + updated.length,
      emailed: emailed.length,
      emailErrors,
    });
  }

  if (body.action === "delete_guest") {
    const guest = await Guest.findByIdAndDelete(body.guestId);
    if (!guest) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }
    // Keep media files but unlink personal tags
    await Media.updateMany({ guestId: guest._id }, { $set: { guestId: null } });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "regenerate_code") {
    const guest = await Guest.findById(body.guestId);
    if (!guest) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }
    guest.ticketCode = await uniqueTicketCode();
    await guest.save();
    return NextResponse.json({ guest });
  }

  if (body.action === "email_ticket") {
    const guest = await Guest.findById(body.guestId);
    if (!guest) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }
    if (!guest.email) {
      return NextResponse.json({ error: "Guest has no email" }, { status: 400 });
    }
    const event = await Event.findById(guest.eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const result = await sendTicketEmail({
      to: guest.email,
      guestName: guest.name,
      eventName: event.name,
      ticketCode: guest.ticketCode,
      tier: guest.tier,
    });
    if (!result.sent) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete_media") {
    const media = await Media.findByIdAndDelete(body.mediaId);
    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "add_youtube_session") {
    const { parseYouTubeId, youtubeWatchUrl } = await import("@/lib/youtube");
    const event = await Event.findById(body.eventId);
    const session = await Session.findById(body.sessionId);
    if (!event || !session || String(session.eventId) !== String(event._id)) {
      return NextResponse.json({ error: "Invalid event or session" }, { status: 400 });
    }

    const youtubeId = parseYouTubeId(body.youtubeUrl);
    if (!youtubeId) {
      return NextResponse.json({ error: "Could not parse YouTube URL" }, { status: 400 });
    }

    let availableUntil: Date | null = null;
    if (body.availableUntil?.trim()) {
      const parsed = new Date(body.availableUntil);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid availableUntil date" }, { status: 400 });
      }
      // If date-only (YYYY-MM-DD), treat as end of that day UTC
      if (/^\d{4}-\d{2}-\d{2}$/.test(body.availableUntil.trim())) {
        parsed.setUTCHours(23, 59, 59, 999);
      }
      availableUntil = parsed;
    }

    const media = await Media.create({
      eventId: event._id,
      kind: "session_video",
      title: body.title?.trim() || `YouTube ${youtubeId}`,
      filename: `youtube-${youtubeId}`,
      contentType: "video/youtube",
      size: 0,
      storageKey: "",
      storageProvider: "youtube",
      youtubeId,
      availableUntil,
      sessionId: session._id,
      guestId: null,
    });

    return NextResponse.json({
      media: {
        _id: media._id,
        kind: media.kind,
        title: media.title,
        youtubeId,
        youtubeUrl: youtubeWatchUrl(youtubeId),
        availableUntil: media.availableUntil,
        sessionId: media.sessionId,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
