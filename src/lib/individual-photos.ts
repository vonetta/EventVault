import mongoose from "mongoose";
import { Media, type MediaDoc } from "@/lib/models";

/**
 * Individual (paid) photos for a guest:
 *   - admin-assigned personal_photo records
 *   - any ready photo that tags this guest (one shared file, no duplicates)
 *
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
      { taggedGuestIds: guestId },
    ],
  };
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
