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
