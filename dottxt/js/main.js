/* ═══════════════════════════════════════════════════════
   .txt replica — motion engine (vanilla JS, no deps)
   Every effect implemented from scratch:
   per-char reveal, typewriter terminal, scramble hover,
   cursor-square, checker noise, dot-field, pin carousel,
   marquee, sticky footer static noise, side-stack reveals.
   ═══════════════════════════════════════════════════════ */
(() => {
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const lerp = (a, b, t) => a + (b - a) * t;

const scroller = $('#scroller');
const STILL_SHAPE = new URLSearchParams(location.search).get('still'); // ?still / ?still=cube|dog|cat|woman
const STILL = STILL_SHAPE !== null; // 静态验证模式：跳过持续动画
const raf = STILL ? () => {} : requestAnimationFrame;

/* ────────────────────────────────────────────
   1. 逐字母拆分 + 马赛克式入场（乱码定格）
   乱码池仅用 ASCII：Silkscreen/sans 均有字形，宽度稳定不抖动
   ──────────────────────────────────────────── */
const GLYPHS = '#%@&$?01!*/\\<>+=';
function splitChars(el) {
  const text = el.textContent;
  el.textContent = '';
  const frag = document.createDocumentFragment();
  for (const c of text) {
    const span = document.createElement('span');
    span.className = 'ch';
    span.textContent = c === ' ' ? '\u00A0' : c;
    frag.appendChild(span);
  }
  el.appendChild(frag);
  return $$('.ch', el);
}

function revealChars(el, { step = 55, startDelay = 260 } = {}) {
  const chars = splitChars(el);
  chars.forEach((ch, i) => {
    const target = ch.textContent;
    const at = startDelay + i * step;
    // 马赛克定格：先闪 2 帧同宽乱码，再锁定真字符
    for (let f = 0; f < 2; f++) {
      setTimeout(() => {
        ch.classList.add('on');
        ch.textContent = GLYPHS[randInt(0, GLYPHS.length - 1)];
      }, at + f * 46);
    }
    setTimeout(() => { ch.textContent = target; }, at + 2 * 46);
  });
}

/* ────────────────────────────────────────────
   2. 单词拆分（contact 标题）
   ──────────────────────────────────────────── */
function splitWords(el) {
  const text = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  text.forEach((w, i) => {
    const span = document.createElement('span');
    span.className = 'wd';
    span.textContent = w;
    span.style.transitionDelay = `${i * 90}ms`;
    el.appendChild(span);
    el.appendChild(document.createTextNode(' '));
  });
}

/* ────────────────────────────────────────────
   3. 终端打字机（非线性节奏：词边界/续行/思考停顿）
   ──────────────────────────────────────────── */
function typewriter() {
  const body = $('#terminal-body');
  if (!body) return;
  const lines = [
    '$ dottxt generate \\',
    '    --model Qwen/Qwen3.5-27B \\',
    '    --prompt "Is this output valid?" \\',
    '    --schema \'{"valid": "boolean"}\'',
    '',
    '{"valid": true}',
  ];
  const caret = document.createElement('span');
  caret.className = 'terminal__caret';
  body.appendChild(caret);

  let li = 0, ci = 0;
  const rendered = [''];

  // 下一字符的延时：模拟真人敲键的非线性节奏
  function nextDelay(line) {
    const cur = line[ci - 1] || '';
    const nextCh = line[ci] || '';
    let d = rand(24, 72);
    if (cur === ' ') d += rand(30, 90);            // 词边界停顿
    if (nextCh === ' ') d += rand(0, 40);
    if (cur === '-') d += rand(10, 60);            // 参数名起始略顿
    if (Math.random() < 0.06) d += rand(110, 260); // 偶发思考
    return d;
  }

  function tick() {
    if (li >= lines.length) return; // 完成后光标继续闪
    const line = lines[li];
    if (ci < line.length) {
      rendered[li] = line.slice(0, ci + 1);
      const d = nextDelay(line);
      ci++;
      setTimeout(tick, d);
    } else {
      li++; ci = 0;
      rendered[li] = '';
      // 换行停顿：续行符后明显一顿，输出行前停得更久
      setTimeout(tick, li === 5 ? 520 : rand(260, 480));
    }
    body.textContent = rendered.slice(0, li + 1).join('\n');
    body.appendChild(caret);
  }
  setTimeout(tick, 700);
}

/* ────────────────────────────────────────────
   4. 文字乱码悬停（scramble）
   ──────────────────────────────────────────── */
const SCRAMBLE_POOL = '!<>-_\\/[]{}=+*^?#01';
function attachScramble(btn) {
  const label = $('.nav-item__label', btn) || btn;
  if (!label) return;
  const original = label.textContent;
  let raf = null;
  btn.addEventListener('mouseenter', () => {
    let frame = 0;
    const total = 14;
    cancelAnimationFrame(raf);
    (function step() {
      frame++;
      const progress = frame / total;
      const out = original.split('').map((c, i) => {
        if (c === ' ') return ' ';
        return (i / original.length) < progress ? c : SCRAMBLE_POOL[randInt(0, SCRAMBLE_POOL.length - 1)];
      }).join('');
      label.textContent = out;
      if (frame < total) raf = requestAnimationFrame(step);
      else label.textContent = original;
    })();
  });
}

/* 马赛克定格入场（滚动触发）：拆字符并锁定宽度，乱码在固定盒内翻动，
   结束后恢复原始 HTML——全程无布局抖动，保留 <br> 结构 */
function scrambleIn(el, duration = 620) {
  if (el.dataset.scrambling) return;
  el.dataset.scrambling = '1';
  const html = el.innerHTML;
  const text = el.textContent;

  // 1) 拆字符 span 并锁定最终宽度（换行符与空格跳过）
  el.textContent = '';
  const units = [];
  for (const c of text) {
    if (c === '\n') { el.appendChild(document.createElement('br')); units.push(null); continue; }
    const span = document.createElement('span');
    span.textContent = c;
    span.style.display = 'inline-block';
    if (c === ' ' || c === '\u00A0') {
      span.textContent = '\u00A0';
    } else {
      units.push({ span, c, w: 0 });
    }
    el.appendChild(span);
  }
  // 量宽并固定（防止乱码字符宽窄不一引起抖动）
  for (const u of units) {
    if (!u) continue;
    u.w = u.span.getBoundingClientRect().width;
    u.span.style.width = `${u.w}px`;
    u.span.style.whiteSpace = 'pre';
    u.span.style.overflow = 'hidden';
  }

  // 2) 逐帧：左侧已锁定为真字符，右侧在固定盒内翻乱码（ease-out 先快后慢）
  const start = performance.now();
  (function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const p = 1 - Math.pow(1 - t, 2.2); // ease-out：开头锁定快，收尾渐缓
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u) continue;
      u.span.textContent = (i / units.length) < p
        ? u.c
        : (Math.random() < 0.6 ? GLYPHS[randInt(0, GLYPHS.length - 1)] : u.c);
    }
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.innerHTML = html;                 // 恢复原始结构
      delete el.dataset.scrambling;
    }
  })(start);
}

