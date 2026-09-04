import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { A340_PROFILE, roleIds } from './animejs/js/model-profile.js';
import { BEAT_RANGES, SHOTS, TOTAL_TIME, beatAt, evaluateMotion } from './animejs/js/film.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('animejs/index.html');
const css = read('animejs/css/style.css');
const main = read('animejs/js/main.js');
const scene = read('animejs/js/model-scene.js');
const engine = read('animejs/js/film-engine.js');
const ui = read('animejs/js/film-ui.js');
const manifest = JSON.parse(read('animejs/ASSEMBLY_MANIFEST.json'));
const pkg = JSON.parse(read('animejs/package.json'));

assert.deepEqual(Object.keys(pkg.dependencies || {}), ['animejs'], 'Ponytail gate: no new runtime dependency');
assert.equal(pkg.dependencies.animejs.replace(/^\^/, ''), '4.5.0');

assert.equal(A340_PROFILE.id, 'industrial_a3_40');
assert.equal(A340_PROFILE.revision, 'A3.40_EC11_BEZEL_CLEARANCE');
assert.equal(A340_PROFILE.dimensions.sceneObjectCount, 231);
assert.equal(A340_PROFILE.dimensions.printablePartCount, 11);
assert.equal(A340_PROFILE.dimensions.knobWellDiameter, 26);
assert.equal(A340_PROFILE.dimensions.knobOuterDiameter, 24);
assert.ok(!('webAdaptation' in A340_PROFILE), 'A3.32 fallback adaptation must stay removed');

assert.equal(manifest.profile.id, 'industrial_a3_40');
assert.equal(manifest.partCount, 231);
assert.equal(manifest.parts.length, 231);
const ids = new Set(manifest.parts.map((part) => part.id));
for (const [role, values] of Object.entries(A340_PROFILE.roles)) {
  for (const id of roleIds(role)) assert.ok(ids.has(id), 'role ' + role + ' cannot resolve ' + id);
}

const countBy = (field) => Object.fromEntries([...new Set(manifest.parts.map((part) => part[field]))].map((value) => [value, manifest.parts.filter((part) => part[field] === value).length]));
assert.deepEqual(countBy('group'), { enclosure: 3, fasteners: 7, controls: 8, input: 54, compute: 137, power: 22 });
assert.deepEqual(countBy('truthLevel'), { exact: 11, reference: 45, reconstructed: 13, datasheet: 23, schematic: 69, concept: 70 });
assert.equal(manifest.parts.filter((part) => part.printable).length, 11);
for (const part of manifest.parts) {
  assert.ok(fs.existsSync(path.join(root, 'animejs/stl', part.filename)), 'missing STL: ' + part.filename);
  assert.equal(part.explodeVectorMm.length, 3, 'explode vector missing: ' + part.id);
  part.explodeVectorMm.forEach((value) => assert.ok(Number.isFinite(value), 'explode vector invalid: ' + part.id));
}
assert.equal(fs.readdirSync(path.join(root, 'animejs/stl')).filter((file) => file.endsWith('.stl')).length, 231, 'STL folder must match the manifest exactly');

const vectorKey = (part) => JSON.stringify(part.explodeVectorMm);
const groupVectors = (group) => [...new Set(manifest.parts.filter((part) => part.group === group).map(vectorKey))];
assert.deepEqual(groupVectors('compute'), ['[0,-3,22]'], 'Compute base explosion must remain rigid');
assert.deepEqual(groupVectors('power'), ['[0,5,-18]'], 'Power base explosion must remain rigid');
assert.equal(manifest.parts.filter((part) => part.group === 'input' && !/^choc_v2_/.test(part.id)).every((part) => vectorKey(part) === '[0,1,15]'), true, 'Input PCB electronics must remain rigid');

