/** Shared engine id — safe for client + server (no sharp). */
export const CLEANUP_ENGINE = "lighting-sharpen-v2";

export function cleanupPreviewStorageKey(eventId: string, mediaId: string) {
  return `events/${eventId}/cleanup-preview/${mediaId}-${CLEANUP_ENGINE}.jpg`;
}