/* ────────────────────────────────────────────
   5. 自定义像素光标（分级方块，反色跟随）
   ──────────────────────────────────────────── */
function initCursor() {
  const cur = $('[data-cursor]');
  if (!cur) return;
  let tx = -100, ty = -100, x = -100, y = -100;

  document.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
  document.addEventListener('mouseover', (e) => {
    const hot = e.target.closest('a, button, [data-hover], input, .hero-title');
    cur.style.opacity = hot ? '1' : '0';
    cur.classList.toggle('cursor-square--big', !!e.target.closest('.hero-title, .product__title'));
    cur.classList.toggle('cursor-square--mid', !!e.target.closest('.btn, .pixel-arrow'));
  });

  (function loop() {
    x = lerp(x, tx, 0.14);   // 沉稳跟随，避免过于灵敏
    y = lerp(y, ty, 0.14);
    cur.style.transform = `translate(${Math.round(x) - 8}px, ${Math.round(y) - 8}px)`;
    if (!STILL) requestAnimationFrame(loop);
  })();
}

/* ────────────────────────────────────────────
   6. 棋盘格噪声动画（侧栏顶部）
   ──────────────────────────────────────────── */
function initChecker() {
  const cvs = $('[data-checker]');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const COLS = 24, ROWS = 28;
  const cw = cvs.width / COLS, chh = cvs.height / ROWS;
  const grid = new Uint8Array(COLS * ROWS);

  // 结构化初始：顶部竖条纹 → 中部棋盘 → 底部随机噪声（还原原站图案层次）
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const idx = y * COLS + x;
      if (y < ROWS * 0.28) grid[idx] = (Math.floor(x / 2) % 2) ? 1 : 0;
      else if (y < ROWS * 0.55) grid[idx] = (x + y) % 2;
      else grid[idx] = Math.random() > 0.5 ? 1 : 0;
    }
  }

  // 模式循环：竖条纹/棋盘 ↔ 宽斜带对角线（录屏实测两种模式整体切换）
  let mode = 'stripes';
  let modeUntil = performance.now() + rand(4500, 8000);
  function buildPattern() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const idx = y * COLS + x;
        if (mode === 'diagonal') {
          // 宽斜带 + 渐变密度 + 噪声点
          const band = Math.floor((x + y * 1.15) / 3.5) % 2;
          const fade = 1 - (x / COLS) * 0.55;      // 左下渐稀
          grid[idx] = band ? 1 : (Math.random() < 0.16 * fade ? 1 : 0);
        } else if (y < ROWS * 0.28) {
          grid[idx] = (Math.floor(x / 2) % 2) ? 1 : 0;
        } else if (y < ROWS * 0.55) {
          grid[idx] = (x + y) % 2;
        } else {
          grid[idx] = Math.random() > 0.5 ? 1 : 0;
        }
      }
    }
  }

  function draw() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#000';
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (grid[y * COLS + x]) ctx.fillRect(x * cw, y * chh, cw, chh);
  }

  function mutate() {
    const now = performance.now();
    if (now > modeUntil) {
      mode = mode === 'stripes' ? 'diagonal' : 'stripes';
      buildPattern();
      modeUntil = now + rand(4500, 9000);
    }
    const flips = randInt(2, 6);
    for (let i = 0; i < flips; i++) {
      // 只扰动棋盘区与噪声区，保持顶部条纹结构
      const y = randInt(Math.floor(ROWS * 0.28), ROWS - 1);
      const x = randInt(0, COLS - 1);
      grid[y * COLS + x] ^= 1;
    }
    draw();
    if (!STILL) setTimeout(mutate, rand(90, 240));
  }

  draw();
  mutate();
}

