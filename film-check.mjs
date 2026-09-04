import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeAnchors, evaluateShot, ProductFilm } from "./animejs/js/film/index.js";

const load = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const repoRoot = path.resolve(new URL(".", import.meta.url).pathname);
const a3 = load(path.join(repoRoot, "animejs", "ASSEMBLY_MANIFEST.json"));
const a4Path = "/Users/lizusheng/Desktop/luma-remote/hardware/mechanical/exports/assembly/profiles/industrial_a4_15_audit_hardening/web_runtime/ASSEMBLY_MANIFEST.json";
const a4 = load(a4Path);

for (const [name, manifest] of [["A3.32", a3], ["A4.15", a4]]) {
  const anchors = computeAnchors(manifest);
  for (const key of ["display_center", "display_plane", "keyboard_region", "knob_axis", "mainboard_plane"]) {
    assert.ok(anchors[key], `${name} missing ${key}`);
    const value = anchors[key].center || anchors[key];
    assert.ok(value.toArray().every(Number.isFinite), `${name} invalid ${key}`);
  }
  console.log(`${name} anchors`, Object.fromEntries(Object.entries(anchors).map(([k, v]) => { const p = v.center || v; return [k, p.toArray().map((n) => +n.toFixed(2))]; })));
}

const anchors = computeAnchors(a3);
const input = ProductFilm.shots.find((shot) => shot.id === "input");
const atStart = evaluateShot(input, 0, anchors);
const atMiddle = evaluateShot(input, 0.5, anchors);
const atEnd = evaluateShot(input, 1, anchors);
const distance = (a, b) => a.distanceTo(b);
assert.ok(distance(atStart.camera.target, anchors.display_center) < 1e-6, "input must enter from display center");
assert.ok(distance(atEnd.camera.target, anchors.display_center) < 1e-6, "input must return to display center");
assert.equal(atMiddle.parts.size, 0, "evaluator can run without loaded parts");
console.log(`input anchor transition: ${distance(atStart.camera.target, anchors.display_center).toFixed(3)} → ${distance(atMiddle.camera.target, anchors.keyboard_center).toFixed(3)} → ${distance(atEnd.camera.target, anchors.display_center).toFixed(3)}`);
console.log(`film shots: ${ProductFilm.SHOT_IDS.join(" → ")}`);
console.log("RESULT: PASS — film primitives and semantic anchors");
