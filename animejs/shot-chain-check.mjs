// 离线分镜链验证：从 main.js 提取真实 SHOTS 公式，用 vendored three 复现帧管线，
// 逐边界核对 camera/look/root 连续性，并输出各幕相机方位角扫描（越轴检查）。
import * as THREE from "../animejs/vendor/three.module.js";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../animejs/js/main.js", import.meta.url), "utf8");
const start = src.indexOf("const SHOTS = [");
const end = src.indexOf("\n  ];", start);
if (start < 0 || end < 0) throw new Error("SHOTS block not found");
const DEG = THREE.MathUtils.degToRad;
const HERO_STACK_LIFT = { keycap_2: 26 };
const SHOTS = new Function(
  "THREE", "DEG", "HERO_STACK_LIFT", "explodeLiftFor", "easeIn",
  `"use strict"; return (${src.slice(start + "const SHOTS = ".length, end + 4)});`
)(THREE, DEG, HERO_STACK_LIFT, () => null, (k) => k * k);

const manifest = JSON.parse(readFileSync(new URL("../animejs/ASSEMBLY_MANIFEST.json", import.meta.url), "utf8"));
const parts = new Map();
for (const p of manifest.parts) {
  const bb = p.bboxMm;
  const home = new THREE.Vector3((bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2);
  parts.set(p.id, {
    id: p.id,
    group: p.selectionGroupId || p.group,
    home,
    explodeVec: p.explodeVectorMm ? new THREE.Vector3(...p.explodeVectorMm) : new THREE.Vector3(),
    fanDir: p.id.startsWith("keycap") ? new THREE.Vector3(home.x * 1.8, home.y * 1.8, 36).normalize() : null,
  });
}
// 整装居中（与 loadAssembly 的 Box3 居中一致）
const box = new THREE.Box3();
for (const p of parts.values()) box.expandByPoint(p.home.clone().sub(new THREE.Vector3(60, 40, 20))).expandByPoint(p.home.clone().add(new THREE.Vector3(60, 40, 20)));
const c = new THREE.Vector3(); box.getCenter(c);
const rootPos = c.clone().negate();

const shotById = (id) => SHOTS.find((s) => s.id === id);

function frame(shotId, prog) {
  const shot = shotById(shotId);
  const f = {};
  for (const [k, [a, b]] of Object.entries(shot.scrub || { __default: [0, 0] })) f[k] = a + (b - a) * prog;
  const spread = shot.spreadFn ? shot.spreadFn(prog) : (shot.spread ?? 1);
  const sinkE = Math.min(f.keycaps ?? 0, 1);
  const scrub = shot.scrub || { __default: [0, 0] };
  const disp = new Map();
  for (const part of parts.values()) {
    const d = part.home.clone();
    const key = scrub[part.id] !== undefined ? part.id : scrub[part.group] !== undefined ? part.group : "__default";
    if (HERO_STACK_LIFT[part.id] !== undefined && (f.keycaps ?? 0) > 0) d.z += HERO_STACK_LIFT[part.id] * f.keycaps;
    else if (part.fanDir && key !== "__default") d.addScaledVector(part.fanDir, (f[key] ?? 0) * 26);
    else if (key !== "__default") d.addScaledVector(part.explodeVec, (f[key] ?? 0) * spread);
    else {
      d.addScaledVector(part.explodeVec, (f.__default ?? 0) * spread);
      if (sinkE > 0) d.z -= 12 * sinkE;
    }
    disp.set(part.id, d);
  }
  const rot = shot.rotFn ? shot.rotFn(prog) : shot.rot;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  const anchor = (id, off = [0, 0, 0]) => disp.get(id).clone().applyQuaternion(q).add(rootPos).add(new THREE.Vector3(...off));
  const pose = shot.camFn ? shot.camFn(prog, { anchor }) : { cam: new THREE.Vector3(...shot.cam), look: new THREE.Vector3(...shot.look) };
  if (!Number.isFinite(pose.cam.x + pose.cam.y + pose.cam.z + pose.look.x + pose.look.y + pose.look.z)) {
    console.error(`NaN in ${shotId}@${prog}: cam=${pose.cam.toArray()} look=${pose.look.toArray()}`);
  }
  const az = Math.atan2(pose.cam.x - pose.look.x, -(pose.cam.y - pose.look.y)) / DEG(1);
  return { cam: pose.cam, look: pose.look, rot, az };
}

const chain = ["hero", "toolbox", "ergonomics", "keycaps", "knob", "display", "firmware", "modules", "specs"];
console.log("rootPos =", rootPos.toArray().map((v) => +v.toFixed(2)).join(", "));
let worst = 0;
for (let i = 0; i < chain.length - 1; i++) {
  const a = frame(chain[i], 1), b = frame(chain[i + 1], 0);
  const dCam = a.cam.distanceTo(b.cam), dLook = a.look.distanceTo(b.look);
  const dRot = Math.hypot(a.rot[0] - b.rot[0], a.rot[1] - b.rot[1], a.rot[2] - b.rot[2]);
  worst = Math.max(worst, dCam, dLook);
  console.log(`${chain[i]}→${chain[i + 1]}: dCam=${dCam.toFixed(3)} dLook=${dLook.toFixed(3)} dRot=${dRad(dRot)}`);
}
function dRad(v) { return (v).toFixed(4) + "rad"; }
// 斜率连续性：边界前后各取 1% 进度的有限差分，比较运动速率（突然拉近/远离检查）
console.log("\n边界速率比（后幕入镜速率 / 前幕出镜速率，1=完全连贯）:");
for (let i = 0; i < chain.length - 1; i++) {
  const eps = 0.01;
  const a1 = frame(chain[i], 1 - eps), a0 = frame(chain[i], 1);
  const b1 = frame(chain[i + 1], eps), b0 = frame(chain[i + 1], 0);
  const vOut = a1.cam.distanceTo(a0.cam) / eps, vIn = b1.cam.distanceTo(b0.cam) / eps;
  const lOut = a1.look.distanceTo(a0.look) / eps, lIn = b1.look.distanceTo(b0.look) / eps;
  const rOut = Math.hypot(a1.rot[2] - a0.rot[2]) / eps, rIn = Math.hypot(b1.rot[2] - b0.rot[2]) / eps;
  if (process.env.DBG) console.error(`  raw ${chain[i]}: z(1-e)=${a1.rot[2].toFixed(5)} z(1)=${a0.rot[2].toFixed(5)} | ${chain[i+1]}: z(e)=${b1.rot[2].toFixed(5)} z(0)=${b0.rot[2].toFixed(5)}`);
  const fmt = (aIn, aOut) => (aOut > 1e-9 ? (aIn / aOut).toFixed(2) : "n/a");
  console.log(`${chain[i].padEnd(10)}→${chain[i + 1].padEnd(9)} cam×${fmt(vIn, vOut)} look×${fmt(lIn, lOut)} yaw×${fmt(rIn, rOut)}`);
}
// 方位角解卷绕到上一幕的连续分支，检验全片单调（不越轴）
console.log("\n方位角链（解卷绕，度；Δ为负=相机顺时针、为正=逆时针跟随）:");
let prevAz = null;
for (const s of ["toolbox", "ergonomics", "keycaps", "knob", "display", "firmware", "modules", "specs"]) {
  const a = frame(s, 0), b = frame(s, 1);
  const raw0 = Math.atan2(a.cam.x - a.look.x, -(a.cam.y - a.look.y)) / DEG(1);
  const raw1 = Math.atan2(b.cam.x - b.look.x, -(b.cam.y - b.look.y)) / DEG(1);
  let az0 = raw0, az1 = raw1;
  if (prevAz !== null) while (az0 - prevAz > 180) az0 -= 360; while (az0 - prevAz < -180) az0 += 360;
  while (az1 - az0 > 180) az1 -= 360; while (az1 - az0 < -180) az1 += 360;
  prevAz = az1;
  const yaw = (a.rot[2] / DEG(1)), yaw1 = (b.rot[2] / DEG(1));
  console.log(`${s.padEnd(10)} θ=${az0.toFixed(1)}°→${az1.toFixed(1)}° (Δ${(az1 - az0).toFixed(1)}°)  模型yawΔ=${(yaw1 - yaw).toFixed(1)}°  画面表观旋转≈${((yaw1 - yaw) - (az1 - az0)).toFixed(1)}°`);
}
const kcA = frame("keycaps", 0), kcB = frame("keycaps", 1);
console.log(`\nkeycaps: 模型偏航 ${(kcA.rot[2] / DEG(1)).toFixed(1)}°→${(kcB.rot[2] / DEG(1)).toFixed(1)}°`);
console.log(worst < 0.5 ? "\nRESULT: PASS — 所有边界 camera/look 连续（<0.5mm）" : `\nRESULT: FAIL — 最大边界差 ${worst.toFixed(3)}`);
