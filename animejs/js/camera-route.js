import * as THREE from '../vendor/three.module.js';
import { SHOTS, BEAT_RANGES, TOTAL_TIME } from './film.js';
import { roleIds } from './model-profile.js';

const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 0, 1);
const readablePoses = {
  controls: { az: 120, el: 35 }, dial: { az: -30, el: 15 },
  encoder: { az: 30, el: 15 }, service: { az: 15, el: 35 },
  customize: { az: 45, el: 15 },
};

/** Call after space.update(). Returns world position / target / fov.
 * sample(time,{aspect,mobile,openingPose}) returns null during chapters 1–3.
 * openingPose(time) optionally supplies their exact {position,target,fov} for
 * the handoff into constellation. Do not apply another lookAt text offset.
 */
export function createCameraRoute(model) {
  const { parts } = model;
  const world = p => p.pivot.getWorldPosition(new THREE.Vector3());
  const optical = ['lcd_rear_frame', 'lcd_diffuser', 'lcd_rear_polarizer', 'lcd_front_cover_glass'];
  const focus = role => {
    const ids = role === 'optical' ? optical : roleIds(role).slice(0, 1);
    const members = ids.map(id => parts.get(id)).filter(Boolean);
    const point = new THREE.Vector3(); members.forEach(p => point.add(world(p)));
    return members.length ? point.multiplyScalar(1 / members.length) : world(parts.get(roleIds('mainboard')[0]));
  };
  const bounds = () => {
    const box = new THREE.Box3();
    for (const p of parts.values()) {
      if (!p.data.printable && p.group !== 'lcd' && p.id !== roleIds('mainboard')[0]) continue;
      const [lo, hi] = p.data.bboxMm;
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
        box.expandByPoint(new THREE.Vector3(x, y, z).sub(p.sourceCenter).applyMatrix4(p.pivot.matrixWorld));
      }
    }
    return box.getBoundingSphere(new THREE.Sphere());
  };
  function pose(index, time, aspect, mobile) {
    const shot = { ...SHOTS[index], ...readablePoses[SHOTS[index].id] };
    const target = focus(shot.focus);
    // Gentle drift continues through reading windows and transition endpoints.
    const az = (shot.az + Math.sin(time / 14000) * 1.4) * DEG, el = shot.el * DEG;
    const distance = shot.distance * (mobile ? 1.7 : Math.max(1, 1.6 / aspect));
    const position = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)).multiplyScalar(distance));
    return { position, target, fov: shot.lens, focus: shot.focus };
  }
  function sample(time, { aspect = 16 / 9, mobile = false, openingPose } = {}) {
    time = Math.max(0, Math.min(TOTAL_TIME, time));
    let index = BEAT_RANGES.findIndex(([, a, b]) => time >= a && time < b);
    if (index < 0) index = SHOTS.length - 1;
    // A wide transition starts before the destination's chapter boundary.
    let boundary = null;
    for (let i = 3; i < SHOTS.length; i++) {
      const at = BEAT_RANGES[i][1], span = Math.min(SHOTS[i - 1].duration, SHOTS[i].duration) * .31;
      if (time >= at - span && time <= at + span) { boundary = { i, at, span }; break; }
    }
    if (!boundary) return index < 3 ? null : { ...pose(index, time, aspect, mobile), transition: 0 };
    const { i, at, span } = boundary;
    const before = i === 3 && openingPose ? openingPose(time) : pose(i - 1, time, aspect, mobile);
    const after = pose(i, time, aspect, mobile);
    const u = ease((time - at + span) / (2 * span));
    const separation = before.target.distanceTo(after.target);
    if (separation < 18) {
      return { position: before.position.clone().lerp(after.position, u), target: before.target.clone().lerp(after.target, u), fov: THREE.MathUtils.lerp(before.fov, after.fov, u), transition: Math.sin(Math.PI * u) ** 2 };
    }
    const sphere = bounds();
    const center = sphere.center;
    const from = before.position.clone().sub(center), to = after.position.clone().sub(center);
    const a = from.clone().normalize(), b = to.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(a, b);
    const direction = a.applyQuaternion(new THREE.Quaternion().slerp(q, u));
    const bridge = Math.sin(Math.PI * u) ** 2;
    const radius = THREE.MathUtils.lerp(from.length(), to.length(), u);
    // Orbit outside the occupied product volume instead of cutting through it.
    const outside = Math.max(radius, sphere.radius * 1.35);
    const position = center.clone().addScaledVector(direction, THREE.MathUtils.lerp(radius, outside, Math.sqrt(bridge)));
    const target = before.target.clone().lerp(after.target, u);
    const pairCenter = before.target.clone().add(after.target).multiplyScalar(.5);
    target.lerp(pairCenter, bridge);
    const forward = target.clone().sub(position).normalize();
    const right = forward.clone().cross(UP).normalize(), up = right.clone().cross(forward).normalize();
    let required = 0;
    // Both subjects fit during the bridge, with real object size as margin.
    for (const subject of [before.target, after.target]) {
      const delta = subject.clone().sub(position), depth = Math.max(1, delta.dot(forward));
      required = Math.max(required, Math.atan((Math.abs(delta.dot(up)) + 32) / depth), Math.atan((Math.abs(delta.dot(right)) + 32) / (depth * aspect)));
    }
    const base = THREE.MathUtils.lerp(before.fov, after.fov, u);
    const wide = Math.min(65, Math.max(base, required * 2 / DEG + 5));
    return { position, target, fov: THREE.MathUtils.lerp(base, wide, bridge), transition: bridge };
  }
  return { sample, focus };
}
