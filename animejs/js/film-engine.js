import * as THREE from '/vendor/three.module.js';
import { beatAt, keycapMotion, motion } from './film.js';
import { A340_PROFILE, roleId } from './model-profile.js';
import { sizeOf } from './model-scene.js';

const DEG = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const FACE_ANGLE = DEG(A340_PROFILE.dimensions.faceAngleDeg);
const FACE_NORMAL = new THREE.Vector3(0, -Math.sin(FACE_ANGLE), Math.cos(FACE_ANGLE)).normalize();
const WORLD_UP = new THREE.Vector3(0, 0, 1);

export function createFilmEngine(model) {
  const { camera, renderer, root, parts, roleMatch, baseRadius, lcd, lcdCanvas, lcdCtx, lcdTexture } = model;
  const tmp = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const darkBg = new THREE.Color(0x0d0e12);
  const paperBg = new THREE.Color(0xded8cc);
  const darkFg = new THREE.Color(0xf2f0eb);
  const paperFg = new THREE.Color(0x211e1a);
  const cadSolid = new THREE.Color(0xf1ede4);
  const inkSolid = new THREE.Color(0x16181d);
  const focusSolid = new THREE.Color(0xf0ece2);
  const cadLine = new THREE.Color(0x28241f);
  const inkLine = new THREE.Color(0xf4f1eb);
  let lcdSignature = '';

  function partMotion() {
    for (const part of parts.values()) {
      part.pivot.position.copy(part.home);
      part.pivot.quaternion.identity();
      part.mesh.rotation.copy(part.baseRotation);

      const weight = { enclosure: .82, input: .55, control: .70, compute: .42, display: .32 }[part.system] ?? .25;
      part.pivot.position.addScaledVector(part.explode, motion.blueprintSeparation * weight);

      if (part.keyIndex >= 0) {
        const phase = keycapMotion[part.keyIndex]?.lift ?? 0;
        part.pivot.position.addScaledVector(FACE_NORMAL, motion.keycapLift * phase);
      }

      if (roleMatch(part, 'knob')) {
        part.pivot.quaternion.setFromAxisAngle(FACE_NORMAL, motion.knobRotation);
        part.pivot.position.addScaledVector(FACE_NORMAL, motion.knobReveal * 4.5);
      }

      if (roleMatch(part, 'serviceCover')) {
        part.pivot.position.z -= motion.serviceCoverOpen * 28;
        part.pivot.position.y += motion.serviceCoverOpen * 10;
        part.pivot.rotation.x += DEG(18) * motion.serviceCoverOpen;
      }

      if (roleMatch(part, 'retainer')) {
        part.pivot.position.addScaledVector(FACE_NORMAL, motion.boardLift * 13);
      }

      if (roleMatch(part, 'mainboard')) {
        part.pivot.position.addScaledVector(FACE_NORMAL, motion.boardLift * 30);
        part.pivot.position.y += motion.boardLift * 4;
        part.pivot.rotation.x += -Math.PI * .92 * motion.boardFlip;
      }

      if (motion.formReveal > 0 && part.system === 'enclosure' && !roleMatch(part, 'serviceCover')) {
        part.pivot.position.addScaledVector(FACE_NORMAL, -motion.formReveal * 3.5);
      }
    }
  }

  function materialMotion() {
    const cad = clamp(motion.cadMix, 0, 1);
    const ink = clamp(motion.inkMix * (1 - cad * .55), 0, 1);

    for (const part of parts.values()) {
      const focus = ({
        input: motion.focusKeyboard,
        control: motion.focusKnob,
        compute: motion.focusMainboard,
        display: motion.focusDisplay,
        enclosure: motion.focusProduct,
      }[part.system] || 0) * ink;

      tmpColor.copy(part.baseColor)
        .lerp(cadSolid, cad)
        .lerp(inkSolid, ink)
        .lerp(focusSolid, Math.min(.82, focus * .74));
      part.mesh.material.color.copy(tmpColor);
      part.mesh.material.roughness = THREE.MathUtils.lerp(part.baseRoughness, .94, cad * .92 + ink * .55);
      part.mesh.material.metalness = THREE.MathUtils.lerp(part.baseMetalness, 0, cad * .95 + ink * .8);
      part.line.material.color.copy(inkLine).lerp(cadLine, cad);
      part.line.material.opacity = THREE.MathUtils.lerp(.18, .9, Math.max(cad, ink * .68));
      if (part.decal) part.decal.material.opacity = clamp(1 - cad * .55 - ink * .3, .18, 1);
    }

    const style = document.documentElement.style;
    style.setProperty('--film-bg', darkBg.clone().lerp(paperBg, cad).getStyle());
    style.setProperty('--film-fg', darkFg.clone().lerp(paperFg, cad).getStyle());
    style.setProperty('--film-muted', cad > .45 ? 'rgba(34,31,27,.58)' : 'rgba(238,235,229,.55)');
    style.setProperty('--film-grid', cad > .45 ? 'rgba(36,31,26,.09)' : 'rgba(255,255,255,.065)');
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.22, .98, cad);
  }

  const averageWorld = (ids) => {
    const result = new THREE.Vector3();
    let count = 0;
    for (const id of ids) {
      const part = parts.get(id);
      if (!part) continue;
      part.pivot.getWorldPosition(tmp);
      result.add(tmp);
      count++;
    }
    return count ? result.multiplyScalar(1 / count) : result;
  };

  const point = (name) => {
    if (name === 'product') return root.localToWorld(new THREE.Vector3());
    if (name === 'display') {
      return lcd
        ? lcd.getWorldPosition(new THREE.Vector3())
        : (parts.get(roleId('screenBezel'))?.pivot.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3());
    }
    if (name === 'keyboard') return averageWorld(A340_PROFILE.roles.keycaps);
    const part = parts.get(roleId(name === 'knob' ? 'knob' : 'mainboard'));
    return part ? part.pivot.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  };

  function cameraMotion() {
    const weights = [
      ['product', motion.focusProduct],
      ['display', motion.focusDisplay],
      ['keyboard', motion.focusKeyboard],
      ['knob', motion.focusKnob],
      ['mainboard', motion.focusMainboard],
    ];
    const total = weights.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0) || 1;
    const target = new THREE.Vector3();
    weights.forEach(([name, weight]) => target.addScaledVector(point(name), Math.max(0, weight) / total));

    const radius = baseRadius * motion.cameraRadiusScale;
    const az = DEG(motion.cameraAzimuth);
    const el = DEG(motion.cameraElevation);
    camera.position.copy(target).add(new THREE.Vector3(
      Math.sin(az) * Math.cos(el) * radius,
      -Math.cos(az) * Math.cos(el) * radius,
      Math.sin(el) * radius,
    ));

    const dir = target.clone().sub(camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(dir, WORLD_UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const look = target.clone()
      .addScaledVector(right, -motion.framingX * radius * .32)
      .addScaledVector(up, motion.framingY * radius * .28);

    camera.fov = motion.cameraFov;
    camera.updateProjectionMatrix();
    camera.lookAt(look);
  }

  function drawLcd(force = false) {
    if (!lcdCtx || !lcd) return;
    const beat = beatAt(motion.filmTime).id;
    const signature = `${beat}:${motion.lcdInteraction.toFixed(2)}:${motion.lcdIntensity.toFixed(2)}:${motion.displayInspect.toFixed(2)}`;
    if (!force && signature === lcdSignature) return;
    lcdSignature = signature;

    const ctx = lcdCtx;
    const w = lcdCanvas.width;
    const h = lcdCanvas.height;
    ctx.fillStyle = '#071015';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(92,217,255,.20)';
    ctx.lineWidth = 1;
    for (let x = 32; x < w; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 32; y < h; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const title = beat === 'compute' ? 'SYSTEM / CORE' : beat === 'input' ? 'INPUT / MATRIX' : 'LUMA / CONTROL';
    ctx.fillStyle = '#e8fbff';
    ctx.font = '600 30px ui-monospace';
    ctx.fillText(title, 34, 50);
    ctx.fillStyle = 'rgba(214,242,249,.62)';
    ctx.font = '18px ui-monospace';
    ctx.fillText('A3.40 · EC11 Ø24 · 240×320', 34, 82);

    const value = Math.round(18 + motion.lcdInteraction * 74);
    ctx.strokeStyle = '#5ad9ff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(w * .5, h * .58, 110, Math.PI * .72, Math.PI * (.72 + 1.55 * motion.lcdInteraction));
    ctx.stroke();
    ctx.fillStyle = '#f4f7f2';
    ctx.font = '700 92px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(value).padStart(2, '0'), w * .5, h * .63);

    if (motion.displayInspect > .05) {
      ctx.font = '18px ui-monospace';
      ctx.fillStyle = `rgba(224,246,250,${.35 + motion.displayInspect * .45})`;
      ctx.fillText('DISPLAY DATUM / PROJECTED STAGE', w * .5, h * .77);
    }
    ctx.textAlign = 'left';

    lcdTexture.needsUpdate = true;
    lcd.material.opacity = .28 + motion.lcdIntensity * .70;
  }

  function update() {
    partMotion();
    root.rotation.set(motion.productPitch, motion.productRoll, motion.productYaw);
    root.updateMatrixWorld(true);
    materialMotion();
    cameraMotion();
    root.updateMatrixWorld(true);
    drawLcd();
  }

  function render() {
    renderer.render(model.scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  }

  function project(world) {
    const p = world.clone().project(camera);
    return [(p.x * .5 + .5) * innerWidth, (-p.y * .5 + .5) * innerHeight];
  }

  function roleWorld(role) {
    const value = A340_PROFILE.roles[role];
    return Array.isArray(value)
      ? averageWorld(value)
      : (parts.get(value)?.pivot.getWorldPosition(new THREE.Vector3()) || null);
  }

  function anchor(role, frac = [0, 0, 0]) {
    const value = A340_PROFILE.roles[role];
    const id = Array.isArray(value) ? value[0] : value;
    const part = parts.get(id);
    if (!part) return null;
    const size = sizeOf(part.data.bboxMm);
    return part.pivot.localToWorld(new THREE.Vector3(
      frac[0] * size.x * .5,
      frac[1] * size.y * .5,
      frac[2] * size.z * .5,
    ));
  }

  function lcdQuad() {
    if (!lcd) return null;
    const [w, h] = A340_PROFILE.dimensions.displayVisible;
    lcd.updateWorldMatrix(true, false);
    return [
      [-w / 2, h / 2],
      [w / 2, h / 2],
      [w / 2, -h / 2],
      [-w / 2, -h / 2],
    ].map(([x, y]) => project(lcd.localToWorld(new THREE.Vector3(x, y, 0))));
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
      left: Math.min(...points.map(([x]) => x)),
      right: Math.max(...points.map(([x]) => x)),
      top: Math.min(...points.map(([, y]) => y)),
      bottom: Math.max(...points.map(([, y]) => y)),
    };
  }

  drawLcd(true);
  return { update, render, resize, project, roleWorld, anchor, lcdQuad, productRect };
}
