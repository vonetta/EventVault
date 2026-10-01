import sharp from "sharp";
import {
  CLEANUP_ENGINE,
  type CleanupPreset,
  cleanupPreviewStorageKey,
  isCleanupPreset,
} from "@/lib/cleanup-engine";

export {
  CLEANUP_ENGINE,
  CLEANUP_PRESETS,
  CLEANUP_PRESET_HINTS,
  CLEANUP_PRESET_LABELS,
  cleanupPreviewStorageKey,
  isCleanupPreset,
  type CleanupPreset,
} from "@/lib/cleanup-engine";

/**
 * Automatic lighting + sharpness cleanup for Needs editing previews.
 *
 * Intentionally NOT generative AI: no face restore, no redraw, no upscale.
 * Per-photo presets let dark / soft / already-OK frames get different tweaks.
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

export type TonePlan = {
  /** Multiply then add: out = a*in + b (lifts underexposed frames). */
  linear: [number, number];
  claheSlope: number;
  brightness: number;
  saturation: number;
  sharpenSigma: number;
  normalize: boolean;
  preset: CleanupPreset;
};

const GENTLE_PLAN: Omit<TonePlan, "preset"> = {
  linear: [1.04, 2],
  claheSlope: 2,
  brightness: 1.03,
  saturation: 1.02,
  sharpenSigma: 0.9,
  normalize: false,
};

const DARK_PLAN: Omit<TonePlan, "preset"> = {
  linear: [1.4, 16],
  claheSlope: 5,
  brightness: 1.12,
  saturation: 1.08,
  sharpenSigma: 1.25,
  normalize: true,
};

const SOFT_PLAN: Omit<TonePlan, "preset"> = {
  linear: [1.06, 3],
  claheSlope: 2,
  brightness: 1.03,
  saturation: 1.02,
  sharpenSigma: 1.55,
  normalize: false,
};

/** Auto adapts; other presets force a fixed recipe. */
export function planTonePass(
  stats: CleanupStats,
  preset: CleanupPreset = "auto",
): TonePlan {
  if (preset === "gentle") return { ...GENTLE_PLAN, preset };
  if (preset === "dark") return { ...DARK_PLAN, preset };
  if (preset === "soft") return { ...SOFT_PLAN, preset };

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
      preset: "auto",
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
      preset: "auto",
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
      preset: "auto",
    };
  }
  return { ...GENTLE_PLAN, preset: "auto" };
}

/**
 * Lighting + sharpen with optional per-photo preset. Geometry unchanged.
 */
export async function enhanceLightingAndSharpness(
  input: Buffer,
  preset: CleanupPreset = "auto",
): Promise<{
  buffer: Buffer;
  width?: number;
  height?: number;
  before: CleanupStats;
  after: CleanupStats;
  plan: TonePlan;
}> {
  const cleaned = await sharp(input, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true });

  const width = cleaned.info.width || 1;
  const height = cleaned.info.height || 1;
  const before = await measureToneStats(cleaned.data);
  const plan = planTonePass(before, preset);

  let pipeline = sharp(cleaned.data, { failOn: "none" }).linear(plan.linear[0], plan.linear[1]);

  if (plan.normalize) {
    pipeline = pipeline.normalize({ lower: 1, upper: 99 });
  }

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
