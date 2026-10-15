import assert from "node:assert/strict";
import { clearNeedsEditingPileSet, isEditTagName } from "../src/lib/needs-editing";

const cleared = clearNeedsEditingPileSet();
assert.equal(cleared.needsEditing, false);
assert.equal(cleared.kind, "team_photo");
assert.equal(cleared.published, false);

const tags = [
  { _id: "1", name: "Sam" },
  { _id: "2", name: "Edit" },
  { _id: "3", name: "edit" },
];
const editIds = new Set(tags.filter((g) => isEditTagName(g.name)).map((g) => g._id));
const next = ["1", "2", "3"].filter((id) => !editIds.has(id));
assert.deepEqual(next, ["1"]);

console.log("OK cleanup apply should clear Needs editing + Edit tag");
