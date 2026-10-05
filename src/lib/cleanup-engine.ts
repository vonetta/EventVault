/** Shared cleanup constants — safe for client + server (no sharp / no secrets). */

/** Generative OpenAI image-edit pass (ChatGPT-class). */
export const CLEANUP_ENGINE_AI = "ai-edit-v2";

/** Local sharp tone/sharpen fallback when OPENAI_API_KEY is unset. */
export const CLEANUP_ENGINE_LOCAL = "lighting-sharpen-v3";

/**
 * Preferred engine id for “current preview” checks on the client.
 * Server may still choose AI vs local at generate time; pass the live value
 * from the media API (`cleanup.preferredEngine`) into the panel.
 */
export const CLEANUP_ENGINE = CLEANUP_ENGINE_AI;

export function cleanupPreviewStorageKey(eventId: string, mediaId: string, engine: string) {
  return `events/${eventId}/cleanup-preview/${mediaId}-${engine}.jpg`;
}
