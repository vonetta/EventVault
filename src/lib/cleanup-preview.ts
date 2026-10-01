import sharp from "sharp";
import {
  CLEANUP_ENGINE_AI,
  CLEANUP_ENGINE_LOCAL,
  cleanupPreviewStorageKey,
} from "@/lib/cleanup-engine";
import { enhanceWithOpenAI, hasOpenAICleanup } from "@/lib/cleanup-ai";

export {
  CLEANUP_ENGINE,
  CLEANUP_ENGINE_AI,
  CLEANUP_ENGINE_LOCAL,
  cleanupPreviewStorageKey,
} from "@/lib/cleanup-engine";
export { hasOpenAICleanup, openAIImageModel } from "@/lib/cleanup-ai";

/**
 * Cleanup for Needs editing previews.
 *
 * Prefer OpenAI GPT Image edit when OPENAI_API_KEY is set (ChatGPT-class).
 * Otherwise fall back to local sharp tone/sharpen (adaptive, not generative).
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
  linear: [number, number];
  claheSlope: number;
  brightness: number;
  saturation: number;
  sharpenSigma: number;
  normalize: boolean;
  label: string;
  strength: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Continuous local recipe from this frame’s stats. */
export function planTonePass(stats: CleanupStats): TonePlan {
  const { brightness, contrast } = stats;

  const brightGap = clamp(132 - brightness, -15, 110);
  const flatness = clamp(38 - contrast, 0, 38);
  const needLift = clamp(brightGap / 95, 0, 1);
  const needPunch = clamp(flatness / 32, 0, 1);
  const strength = clamp(needLift * 0.8 + needPunch * (brightness < 125 ? 0.35 : 0.12), 0, 1);

  const linearA = 1 + needLift * 0.55;
  const linearB = needLift * 22;
  const claheSlope = Math.round(clamp(2 + strength * 3.4 + needPunch * 0.6, 2, 8));
  const brightnessMod = 1 + strength * 0.14;
  const saturation = 1 + strength * 0.09 + needPunch * 0.03;
  const sharpenSigma = 0.9 + strength * 0.5 + (brightness > 135 && needPunch > 0.3 ? 0.35 : 0);
  const normalize = needLift < 0.35 && needPunch > 0.55 && brightness > 90;

  let label = "Mild polish";
  if (strength >= 0.78) label = "Strong exposure lift";
  else if (strength >= 0.5) label = "Moderate lift";
  else if (needPunch > 0.55 && needLift < 0.3) label = "Contrast + sharpen";
  else if (strength < 0.18) label = "Light sharpen";

  return {
    linear: [Math.round(linearA * 1000) / 1000, Math.round(linearB * 10) / 10],
    claheSlope,
    brightness: Math.round(brightnessMod * 1000) / 1000,
    saturation: Math.round(saturation * 1000) / 1000,
    sharpenSigma: Math.round(sharpenSigma * 100) / 100,
    normalize,
    label,
    strength: Math.round(strength * 100) / 100,
  };
}

async function applyPlan(
  input: Buffer,
  width: number,
  height: number,
  plan: TonePlan,
): Promise<Buffer> {
  let pipeline = sharp(input, { failOn: "none" }).linear(plan.linear[0], plan.linear[1]);

  if (plan.normalize) {
    pipeline = pipeline.normalize({ lower: 1, upper: 99 });
  }

  const maxWin = Math.min(80, Math.floor(Math.min(width, height) / 3));
  if (maxWin >= 8) {
    pipeline = pipeline.clahe({
      width: maxWin,
      height: maxWin,
      maxSlope: Math.round(plan.claheSlope),
    });
  }

  return pipeline
    .modulate({ brightness: plan.brightness, saturation: plan.saturation })
    .sharpen({
      sigma: plan.sharpenSigma,
      m1: 1.05,
      m2: 0.45,
    })
    .toBuffer();
}

export async function enhanceLightingAndSharpness(input: Buffer): Promise<{
  buffer: Buffer;
  width?: number;
  height?: number;
  before: CleanupStats;
  after: CleanupStats;
  plan: TonePlan;
  engine: string;
}> {
  const cleaned = await sharp(input, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true });

  const width = cleaned.info.width || 1;
  const height = cleaned.info.height || 1;
  const before = await measureToneStats(cleaned.data);
  let plan = planTonePass(before);
  let working = await applyPlan(cleaned.data, width, height, plan);

  let mid = await measureToneStats(working);
  if (before.brightness < 75 && mid.brightness < 100) {
    const boost = clamp((110 - mid.brightness) / 80, 0.15, 0.55);
    const again: TonePlan = {
      linear: [1 + boost * 0.35, boost * 14],
      claheSlope: 3,
      brightness: 1 + boost * 0.08,
      saturation: 1.02,
      sharpenSigma: 1.05,
      normalize: false,
      label: "Strong exposure lift (2-pass)",
      strength: clamp(plan.strength + boost * 0.4, 0, 1),
    };
    working = await applyPlan(working, width, height, again);
    plan = {
      ...plan,
      label: again.label,
      strength: again.strength,
    };
  }

  const { data, info } = await sharp(working, { failOn: "none" })
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
    engine: CLEANUP_ENGINE_LOCAL,
  };
}

export type CleanupEnhanceResult = {
  buffer: Buffer;
  width?: number;
  height?: number;
  before: CleanupStats;
  after: CleanupStats;
  plan: TonePlan;
  engine: string;
  provider: "openai" | "local";
  model?: string;
};

/** Preferred engine id for current-preview checks (AI when keyed, else local). */
export function preferredCleanupEngine(): string {
  return hasOpenAICleanup() ? CLEANUP_ENGINE_AI : CLEANUP_ENGINE_LOCAL;
}

/**
 * Run AI edit when configured; otherwise local adaptive sharp.
 * On AI failure, falls back to local so the sandbox still works.
 */
export async function enhanceCleanupPreview(input: Buffer): Promise<CleanupEnhanceResult> {
  const beforeProbe = await sharp(input, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .toBuffer();
  const before = await measureToneStats(beforeProbe);

  if (hasOpenAICleanup()) {
    try {
      const ai = await enhanceWithOpenAI(input);
      const after = await measureToneStats(ai.buffer);
      return {
        buffer: ai.buffer,
        width: ai.width,
        height: ai.height,
        before,
        after,
        plan: {
          linear: [1, 0],
          claheSlope: 0,
          brightness: 1,
          saturation: 1,
          sharpenSigma: 0,
          normalize: false,
          label: ai.label,
          strength: 1,
        },
        engine: CLEANUP_ENGINE_AI,
        provider: "openai",
        model: ai.model,
      };
    } catch (err) {
      // Fall through to local — still produce a usable preview.
      console.error("[cleanup] OpenAI edit failed, using local fallback:", err);
    }
  }

  const local = await enhanceLightingAndSharpness(input);
  return {
    ...local,
    provider: "local",
    plan: {
      ...local.plan,
      label:
        hasOpenAICleanup()
          ? `${local.plan.label} (local fallback)`
          : local.plan.label,
    },
  };
}
