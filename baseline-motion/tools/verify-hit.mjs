// 数值验证:用编译后的游戏逻辑(物理/挥拍/碰撞)+ 真实骨骼臂长,模拟发球与击球命中率。
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const magic = new Proxy(function(){}, {
  get: (t, p) => p === Symbol.toPrimitive ? () => 0 : magic,
  apply: () => magic, construct: () => magic, set: () => true, has: () => true,
});
globalThis.document = magic; globalThis.window = magic; globalThis.requestAnimationFrame = () => 0;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.THREE = magic; globalThis.devicePixelRatio = 1;
process.on('unhandledRejection', () => {}); // bootstrap 的异步模型加载在 Node 中无 BASELINE_ENGINE,忽略
vm.runInThisContext(readFileSync('dist/game.js', 'utf8') + '\n;globalThis.__R = Rally;');
const R = globalThis.__R;

// --- 真实骨骼数据(此前从 assets/Michelle.glb 实测,归一化 1.88m) ---
const UPPER = 0.2887, LOWER = 0.2576, SH_Y = 1.509;
// 右肩在角色局部的 x/z(T-pose,双臂沿左右轴):取横向偏移近似
const SH_X = 0.17, SH_Z = 0.02;
const LIMIT = UPPER + LOWER + 0.045; // 与 human.ts 新容差一致

const FIXED = R.FIXED, V = R.V, clamp = R.clamp;
const SETUP = { ...R.DEFAULT_SETUP };

/** 复刻 human.ts 的握把-肩部 IK 拉拽(世界坐标) */
function applyDrag(actor) {
  const rp = actor.racket, sh = { x: actor.x + SH_X * actor.side, y: SH_Y, z: actor.z + SH_Z };
  const grip = { x: rp.p.x - rp.v.x * .5, y: rp.p.y - rp.v.y * .5, z: rp.p.z - rp.v.z * .5 };
  let wx = grip.x - sh.x, wy = grip.y - sh.y, wz = grip.z - sh.z;
  const gl = Math.hypot(wx, wy, wz) || 1e-6;
  const wrist = { x: grip.x - wx / gl * .065, y: grip.y - wy / gl * .065, z: grip.z - wz / gl * .065 };
  const reach = Math.hypot(wrist.x - sh.x, wrist.y - sh.y, wrist.z - sh.z);
  if (reach <= LIMIT) return 0;
  const k = 1 - LIMIT / reach;
  rp.p.x -= wx * k; rp.p.y -= wy * k; rp.p.z -= wz * k;
  return Math.hypot(wx, wy, wz) * k;
}

/** 复刻 Game.planSwing 的核心(不含 UI/音效) */
function planSwing(game, a, serve = false) {
  const sc = game.scratch; sc.copy(game.ball);
  const base = a.getWindup(SETUP, serve);
  const arrival = game.ball.active && Math.abs(game.ball.v.z) > .1 ? ((a.z - .52 * a.side) - game.ball.p.z) / game.ball.v.z : base;
  const dur = !serve && Math.abs(arrival - base) < .10 ? clamp(arrival, base * .78, base * 1.25) : base;
  for (let t = 0; t < dur; t += FIXED) R.integrate(sc, FIXED);
  if (!game.ball.active) a.local(sc.p, .82, 1.15, -.52);
  a.start(sc.p, SETUP, serve);
  a.windup = dur;
  a.timingError = serve ? 0 : clamp(((a.z - .52 * a.side) - game.ball.p.z) / game.ball.v.z - base, -.3, .3);
  a.aim = 0;
}

const contact = { hit: false, t: 0, u: 0, v: 0, gap: 0 };

/** 挥拍直到命中/挥空。releaseDelay: 相对理想时机的偏移(秒,正=更晚) */
function runSwing(game, a, ball) {
  let drag = 0;
  for (let i = 0; i < 200; i++) {
    a.tick(FIXED, SETUP);
    if (drag = applyDrag(a), ball.active && !a.hit && a.swing >= .035 && a.swing <= a.windup + .125) {
      R.sweepContact(ball.prev, ball.p, a.previous, a.racket, contact);
      if (contact.hit) {
        const localZ = (ball.p.z - a.z) * a.side;
        return { hit: true, gap: contact.gap, off: Math.hypot(contact.u, contact.v), timing: R.timingFor(localZ, Math.hypot(contact.u, contact.v), a.timingError), drag };
      }
    }
    R.integrate(ball, FIXED);
    if (a.swing > a.windup + .14 && !a.hit) return { hit: false, drag, gap: -1 };
  }
  return { hit: false, drag, gap: -1 };
}

function makeGame(playerZ) {
  const player = new R.Actor([1, 1, 1], 1);
  player.reset(0, playerZ);
  const ball = new R.Ball();
  const scratch = new R.Ball();
  return { player, ball, scratch };
}

