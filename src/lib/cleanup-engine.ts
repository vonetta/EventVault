/** Shared cleanup constants — safe for client + server (no sharp). */

/** Bump when the adaptive recipe changes so old previews show “Re-run”. */
export const CLEANUP_ENGINE = "lighting-sharpen-v3";

export function cleanupPreviewStorageKey(eventId: string, mediaId: string) {
  return `events/${eventId}/cleanup-preview/${mediaId}-${CLEANUP_ENGINE}.jpg`;
}