const expectedShots = [
  'teaser', 'reveal', 'controls', 'knob', 'keypress', 'ha', 'turn', 'xray',
  'safe-open', 'explode', 'core-out', 'board', 'display-stack', 'lcd', 'cpu', 'wireless',
  'imu', 'storage', 'headers', 'power', 'input-pcb', 'printable', 'reassemble', 'final',
];
assert.equal(SHOTS.length, 24);
assert.deepEqual(SHOTS.map((shot) => shot.id), expectedShots);
assert.deepEqual(BEAT_RANGES.map(([id]) => id), expectedShots);
assert.equal((html.match(/class="beat-panel/g) || []).length, 24, 'DOM must contain 24 shot panels');
assert.equal((html.match(/class="part-callout"/g) || []).length, 4, 'four reusable leader lines are required');
assert.ok(html.includes('id="model-loading"'));
assert.ok(html.includes('id="loading-percent"'));
assert.ok(html.includes('3.7V 薄型 Li-Po'));
assert.ok(html.includes('11 个部件。<br />全部可打印'));
assert.ok(!/(?:个人练习|不是商品|按相反顺序|用于演示内部叙事|演示数字孪生|Three\.js \+ Anime\.js|TECHNICAL TURN|SAFE CLEARANCE|DIGITAL TWIN|REASSEMBLY|INDEPENDENT HARDWARE PROJECT|Exact 可打印件|键帽直线抬升|上壳随后开启|键轴保持原位|Camera FPC)/.test(html + ui), 'public copy must stay launch-facing');
assert.ok(engine.includes("['色温', '3800 K', true]"), 'visible interface must preserve the 3800K lighting reference');
for (const fact of ['2.0 英寸 240 × 320、262K 色', 'ESP32-S3R8', '8MB PSRAM', '16MB Flash', 'MQTT Discovery', 'QMI8658', 'MicroSD', 'USB-C', 'Battery detect', '11 个部件']) {
  assert.ok(html.includes(fact), 'missing product fact: ' + fact);
}

assert.ok(main.includes('createModelScene(canvas, updateLoading)'), 'loading UI must receive real model progress');
assert.ok(main.includes('model.root.visible = true'), 'model must remain hidden until complete');
assert.ok(main.includes("loadingStatus.textContent = '模型加载失败'"), 'loading failure state must be visible');
assert.ok(scene.includes('root.visible = false'));
assert.ok(scene.includes('await Promise.all(manifest.parts.map(loadPart))'));
assert.ok(scene.includes('模型零件加载失败'), 'missing STL must reject instead of partially reveal');
assert.ok(scene.includes('detailExplode'), 'compute components need one deterministic spatial spread field');
assert.ok(scene.includes('detailMembers.forEach'), 'component spread must be precomputed once');
assert.ok(!scene.includes('__a340_well_patch'), 'synthetic A3.32 well patch must not return');
assert.ok(scene.includes('shouldOutline(data)'), 'outlines must stay limited to readable parts');
assert.ok(!/metalness:\s*\.(?:[1-9]\d*)/.test(scene), 'materials must stay non-metallic');
assert.ok(css.includes("body[data-loading='true'] { overflow: hidden; }"));
assert.ok(css.includes('.part-callouts'));
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
assert.ok(ui.includes('engine.project(anchor)'), 'leader lines must track real 3D parts');
assert.ok(ui.includes('scaleX('), 'leader lines must draw progressively');

const at = (id, progress) => {
  const [, start, end] = BEAT_RANGES.find(([shot]) => shot === id);
  return evaluateMotion(start + (end - start) * progress);
};
const numericKeys = [
  'cameraTargetMix', 'cameraAzimuth', 'cameraElevation', 'cameraRadiusScale', 'cameraFov',
  'framingX', 'framingY', 'backgroundFrom', 'backgroundTo', 'backgroundMix', 'uiLightMix',
  'lineArt', 'focusMix', 'controlLift', 'controlFan', 'shellOpen', 'switchOpen',
  'internalOpen', 'displayLayer', 'componentSpread', 'computeTurn', 'computeExplode',
  'powerExplode', 'inputExplode', 'printableLayout', 'keyPress', 'knobRotation',
  'shellOpacity', 'lcdIntensity', 'keyGlow', 'teaserMix', 'technicalMix', 'edgeMix',
];
const unitKeys = [
  'cameraTargetMix', 'backgroundMix', 'uiLightMix', 'lineArt', 'focusMix', 'controlLift',
  'controlFan', 'shellOpen', 'switchOpen', 'internalOpen', 'displayLayer', 'componentSpread',
  'computeTurn', 'computeExplode', 'powerExplode', 'inputExplode', 'printableLayout',
];
const samples = Array.from({ length: 6001 }, (_, index) => evaluateMotion(TOTAL_TIME * index / 6000));
assert.deepEqual(samples, Array.from({ length: 6001 }, (_, index) => evaluateMotion(TOTAL_TIME * index / 6000)), 'motion must be deterministic');
for (const sample of samples) {
  for (const key of numericKeys) assert.ok(Number.isFinite(sample[key]), key + ' must remain finite');
  assert.ok(sample.cameraRadiusScale >= .30 && sample.cameraRadiusScale <= 1.40);
  assert.ok(sample.cameraFov >= 27 && sample.cameraFov <= 33);
  for (const key of unitKeys) assert.ok(sample[key] >= 0 && sample[key] <= 1, key + ' outside 0..1');
  if (sample.controlFan > .0001) assert.ok(sample.controlLift > .999 && sample.shellOpen > .999, 'controls may fan only after straight lift and shell opening');
  if (sample.switchOpen > .0001 || sample.internalOpen > .0001) assert.ok(sample.shellOpen > .999, 'switches and internals may move only after shell opening');
  if (sample.shellOpen < .999) assert.ok(sample.controlFan < .0001 && sample.switchOpen < .0001 && sample.internalOpen < .0001, 'shell motion needs clear paths');
  if (Math.abs(sample.keyPress) > .0001) {
    assert.ok(sample.keyPress >= -3.45 && sample.keyPress <= 0, 'key travel exceeds clearance budget');
    for (const key of ['controlLift', 'controlFan', 'shellOpen', 'switchOpen', 'internalOpen']) assert.equal(sample[key], 0, 'key press must happen only while assembled');
  }
}

for (let index = 1; index < BEAT_RANGES.length; index += 1) {
  const boundary = BEAT_RANGES[index][1];
  const before = evaluateMotion(boundary - .001);
  const after = evaluateMotion(boundary);
  const boundaryKeys = [
    'cameraAzimuth', 'cameraElevation', 'cameraRadiusScale', 'cameraFov', 'framingX', 'framingY',
    'uiLightMix', 'lineArt', 'controlLift', 'controlFan', 'shellOpen', 'switchOpen', 'internalOpen',
    'displayLayer', 'componentSpread', 'computeTurn', 'computeExplode', 'powerExplode',
    'inputExplode', 'printableLayout', 'keyPress', 'knobRotation', 'shellOpacity',
    'lcdIntensity', 'keyGlow', 'teaserMix', 'technicalMix', 'edgeMix',
  ];
  for (const key of boundaryKeys) assert.ok(Math.abs(before[key] - after[key]) < .01, key + ' hard-cuts at shot ' + (index + 1));
}

const cameraKeys = ['cameraAzimuth', 'cameraElevation', 'cameraRadiusScale', 'cameraFov', 'framingX', 'framingY'];
const actionKeys = ['controlLift', 'controlFan', 'shellOpen', 'switchOpen', 'internalOpen', 'displayLayer', 'componentSpread', 'computeTurn', 'printableLayout', 'keyPress', 'knobRotation'];
for (const [id, start, end] of BEAT_RANGES) {
  const local = Array.from({ length: 181 }, (_, index) => evaluateMotion(start + (end - start) * index / 180));
  for (let index = 1; index < local.length; index += 1) {
    const before = local[index - 1];
    const after = local[index];
    const cameraMoves = cameraKeys.some((key) => Math.abs(after[key] - before[key]) > 1e-5);
    const activeActions = actionKeys.filter((key) => Math.abs(after[key] - before[key]) > 1e-5);
    assert.ok(!(cameraMoves && activeActions.length), id + ' moves camera and structure at the same time');
    assert.ok(activeActions.length <= 1, id + ' runs overlapping structure actions: ' + activeActions.join(', '));
  }
}

assert.ok(SHOTS.every((shot, index) => index === 0 || shot.az >= SHOTS[index - 1].az), 'camera orbit must remain clockwise');
assert.deepEqual([...new Set(SHOTS.map((shot) => shot.target))], ['product', 'compute', 'power', 'inputBoards'], 'camera targets must stay on the approved stage centers');
assert.equal(at('safe-open', .50).controlLift, 1);
assert.equal(at('safe-open', .50).shellOpen, 0);
assert.equal(at('safe-open', .82).shellOpen, 1);
assert.equal(at('safe-open', .82).switchOpen, 0);
assert.equal(at('explode', .50).controlFan, 1);
assert.equal(at('explode', .50).switchOpen, 0);
assert.equal(at('explode', .66).switchOpen, 1);
assert.equal(at('explode', .66).internalOpen, 0);
assert.ok(at('explode', .90).internalOpen > .99);
assert.equal(at('core-out', .90).internalOpen, 1, 'spatial explosion must persist into the compute chapter');
assert.ok(at('board', .90).componentSpread > .99, 'compute details must reach the spatial exploded view');
assert.ok(at('display-stack', .90).displayLayer > .99);
assert.equal(at('lcd', .90).displayLayer, 0);
assert.ok(at('cpu', .90).computeTurn > .99, 'compute board must turn once for the component side');
assert.ok(at('power', .90).internalOpen > .99, 'all-in-one assembly must persist into power');
assert.ok(at('input-pcb', .90).internalOpen > .99, 'all-in-one assembly must persist into input');
assert.ok(at('printable', .90).printableLayout > .99);

const final = at('final', .5);
for (const key of ['controlLift', 'controlFan', 'shellOpen', 'switchOpen', 'internalOpen', 'displayLayer', 'componentSpread', 'computeTurn', 'computeExplode', 'powerExplode', 'inputExplode', 'printableLayout', 'keyPress', 'knobRotation']) {
  assert.equal(final[key], 0, key + ' must return home before the final portrait');
}
assert.deepEqual([...new Set(samples.map((sample) => beatAt(sample.filmTime).id))], expectedShots);

assert.ok(engine.includes('export const CONTROL_LIFT_MM = 8'), 'external controls require one explicit straight-lift clearance');
assert.ok(engine.includes('offset.lerp(part.explode, state.controlFan)'), 'external controls need lift-then-fan paths');
assert.ok(engine.includes("roleMatch(part, 'switches') || roleMatch(part, 'encoder')"), 'switches and encoder need their own post-shell track');
assert.ok(engine.includes('part.pivot.position.addScaledVector(part.detailExplode, spread)'), 'compute details must use the deterministic spatial spread');
assert.ok(engine.includes("filter((part) => part.group === 'compute')"), 'compute parts must turn as one group');
assert.ok(engine.includes('from.clone().lerp(to, state.cameraTargetMix)'), 'camera targets must blend instead of hard-cutting');
assert.ok(new Set(SHOTS.map((shot) => shot.bg)).size >= 7, 'film needs visibly varied environments');
assert.ok(Math.max(...SHOTS.map((shot) => shot.line)) === 1, 'film needs a full line-art mode');
const featureFacts = [...html.matchAll(/<span class="shot-spec">([^<]+)<\/span>/g)].map((match) => match[1]);
assert.equal(featureFacts.length, 24);
assert.ok(featureFacts.every((fact) => !/(?:俯角|方位|镜头|焦距|mm lens)/i.test(fact)), 'visible shot facts must describe the product');

console.log('model: ' + manifest.profile.label);
console.log('assets: ' + manifest.parts.length + ' STL / ' + manifest.parts.filter((part) => part.printable).length + ' printable');
console.log('shots: ' + SHOTS.length + ' / timeline: ' + TOTAL_TIME + ' units / samples: ' + samples.length);
console.log('RESULT: PASS — continuous A3.40 product film contracts');
