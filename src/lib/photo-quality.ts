"use client";

/** Lightweight client-side photo helpers for bulk galleries (1000+ shots). */

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

function loadImage(fileOrUrl: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    if (typeof fileOrUrl === "string") {
      img.crossOrigin = "anonymous";
      img.src = fileOrUrl;
    } else {
      img.src = URL.createObjectURL(fileOrUrl);
    }
  });
}

/**
 * Draw the image into a canvas letterboxed (not stretched) so hashes keep
 * composition. Mid-gray padding avoids black/white bias.
 */
function sampleLetterboxed(img: HTMLImageElement, width: number, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const x = Math.floor((width - w) / 2);
  const y = Math.floor((height - h) / 2);
  ctx.drawImage(img, x, y, w, h);
  return { canvas, ctx, data: ctx.getImageData(0, 0, width, height).data };
}

function toGray(data: Uint8ClampedArray, pixelCount: number) {
  const grays = new Array<number>(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    grays[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return grays;
}

/** 8×8 average hash (letterboxed). */
export function averageHashFromImageData(data: Uint8ClampedArray, size = 8) {
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
export function differenceHashFromImageData(data: Uint8ClampedArray, width = 9, height = 8) {
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
  a: Pick<PhotoQuality, "aHash" | "dHash">,
  b: Pick<PhotoQuality, "aHash" | "dHash">,
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

/**
 * Quick quality pass: blur + exposure heuristics.
 * Designed to run in the browser during bulk assist — not perfect, but catches
 * the obvious soft / black / blown frames that should stay out of live view.
 */
export async function analyzePhotoQuality(source: File | string): Promise<PhotoQuality> {
  const img = await loadImage(source);
  try {
    // Letterboxed 8×8 for aHash + brightness
    const small = sampleLetterboxed(img, 8, 8);
    const aHash = averageHashFromImageData(small.data, 8);

    let brightnessSum = 0;
    for (let i = 0; i < 64; i++) {
      const o = i * 4;
      brightnessSum += 0.299 * small.data[o] + 0.587 * small.data[o + 1] + 0.114 * small.data[o + 2];
    }
    const brightness = brightnessSum / 64;

    // Classic dHash grid: 9×8 letterboxed (not stretched, not cropped from square)
    const dSample = sampleLetterboxed(img, 9, 8);
    const dHash = differenceHashFromImageData(dSample.data, 9, 8);

    // Larger sample for sharpness (gradient magnitude variance proxy)
    const mid = sampleLetterboxed(img, 64, 64);
    const g = toGray(mid.data, 64 * 64);
    let gradSum = 0;
    let gradSq = 0;
    let n = 0;
    for (let y = 0; y < 63; y++) {
      for (let x = 0; x < 63; x++) {
        const i = y * 64 + x;
        const dx = g[i + 1] - g[i];
        const dy = g[i + 64] - g[i];
        const mag = Math.hypot(dx, dy);
        gradSum += mag;
        gradSq += mag * mag;
        n += 1;
      }
    }
    const mean = gradSum / n;
    const sharpness = Math.max(0, gradSq / n - mean * mean);

    const reasons: string[] = [];
    if (sharpness < 45) reasons.push("soft / blurry");
    if (brightness < 35) reasons.push("too dark");
    if (brightness > 230) reasons.push("too bright / blown");

    return {
      sharpness,
      brightness,
      needsEditing: reasons.length > 0,
      reasons,
      aHash,
      dHash,
    };
  } finally {
    if (typeof source !== "string" && img.src.startsWith("blob:")) {
      URL.revokeObjectURL(img.src);
    }
  }
}

/** Run async work with a fixed concurrency pool. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
      done += 1;
      onProgress?.(done, total);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) || 1 }, () => run());
  await Promise.all(runners);
  return results;
}
