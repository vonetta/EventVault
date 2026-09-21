import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  unauthorized,
  assertSameOrigin,
} from "@/lib/auth";
import { Day, Event, Media, Session } from "@/lib/models";
import { resolveGuestSession } from "@/lib/guest-session";
import { findIndividualPhotos } from "@/lib/individual-photos";
import { mediaProxyUrl } from "@/lib/storage";
import { zelleConfigured, zellePaymentInfo } from "@/lib/payments";
import { isMediaAvailable, youtubeEmbedForRef, youtubeOpenUrlForRef } from "@/lib/youtube";

function mapFileMedia(item: {
  _id: { toString(): string };
  title?: string | null;
  filename?: string | null;
  contentType?: string | null;
}) {
  return {
    id: String(item._id),
    title: item.title || item.filename || "Media",
    contentType: item.contentType || "application/octet-stream",
    provider: "file" as const,
    url: mediaProxyUrl(String(item._id)),
  };
}

function mapSessionMedia(item: {
  _id: { toString(): string };
  title?: string | null;
  filename?: string | null;
  contentType?: string | null;
  storageProvider?: string | null;
  youtubeId?: string | null;
  youtubePlaylistId?: string | null;
  availableUntil?: Date | null;
}) {
  if (!isMediaAvailable(item.availableUntil)) return null;

  if (item.storageProvider === "youtube") {
    if (item.youtubePlaylistId) {
      const ref = { type: "playlist" as const, id: item.youtubePlaylistId };
      return {
        id: String(item._id),
        title: item.title || "Session playlist",
        contentType: "video/youtube-playlist",
        provider: "youtube" as const,
        youtubePlaylistId: item.youtubePlaylistId,
        url: youtubeOpenUrlForRef(ref),
        embedUrl: youtubeEmbedForRef(ref),
        availableUntil: item.availableUntil || null,
      };
    }
    if (item.youtubeId) {
      const ref = { type: "video" as const, id: item.youtubeId };
      return {
        id: String(item._id),
        title: item.title || "Session video",
        contentType: "video/youtube",
        provider: "youtube" as const,
        youtubeId: item.youtubeId,
        url: youtubeOpenUrlForRef(ref),
        embedUrl: youtubeEmbedForRef(ref),
        availableUntil: item.availableUntil || null,
      };
    }
  }

  return {
    ...mapFileMedia(item),
    availableUntil: item.availableUntil || null,
  };
}

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = await resolveGuestSession();
  if (!resolved) return unauthorized("Enter a valid ticket code");

  const { session, guest } = resolved;

  await connectDB();

  const event = await Event.findById(guest.eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const tier = guest.tier;
  const guestId = String(guest._id);

  // Whole-event album (includes former group/team shares after consolidate).
  // Photos tagged to this guest stay under Photos of you only.
  const eventPhotoDocs = await Media.find({
    eventId: guest.eventId,
    kind: { $in: ["event_photo", "group_photo"] },
    needsEditing: { $ne: true },
  }).sort({ createdAt: -1 });

  const eventGallery = eventPhotoDocs
    .filter(
      (item) =>
        isMediaAvailable(item.availableUntil) &&
        !(item.taggedGuestIds || []).some((id) => String(id) === guestId),
    )
    .map(mapFileMedia);

  const preview = Boolean(session.adminPreview);
  const paid =
    Boolean(guest.personalPhotosPaid) || guest.tier === "vip" || preview;

  const [personalPhotoDocs, days, sessions, sessionVideos] = await Promise.all([
    findIndividualPhotos(guest.eventId, guest._id),
    Day.find({ eventId: guest.eventId }).sort({ sortOrder: 1 }),
    Session.find({ eventId: guest.eventId }).sort({ sortOrder: 1 }),
    Media.find({ eventId: guest.eventId, kind: "session_video" }).sort({ createdAt: -1 }),
  ]);

  const personal = personalPhotoDocs
    .filter((item) => isMediaAvailable(item.availableUntil))
    .map(mapFileMedia);
  const hasPersonal = personal.length > 0;

  const videosBySession = new Map<string, NonNullable<ReturnType<typeof mapSessionMedia>>[]>();
  for (const video of sessionVideos) {
    const mapped = mapSessionMedia(video);
    if (!mapped) continue;
    const key = String(video.sessionId);
    const list = videosBySession.get(key) || [];
    list.push(mapped);
    videosBySession.set(key, list);
  }
  const totalSessionVideos = [...videosBySession.values()].reduce((n, v) => n + v.length, 0);
  const hasSessions = totalSessionVideos > 0;

  const dayPayload = days.map((day) => {
    const daySessions = sessions.filter(
      (sessionItem) => String(sessionItem.dayId) === String(day._id),
    );
    return {
      id: String(day._id),
      label: day.label,
      date: day.date,
      sessions: daySessions.map((sessionItem) => {
        const all = videosBySession.get(String(sessionItem._id)) || [];
        return {
          id: String(sessionItem._id),
          title: sessionItem.title,
          speaker: sessionItem.speaker,
          startsAt: sessionItem.startsAt,
          description: sessionItem.description,
          videoCount: all.length,
          videos: paid ? all : [],
        };
      }),
    };
  });

  const payments = {
    method: "zelle" as const,
    enabled: zelleConfigured(),
    priceLabel: zellePaymentInfo().priceLabel,
    zelle: zellePaymentInfo(guest.ticketCode),
  };

  return NextResponse.json({
    guest: { name: guest.name, tier },
    event: { name: event.name, description: event.description },
    groupGallery: [],
    eventGallery,
    personalPhotos: personal,
    personalPhotosPaid: paid,
    personalPhotosLocked: hasPersonal && !paid,
    zellePaymentPending: Boolean(guest.zellePaymentPending) && !paid,
    hasSessions,
    sessionsLocked: hasSessions && !paid,
    payments,
    days: dayPayload,
    preview,
  });
}
