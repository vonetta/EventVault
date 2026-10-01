import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import {
  assertSameOrigin,
  isAdminAuthenticated,
  isUploaderAuthenticated,
  unauthorized,
} from "@/lib/auth";
import { Event, Guest, Media } from "@/lib/models";
import { EDITABLE_PHOTO_KINDS, editGuestIdsFrom } from "@/lib/needs-editing";
import { logActivity } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { objectIdSchema } from "@/lib/validate";
import {
  TEAM_ZIP_MAX_BYTES,
  TEAM_ZIP_MAX_FILES,
  createZipDownloadResponse,
  safeZipName,
  uniqueZipPath,
  type ZipStreamEntry,
} from "@/lib/zip-download";

/**
 * ZIP every photo in the Needs editing pile for an event (flag or Edit tag).
 * Admin + uploader. Built for hundreds of stills — capped at 1000 / 500MB.
 */
export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = await isAdminAuthenticated();
  const isUploader = await isUploaderAuthenticated();
  if (!isAdmin && !isUploader) return unauthorized();

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") || "";
  const metaOnly = url.searchParams.get("meta") === "1";
  if (!objectIdSchema.safeParse(eventId).success) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  // Meta checks are cheap; only throttle full ZIP builds.
  if (!metaOnly) {
    const limited = await rateLimit(
      `needs-editing-zip:${eventId}:${clientIp(request)}`,
      8,
      10 * 60_000,
    );
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many ZIP downloads. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        },
      );
    }
  }

  await connectDB();

  const event = await Event.findById(eventId).select("_id name slug").lean();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const guests = await Guest.find({ eventId }).select("_id name").lean();
  const editIds = editGuestIdsFrom(guests);

  const filter =
    editIds.length > 0
      ? {
          eventId,
          kind: { $in: [...EDITABLE_PHOTO_KINDS] },
          $or: [{ needsEditing: true }, { taggedGuestIds: { $in: editIds } }],
        }
      : {
          eventId,
          kind: { $in: [...EDITABLE_PHOTO_KINDS] },
          needsEditing: true,
        };

  const photos = await Media.find(filter).sort({ createdAt: -1 }).lean();

  const used = new Set<string>();
  const entries: ZipStreamEntry[] = [];
  let estimatedBytes = 0;

  for (const photo of photos) {
    if (entries.length >= TEAM_ZIP_MAX_FILES) break;
    if (photo.storageProvider === "youtube" || !photo.storageKey) continue;
    if (photo.storageProvider !== "r2" && photo.storageProvider !== "local") continue;

    const filename = photo.filename || photo.title || `${String(photo._id)}.jpg`;
    const size = typeof photo.size === "number" ? photo.size : 0;
    estimatedBytes += size;
    entries.push({
      path: uniqueZipPath(used, "", filename),
      storageKey: photo.storageKey,
      storageProvider: photo.storageProvider,
      size: photo.size,
    });
  }

  if (!entries.length) {
    return NextResponse.json(
      { error: "No downloadable photos in Needs editing" },
      { status: 404 },
    );
  }

  const eventSlug = safeZipName(event.slug || event.name, "event").replace(/\s+/g, "-");
  const filename = `${eventSlug}-needs-editing.zip`;
  const capped = photos.length > entries.length || estimatedBytes > TEAM_ZIP_MAX_BYTES;

  if (metaOnly) {
    return NextResponse.json({
      photoCount: entries.length,
      estimatedBytes: Math.min(estimatedBytes, TEAM_ZIP_MAX_BYTES),
      filename,
      capped,
      maxFiles: TEAM_ZIP_MAX_FILES,
      maxBytes: TEAM_ZIP_MAX_BYTES,
    });
  }

  await logActivity(request, {
    action: "needs_editing_download",
    actor: isAdmin ? "admin" : "uploader",
    eventId: String(event._id),
    details: {
      summary: `Needs editing ZIP · ${entries.length} photos`,
      meta: {
        photoCount: entries.length,
        pileCount: photos.length,
        estimatedBytes,
        capped,
      },
    },
  });

  return createZipDownloadResponse(entries, filename, {
    maxFiles: TEAM_ZIP_MAX_FILES,
    maxBytes: TEAM_ZIP_MAX_BYTES,
  });
}

export const maxDuration = 300;
