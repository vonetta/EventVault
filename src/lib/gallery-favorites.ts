const STORAGE_PREFIX = "eventvault:favorites:";

function storageKey(eventId: string) {
  return `${STORAGE_PREFIX}${eventId}`;
}

export function readFavoriteIds(eventId: string): string[] {
  if (typeof window === "undefined" || !eventId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeFavoriteIds(eventId: string, ids: string[]) {
  if (typeof window === "undefined" || !eventId) return;
  const unique = [...new Set(ids.map(String))];
  window.localStorage.setItem(storageKey(eventId), JSON.stringify(unique));
}

export function toggleFavoriteId(eventId: string, mediaId: string): string[] {
  const current = readFavoriteIds(eventId);
  const next = current.includes(mediaId)
    ? current.filter((id) => id !== mediaId)
    : [...current, mediaId];
  writeFavoriteIds(eventId, next);
  return next;
}

export function enteredWeekendKey(eventId: string) {
  return `eventvault:entered:${eventId}`;
}

export function hasEnteredWeekend(eventId: string) {
  if (typeof window === "undefined" || !eventId) return true;
  return window.sessionStorage.getItem(enteredWeekendKey(eventId)) === "1";
}

export function markEnteredWeekend(eventId: string) {
  if (typeof window === "undefined" || !eventId) return;
  window.sessionStorage.setItem(enteredWeekendKey(eventId), "1");
}