/* ────────────────────────────────────────────
   7. 03 区块点云：多形态重组（立方体 ⇄ 狗 ⇄ 猫 ⇄ 女性人像）
      粒子在形状间错峰飞散重组；待机时呼吸漂浮 + 轻微视角摇摆
   ──────────────────────────────────────────── */
function initDotfield() {
  const cvs = $('[data-dotfield]');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  /* ── 像素画图案（'X' = 亮点），宽 20；眼/嘴用负空间留白更精致 ── */
  const PATTERNS = {
    dog: [   // 垂耳犬头：外撇垂耳 + 圆脸 + 2×留白眼 + 鼻缝 + 圆下巴
      '...XX..........XX...',
      '..XXXX........XXXX..',
      '..XXXXX......XXXXX..',
      '.XXXXXXX....XXXXXXX.',
      '.XXXXXXXXXXXXXXXXXX.',
      '.XXXXXXXXXXXXXXXXXX.',
      '.XXXX..XXXXXX..XXXX.',
      '.XXXX..XXXXXX..XXXX.',
      '.XXXXXXXXXXXXXXXXXX.',
      '..XXXXXXXXXXXXXXXX..',
      '..XXXXXXXXXXXXXXXX..',
      '..XXXXXXX..XXXXXXX..',
      '...XXXXXXXXXXXXXX...',
      '....XXXXXXXXXXXX....',
      '.....XXXXXXXXXX.....',
      '......XXXXXXXX......',
    ],
    cat: [   // 尖耳猫：立耳 + 2×留白眼 + 鼻缝 + 贴脸胡须茬
      '..XX............XX..',
      '..XXX..........XXX..',
      '..XXXX........XXXX..',
      '..XXXXXX....XXXXXX..',
      '..XXXXXXXXXXXXXXXX..',
      '.XXXXXXXXXXXXXXXXXX.',
      '.XXXXXXXXXXXXXXXXXX.',
      '.XXXX..XXXXXX..XXXX.',
      '.XXXX..XXXXXX..XXXX.',
      '.XXXXXXXXXXXXXXXXXX.',
      '..XXXXXXXXXXXXXXXX..',
      '..XXXXXXXXXXXXXXXX..',
      '..XXXXXXX..XXXXXXX..',
      'XX.XXXXXXXXXXXXXX.XX',
      '...XXXXXXXXXXXXXX...',
      '....XXXXXXXXXXXX....',
      '.....XXXXXXXXXX.....',
    ],
    woman: [ // 波波头女性：圆顶齐发包脸 + 2×2 眼 + 嘴 + 露颈 + 展肩
      '......XXXXXXXX......',
      '....XXXXXXXXXXXX....',
      '...XXXXXXXXXXXXXX...',
      '..XXXXXXXXXXXXXXXX..',
      '..XXXX........XXXX..',
      '..XXXX.XX..XX.XXXX..',
      '..XXXX.XX..XX.XXXX..',
      '..XXXX........XXXX..',
      '..XXXX...XX...XXXX..',
      '..XXXXX......XXXXX..',
      '..XXXXXXXXXXXXXXXX..',
      '........XXXX........',
      '....XX..XXXX..XX....',
      '..XXXXXXXXXXXXXXXX..',
      '.XXXXXXXXXXXXXXXXXX.',
      'XXXXXXXXXXXXXXXXXXXX',
    ],
  };

  // 图案 → 归一化热点列表（中心原点，-1..1）
  function hotspots(rows) {
    const pts = [];
    const H = rows.length, W = rows[0].length;
    rows.forEach((row, y) => {
      for (let x = 0; x < W; x++) {
        if (row[x] === 'X') pts.push([(x / (W - 1)) * 2 - 1, (y / (H - 1)) * 2 - 1]);
      }
    });
    return pts;
  }

  /* ── 立方体（真 3D）棱边采样 ── */
  const CV = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CV.push([x, y, z]);
  const CE = [];
  for (let i = 0; i < 8; i++)
    for (let j = i + 1; j < 8; j++) {
      const d = CV[i].reduce((s, v, k) => s + Math.abs(v - CV[j][k]), 0);
      if (d === 2) CE.push([i, j]);
    }
  const cubePts = [];
  for (const [a, b] of CE)
    for (let s = 0; s < 18; s++) {
      const t = s / 18;
      cubePts.push([
        CV[a][0] + (CV[b][0] - CV[a][0]) * t,
        CV[a][1] + (CV[b][1] - CV[a][1]) * t,
        CV[a][2] + (CV[b][2] - CV[a][2]) * t,
      ]);
    }

  const spots = { dog: hotspots(PATTERNS.dog), cat: hotspots(PATTERNS.cat), woman: hotspots(PATTERNS.woman) };

  /* ── 粒子：N 个，每粒子有每形状的目标 + 微量抖动（保持形状凝聚） ──
     N 加密到 720，让像素画每格约 3 个点、立方体每采样点约 1.7 个点 */
  const N = 720;
  const rand = (a, b) => a + Math.random() * (b - a);
  // 同一格的第 2/3 层粒子按确定性子偏移铺开（约半格对角），配合微小抖动
  const SUB = [[0, 0], [0.045, -0.045], [-0.045, 0.045]];
  const particles = [];
  for (let i = 0; i < N; i++) {
    const cube = cubePts[i % cubePts.length];
    const target = (key) => {
      const hs = spots[key];
      const h = hs[i % hs.length];
      const sub = SUB[Math.floor(i / hs.length) % SUB.length];
      return [
        h[0] + sub[0] + rand(-0.008, 0.008),
        h[1] + sub[1] + rand(-0.008, 0.008),
      ];
    };
    const dg = target('dog'), ct = target('cat'), wm = target('woman');
    particles.push({
      cube,
      dog: [dg[0], dg[1], rand(-0.055, 0.055)],   // 轻浮雕厚度，避免透视散开
      cat: [ct[0], ct[1], rand(-0.055, 0.055)],
      woman: [wm[0], wm[1], rand(-0.055, 0.055)],
      delay: rand(0, 0.3),                 // 重组错峰
      swirlA: rand(0, Math.PI * 2),        // 过渡散开方向
      swirlR: rand(0.08, 0.24),            // 幅度收敛：轻盈不凌乱
      breath: rand(0, Math.PI * 2),
      flick: Math.random(),
    });
  }

  const ORDER = ['cube', 'dog', 'cat', 'woman'];
  const HOLD = [2300, 3000, 3000, 3200];
  const MORPH = 1450;
  let phaseIdx = 0;
  let phaseStart = performance.now();
  let morphing = false;

  const PERSP = 3.1;
  function project(p, ry, rx, cx, cy, scale) {
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    let X = p[0] * cosY + p[2] * sinY;
    let Z = -p[0] * sinY + p[2] * cosY;
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    let Y = p[1] * cosX - Z * sinX;
    Z = p[1] * sinX + Z * cosX;
    const w = PERSP / (PERSP + Z * 0.9);
    return [cx + X * scale * w, cy + Y * scale * w, w];
  }

  function draw(now) {
    const elapsed = now - phaseStart;
    let mp = 1; // morph 进度（1 = 完全处于 to 形状）
    if (morphing) {
      mp = Math.min(elapsed / MORPH, 1);
      if (mp >= 1) { morphing = false; phaseIdx = (phaseIdx + 1) % ORDER.length; phaseStart = now; }
    } else if (elapsed > HOLD[phaseIdx]) {
      morphing = true;
      phaseStart = now;
      mp = 0;
    }
    // from/to 必须在相位状态机更新之后再取：变形完成的同一帧 phaseIdx 已前移，
    // 若先取 from，完成帧会整帧画回旧形状（视角同样闪回）——即"变化完成后闪一下上一张图"
    const from = ORDER[phaseIdx], to = ORDER[(phaseIdx + 1) % ORDER.length];

    const tt = now / 1000;
    // 每形状的基准视角：立方体微侧露两面，位图形状正面朝前；随变形插值
    const VIEW_RY = { cube: 0.55, dog: 0, cat: 0, woman: 0 };
    const VIEW_RX = { cube: -0.4, dog: -0.1, cat: -0.1, woman: -0.1 };
    // 视角连续性关键：待机必须取 0（保持当前形状视角）。若取 1，morph 起跳
    // 瞬间视角会从「to 的视角」跳回「from 的视角」——每轮变换开头突变的根源。
    // morph 中用 sin 内插而非线性，旋转起停也平滑
    const viewP = morphing ? 0.5 - 0.5 * Math.cos(Math.PI * mp) : 0;
    const ryBase = lerp(VIEW_RY[from], VIEW_RY[to], viewP);
    const rxBase = lerp(VIEW_RX[from], VIEW_RX[to], viewP);
    const ry = ryBase + Math.sin(tt * 0.13) * 0.07;     // 轻微呼吸摇摆
    const rx = rxBase + Math.sin(tt * 0.09) * 0.04;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#fff';

    const cx = cvs.width * 0.55, cy = cvs.height * 0.46, scale = cvs.height * 0.27;

    for (const p of particles) {
      let x, y, z;
      if (!morphing) {
        // 待机：稳定显示当前形状（不是下一个），否则到达瞬间会跳变
        const cur = p[from];
        x = cur[0]; y = cur[1]; z = cur[2];
      } else {
        const a = p[from], b = p[to];
        const d = Math.min(Math.max((mp - p.delay) / (1 - p.delay), 0), 1); // 错峰
        const e = d < 0.5 ? 2 * d * d : 1 - Math.pow(-2 * d + 2, 2) / 2;
        x = a[0] + (b[0] - a[0]) * e;
        y = a[1] + (b[1] - a[1]) * e;
        z = a[2] + (b[2] - a[2]) * e;
        // 过渡中段的轻微散开（幅度收敛，避免凌乱）
        const burst = Math.sin(Math.PI * d) * p.swirlR;
        x += Math.cos(p.swirlA + d * 3) * burst * 0.25;
        y += Math.sin(p.swirlA + d * 3) * burst * 0.25;
        z += Math.sin(p.swirlA) * burst * 0.2;
      }
      // 待机呼吸漂浮（轻微，保持形状清晰）
      const bx = Math.sin(tt * 1.1 + p.breath) * 0.007;
      const by = Math.cos(tt * 0.9 + p.breath) * 0.007;
      const [px, py, w] = project([x + bx, y + by, z], ry, rx, cx, cy, scale);
      if (Math.random() < 0.05) continue;  // 闪烁
      const s = Math.max(2, Math.round(4.8 * w));
      ctx.globalAlpha = 0.5 + w * 0.5;
      ctx.fillRect(Math.round(px), Math.round(py), s, s);
    }
    ctx.globalAlpha = 1;
  }

  let lastT = 0;
  function loop(now) {
    if (!STILL) requestAnimationFrame(loop);
    if (now !== undefined && now - lastT < 50) return; // ~20fps 像素节奏
    lastT = now;
    draw(now === undefined ? performance.now() : now);
  }
  if (STILL) {
    // ?still=形状名 → 定格该形态（含专属基准视角），便于截图验证
    const idx = ORDER.indexOf(STILL_SHAPE);
    if (idx >= 0) phaseIdx = idx;
    draw(performance.now());
  } else { requestAnimationFrame(loop); }

  // 调试钩子：暴露点云当前相位（截图验证/手感调参用，不影响渲染）
  window.__dot = () => ({ phase: ORDER[phaseIdx], morphing, since: performance.now() - phaseStart });
}

