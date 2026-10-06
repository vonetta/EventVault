import { readFileSync } from "fs";
import sharp from "sharp";
import {
  parseTakenAtFromExifBuffer,
  extractTakenAtFromImage,
} from "../src/lib/photo-taken-at";

/**
 * Canon_40D.jpg (exif-samples): DateTimeOriginal/Digitized = 2008:05:30 15:56:01.
 * IFD0 DateTime was rewritten by GIMP to 2008:07:31 — we must prefer Original.
 */
async function main() {
  const buf = readFileSync("/tmp/canon.jpg");
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  const fromBuf = parseTakenAtFromExifBuffer(meta.exif);
  console.log({ fromBuf: fromBuf?.toISOString() });
  if (!fromBuf || fromBuf.toISOString() !== "2008-05-30T15:56:01.000Z") {
    console.error("Expected DateTimeOriginal 2008-05-30T15:56:01.000Z");
    process.exit(1);
  }
  const after = await extractTakenAtFromImage(
    await sharp(buf).jpeg({ quality: 78 }).toBuffer(),
  );
  console.log({ afterCompress: after });
  if (after) {
    console.error("Compressed JPEG should have no EXIF");
    process.exit(1);
  }
  console.log("OK");
}
main();
