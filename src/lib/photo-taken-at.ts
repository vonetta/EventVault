import sharp from "sharp";

/**
 * Read the camera's capture time from an image buffer (EXIF DateTimeOriginal).
 * Call this on the *original* upload bytes — compressImageForStorage strips EXIF.
 */
export async function extractTakenAtFromImage(
  input: Buffer,
): Promise<Date | null> {
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    return parseTakenAtFromExifBuffer(meta.exif);
  } catch {
    return null;
  }
}

/** EXIF / TIFF tag ids we care about. */
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;

/**
 * Parse DateTimeOriginal (preferred) from a raw APP1 EXIF blob.
 * Falls back to DateTimeDigitized, then DateTime.
 */
export function parseTakenAtFromExifBuffer(
  exif: Buffer | Uint8Array | undefined,
): Date | null {
  if (!exif?.length) return null;
  const buf = Buffer.isBuffer(exif) ? exif : Buffer.from(exif);

  const fromTiff = parseTakenAtFromTiffExif(buf);
  if (fromTiff) return fromTiff;

  // Last resort: first plausible YYYY:MM:DD HH:MM:SS in the blob.
  return parseExifDateString(buf.toString("latin1"));
}

function parseTakenAtFromTiffExif(buf: Buffer): Date | null {
  // sharp may pass the APP1 payload starting at "Exif\0\0" or already at TIFF.
  let tiffStart = 0;
  if (buf.length >= 6 && buf.toString("ascii", 0, 4) === "Exif") {
    tiffStart = 6;
  }
  if (buf.length < tiffStart + 8) return null;

  const order = buf.toString("ascii", tiffStart, tiffStart + 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";

  const readU16 = (offset: number) =>
    le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
  const readU32 = (offset: number) =>
    le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);

  const magic = readU16(tiffStart + 2);
  if (magic !== 42) return null;

  const ifd0Offset = readU32(tiffStart + 4);
  const ifd0 = readIfd(buf, tiffStart, ifd0Offset, readU16, readU32);
  if (!ifd0) return null;

  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  let exifIfd: Map<number, Buffer | number> | null = null;
  if (typeof exifPtr === "number") {
    exifIfd = readIfd(buf, tiffStart, exifPtr, readU16, readU32);
  }

  const pick = (map: Map<number, Buffer | number> | null, tag: number) => {
    if (!map) return null;
    const value = map.get(tag);
    if (!value) return null;
    if (Buffer.isBuffer(value)) return parseExifDateString(value.toString("latin1"));
    return null;
  };

  return (
    pick(exifIfd, TAG_DATETIME_ORIGINAL) ||
    pick(exifIfd, TAG_DATETIME_DIGITIZED) ||
    pick(ifd0, TAG_DATETIME)
  );
}

function readIfd(
  buf: Buffer,
  tiffStart: number,
  ifdOffset: number,
  readU16: (offset: number) => number,
  readU32: (offset: number) => number,
): Map<number, Buffer | number> | null {
  const abs = tiffStart + ifdOffset;
  if (abs < 0 || abs + 2 > buf.length) return null;
  const count = readU16(abs);
  const map = new Map<number, Buffer | number>();
  for (let i = 0; i < count; i++) {
    const entry = abs + 2 + i * 12;
    if (entry + 12 > buf.length) break;
    const tag = readU16(entry);
    const type = readU16(entry + 2);
    const num = readU32(entry + 4);
    const typeSize = exifTypeSize(type);
    if (!typeSize) continue;
    const byteLen = typeSize * num;
    let data: Buffer | number;
    if (byteLen <= 4) {
      if (type === 2) {
        // ASCII inline
        data = buf.subarray(entry + 8, entry + 8 + Math.min(4, byteLen));
      } else {
        data = readU32(entry + 8);
      }
    } else {
      const dataOffset = readU32(entry + 8);
      const start = tiffStart + dataOffset;
      const end = start + byteLen;
      if (start < 0 || end > buf.length) continue;
      data = buf.subarray(start, end);
    }
    map.set(tag, data);
  }
  return map;
}

function exifTypeSize(type: number): number {
  switch (type) {
    case 1: // BYTE
    case 2: // ASCII
    case 7: // UNDEFINED
      return 1;
    case 3: // SHORT
      return 2;
    case 4: // LONG
    case 9: // SLONG
      return 4;
    case 5: // RATIONAL
    case 10: // SRATIONAL
      return 8;
    default:
      return 0;
  }
}

/** EXIF stores dates as "YYYY:MM:DD HH:MM:SS" (no timezone). */
function parseExifDateString(text: string): Date | null {
  const m = text.match(/(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  if (year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // UTC components so day-bucketing is stable across server timezones.
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Calendar day key (UTC) for section chips — YYYY-MM-DD. */
export function takenAtDayKey(takenAt: Date | string | null | undefined): string | null {
  if (!takenAt) return null;
  const d = takenAt instanceof Date ? takenAt : new Date(takenAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
