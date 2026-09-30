/**
 * Fields that put a still into the Admin / Upload "Needs editing" pile.
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
 * Workflow tag: a guest named "Edit" means “send this photo to Needs editing”,
 * not a real person. Matched case-insensitively.
 */
export function isEditTagName(name: string) {
  return name.trim().toLowerCase() === "edit";
}

export function partitionEditTagGuests<T extends { _id: { toString(): string }; name?: string | null }>(
  guests: T[],
) {
  const editGuests: T[] = [];
  const personGuests: T[] = [];
  for (const guest of guests) {
    if (isEditTagName(guest.name || "")) editGuests.push(guest);
    else personGuests.push(guest);
  }
  return { editGuests, personGuests };
}
