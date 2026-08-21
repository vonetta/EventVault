import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  getGuestSession,
  clearGuestSession,
  unauthorized,
  assertSameOrigin,
} from "@/lib/auth";
import { Day, Event, Guest, Media, Session } from "@/lib/models";
import { mediaProxyUrl } from "@/lib/storage";

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getGuestSession();
  if (!session) return unauthorized("Enter a valid ticket code");

  await connectDB();

  const guest = await Guest.findById(session.guestId);
  if (!guest) {
    await clearGuestSession();
    return unauthorized("Ticket no longer valid");
  }

  const event = await Event.findById(guest.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const tier = guest.tier;

  const groupPhotos = await Media.find({
    eventId: guest.eventId,
    kind: "group_photo",
  }).sort({ createdAt: -1 });

  const group = groupPhotos.map((item) => ({
    id: String(item._id),
    title: item.title || item.filename,
    contentType: item.contentType,
    url: mediaProxyUrl(String(item._id)),
  }));

  if (tier === "standard") {
    return NextResponse.json({
      guest: { name: guest.name, tier },
      event: { name: event.name, description: event.description },
      groupGallery: group,
      personalPhotos: [],
      days: [],
    });
  }

  const [personalPhotos, days, sessions, sessionVideos] = await Promise.all([
    Media.find({
      eventId: guest.eventId,
      kind: "personal_photo",
      guestId: guest._id,
    }).sort({ createdAt: -1 }),
    Day.find({ eventId: guest.eventId }).sort({ sortOrder: 1 }),
    Session.find({ eventId: guest.eventId }).sort({ sortOrder: 1 }),
    Media.find({
      eventId: guest.eventId,
      kind: "session_video",
    }).sort({ createdAt: -1 }),
  ]);

  const personal = personalPhotos.map((item) => ({
    id: String(item._id),
    title: item.title || item.filename,
    contentType: item.contentType,
    url: mediaProxyUrl(String(item._id)),
  }));

  const videosBySession = new Map<string, typeof sessionVideos>();
  for (const video of sessionVideos) {
    const key = String(video.sessionId);
    const list = videosBySession.get(key) || [];
    list.push(video);
    videosBySession.set(key, list);
  }

  const dayPayload = days.map((day) => {
    const daySessions = sessions.filter(
      (sessionItem) => String(sessionItem.dayId) === String(day._id),
    );

    return {
      id: String(day._id),
      label: day.label,
      date: day.date,
      sessions: daySessions.map((sessionItem) => {
        const videos = videosBySession.get(String(sessionItem._id)) || [];
        return {
          id: String(sessionItem._id),
          title: sessionItem.title,
          speaker: sessionItem.speaker,
          startsAt: sessionItem.startsAt,
          description: sessionItem.description,
          videos: videos.map((video) => ({
            id: String(video._id),
            title: video.title || video.filename,
            contentType: video.contentType,
            url: mediaProxyUrl(String(video._id)),
          })),
        };
      }),
    };
  });

  return NextResponse.json({
    guest: { name: guest.name, tier },
    event: { name: event.name, description: event.description },
    groupGallery: group,
    personalPhotos: personal,
    days: dayPayload,
  });
}
