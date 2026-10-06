/** Pure perceptual-hash helpers (no DOM) — safe for server and client. */

export type PhotoQualityHashes = {
  aHash: string;
  dHash: string;
};

export type PhotoQuality = {
  /** Lower = blurrier. Typical sharp phone photo > ~80 on this scale. */
  sharpness: number;
  /** 0–255 mean luminance. */
  brightness: number;
  /** Too dark / bright / soft for live gallery. */
  needsEditing: boolean;
  reasons: string[];
  /** 64-bit average-hash hex (16 chars). */
  aHash: string;
  /** 64-bit difference-hash hex (16 chars) — better for near-duplicate bursts. */
  dHash: string;
};

export function toGray(data: Uint8ClampedArray | Uint8Array, pixelCount: number) {
  const grays = new Array<number>(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    grays[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return grays;
}

/** 8×8 average hash (letterboxed). */
export function averageHashFromImageData(
  data: Uint8ClampedArray | Uint8Array,
  size = 8,
) {
  const grays = toGray(data, size * size);
  const avg = grays.reduce((a, b) => a + b, 0) / grays.length;
  let bits = BigInt(0);
  for (let i = 0; i < grays.length; i++) {
    if (grays[i] >= avg) bits |= BigInt(1) << BigInt(i);
  }
  return bits.toString(16).padStart(16, "0");
}

/**
 * Difference hash: compare each pixel to its right neighbor on a 9×8 grid.
 * Much better than aHash at rejecting unrelated scenes with similar brightness.
 */
export function differenceHashFromImageData(
  data: Uint8ClampedArray | Uint8Array,
  width = 9,
  height = 8,
) {
  const grays = toGray(data, width * height);
  let bits = BigInt(0);
  let bit = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      if (grays[i] < grays[i + 1]) bits |= BigInt(1) << BigInt(bit);
      bit += 1;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingHex64(a: string, b: string) {
  if (a.length !== 16 || b.length !== 16) return 64;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    x &= x - BigInt(1);
    count += 1;
  }
  return count;
}

/**
 * Near-duplicate thresholds (AND both must pass).
 * Tuned for burst / bracket shots — not “same room, different framing”.
 */
export const DUPLICATE_DHASH_MAX = 4;
export const DUPLICATE_AHASH_MAX = 8;

/** @deprecated use isNearDuplicate / DUPLICATE_DHASH_MAX */
export const DUPLICATE_HAMMING_MAX = DUPLICATE_DHASH_MAX;

export function isNearDuplicate(
  a: Pick<PhotoQualityHashes, "aHash" | "dHash">,
  b: Pick<PhotoQualityHashes, "aHash" | "dHash">,
) {
  if (!a.dHash || !b.dHash || a.dHash.length !== 16 || b.dHash.length !== 16) {
    return false;
  }
  if (!a.aHash || !b.aHash || a.aHash.length !== 16 || b.aHash.length !== 16) {
    return false;
  }
  return (
    hammingHex64(a.dHash, b.dHash) <= DUPLICATE_DHASH_MAX &&
    hammingHex64(a.aHash, b.aHash) <= DUPLICATE_AHASH_MAX
  );
}
