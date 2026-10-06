import assert from "node:assert/strict";
import {
  readFavoriteIds,
  toggleFavoriteId,
  writeFavoriteIds,
  hasEnteredWeekend,
  markEnteredWeekend,
} from "../src/lib/gallery-favorites";

// jsdom-less: stub localStorage / sessionStorage for node
const store = new Map<string, string>();
const session = new Map<string, string>();
(globalThis as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  },
  sessionStorage: {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => {
      session.set(k, v);
    },
  },
};

const eventId = "evt1";
assert.deepEqual(readFavoriteIds(eventId), []);
assert.deepEqual(toggleFavoriteId(eventId, "a"), ["a"]);
assert.deepEqual(toggleFavoriteId(eventId, "b"), ["a", "b"]);
assert.deepEqual(toggleFavoriteId(eventId, "a"), ["b"]);
writeFavoriteIds(eventId, ["x", "x", "y"]);
assert.deepEqual(readFavoriteIds(eventId), ["x", "y"]);

assert.equal(hasEnteredWeekend(eventId), false);
markEnteredWeekend(eventId);
assert.equal(hasEnteredWeekend(eventId), true);

console.log("OK favorites helpers");
