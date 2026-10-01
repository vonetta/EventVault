import sharp from "sharp";

/**
 * Automatic lighting + sharpness cleanup for Needs editing previews.
 *
 * Intentionally NOT generative AI: no face restore, no redraw, no upscale that
 * invents detail. Same pixels / framing — only tone and mild sharpen so you
 * can judge the pass without risking anyone’s face changing.
 */
export const CLEANUP_ENGINE = "lighting-sharpen-v1";

export function cleanupPreviewStorageKey(eventId: string, mediaId: string) {
  return `events/${eventId}/cleanup-preview/${mediaId}-${CLEANUP_ENGINE}.jpg`;
}

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

/**
 * Mild CLAHE + tiny brightness lift + light unsharp. Geometry unchanged.
 * Window size adapts so tiny / odd frames don’t blow up hist_local.
 */
export async function enhanceLightingAndSharpness(input: Buffer): Promise<{
  buffer: Buffer;
  width?: number;
  height?: number;
  before: CleanupStats;
  after: CleanupStats;
}> {
  // Re-decode first so partial/odd JPEGs become a clean raster for the pass.
  const cleaned = await sharp(input, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true });

  const width = cleaned.info.width || 1;
  const height = cleaned.info.height || 1;
  const before = await measureToneStats(cleaned.data);

  let pipeline = sharp(cleaned.data, { failOn: "none" });

  // CLAHE window must stay smaller than the image on both axes.
  const maxWin = Math.min(48, Math.floor(Math.min(width, height) / 2));
  if (maxWin >= 8) {
    pipeline = pipeline.clahe({ width: maxWin, height: maxWin, maxSlope: 2 });
  } else {
    // Very small frames: gentle global normalize instead of local hist.
    pipeline = pipeline.normalize({ lower: 1, upper: 99 });
  }

  const { data, info } = await pipeline
    .modulate({ brightness: 1.03, saturation: 1.02 })
    .sharpen({ sigma: 0.85, m1: 0.55, m2: 0.25 })
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer({ resolveWithObject: true });

  const after = await measureToneStats(data);

  return {
    buffer: data,
    width: info.width,
    height: info.height,
    before,
    after,
  };
}
