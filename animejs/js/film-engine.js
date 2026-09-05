import * as THREE from '/vendor/three.module.js';
import { beatAt, evaluateMotion, motion } from './film.js';
import { A340_PROFILE, roleId, roleIds } from './model-profile.js';
import { sizeOf } from './model-scene.js';

const DEG = THREE.MathUtils.degToRad;
const FACE_ANGLE = DEG(A340_PROFILE.dimensions.faceAngleDeg);
const FACE_NORMAL = new THREE.Vector3(0, -Math.sin(FACE_ANGLE), Math.cos(FACE_ANGLE)).normalize();
const FACE_TANGENT = new THREE.Vector3(0, Math.cos(FACE_ANGLE), Math.sin(FACE_ANGLE)).normalize();
const WORLD_UP = new THREE.Vector3(0, 0, 1);
export const CONTROL_LIFT_MM = 8;

export function createFilmEngine(model) {
  const {
    camera, renderer, root, parts, roleMatch, baseRadius, groupCenters,
    lcd, lcdCanvas, lcdCtx, lcdTexture, lcdHomePosition,
    lights, glowMaterial,
  } = model;
  const tmp = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const tmpLineColor = new THREE.Color();
  const backgroundColor = new THREE.Color();
  const backgroundTarget = new THREE.Color();
  const inkColor = new THREE.Color();
  const lineLight = new THREE.Color(0xe3ecec);
  const lineDark = new THREE.Color(0x202628);
  const inkLight = new THREE.Color(0xf2f4f3);
  const inkDark = new THREE.Color(0x121719);
  const keyWarm = new THREE.Color(0xffddc6);
  const keyNeutral = new THREE.Color(0xf2f1ed);
  const rimWarm = new THREE.Color(0xffd7bd);
  const rimCool = new THREE.Color(0x9dbed2);
  const edgeWarm = new THREE.Color(0xffe3d1);
  const edgeCool = new THREE.Color(0xa9c2cd);
  const computeAxis = new THREE.Vector3(1, 0, 0);
  const computeRotation = new THREE.Quaternion();
  const focusColor = new THREE.Color(0xdce6e9);
  const heroKeyColor = new THREE.Color(0x3a3834);
  const heroShellColor = new THREE.Color(0x403b36);
  const heroKnobColor = new THREE.Color(0x272624);
  const heroBezelColor = new THREE.Color(0x070809);
  const controlLift = FACE_NORMAL.clone().multiplyScalar(CONTROL_LIFT_MM);
  let lcdSignature = '';

  const averageWorld = (ids) => {
    const result = new THREE.Vector3();
    let count = 0;
    for (const id of ids) {
      const part = parts.get(id);
      if (!part) continue;
      part.pivot.getWorldPosition(tmp);
      result.add(tmp);
      count += 1;
    }
    return count ? result.multiplyScalar(1 / count) : root.localToWorld(new THREE.Vector3());
  };

  const stableExplodedGroupWorld = (group) => {
    const center = groupCenters.get(group)?.clone();
    const member = [...parts.values()].find((part) => part.group === group);
    if (!center || !member) return root.localToWorld(new THREE.Vector3());
    return root.localToWorld(center.add(member.explode));
  };

  const roleWorld = (role) => {
    const ids = roleIds(role);
    if (!ids.length) return null;
    return ids.length === 1
      ? (parts.get(ids[0])?.pivot.getWorldPosition(new THREE.Vector3()) || null)
      : averageWorld(ids);
  };

  const targetFor = (name) => {
    if (name === 'product') return root.localToWorld(new THREE.Vector3());
    if (name === 'display') return lcd.getWorldPosition(new THREE.Vector3());
    if (name === 'knob') return roleWorld('knob');
    if (name === 'keys') return roleWorld('keycaps');
    if (name === 'compute') return stableExplodedGroupWorld('compute');
    if (name === 'mainboard') return roleWorld('mainboard');
    if (name === 'cpu') return averageWorld([roleId('cpu'), roleId('flash')]);
    if (name === 'imu') return roleWorld('imu');
    if (name === 'io') return averageWorld([roleId('usb'), roleId('microsd')]);
    if (name === 'headers') return averageWorld([roleId('cameraFpc'), roleId('batteryHeader')]);
    if (name === 'power') return averageWorld([roleId('lipo'), roleId('powerBoard')]);
    if (name === 'inputBoards') return roleWorld('inputBoards');
    return root.localToWorld(new THREE.Vector3());
  };

  const explodeFactor = (part, state) => {
    if (roleMatch(part, 'switches') || roleMatch(part, 'encoder')) return state.switchOpen;
    if (roleMatch(part, 'upperShell') || roleMatch(part, 'screenBezel')) return state.shellOpen;
    if (part.group === 'compute') return state.computeExplode;
    if (part.group === 'power') return state.powerExplode;
    if (part.group === 'input') return state.inputExplode;
    return state.internalOpen;
  };

  const smooth01 = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / Math.max(.0001, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function partMotion(state) {
    for (const part of parts.values()) {
      part.pivot.position.copy(part.home);
      part.pivot.quaternion.identity();
      part.pivot.scale.setScalar(1);
      part.mesh.position.set(0, 0, 0);
      part.mesh.rotation.copy(part.baseRotation);

      if (roleMatch(part, 'keycaps') || roleMatch(part, 'knob')) {
        const offset = controlLift.clone().multiplyScalar(state.controlLift);
        if (state.controlFan > 0) offset.lerp(part.explode, state.controlFan);
        if (roleMatch(part, 'keycaps')) offset.addScaledVector(FACE_NORMAL, .35 * state.teaserMix);
        if (roleMatch(part, 'knob')) {
          part.pivot.scale.set(
            1 + .34 * state.teaserMix,
            1 + .08 * state.teaserMix,
            1 + .10 * state.teaserMix,
          );
          offset.addScaledVector(FACE_NORMAL, .62 * state.teaserMix);
          offset.addScaledVector(FACE_TANGENT, -3.2 * state.teaserMix);
        }
        part.pivot.position.add(offset);
      } else {
        part.pivot.position.addScaledVector(part.explode, explodeFactor(part, state));
      }

      if (part.id === roleId('screenBezel')) {
        part.pivot.scale.set(
          1 + .10 * state.teaserMix,
          1 + .15 * state.teaserMix,
          1 + .15 * state.teaserMix,
        );
      } else if ([roleId('activeGlass'), roleId('displayModule')].includes(part.id)) {
        part.pivot.scale.set(
          1 + .16 * state.teaserMix,
          1 + .28 * state.teaserMix,
          1 + .28 * state.teaserMix,
        );
      }

      if (part.detailExplode.lengthSq() > 0) {
        const spread = smooth01(part.detailRank * .24, .68 + part.detailRank * .24, state.componentSpread);
        part.pivot.position.addScaledVector(part.detailExplode, spread);
      }

      if (part.id === roleId('keycapFocus')) part.pivot.position.addScaledVector(FACE_NORMAL, state.keyPress);
      if (roleMatch(part, 'knob')) part.pivot.quaternion.setFromAxisAngle(FACE_NORMAL, state.knobRotation);
      if (part.id === roleId('activeGlass')) part.pivot.position.addScaledVector(FACE_NORMAL, 12 * state.displayLayer);
      if (part.id === roleId('displayModule')) part.pivot.position.addScaledVector(FACE_NORMAL, -8 * state.displayLayer);
    }

    if (state.computeTurn > 0) {
      const members = [...parts.values()].filter((part) => part.group === 'compute');
      const center = new THREE.Vector3();
      members.forEach((part) => center.add(part.pivot.position));
      center.multiplyScalar(1 / members.length);
      computeRotation.setFromAxisAngle(computeAxis, DEG(-180) * state.computeTurn);
      for (const part of members) {
        part.pivot.position.sub(center).applyQuaternion(computeRotation).add(center);
        part.pivot.quaternion.premultiply(computeRotation);
      }
    }

    if (state.printableLayout > 0) {
      const layout = [
        ['cosmetic_upper_shell', -44, 17, .42], ['bottom_service_cover', 35, 17, .46],
        ['screen_bezel', -48, -19, .72], ['esp32_m3_retainer', -18, -19, .78], ['ec11_knob_24x8p5', 13, -19, .82],
        ['keycap_1', -54, -46, .88], ['keycap_2', -32, -46, .88], ['keycap_3', -10, -46, .88],
        ['keycap_4', 12, -46, .88], ['keycap_5', 34, -46, .88], ['keycap_6', 56, -46, .88],
      ];
      layout.forEach(([id, x, y, scale]) => {
        const part = parts.get(id);
        const target = new THREE.Vector3(x, y, 40);
        part.pivot.position.lerp(target, state.printableLayout);
        part.pivot.scale.setScalar(THREE.MathUtils.lerp(1, scale, state.printableLayout));
        part.pivot.quaternion.slerp(new THREE.Quaternion(), state.printableLayout);
      });
    }

    lcd.position.copy(lcdHomePosition)
      .addScaledVector(FACE_NORMAL, .48 * state.teaserMix)
      .addScaledVector(FACE_TANGENT, .45 * state.teaserMix);
    lcd.scale.set(1 + .08 * state.teaserMix, 1 + .03 * state.teaserMix, 1);
  }

  const focusStrength = (part, focus) => {
    if (focus === 'product') return 1;
    if (focus === 'display') return ['lcd_active_glass', 'lcd_backlight_stack', 'screen_bezel'].includes(part.id) ? 1 : part.group === 'compute' ? .22 : .02;
    if (focus === 'compute') return part.group === 'compute' ? 1 : 0;
    if (focus === 'cpu') return roleMatch(part, 'cpu') || roleMatch(part, 'flash') ? 1 : part.id === roleId('mainboard') ? .30 : part.group === 'compute' ? .12 : 0;
    if (focus === 'imu') return roleMatch(part, 'imu') ? 1 : part.id === roleId('mainboard') ? .30 : part.group === 'compute' ? .10 : 0;
    if (focus === 'io') return roleMatch(part, 'usb') || roleMatch(part, 'microsd') ? 1 : part.id === roleId('mainboard') ? .30 : part.group === 'compute' ? .10 : 0;
    if (focus === 'headers') return roleMatch(part, 'cameraFpc') || roleMatch(part, 'batteryHeader') || /^P[12]_/.test(part.id) ? 1 : part.id === roleId('mainboard') ? .30 : part.group === 'compute' ? .10 : 0;
    if (focus === 'power') return part.group === 'power' ? 1 : 0;
    if (focus === 'input-pcb') return part.group === 'input' ? 1 : 0;
    if (focus === 'input') return ['input', 'controls'].includes(part.group) ? 1 : .12;
    if (focus === 'control') return roleMatch(part, 'knob') || roleMatch(part, 'encoder') ? 1 : .13;
    if (focus === 'printable') return part.data.printable ? 1 : 0;
    return 1;
  };

  const focusBlend = (state, allowed) => THREE.MathUtils.lerp(
    allowed.includes(state.focusFrom) ? 1 : 0,
    allowed.includes(state.focus) ? 1 : 0,
    state.focusMix,
  );

  function materialMotion(state) {
    for (const part of parts.values()) {
      const focus = THREE.MathUtils.lerp(
        focusStrength(part, state.focusFrom),
        focusStrength(part, state.focus),
        state.focusMix,
      );
      const surface = THREE.MathUtils.lerp(1, part.line ? .09 : .26, state.lineArt);
      let opacity = part.baseOpacity * focus * surface;
      if (roleMatch(part, 'upperShell')) opacity *= state.shellOpacity;
      if (roleMatch(part, 'screenBezel') && state.shellOpacity < 1) opacity *= .65;
      const assembledInterior = ['input', 'compute', 'power', 'fasteners'].includes(part.group)
        && ![roleId('activeGlass'), roleId('displayModule')].includes(part.id);
      if (assembledInterior || roleMatch(part, 'encoder')) {
        opacity *= Math.max(state.technicalMix, state.controlLift, state.shellOpen, state.switchOpen, state.internalOpen);
      }

      tmpColor.copy(part.baseColor);
      if (roleMatch(part, 'keycaps')) tmpColor.lerp(heroKeyColor, state.teaserMix * .68);
      if (roleMatch(part, 'upperShell')) tmpColor.lerp(heroShellColor, state.teaserMix * .45);
      if (roleMatch(part, 'knob')) tmpColor.lerp(heroKnobColor, state.teaserMix * .42);
      if (roleMatch(part, 'screenBezel')) tmpColor.lerp(heroBezelColor, state.teaserMix * .38);
      if (focus > .9) tmpColor.lerp(focusColor, state.technicalMix * .13);
      part.mesh.material.color.copy(tmpColor);
      part.mesh.material.roughness = part.baseRoughness;
      part.mesh.material.metalness = part.baseMetalness;
      part.mesh.material.transparent = opacity < .999;
      part.mesh.material.opacity = opacity;
      part.mesh.material.depthWrite = opacity > .50 && state.lineArt < .48;
      part.mesh.visible = opacity > .001;
      part.mesh.castShadow = opacity > .50 && state.lineArt < .35;
      part.mesh.receiveShadow = opacity > .50 && state.lineArt < .35;
      if (part.mesh.material.userData.heroMix) part.mesh.material.userData.heroMix.value = state.teaserMix;

      if ('emissiveIntensity' in part.mesh.material) {
        part.mesh.material.emissiveIntensity = roleMatch(part, 'switches') ? state.keyGlow * .20 : 0;
      }
      if (part.line) {
        tmpLineColor.copy(lineLight).lerp(lineDark, state.uiLightMix);
        part.line.material.color.copy(tmpLineColor);
        part.line.visible = focus > .02 && (state.edgeMix > .01 || state.lineArt > .01);
        part.line.material.opacity = focus * Math.max(.18 * state.edgeMix, .82 * state.lineArt);
      }
    }

    const glowFocus = focusBlend(state, ['product', 'input', 'control']);
    const lcdFocus = focusBlend(state, ['product', 'input', 'control', 'display']);
    glowMaterial.opacity = (.006 + state.keyGlow * .044) * glowFocus;
    lcd.material.opacity = (.28 + state.lcdIntensity * .48 + state.teaserMix * .44) * lcdFocus;
    lcd.visible = lcdFocus > .002;
  }

  function lightingMotion(state) {
    const teaser = state.teaserMix;
    const technical = state.technicalMix;
    const daylight = state.uiLightMix;
    lights.ambient.intensity = THREE.MathUtils.lerp(.46, .14, teaser) + technical * .18 + daylight * .34;
    lights.key.intensity = THREE.MathUtils.lerp(.76, .48, teaser) + technical * .42 + daylight * .30;
    lights.rim.intensity = THREE.MathUtils.lerp(1.42, 1.7, teaser) - technical * .22 + daylight * .20;
    lights.edge.intensity = THREE.MathUtils.lerp(.66, 1.2, teaser) + technical * .30 + daylight * .18;
    lights.screen.intensity = (.035 + state.lcdIntensity * .16) * focusBlend(state, ['product', 'input', 'control', 'display']);
    lights.key.color.copy(keyNeutral).lerp(keyWarm, teaser);
    lights.rim.color.copy(rimCool).lerp(rimWarm, teaser);
    lights.edge.color.copy(edgeCool).lerp(edgeWarm, teaser);
    renderer.toneMappingExposure = .84 + teaser * .06 + technical * .08 + daylight * .08;
    backgroundColor.setHex(state.backgroundFrom).lerp(backgroundTarget.setHex(state.backgroundTo), state.backgroundMix);
    renderer.setClearColor(backgroundColor, 1);

    const style = document.documentElement.style;
    inkColor.copy(inkLight).lerp(inkDark, daylight);
    const rgb = [inkColor.r, inkColor.g, inkColor.b].map((value) => Math.round(value * 255)).join(' ');
    const bgRgb = [backgroundColor.r, backgroundColor.g, backgroundColor.b].map((value) => Math.round(value * 255)).join(' ');
    style.setProperty('--ink-rgb', rgb);
    style.setProperty('--stage-rgb', bgRgb);
    style.setProperty('--vignette', String(THREE.MathUtils.lerp(teaser ? .52 : technical ? .46 : .58, .18, daylight)));
    style.setProperty('--stage-luma', String(.88 + technical * .08 + daylight * .06 + teaser * .05));
  }

  function cameraMotion(state) {
    const from = targetFor(state.cameraTargetFrom) || root.localToWorld(new THREE.Vector3());
    const to = targetFor(state.cameraTarget) || root.localToWorld(new THREE.Vector3());
    const target = from.clone().lerp(to, state.cameraTargetMix);
    const referenceAspect = 1672 / 941;
    const portraitFit = THREE.MathUtils.clamp(referenceAspect / camera.aspect, 1, 3.25);
    const heroCover = THREE.MathUtils.lerp(1, portraitFit, state.teaserMix);
    const radius = baseRadius * state.cameraRadiusScale * heroCover;
    const az = DEG(state.cameraAzimuth);
    const el = DEG(state.cameraElevation);
    camera.position.copy(target).add(new THREE.Vector3(
      Math.sin(az) * Math.cos(el) * radius,
      -Math.cos(az) * Math.cos(el) * radius,
      Math.sin(el) * radius,
    ));

    const direction = target.clone().sub(camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(direction, WORLD_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, direction).normalize();
    const look = target.clone()
      .addScaledVector(right, -state.framingX * radius * .30)
      .addScaledVector(up, state.framingY * radius * .28);

    camera.fov = state.cameraFov;
    camera.updateProjectionMatrix();
    camera.lookAt(look);
  }

  function drawLcd(state, force = false) {
    const signature = `${state.shotId}:${Math.round(state.shotProgress * 20)}:${state.lcdIntensity.toFixed(2)}`;
    if (!force && signature === lcdSignature) return;
    lcdSignature = signature;

    const ctx = lcdCtx;
    const w = lcdCanvas.width;
    const h = lcdCanvas.height;
    const tech = state.shotIndex >= 10 && state.shotIndex <= 21;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(5, 5, w - 10, h - 10, 30);
    ctx.clip();
    ctx.fillStyle = '#101316';
    ctx.fillRect(0, 0, w, h);

    const text = (value, x, y, size, weight = 600, color = '#eef2f2', align = 'left') => {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px system-ui, "PingFang SC", sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, x, y);
    };
    const line = (y, color = 'rgba(255,255,255,.08)') => {
      ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(w - 28, y); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    };
    const pill = (x, y, width, label, active = false) => {
      ctx.beginPath(); ctx.roundRect(x, y, width, 34, 17);
      ctx.fillStyle = active ? '#d59a45' : '#171b1e'; ctx.fill();
      text(label, x + width / 2, y + 24, 17, 650, active ? '#101214' : '#a9b0b3', 'center');
    };

    const drawHeroUi = () => {
      ctx.strokeStyle = 'rgba(214,218,216,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(55, 68); ctx.lineTo(w - 55, 68); ctx.stroke();
      for (let index = 0; index <= 32; index += 1) {
        const x = 55 + index * ((w - 110) / 32);
        const height = index % 8 === 0 ? 13 : index % 4 === 0 ? 9 : 5;
        ctx.beginPath(); ctx.moveTo(x, 68 - height); ctx.lineTo(x, 68 + height); ctx.stroke();
      }
      const markerX = 55 + 18 * ((w - 110) / 32);
      ctx.fillStyle = '#c55e36';
      ctx.fillRect(markerX - 2, 49, 4, 38);

      const rows = [
        [124, 82, .90],
        [180, 122, .44],
        [236, 74, .34],
        [292, 106, .40],
        [348, 64, .26],
      ];
      rows.forEach(([y, width, alpha], index) => {
        ctx.beginPath(); ctx.roundRect(48, y - 22, w - 96, 43, 9);
        ctx.fillStyle = index === 2 ? 'rgba(255,255,255,.070)' : 'rgba(255,255,255,.025)';
        ctx.fill();
        ctx.beginPath(); ctx.roundRect(62, y - 5, width, 10, 5);
        ctx.fillStyle = `rgba(202,139,72,${Math.min(1, alpha * 1.16)})`;
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(74 + width, y); ctx.lineTo(w - 126, y);
        ctx.strokeStyle = 'rgba(202,139,72,.10)'; ctx.lineWidth = 1; ctx.stroke();
        for (let dot = 0; dot < 2; dot += 1) {
          ctx.beginPath(); ctx.arc(w - 88 + dot * 28, y, 6, 0, Math.PI * 2);
          ctx.strokeStyle = dot === 0 && index === 0 ? 'rgba(197,132,67,.72)' : 'rgba(214,218,216,.16)';
          ctx.stroke();
        }
      });
      ctx.beginPath(); ctx.moveTo(48, 388); ctx.lineTo(w - 48, 388); ctx.strokeStyle = 'rgba(197,132,67,.22)'; ctx.stroke();
    };

    const drawStandardUi = () => {
      text(tech ? 'SYSTEM / CORE' : 'LUMA HOME', 28, 50, 20, 700, '#8d979b');
      text(tech ? 'ESP32-S3' : '客厅', 28, 112, tech ? 48 : 42, 730);
      text(tech ? 'LOCAL CONTROL · ONLINE' : '5 个设备 · 已同步', 30, 145, 18, 550, tech ? '#74bd92' : '#8c9599');
      line(170);

      if (tech) {
        const rows = [['CPU', 'ESP32-S3R8'], ['MEMORY', '8MB PSRAM · 16MB Flash'], ['LINK', 'Wi-Fi / MQTT'], ['STATE', 'Home Assistant ready']];
        rows.forEach(([name, value], index) => {
          const y = 213 + index * 55;
          text(name, 30, y, 17, 650, '#7b8589');
          text(value, w - 30, y, 20, 620, '#d8dddf', 'right');
          if (index < rows.length - 1) line(y + 20, 'rgba(255,255,255,.045)');
        });
        pill(28, 406, 138, 'ONLINE', true);
        pill(178, 406, 160, 'LOCAL');
        pill(350, 406, 260, '231 OBJECTS');
      } else {
        const rows = [['主灯', '72%', true], ['色温', '3800 K', true], ['餐桌吊灯', '关闭', false], ['床头灯', '18%', true]];
        rows.forEach(([name, value, active], index) => {
          const y = 214 + index * 53;
          ctx.beginPath(); ctx.arc(36, y - 6, 5, 0, Math.PI * 2); ctx.fillStyle = active ? '#79c996' : '#4a5053'; ctx.fill();
          text(name, 55, y, 23, 620, '#d8dddf');
          text(value, w - 30, y, 22, 650, active ? '#eef2f2' : '#778084', 'right');
          if (index < rows.length - 1) line(y + 18, 'rgba(255,255,255,.045)');
        });
        pill(28, 414, 176, '日常', true);
        pill(216, 414, 176, '氛围');
        pill(404, 414, 206, '全部关闭');
      }
    };

    if (state.teaserMix > .001) {
      ctx.save();
      ctx.globalAlpha = state.teaserMix;
      drawHeroUi();
      ctx.restore();
    }
    if (state.teaserMix < .999) {
      ctx.save();
      ctx.globalAlpha = 1 - state.teaserMix;
      drawStandardUi();
      ctx.restore();
    }

    const reflection = ctx.createLinearGradient(w * .48, 0, w, h * .44);
    reflection.addColorStop(0, 'rgba(255,255,255,0)');
    reflection.addColorStop(.48, 'rgba(255,255,255,.018)');
    reflection.addColorStop(.62, 'rgba(255,255,255,.075)');
    reflection.addColorStop(.78, 'rgba(255,255,255,.010)');
    reflection.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = reflection;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.textAlign = 'left';
    lcdTexture.needsUpdate = true;
  }

  function update() {
    const state = evaluateMotion(motion.filmTime);
    Object.assign(motion, state);
    partMotion(state);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    materialMotion(state);
    lightingMotion(state);
    cameraMotion(state);
    root.updateMatrixWorld(true);
    drawLcd(state);
  }

  function render() {
    renderer.render(model.scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  }

  function project(world) {
    const point = world.clone().project(camera);
    return [(point.x * .5 + .5) * innerWidth, (-point.y * .5 + .5) * innerHeight];
  }

  function anchor(role, frac = [0, 0, 0]) {
    const ids = roleIds(role);
    if (ids.length > 1 && frac.every((value) => value === 0)) return roleWorld(role);
    const id = roleId(role);
    const part = parts.get(id);
    if (!part) return null;
    const size = sizeOf(part.data.bboxMm);
    return part.pivot.localToWorld(new THREE.Vector3(
      frac[0] * size.x * .5,
      frac[1] * size.y * .5,
      frac[2] * size.z * .5,
    ));
  }

  function productRect() {
    const box = new THREE.Box3().setFromObject(root);
    const points = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) points.push(project(new THREE.Vector3(x, y, z)));
      }
    }
    return {
      left: Math.min(...points.map(([x]) => x)), right: Math.max(...points.map(([x]) => x)),
      top: Math.min(...points.map(([, y]) => y)), bottom: Math.max(...points.map(([, y]) => y)),
    };
  }

  drawLcd(evaluateMotion(0), true);
  return { update, render, resize, project, roleWorld, anchor, productRect, lcd, beatAt };
}
