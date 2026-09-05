import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as THREE from './animejs/vendor/three.module.js';
import { createExplosionSpace } from './animejs/js/explosion-space.js';
import { A343_PROFILE, roleIds } from './animejs/js/model-profile.js';
import { BEAT_RANGES, SHOTS, TOTAL_TIME, beatAt, evaluateMotion } from './animejs/js/film.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(root, 'animejs/public/models/a343');
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'ASSEMBLY_MANIFEST.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'animejs/index.html'), 'utf8');
assert.equal(manifest.profile.id, A343_PROFILE.id);
assert.equal(manifest.parts.length, 471);
assert.equal(manifest.partCount, manifest.parts.length);
assert.equal(A343_PROFILE.dimensions.sceneObjectCount, manifest.parts.length);
assert.equal(manifest.parts.filter(part => part.printable).length, 11);
const ids = new Set(manifest.parts.map(part => part.id));
assert.equal(ids.size, manifest.parts.length, 'part IDs must be unique');
for (const role of Object.keys(A343_PROFILE.roles)) {
  for (const id of roleIds(role)) assert.ok(ids.has(id), `Missing role ${role}: ${id}`);
}
let triangles = 0;
for (const part of manifest.parts) {
  const stl = gunzipSync(fs.readFileSync(path.join(assetRoot, 'stl', part.filename + '.gz')));
  assert.equal(createHash('sha256').update(stl).digest('hex'), part.meshSha256, `STL integrity: ${part.id}`);
  const count = stl.readUInt32LE(80);
  assert.equal(stl.length, 84 + count * 50, `Binary STL length: ${part.id}`);
  triangles += count;
  const keys = part.explodeKeyframesMm;
  assert.ok(keys.length >= 2, `Missing canonical path: ${part.id}`);
  assert.deepEqual(keys[0], [0, [0, 0, 0]], `Assembled path start: ${part.id}`);
  assert.equal(keys.at(-1)[0], 1, `Canonical path end: ${part.id}`);
  assert.deepEqual(keys.at(-1)[1], part.explodeVectorMm, `Endpoint metadata: ${part.id}`);
  for (let i = 0; i < keys.length; i++) {
    const [time, vector] = keys[i];
    assert.ok(Number.isFinite(time) && time >= 0 && time <= 1);
    assert.ok(i === 0 || time > keys[i - 1][0], `Path ordering: ${part.id}`);
    assert.equal(vector.length, 3);
    assert.ok(vector.every(Number.isFinite), `Finite path coordinates: ${part.id}`);
  }
}

assert.equal(SHOTS.length, 24);
assert.deepEqual(BEAT_RANGES.map(([id]) => id), SHOTS.map(shot => shot.id));
assert.equal(BEAT_RANGES[0][1], 0);
assert.equal(BEAT_RANGES.at(-1)[2], TOTAL_TIME);
for (let i = 0; i < BEAT_RANGES.length; i++) {
  const [id, start, end] = BEAT_RANGES[i];
  assert.ok(end > start);
  if (i) assert.equal(start, BEAT_RANGES[i - 1][2]);
  assert.equal(beatAt((start + end) / 2).id, id);
  assert.equal([...html.matchAll(new RegExp(`<section\\s+id="${id}"`, 'g'))].length, 1, `Missing/duplicate chapter: ${id}`);
  assert.ok(html.includes(`data-beat="${id}"`), `Missing chapter content: ${id}`);
}
const unitKeys = ['explosion', 'field', 'lineArt', 'technicalMix', 'paper', 'hero', 'focusCore', 'focusControls', 'signal'];
const sampleCount = 481;
for (let i = 0; i < sampleCount; i++) {
  const time = TOTAL_TIME * i / (sampleCount - 1);
  const state = evaluateMotion(time);
  assert.deepEqual(state, evaluateMotion(time), 'Motion evaluation must be deterministic');
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `Nonfinite state: ${key}`);
  }
  for (const key of unitKeys) assert.ok(state[key] >= 0 && state[key] <= 1, `State outside 0..1: ${key}`);
}
const discreteKeys = new Set(['shotIndex', 'shotProgress', 'focusCore', 'focusControls']);
for (const [, boundary] of BEAT_RANGES.slice(1)) {
  const before = evaluateMotion(boundary - 0.001);
  const after = evaluateMotion(boundary + 0.001);
  for (const [key, value] of Object.entries(before)) {
    if (typeof value === 'number' && !discreteKeys.has(key)) {
      assert.ok(Math.abs(value - after[key]) < 0.01, `State discontinuity at ${boundary}: ${key}`);
    }
  }
}
// Runtime routes restore real assembled poses and preserve rigid optical clusters.
const sceneRoot=new THREE.Group();
const parts=new Map(manifest.parts.map(data=>{
 const home=new THREE.Vector3(...data.bboxMm[0]).add(new THREE.Vector3(...data.bboxMm[1])).multiplyScalar(.5);
 const pivot=new THREE.Group();sceneRoot.add(pivot);return[data.id,{id:data.id,group:data.group,data,home,pivot}];
}));
const space=createExplosionSpace({parts,root:sceneRoot});
for(let i=0;i<=100;i++){
 space.update(i/100);
 for(const p of parts.values())assert.ok([...p.pivot.position.toArray(),...p.pivot.quaternion.toArray()].every(Number.isFinite),`Invalid transform: ${p.id}`);
}
space.update(0);
for(const p of parts.values()){
 assert.ok(p.pivot.position.distanceTo(p.home)<1e-9,`Assembly return: ${p.id}`);
 assert.ok(p.pivot.quaternion.angleTo(new THREE.Quaternion())<1e-9,`Assembly orientation: ${p.id}`);
}
for(const shot of SHOTS){
 for(const key of ['lens','az','el','distance','duration'])assert.ok(Number.isFinite(shot[key]),`Shot ${shot.id} missing ${key}`);
 assert.ok(shot.lens>10&&shot.lens<60);assert.ok(shot.distance>0);
}
assert.equal(evaluateMotion(0).explosion, 0);
assert.equal(evaluateMotion(TOTAL_TIME).explosion, 0);
console.log(`PASS: A3.43, ${ids.size} objects / ${triangles.toLocaleString()} triangles, lossless gzip integrity and canonical paths.`);
console.log(`PASS: ${SHOTS.length} HTML chapters, ${sampleCount} timeline samples, state continuity and explosion bounds.`);
console.log('Camera composition, motion quality, lighting and real browser performance require visual review.');
