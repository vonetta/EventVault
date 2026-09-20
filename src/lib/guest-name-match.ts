/** Collapse whitespace and trim for display / dedupe checks. */
export function normalizeGuestName(input: string) {
  return input.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function foldGuestName(input: string) {
  return normalizeGuestName(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Tiny Levenshtein for “did you mean…?” suggestions (names are short). */
function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let corner = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const nextCorner = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, corner + cost);
      corner = nextCorner;
    }
  }
  return prev[b.length];
}

export type NameOnlyGuest = { _id: string; name: string };

/**
 * Suggest existing guests when the typed name is close (typos / spacing).
 * Helps the photo team reuse names without a full roster up front.
 */
export function suggestSimilarGuests(
  guests: NameOnlyGuest[],
  query: string,
  limit = 5,
): NameOnlyGuest[] {
  const folded = foldGuestName(query);
  if (!folded || folded.length < 2) return [];

  const scored = guests
    .map((guest) => {
      const name = foldGuestName(guest.name);
      let score = editDistance(folded, name);
      if (name.startsWith(folded) || folded.startsWith(name)) score = Math.min(score, 1);
      if (name.includes(folded) || folded.includes(name)) score = Math.min(score, 2);
      return { guest, score };
    })
    .filter(({ score, guest }) => {
      const name = foldGuestName(guest.name);
      const max = Math.max(2, Math.floor(Math.max(folded.length, name.length) / 3));
      return score <= max;
    })
    .sort((a, b) => a.score - b.score || a.guest.name.localeCompare(b.guest.name));

  const seen = new Set<string>();
  const out: NameOnlyGuest[] = [];
  for (const { guest } of scored) {
    if (seen.has(guest._id)) continue;
    seen.add(guest._id);
    out.push(guest);
    if (out.length >= limit) break;
  }
  return out;
}
