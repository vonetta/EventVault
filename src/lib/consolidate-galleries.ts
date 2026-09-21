import path from "path";
import { randomUUID } from "crypto";
import { Media, type MediaDoc } from "@/lib/models";
import { compressImageForStorage } from "@/lib/compress-image";
import {
  deleteStoredObject,
  readStoredObject,
  storeBytes,
} from "@/lib/storage";

export type ConsolidateGalleriesResult = {
  groupPhotosMoved: number;
  teamPhotosMoved: number;
};

/**
 * Fold the old group / shared team album into the whole-event album.
 * Keeps face tags. Leaves staged / needs-editing team photos alone.
 */
export async function consolidateGroupIntoEvent(
  eventId: string,
): Promise<ConsolidateGalleriesResult> {
  const groupResult = await Media.updateMany(
    { eventId, kind: "group_photo" },
    {
      $set: {
        kind: "event_photo",
        published: true,
        everyone: true,
        groupIds: [],
      },
    },
  );

  const teamResult = await Media.updateMany(
    {
      eventId,
      kind: "team_photo",
      published: true,
      needsEditing: { $ne: true },
    },
    {
      $set: {
        kind: "event_photo",
        published: true,
        everyone: true,
        groupIds: [],
      },
    },
  );

  return {
    groupPhotosMoved: groupResult.modifiedCount || 0,
    teamPhotosMoved: teamResult.modifiedCount || 0,
  };
}

export type RecompressBatchResult = {
  scanned: number;
  recompressed: number;
  skipped: number;
  bytesSaved: number;
  hasMore: boolean;
};

/**
 * Re-encode the largest stored stills for an event. Run repeatedly until hasMore is false.
 */
export async function recompressEventPhotosBatch(
  eventId: string,
  limit = 20,
): Promise<RecompressBatchResult> {
  const candidates = await Media.find({
    eventId,
    storageProvider: { $in: ["r2", "local"] },
    storageKey: { $ne: "" },
    contentType: { $regex: /^image\//i },
    kind: { $in: ["event_photo", "group_photo", "personal_photo", "team_photo"] },
  })
    .sort({ size: -1 })
    .limit(limit + 5)
    .exec();

  let scanned = 0;
  let recompressed = 0;
  let skipped = 0;
  let bytesSaved = 0;

  for (const media of candidates) {
    if (recompressed >= limit) break;
    scanned += 1;
    const saved = await recompressOneMedia(media);
    if (saved == null) {
      skipped += 1;
      continue;
    }
    recompressed += 1;
    bytesSaved += saved;
  }

  const remaining = await Media.countDocuments({
    eventId,
    storageProvider: { $in: ["r2", "local"] },
    storageKey: { $ne: "" },
    contentType: { $regex: /^image\//i },
    kind: { $in: ["event_photo", "group_photo", "personal_photo", "team_photo"] },
    // Heuristic: still worth another pass if any file is larger than ~400KB
    size: { $gt: 400_000 },
  });

  return {
    scanned,
    recompressed,
    skipped,
    bytesSaved,
    hasMore: remaining > 0 && recompressed > 0,
  };
}

async function recompressOneMedia(media: MediaDoc): Promise<number | null> {
  const provider = media.storageProvider as "r2" | "local";
  if (provider !== "r2" && provider !== "local") return null;
  if (!media.storageKey) return null;

  const mime = (media.contentType || "").toLowerCase();
  if (mime === "image/gif") return null;

  try {
    const { body } = await readStoredObject(media.storageKey, provider);
    const input = Buffer.from(body);
    const before = input.length;
    // Skip already-small files — not worth the rewrite cost.
    if (before < 350_000) return null;

    const compressed = await compressImageForStorage(input, mime || "image/jpeg");
    if (!compressed) return null;
    if (compressed.buffer.length >= before * 0.95) return null;

    const folder = path.posix.dirname(media.storageKey) || `events/${String(media.eventId)}/recompress`;
    const base = (media.filename || "photo").replace(/\.[^.]+$/, "") || "photo";
    const stored = await storeBytes(
      compressed.buffer,
      folder,
      `${base}${compressed.extension}`,
      compressed.contentType,
    );

    const oldKey = media.storageKey;
    const oldProvider = provider;
    const nextFilename =
      media.filename && !media.filename.toLowerCase().endsWith(".gif")
        ? `${base}.jpg`
        : media.filename;

    await Media.updateOne(
      { _id: media._id },
      {
        $set: {
          storageKey: stored.storageKey,
          storageProvider: stored.storageProvider,
          contentType: compressed.contentType,
          size: compressed.buffer.length,
          ...(nextFilename ? { filename: nextFilename } : {}),
        },
      },
    );

    if (oldKey && oldKey !== stored.storageKey) {
      try {
        await deleteStoredObject(oldKey, oldProvider);
      } catch {
        // Old object cleanup is best-effort
      }
    }

    return before - compressed.buffer.length;
  } catch {
    return null;
  }
}

/** @internal test helper */
export function newStorageKey(folder: string, extension: string) {
  return `${folder}/${randomUUID()}${extension}`;
}
