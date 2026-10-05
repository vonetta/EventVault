import sharp from "sharp";

/**
 * OpenAI Images Edit (GPT Image) — ChatGPT-class photo cleanup.
 * Requires OPENAI_API_KEY. Optional: OPENAI_IMAGE_MODEL, OPENAI_IMAGE_QUALITY.
 */

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";

const CLEANUP_PROMPT =
  "Improve this event photograph. Correct yellow/orange color cast and white " +
  "balance so skin tones look natural (especially for darker skin). Fix exposure: " +
  "lift underexposed faces and shadows from lighting/angle without blowing out " +
  "highlights; gently recover shadow detail; apply mild sharpening/clarity. " +
  "Keep the exact same people, faces, expressions, ages, true skin tone (do not " +
  "lighten or darken identity), clothing, poses, framing, and background. Do not " +
  "add, remove, or replace anyone. Do not beautify or reshape faces. Photorealistic " +
  "only — no illustration, no heavy filters, no text overlays.";

export function hasOpenAICleanup(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function openAIImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL;
}

export function openAIImageQuality(): "low" | "medium" | "high" | "auto" {
  const q = (process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium").toLowerCase();
  if (q === "low" || q === "high" || q === "auto" || q === "medium") return q;
  return "medium";
}

/** Pick a GPT Image size close to the source aspect ratio. */
export function editSizeForAspect(width: number, height: number): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const ratio = w / h;
  if (ratio > 1.25) return "1536x1024";
  if (ratio < 0.8) return "1024x1536";
  return "1024x1024";
}

function supportsInputFidelity(model: string): boolean {
  // gpt-image-2 always uses high fidelity; older GPT Image models accept the flag.
  if (model.startsWith("gpt-image-2")) return false;
  if (model.includes("mini")) return false;
  return model.startsWith("gpt-image-1") || model === "chatgpt-image-latest";
}

export type OpenAICleanupResult = {
  buffer: Buffer;
  model: string;
  quality: string;
  size: string;
  label: string;
  width: number;
  height: number;
};

/**
 * Send a photo to OpenAI /v1/images/edits and return a JPEG buffer.
 * Resizes huge inputs down before upload; scales the result back toward
 * the original dimensions when possible.
 */
export async function enhanceWithOpenAI(input: Buffer): Promise<OpenAICleanupResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const meta = await sharp(input, { failOn: "none" }).metadata();
  const origW = meta.width || 1024;
  const origH = meta.height || 1024;

  const prepared = await sharp(input, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .resize({
      width: 1536,
      height: 1536,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const model = openAIImageModel();
  const quality = openAIImageQuality();
  const size = editSizeForAspect(prepared.info.width || origW, prepared.info.height || origH);

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", CLEANUP_PROMPT);
  form.append(
    "image",
    new Blob([new Uint8Array(prepared.data)], { type: "image/jpeg" }),
    "photo.jpg",
  );
  form.append("n", "1");
  form.append("quality", quality);
  form.append("size", size);
  form.append("output_format", "jpeg");
  if (supportsInputFidelity(model)) {
    form.append("input_fidelity", "high");
  }

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; type?: string };
    data?: Array<{ b64_json?: string; url?: string }>;
  };

  if (!res.ok) {
    const msg = json.error?.message || `OpenAI image edit failed (${res.status})`;
    throw new Error(msg);
  }

  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI returned no image data");
  }

  const raw = Buffer.from(b64, "base64");
  const { data, info } = await sharp(raw, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .resize({
      width: origW,
      height: origH,
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    model,
    quality,
    size,
    label: `AI cleanup · ${model}`,
    width: info.width || origW,
    height: info.height || origH,
  };
}
