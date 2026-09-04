import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A340_PROFILE, roleIds } from './animejs/js/model-profile.js';
import { BEAT_RANGES, MOTION_TRACKS, TOTAL_TIME, beatAt, evaluateMotion } from './animejs/js/film.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('animejs/index.html');
const main = read('animejs/js/main.js');
const filmSource = read('animejs/js/film.js');
const uiSource = read('animejs/js/film-ui.js');
const sceneSource = read('animejs/js/model-scene.js');
const manifest = JSON.parse(read('animejs/ASSEMBLY_MANIFEST.json'));
const pkg = JSON.parse(read('animejs/package.json'));

assert.equal(pkg.dependencies?.animejs?.replace(/^\^/, ''), '4.5.0', 'animejs 4.5.0 must remain the runtime dependency');
assert.equal(A340_PROFILE.revision, 'A3.40_EC11_BEZEL_CLEARANCE');
assert.equal(A340_PROFILE.dimensions.knobWellDiameter, 26);
assert.equal(A340_PROFILE.dimensions.knobOuterDiameter, 24);
assert.deepEqual(A340_PROFILE.dimensions.screenCenter, [0, 14]);
assert.equal(A340_PROFILE.dimensions.width, 120);
assert.equal(A340_PROFILE.dimensions.depth, 81);
assert.ok(Math.abs(A340_PROFILE.dimensions.faceAngleDeg - 9.049) < .002, 'A3.40 face angle must match the 120×81 frozen envelope');
assert.deepEqual(A340_PROFILE.webAdaptation.keycapTarget, [17, 15, 8.3], 'PR#30 keycap total silhouette drifted');

const ids = new Set((manifest.parts || []).map((part) => part.id));
for (const role of Object.keys(A340_PROFILE.roles)) {
  for (const id of roleIds(role)) assert.ok(ids.has(id), `A3.40 role ${role} cannot resolve ${id}`);
}

