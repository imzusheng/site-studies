import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeAnchors } from "./animejs/js/film/anchors.js";
import { TOTAL_TIME, SHOT_RANGES, evaluateMotion, shotAt, MOTION_TRACKS } from "./animejs/js/film.js";

const root = path.resolve(new URL(".", import.meta.url).pathname);
const load = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const a3 = load(path.join(root, "animejs", "ASSEMBLY_MANIFEST.json"));
const a4Path = "/Users/lizusheng/Desktop/luma-remote/hardware/mechanical/exports/assembly/profiles/industrial_a4_15_audit_hardening/web_runtime/ASSEMBLY_MANIFEST.json";
const manifests = [["A3.32", a3]];
if (fs.existsSync(a4Path)) manifests.push(["A4.15", load(a4Path)]);
for (const [name, manifest] of manifests) {
  const anchors = computeAnchors(manifest);
  for (const key of ["display_center", "display_plane", "keyboard_region", "knob_axis", "mainboard_plane"]) {
    assert.ok(anchors[key], `${name} missing ${key}`);
    const value = anchors[key].center || anchors[key];
    assert.ok(value.toArray().every(Number.isFinite), `${name} invalid ${key}`);
  }
}
const html = fs.readFileSync(path.join(root, "animejs", "index.html"), "utf8");
const blueprintLabels = (html.match(/class="tag-(?:upper-shell|keycaps|switches|screen-bezel|ec11)"/g) || []).length;
const inputCallouts = (html.match(/data-for="input"/g) || []).length;
const computeCallouts = (html.match(/data-for="compute"/g) || []).length;
assert.ok(blueprintLabels <= 5, `blueprint callouts exceed five: ${blueprintLabels}`);
assert.ok(inputCallouts <= 3, `input callouts exceed three: ${inputCallouts}`);
assert.ok(computeCallouts <= 3, `compute callouts exceed three: ${computeCallouts}`);

const sampleCount = 201;
const times = Array.from({ length: sampleCount }, (_, i) => (TOTAL_TIME * i) / (sampleCount - 1));
const samples = times.map(evaluateMotion);
const finiteKeys = ["cameraAzimuth", "cameraElevation", "cameraRadiusScale", "cameraFov", "focusDisplay", "focusKeyboard", "focusKnob", "focusMainboard", "blueprintSeparation", "keycapLift", "knobRotation", "boardLift", "boardFlip", "cadMix", "inkMix", "stageExpand", "lcdIntensity"];
for (const [i, state] of samples.entries()) {
  for (const key of finiteKeys) assert.ok(Number.isFinite(state[key]), `sample ${i} ${key} is not finite`);
  assert.ok(state.cameraRadiusScale > 0 && state.cameraFov > 10 && state.cameraFov < 100, `sample ${i} camera invalid`);
  assert.ok(state.stageExpand >= 0 && state.stageExpand <= 1.01, `sample ${i} stage invalid`);
}
const ids = new Set(times.map(shotAt).map((value) => value.id));
assert.deepEqual([...ids], ["hero", "blueprint", "input", "control", "compute", "final"]);
assert.deepEqual(samples, times.map(evaluateMotion), "timeline evaluation must be deterministic");
for (let i = 1; i < samples.length - 1; i++) {
  const a = samples[i - 1], b = samples[i], c = samples[i + 1];
  const v0 = [b.cameraAzimuth - a.cameraAzimuth, b.cameraElevation - a.cameraElevation, b.cameraRadiusScale - a.cameraRadiusScale];
  const v1 = [c.cameraAzimuth - b.cameraAzimuth, c.cameraElevation - b.cameraElevation, c.cameraRadiusScale - b.cameraRadiusScale];
  const n0 = Math.hypot(...v0), n1 = Math.hypot(...v1);
  if (n0 > 1e-5 && n1 > 1e-5) {
    const dot = v0.reduce((sum, value, j) => sum + value * v1[j], 0);
    const nearShotBoundary = [1000, 2000, 3000, 4000, 5200].some((boundary) => Math.abs(times[i] - boundary) < 80);
    if (!nearShotBoundary) assert.ok(Math.acos(Math.max(-1, Math.min(1, dot / (n0 * n1)))) < Math.PI * 0.95, `camera reversal at sample ${i}`);
  }
}
assert.equal(SHOT_RANGES.length, 6);
assert.ok(MOTION_TRACKS.length >= 20);
console.log(`timeline samples: ${sampleCount}`);
console.log(`tracks: ${MOTION_TRACKS.length}`);
console.log(`shots: ${[...ids].join(" → ")}`);
console.log("RESULT: PASS — deterministic six-shot motion/composition gates");
