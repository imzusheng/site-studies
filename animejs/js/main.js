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
import { createFilmTimeline, motion, shotAt } from "./film.js";
import { computeAnchors } from "./film/anchors.js";

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
  // 入镜混合的二次缓入：起点速度为 0、平滑加速接棒（消除换镜 lerp 窗口的速度尖峰）
  const easeIn = (k) => k * k;

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
    screenGlow: new THREE.MeshBasicMaterial({ color: 0x52d8ff, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  };

  // 焦点混搭两端色：暗面配角 ↔ 纸面主角（每零件实例逐帧插值，换镜不再闪切）
  const INK_SOLID_COLOR = new THREE.Color(0x17171c);
  const PAPER_SOLID_COLOR = new THREE.Color(0xf5f2e9);
  const INK_LINE_COLOR = new THREE.Color(0xf6f4f2);
  const PAPER_LINE_COLOR = new THREE.Color(0x1c1a17);

  const shotById = (id) => ({ id, theme: ({ hero: "pbr", blueprint: "light", input: "ink", control: "ink", compute: "ink", final: "pbr" })[id] || "pbr" });

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
      window.__filmAnchors = computeAnchors(manifest);

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
            focusTarget: 0, carryTarget: 0, focusMix: 0,
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
      baseRadius = Math.max(220, box.getSize(new THREE.Vector3()).length() * 1.9);
      createLcdStage();
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
    const carry = shot.carry || {};
    // 组名前缀匹配（selectionGroupId 带后缀，如 enclosure-closure）
    const inSet = (p, set) =>
      (set.groups && set.groups.some((g) => (p.group || "").includes(g))) ||
      (set.parts && set.parts.includes(p.id));
    partsMap.forEach((p) => {
      if (mode === "light") {
        p.mesh.material = materials.lightSolid;
        p.line.material = materials.lightLine;
        p.microLine.visible = false;
      } else if (mode === "ink") {
        // 焦点混搭：材质指向每零件专属实例，焦点状态走 focusTarget 逐帧插值；
        // carry = 上一幕主角，在幕前段淡出（高亮交棒，换镜不瞬黑）
        p.mesh.material = p.inkMat;
        p.line.material = p.inkLineMat;
        p.microLine.material = p.microMat;
        p.microLine.visible = true;
        p.focusTarget = inSet(p, focus) ? 1 : 0;
        p.carryTarget = inSet(p, carry) ? 1 : 0;
      } else {
        p.mesh.material = pbrMaterialFor(p.id);
        p.line.material = materials.darkLine;
        p.microLine.visible = false;
      }
    });
    document.body.classList.toggle("theme-light", mode === "light");
  }

  /* =========================================================
     7. Anime.js motion state → deterministic Three.js pose
     ========================================================= */
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const semanticWorld = (name) => {
    const ids = { display_center: "screen_bezel", keyboard_region: "keycap_2", knob_axis: "ec11_knob_26x8p5", mainboard_plane: "waveshare_esp32_s3_lcd_2" };
    const part = partsMap.get(ids[name]);
    if (!part) return new THREE.Vector3();
    part.anchor.getWorldPosition(tmpV);
    return tmpV.clone();
  };
  const resolveFocus = () => {
    const weights = [["display_center", motion.focusDisplay], ["keyboard_region", motion.focusKeyboard], ["knob_axis", motion.focusKnob], ["mainboard_plane", motion.focusMainboard]];
    const sum = weights.reduce((n, [, w]) => n + w, 0) || 1;
    const target = new THREE.Vector3();
    weights.forEach(([name, weight]) => target.addScaledVector(semanticWorld(name), weight / sum));
    return target;
  };
  let lcdStage = null;
  const stageSvg = document.createElementNS("http://www.w3.org/2000/svg", "path");
  stageSvg.setAttribute("class", "lcd-stage-path");
  svgOverlay.appendChild(stageSvg);
  function createLcdStage() {
    const part = partsMap.get("screen_bezel");
    if (!part || lcdStage) return;
    const box = new THREE.Box3().setFromObject(part.mesh), size = box.getSize(new THREE.Vector3());
    lcdStage = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(12, size.x * .78), Math.max(12, size.y * .78)), materials.screenGlow);
    lcdStage.position.set(0, 0, size.z * .52 + .8); part.pivot.add(lcdStage);
  }
  const project = (v) => { const p = v.clone().project(camera); return [(p.x * .5 + .5) * innerWidth, (-p.y * .5 + .5) * innerHeight]; };
  function updateLcdStage() {
    const part = partsMap.get("screen_bezel");
    if (!part) return;
    const box = new THREE.Box3().setFromObject(part.mesh), c = box.getCenter(new THREE.Vector3()), z = box.max.z + 1;
    const w = (box.max.x - box.min.x) * .78, h = (box.max.y - box.min.y) * .78;
    const quad = [project(new THREE.Vector3(c.x-w/2,c.y+h/2,z)), project(new THREE.Vector3(c.x+w/2,c.y+h/2,z)), project(new THREE.Vector3(c.x+w/2,c.y-h/2,z)), project(new THREE.Vector3(c.x-w/2,c.y-h/2,z))];
    const pad = 40 * motion.stageExpand;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const stage = quad.map(([x,y]) => [x + (cx-x)*motion.stageExpand + (x < cx ? -pad : pad), y + (cy-y)*motion.stageExpand + (y < cy ? -pad : pad)]);
    stageSvg.setAttribute("d", `M ${stage.map(([x,y]) => `${x} ${y}`).join(" L ")} Z`);
    stageSvg.style.opacity = String(.35 + motion.stageExpand * .5);
    if (lcdStage) { lcdStage.visible = motion.lcdIntensity > .05; materials.screenGlow.opacity = .15 + motion.lcdIntensity * .65; }
  }
  function updateScrollAnimation() {
    const film = shotAt(motionTime());
    state.shot = film.id;
    if (hudShot) hudShot.textContent = "SHOT: " + film.id.toUpperCase();
    document.body.dataset.shot = film.id;
    const visual = shotById(film.id);
    applyMode(visual.theme, visual);
    state.rot.set(motion.productPitch, motion.productRoll, motion.productYaw);
    rootGroup.rotation.copy(state.rot);
    rootGroup.updateMatrixWorld(true);
    const focus = resolveFocus();
    const radius = Math.max(150, baseRadius * motion.cameraRadiusScale);
    const az = THREE.MathUtils.degToRad(motion.cameraAzimuth), el = THREE.MathUtils.degToRad(motion.cameraElevation);
    camTarget.copy(focus).add(new THREE.Vector3(Math.sin(az)*radius*Math.cos(el), -Math.cos(az)*radius*Math.cos(el), radius*Math.sin(el)));
    lookTarget.copy(focus);
    camera.position.copy(camTarget); camera.lookAt(lookTarget); camera.fov = motion.cameraFov; camera.updateProjectionMatrix();
    state.cam.copy(camTarget); state.look.copy(lookTarget);
    const explode = motion.blueprintSeparation;
    if (explosionFill && explosionPercent) { explosionFill.style.width = `${Math.round(explode*100)}%`; explosionPercent.textContent = `${Math.round(explode*100)}%`; }
    partsMap.forEach((part) => {
      part.pivot.visible = state.activeSubsystems[subsystemOf(part.group)];
      if (!part.pivot.visible) return;
      part.pivot.position.copy(part.home);
      const isInput = part.id.startsWith("keycap") || part.group?.includes("choc");
      const isCompute = part.group?.includes("esp32") || part.group?.includes("board") || part.id.includes("waveshare");
      const amount = isInput ? motion.keycapLift / 40 : isCompute ? motion.boardLift * 0.7 : explode;
      part.pivot.position.addScaledVector(part.explodeVec, amount);
      if (part.id.startsWith("keycap") && motion.keycapSequence) part.pivot.position.z += (part.id === "keycap_2" ? motion.keycapLift : motion.keycapLift * .35);
      if (part.id.includes("ec11") && motion.knobRotation) part.mesh.rotation.z = motion.knobRotation;
      if (isCompute && motion.boardFlip) part.mesh.rotation.x = -Math.PI * .9 * motion.boardFlip;
    });
    updateLcdStage();
  }
  let baseRadius = 330;
  const motionTime = () => motion.filmTime || window.__filmTimeline?.currentTime || 0;

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
    { selector: ".tag-screen-bezel", partId: "screen_bezel", side: "right" },
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
    const local = new THREE.Vector3();
    if (!c.frac) {
      local.set(...c.off);
    } else {
      // 分数锚点先在 PCB 局部坐标中定位，再随 pivot/root 的 X+Z 姿态转到 world。
      const bb = part.bbox, home = part.home;
      const halfW = (bb[1][0] - bb[0][0]) / 2, halfD = (bb[1][1] - bb[0][1]) / 2;
      local.set(
        c.off[0] * halfW,
        c.off[1] * halfD,
        (bb[1][2] - home.z) + 1.6
      );
    }
    return part.pivot.localToWorld(local);
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

  const filmRoot = document.querySelector(".content-scroll") || document.body;
  let filmTimeline;
  filmTimeline = createFilmTimeline(filmRoot, () => { motion.filmTime = filmTimeline.currentTime || 0; });
  window.__filmTimeline = filmTimeline;

  function animate() {
    requestAnimationFrame(animate);
    updateScrollAnimation();
    updateCallouts(state.shot);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
  requestAnimationFrame(animate);
})();
