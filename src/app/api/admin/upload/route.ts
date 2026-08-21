import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, unauthorized, assertSameOrigin } from "@/lib/auth";
import { Event, Guest, Media, Session } from "@/lib/models";
import { storeFile } from "@/lib/storage";
import {
  IMAGE_MIME,
  VIDEO_MIME,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  objectIdSchema,
} from "@/lib/validate";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();

  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const eventIdRaw = String(form.get("eventId") || "");
  const kindRaw = String(form.get("kind") || "");
  const title = String(form.get("title") || "").slice(0, 200);
  const guestIdRaw = String(form.get("guestId") || "");
  const sessionIdRaw = String(form.get("sessionId") || "");

  if (!(file instanceof File) || !eventIdRaw || !kindRaw) {
    return NextResponse.json(
      { error: "file, eventId, and kind are required" },
      { status: 400 },
    );
  }

  const eventId = objectIdSchema.safeParse(eventIdRaw);
  if (!eventId.success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  const allowedKinds = ["personal_photo", "group_photo", "session_video"] as const;
  type MediaKind = (typeof allowedKinds)[number];
  if (!allowedKinds.includes(kindRaw as MediaKind)) {
    return NextResponse.json({ error: "Invalid media kind" }, { status: 400 });
  }
  const kind = kindRaw as MediaKind;

  const contentType = (file.type || "").toLowerCase();
  const isImage = IMAGE_MIME.has(contentType);
  const isVideo = VIDEO_MIME.has(contentType);

  if (kind === "session_video") {
    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: "Session media must be mp4/webm/mov or an image still" },
        { status: 400 },
      );
    }
  } else if (!isImage) {
    return NextResponse.json(
      { error: "Photos must be JPEG, PNG, WebP, or GIF" },
      { status: 400 },
    );
  }

  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json(
      {
        error: `File too large (max ${Math.round(maxBytes / (1024 * 1024))}MB)`,
      },
      { status: 400 },
    );
  }

  let guestId: string | null = null;
  let sessionId: string | null = null;

  if (kind === "personal_photo") {
    const parsed = objectIdSchema.safeParse(guestIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "personal_photo requires guestId" }, { status: 400 });
    }
    guestId = parsed.data;
  }

  if (kind === "session_video") {
    const parsed = objectIdSchema.safeParse(sessionIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "session_video requires sessionId" }, { status: 400 });
    }
    sessionId = parsed.data;
  }

  await connectDB();

  const event = await Event.findById(eventId.data);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (guestId) {
    const guest = await Guest.findById(guestId);
    if (!guest || String(guest.eventId) !== String(event._id)) {
      return NextResponse.json({ error: "Guest does not belong to this event" }, { status: 400 });
    }
  }

  if (sessionId) {
    const session = await Session.findById(sessionId);
    if (!session || String(session.eventId) !== String(event._id)) {
      return NextResponse.json(
        { error: "Session does not belong to this event" },
        { status: 400 },
      );
    }
  }

  try {
    const stored = await storeFile(file, `events/${eventId.data}/${kind}`);

    const media = await Media.create({
      eventId: eventId.data,
      kind,
      title: title || file.name,
      filename: file.name,
      contentType: contentType || "application/octet-stream",
      size: file.size,
      storageKey: stored.storageKey,
      storageProvider: stored.storageProvider,
      guestId,
      sessionId,
    });

    return NextResponse.json({
      media: {
        _id: media._id,
        kind: media.kind,
        title: media.title,
        filename: media.filename,
        contentType: media.contentType,
        guestId: media.guestId,
        sessionId: media.sessionId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
