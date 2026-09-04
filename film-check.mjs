import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A340_PROFILE } from './animejs/js/model-profile.js';
import { BEAT_RANGES, MOTION_TRACKS, TOTAL_TIME, beatAt, evaluateMotion } from './animejs/js/film.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, 'animejs/index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'animejs/js/main.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'animejs/ASSEMBLY_MANIFEST.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'animejs/package.json'), 'utf8'));

assert.equal(pkg.dependencies?.animejs?.replace(/^\^/, ''), '4.5.0', 'animejs 4.5.0 must remain the runtime dependency');
assert.equal(A340_PROFILE.revision, 'A3.40_EC11_BEZEL_CLEARANCE');
assert.equal(A340_PROFILE.dimensions.knobWellDiameter, 26);
assert.equal(A340_PROFILE.dimensions.knobOuterDiameter, 24);
assert.deepEqual(A340_PROFILE.dimensions.screenCenter, [0, 14]);
assert.equal(A340_PROFILE.dimensions.width, 120);
assert.equal(A340_PROFILE.dimensions.depth, 81);

const ids = new Set((manifest.parts || []).map((part) => part.id));
for (const [role, value] of Object.entries(A340_PROFILE.roles)) {
  for (const id of Array.isArray(value) ? value : [value]) {
    assert.ok(ids.has(id), `A3.40 web adaptation role ${role} cannot resolve source part ${id}`);
  }
}

assert.equal(BEAT_RANGES.length, 9, 'product film must contain nine long-form beats');
assert.deepEqual(BEAT_RANGES.map(([id]) => id), ['hero', 'stage', 'blueprint', 'form', 'input', 'control', 'display', 'compute', 'final']);
assert.equal((html.match(/class="film-beat/g) || []).length, 9, 'DOM film beat count drifted');
assert.equal((html.match(/class="blueprint-label /g) || []).length, 5, 'Blueprint must keep exactly five stable system labels');
assert.equal((html.match(/data-beat="input" data-role=/g) || []).length, 3, 'Input macro callouts must stay at three');
assert.equal((html.match(/data-beat="compute" data-role=/g) || []).length, 3, 'Compute macro callouts must stay at three');
assert.ok(main.includes('createFilmTimeline'), 'runtime must use the Anime.js film timeline');
assert.ok(!main.includes('detectShot('), 'legacy shot detector must not return');
assert.ok(!main.includes('const SHOTS'), 'legacy SHOTS state machine must not return');
assert.ok(!/requestAnimationFrame\(render\);\s*requestAnimationFrame\(render\);/.test(main), 'duplicate render-loop bootstrap detected');

const sampleCount = 681;
const times = Array.from({ length: sampleCount }, (_, index) => TOTAL_TIME * index / (sampleCount - 1));
const samples = times.map(evaluateMotion);
assert.deepEqual(samples, times.map(evaluateMotion), 'film evaluation must be deterministic');

const finiteKeys = [
  'cameraAzimuth', 'cameraElevation', 'cameraRadiusScale', 'cameraFov',
  'framingX', 'framingY', 'focusProduct', 'focusDisplay', 'focusKeyboard',
  'focusKnob', 'focusMainboard', 'productYaw', 'productPitch',
  'blueprintSeparation', 'keycapLift', 'knobRotation', 'serviceCoverOpen',
  'boardLift', 'boardFlip', 'cadMix', 'inkMix', 'stageExpand',
  'stageStrength', 'lcdIntensity', 'lcdInteraction',
];

for (const [index, sample] of samples.entries()) {
  for (const key of finiteKeys) assert.ok(Number.isFinite(sample[key]), `sample ${index}: ${key} is not finite`);
  assert.ok(sample.cameraRadiusScale > .35 && sample.cameraRadiusScale < 1.6, `sample ${index}: camera radius out of authored range`);
  assert.ok(sample.cameraFov >= 26 && sample.cameraFov <= 38, `sample ${index}: FOV invalid`);
  assert.ok(sample.stageExpand >= 0 && sample.stageExpand <= 1.001, `sample ${index}: stage expansion invalid`);
  assert.ok(sample.cadMix >= 0 && sample.cadMix <= 1.001, `sample ${index}: CAD mix invalid`);
  assert.ok(sample.inkMix >= 0 && sample.inkMix <= 1.001, `sample ${index}: INK mix invalid`);
  const focusSum = sample.focusProduct + sample.focusDisplay + sample.focusKeyboard + sample.focusKnob + sample.focusMainboard;
  assert.ok(focusSum > .2, `sample ${index}: semantic camera target lost all weight`);
}

const sphericalPosition = (sample) => {
  const az = sample.cameraAzimuth * Math.PI / 180;
  const el = sample.cameraElevation * Math.PI / 180;
  const r = sample.cameraRadiusScale;
  return [
    Math.sin(az) * Math.cos(el) * r,
    -Math.cos(az) * Math.cos(el) * r,
    Math.sin(el) * r,
  ];
};
const positions = samples.map(sphericalPosition);
const speeds = [];
const vectors = [];
for (let i = 1; i < positions.length; i++) {
  const v = positions[i].map((value, axis) => value - positions[i - 1][axis]);
  vectors.push(v);
  speeds.push(Math.hypot(...v));
}
const sorted = speeds.filter((value) => value > 1e-7).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)] || 1;
const maxSpeed = Math.max(...speeds);
assert.ok(maxSpeed < median * 8.5, `isolated camera speed spike detected: max/median=${(maxSpeed / median).toFixed(2)}`);

let worstTangent = 0;
for (let i = 1; i < vectors.length; i++) {
  const a = vectors[i - 1], b = vectors[i];
  const na = Math.hypot(...a), nb = Math.hypot(...b);
  if (na < median * .12 || nb < median * .12) continue; // intentional near-stop / reversal gate
  const dot = a.reduce((sum, value, axis) => sum + value * b[axis], 0) / (na * nb);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  worstTangent = Math.max(worstTangent, angle);
}
assert.ok(worstTangent < Math.PI * .72, `camera changes direction while still moving too fast: ${(worstTangent * 180 / Math.PI).toFixed(1)}°`);

const observedBeats = [...new Set(times.map((time) => beatAt(time).id))];
assert.deepEqual(observedBeats, BEAT_RANGES.map(([id]) => id));
assert.ok(MOTION_TRACKS.length >= 80, 'long-form choreography unexpectedly collapsed');

console.log(`model: ${A340_PROFILE.label}`);
console.log(`beats: ${observedBeats.join(' → ')}`);
console.log(`timeline: ${TOTAL_TIME} units / ${MOTION_TRACKS.length} tracks / ${sampleCount} samples`);
console.log(`camera speed max/median: ${(maxSpeed / median).toFixed(2)}`);
console.log(`worst moving tangent: ${(worstTangent * 180 / Math.PI).toFixed(1)}°`);
console.log('RESULT: PASS — A3.40 nine-beat deterministic product-film gates');
