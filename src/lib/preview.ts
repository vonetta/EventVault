import sharp from "sharp";

/**
 * Build a low-resolution, watermarked JPEG preview of a locked individual photo.
 * The full-resolution original is never served until the guest pays, so the
 * preview is deliberately small and stamped so it can't be used as the real file.
 */
export async function makeWatermarkedPreview(
  input: Buffer,
  label = "PREVIEW",
): Promise<Buffer> {
  const width = 640;
  // Resize first, then measure the actual output so the watermark overlay is
  // never larger than the (possibly downscaled/rotated) base image.
  const resized = await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const w = meta.width || width;
  const h = meta.height || Math.round((width * 2) / 3);

  const safeLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 40);

  const tile = 220;
  const watermark = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="wm" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="0" y="${tile / 2}" font-family="sans-serif" font-size="22" fill="#ffffff" fill-opacity="0.45" font-weight="700">${safeLabel}</text>
        </pattern>
      </defs>
      <rect width="${w}" height="${h}" fill="#000000" fill-opacity="0.08"/>
      <rect width="${w}" height="${h}" fill="url(#wm)"/>
    </svg>`,
  );

  return sharp(resized)
    .composite([{ input: watermark, blend: "over" }])
    .jpeg({ quality: 55 })
    .toBuffer();
}
