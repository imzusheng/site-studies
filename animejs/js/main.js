/* =========================================================
   Luma Remote A3.32 — 分镜驱动 3D 引擎 v3
   · Shot State Machine：每分镜独立机位/注视点/局部爆炸组
   · 滚动擦洗爆炸（scrub）：分镜内滚动推进拆解进度
   · 摇摆运镜（sway）：分镜内相机绕注视点缓慢弧形漂移
   · 三态材质：PBR 赛博微光 / CAD 纸面墨线 / INK 暗面线稿（特写用，省性能）
   · 动态 LCD 屏幕纹理按分镜切换界面
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
  const DEG = THREE.MathUtils.degToRad;

  const state = {
    shot: "hero",
    mode: "pbr",           // pbr | light | ink
    explosion: 0,
    spread: 1.0,
    f: { __default: 0 },
    cam: new THREE.Vector3(0, -250, 195),
    look: new THREE.Vector3(0, 5, 10),
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
    // INK 暗面线稿（feature 特写：暗底 + 白线，MeshBasic 零光照开销）
    inkSolid: new THREE.MeshBasicMaterial({ color: 0x17171c, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    inkLineDim: new THREE.LineBasicMaterial({ color: 0xf6f4f2, linewidth: 1, transparent: true, opacity: 0.16 }),
    inkLineHot: new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1.4, transparent: true, opacity: 0.9 }),
    // CAD 模式下的白轮廓（暗背景模式备用）
    darkLine: new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, transparent: true, opacity: 0.16 }),
  };

  /* =========================================================
     3. LCD 动态屏幕纹理（按分镜切换界面）
     ========================================================= */
  const lcdCanvas = document.createElement("canvas");
  lcdCanvas.width = 480; lcdCanvas.height = 640;
  const lcdCtx = lcdCanvas.getContext("2d");
  const lcdTexture = new THREE.CanvasTexture(lcdCanvas);
  lcdTexture.colorSpace = THREE.SRGBColorSpace;
  const lcdMaterial = new THREE.MeshBasicMaterial({ map: lcdTexture, toneMapped: false });
  let lcdPlane = null;

  function lcdBase(title, accent) {
    const w = lcdCanvas.width, h = lcdCanvas.height;
    lcdCtx.fillStyle = "#0c1018";
    lcdCtx.fillRect(0, 0, w, h);
    lcdCtx.fillStyle = "rgba(255,255,255,0.12)";
    lcdCtx.fillRect(0, 0, w, 44);
    lcdCtx.fillStyle = "#64d2ff";
    lcdCtx.font = "bold 20px IBMPlexMono, monospace";
    lcdCtx.fillText("9:41", 24, 30);
    lcdCtx.fillStyle = accent || "#30d158";
    lcdCtx.font = "15px IBMPlexMono, monospace";
    lcdCtx.fillText(title, 190, 30);
  }

  function updateLcdScreen(time) {
    const w = lcdCanvas.width, h = lcdCanvas.height;
    const shot = state.shot;

    if (shot === "display") {
      lcdBase("SCOPE", "#ff3b30");
      lcdCtx.strokeStyle = "rgba(255,255,255,0.08)";
      lcdCtx.lineWidth = 2;
      for (let gx = 0; gx <= w; gx += 48) { lcdCtx.beginPath(); lcdCtx.moveTo(gx, 60); lcdCtx.lineTo(gx, h - 20); lcdCtx.stroke(); }
      for (let gy = 60; gy <= h - 20; gy += 48) { lcdCtx.beginPath(); lcdCtx.moveTo(0, gy); lcdCtx.lineTo(w, gy); lcdCtx.stroke(); }
      lcdCtx.strokeStyle = "#ff3b30"; lcdCtx.lineWidth = 5;
      lcdCtx.shadowColor = "#ff3b30"; lcdCtx.shadowBlur = 16;
      lcdCtx.beginPath();
      for (let x = 0; x < w; x += 5) {
        const p = x / w;
        const y = h / 2 + Math.sin(p * Math.PI * 6 + time * 4) * 110 * (0.6 + 0.4 * Math.sin(time * 0.8));
        x === 0 ? lcdCtx.moveTo(x, y) : lcdCtx.lineTo(x, y);
      }
      lcdCtx.stroke(); lcdCtx.shadowBlur = 0;
      lcdCtx.fillStyle = "#f6f4f2"; lcdCtx.font = "bold 18px IBMPlexMono, monospace";
      lcdCtx.fillText("240x320 @ 40MHz DMA", 24, h - 34);
    } else if (shot === "keycaps") {
      lcdBase("KEY TEST", "#ff9500");
      for (let i = 0; i < 6; i++) {
        const bx = 40 + (i % 2) * 220, by = 90 + Math.floor(i / 2) * 160;
        const active = Math.sin(time * 5 - i * 0.9) > 0.55;
        lcdCtx.fillStyle = active ? "rgba(255,59,48,0.4)" : "rgba(255,255,255,0.06)";
        lcdCtx.strokeStyle = active ? "#ff3b30" : "rgba(255,255,255,0.18)";
        lcdCtx.lineWidth = 3;
        lcdCtx.beginPath(); lcdCtx.roundRect(bx, by, 190, 110, 12); lcdCtx.fill(); lcdCtx.stroke();
        lcdCtx.fillStyle = active ? "#ff3b30" : "#8a8f98";
        lcdCtx.font = "bold 22px IBMPlexMono, monospace";
        lcdCtx.fillText(`SW${i + 1}`, bx + 18, by + 44);
        lcdCtx.fillStyle = active ? "#ffd60a" : "rgba(255,255,255,0.25)";
        lcdCtx.font = "14px IBMPlexMono, monospace";
        lcdCtx.fillText(active ? "3.0 mm PRESS" : "idle", bx + 18, by + 78);
      }
    } else if (shot === "knob") {
      lcdBase("VOLUME", "#30d158");
      const cx = w / 2, cy = 330, r = 130;
      lcdCtx.strokeStyle = "rgba(255,255,255,0.14)"; lcdCtx.lineWidth = 14;
      lcdCtx.beginPath(); lcdCtx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); lcdCtx.stroke();
      const val = (Math.sin(time * 1.2) + 1) / 2;
      lcdCtx.strokeStyle = "#30d158"; lcdCtx.lineWidth = 16;
      lcdCtx.shadowColor = "#30d158"; lcdCtx.shadowBlur = 14;
      lcdCtx.beginPath(); lcdCtx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + val * Math.PI * 1.5);
      lcdCtx.stroke(); lcdCtx.shadowBlur = 0;
      lcdCtx.fillStyle = "#f6f4f2"; lcdCtx.font = "bold 52px IBMPlexMono, monospace"; lcdCtx.textAlign = "center";
      lcdCtx.fillText(String(Math.round(val * 100)), cx, cy + 18);
      lcdCtx.font = "16px IBMPlexMono, monospace"; lcdCtx.fillStyle = "#8a8f98";
      lcdCtx.fillText("EC11 · 20 DETENTS", cx, cy + 250);
      lcdCtx.textAlign = "left";
    } else if (shot === "firmware") {
      lcdBase("SYSTEM", "#bf5af2");
      const rows = [["CORE", "LX7 x2 @240MHz"], ["PSRAM", "8 MB OK"], ["FLASH", "16 MB OK"], ["RADIO", "Wi-Fi + BLE5"], ["LINK", "HA · MQTT OK"], ["FW", "v0.9.3 (A3.32)"]];
      rows.forEach((r, i) => {
        const y = 110 + i * 66;
        lcdCtx.fillStyle = "#8a8f98"; lcdCtx.font = "15px IBMPlexMono, monospace"; lcdCtx.fillText(r[0], 40, y);
        lcdCtx.fillStyle = "#f6f4f2"; lcdCtx.font = "bold 19px IBMPlexMono, monospace"; lcdCtx.fillText(r[1], 170, y);
        lcdCtx.strokeStyle = "rgba(255,255,255,0.08)"; lcdCtx.lineWidth = 2;
        lcdCtx.beginPath(); lcdCtx.moveTo(40, y + 18); lcdCtx.lineTo(w - 40, y + 18); lcdCtx.stroke();
      });
      const boot = (Math.sin(time * 0.9) + 1) / 2;
      lcdCtx.fillStyle = "rgba(255,255,255,0.1)"; lcdCtx.fillRect(40, h - 90, w - 80, 14);
      lcdCtx.fillStyle = "#bf5af2"; lcdCtx.fillRect(40, h - 90, (w - 80) * boot, 14);
    } else if (shot === "ergonomics") {
      lcdBase("ATTITUDE", "#ff9500");
      const cx = w / 2, cy = 340;
      lcdCtx.save();
      lcdCtx.translate(cx, cy);
      lcdCtx.rotate(DEG(-8.325 + Math.sin(time * 0.7) * 0.6));
      lcdCtx.fillStyle = "rgba(100,210,255,0.10)";
      lcdCtx.fillRect(-240, -160, 480, 160);
      lcdCtx.strokeStyle = "#64d2ff"; lcdCtx.lineWidth = 4;
      lcdCtx.beginPath(); lcdCtx.moveTo(-220, 0); lcdCtx.lineTo(220, 0); lcdCtx.stroke();
      for (let d = -3; d <= 3; d++) {
        if (!d) continue;
        lcdCtx.strokeStyle = "rgba(255,255,255,0.35)"; lcdCtx.lineWidth = 3;
        lcdCtx.beginPath(); lcdCtx.moveTo(-60, d * 46); lcdCtx.lineTo(60, d * 46); lcdCtx.stroke();
      }
      lcdCtx.restore();
      lcdCtx.strokeStyle = "#ff3b30"; lcdCtx.lineWidth = 5;
      lcdCtx.beginPath(); lcdCtx.moveTo(cx - 40, cy); lcdCtx.lineTo(cx + 40, cy); lcdCtx.stroke();
      lcdCtx.fillStyle = "#f6f4f2"; lcdCtx.font = "bold 40px IBMPlexMono, monospace"; lcdCtx.textAlign = "center";
      lcdCtx.fillText("8.325°", cx, h - 130);
      lcdCtx.font = "16px IBMPlexMono, monospace"; lcdCtx.fillStyle = "#8a8f98";
      lcdCtx.fillText("LOW-DECK WRIST RELIEF", cx, h - 92);
      lcdCtx.textAlign = "left";
    } else {
      lcdBase("HA · CONNECTED", "#30d158");
      lcdCtx.strokeStyle = "#ff3b30"; lcdCtx.lineWidth = 4;
      lcdCtx.shadowColor = "#ff3b30"; lcdCtx.shadowBlur = 10;
      lcdCtx.beginPath();
      for (let x = 0; x < w; x += 6) {
        const p = x / w;
        const y = 250 + Math.sin(p * Math.PI * 4 + time * 3) * 60 + Math.cos(p * 12 + time * 2) * 20;
        x === 0 ? lcdCtx.moveTo(x, y) : lcdCtx.lineTo(x, y);
      }
      lcdCtx.stroke(); lcdCtx.shadowBlur = 0;
      for (let i = 0; i < 6; i++) {
        const bx = 30 + (i % 3) * 145, by = 400 + Math.floor(i / 3) * 80;
        const active = (Math.floor(time * 2) % 6) === i;
        lcdCtx.fillStyle = active ? "rgba(255,59,48,0.35)" : "rgba(255,255,255,0.06)";
        lcdCtx.strokeStyle = active ? "#ff3b30" : "rgba(255,255,255,0.15)";
        lcdCtx.lineWidth = 2;
        lcdCtx.beginPath(); lcdCtx.roundRect(bx, by, 130, 60, 8); lcdCtx.fill(); lcdCtx.stroke();
        lcdCtx.fillStyle = active ? "#ff3b30" : "#888";
        lcdCtx.font = "bold 15px IBMPlexMono, monospace";
        lcdCtx.fillText(`KEY ${i + 1}`, bx + 14, by + 36);
      }
    }
    lcdTexture.needsUpdate = true;
  }

  /* =========================================================
     4. 分镜脚本（Shot State Machine）
     scrub: [起, 止] —— 分镜内滚动进度擦洗爆炸系数
     sway: 相机绕注视点的弧形漂移幅度（度）
     focus: INK 模式下白亮描线的焦点零件/组
     ========================================================= */
  const SHOTS = [
    {
      id: "hero", el: "#intro", theme: "pbr", sway: 2.5,
      cam: [0, -250, 195], look: [0, 5, 10], rot: [0, 0, 0.03],
      scrub: { __default: [0, 0] },
    },
    {
      id: "toolbox", el: "#toolbox", theme: "light", sway: 4,
      cam: [20, -330, 300], look: [0, 0, 0], rot: [0.22, -0.3, 0.42], spread: 1.15,
      scrub: { __default: [0, 1] },
    },
    {
      id: "ergonomics", el: '[data-feature="ergonomics"]', theme: "ink", sway: 5,
      cam: [170, -95, 150], look: [0, 2, 8], rot: [0.05, -0.5, 0],
      scrub: { __default: [0, 0] },
      focus: { groups: ["enclosure"] },
    },
    {
      id: "keycaps", el: '[data-feature="keycaps"]', theme: "ink", sway: 6,
      camAnchor: { partId: "keycap_2", off: [-12, -105, 150] },
      lookAnchor: { partId: "keycap_2", off: [0, 0, 4] },
      rot: [0.1, -0.15, 0],
      scrub: { keycaps: [0.05, 0.7], "choc-v2-switches": [0.0, 0.35] },
      focus: { groups: ["keycaps", "choc-v2-switches"] },
    },
    {
      id: "knob", el: '[data-feature="knob"]', theme: "ink", sway: 7,
      camAnchor: { partId: "ec11_knob_26x8p5", off: [24, -115, 160] },
      lookAnchor: { partId: "ec11_knob_26x8p5", off: [0, 0, 2] },
      rot: [0.12, -0.2, 0],
      scrub: { "ec11-stack": [0.1, 0.95] },
      focus: { groups: ["ec11-stack"] },
    },
    {
      id: "display", el: '[data-feature="display"]', theme: "ink", sway: 5,
      camAnchor: { partId: "actual_waveshare_esp32_s3_lcd_2", off: [0, -150, 240] },
      lookAnchor: { partId: "actual_waveshare_esp32_s3_lcd_2", off: [0, 0, 4] },
      rot: [0, 0, 0],
      scrub: { screen_bezel: [0, 1] },
      focus: { parts: ["screen_bezel", "actual_waveshare_esp32_s3_lcd_2"] },
    },
    {
      id: "firmware", el: '[data-feature="firmware"]', theme: "ink", sway: 6,
      camAnchor: { partId: "actual_waveshare_esp32_s3_lcd_2", off: [12, -150, 215] },
      lookAnchor: { partId: "actual_waveshare_esp32_s3_lcd_2", off: [0, 0, 0] },
      rot: [0.15, -0.3, 0],
      scrub: { actual_waveshare_esp32_s3_lcd_2: [0, 0.9], esp32_m3_retainer: [0, 0.65] },
      focus: { parts: ["actual_waveshare_esp32_s3_lcd_2", "esp32_m3_retainer"] },
    },
    {
      id: "modules", el: "#modules", theme: "light", sway: 3,
      cam: [45, -400, 380], look: [0, 0, 0], rot: [0.22, -0.3, 0.42], spread: 1.9,
      scrub: { __default: [0.85, 1] },
    },
    {
      id: "specs", el: "#specs", theme: "pbr", sway: 2,
      cam: [0, -270, 210], look: [0, 6, 10], rot: [0, 0, 0.03],
      scrub: { __default: [0, 0] },
    },
  ];

  function detectShot() {
    const vh = window.innerHeight;
    const center = vh * 0.5;
    let best = "hero";
    for (const shot of SHOTS) {
      const el = document.querySelector(shot.el);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= center && rect.bottom > center) best = shot.id;
    }
    return best;
  }

  function shotProgress(shot) {
    const el = document.querySelector(shot.el);
    if (!el) return 0;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    const span = Math.max(rect.height - vh * 0.25, 1);
    return Math.min(1, Math.max(0, (vh * 0.62 - rect.top) / span));
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

          const mesh = new THREE.Mesh(geometry, pbrMaterialFor(p.id));
          const edgesGeom = new THREE.EdgesGeometry(geometry, 28);
          const line = new THREE.LineSegments(edgesGeom, materials.darkLine);
          mesh.add(line);

          const bb = p.bboxMm;
          const center = new THREE.Vector3(
            (bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2
          );
          const anchor = new THREE.Object3D();
          anchor.position.copy(center);
          mesh.add(anchor);

          rootGroup.add(mesh);

          const explodeVec = p.explodeVectorMm
            ? new THREE.Vector3(...p.explodeVectorMm) : new THREE.Vector3();

          partsMap.set(p.id, {
            id: p.id,
            group: p.selectionGroupId || p.group,
            mesh, line, anchor,
            bbox: bb,
            explodeVec,
          });
          resolve();
        }, undefined, () => resolve());
      })));

      // 整装居中
      const box = new THREE.Box3().setFromObject(rootGroup);
      const c = new THREE.Vector3();
      box.getCenter(c);
      rootGroup.position.sub(c);

      // LCD 动态屏幕平面（主板横置：42.5 × 31.5，沿主板顶面下沉）
      const board = partsMap.get("actual_waveshare_esp32_s3_lcd_2");
      if (board) {
        const bb = board.bbox;
        const bw = bb[1][0] - bb[0][0], bd = bb[1][1] - bb[0][1];
        const landscape = bw > bd;
        const pw = landscape ? 42.5 : 31.5;
        const ph = landscape ? 31.5 : 42.5;
        lcdPlane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), lcdMaterial);
        lcdPlane.position.set(
          (bb[0][0] + bb[1][0]) / 2,
          (bb[0][1] + bb[1][1]) / 2,
          bb[1][2] + 0.12
        );
        if (landscape) lcdPlane.rotation.z = Math.PI / 2;
        rootGroup.add(lcdPlane);
      }

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
    partsMap.forEach((p) => {
      if (mode === "light") {
        p.mesh.material = materials.lightSolid;
        p.line.material = materials.lightLine;
      } else if (mode === "ink") {
        p.mesh.material = materials.inkSolid;
        const isFocus =
          (focus.groups && focus.groups.includes(p.group)) ||
          (focus.parts && focus.parts.includes(p.id));
        p.line.material = isFocus ? materials.inkLineHot : materials.inkLineDim;
      } else {
        p.mesh.material = pbrMaterialFor(p.id);
        p.line.material = materials.darkLine;
      }
    });
    document.body.classList.toggle("theme-light", mode === "light");
    if (lcdPlane) lcdPlane.visible = mode !== "light";
  }

  /* =========================================================
     7. 每帧更新
     ========================================================= */
  let targetScrollY = window.scrollY;
  let currentScrollY = window.scrollY;
  window.addEventListener("scroll", () => { targetScrollY = window.scrollY; }, { passive: true });

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

  function updateScrollAnimation(time) {
    currentScrollY += (targetScrollY - currentScrollY) * 0.1;

    const shotId = detectShot();
    const shotChanged = shotId !== state.shot;
    state.shot = shotId;
    const shot = shotById(shotId);

    if (shotChanged) {
      if (hudShot) hudShot.textContent = "SHOT: " + shotId.toUpperCase();
      applyMode(shot.theme, shot);
    }

    // ---- 滚动擦洗爆炸因子 ----
    const prog = shotProgress(shot);
    const targets = {};
    const scrub = shot.scrub || { __default: [0, 0] };
    for (const [key, range] of Object.entries(scrub)) {
      targets[key] = range[0] + (range[1] - range[0]) * prog;
    }
    for (const key of Object.keys(state.f)) {
      const t = targets[key];
      state.f[key] = t === undefined
        ? state.f[key] + (0 - state.f[key]) * 0.09
        : state.f[key] + (t - state.f[key]) * 0.1;
    }
    for (const key of Object.keys(targets)) {
      if (state.f[key] === undefined) state.f[key] = targets[key];
    }

    state.explosion = state.f.__default;
    const targetSpread = shot.spread ?? 1;
    state.spread += (targetSpread - state.spread) * 0.08;

    if (explosionFill && explosionPercent) {
      const pct = Math.round(state.explosion * 100);
      explosionFill.style.width = `${pct}%`;
      explosionPercent.textContent = `${pct}%`;
    }

    // ---- 零件位移（scrub 点名的零件用独立系数，其余跟随 __default）----
    const managed = new Set(Object.keys(scrub).filter((k) => k !== "__default"));
    partsMap.forEach((part) => {
      const visible = state.activeSubsystems[subsystemOf(part.group)];
      part.mesh.visible = visible;
      if (visible) {
        const base = managed.has(part.id) ? (state.f[part.id] ?? 0) : state.f.__default;
        part.mesh.position.copy(part.explodeVec).multiplyScalar(base * state.spread);
      }
    });
    if (lcdPlane) lcdPlane.visible = state.mode !== "light" &&
      partsMap.get("actual_waveshare_esp32_s3_lcd_2")?.mesh.visible;

    // ---- 相机 / 注视点 / 摇摆运镜 ----
    const mouseX = (window.__mouseX || 0) * 0.08;
    const mouseY = (window.__mouseY || 0) * 0.08;

    if (shot.camAnchor && state.loaded) {
      const p = anchorWorld(shot.camAnchor.partId, shot.camAnchor.off);
      if (p) camTarget.copy(p);
    } else {
      camTarget.set(...shot.cam);
    }
    if (shot.lookAnchor && state.loaded) {
      const l = anchorWorld(shot.lookAnchor.partId, shot.lookAnchor.off);
      if (l) lookTarget.copy(l);
    } else {
      lookTarget.set(...shot.look);
    }

    state.cam.lerp(camTarget, 0.055);
    state.look.lerp(lookTarget, 0.055);

    // 弧形摇摆：相机偏移绕 Z 轴缓摆 → 模型似在缓缓旋转
    const swayRad = DEG(shot.sway ?? 0) * Math.sin(time * 0.24);
    camOffset.copy(state.cam).sub(state.look).applyAxisAngle(Z_AXIS, swayRad);
    camera.position.copy(state.look).add(camOffset);
    camera.lookAt(state.look);

    state.rot.x += (shot.rot[0] + mouseY - state.rot.x) * 0.06;
    state.rot.y += (shot.rot[1] + mouseX - state.rot.y) * 0.06;
    state.rot.z += (shot.rot[2] - state.rot.z) * 0.06;
    rootGroup.rotation.copy(state.rot);

    // ---- Toolbox 引线 / Modules 漂浮标签 ----
    const inToolbox = shotId === "toolbox" && state.explosion > 0.15;
    if (inToolbox) {
      updateLeaderLines();
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
    { selector: ".tag-esp32", partId: "actual_waveshare_esp32_s3_lcd_2", side: "right" },
    { selector: ".tag-retainer", partId: "esp32_m3_retainer", side: "right" },
    { selector: ".tag-ec11", partId: "ec11_knob_26x8p5", side: "right" },
  ];

  function updateLeaderLines() {
    let html = "";
    const w = window.innerWidth, h = window.innerHeight;
    const mx = w * 0.06, my = h * 0.08;

    tagPartMapping.forEach(({ selector, partId, side }) => {
      const el = document.querySelector(selector);
      const part = partsMap.get(partId);
      if (!el || !part || !part.mesh.visible) return;

      part.anchor.getWorldPosition(tmpV);
      tmpV.project(camera);
      let sx = (tmpV.x * 0.5 + 0.5) * w;
      let sy = (-tmpV.y * 0.5 + 0.5) * h;
      sx = Math.min(w - mx, Math.max(mx, sx));
      sy = Math.min(h - my, Math.max(my, sy));

      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > h) return;
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
    { group: "esp32", partId: "actual_waveshare_esp32_s3_lcd_2" },
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
      if (!show || !part || !part.mesh.visible) { el.classList.remove("is-on"); return; }
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
  window.addEventListener("mousemove", (e) => {
    window.__mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    window.__mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

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
  function animate(time) {
    requestAnimationFrame(animate);
    updateLcdScreen(time * 0.001);
    updateScrollAnimation(time * 0.001);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
})();