/* ────────────────────────────────────────────
   8. 04 产品轮播（scroll-pin + 横向切换）
   ──────────────────────────────────────────── */
function initProducts() {
  const track = $('[data-pin-track]');
  const lane = $('[data-pin-lane]');
  const indexEl = $('[data-slide-index]');
  const ticks = $$('[data-ticks] i');
  const products = $$('[data-product]');
  if (!track || !lane) return;

  const N = products.length;
  track.style.height = `${N * 100}vh`; // pin 滚动长度

  let current = 0;
  let smoothed = 0; // 阻尼后的横向进度（scrub 手感）

  function progress() {
    const rect = track.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const p = Math.min(Math.max(-rect.top / total, 0), 0.9999);
    return p;
  }

  function apply(pos) {
    lane.style.transform = `translateX(${-pos * (100 / N)}%)`;
    const idx = Math.round(pos);
    if (idx !== current) {
      current = idx;
      if (indexEl) indexEl.textContent = `04.${idx + 1}`;
      // 切换瞬间故障闪烁
      lane.classList.remove('glitching');
      void lane.offsetWidth; // 重启动画
      lane.classList.add('glitching');
      setTimeout(() => lane.classList.remove('glitching'), 300);
      // 像素页码马赛克定格
      if (indexEl) scrambleIn(indexEl, 260);
      $$('.product').forEach((el, i) => {
        el.style.opacity = i === idx ? '' : '0.35';
        el.style.transition = 'opacity .3s steps(3, end)';
      });
    }
    // 刻度条：整体进度
    const totalTicks = ticks.length;
    const lit = Math.round(pos / (N - 1) * (totalTicks - 1)) + 1;
    ticks.forEach((t, i) => t.classList.toggle('on', i < lit));
  }

  function tick() {
    if (!STILL) requestAnimationFrame(tick);
    const target = progress() * (N - 1);
    const next = lerp(smoothed, target, 0.085); // 阻尼逼近，滚动更沉稳
    if (Math.abs(next - smoothed) < 0.0004 && Math.abs(target - smoothed) < 0.0004) return;
    smoothed = next;
    apply(smoothed);
  }

  scroller.addEventListener('scroll', () => requestAnimationFrame(tick), { passive: true });
  window.addEventListener('resize', () => { smoothed = progress() * (N - 1); apply(smoothed); });
  apply(0);
  if (!STILL) requestAnimationFrame(tick);

  // 箭头点击 → 平滑滚动到对应片段
  function scrollToSlide(i) {
    const rect = track.getBoundingClientRect();
    const top = scroller.scrollTop + rect.top + (i / (N - 1)) * (rect.height - scroller.clientHeight) + 2;
    scroller.scrollTo({ top, behavior: 'smooth' });
  }
  $('[data-prev]')?.addEventListener('click', () => scrollToSlide(Math.max(current - 1, 0)));
  $('[data-next]')?.addEventListener('click', () => scrollToSlide(Math.min(current + 1, N - 1)));
}

