import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getGuestSession, unauthorized } from "@/lib/auth";
import { Day, Event, Media, Session } from "@/lib/models";
import { getDownloadUrl } from "@/lib/storage";

export async function GET() {
  const session = await getGuestSession();
  if (!session) return unauthorized("Enter a valid ticket code");

  await connectDB();

  const event = await Event.findById(session.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const groupPhotos = await Media.find({
    eventId: session.eventId,
    kind: "group_photo",
  }).sort({ createdAt: -1 });

  const group = await Promise.all(
    groupPhotos.map(async (item) => ({
      id: String(item._id),
      title: item.title || item.filename,
      contentType: item.contentType,
      url: await getDownloadUrl(item.storageKey, item.storageProvider),
    })),
  );

  if (session.tier === "standard") {
    return NextResponse.json({
      guest: { name: session.name, tier: session.tier },
      event,
      groupGallery: group,
      personalPhotos: [],
      days: [],
    });
  }

  const [personalPhotos, days, sessions, sessionVideos] = await Promise.all([
    Media.find({
      eventId: session.eventId,
      kind: "personal_photo",
      guestId: session.guestId,
    }).sort({ createdAt: -1 }),
    Day.find({ eventId: session.eventId }).sort({ sortOrder: 1 }),
    Session.find({ eventId: session.eventId }).sort({ sortOrder: 1 }),
    Media.find({
      eventId: session.eventId,
      kind: "session_video",
    }).sort({ createdAt: -1 }),
  ]);

  const personal = await Promise.all(
    personalPhotos.map(async (item) => ({
      id: String(item._id),
      title: item.title || item.filename,
      contentType: item.contentType,
      url: await getDownloadUrl(item.storageKey, item.storageProvider),
    })),
  );

  const videosBySession = new Map<string, typeof sessionVideos>();
  for (const video of sessionVideos) {
    const key = String(video.sessionId);
    const list = videosBySession.get(key) || [];
    list.push(video);
    videosBySession.set(key, list);
  }

  const dayPayload = await Promise.all(
    days.map(async (day) => {
      const daySessions = sessions.filter(
        (sessionItem) => String(sessionItem.dayId) === String(day._id),
      );

      return {
        id: String(day._id),
        label: day.label,
        date: day.date,
        sessions: await Promise.all(
          daySessions.map(async (sessionItem) => {
            const videos = videosBySession.get(String(sessionItem._id)) || [];
            return {
              id: String(sessionItem._id),
              title: sessionItem.title,
              speaker: sessionItem.speaker,
              startsAt: sessionItem.startsAt,
              description: sessionItem.description,
              videos: await Promise.all(
                videos.map(async (video) => ({
                  id: String(video._id),
                  title: video.title || video.filename,
                  contentType: video.contentType,
                  url: await getDownloadUrl(video.storageKey, video.storageProvider),
                })),
              ),
            };
          }),
        ),
      };
    }),
  );

  return NextResponse.json({
    guest: { name: session.name, tier: session.tier },
    event,
    groupGallery: group,
    personalPhotos: personal,
    days: dayPayload,
  });
}
