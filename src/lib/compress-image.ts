import sharp from "sharp";

/** Longest edge for guest-facing stills — sharp enough on phones, much smaller in R2. */
export const STORAGE_MAX_DIMENSION = 1600;
/** JPEG quality for vault storage (mozjpeg). */
export const STORAGE_JPEG_QUALITY = 78;

export type CompressedImage = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/gif";
  extension: ".jpg" | ".gif";
  width?: number;
  height?: number;
};

/**
 * Re-encode stills for R2: strip EXIF, cap dimensions, JPEG where possible.
 * GIFs are left alone (animation). Returns null if input isn't a compressible still.
 */
export async function compressImageForStorage(
  input: Buffer,
  sourceMime: string,
): Promise<CompressedImage | null> {
  const mime = sourceMime.toLowerCase();
  if (mime === "image/gif") {
    return { buffer: input, contentType: "image/gif", extension: ".gif" };
  }
  if (!mime.startsWith("image/")) return null;

  const pipeline = sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: STORAGE_MAX_DIMENSION,
      height: STORAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  const { data, info } = await pipeline
    .jpeg({ quality: STORAGE_JPEG_QUALITY, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: "image/jpeg",
    extension: ".jpg",
    width: info.width,
    height: info.height,
  };
}
