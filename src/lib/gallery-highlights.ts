import {
  hammingHex64,
  isNearDuplicate,
  type PhotoQuality,
} from "@/lib/photo-quality-core";

export type HighlightCandidate = {
  id: string;
  sharpness: number;
  brightness: number;
  aHash: string;
  dHash: string;
  /** Soft/dark/blown — excluded from highlights. */
  needsEditing: boolean;
};

export type PickHighlightsOptions = {
  /** Soft floor (default 20). */
  minCount?: number;
  /** Soft ceiling (default 40). */
  maxCount?: number;
  /** Prefer frames at least this far apart in dHash space (default 8). */
  minDiversity?: number;
};

/**
 * Target highlight count from gallery size: ~4% of moments, clamped 20–40.
 * Tiny albums just return everything that's usable.
 */
export function targetHighlightCount(
  usableCount: number,
  minCount = 20,
  maxCount = 40,
): number {
  if (usableCount <= 0) return 0;
  if (usableCount <= minCount) return usableCount;
  const roughly = Math.round(usableCount * 0.04);
  return Math.max(minCount, Math.min(maxCount, roughly));
}

function brightnessScore(brightness: number): number {
  // Prefer mid tones; punish crushed blacks / blown whites.
  if (brightness < 35 || brightness > 230) return 0.15;
  if (brightness < 50 || brightness > 210) return 0.55;
  if (brightness >= 70 && brightness <= 180) return 1;
  return 0.85;
}

function qualityScore(item: HighlightCandidate): number {
  return item.sharpness * brightnessScore(item.brightness);
}

/**
 * Collapse near-duplicate bursts — keep the sharpest frame per cluster.
 */
export function collapseNearDuplicates(
  items: HighlightCandidate[],
): HighlightCandidate[] {
  const withHash = items.filter(
    (item) => item.aHash.length === 16 && item.dHash.length === 16,
  );
  const noHash = items.filter(
    (item) => item.aHash.length !== 16 || item.dHash.length !== 16,
  );
  const used = new Set<string>();
  const kept: HighlightCandidate[] = [];

  for (let i = 0; i < withHash.length; i++) {
    const seed = withHash[i];
    if (used.has(seed.id)) continue;
    const members = [seed];
    used.add(seed.id);
    for (let j = i + 1; j < withHash.length; j++) {
      const other = withHash[j];
      if (used.has(other.id)) continue;
      if (isNearDuplicate(seed, other)) {
        members.push(other);
        used.add(other.id);
      }
    }
    kept.push(
      members.reduce((best, item) =>
        item.sharpness > best.sharpness ? item : best,
      ),
    );
  }

  return [...kept, ...noHash];
}

/**
 * Pick the strongest, most diverse shots for a Weekend Highlights reel.
 * Pure function — feed it quality metrics from client or server analysis.
 */
export function pickHighlights(
  candidates: HighlightCandidate[],
  options: PickHighlightsOptions = {},
): string[] {
  const minCount = options.minCount ?? 20;
  const maxCount = options.maxCount ?? 40;
  const minDiversity = options.minDiversity ?? 8;

  const usable = candidates.filter(
    (item) =>
      !item.needsEditing &&
      item.sharpness > 0 &&
      Number.isFinite(item.sharpness),
  );
  if (!usable.length) return [];

  const moments = collapseNearDuplicates(usable).sort(
    (a, b) => qualityScore(b) - qualityScore(a),
  );
  const target = targetHighlightCount(moments.length, minCount, maxCount);
  if (target <= 0) return [];

  const picked: HighlightCandidate[] = [];
  const seedCount = Math.min(8, target);

  for (const candidate of moments) {
    if (picked.length >= target) break;
    // Seed with the top-scoring frames, then require visual diversity.
    if (picked.length < seedCount) {
      picked.push(candidate);
      continue;
    }
    const diverseEnough = picked.every((existing) => {
      if (!candidate.dHash || !existing.dHash) return true;
      return hammingHex64(candidate.dHash, existing.dHash) >= minDiversity;
    });
    if (diverseEnough) picked.push(candidate);
  }

  // If diversity was too strict, top up with next-best remaining.
  if (picked.length < target) {
    const pickedIds = new Set(picked.map((item) => item.id));
    for (const candidate of moments) {
      if (picked.length >= target) break;
      if (pickedIds.has(candidate.id)) continue;
      picked.push(candidate);
      pickedIds.add(candidate.id);
    }
  }

  return picked.map((item) => item.id);
}

/** Map a PhotoQuality-like result onto a highlight candidate. */
export function candidateFromQuality(
  id: string,
  quality: Pick<
    PhotoQuality,
    "sharpness" | "brightness" | "aHash" | "dHash" | "needsEditing"
  >,
): HighlightCandidate {
  return {
    id,
    sharpness: quality.sharpness,
    brightness: quality.brightness,
    aHash: quality.aHash,
    dHash: quality.dHash,
    needsEditing: quality.needsEditing,
  };
}
