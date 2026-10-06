import { isNearDuplicate } from "@/lib/photo-quality-core";

export type BurstCollapseInput = {
  id: string;
  aHash?: string | null;
  dHash?: string | null;
  sharpness?: number | null;
};

export type BurstCollapseResult<T extends BurstCollapseInput> = T & {
  burstCount: number;
  /** Ids in this burst including the representative. */
  burstIds: string[];
};

/**
 * Collapse near-duplicate bursts to the sharpest frame.
 * Photos without hashes pass through unchanged (burstCount 1).
 */
export function collapseBurstMoments<T extends BurstCollapseInput>(
  items: T[],
): BurstCollapseResult<T>[] {
  const withHash = items.filter(
    (item) =>
      (item.aHash || "").length === 16 && (item.dHash || "").length === 16,
  );
  const noHash = items.filter(
    (item) =>
      (item.aHash || "").length !== 16 || (item.dHash || "").length !== 16,
  );

  const used = new Set<string>();
  const out: BurstCollapseResult<T>[] = [];

  for (let i = 0; i < withHash.length; i++) {
    const seed = withHash[i];
    if (used.has(seed.id)) continue;
    const members = [seed];
    used.add(seed.id);
    for (let j = i + 1; j < withHash.length; j++) {
      const other = withHash[j];
      if (used.has(other.id)) continue;
      if (
        isNearDuplicate(
          { aHash: seed.aHash || "", dHash: seed.dHash || "" },
          { aHash: other.aHash || "", dHash: other.dHash || "" },
        )
      ) {
        members.push(other);
        used.add(other.id);
      }
    }
    const keep = members.reduce((best, item) =>
      (item.sharpness || 0) > (best.sharpness || 0) ? item : best,
    );
    out.push({
      ...keep,
      burstCount: members.length,
      burstIds: members.map((m) => m.id),
    });
  }

  for (const item of noHash) {
    out.push({ ...item, burstCount: 1, burstIds: [item.id] });
  }

  return out;
}
