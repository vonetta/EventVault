import sharp from "sharp";
import { CLEANUP_ENGINE, cleanupPreviewStorageKey } from "@/lib/cleanup-engine";

export { CLEANUP_ENGINE, cleanupPreviewStorageKey };

/**
 * Automatic lighting + sharpness cleanup for Needs editing previews.
 *
 * Intentionally NOT generative AI: no face restore, no redraw, no upscale that
 * invents detail. Same pixels / framing — only tone and sharpen so you can
 * judge the pass without risking anyone’s face changing.
 *
 * v2: adaptive lift for underexposed / flat frames (v1 was too mild to see).
 */

export type CleanupStats = {
  brightness: number;
  contrast: number;
};

export async function measureToneStats(input: Buffer): Promise<CleanupStats> {
  const { channels } = await sharp(input, { failOn: "none" }).stats();
  const means = channels.map((c) => c.mean || 0);
  const stdevs = channels.map((c) => (typeof c.stdev === "number" ? c.stdev : 0));
  const brightness = means.reduce((a, b) => a + b, 0) / Math.max(1, means.length);
  const contrast = stdevs.reduce((a, b) => a + b, 0) / Math.max(1, stdevs.length);
  const safeBright = Number.isFinite(brightness) ? brightness : 0;
  const safeContrast = Number.isFinite(contrast) ? contrast : 0;
  return {
    brightness: Math.round(safeBright * 10) / 10,
    contrast: Math.round(safeContrast * 10) / 10,
  };
}

type TonePlan = {
  /** Multiply then add: out = a*in + b (lifts underexposed frames). */
  linear: [number, number];
  claheSlope: number;
  brightness: number;
  saturation: number;
  sharpenSigma: number;
  normalize: boolean;
};

/** Stronger help when the frame is dark or flat; gentle when already OK. */
export function planTonePass(stats: CleanupStats): TonePlan {
  const { brightness, contrast } = stats;
  const veryDark = brightness < 55;
  const dark = brightness < 85;
  const dim = brightness < 120;
  const flat = contrast < 28;

  if (veryDark) {
    return {
      linear: [1.45, 18],
      claheSlope: 5,
      brightness: 1.12,
      saturation: 1.08,
      sharpenSigma: 1.35,
      normalize: true,
    };
  }
  if (dark) {
    return {
      linear: [1.28, 12],
      claheSlope: 4,
      brightness: 1.1,
      saturation: 1.06,
      sharpenSigma: 1.2,
      normalize: true,
    };
  }
  if (dim || flat) {
    return {
      linear: [1.12, 6],
      claheSlope: 3,
      brightness: 1.06,
      saturation: 1.04,
      sharpenSigma: 1.05,
      normalize: flat,
    };
  }
  return {
    linear: [1.04, 2],
    claheSlope: 2,
    brightness: 1.03,
    saturation: 1.02,
    sharpenSigma: 0.95,
    normalize: false,
  };
}

/**
 * Adaptive lighting + sharpen. Geometry unchanged.
 * Window size adapts so tiny / odd frames don’t blow up hist_local.
 */
export async function enhanceLightingAndSharpness(input: Buffer): Promise<{
  buffer: Buffer;
  width?: number;
  height?: number;
  before: CleanupStats;
  after: CleanupStats;
  plan: TonePlan;
}> {
  // Re-decode first so partial/odd JPEGs become a clean raster for the pass.
  const cleaned = await sharp(input, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true });

  const width = cleaned.info.width || 1;
  const height = cleaned.info.height || 1;
  const before = await measureToneStats(cleaned.data);
  const plan = planTonePass(before);

  let pipeline = sharp(cleaned.data, { failOn: "none" }).linear(plan.linear[0], plan.linear[1]);

  if (plan.normalize) {
    pipeline = pipeline.normalize({ lower: 1, upper: 99 });
  }

  // CLAHE window must stay smaller than the image on both axes.
  const maxWin = Math.min(72, Math.floor(Math.min(width, height) / 3));
  if (maxWin >= 8) {
    pipeline = pipeline.clahe({
      width: maxWin,
      height: maxWin,
      maxSlope: plan.claheSlope,
    });
  }

  const { data, info } = await pipeline
    .modulate({ brightness: plan.brightness, saturation: plan.saturation })
    .sharpen({
      sigma: plan.sharpenSigma,
      m1: 1.0,
      m2: 0.4,
    })
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer({ resolveWithObject: true });

  const after = await measureToneStats(data);

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    before,
    after,
    plan,
  };
}
