import * as THREE from '/vendor/three.module.js';
import { STLLoader } from '/vendor/STLLoader.js';
import { A340_PROFILE, roleId, roleIds } from './model-profile.js';

const DEG = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
const FACE_ANGLE = DEG(A340_PROFILE.dimensions.faceAngleDeg);

export const sizeOf = (bbox) => new THREE.Vector3(
  bbox[1][0] - bbox[0][0],
  bbox[1][1] - bbox[0][1],
  bbox[1][2] - bbox[0][2],
);

const centerOf = (bbox) => new THREE.Vector3(
  (bbox[0][0] + bbox[1][0]) * .5,
  (bbox[0][1] + bbox[1][1]) * .5,
  (bbox[0][2] + bbox[1][2]) * .5,
);

const faceZAt = (y) => {
  const { depth, frontHeight, backHeight } = A340_PROFILE.dimensions;
  return frontHeight + (y + depth / 2) * ((backHeight - frontHeight) / depth);
};

export async function createModelScene(canvas) {
  const scene = new THREE.Scene();
  scene.up.set(0, 0, 1);

  const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 1, 5000);
  camera.up.set(0, 0, 1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x14151a, 2.15));
  for (const [color, intensity, xyz] of [
    [0xffffff, 3.5, [-170, -220, 280]],
    [0xff8060, 1.25, [190, -90, 120]],
    [0x66d8ff, 1.7, [30, 250, 210]],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...xyz);
    scene.add(light);
  }

  const root = new THREE.Group();
  scene.add(root);

  const parts = new Map();
  const loader = new STLLoader();
  const preset = {
    enclosure: [0x30343c, .28, .16],
    bezel: [0x111216, .36, .35],
    keycap: [0xf1efe8, .30, .02],
    input: [0xc9523f, .36, .08],
    board: [0x1764a3, .32, .22],
    knob: [0xe5e2da, .22, .70],
    metal: [0x777b82, .35, .62],
  };
  const makeMaterial = (key) => {
    const [color, roughness, metalness] = preset[key];
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  };
  const lineBase = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .17 });

  const roleMatch = (part, role) => roleIds(role).includes(part.id);

  const systemOf = (part) => {
    const group = `${part.group || ''}`.toLowerCase();
    if (roleMatch(part, 'keycaps') || roleMatch(part, 'switches') || /choc|switch|keycap/.test(group)) return 'input';
    if (roleMatch(part, 'knob') || roleMatch(part, 'encoder') || roleMatch(part, 'knobHardware') || /ec11|control/.test(group)) return 'control';
    if (roleMatch(part, 'screenBezel')) return 'display';
    if (roleMatch(part, 'displayModule') || roleMatch(part, 'retainer') || /esp32|compute|board|internal/.test(group)) return 'compute';
    return 'enclosure';
  };

  const materialKey = (part) => {
    if (roleMatch(part, 'screenBezel') || /bezel/i.test(part.id)) return 'bezel';
    if (roleMatch(part, 'keycaps')) return 'keycap';
    if (roleMatch(part, 'switches') || /choc|switch/i.test(part.id)) return 'input';
    if (roleMatch(part, 'displayModule') || /esp32|waveshare|board/i.test(part.id)) return 'board';
    if (roleMatch(part, 'knob')) return 'knob';
    if (/nut|washer|retainer/i.test(part.id)) return 'metal';
    return 'enclosure';
  };

  function drawKeycapGlyph(ctx, index) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = '#202126';
    ctx.fillStyle = '#202126';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const cx = 64, cy = 64;
    if (index === 0) {
      ctx.strokeRect(43, 58, 42, 34);
      ctx.beginPath(); ctx.moveTo(38, 61); ctx.lineTo(64, 38); ctx.lineTo(90, 61); ctx.stroke();
    } else if (index === 1) {
      ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke();
      for (let a = 0; a < 8; a++) {
        const r = a * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(r) * 28, cy + Math.sin(r) * 28);
        ctx.lineTo(cx + Math.cos(r) * 40, cy + Math.sin(r) * 40);
        ctx.stroke();
      }
    } else if (index === 2) {
      ctx.beginPath();
      ctx.moveTo(64, 34); ctx.lineTo(71, 56); ctx.lineTo(94, 64); ctx.lineTo(71, 72);
      ctx.lineTo(64, 94); ctx.lineTo(57, 72); ctx.lineTo(34, 64); ctx.lineTo(57, 56);
      ctx.closePath(); ctx.stroke();
    } else if (index === 3) {
      ctx.beginPath(); ctx.arc(cx, cy + 4, 29, -.75 * Math.PI, .75 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(64, 31); ctx.lineTo(64, 67); ctx.stroke();
    } else if (index === 4) {
      ctx.beginPath(); ctx.arc(60, 62, 30, .25 * Math.PI, 1.75 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#f1efe8'; ctx.beginPath(); ctx.arc(75, 51, 28, 0, Math.PI * 2); ctx.fill();
    } else {
      [45, 64, 83].forEach((x) => { ctx.beginPath(); ctx.arc(x, cy, 6, 0, Math.PI * 2); ctx.fill(); });
    }
  }

  function adaptA340(part) {
    if (roleMatch(part, 'knob')) {
      const scale = A340_PROFILE.webAdaptation.knobScaleXY;
      part.mesh.scale.x = scale;
      part.mesh.scale.y = scale;
    }

    const index = A340_PROFILE.roles.keycaps.indexOf(part.id);
    if (index < 0) return;

    const current = sizeOf(part.data.bboxMm);
    const target = A340_PROFILE.webAdaptation.keycapTarget;
    part.mesh.scale.set(
      clamp(target[0] / current.x, .92, 1.16),
      clamp(target[1] / current.y, .92, 1.16),
      clamp(target[2] / current.z, .90, 1.32),
    );

    const canvas2d = document.createElement('canvas');
    canvas2d.width = canvas2d.height = 128;
    const ctx = canvas2d.getContext('2d');
    drawKeycapGlyph(ctx, index);
    const texture = new THREE.CanvasTexture(canvas2d);
    texture.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(7.8, 6.6),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }),
    );
    decal.position.z = current.z * .5 * part.mesh.scale.z + .12;
    decal.rotation.x = FACE_ANGLE;
    part.pivot.add(decal);
    part.decal = decal;
  }

  const manifestResponse = await fetch('ASSEMBLY_MANIFEST.json');
  if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();

  await Promise.all(manifest.parts.map((data) => new Promise((resolve) => {
    loader.load(`stl/${data.filename}`, (geometry) => {
      geometry.computeVertexNormals();
      const center = centerOf(data.bboxMm);
      geometry.translate(-center.x, -center.y, -center.z);

      const stub = { id: data.id, group: data.selectionGroupId || data.group, data };
      const mesh = new THREE.Mesh(geometry, makeMaterial(materialKey(stub)));
      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, /waveshare|esp32/i.test(data.id) ? 28 : 18),
        lineBase.clone(),
      );
      mesh.add(line);

      const pivot = new THREE.Group();
      pivot.position.copy(center);
      pivot.add(mesh);
      root.add(pivot);

      const part = {
        id: data.id,
        group: data.selectionGroupId || data.group || '',
        data,
        pivot,
        mesh,
        line,
        sourceCenter: center.clone(),
        home: center.clone(),
        explode: new THREE.Vector3(...(data.explodeVectorMm || [0, 0, 0])),
        system: '',
        baseColor: mesh.material.color.clone(),
        baseRoughness: mesh.material.roughness,
        baseMetalness: mesh.material.metalness,
        baseRotation: mesh.rotation.clone(),
        keyIndex: A340_PROFILE.roles.keycaps.indexOf(data.id),
      };
      part.system = systemOf(part);
      parts.set(part.id, part);
      adaptA340(part);
      resolve();
    }, undefined, (error) => {
      console.warn('STL load failed:', data.filename, error);
      resolve();
    });
  })));

  // Visible A3.40 EC11 well delta. A3.40 keeps the encoder center frozen and
  // restores material between the old Ø30 cosmetic cut and the new Ø26 cut.
  const shell = parts.get(roleId('upperShell'));
  if (shell) {
    const { wellInnerRadius: inner, wellOuterRadius: outer } = A340_PROFILE.webAdaptation;
    const geometry = new THREE.RingGeometry(inner, outer, 96);
    const mesh = new THREE.Mesh(geometry, makeMaterial('enclosure'));
    mesh.rotation.x = FACE_ANGLE;
    const [x, y] = A340_PROFILE.dimensions.knobCenter;
    const pivot = new THREE.Group();
    pivot.position.set(x, y, faceZAt(y) + .10);
    pivot.add(mesh);
    root.add(pivot);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), lineBase.clone());
    mesh.add(line);
    parts.set('__a340_well_patch', {
      id: '__a340_well_patch',
      group: shell.group,
      data: { bboxMm: [[-outer, -outer, -.2], [outer, outer, .2]] },
      pivot,
      mesh,
      line,
      sourceCenter: pivot.position.clone(),
      home: pivot.position.clone(),
      explode: shell.explode.clone(),
      system: 'enclosure',
      keyIndex: -1,
      baseColor: mesh.material.color.clone(),
      baseRoughness: .28,
      baseMetalness: .16,
      baseRotation: mesh.rotation.clone(),
    });
  }

  const assemblyCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  for (const part of parts.values()) {
    part.pivot.position.sub(assemblyCenter);
    part.home.copy(part.pivot.position);
  }
  root.updateMatrixWorld(true);

  const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
  const baseRadius = Math.max(170, sphere.radius / Math.tan(DEG(17)) * 1.05);

  // The product-stage quad must originate from the real visible LCD plane. Use
  // the bezel transform so the plane follows system-level separation, and place
  // it from the frozen A3.40 screen datum instead of bbox-height heuristics.
  let lcd = null;
  let lcdCanvas = null;
  let lcdCtx = null;
  let lcdTexture = null;
  const host = parts.get(roleId('screenBezel'));
  if (host) {
    lcdCanvas = document.createElement('canvas');
    lcdCanvas.width = 640;
    lcdCanvas.height = 480;
    lcdCtx = lcdCanvas.getContext('2d');
    lcdTexture = new THREE.CanvasTexture(lcdCanvas);
    lcdTexture.colorSpace = THREE.SRGBColorSpace;

    const [w, h] = A340_PROFILE.dimensions.displayVisible;
    lcd = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: lcdTexture, transparent: true, opacity: .9, side: THREE.DoubleSide, toneMapped: false }),
    );
    const [screenX, screenY] = A340_PROFILE.dimensions.screenCenter;
    const absoluteCenter = new THREE.Vector3(screenX, screenY, faceZAt(screenY) + .16);
    lcd.position.copy(absoluteCenter.sub(host.sourceCenter));
    lcd.rotation.x = FACE_ANGLE;
    host.pivot.add(lcd);
  }

  return {
    scene,
    camera,
    renderer,
    root,
    parts,
    roleMatch,
    baseRadius,
    lcd,
    lcdCanvas,
    lcdCtx,
    lcdTexture,
    assemblyCenter,
    profile: A340_PROFILE,
  };
}
