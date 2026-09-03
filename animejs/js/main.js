/* =========================================================
   Luma Remote A3.32 — 分镜驱动 3D 引擎 v6（直接映射）
   · Shot State Machine：每分镜独立机位/注视点/局部爆炸组
   · 滚动擦洗爆炸（scrub）：分镜内滚动推进拆解进度（零件 id / 组名双键解析）
   · 运镜编排（camFn）：滚动进度驱动的推轨/环绕/旋转入场
   · 直接映射：一切位姿 = 滚动位置的纯函数，无时间平滑——
     鼠标停即画面停、速度即滚动速度；相邻分镜在边界处位姿严格连续，
     scrub 区间以端点值衔接（前一幕的终值 = 后一幕的初值）
   · 三态材质：PBR 赛博微光 / CAD 纸面墨线 / INK 暗面双层描线（特写用，省性能）
   · 中心枢轴：几何平移至零件中心，自转绕自身轴
   ========================================================= */

import * as THREE from "/vendor/three.module.js";
import { STLLoader } from "/vendor/STLLoader.js";

(() => {
  "use strict";

  const canvas = document.getElementById("webgl-canvas");
  const svgOverlay = document.getElementById("leader-lines");
  const explosionFill = document.getElementById("explosion-fill");
  const explosionPercent = document.getElementById("explosion-percent");
  const hudShot = document.getElementById("hud-shot");

  // ---- Dev HUD（验收辅助，发布前移除）：左下角实时滚动/分镜/帧号参数，
  // 方便口头反馈「Y=xxxx 处跳变」精确定位 ----
  const devHud = document.createElement("div");
  devHud.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:9999;pointer-events:none;white-space:pre;" +
    "font:11px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;" +
    "color:#111;background:rgba(245,242,233,.85);border:1px solid rgba(0,0,0,.35);" +
    "border-radius:4px;padding:3px 9px;text-align:left;";
  document.body.appendChild(devHud);
  let devFrames = 0;
  const DEG = THREE.MathUtils.degToRad;

  const state = {
    shot: "hero",
    mode: "pbr",           // pbr | light | ink
    explosion: 0,
    spread: 1.0,
    f: { __default: 0 },
    cam: new THREE.Vector3(0, -332, 244),
    look: new THREE.Vector3(0, 3, 11),
    rot: new THREE.Euler(0, 0, 0.03),
    activeSubsystems: { enclosure: true, keycaps: true, switches: true, esp32: true, ec11: true },
    loaded: false,
  };

  /* =========================================================
     1. 渲染环境
     ========================================================= */
  const scene = new THREE.Scene();
  scene.up.set(0, 0, 1);
  window.__scene = scene;

  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 1, 5000);
  camera.up.set(0, 0, 1);
  camera.position.copy(state.cam);
  camera.lookAt(state.look);
  window.__camera = camera;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  window.__renderer = renderer;

  scene.add(new THREE.HemisphereLight(0xdfffe4, 0x172018, 2.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
  keyLight.position.set(-120, -180, 260);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xff6a3d, 1.6);
  fillLight.position.set(160, -120, 150);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0x64d2ff, 2.2);
  rimLight.position.set(0, 220, 200);
  scene.add(rimLight);

  const rootGroup = new THREE.Group();
  scene.add(rootGroup);
  window.__rootGroup = rootGroup;

  /* =========================================================
     2. 三态材质库
     ========================================================= */
  const materials = {
    // PBR 赛博微光（hero / specs）
    darkEnclosure: new THREE.MeshStandardMaterial({ color: 0x363942, roughness: 0.22, metalness: 0.2, transparent: true, opacity: 0.72 }),
    darkBezel: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.35, metalness: 0.4 }),
    darkKeycap: new THREE.MeshStandardMaterial({ color: 0xf4f3ec, roughness: 0.25, metalness: 0.05 }),
    darkSwitch: new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.3, metalness: 0.15 }),
    darkEsp32: new THREE.MeshStandardMaterial({ color: 0x1872b8, roughness: 0.2, metalness: 0.3 }),
    darkKnob: new THREE.MeshStandardMaterial({ color: 0xeeebe2, roughness: 0.15, metalness: 0.85 }),
    // CAD 纸面墨线（toolbox / modules）
    lightSolid: new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.95, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    lightLine: new THREE.LineBasicMaterial({ color: 0x1c1a17, linewidth: 1.4, transparent: true, opacity: 0.95 }),
    // INK 暗面线稿（feature 特写）：Standard 材质便于焦点混搭时与纸面色逐帧插值
    inkSolid: new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.9, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    inkLineDim: new THREE.LineBasicMaterial({ color: 0xf6f4f2, linewidth: 1, transparent: true, opacity: 0.42 }),
    inkLineMicro: new THREE.LineBasicMaterial({ color: 0xf6f4f2, linewidth: 1, transparent: true, opacity: 0.13 }),
    inkLineHot: new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1.4, transparent: true, opacity: 0.9 }),
    // CAD 模式下的白轮廓（暗背景模式备用）
    darkLine: new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, transparent: true, opacity: 0.16 }),
  };

  // 焦点混搭两端色：暗面配角 ↔ 纸面主角（每零件实例逐帧插值，换镜不再闪切）
  const INK_SOLID_COLOR = new THREE.Color(0x17171c);
  const PAPER_SOLID_COLOR = new THREE.Color(0xf5f2e9);
  const INK_LINE_COLOR = new THREE.Color(0xf6f4f2);
  const PAPER_LINE_COLOR = new THREE.Color(0x1c1a17);

  /* =========================================================
     4. 分镜脚本（Shot State Machine）
     scrub: [起, 止] —— 分镜内滚动进度线性插值爆炸因子；
     相邻分镜区间以端点值衔接（前一幕终值 = 后一幕初值），跨界无跳变
     focus: INK 模式下白亮描线的焦点零件/组
     ========================================================= */
  // 键帽幕主角：键帽稍微抬起（露出轴芯间隙即可），盒体仅微微下沉保持在画面内，
  // 键轴与盒体共同入镜构成堆叠特写
  const HERO_STACK_LIFT = { keycap_2: 26 };
  // toolbox/modules 爆炸层序（f=1、未乘 spread 前的 +Z 行程；上盖 explodeVec z=33.6）：
  // 内部件沿用自身 explodeVec 会被上盖追越穿透——全部上浮且依次领先：
  // 键轴(44) < 键帽(60)；EC11 栈自下而上 body(40)→washer(43)→nut(46)→knob(50)
  const EXPLODE_LIFT = [
    ["choc_v2", 44], ["keycap", 60],
    ["ec11_encoder", 40], ["ec11_mounting_washer", 43],
    ["ec11_mounting_nut", 46], ["ec11_knob", 50],
  ];
  const explodeLiftFor = (id) => {
    for (const [prefix, lift] of EXPLODE_LIFT) if (id.startsWith(prefix)) return lift;
    return null;
  };
  const SHOTS = [
    {
      id: "hero", el: "#intro", theme: "pbr",
      cam: [0, -332, 244], look: [0, 3, 11], rot: [0, 0, -0.03],
      scrub: { __default: [0, 0] },
    },
    {
      // 展开幕：机位/姿态从 hero 末帧起步（边界连续），前半程滑入展开机位
      id: "toolbox", el: "#toolbox", theme: "light",
      cam: [0, -332, 244], look: [0, 3, 11], rot: [0, 0, -0.03], spread: 1.15,
      scrub: { __default: [0, 1] },
      camFn: (prog) => {
        const t = Math.min(Math.max(prog / 0.5, 0), 1);
        return {
          cam: new THREE.Vector3(0, -332 + 2 * t, 244 + 56 * t),
          look: new THREE.Vector3(0, 3 - 3 * t, 11 - 11 * t),
        };
      },
      rotFn: (prog) => {
        // 姿态全程漂移不驻留：旋转贯穿整幕（速度可慢但角速度不归零）
        const t = Math.min(Math.max(prog, 0), 1);
        return [0.22 * t, -0.3 * t, -0.03 - 0.39 * t];
      },
    },
    {
      // 直线推近：入镜 = toolbox 末帧机位、出镜 = keycaps 衔接位，
      // 纯径向 dolly（方位角 0，无相机旋转）+ 偏航缓漂 → 幕内速度恒定
      id: "ergonomics", el: '[data-feature="ergonomics"]', theme: "ink",
      cam: [0, -330, 300], look: [0, 0, 0], rot: [0.22, -0.3, -0.42], spread: 1.15,
      scrub: { __default: [1, 0] },
      focus: { groups: ["enclosure"] },
      camFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        const r = 330 - 151.1 * t;
        return {
          cam: new THREE.Vector3(0, -r, 300 - 138 * t),
          look: new THREE.Vector3(0, 0, 6 * t),
        };
      },
      rotFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        return [0.22 - 0.14 * t, -0.3 + 0.2 * t, -0.42 - 0.1 * t];
      },
    },
    {
      // 键帽幕：侧上方俯视特写 —— 模型整体顺时针偏航 60°（rotFn 全程驱动，只进不回），
      // 相机方位角小幅平移（±13°），旋转由模型偏航主导 → 视观方向全程顺时针；
      // 入镜机位/姿态 = ergo 末帧（换镜零跳变），尾段同向缓撤回正前上方
      id: "keycaps", el: '[data-feature="keycaps"]', theme: "ink",
      cam: [0, -179, 162], look: [0, 0, 6], rot: [0.08, -0.1, -0.52],
      scrub: { keycaps: [0, 1] },
      focus: { parts: ["keycap_2"] },
      rotFn: (prog) => {
        const eIn = Math.min(Math.max(prog, 0), 1);
        return [0.08, -0.1, -0.52 - 0.63 * eIn];
      },
      camFn: (prog, ctx) => {
        // 环绕原则：主角恒居画面正中（注视点 = 主角锚点），
        // 机位 = 主角 + 球坐标(θ,r,z)，θ 全片单调顺时针递减 → 围绕主角环绕
        const a2 = ctx.anchor("keycap_2", [0, 0, 1]);
        const t = Math.min(Math.max(prog, 0), 1);
        const th = DEG(-12.44 - 42 * t);
        const r = 199.46 - 81.46 * t;
        const z = 131.58 - 57.58 * t;
        return {
          cam: a2.clone().add(new THREE.Vector3(Math.sin(th) * r, -Math.cos(th) * r, z)),
          look: new THREE.Vector3(0, 0, 6).lerp(a2, Math.min(t / 0.15, 1)),
        };
      },
    },
    {
      // EC11 四件绕自身轴旋转着旋出；环绕链延续（θ -58.3°→-96.3°），旋钮居中；
      // 姿态承接键帽幕 -1.15 偏航（不回卷），幕内继续缓漂不驻留；
      // 键帽抬升/扇开随 keycaps 因子携带衰减（区间端点 1→0，边界连续）
      id: "knob", el: '[data-feature="knob"]', theme: "ink",
      cam: [-53, -53, 130], look: [43, 16, 56], rot: [0.08, -0.1, -1.15],
      scrub: { "ec11-stack": [0, 0.95], keycaps: [1, 0] },
      focus: { groups: ["ec11-stack"] },
      screw: { ec11_knob_26x8p5: 0.5, ec11_mounting_nut: 1.1, ec11_mounting_washer: -0.8, ec11_encoder_body_15mm_d_shaft: 0.15 },
      rotFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        return [0.08, -0.1, -1.15 - 0.15 * t];
      },
      camFn: (prog, ctx) => {
        // 入镜机位 = keycaps 末帧（抬升键帽球坐标端点），随后绕旋钮环绕
        const aK = ctx.anchor("ec11_knob_26x8p5", [0, 0, 0]);
        const t = Math.min(Math.max(prog, 0), 1);
        const th = DEG(-58.32 - 38 * t);
        const r = 62.32 + 87.68 * t;
        const z = 108.07 + 17.93 * t;
        return {
          cam: aK.clone().add(new THREE.Vector3(Math.sin(th) * r, -Math.cos(th) * r, z)),
          look: new THREE.Vector3(43, 15.77, 56.42).lerp(aK, Math.min(t / 0.18, 1)),
        };
      },
    },
    {
      // 屏幕幕：环绕链延续（θ -83°→-117°），LCD 主板居中；
      // ec11 因子携带衰减（[0.95,0]），旋钮栈在镜头拉远中自然归位（边界零跳变）
      id: "display", el: '[data-feature="display"]', theme: "ink",
      cam: [-149, -4, 148], look: [0, -20, 22], rot: [0.08, -0.1, -1.3],
      scrub: { screen_bezel: [0, 1], "ec11-stack": [0.95, 0] },
      focus: { parts: ["screen_bezel", "waveshare_esp32_s3_lcd_2"] },
      camFn: (prog, ctx) => {
        const aL = ctx.anchor("waveshare_esp32_s3_lcd_2", [0, 0, 3]);
        const t = Math.min(Math.max(prog, 0), 1);
        const th = DEG(-83.03 - 34 * t);
        const r = 150.73 + 57.27 * t;
        const z = 129.41 + 30.59 * t;
        return {
          cam: aL.clone().add(new THREE.Vector3(Math.sin(th) * r, -Math.cos(th) * r, z)),
          look: new THREE.Vector3(0, -20.06, 22.35).lerp(aL, Math.min(t / 0.18, 1)),
        };
      },
      rotFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        return [0.08 * (1 - t), -0.1 * (1 - t), -1.3 - 0.42 * t];
      },
    },
    {
      // 主板幕：环绕链延续（θ -117°→-161°），板体（随机体运动）恒居中；
      // 模型顺时针偏航翻转 180°（-1.72 → -1.72-π）到背面视角
      id: "firmware", el: '[data-feature="firmware"]', theme: "ink",
      rot: [0, 0, -1.72],
      scrub: { waveshare_esp32_s3_lcd_2: [0, 0.95], esp32_m3_retainer: [0, 0.7], screen_bezel: [1, 0] },
      focus: { parts: ["waveshare_esp32_s3_lcd_2", "esp32_m3_retainer"] },
      camFn: (prog, ctx) => {
        const a = ctx.anchor("waveshare_esp32_s3_lcd_2", [0, 0, 3]);
        const t = Math.min(Math.max(prog, 0), 1);
        const th = DEG(-117.03 - 44 * t);
        const r = 208 - 58 * t;
        const z = 160 + 30 * t;
        return {
          cam: a.clone().add(new THREE.Vector3(Math.sin(th) * r, -Math.cos(th) * r, z)),
          look: new THREE.Vector3(0.49, 14.79, 18.94).lerp(a, Math.min(t / 0.2, 1)),
        };
      },
      rotFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        return [0, 0, -1.72 - Math.PI * t];
      },
    },
    {
      // 总览幕：环绕链收尾（θ -161° 起步），机位从板体拉回全景，散点爆炸铺开；
      // 板体/固定座因子携带衰减（[0.95,0]/[0.7,0]）→ 主角归位无瞬跳；
      // 偏航继续顺时针（-4.86 → -6.20 ≡ -0.08，视觉构图等价、方向不回卷）
      id: "modules", el: "#modules", theme: "light",
      cam: [0, -6, 175], look: [0, 0, 8], rot: [0, 0, -4.86], spread: 1.9,
      scrub: { __default: [0, 1], waveshare_esp32_s3_lcd_2: [0.95, 0], esp32_m3_retainer: [0.7, 0] },
      camFn: (prog, ctx) => {
        const a = ctx.anchor("waveshare_esp32_s3_lcd_2", [0, 0, 3]);
        const t = Math.min(Math.max(prog / 0.5, 0), 1);
        const entryCam = a.clone().add(new THREE.Vector3(Math.sin(DEG(-161.03)) * 150, -Math.cos(DEG(-161.03)) * 150, 190)); // = firmware 末帧
        return {
          cam: entryCam.lerp(new THREE.Vector3(45, -400, 380), t),
          look: a.clone().lerp(new THREE.Vector3(0, 0, 0), t),
        };
      },
      rotFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        return [0.22 * t, -0.3 * t, -4.86 - 1.34 * t];
      },
    },
    {
      // 规格幕：机位起步 = modules 末帧，爆炸因子携带衰减（1→0）边收拢边回到正面；
      // 偏航 -6.20 → -6.32 ≡ -0.04（与 hero 同构，继续顺时针）
      id: "specs", el: "#specs", theme: "pbr",
      cam: [45, -400, 380], look: [0, 0, 0], rot: [0.22, -0.3, -6.2], spread: 1.9,
      scrub: { __default: [1, 0] },
      camFn: (prog) => {
        const t = Math.min(Math.max(prog / 0.5, 0), 1);
        return {
          cam: new THREE.Vector3(45 - 45 * t, -400 + 48 * t, 380 - 122 * t),
          look: new THREE.Vector3(0, 5 * t, 11 * t),
        };
      },
      rotFn: (prog) => {
        const t = Math.min(Math.max(prog, 0), 1);
        return [0.22 * (1 - t), -0.3 * (1 - t), -6.2 - 0.12 * t];
      },
    },
  ];

  // 分镜判定与进度共用同一原始信号（直接映射，无平滑）：
  // 位置 = f(滚动位置) —— 鼠标停即画面停，速度即滚动速度
  function sectionTop(el) {
    return el.getBoundingClientRect().top;
  }

  // 换镜滞回锁：前进即刻生效；回退必须真正滚回边界外一段余量才允许，
  // 边界处的毫米级抖动（或浏览器滚动锚定回拨）不再造成「闪回上一分镜」
  let shotIdx = 0;
  function detectShot() {
    const center = window.innerHeight * 0.5;
    const margin = window.innerHeight * 0.12;
    let last = 0;
    for (let i = 0; i < SHOTS.length; i++) {
      const el = document.querySelector(SHOTS[i].el);
      if (!el) continue;
      if (sectionTop(el) <= center) last = i;
    }
    if (last > shotIdx) {
      shotIdx = last;
    } else if (last < shotIdx) {
      const el = document.querySelector(SHOTS[shotIdx].el);
      if (el && sectionTop(el) > center + margin) shotIdx = last;
    }
    return SHOTS[shotIdx].id;
  }

  function shotProgress(shot) {
    const el = document.querySelector(shot.el);
    if (!el) return 0;
    const vh = window.innerHeight;
    const adjTop = sectionTop(el);
    // 进度跨度 = 整段区块高度 → prog 恰好在下一幕换镜点到达 1：
    // 动作无缝延续到换镜瞬间，幕尾没有冻结死区（速度全程一致）
    const span = Math.max(el.getBoundingClientRect().height, 1);
    // 进度零点 = 换镜判定点（区块顶边过中线）→ 跨界瞬间 prog=0，
    // camFn(0) = 上一幕末帧 → 机位严格连续
    return Math.min(1, Math.max(0, (vh * 0.5 - adjTop) / span));
  }

  const shotById = (id) => SHOTS.find((s) => s.id === id) || SHOTS[0];

  /* =========================================================
     5. 零件加载 + 包围盒中心锚点 + LCD 平面
     ========================================================= */
  const partsMap = new Map();
  const stlLoader = new STLLoader();

  function pbrMaterialFor(id) {
    if (id.includes("bezel")) return materials.darkBezel;
    if (id.includes("keycap")) return materials.darkKeycap;
    if (id.includes("choc")) return materials.darkSwitch;
    if (id.includes("esp32") || id.includes("waveshare")) return materials.darkEsp32;
    if (id.includes("knob") || id.includes("ec11")) return materials.darkKnob;
    return materials.darkEnclosure;
  }

  async function loadAssembly() {
    try {
      const resp = await fetch("ASSEMBLY_MANIFEST.json");
      const manifest = await resp.json();

      await Promise.all(manifest.parts.map((p) => new Promise((resolve) => {
        stlLoader.load(`stl/${p.filename}`, (geometry) => {
          geometry.computeVertexNormals();

          const bb = p.bboxMm;
          const center = new THREE.Vector3(
            (bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2
          );

          // 中心枢轴：先平移几何 → 原点即零件中心，自转（键帽/EC11 旋出）绕自身轴；
          // 描线几何必须在其后构建，否则顶点快照停留在绝对坐标产生偏移鬼影
          geometry.translate(-center.x, -center.y, -center.z);

          // 高模厂商件用高阈值，打印件用细阈值让倒角/锥面出线
          const edgeAngle = p.id.includes("waveshare") ? 26 : 16;
          const mesh = new THREE.Mesh(geometry, pbrMaterialFor(p.id));
          const edgesGeom = new THREE.EdgesGeometry(geometry, edgeAngle);
          const line = new THREE.LineSegments(edgesGeom, materials.darkLine);
          mesh.add(line);

          // INK 分镜第二层微细节描线（低阈值），暗面零件细节密度翻倍；
          // 每零件专属材质实例 → 焦点混搭可逐零件插值
          const inkMat = materials.inkSolid.clone();
          const inkLineMat = materials.inkLineDim.clone();
          const microMat = materials.inkLineMicro.clone();
          const microLine = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry, p.id.includes("waveshare") ? 12 : 7),
            microMat
          );
          microLine.visible = false;
          mesh.add(microLine);

          const pivot = new THREE.Group();
          pivot.position.copy(center);
          pivot.add(mesh);

          const anchor = new THREE.Object3D();
          pivot.add(anchor);

          rootGroup.add(pivot);

          const explodeVec = p.explodeVectorMm
            ? new THREE.Vector3(...p.explodeVectorMm) : new THREE.Vector3();

          // 键帽扇形展开方向（自键盘中心向外 + 上）
          const fanDir = p.id.startsWith("keycap")
            ? new THREE.Vector3(center.x * 1.8, center.y * 1.8, 36).normalize()
            : null;

          partsMap.set(p.id, {
            id: p.id,
            group: p.selectionGroupId || p.group,
            pivot, mesh, line, microLine, anchor,
            bbox: bb,
            home: center.clone(),
            explodeVec,
            fanDir,
            inkMat, inkLineMat, microMat,
            focusTarget: 0, focusMix: 0,
          });
          resolve();
        }, undefined, () => resolve());
      })));

      // 整装居中
      const box = new THREE.Box3().setFromObject(rootGroup);
      const c = new THREE.Vector3();
      box.getCenter(c);
      rootGroup.position.sub(c);
      state.loaded = true;
      window.__partsCount = partsMap.size;
    } catch (err) {
      console.error("Manifest load error:", err);
    }
  }
  loadAssembly();

  /* =========================================================
     6. 材质模式切换（pbr / light / ink）
     ========================================================= */
  function applyMode(mode, shot) {
    state.mode = mode;
    const focus = shot.focus || {};
    // 组名前缀匹配（selectionGroupId 带后缀，如 enclosure-closure）
    const isFocus = (p) =>
      (focus.groups && focus.groups.some((g) => (p.group || "").includes(g))) ||
      (focus.parts && focus.parts.includes(p.id));
    partsMap.forEach((p) => {
      if (mode === "light") {
        p.mesh.material = materials.lightSolid;
        p.line.material = materials.lightLine;
        p.microLine.visible = false;
      } else if (mode === "ink") {
        // 焦点混搭：材质指向每零件专属实例，焦点状态走 focusTarget 逐帧插值
        p.mesh.material = p.inkMat;
        p.line.material = p.inkLineMat;
        p.microLine.material = p.microMat;
        p.microLine.visible = true;
        p.focusTarget = isFocus(p) ? 1 : 0;
      } else {
        p.mesh.material = pbrMaterialFor(p.id);
        p.line.material = materials.darkLine;
        p.microLine.visible = false;
      }
    });
    document.body.classList.toggle("theme-light", mode === "light");
  }

  /* =========================================================
     7. 每帧更新（直接映射：位姿 = 滚动位置的纯函数，无时间平滑）
     鼠标停即画面停、速度即滚动速度、掉帧不积累滞后
     ========================================================= */
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);

  function anchorWorld(partId, off) {
    const part = partsMap.get(partId);
    if (!part) return null;
    part.anchor.getWorldPosition(tmpV);
    return tmpV.clone().add(new THREE.Vector3(...off));
  }

  function updateScrollAnimation(time, dt) {
    const shotId = detectShot();
    const shotChanged = shotId !== state.shot;
    state.shot = shotId;
    const shot = shotById(shotId);

    if (shotChanged) {
      if (hudShot) hudShot.textContent = "SHOT: " + shotId.toUpperCase();
      document.body.dataset.shot = shotId;
    }
    applyMode(shot.theme, shot); // 每帧幂等应用，覆盖异步加载的零件

    // ---- 滚动擦洗爆炸因子（直接线性插值，无时间平滑）----
    const prog = shotProgress(shot);
    const targets = {};
    const scrub = shot.scrub || { __default: [0, 0] };
    for (const [key, range] of Object.entries(scrub)) {
      targets[key] = range[0] + (range[1] - range[0]) * prog;
    }
    // 直接映射：scrub 点名键取本帧值，未点名键归零（衰减由区间端点衔接承担）
    for (const key of Object.keys(state.f)) {
      state.f[key] = targets[key] ?? 0;
    }

    state.explosion = state.f.__default ?? 0;
    state.spread = shot.spread ?? 1;

    if (explosionFill && explosionPercent) {
      const pct = Math.round(state.explosion * 100);
      explosionFill.style.width = `${pct}%`;
      explosionPercent.textContent = `${pct}%`;
    }

    // ---- Dev HUD 刷新（验收辅助）----
    devFrames++;
    window.__frames = devFrames;
    if (devHud) {
      const maxY = document.body.scrollHeight - window.innerHeight;
      let nextFlip = null;
      for (const s of SHOTS) {
        const el = document.querySelector(s.el);
        if (!el) continue;
        const flip = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5;
        if (flip > window.scrollY - 1) { nextFlip = Math.round(flip); break; }
      }
      devHud.textContent =
        `Y ${Math.round(window.scrollY)} / ${Math.max(maxY, 0)} · F ${devFrames}\n` +
        `${shotId.toUpperCase()} ${Math.round(prog * 100)}%` +
        (nextFlip !== null ? ` · NEXT FLIP ${nextFlip}` : "");
    }

    // ---- 焦点混搭：纯滚动驱动 —— 主角在分镜中段纸面高亮、两端回暗，
    // 边界处 ramp=0 与相邻幕无缝衔接，无换镜跳色 ----
    if (state.mode === "ink") {
      const ramp = Math.max(0, Math.min(prog / 0.12, (1 - prog) / 0.12, 1));
      partsMap.forEach((p) => {
        if (!p.inkMat) return;
        const m = (p.focusTarget || 0) * ramp;
        p.focusMix = m;
        p.inkMat.color.lerpColors(INK_SOLID_COLOR, PAPER_SOLID_COLOR, m);
        p.inkLineMat.color.lerpColors(INK_LINE_COLOR, PAPER_LINE_COLOR, m);
        p.inkLineMat.opacity = 0.42 + 0.53 * m;
        p.microMat.opacity = 0.13 * (1 - m);
      });
    }

    // ---- 零件位移（scrub 点名零件 id 或组名，其余跟随 __default）----
    // 盒体下沉与键帽抬升都挂在 keycaps 因子上：随滚动线性起落、跨镜携带衰减
    const sinkE = Math.min(state.f.keycaps ?? 0, 1);
    const scrubKeyOf = (part) =>
      scrub[part.id] !== undefined ? part.id
      : scrub[part.group] !== undefined ? part.group
      : "__default";
    partsMap.forEach((part) => {
      const visible = state.activeSubsystems[subsystemOf(part.group)];
      part.pivot.visible = visible;
      if (!visible) return;
      const key = scrubKeyOf(part);
      if (HERO_STACK_LIFT[part.id] !== undefined && (state.f.keycaps ?? 0) > 0) {
        // 主角堆叠：键帽垂直升起 / 配对轴体下拉（与扇形展开区分）
        part.pivot.position.copy(part.home);
        part.pivot.position.z += HERO_STACK_LIFT[part.id] * (state.f.keycaps ?? 0);
      } else if (part.fanDir && key !== "__default") {
        // 键帽扇形升起（自原位向外 + 上）
        part.pivot.position.copy(part.home).addScaledVector(part.fanDir, (state.f[key] ?? 0) * 26);
      } else if (key !== "__default") {
        part.pivot.position.copy(part.home).addScaledVector(part.explodeVec, (state.f[key] ?? 0) * state.spread);
      } else {
        // 层序保护：命中 EXPLODE_LIFT 的零件按 +Z 行程上浮（领先上盖），其余沿用 explodeVec
        const lift = explodeLiftFor(part.id);
        part.pivot.position.copy(part.home);
        if (lift !== null) part.pivot.position.z += lift * state.f.__default * state.spread;
        else part.pivot.position.addScaledVector(part.explodeVec, state.f.__default * state.spread);
        if (sinkE > 0) part.pivot.position.z -= 12 * sinkE; // 盒体微微下沉，保持在画面内作背景
      }
    });

    // ---- 自转复位（换镜瞬间），再按分镜施加 ----
    if (shotChanged) {
      for (const part of partsMap.values()) part.mesh.rotation.set(0, 0, 0);
    }
    // ---- EC11 旋出：绕自身轴边转边退 ----
    if (shot.screw) {
      for (const [id, turns] of Object.entries(shot.screw)) {
        const part = partsMap.get(id);
        if (part) part.mesh.rotation.z = turns * Math.PI * (state.f[scrubKeyOf(part)] ?? 0);
      }
    }
    // ---- 相机 / 注视点 / 摇摆运镜（滚动为唯一驱动，鼠标不干涉模型姿态）----

    // 预测锚点：用本帧 scrub 目标值（而非缓动中的 state.f）求零件末态位置，
    // 机位路径只依赖平滑滚动进度，消除「锚点缓动 × 相机缓动」双层橡皮筋
    const rootM = rootGroup.matrixWorld;
    const anchorPredicted = (partId, off) => {
      const part = partsMap.get(partId);
      if (!part) return null;
      const key = scrubKeyOf(part);
      const f = key === "__default" ? (targets.__default ?? 0) : (targets[key] ?? 0);
      const local = part.home.clone();
      if (HERO_STACK_LIFT[partId] !== undefined && (targets.keycaps ?? 0) > 0) {
        local.z += HERO_STACK_LIFT[partId] * (targets.keycaps ?? 0);
      } else if (part.fanDir && key !== "__default") {
        local.addScaledVector(part.fanDir, f * 26);
      } else {
        local.addScaledVector(part.explodeVec, f * state.spread);
      }
      if (sinkE > 0 && key === "__default") local.z -= 12 * sinkE;
      return local.applyMatrix4(rootM).add(new THREE.Vector3(...(off || [0, 0, 0])));
    };

    const camCtx = {
      anchor: (id, off) => anchorPredicted(id, off) || anchorWorld(id, off) || new THREE.Vector3(),
    };
    if (shot.camFn && state.loaded) {
      // 分镜编排相机：滚动进度驱动机位路径（各幕边界位姿严格连续）
      const pose = shot.camFn(prog, camCtx);
      camTarget.copy(pose.cam);
      lookTarget.copy(pose.look);
    } else if (shot.camAnchor && state.loaded) {
      const p = anchorWorld(shot.camAnchor.partId, shot.camAnchor.off);
      if (p) camTarget.copy(p);
      const l = anchorWorld(shot.lookAnchor.partId, shot.lookAnchor.off);
      if (l) lookTarget.copy(l);
    } else {
      camTarget.set(...(shot.cam || [0, -250, 195]));
      lookTarget.set(...(shot.look || [0, 5, 10]));
    }

    // 直接映射：相机/注视点/姿态本帧即达目标，无追赶滞后
    state.cam.copy(camTarget);
    state.look.copy(lookTarget);
    camOffset.copy(state.cam).sub(state.look);
    camera.position.copy(state.look).add(camOffset);
    camera.lookAt(state.look);

    const rotGoal = shot.rotFn ? shot.rotFn(prog) : shot.rot;
    state.rot.set(rotGoal[0], rotGoal[1], rotGoal[2]);
    rootGroup.rotation.copy(state.rot);

    // ---- Toolbox 引线 / Modules 漂浮标签 ----
    const inToolbox = shotId === "toolbox" && state.explosion > 0.15;
    if (inToolbox) {
      updateLeaderLines(shotId);
      svgOverlay.style.opacity = "1";
    } else {
      svgOverlay.style.opacity = "0";
    }
    updatePartTags(shotId === "modules" && state.explosion > 0.35);
  }

  function subsystemOf(group) {
    const g = group || "";
    if (g.includes("enclosure")) return "enclosure";
    if (g.includes("keycap")) return "keycaps";
    if (g.includes("switch") || g.includes("choc")) return "switches";
    if (g.includes("esp32") || g.includes("retention") || g.includes("board") || g.includes("internal")) return "esp32";
    if (g.includes("ec11") || g.includes("control")) return "ec11";
    return "enclosure";
  }

  /* =========================================================
     8. Toolbox 正交引线（包围盒中心锚点 + 视口钳制）
     ========================================================= */
  const tagPartMapping = [
    { selector: ".tag-upper-shell", partId: "cosmetic_upper_shell", side: "left" },
    { selector: ".tag-keycaps", partId: "keycap_1", side: "left" },
    { selector: ".tag-switches", partId: "choc_v2_1", side: "left" },
    { selector: ".tag-bottom-cover", partId: "bottom_service_cover", side: "left" },
    { selector: ".tag-screen-bezel", partId: "screen_bezel", side: "right" },
    { selector: ".tag-esp32", partId: "waveshare_esp32_s3_lcd_2", side: "right" },
    { selector: ".tag-retainer", partId: "esp32_m3_retainer", side: "right" },
    { selector: ".tag-ec11", partId: "ec11_knob_26x8p5", side: "right" },
  ];

  let leaderRankShot = null;
  let leaderRanks = null;
  function updateLeaderLines(shotId) {
    const w = window.innerWidth, h = window.innerHeight;
    // 两遍路由：先按零件投影 y 排定两侧标签槽位，再按槽位画线；
    // 槽位次序只在入幕时定一次、幕内冻结——标签跟踪零件但不换位（无动态避让）；
    // 模型端点不做视口钳制 → 虚线端点始终锁住零件
    const entries = [];
    tagPartMapping.forEach(({ selector, partId, side }) => {
      const el = document.querySelector(selector);
      const part = partsMap.get(partId);
      if (!el || !part || !part.pivot.visible) return;

      part.anchor.getWorldPosition(tmpV);
      tmpV.project(camera);
      const sx = (tmpV.x * 0.5 + 0.5) * w;
      const sy = (-tmpV.y * 0.5 + 0.5) * h;

      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > h) return;
      entries.push({ el, side, sx, sy, rect });
    });

    for (const side of ["left", "right"]) {
      const col = entries.filter((e) => e.side === side);
      if (col.length < 2) continue;
      if (leaderRankShot !== shotId || !leaderRanks) {
        leaderRankShot = shotId;
        leaderRanks = new Map();
        col.slice().sort((a, b) => a.sy - b.sy).forEach((e, i) => leaderRanks.set(e.el, i));
      }
      // 槽位取 offsetTop（布局位置，不受 transform/过渡中间态影响）
      const withBase = col.map((e) => ({ ...e, base: e.el.offsetTop }));
      const slots = withBase.map((e) => e.base).sort((a, b) => a - b);
      col.forEach((e) => {
        const rank = Math.min(leaderRanks.get(e.el) ?? 0, slots.length - 1);
        const ty = slots[rank] - e.base;
        if (!e.el.style.transition) {
          e.el.style.transition = "transform 0.45s cubic-bezier(.22,.61,.36,1)";
        }
        e.el.style.transform = `translateY(${ty}px)`;
      });
    }

    let html = "";
    entries.forEach(({ el, side, sx, sy }) => {
      const rect = el.getBoundingClientRect(); // 含 translateY 后位置
      const tx = side === "left" ? rect.right + 4 : rect.left - 4;
      const ty = rect.top + rect.height / 2;
      const midX = side === "left" ? tx + (sx - tx) * 0.5 : tx - (tx - sx) * 0.5;
      html += `<path class="leader-path" d="M ${tx} ${ty} L ${midX} ${ty} L ${sx} ${sy}" />`;
      html += `<circle class="leader-dot" cx="${sx}" cy="${sy}" r="3" />`;
      html += `<circle class="leader-dot" cx="${tx}" cy="${ty}" r="2" />`;
    });
    svgOverlay.innerHTML = html;
  }

  /* =========================================================
     9. Modules 漂浮质量标签
     ========================================================= */
  const groupAnchors = [
    { group: "enclosure", partId: "cosmetic_upper_shell" },
    { group: "keycaps", partId: "keycap_1" },
    { group: "switches", partId: "choc_v2_1" },
    { group: "esp32", partId: "waveshare_esp32_s3_lcd_2" },
    { group: "ec11", partId: "ec11_knob_26x8p5" },
  ];

  function updatePartTags(show) {
    const wrap = document.getElementById("part-tags");
    if (!wrap) return;
    const w = window.innerWidth, h = window.innerHeight;
    groupAnchors.forEach(({ group, partId }) => {
      const el = wrap.querySelector(`.part-tag[data-group="${group}"]`);
      const part = partsMap.get(partId);
      if (!el) return;
      if (!show || !part || !part.pivot.visible) { el.classList.remove("is-on"); return; }
      part.anchor.getWorldPosition(tmpV);
      tmpV.project(camera);
      const sx = Math.min(w - 120, Math.max(16, (tmpV.x * 0.5 + 0.5) * w + 22));
      const sy = Math.min(h - 48, Math.max(16, (-tmpV.y * 0.5 + 0.5) * h - 16));
      el.style.transform = `translate(${sx}px, ${sy}px)`;
      el.classList.add("is-on");
    });
  }

  /* =========================================================
     10. 交互
     ========================================================= */
  const bomWeights = { enclosure: 48.6, keycaps: 3.6, switches: 13.8, esp32: 27.4, ec11: 9.8 };
  const partCounts = { enclosure: 3, keycaps: 6, switches: 6, esp32: 2, ec11: 4 };

  function setGroupActive(group, active) {
    state.activeSubsystems[group] = active;
    document.querySelectorAll(`[data-group="${group}"]`).forEach((el) => {
      if (el.classList.contains("subsys-toggle") || el.classList.contains("legend-chip")) {
        el.classList.toggle("is-active", active);
      }
    });
    let totalWeight = 0, totalParts = 0;
    Object.keys(state.activeSubsystems).forEach((k) => {
      if (state.activeSubsystems[k]) { totalWeight += bomWeights[k] || 0; totalParts += partCounts[k] || 0; }
    });
    const massTotal = document.getElementById("mass-total");
    const massParts = document.getElementById("mass-parts");
    if (massTotal) massTotal.textContent = `${totalWeight.toFixed(1)} g`;
    if (massParts) massParts.textContent = `${totalParts} / 21`;
    document.querySelectorAll(".mass-bar .seg").forEach((seg) => {
      const g = seg.dataset.group;
      seg.style.width = state.activeSubsystems[g] ? `${((bomWeights[g] || 0) / 103.2) * 100}%` : "0%";
    });
  }

  document.querySelectorAll(".subsys-toggle, .legend-chip").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (el.tagName === "LABEL") e.preventDefault();
      const group = el.dataset.group;
      setGroupActive(group, !state.activeSubsystems[group]);
    });
  });
  ["keycaps", "switches", "esp32", "ec11"].forEach((g) => setGroupActive(g, true));

  const copyBtn = document.getElementById("copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText("git clone https://github.com/imzusheng/luma-remote.git");
      copyBtn.innerHTML = "✓";
      setTimeout(() => {
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    });
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* =========================================================
     11. 主循环
     ========================================================= */

  /* ---- 特写参数标注投影（keycaps / firmware 分镜） ---- */
  const calloutEls = [...document.querySelectorAll(".callout")].map((el) => ({
    el,
    shot: el.closest(".callout-set")?.dataset.for,
    partId: el.dataset.part,
    off: (el.dataset.off || "0,0,0").split(",").map(Number),
    frac: el.hasAttribute("data-frac"), // 分数锚点：按零件包围盒比例定位
  }));

  function calloutAnchor(c) {
    const part = partsMap.get(c.partId);
    if (!part) return null;
    part.anchor.getWorldPosition(tmpV);
    if (!c.frac) return tmpV.clone().add(new THREE.Vector3(...c.off));
    // 分数模式：x/y 为包围盒半宽/半深比例，z 固定悬浮于板面之上
    const bb = part.bbox, home = part.home;
    const halfW = (bb[1][0] - bb[0][0]) / 2, halfD = (bb[1][1] - bb[0][1]) / 2;
    return tmpV.clone().add(new THREE.Vector3(
      c.off[0] * halfW, c.off[1] * halfD, (bb[1][2] - home.z) + 1.6
    ));
  }

  // 槽位次序状态：入幕时定一次、幕内冻结（模块级，跨帧保持）
  let calloutRankShot = null;
  let calloutRank = null;

  function updateCallouts(shotId) {
    const w = window.innerWidth, h = window.innerHeight;
    // 两段式：先收集全部锚点投影，再统一分槽排布，避免标签互相重叠
    const visible = [];
    for (const c of calloutEls) {
      if (c.shot !== shotId) { c.el.classList.remove("is-on"); continue; }
      const part = partsMap.get(c.partId);
      if (!part || !part.pivot.visible) { c.el.classList.remove("is-on"); continue; }
      const p = calloutAnchor(c);
      if (!p) { c.el.classList.remove("is-on"); continue; }
      p.project(camera);
      visible.push({
        c,
        sx: (p.x * 0.5 + 0.5) * w,
        sy: (-p.y * 0.5 + 0.5) * h,
      });
    }
    if (!visible.length) { calloutRankShot = null; calloutRank = null; return; }
    // 槽位次序只在入幕时定一次、幕内冻结——标签跟踪零件但不换位（无动态避让）
    if (calloutRankShot !== shotId || !calloutRank) {
      calloutRankShot = shotId;
      calloutRank = visible.slice().sort((a, b) => a.sy - b.sy).map((v) => v.c);
    }
    const posOf = new Map(visible.map((v) => [v.c, v]));
    const ordered = calloutRank.map((c) => posOf.get(c)).filter(Boolean);
    // 标签列限制在画面左侧 58%，避免压到滚动内容卡片
    const lx = Math.min(w * 0.58, Math.max(...ordered.map((v) => v.sx)) + 46);
    const baseLy = Math.max(70, ordered[0].sy - 26);
    let svgLines = "";
    ordered.forEach((v, i) => {
      const ly = baseLy - i * 52;
      v.c.el.style.transform = `translate(${lx}px, ${ly}px)`;
      v.c.el.classList.add("is-on");
      svgLines += `<path class="callout-line" d="M ${v.sx} ${v.sy} L ${lx - 5} ${ly + 15}" />`;
      svgLines += `<circle class="leader-dot" cx="${v.sx}" cy="${v.sy}" r="2.5" />`;
    });
    svgOverlay.style.opacity = "1";
    svgOverlay.innerHTML = svgLines;
  }

  function animate(time) {
    requestAnimationFrame(animate);
    const t = time * 0.001;
    if (!lastFrameT) lastFrameT = t;
    const dt = Math.min(t - lastFrameT, 0.05);
    lastFrameT = t;
    updateScrollAnimation(t, dt);
    updateCallouts(state.shot);
    renderer.render(scene, camera);
  }
  let lastFrameT = 0;
  requestAnimationFrame(animate);
})();
