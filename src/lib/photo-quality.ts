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
  /** 64-bit average-hash hex (16 chars) for near-duplicate detection. */
  aHash: string;
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

function sampleToCanvas(img: HTMLImageElement, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  return { canvas, ctx, data: ctx.getImageData(0, 0, size, size).data };
}

/** 8×8 average hash — good enough to catch near-identical burst shots. */
export function averageHashFromImageData(data: Uint8ClampedArray, size = 8) {
  const grays: number[] = [];
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    grays.push(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
  }
  const avg = grays.reduce((a, b) => a + b, 0) / grays.length;
  let bits = BigInt(0);
  for (let i = 0; i < grays.length; i++) {
    if (grays[i] >= avg) bits |= BigInt(1) << BigInt(i);
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

/** Photos with hamming distance ≤ this are treated as near-duplicates. */
export const DUPLICATE_HAMMING_MAX = 6;

/**
 * Quick quality pass: blur + exposure heuristics.
 * Designed to run in the browser during bulk assist — not perfect, but catches
 * the obvious soft / black / blown frames that should stay out of live view.
 */
export async function analyzePhotoQuality(source: File | string): Promise<PhotoQuality> {
  const img = await loadImage(source);
  try {
    // Small sample for hash + brightness
    const small = sampleToCanvas(img, 8);
    const aHash = averageHashFromImageData(small.data, 8);

    let brightnessSum = 0;
    for (let i = 0; i < 64; i++) {
      const o = i * 4;
      brightnessSum += 0.299 * small.data[o] + 0.587 * small.data[o + 1] + 0.114 * small.data[o + 2];
    }
    const brightness = brightnessSum / 64;

    // Larger sample for sharpness (gradient magnitude variance proxy)
    const mid = sampleToCanvas(img, 64);
    const g: number[] = [];
    for (let i = 0; i < 64 * 64; i++) {
      const o = i * 4;
      g.push(0.299 * mid.data[o] + 0.587 * mid.data[o + 1] + 0.114 * mid.data[o + 2]);
    }
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
