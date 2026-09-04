import assert from "node:assert/strict";
import { track, anchorRef, evalTrack } from "./animejs/js/film/types.js";

const linear = track([[0, 0], [1, 10]]);
assert.equal(linear.key(-1), 0);
assert.equal(linear.key(0.5), 5);
assert.equal(linear.key(2), 10);
assert.deepEqual(track([[0, [0, 0]], [1, [10, 20]]]).key(0.25), [2.5, 5]);
assert.equal(evalTrack(7, 0.5), 7);
assert.deepEqual(anchorRef("display_center", [1, 2, 3]), { type: "anchor", name: "display_center", offset: [1, 2, 3] });
console.log("RESULT: PASS — track primitives");
