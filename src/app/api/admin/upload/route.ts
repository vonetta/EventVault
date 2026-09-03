import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { isAdminAuthenticated, unauthorized, assertSameOrigin } from "@/lib/auth";
import { Event, Guest, Media, Session } from "@/lib/models";
import { logAdminAction } from "@/lib/audit";
import { storeFile } from "@/lib/storage";
import { assertFileMatchesMime } from "@/lib/file-sniff";
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

  const vercelLimit = 4.5 * 1024 * 1024;
  if (file.size <= 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (process.env.VERCEL && file.size > vercelLimit) {
    return NextResponse.json(
      {
        error:
          "This file is too large for direct upload on Vercel (max ~4.5MB). Resize or compress the photo, then try again.",
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB)` },
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
  const bytes = Buffer.from(await file.arrayBuffer());

  let verifiedMime: string;
  try {
    verifiedMime = assertFileMatchesMime(bytes, contentType);
  } catch {
    return NextResponse.json(
      { error: "File content does not match a supported photo or video type" },
      { status: 400 },
    );
  }

  const isImage = IMAGE_MIME.has(verifiedMime);
  const isVideo = VIDEO_MIME.has(verifiedMime);

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
  if (file.size > maxBytes) {
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
    const stored = await storeFile(
      new File([bytes], file.name, { type: verifiedMime }),
      `events/${eventId.data}/${kind}`,
    );

    const media = await Media.create({
      eventId: eventId.data,
      kind,
      title: title || file.name,
      filename: file.name,
      contentType: verifiedMime || "application/octet-stream",
      size: file.size,
      storageKey: stored.storageKey,
      storageProvider: stored.storageProvider,
      guestId,
      sessionId,
    });

    await logAdminAction(request, "upload_media", {
      kind: media.kind,
      title: media.title,
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
    if (message.includes("R2 must be configured")) {
      return NextResponse.json(
        {
          error:
            "Photo storage is not configured. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in Vercel, then redeploy.",
        },
        { status: 500 },
      );
    }
    if (/Access\s*Denied|InvalidAccessKeyId|SignatureDoesNotMatch|NoSuchBucket/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Cloudflare R2 rejected the upload. Double-check your four R2 env vars in Vercel (Account ID, keys, bucket name) and redeploy.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Upload failed" : message },
      { status: 500 },
    );
  }
}