/* ────────────────────────────────────────────
   9. 滚动入场（rise / scramble-in / 栈卡片）
   ──────────────────────────────────────────── */
function initScrollReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.classList.add(el.hasAttribute('data-rise') ? 'risen' : 'revealed');
      // 标题类元素追加马赛克定格
      if (el.matches('.quote, .usability-title, .about-title, .product__title')) {
        scrambleIn(el);
      }
      io.unobserve(el);
    }
  }, { root: scroller, threshold: 0.25 });

  $$('[data-rise], .anim-seq, [data-split-words]').forEach(el => io.observe(el));

  // 侧栏堆叠卡片：按滚动深度逐个出现
  const stack = $$('[data-stack]');
  const anchors = [
    () => getTop('#trusted') - 300,
    () => getTop('#products') - 300,
    () => getTop('#about') - 300,
    () => getTop('#contact') - 300,
  ];
  function updateStack() {
    const st = scroller.scrollTop;
    stack.forEach((el, i) => {
      if (st >= anchors[i]() - scroller.clientHeight * 0.2) el.classList.add('shown');
    });
  }
  function getTop(sel) {
    const el = $(sel);
    if (!el) return 1e9;
    return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  }
  scroller.addEventListener('scroll', () => requestAnimationFrame(updateStack), { passive: true });
  updateStack();
}

