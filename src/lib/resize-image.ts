/** Client-side image resize to stay under Vercel's ~4.5MB request limit. */

const MAX_BYTES = 3.5 * 1024 * 1024;
const MAX_DIMENSION = 2048;
const INITIAL_QUALITY = 0.88;
const MIN_QUALITY = 0.55;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function scaledDimensions(width: number, height: number, maxDim: number) {
  if (width <= maxDim && height <= maxDim) {
    return { width, height };
  }
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * Resize/compress photos before admin upload. GIFs and non-images are returned unchanged.
 */
export async function resizeImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  if (file.size <= MAX_BYTES) {
    const img = await loadImage(file);
    if (img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
      return file;
    }
  }

  const img = await loadImage(file);
  const { width, height } = scaledDimensions(img.width, img.height, MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const baseName = file.name.replace(/\.[^.]+$/, "");

  let quality = INITIAL_QUALITY;
  let blob = await canvasToBlob(canvas, outputType, quality);

  while (blob && blob.size > MAX_BYTES && quality > MIN_QUALITY) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, outputType, quality);
  }

  if (!blob) return file;

  const ext = outputType === "image/png" ? "png" : "jpg";
  return new File([blob], `${baseName}.${ext}`, { type: outputType, lastModified: Date.now() });
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