// ---------- 1. 发球 ----------
function testServe() {
  const g = makeGame(8.5);
  const { player: a, ball } = g;
  a.local(ball.p, .66, 1.62, -.55); ball.v.set(0, 3.0, 0); ball.active = true; ball.serve = true;
  a.tossing = true;
  let tossWait = .18, result = null;
  for (let i = 0; i < 300; i++) {
    a.tick(FIXED, SETUP);
    if (a.tossing) { tossWait -= FIXED; if (tossWait <= 0) { a.tossing = false; planSwing(g, a, true); } }
    else if (a.swing >= 0) { result = runSwing(g, a, ball); break; }
    R.integrate(ball, FIXED);
    if (ball.p.y < .095 + .12) return { hit: false, note: '发球未触球(球落地)' };
  }
  return result ?? { hit: false, note: '无结果' };
}

// ---------- 2. 落地击球(drill0 喂球,球落向 z=4.65 后弹向底线) ----------
function testGroundstroke(feedX, releaseOffset, playerZ = 8.2) {
  const g = makeGame(playerZ);
  const { player: a, ball } = g;
  R.launch(ball, new V(0, 1.12, -8.45), feedX, 4.65, 11.7, 700, 0, true);
  const windup = .215;
  let started = false;
  for (let i = 0; i < 900; i++) {
    // 简化跑位:以 5.65m/s 向球的当前横向位置移动(不会瞬移)
    if (ball.active && ball.v.z > .1 && !started) {
      const dx = ball.p.x - a.x;
      a.x = clamp(a.x + clamp(dx, -5.65 * FIXED, 5.65 * FIXED), -5.05, 5.05);
    }
    a.tick(FIXED, SETUP);
    if (!started && ball.active && ball.v.z > .1 && ball.p.z > 0) {
      const releaseIn = (a.z - .52 - ball.p.z) / ball.v.z;
      if (releaseIn <= windup + releaseOffset) { // 充能并释放
        a.charging = true; a.charge = .5;
        planSwing(g, a, false);
        started = true;
        const r = runSwing(g, a, ball);
        return { ...r, lx: (ball.p.x - a.x).toFixed(2) };
      }
    }
    R.integrate(ball, FIXED);
    if (ball.bounces >= 2) return { hit: false, note: '球落地两次未击球' };
  }
  return { hit: false, note: '超时' };
}

// ---------- 3. 截击(网前,球未落地) ----------
function testVolley(playerZ = 2.8) {
  const g = makeGame(playerZ);
  const { player: a, ball } = g;
  R.launch(ball, new V(0, 2.1, -8.45), .68, 6.5, 13, 350, 0, true);
  const windup = .215;
  for (let i = 0; i < 900; i++) {
    a.tick(FIXED, SETUP);
    if (ball.active && ball.v.z > .1) {
      const releaseIn = (a.z - .52 - ball.p.z) / ball.v.z;
      if (releaseIn <= windup) { a.charging = true; a.charge = .4; planSwing(g, a, false); return runSwing(g, a, ball); }
    }
    R.integrate(ball, FIXED);
    if (ball.bounces >= 1) return { hit: false, note: '球已落地(错过截击窗口)' };
  }
  return { hit: false, note: '超时' };
}

console.log('=== 发球(20 次,理想时机) ===');
let serveOk = 0;
for (let i = 0; i < 20; i++) { const r = testServe(); if (r.hit) serveOk++; if (i < 3 || !r.hit && i < 6) console.log(`  #${i}:`, JSON.stringify(r)); }
console.log(`  命中率: ${serveOk}/20`);

console.log('\n=== 底线击球(不同喂球落点 × 不同释放时机偏移) ===');
for (const offset of [-.12, -.06, 0, .06, .12]) {
  let hits = 0, total = 0, details = [];
  for (const fx of [-2.45, -.73, 0, .73, 2.45]) {
    const r = testGroundstroke(fx, offset); total++;
    if (r.hit) hits++;
    details.push(`x=${fx}: ${r.hit ? '命中 ' + r.timing + ' gap=' + r.gap.toFixed(3) + ' off=' + r.off.toFixed(2) : 'MISS ' + (r.note ?? 'gap=' + r.gap)}`);
  }
  console.log(`  释放偏移 ${offset >= 0 ? '+' : ''}${(offset * 1000) | 0}ms → ${hits}/${total}  ${details.join(' | ')}`);
}

console.log('\n=== 网前截击(理想时机) ===');
for (let i = 0; i < 5; i++) { const r = testVolley(); console.log(`  #${i}:`, r.hit ? `命中 ${r.timing} gap=${r.gap.toFixed(3)}` : 'MISS ' + (r.note ?? '')); }
