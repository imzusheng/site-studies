/* =========================================================
   Luma Remote A4.14 — 3D & 动效引擎
   Three.js 机械线稿着色器 + ESP32 动态屏幕纹理 + 滚动驱动爆炸
   ========================================================= */

import * as THREE from "/vendor/three.module.js";
import { STLLoader } from "/vendor/STLLoader.js";

(() => {
  "use strict";

  const canvas = document.getElementById("webgl-canvas");
  const svgOverlay = document.getElementById("leader-lines");
  const explosionFill = document.getElementById("explosion-fill");
  const explosionPercent = document.getElementById("explosion-percent");
  const deckHud = document.getElementById("deck-hud");

  const state = {
    scrollProgress: 0,
    currentTheme: "dark",
    explosion: 0, // 0.0 ~ 1.0
    activeSubsystems: {
      enclosure: true,
      keycaps: true,
      switches: true,
      esp32: true,
      ec11: true,
      keepouts: true,
    },
    loaded: false,
  };

  /* =========================================================
     1. ESP32-S3-LCD-2 动态屏幕纹理 (2.0" 240×320 IPS)
     ========================================================= */
  const lcdCanvas = document.createElement("canvas");
  lcdCanvas.width = 480;
  lcdCanvas.height = 640;
  const lcdCtx = lcdCanvas.getContext("2d");
  const lcdTexture = new THREE.CanvasTexture(lcdCanvas);
  lcdTexture.colorSpace = THREE.SRGBColorSpace;

  function updateLcdScreen(time) {
    const w = lcdCanvas.width;
    const h = lcdCanvas.height;

    // 深色赛博 LCD 底色
    lcdCtx.fillStyle = "#0c1018";
    lcdCtx.fillRect(0, 0, w, h);

    // 状态栏
    lcdCtx.fillStyle = "rgba(255, 255, 255, 0.12)";
    lcdCtx.fillRect(0, 0, w, 44);

    lcdCtx.fillStyle = "#64d2ff";
    lcdCtx.font = "bold 20px IBMPlexMono, monospace";
    lcdCtx.fillText("9:41", 24, 30);

    lcdCtx.fillStyle = "#30d158";
    lcdCtx.font = "16px IBMPlexMono, monospace";
    lcdCtx.fillText("BLE // HA: CONNECTED", 200, 30);

    // 动态示波器波形 (Oscilloscope)
    lcdCtx.strokeStyle = "#ff3b30";
    lcdCtx.lineWidth = 4;
    lcdCtx.shadowColor = "#ff3b30";
    lcdCtx.shadowBlur = 12;

    lcdCtx.beginPath();
    for (let x = 0; x < w; x += 6) {
      const prog = x / w;
      const y = h / 2 + Math.sin(prog * Math.PI * 4 + time * 3) * 60 + Math.cos(prog * 12 + time * 2) * 20;
      if (x === 0) lcdCtx.moveTo(x, y);
      else lcdCtx.lineTo(x, y);
    }
    lcdCtx.stroke();
    lcdCtx.shadowBlur = 0;

    // 音量与旋钮刻度环
    lcdCtx.strokeStyle = "rgba(100, 210, 255, 0.4)";
    lcdCtx.lineWidth = 6;
    lcdCtx.beginPath();
    lcdCtx.arc(w / 2, h - 140, 80, Math.PI * 0.75, Math.PI * 2.25);
    lcdCtx.stroke();

    const valAngle = Math.PI * 0.75 + ((Math.sin(time * 1.5) + 1) / 2) * (Math.PI * 1.5);
    lcdCtx.strokeStyle = "#ff9500";
    lcdCtx.lineWidth = 8;
    lcdCtx.beginPath();
    lcdCtx.arc(w / 2, h - 140, 80, Math.PI * 0.75, valAngle);
    lcdCtx.stroke();

    lcdCtx.fillStyle = "#f6f4f2";
    lcdCtx.font = "bold 28px IBMPlexMono, monospace";
    lcdCtx.textAlign = "center";
    lcdCtx.fillText("VOL: " + Math.round(((Math.sin(time * 1.5) + 1) / 2) * 100) + "%", w / 2, h - 130);
    lcdCtx.textAlign = "left";

    // 6 颗按键状态指示
    for (let i = 0; i < 6; i++) {
      const bx = 30 + (i % 3) * 145;
      const by = 80 + Math.floor(i / 3) * 65;
      const active = (Math.floor(time * 2) % 6) === i;

      lcdCtx.fillStyle = active ? "rgba(255, 59, 48, 0.35)" : "rgba(255, 255, 255, 0.06)";
      lcdCtx.strokeStyle = active ? "#ff3b30" : "rgba(255, 255, 255, 0.15)";
      lcdCtx.lineWidth = 2;
      lcdCtx.roundRect(bx, by, 130, 50, 8);
      lcdCtx.fill();
      lcdCtx.stroke();

      lcdCtx.fillStyle = active ? "#ff3b30" : "#888";
      lcdCtx.font = "bold 16px IBMPlexMono, monospace";
      lcdCtx.fillText(`KEY ${i + 1}`, bx + 16, by + 32);
    }

    lcdTexture.needsUpdate = true;
  }

  /* =========================================================
     2. THREE.JS 场景、相机与光照配置
     ========================================================= */
  const scene = new THREE.Scene();
  scene.up.set(0, 0, 1);
  window.__scene = scene;

  // CAD 坐标系：Z 轴向上，初始设为自然等轴俯仰角
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -220, 170);
  camera.lookAt(0, 0, 0);
  window.__camera = camera;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  window.__renderer = renderer;

  // 光照体系
  scene.add(new THREE.HemisphereLight(0xdfffe4, 0x172018, 2.4));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
  keyLight.position.set(-120, -180, 260);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xff6a3d, 1.8);
  fillLight.position.set(160, -120, 150);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x64d2ff, 2.5);
  rimLight.position.set(0, 220, 200);
  scene.add(rimLight);

  const rootGroup = new THREE.Group();
  scene.add(rootGroup);
  window.__rootGroup = rootGroup;

  /* =========================================================
     3. 材质体系：暗色赛博微光 vs 浅色 CAD 墨线图纸
     ========================================================= */
  const materials = {
    // 暗色赛博模式材质
    darkEnclosure: new THREE.MeshStandardMaterial({
      color: 0x363942,
      roughness: 0.22,
      metalness: 0.2,
      transparent: true,
      opacity: 0.72,
    }),
    darkBezel: new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.35,
      metalness: 0.4,
    }),
    darkKeycap: new THREE.MeshStandardMaterial({
      color: 0xf4f3ec,
      roughness: 0.25,
      metalness: 0.05,
    }),
    darkSwitch: new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      roughness: 0.3,
      metalness: 0.15,
    }),
    darkEsp32: new THREE.MeshStandardMaterial({
      color: 0x1872b8,
      roughness: 0.2,
      metalness: 0.3,
    }),
    darkLcdScreen: new THREE.MeshBasicMaterial({
      map: lcdTexture,
      toneMapped: false,
    }),
    darkKnob: new THREE.MeshStandardMaterial({
      color: 0xeeebe2,
      roughness: 0.15,
      metalness: 0.85,
    }),
    darkKeepout: new THREE.MeshBasicMaterial({
      color: 0xff9500,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    }),

    // 浅色 CAD 线稿模式材质
    lightSolid: new THREE.MeshStandardMaterial({
      color: 0xf5f2e9,
      roughness: 0.95,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    lightLine: new THREE.LineBasicMaterial({
      color: 0x1c1a17,
      linewidth: 1.4,
      transparent: true,
      opacity: 0.95,
    }),
    darkLine: new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 1,
      transparent: true,
      opacity: 0.16,
    }),
  };

  /* =========================================================
     4. 25 个部件 STL 异步加载与世界坐标中心对齐
     ========================================================= */
  const partsMap = new Map();
  const stlLoader = new STLLoader();

  async function loadAssembly() {
    try {
      const resp = await fetch("ASSEMBLY_MANIFEST.json");
      const manifest = await resp.json();

      const loadPromises = manifest.parts.map((p) => {
        return new Promise((resolve) => {
          stlLoader.load(
            `stl/${p.filename}`,
            (geometry) => {
              geometry.computeVertexNormals();

              // 选择材质
              let solidMat = materials.darkEnclosure;
              if (p.id.includes("bezel")) solidMat = materials.darkBezel;
              else if (p.id.includes("keycap")) solidMat = materials.darkKeycap;
              else if (p.id.includes("choc")) solidMat = materials.darkSwitch;
              else if (p.id.includes("esp32") || p.id.includes("waveshare")) solidMat = materials.darkEsp32;
              else if (p.id.includes("knob") || p.id.includes("ec11")) solidMat = materials.darkKnob;
              else if (p.id.includes("keepout")) solidMat = materials.darkKeepout;

              const mesh = new THREE.Mesh(geometry, solidMat);

              // 创建 CAD 轮廓线 (EdgesGeometry)
              const edgesGeom = new THREE.EdgesGeometry(geometry, 28);
              const line = new THREE.LineSegments(edgesGeom, materials.darkLine);
              mesh.add(line);

              // 记录爆炸向量
              const explodeVec = p.explodeVectorMm
                ? new THREE.Vector3(p.explodeVectorMm[0], p.explodeVectorMm[1], p.explodeVectorMm[2])
                : new THREE.Vector3(0, 0, 0);

              const partData = {
                id: p.id,
                label: p.label,
                group: p.selectionGroupId || p.group,
                mesh,
                line,
                solidMat,
                explodeVec,
                bbox: p.bboxMm,
              };

              rootGroup.add(mesh);
              partsMap.set(p.id, partData);
              resolve();
            },
            undefined,
            (err) => {
              console.warn(`Failed to load ${p.filename}`, err);
              resolve();
            }
          );
        });
      });

      await Promise.all(loadPromises);

      // 创建并添加与屏幕位置精准贴合的 2.0" 动态 LCD 屏幕层
      // Waveshare ESP32-S3-LCD-2 屏幕中心位于 X=4.0, Y=2.0, Z=15.2 (mm)
      const screenPlaneGeom = new THREE.PlaneGeometry(31.5, 42.5);
      const screenPlaneMesh = new THREE.Mesh(screenPlaneGeom, materials.darkLcdScreen);
      screenPlaneMesh.position.set(4.0, 2.0, 15.65);
      screenPlaneMesh.rotation.z = 0; // 屏幕正向朝上
      rootGroup.add(screenPlaneMesh);

      // 计算整体包围盒并将中心对齐至世界原点
      const box = new THREE.Box3().setFromObject(rootGroup);
      const center = new THREE.Vector3();
      box.getCenter(center);
      rootGroup.position.sub(center);

      state.loaded = true;
      window.__partsCount = partsMap.size;
    } catch (err) {
      console.error("Manifest load error:", err);
    }
  }

  loadAssembly();

  /* =========================================================
     5. 滚动驱动、3D 姿态插值与爆炸展开
     ========================================================= */
  let targetScrollY = window.scrollY;
  let currentScrollY = window.scrollY;

  window.addEventListener("scroll", () => {
    targetScrollY = window.scrollY;
  }, { passive: true });

  function updateScrollAnimation() {
    currentScrollY += (targetScrollY - currentScrollY) * 0.1;

    const vh = window.innerHeight;
    const toolboxEl = document.getElementById("toolbox");
    const modulesEl = document.getElementById("modules");

    const toolboxRect = toolboxEl ? toolboxEl.getBoundingClientRect() : { top: 9999, bottom: 9999 };
    const modulesRect = modulesEl ? modulesEl.getBoundingClientRect() : { top: 9999, bottom: 9999 };

    // 1. 主题切换：Toolbox 和 Modules 为 CAD 浅色工程图纸模式
    const inToolbox = toolboxRect.top <= vh * 0.5 && toolboxRect.bottom >= vh * 0.2;
    const inModules = modulesRect.top <= vh * 0.5 && modulesRect.bottom >= vh * 0.2;

    const wantLight = inToolbox || inModules;
    if (wantLight && state.currentTheme !== "light") {
      state.currentTheme = "light";
      document.body.classList.add("theme-light");
      switchMaterials("light");
    } else if (!wantLight && state.currentTheme !== "dark") {
      state.currentTheme = "dark";
      document.body.classList.remove("theme-light");
      switchMaterials("dark");
    }

    // 2. 爆炸进度插值 (0.0 ~ 1.0)
    let targetExplosion = 0;
    if (toolboxRect.top < vh && toolboxRect.bottom > 0) {
      const p = 1 - (toolboxRect.bottom - vh) / ((toolboxEl ? toolboxEl.offsetHeight : vh) - vh);
      targetExplosion = Math.max(0, Math.min(1, (p - 0.12) / 0.68));
    } else if (inModules) {
      targetExplosion = 0.45;
    }
    state.explosion += (targetExplosion - state.explosion) * 0.12;

    // 更新爆炸进度条
    if (explosionFill && explosionPercent) {
      const pct = Math.round(state.explosion * 100);
      explosionFill.style.width = `${pct}%`;
      explosionPercent.textContent = `${pct}%`;
    }

    // 3. 驱动 3D 零部件沿 explodeVector 移动
    partsMap.forEach((part) => {
      const isVisible = state.activeSubsystems[getSubsystemKey(part.group)];
      part.mesh.visible = isVisible;
      if (isVisible) {
        part.mesh.position.copy(part.explodeVec).multiplyScalar(state.explosion);
      }
    });

    // 4. 摄像机与根容器旋转姿态插值
    const mouseX = (window.__mouseX || 0) * 0.12;
    const mouseY = (window.__mouseY || 0) * 0.12;

    if (state.currentTheme === "light") {
      // Toolbox / Modules 等轴测 CAD 线稿视角（相机后撤避免遮挡标题）
      rootGroup.rotation.x = THREE.MathUtils.lerp(rootGroup.rotation.x, 0.22 + mouseY, 0.08);
      rootGroup.rotation.y = THREE.MathUtils.lerp(rootGroup.rotation.y, -0.3 + mouseX, 0.08);
      rootGroup.rotation.z = THREE.MathUtils.lerp(rootGroup.rotation.z, 0.42, 0.08);
      camera.position.set(20, -320, 290);
    } else {
      // Hero / Features 赛博控制台俯仰角
      rootGroup.rotation.x = THREE.MathUtils.lerp(rootGroup.rotation.x, mouseY, 0.08);
      rootGroup.rotation.y = THREE.MathUtils.lerp(rootGroup.rotation.y, mouseX, 0.08);
      rootGroup.rotation.z = THREE.MathUtils.lerp(rootGroup.rotation.z, 0.03, 0.08);
      camera.position.set(0, -240, 185);
    }
    camera.lookAt(0, 0, 0);

    // 5. 更新 3D 到 2D 的正交工程引线
    if (inToolbox && state.explosion > 0.15) {
      updateLeaderLines();
      if (svgOverlay) svgOverlay.style.opacity = "1";
    } else {
      if (svgOverlay) svgOverlay.style.opacity = "0";
    }
  }

  function getSubsystemKey(group) {
    if (group.includes("enclosure")) return "enclosure";
    if (group.includes("keycap")) return "keycaps";
    if (group.includes("switch") || group.includes("choc")) return "switches";
    if (group.includes("esp32") || group.includes("board") || group.includes("internal")) return "esp32";
    if (group.includes("ec11") || group.includes("control")) return "ec11";
    if (group.includes("keepout")) return "keepouts";
    return "enclosure";
  }

  function switchMaterials(theme) {
    partsMap.forEach((p) => {
      if (theme === "light") {
        p.mesh.material = materials.lightSolid;
        p.line.material = materials.lightLine;
      } else {
        p.mesh.material = p.solidMat;
        p.line.material = materials.darkLine;
      }
    });
  }

  /* =========================================================
     6. 3D 零件空间投影与正交工程引线生成
     ========================================================= */
  const tagPartMapping = [
    { selector: ".tag-upper-shell", partId: "cosmetic_upper_shell", side: "left" },
    { selector: ".tag-keycaps", partId: "keycap_1", side: "left" },
    { selector: ".tag-switches", partId: "choc_v2_1", side: "left" },
    { selector: ".tag-bottom-cover", partId: "bottom_service_cover", side: "left" },
    { selector: ".tag-screen-bezel", partId: "screen_bezel", side: "right" },
    { selector: ".tag-esp32", partId: "actual_waveshare_esp32_s3_lcd_2", side: "right" },
    { selector: ".tag-retainer", partId: "esp32_m3_retainer", side: "right" },
    { selector: ".tag-ec11", partId: "ec11_knob_34x8p5", side: "right" },
  ];

  function updateLeaderLines() {
    if (!svgOverlay) return;
    let svgHtml = "";
    const w = window.innerWidth;
    const h = window.innerHeight;

    tagPartMapping.forEach(({ selector, partId, side }) => {
      const el = document.querySelector(selector);
      const part = partsMap.get(partId);
      if (!el || !part || !part.mesh.visible) return;

      const worldPos = new THREE.Vector3();
      part.mesh.getWorldPosition(worldPos);
      worldPos.project(camera);

      const sx = (worldPos.x * 0.5 + 0.5) * w;
      const sy = (-worldPos.y * 0.5 + 0.5) * h;

      const rect = el.getBoundingClientRect();
      const tx = side === "left" ? rect.right : rect.left;
      const ty = rect.top + rect.height / 2;

      // 正交阶梯引线
      const midX = side === "left" ? tx + (sx - tx) * 0.55 : tx - (tx - sx) * 0.55;
      const pathD = `M ${tx} ${ty} L ${midX} ${ty} L ${sx} ${sy}`;

      svgHtml += `<path class="leader-path" d="${pathD}" />`;
      svgHtml += `<circle class="leader-dot" cx="${sx}" cy="${sy}" r="3" />`;
      svgHtml += `<circle class="leader-dot" cx="${tx}" cy="${ty}" r="2" />`;
    });

    svgOverlay.innerHTML = svgHtml;
  }

  /* =========================================================
     7. 鼠标视差与模块 BOM 交互
     ========================================================= */
  window.addEventListener("mousemove", (e) => {
    window.__mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    window.__mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  const bomWeights = {
    enclosure: 58.4,
    keycaps: 4.2,
    switches: 13.8,
    esp32: 28.5,
    ec11: 12.1,
    keepouts: 0.0,
  };

  const partCounts = {
    enclosure: 3,
    keycaps: 6,
    switches: 6,
    esp32: 2,
    ec11: 4,
    keepouts: 4,
  };

  document.querySelectorAll(".subsys-toggle").forEach((toggle) => {
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      const group = toggle.dataset.group;
      state.activeSubsystems[group] = !state.activeSubsystems[group];
      toggle.classList.toggle("is-active", state.activeSubsystems[group]);

      let totalWeight = 0;
      let totalParts = 0;
      Object.keys(state.activeSubsystems).forEach((k) => {
        if (state.activeSubsystems[k]) {
          totalWeight += bomWeights[k] || 0;
          totalParts += partCounts[k] || 0;
        }
      });

      const bomWeightEl = document.getElementById("bom-weight");
      const bomCountEl = document.getElementById("bom-parts-count");
      if (bomWeightEl) bomWeightEl.textContent = `${totalWeight.toFixed(1)} g`;
      if (bomCountEl) bomCountEl.textContent = `${totalParts} / 25`;
    });
  });

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
     8. 核心渲染主循环 (rAF)
     ========================================================= */
  function animate(time) {
    requestAnimationFrame(animate);

    const t = time * 0.001;
    updateLcdScreen(t);
    updateScrollAnimation();

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();
