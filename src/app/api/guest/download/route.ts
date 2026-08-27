import { NextResponse } from "next/server";
import JSZip from "jszip";
import { connectDB } from "@/lib/db";
import {
  getGuestSession,
  clearGuestSession,
  unauthorized,
  assertSameOrigin,
} from "@/lib/auth";
import { Event, Guest, Media, type MediaDoc } from "@/lib/models";
import { readStoredObject } from "@/lib/storage";
import { isMediaAvailable } from "@/lib/youtube";
import { clientIp, rateLimit } from "@/lib/rate-limit";

function safeName(input: string, fallback: string) {
  const cleaned = input
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

function uniqueZipPath(used: Set<string>, folder: string, filename: string) {
  let base = safeName(filename, "photo.jpg");
  if (!pathHasExt(base)) base = `${base}.jpg`;
  let candidate = `${folder}/${base}`;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
    const stem = ext ? base.slice(0, -ext.length) : base;
    candidate = `${folder}/${stem}-${n}${ext}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function pathHasExt(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1;
}

async function addPhotoToZip(
  zip: JSZip,
  used: Set<string>,
  folder: string,
  media: MediaDoc,
) {
  if (media.storageProvider === "youtube") return false;
  if (!media.storageKey) return false;
  if (media.storageProvider !== "r2" && media.storageProvider !== "local") {
    return false;
  }

  const { body } = await readStoredObject(media.storageKey, media.storageProvider);
  const filename = media.filename || media.title || `${String(media._id)}.jpg`;
  const entry = uniqueZipPath(used, folder, filename);
  zip.file(entry, body);
  return true;
}

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getGuestSession();
  if (!session) return unauthorized("Enter a valid ticket code");

  const limited = rateLimit(
    `guest-download:${session.guestId}:${clientIp(request)}`,
    5,
    10 * 60_000,
  );
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many downloads. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

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

  const groupPhotos = await Media.find({
    eventId: guest.eventId,
    kind: "group_photo",
  }).sort({ createdAt: -1 });

  const personalPhotos =
    guest.tier === "vip"
      ? await Media.find({
          eventId: guest.eventId,
          kind: "personal_photo",
          guestId: guest._id,
        }).sort({ createdAt: -1 })
      : [];

  const zip = new JSZip();
  const used = new Set<string>();
  let added = 0;

  for (const photo of groupPhotos) {
    if (!isMediaAvailable(photo.availableUntil)) continue;
    try {
      if (await addPhotoToZip(zip, used, "group-gallery", photo)) added += 1;
    } catch {
      // Skip missing files; continue packing the rest
    }
  }

  for (const photo of personalPhotos) {
    if (!isMediaAvailable(photo.availableUntil)) continue;
    try {
      if (await addPhotoToZip(zip, used, "personal", photo)) added += 1;
    } catch {
      // Skip missing files; continue packing the rest
    }
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "No downloadable photos are available yet" },
      { status: 404 },
    );
  }

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const eventSlug = safeName(event.slug || event.name, "event").replace(/\s+/g, "-");
  const guestSlug = safeName(guest.name, "guest").replace(/\s+/g, "-");
  const filename = `${eventSlug}-${guestSlug}-photos.zip`;

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