/* ────────────────────────────────────────────
   9b. 导航字母拆分（hover 波浪）
   ──────────────────────────────────────────── */
function initNavWave() {
  $$('.nav-item__label').forEach(label => {
    if (label.closest('[data-scramble]')) return; // 乱码按钮不拆字母，避免互相破坏
    const text = label.textContent;
    label.textContent = '';
    text.split('').forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'wl';
      s.style.setProperty('--i', i);
      s.textContent = c === ' ' ? '\u00A0' : c;
      label.appendChild(s);
    });
  });
}

/* ────────────────────────────────────────────
   10. 滚动进度条
   ──────────────────────────────────────────── */
function initProgress() {
  const bar = $('[data-progress-bar]');
  if (!bar) return;
  scroller.addEventListener('scroll', () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    bar.style.height = `${(scroller.scrollTop / max) * 100}%`;
  }, { passive: true });
}

/* ────────────────────────────────────────────
   11. 页脚雪花噪点
   ──────────────────────────────────────────── */
function initFooterNoise() {
  const cvs = $('[data-static-noise]');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const W = cvs.width = Math.min(1600, cvs.clientWidth || 1280);
  const H = cvs.height = 96;
  const PALETTE = ['#050505', '#050505', '#c94f2e', '#e0e0e0', '#7a7a7a', '#e8b18f', '#1a1a1a'];
  const PX = 4;

  function draw() {
    for (let y = 0; y < H; y += PX) {
      for (let x = 0; x < W; x += PX) {
        ctx.fillStyle = PALETTE[randInt(0, PALETTE.length - 1)];
        ctx.fillRect(x, y, PX, PX);
      }
    }
  }
  let last = 0;
  function loop(now) {
    if (!STILL) requestAnimationFrame(loop);
    if (now - last > 110) { draw(); last = now; }
  }
  if (STILL) { draw(); } else { requestAnimationFrame(loop); }
}

