import * as THREE from '../vendor/three.module.js';
import { roleId, roleIds, A343_PROFILE as PROFILE } from './model-profile.js';

const v = a => new THREE.Vector3(...a);
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const angle = PROFILE.dimensions.faceAngleDeg * Math.PI / 180;
const normal = v([0, -Math.sin(angle), Math.cos(angle)]);
const identity = new THREE.Quaternion();

// A presentation space, independent of the engineering disassembly keyframes.
// All transforms start at the assembled source poses and reverse exactly.
export function createExplosionSpace(model) {
  const { parts, root } = model;
  const all = [...parts.values()], assigned = new Set(), tracks = [];
  const select = role => roleIds(role).map(id => parts.get(id)).filter(Boolean);
  const board = parts.get(roleId('mainboard'));
  const core = board.home.clone().add(v([0, -5, -76]));
  const right = v([.906, .423, 0]), up = v([.366, -.785, .5]), depth = v([-.211, .453, .866]);
  const point = a => core.clone().addScaledVector(right, a[0]).addScaledVector(up, a[1]).addScaledVector(depth, a[2]);
  const add = (members, xyz, lift, rotation = [0, 0, 0], delay = 0, lane = null) => {
    members = members.filter(p => !assigned.has(p.id));
    if (!members.length) return;
    const home = new THREE.Vector3();
    members.forEach(p => { home.add(p.home); assigned.add(p.id); });
    home.multiplyScalar(1 / members.length);
    const end = point(xyz), clear = home.clone().add(v(lift));
    const outer = lane ? clear.clone().add(v(lane)) : clear.clone().lerp(end, .6);
    const approach = end.clone().add(end.clone().sub(core).normalize().multiplyScalar(110));
    tracks.push({ members, home, clear, outer, approach, end, delay, rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)) });
  };
  const lift = n => normal.clone().multiplyScalar(n).toArray();
  add(select('upperShell'), [-75, 48, 30], [-75, 0, 0], [.3, -.2, -.35], .20, [-45, -20, 0]);
  add(select('serviceCover'), [75, 45, 15], [0, 0, -130], [-.3, .2, .25], 0, [130, 0, -20]);
  add(select('retainer'), [-175, -10, 25], [0, -5, -100], [.1, .25, -.3], .08, [-160, -70, -20]);
  add(select('knob'), [-62, -38, -25], lift(70), [.18, .2, -.2], .24, [-280, 130, 65]);
  add(select('screenBezel'), [78, -48, -8], lift(65), [.4, -.12, .3], .03, [0, 260, 95]);
  const keys = [[-95, 4, -18], [100, 0, -12], [-22, 115, 12], [40, -85, 18], [-96, -66, -12], [96, -62, -18]];
  select('keycaps').forEach((p, i) => add([p], keys[i], lift(65), [.1 * i, -.2, -.3 + i * .23], i * .006, [i % 2 ? 145 : -190, (i - 2) * 30, 45]));
  add(all.filter(p => p.group === 'waveshare'), [0, 0, 0], [0, -5, -76]);
  tracks.at(-1).end.add(tracks.at(-1).home.clone().sub(board.home));
  tracks.at(-1).outer.copy(tracks.at(-1).end);
  tracks.at(-1).approach.copy(tracks.at(-1).end);
  // Keep the encoder mechanism together, rather than moving its metal can alone.
  add(all.filter(p => p.id.startsWith('ec11_') && !assigned.has(p.id)), [40, -60, 12], [0, 0, -90], [.15, .3, -.25], .04, [105, -75, -10]);
  add(all.filter(p => p.group === 'power'), [-90, -55, 45], [0, 0, -130], [.2, 0, -.25], .03, [-130, 75, -15]);

  const switches = [[-160, 98, -40], [123, 78, -20], [-160, -20, -55], [125, -55, -34], [-25, -115, 10], [48, 117, -20]];
  switches.forEach((place, i) => {
    const prefix = `choc_v2_${i + 1}_`, separate = ['top_housing', 'stem', 'spring', 'active_button'];
    const lane = [place[0] < 0 ? -290 : 190, (i - 2.5) * 30, 50];
    const turn = [.12 + .06 * i, -.2 + .07 * i, -.3 + .18 * i];
    add(all.filter(p => p.id.startsWith(prefix) && !separate.some(name => p.id === prefix + name)), place, lift(65), turn, .005 * i, lane);
    separate.forEach((name, j) => {
      const d = [[-10, 17, 12], [12, 4, -9], [-7, -14, 6], [13, -12, 17]][(j + i) % 4];
      add(all.filter(p => p.id === prefix + name), place.map((n, k) => n + d[k]), lift(65 + j * 3), [turn[0] + j * .08, turn[1], turn[2] + j * .14], .005 * i, lane);
    });
  });

  // Four optical assemblies preserve their internal spacing. Each assembly has
  // its own plane and curved route; this reads as loose pages, not twelve rungs.
  const opticalSpecs = [
    [['lcd_rear_frame', 'lcd_reflector', 'lcd_light_guide'], [190, 150, -10], [.24, -.28, -.25]],
    [['lcd_diffuser', 'lcd_prism_lower', 'lcd_prism_upper'], [92, 110, 40], [-.18, .20, .32]],
    [['lcd_rear_polarizer', 'lcd_tft_lower_glass', 'lcd_cell_gap'], [142, 68, 100], [.32, .10, -.45]],
    [['lcd_color_filter_glass', 'lcd_front_polarizer', 'lcd_front_cover_glass', 'lcd_black_mask'], [108, 30, 155], [-.16, -.3, .18]],
  ];
  const opticalTracks = opticalSpecs.map(([names, xyz, angles], index) => {
    const members = names.map(id => parts.get(id)).filter(Boolean), home = new THREE.Vector3();
    members.forEach(p => { assigned.add(p.id); home.add(p.home); }); home.multiplyScalar(1 / members.length);
    return { members, home, index, end: point(xyz), rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)) };
  });
  add(all.filter(p => p.id.startsWith('lcd_fpc_')), [162, -12, 25], [0, -5, -76], [.2, -.2, .3], .02, [160, 0, -15]);
  add(all.filter(p => p.id.startsWith('lcd_backlight_led')), [150, 80, 35], [0, -5, -76], [.15, .25, -.2], .02, [170, 35, -15]);
  // Small fasteners / connectors remain rigid in their source selection groups.
  const extras = new Map();
  all.filter(p => !assigned.has(p.id)).forEach(p => { const id = p.data.selectionGroupId || p.group; if (!extras.has(id)) extras.set(id, []); extras.get(id).push(p); });
  let n = 0;
  for (const members of extras.values()) { const i = n++; add(members, [i % 2 ? 65 : -65, -95 + i * 27, -30], [0, -5, -90], [.12, .08 * i, -.2], .01 * i, [i % 2 ? 120 : -120, 40, -25]); }

  function update(progress) {
    const p = clamp(progress);
    for (const track of tracks) {
      const t = clamp((p - track.delay) / (1 - track.delay));
      // Clearance consumes the beginning of the same uninterrupted trajectory.
      const center = new THREE.Vector3();
      if (t < .30) center.copy(track.home).lerp(track.clear, ease(t / .30));
      else {
        const u = ease((t - .30) / .70), a = 1 - u;
        center.copy(track.clear).multiplyScalar(a ** 3).addScaledVector(track.outer, 3 * a * a * u).addScaledVector(track.approach, 3 * a * u * u).addScaledVector(track.end, u ** 3);
      }
      const rotation = identity.clone().slerp(track.rotation, ease((t - .35) / .65));
      for (const part of track.members) {
        part.pivot.position.copy(part.home).sub(track.home).applyQuaternion(rotation).add(center);
        part.pivot.quaternion.copy(rotation);
      }
    }
    const extraction = ease(p / .30), fan = ease((p - .40) / .36);
    for (const { members, home, index, end, rotation } of opticalTracks) {
      const extracted = home.clone().add(v([0, -5, -76]).multiplyScalar(extraction)).addScaledVector(normal, index * 14 * ease((p - .28) / .15));
      const control = extracted.clone().add(v([155, 115, -10]));
      const center = extracted.clone().multiplyScalar((1 - fan) ** 2).addScaledVector(control, 2 * (1 - fan) * fan).addScaledVector(end, fan ** 2);
      const q = identity.clone().slerp(rotation, ease((fan - .65) / .35));
      for (const part of members) {
        part.pivot.position.copy(part.home).sub(home).applyQuaternion(q).add(center);
        part.pivot.quaternion.copy(q);
      }
    }
    root.updateMatrixWorld(true);
  }
  const focus = role => {
    const members = select(role); if (!members.length) return null;
    const center = new THREE.Vector3(); members.forEach(p => center.add(p.pivot.getWorldPosition(new THREE.Vector3())));
    return center.multiplyScalar(1 / members.length);
  };
  return { update, focus, core: core.clone() };
}
