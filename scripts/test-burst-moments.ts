import assert from "node:assert/strict";
import { collapseBurstMoments } from "../src/lib/burst-moments";

const items = [
  {
    id: "a",
    aHash: "1111111111111111",
    dHash: "2222222222222222",
    sharpness: 50,
  },
  {
    id: "b",
    aHash: "1111111111111111",
    dHash: "2222222222222222",
    sharpness: 200,
  },
  {
    id: "c",
    aHash: "aaaaaaaaaaaaaaaa",
    dHash: "bbbbbbbbbbbbbbbb",
    sharpness: 90,
  },
  { id: "d", aHash: "", dHash: "", sharpness: 10 },
];

const out = collapseBurstMoments(items);
assert.equal(out.length, 3);
const burst = out.find((row) => row.id === "b");
assert.ok(burst);
assert.equal(burst!.burstCount, 2);
assert.deepEqual(burst!.burstIds.sort(), ["a", "b"]);
assert.ok(out.some((row) => row.id === "c" && row.burstCount === 1));
assert.ok(out.some((row) => row.id === "d" && row.burstCount === 1));
assert.ok(!out.some((row) => row.id === "a"));

console.log("OK burst collapse", out.map((r) => ({ id: r.id, n: r.burstCount })));

// Regression: spreading a Mongoose-like doc drops non-enumerable `_id`.
// Guest library must map burst rows via `row.id`, not `{ ...row.doc }`.
function mapLikeLibrary(row: {
  id: string;
  doc: { filename?: string; contentType?: string; createdAt?: Date; title?: string | null };
  burstCount: number;
}) {
  const doc = row.doc;
  return {
    id: String(row.id),
    title: doc.title || doc.filename || "Media",
    url: `/api/media/${String(row.id)}`,
    burstCount: row.burstCount > 1 ? row.burstCount : undefined,
  };
}

const mongooseLike = Object.defineProperty(
  { filename: "shot.jpg", contentType: "image/jpeg", createdAt: new Date() },
  "_id",
  { value: { toString: () => "aaaaaaaaaaaaaaaaaaaaaaaa" }, enumerable: false },
) as { filename: string; contentType: string; createdAt: Date; _id: { toString(): string } };

const brokenSpread = {
  id: String((mongooseLike as { _id?: unknown })._id),
  url: `/api/media/${String(( { ...mongooseLike } as { _id?: unknown })._id)}`,
};
assert.equal(String(({ ...mongooseLike } as { _id?: unknown })._id), "undefined");

const mapped = mapLikeLibrary({
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  doc: mongooseLike,
  burstCount: 4,
});
assert.equal(mapped.id, "aaaaaaaaaaaaaaaaaaaaaaaa");
assert.equal(mapped.url, "/api/media/aaaaaaaaaaaaaaaaaaaaaaaa");
assert.equal(mapped.burstCount, 4);
assert.equal(brokenSpread.id, "aaaaaaaaaaaaaaaaaaaaaaaa"); // direct _id access still works
console.log("OK gallery id mapping after burst collapse");