/* ────────────────────────────────────────────
   12. Company 下拉 + 关闭按钮 + 表单
   ──────────────────────────────────────────── */
function initUI() {
  // 下拉
  const dd = $('.nav-item--dropdown');
  if (dd) {
    const btn = $('button', dd);
    const menu = $('.dropdown', dd);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  }

  // 侧栏提示卡关闭
  $('[data-side-note] .mini-card__close')?.addEventListener('click', () => {
    const card = $('[data-side-note]');
    card.style.transition = 'opacity .25s, transform .25s';
    card.style.opacity = '0';
    card.style.transform = 'translateX(12px)';
    setTimeout(() => card.remove(), 260);
  });

  // 表单假提交
  $$('form[data-form], form[data-newsletter]').forEach(f => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = $('.form-ok', f);
      if (ok) { ok.hidden = false; }
      f.reset();
      setTimeout(() => { if (ok) ok.hidden = true; }, 3200);
    });
  });

  // 平滑锚点（在内部滚动容器里）
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top, behavior: 'smooth' });
    });
  });

  // 乱码悬停
  $$('[data-scramble]').forEach(attachScramble);

  // hover 徽章跳动
  document.addEventListener('mouseover', (e) => {
    const item = e.target.closest('[data-swap]');
    if (!item) return;
    const badge = $('.badge', item);
    if (badge && !badge.dataset.bounced) {
      badge.dataset.bounced = '1';
      badge.style.transform = 'translateY(-3px)';
      setTimeout(() => { badge.style.transform = ''; delete badge.dataset.bounced; }, 180);
    }
  });
}

/* ────────────────────────────────────────────
   boot
   ──────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // contact 标题拆词
  const cw = $('[data-split-words]');
  if (cw) splitWords(cw);

  // hero 逐字母（两行错开）
  const rows = $$('.hero-title [data-split]');
  rows.forEach((row, i) => revealChars(row, { step: 60, startDelay: 350 + i * 620 }));

  typewriter();
  initCursor();
  initChecker();
  initDotfield();
  initProducts();
  initScrollReveals();
  initNavWave();
  initProgress();
  initFooterNoise();
  initUI();
});

})();
