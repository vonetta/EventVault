import mongoose from "mongoose";
import { Media, type MediaDoc } from "@/lib/models";

/**
 * Photos of you should feel personal (solo / couple), not a crowd shot where
 * someone happens to be tagged. 3+ tagged people = group photo → Whole event.
 * Aligns with Group-photo AI (3+ faces → publish free for everyone).
 */
export const PERSONAL_MAX_TAGGED = 2;

/**
 * Individual (paid, watermarked-until-unlock) photos for a guest:
 *   - admin-assigned personal_photo records
 *   - ready photos that tag this guest with at most PERSONAL_MAX_TAGGED people
 *
 * Large group / crowd tags stay in the free Whole event album instead.
 * Photos flagged needsEditing stay out of the guest vault.
 */
export function individualPhotoQuery(
  eventId: mongoose.Types.ObjectId | string,
  guestId: mongoose.Types.ObjectId | string,
) {
  return {
    eventId,
    needsEditing: { $ne: true },
    $or: [
      { kind: "personal_photo" as const, guestId },
      {
        taggedGuestIds: guestId,
        $expr: {
          $lte: [{ $size: { $ifNull: ["$taggedGuestIds", []] } }, PERSONAL_MAX_TAGGED],
        },
      },
    ],
  };
}

/** True when this media belongs in the guest’s paid Photos of you set. */
export function isPersonalizedForGuest(
  media: Pick<MediaDoc, "kind" | "guestId" | "taggedGuestIds" | "needsEditing">,
  guestId: string,
): boolean {
  if (media.needsEditing) return false;
  if (media.kind === "personal_photo" && String(media.guestId) === guestId) return true;
  const tags = media.taggedGuestIds || [];
  if (tags.length === 0 || tags.length > PERSONAL_MAX_TAGGED) return false;
  return tags.some((id) => String(id) === guestId);
}

export async function findIndividualPhotos(
  eventId: mongoose.Types.ObjectId | string,
  guestId: mongoose.Types.ObjectId | string,
): Promise<MediaDoc[]> {
  return Media.find(individualPhotoQuery(eventId, guestId)).sort({ createdAt: -1 });
}

export async function countIndividualPhotos(
  eventId: mongoose.Types.ObjectId | string,
  guestId: mongoose.Types.ObjectId | string,
): Promise<number> {
  return Media.countDocuments(individualPhotoQuery(eventId, guestId));
}

export function mediaTagsGuest(
  media: Pick<MediaDoc, "kind" | "guestId" | "taggedGuestIds">,
  guestId: string,
): boolean {
  if (media.kind === "personal_photo" && String(media.guestId) === guestId) return true;
  return (media.taggedGuestIds || []).some((id) => String(id) === guestId);
}
