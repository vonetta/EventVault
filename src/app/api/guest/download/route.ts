import { NextResponse } from "next/server";
import { ZipArchive } from "archiver";
import { PassThrough } from "node:stream";
import { Readable } from "node:stream";
import { connectDB } from "@/lib/db";
import { unauthorized, assertSameOrigin } from "@/lib/auth";
import { Event, Media, type MediaDoc } from "@/lib/models";
import { readStoredObject } from "@/lib/storage";
import { resolveGuestSession } from "@/lib/guest-session";
import { isMediaAvailable } from "@/lib/youtube";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_ZIP_FILES = 300;
const MAX_ZIP_BYTES = 150 * 1024 * 1024;

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

type ZipEntry = {
  path: string;
  media: MediaDoc;
};

async function collectZipEntries(
  photos: MediaDoc[],
  folder: string,
  used: Set<string>,
  entries: ZipEntry[],
) {
  for (const photo of photos) {
    if (entries.length >= MAX_ZIP_FILES) break;
    if (!isMediaAvailable(photo.availableUntil)) continue;
    if (photo.storageProvider === "youtube" || !photo.storageKey) continue;
    if (photo.storageProvider !== "r2" && photo.storageProvider !== "local") continue;

    const filename = photo.filename || photo.title || `${String(photo._id)}.jpg`;
    entries.push({
      path: uniqueZipPath(used, folder, filename),
      media: photo,
    });
  }
}

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolved = await resolveGuestSession();
  if (!resolved) return unauthorized("Enter a valid ticket code");

  const { guest } = resolved;

  const limited = await rateLimit(
    `guest-download:${guest._id}:${clientIp(request)}`,
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

  const used = new Set<string>();
  const entries: ZipEntry[] = [];
  await collectZipEntries(groupPhotos, "group-gallery", used, entries);
  await collectZipEntries(personalPhotos, "personal", used, entries);

  if (!entries.length) {
    return NextResponse.json(
      { error: "No downloadable photos are available yet" },
      { status: 404 },
    );
  }

  const eventSlug = safeName(event.slug || event.name, "event").replace(/\s+/g, "-");
  const guestSlug = safeName(guest.name, "guest").replace(/\s+/g, "-");
  const filename = `${eventSlug}-${guestSlug}-photos.zip`;

  const pass = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(pass);

  void (async () => {
    try {
      let totalBytes = 0;
      let added = 0;

      for (const entry of entries) {
        if (totalBytes >= MAX_ZIP_BYTES) break;

        try {
          const { body } = await readStoredObject(
            entry.media.storageKey,
            entry.media.storageProvider as "r2" | "local",
          );
          const buffer = Buffer.from(body);
          totalBytes += buffer.length;
          if (totalBytes > MAX_ZIP_BYTES) break;
          archive.append(buffer, { name: entry.path });
          added += 1;
        } catch {
          // Skip missing files
        }
      }

      if (added === 0) {
        archive.abort();
        pass.destroy(new Error("No photos could be packed"));
        return;
      }

      await archive.finalize();
    } catch (error) {
      archive.abort();
      pass.destroy(error instanceof Error ? error : undefined);
    }
  })();

  return new Response(Readable.toWeb(pass) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const maxDuration = 60;
