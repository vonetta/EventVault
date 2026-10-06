import { Media } from "@/lib/models";
import { extractTakenAtFromImage } from "@/lib/photo-taken-at";
import { readStoredObject } from "@/lib/storage";

export type BackfillTakenAtResult = {
  scanned: number;
  updated: number;
  skippedAlready: number;
  skippedNoExif: number;
  skippedErrors: number;
  hasMore: boolean;
};

/**
 * Try to recover camera takenAt from stored files for photos that lack it.
 * Note: compressImageForStorage strips EXIF on upload, so many existing R2
 * JPEGs will have no DateTimeOriginal left — those stay skippedNoExif.
 */
export async function backfillTakenAtBatch(
  eventId: string,
  limit = 25,
): Promise<BackfillTakenAtResult> {
  const candidates = await Media.find({
    eventId,
    kind: { $in: ["event_photo", "group_photo", "team_photo", "personal_photo"] },
    contentType: { $regex: /^image\//i },
    storageKey: { $ne: "" },
    storageProvider: { $in: ["r2", "local"] },
    $or: [{ takenAt: null }, { takenAt: { $exists: false } }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();

  let updated = 0;
  let skippedNoExif = 0;
  let skippedErrors = 0;

  for (const media of candidates) {
    try {
      const provider = media.storageProvider as "r2" | "local";
      const { body } = await readStoredObject(media.storageKey, provider);
      const takenAt = await extractTakenAtFromImage(Buffer.from(body));
      if (!takenAt) {
        skippedNoExif += 1;
        continue;
      }
      media.takenAt = takenAt;
      await media.save();
      updated += 1;
    } catch {
      skippedErrors += 1;
    }
  }

  const remaining = await Media.countDocuments({
    eventId,
    kind: { $in: ["event_photo", "group_photo", "team_photo", "personal_photo"] },
    contentType: { $regex: /^image\//i },
    storageKey: { $ne: "" },
    $or: [{ takenAt: null }, { takenAt: { $exists: false } }],
  });

  return {
    scanned: candidates.length,
    updated,
    skippedAlready: 0,
    skippedNoExif,
    skippedErrors,
    hasMore: remaining > 0 && candidates.length > 0,
  };
}
