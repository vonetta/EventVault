import mongoose from "mongoose";
import { Guest, Media } from "@/lib/models";
import { EDITABLE_PHOTO_KINDS, isEditTagName } from "@/lib/needs-editing";

/**
 * PR #21 stripped the person-tag "Edit" and flipped needsEditing on those
 * photos. Put the Edit tag back so labels like "Dr. Gloria Wilson, Edit"
 * return without anyone re-tagging. Idempotent.
 *
 * Keeps needsEditing as-is so nothing jumps piles mid-restore; the Edit tag
 * is what the UI uses going forward once they Mark ready / tidy rejects.
 */
export async function restoreStrippedEditTags(
  eventId: mongoose.Types.ObjectId | string,
): Promise<number> {
  const guests = await Guest.find({ eventId }).select("_id name").lean();
  const editGuest = guests.find((guest) => isEditTagName(guest.name || ""));
  if (!editGuest) return 0;

  const editId = String(editGuest._id);

  // Photos parked in Needs editing that no longer carry the Edit tag.
  const candidates = await Media.find({
    eventId,
    kind: { $in: [...EDITABLE_PHOTO_KINDS] },
    needsEditing: true,
    taggedGuestIds: { $nin: [editGuest._id] },
  });

  let restored = 0;
  for (const media of candidates) {
    const ids = (media.taggedGuestIds || []).map((id) => String(id));
    if (ids.includes(editId)) continue;
    media.taggedGuestIds = [...(media.taggedGuestIds || []), editGuest._id];
    await media.save();
    restored += 1;
  }
  return restored;
}
