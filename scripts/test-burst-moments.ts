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
