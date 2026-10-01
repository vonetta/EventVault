/** Shared cleanup constants — safe for client + server (no sharp). */

export const CLEANUP_ENGINE = "lighting-sharpen-v2";

/** Per-photo tweak modes — different shots need different help. */
export const CLEANUP_PRESETS = ["auto", "gentle", "dark", "soft"] as const;
export type CleanupPreset = (typeof CLEANUP_PRESETS)[number];

export const CLEANUP_PRESET_LABELS: Record<CleanupPreset, string> = {
  auto: "Auto",
  gentle: "Gentle",
  dark: "Dark lift",
  soft: "Sharpen",
};

export const CLEANUP_PRESET_HINTS: Record<CleanupPreset, string> = {
  auto: "Picks strength from how dark / flat the frame is",
  gentle: "Light touch — when Auto looks too strong",
  dark: "Stronger exposure lift for underexposed shots",
  soft: "Focus on sharpness; light tone only",
};

export function isCleanupPreset(value: unknown): value is CleanupPreset {
  return typeof value === "string" && (CLEANUP_PRESETS as readonly string[]).includes(value);
}

export function cleanupPreviewStorageKey(
  eventId: string,
  mediaId: string,
  preset: CleanupPreset = "auto",
) {
  return `events/${eventId}/cleanup-preview/${mediaId}-${CLEANUP_ENGINE}-${preset}.jpg`;
}