assert.equal(BEAT_RANGES.length, 9, 'product film must contain nine long-form beats');
assert.deepEqual(BEAT_RANGES.map(([id]) => id), ['hero', 'stage', 'blueprint', 'form', 'input', 'control', 'display', 'compute', 'final']);
assert.ok(TOTAL_TIME >= 16000, 'film authoring travel is too short');
assert.equal((html.match(/class="film-beat/g) || []).length, 9, 'DOM film beat count drifted');
assert.equal((html.match(/class="blueprint-label /g) || []).length, 5, 'Blueprint must keep five stable labels');
assert.equal((html.match(/data-beat="input" data-role=/g) || []).length, 3, 'Input macro callouts must stay at three');
assert.equal((html.match(/data-beat="compute" data-role=/g) || []).length, 3, 'Compute macro callouts must stay at three');

assert.ok(main.includes('createFilmTimeline'), 'runtime must use the Anime.js film timeline');
assert.ok(!main.includes('detectShot('), 'legacy shot detector must not return');
assert.ok(!main.includes('const SHOTS'), 'legacy SHOTS state machine must not return');
assert.equal((main.match(/requestAnimationFrame\(frame\)/g) || []).length, 2, 'there must be one render-loop bootstrap and one recursive RAF');
assert.ok(filmSource.includes('timeline.label('), 'master Anime.js timeline must expose editorial labels');
assert.ok(filmSource.includes("sync: true"), 'main film must map scroll progress directly');
assert.ok(filmSource.includes('stagger('), 'Anime.js stagger must drive physical keycap motion');
assert.ok(uiSource.includes('const overlap = 250'), 'copy handoff overlap must remain explicit');
assert.ok(uiSource.includes('engine.productRect()'), 'Blueprint leader routing must use product clearance bounds');
assert.ok(sceneSource.includes('lcd.rotation.x = FACE_ANGLE'), 'LCD stage plane must follow the sloped physical display plane');

const sampleCount = 1701;
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
  assert.ok(sample.cameraRadiusScale > .35 && sample.cameraRadiusScale < 1.6, `sample ${index}: camera radius out of range`);
  assert.ok(sample.cameraFov >= 26 && sample.cameraFov <= 38, `sample ${index}: FOV invalid`);
  for (const key of ['stageExpand', 'stageStrength', 'cadMix', 'inkMix', 'blueprintSeparation', 'serviceCoverOpen', 'boardLift', 'boardFlip']) {
    assert.ok(sample[key] >= -.001 && sample[key] <= 1.001, `sample ${index}: ${key} outside 0..1`);
  }
  const focusSum = sample.focusProduct + sample.focusDisplay + sample.focusKeyboard + sample.focusKnob + sample.focusMainboard;
  assert.ok(focusSum > .2, `sample ${index}: semantic target lost all weight`);
}

for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], b = samples[i];
  assert.ok(Math.abs(b.cameraAzimuth - a.cameraAzimuth) < 1.4, `azimuth hard step at sample ${i}`);
  assert.ok(Math.abs(b.cameraElevation - a.cameraElevation) < 1.2, `elevation hard step at sample ${i}`);
  assert.ok(Math.abs(b.cameraRadiusScale - a.cameraRadiusScale) < .03, `radius hard step at sample ${i}`);
  assert.ok(Math.abs(b.focusDisplay - a.focusDisplay) < .06, `display focus hard step at sample ${i}`);
  assert.ok(Math.abs(b.focusKeyboard - a.focusKeyboard) < .06, `keyboard focus hard step at sample ${i}`);
  assert.ok(Math.abs(b.focusKnob - a.focusKnob) < .06, `knob focus hard step at sample ${i}`);
  assert.ok(Math.abs(b.focusMainboard - a.focusMainboard) < .06, `mainboard focus hard step at sample ${i}`);
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
const vectors = [];
const speeds = [];
for (let i = 1; i < positions.length; i++) {
  const vector = positions[i].map((value, axis) => value - positions[i - 1][axis]);
  vectors.push(vector);
  speeds.push(Math.hypot(...vector));
}
const movingSpeeds = speeds.filter((value) => value > 1e-7).sort((a, b) => a - b);
const median = movingSpeeds[Math.floor(movingSpeeds.length / 2)] || 1;
const maxSpeed = Math.max(...speeds);
assert.ok(maxSpeed < median * 7.0, `isolated camera speed spike: max/median=${(maxSpeed / median).toFixed(2)}`);

let worstTangent = 0;
for (let i = 1; i < vectors.length; i++) {
  const a = vectors[i - 1], b = vectors[i];
  const na = Math.hypot(...a), nb = Math.hypot(...b);
  if (na < median * .16 || nb < median * .16) continue;
  const dot = a.reduce((sum, value, axis) => sum + value * b[axis], 0) / (na * nb);
  worstTangent = Math.max(worstTangent, Math.acos(Math.max(-1, Math.min(1, dot))));
}
assert.ok(worstTangent < Math.PI * .48, `camera turns too sharply while moving: ${(worstTangent * 180 / Math.PI).toFixed(1)}°`);

assert.deepEqual([...new Set(times.map((time) => beatAt(time).id))], BEAT_RANGES.map(([id]) => id));
assert.ok(MOTION_TRACKS.length >= 110, 'long-form choreography unexpectedly collapsed');

console.log(`model: ${A340_PROFILE.label}`);
console.log(`beats: ${BEAT_RANGES.map(([id]) => id).join(' → ')}`);
console.log(`timeline: ${TOTAL_TIME} units / ${MOTION_TRACKS.length} tracks / ${sampleCount} samples`);
console.log(`camera speed max/median: ${(maxSpeed / median).toFixed(2)}`);
console.log(`worst moving tangent: ${(worstTangent * 180 / Math.PI).toFixed(1)}°`);
console.log('RESULT: PASS — A3.40 nine-beat continuity gates');
