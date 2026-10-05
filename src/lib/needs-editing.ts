/**
 * Fields that put a still into the Admin / Upload "Needs editing" pile
 * via the explicit needsEditing flag (quality rejects, Move to Needs editing).
 * Always unpublished team_photo so the photo matches both UIs' queries.
 */
export function needsEditingPileSet() {
  return {
    kind: "team_photo" as const,
    needsEditing: true,
    published: false,
    everyone: false,
    groupIds: [] as [],
  };
}

/** Photo kinds that can be pulled into / shown in Needs editing. */
export const EDITABLE_PHOTO_KINDS = [
  "team_photo",
  "event_photo",
  "group_photo",
] as const;

export type EditablePhotoKind = (typeof EDITABLE_PHOTO_KINDS)[number];

export function isEditablePhotoKind(kind: string): kind is EditablePhotoKind {
  return (EDITABLE_PHOTO_KINDS as readonly string[]).includes(kind);
}

/**
 * Workflow person-tag: a guest named "Edit" parks the photo under Needs editing
 * in the UI. The tag stays on the photo (so you can see why it’s there) and can
 * be removed to return it to Main gallery. Matched case-insensitively.
 */
export function isEditTagName(name: string) {
  return name.trim().toLowerCase() === "edit";
}

/**
 * Fields that return a still to the Main (ready) gallery after Edit is removed
 * or Mark ready. Keeps it as an unpublished team_photo.
 */
export function clearNeedsEditingPileSet() {
  return {
    kind: "team_photo" as const,
    needsEditing: false,
    published: false,
    everyone: false,
    groupIds: [] as [],
  };
}

export function editGuestIdsFrom(
  guests: { _id: { toString(): string }; name?: string | null }[],
): string[] {
  return guests
    .filter((guest) => isEditTagName(guest.name || ""))
    .map((guest) => String(guest._id));
}

export function mediaHasEditTag(
  taggedGuestIds: { toString(): string }[] | string[] | null | undefined,
  editGuestIds: Iterable<string>,
) {
  if (!taggedGuestIds?.length) return false;
  const editSet = editGuestIds instanceof Set ? editGuestIds : new Set(editGuestIds);
  if (!editSet.size) return false;
  return taggedGuestIds.some((id) => editSet.has(String(id)));
}

/** True when the photo should appear under Needs editing (flag or Edit tag). */
export function showsInNeedsEditing(
  media: { needsEditing?: boolean | null; taggedGuestIds?: { toString(): string }[] | null },
  editGuestIds: Iterable<string>,
) {
  return Boolean(media.needsEditing) || mediaHasEditTag(media.taggedGuestIds, editGuestIds);
}
