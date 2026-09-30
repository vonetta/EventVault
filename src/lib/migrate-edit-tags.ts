import mongoose from "mongoose";
import { Guest, Media } from "@/lib/models";
import {
  EDITABLE_PHOTO_KINDS,
  isEditTagName,
  needsEditingPileSet,
} from "@/lib/needs-editing";

/**
 * Photos tagged with a guest named "Edit" belong in Needs editing, not Main
 * gallery. Convert that workflow tag into the needsEditing flag and strip it
 * from person tags so it no longer shows as a name under the photo.
 */
export async function migrateEditTaggedPhotos(
  eventId: mongoose.Types.ObjectId | string,
): Promise<number> {
  const editGuests = await Guest.find({ eventId }).select("_id name").lean();
  const editIds = editGuests
    .filter((guest) => isEditTagName(guest.name || ""))
    .map((guest) => guest._id);
  if (!editIds.length) return 0;

  const tagged = await Media.find({
    eventId,
    kind: { $in: [...EDITABLE_PHOTO_KINDS] },
    taggedGuestIds: { $in: editIds },
  });

  let moved = 0;
  for (const media of tagged) {
    const before = (media.taggedGuestIds || []).map((id) => String(id));
    const editIdSet = new Set(editIds.map((id) => String(id)));
    media.taggedGuestIds = (media.taggedGuestIds || []).filter(
      (id) => !editIdSet.has(String(id)),
    );
    Object.assign(media, needsEditingPileSet());
    await media.save();
    if (before.some((id) => editIdSet.has(id))) moved += 1;
  }
  return moved;
}
