/** Pure face-descriptor matching helpers (safe for client + server). */

export type FaceDescriptor = number[];

export type FaceLabeledProfile = {
  guestId: string;
  name: string;
  descriptors: FaceDescriptor[];
};

/** Euclidean distance between two 128-d face-api descriptors. */
export function descriptorDistance(a: FaceDescriptor, b: FaceDescriptor) {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Match a face against known profiles.
 * face-api's usual threshold is ~0.6; lower = stricter.
 */
export function matchFace(
  descriptor: FaceDescriptor,
  profiles: FaceLabeledProfile[],
  threshold = 0.55,
): { guestId: string; name: string; distance: number } | null {
  let best: { guestId: string; name: string; distance: number } | null = null;
  for (const profile of profiles) {
    for (const sample of profile.descriptors) {
      const distance = descriptorDistance(descriptor, sample);
      if (distance > threshold) continue;
      if (!best || distance < best.distance) {
        best = { guestId: profile.guestId, name: profile.name, distance };
      }
    }
  }
  return best;
}

export function isValidDescriptor(value: unknown): value is FaceDescriptor {
  return (
    Array.isArray(value) &&
    value.length === 128 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}
