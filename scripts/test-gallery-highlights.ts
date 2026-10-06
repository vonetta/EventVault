import assert from "node:assert/strict";
import {
  collapseNearDuplicates,
  pickHighlights,
  targetHighlightCount,
  type HighlightCandidate,
} from "../src/lib/gallery-highlights";

function cand(
  id: string,
  sharpness: number,
  opts: Partial<HighlightCandidate> = {},
): HighlightCandidate {
  return {
    id,
    sharpness,
    brightness: opts.brightness ?? 120,
    aHash: opts.aHash ?? "aaaaaaaaaaaaaaaa",
    dHash: opts.dHash ?? id.padEnd(16, "0").slice(0, 16),
    needsEditing: opts.needsEditing ?? false,
  };
}

// Tiny album: return all usable
assert.equal(targetHighlightCount(12), 12);
assert.equal(targetHighlightCount(500), 20);
assert.equal(targetHighlightCount(1000), 40);

const burst = [
  cand("burst-a", 90, { aHash: "1111111111111111", dHash: "2222222222222222" }),
  cand("burst-b", 140, { aHash: "1111111111111111", dHash: "2222222222222222" }), // sharpest
  cand("burst-c", 100, { aHash: "1111111111111111", dHash: "2222222222222222" }),
];
const collapsed = collapseNearDuplicates(burst);
assert.equal(collapsed.length, 1);
assert.equal(collapsed[0].id, "burst-b");

const soft = cand("soft", 10, { needsEditing: true, dHash: "3333333333333333" });
const gallery: HighlightCandidate[] = [
  soft,
  ...burst,
  cand("wide-1", 200, { dHash: "aaaaaaaaaaaaaaaa", aHash: "bbbbbbbbbbbbbbbb" }),
  cand("wide-2", 180, { dHash: "cccccccccccccccc", aHash: "dddddddddddddddd" }),
  cand("wide-3", 160, { dHash: "eeeeeeeeeeeeeeee", aHash: "ffffffffffffffff" }),
  cand("wide-4", 150, { dHash: "0123456789abcdef", aHash: "fedcba9876543210" }),
];

const picked = pickHighlights(gallery, { minCount: 3, maxCount: 4 });
assert.ok(picked.length >= 3 && picked.length <= 4);
assert.ok(!picked.includes("soft"));
// Burst collapsed to sharpest only — never keep the weaker frames.
assert.ok(!picked.includes("burst-a"));
assert.ok(!picked.includes("burst-c"));
// Top-scoring diverse frames win the reel.
assert.ok(picked.includes("wide-1"));

console.log("OK", { picked, target500: targetHighlightCount(500) });
