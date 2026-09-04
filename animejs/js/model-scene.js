import * as THREE from '/vendor/three.module.js';
import { STLLoader } from '/vendor/STLLoader.js';
import { A340_PROFILE, roleId } from './model-profile.js';

const DEG = THREE.MathUtils.degToRad;
const clamp = THREE.MathUtils.clamp;
export const sizeOf = (bb) => new THREE.Vector3(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]);
const centerOf = (bb) => new THREE.Vector3((bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2, (bb[0][2] + bb[1][2]) / 2);

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
  for (const [color, intensity, xyz] of [[0xffffff, 3.5, [-170, -220, 280]], [0xff8060, 1.25, [190, -90, 120]], [0x66d8ff, 1.7, [30, 250, 210]]]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...xyz);
    scene.add(light);
  }

  const root = new THREE.Group();
  scene.add(root);
  const parts = new Map();
  const loader = new STLLoader();
  const preset = {
    enclosure: [0x30343c, .28, .16], bezel: [0x111216, .36, .35], keycap: [0xf1efe8, .30, .02],
    input: [0xc9523f, .36, .08], board: [0x1764a3, .32, .22], knob: [0xe5e2da, .22, .70], metal: [0x777b82, .35, .62],
  };
  const makeMaterial = (key) => { const [color, roughness, metalness] = preset[key]; return new THREE.MeshStandardMaterial({ color, roughness, metalness }); };
  const lineBase = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .17 });

  const roleMatch = (part, role) => {
    const value = A340_PROFILE.roles[role];
    return Array.isArray(value) ? value.includes(part.id) : part.id === value;
  };
  const systemOf = (part) => {
    const group = `${part.group}`.toLowerCase();
    if (A340_PROFILE.roles.keycaps.includes(part.id) || A340_PROFILE.roles.switches.includes(part.id) || /choc|switch/.test(group)) return 'input';
    if (roleMatch(part, 'knob') || roleMatch(part, 'encoder') || /ec11|control/.test(group)) return 'control';
    if (roleMatch(part, 'screenBezel')) return 'display';
    if (roleMatch(part, 'displayModule') || roleMatch(part, 'retainer') || /esp32|compute|board/.test(group)) return 'compute';
    return 'enclosure';
  };
  const materialKey = (part) => {
    if (roleMatch(part, 'screenBezel') || /bezel/i.test(part.id)) return 'bezel';
    if (A340_PROFILE.roles.keycaps.includes(part.id)) return 'keycap';
    if (A340_PROFILE.roles.switches.includes(part.id) || /choc|switch/i.test(part.id)) return 'input';
    if (roleMatch(part, 'displayModule') || /esp32|waveshare|board/i.test(part.id)) return 'board';
    if (roleMatch(part, 'knob')) return 'knob';
    if (/nut|washer|retainer/i.test(part.id)) return 'metal';
    return 'enclosure';
  };

  function adaptA340(part) {
    if (roleMatch(part, 'knob')) part.mesh.scale.x = part.mesh.scale.y = A340_PROFILE.webAdaptation.knobScaleXY;
    const index = A340_PROFILE.roles.keycaps.indexOf(part.id);
    if (index < 0) return;
    const current = sizeOf(part.data.bboxMm), target = A340_PROFILE.webAdaptation.keycapTarget;
    part.mesh.scale.set(clamp(target[0] / current.x, .92, 1.16), clamp(target[1] / current.y, .92, 1.16), clamp(target[2] / current.z, 1, 1.65));
    const canvas2d = document.createElement('canvas');
    canvas2d.width = canvas2d.height = 96;
    const ctx = canvas2d.getContext('2d');
    ctx.fillStyle = '#202126'; ctx.font = '700 34px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(['⌂', '☀', '✦', '⏻', '◒', '•••'][index], 48, 48);
    const texture = new THREE.CanvasTexture(canvas2d); texture.colorSpace = THREE.SRGBColorSpace;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 6.2), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    decal.position.z = current.z * .5 * part.mesh.scale.z + .12;
    part.pivot.add(decal);
    part.decal = decal;
  }

  const manifest = await (await fetch('ASSEMBLY_MANIFEST.json')).json();
  await Promise.all(manifest.parts.map((data) => new Promise((resolve) => loader.load(`stl/${data.filename}`, (geometry) => {
    geometry.computeVertexNormals();
    const center = centerOf(data.bboxMm);
    geometry.translate(-center.x, -center.y, -center.z);
    const stub = { id: data.id, group: data.selectionGroupId || data.group, data };
    const mesh = new THREE.Mesh(geometry, makeMaterial(materialKey(stub)));
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, /waveshare|esp32/i.test(data.id) ? 28 : 18), lineBase.clone());
    mesh.add(line);
    const pivot = new THREE.Group(); pivot.position.copy(center); pivot.add(mesh); root.add(pivot);
    const part = {
      id: data.id, group: data.selectionGroupId || data.group || '', data, pivot, mesh, line,
      home: center.clone(), explode: new THREE.Vector3(...(data.explodeVectorMm || [0, 0, 0])), system: '',
      baseColor: mesh.material.color.clone(), baseRoughness: mesh.material.roughness, baseMetalness: mesh.material.metalness,
      baseRotation: mesh.rotation.clone(), keyIndex: A340_PROFILE.roles.keycaps.indexOf(data.id),
    };
    part.system = systemOf(part);
    parts.set(part.id, part);
    adaptA340(part);
    resolve();
  }, undefined, () => resolve()))));

  const knob = parts.get(roleId('knob')), shell = parts.get(roleId('upperShell'));
  if (knob && shell) {
    const { wellInnerRadius: inner, wellOuterRadius: outer } = A340_PROFILE.webAdaptation;
    const geometry = new THREE.RingGeometry(inner, outer, 72), mesh = new THREE.Mesh(geometry, makeMaterial('enclosure'));
    mesh.rotation.x = DEG(A340_PROFILE.dimensions.faceAngleDeg);
    const pivot = new THREE.Group(), knobSize = sizeOf(knob.data.bboxMm);
    pivot.position.set(knob.home.x, knob.home.y, knob.home.z - knobSize.z * .5 - .55); pivot.add(mesh); root.add(pivot);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), lineBase.clone()); mesh.add(line);
    parts.set('__a340_well_patch', {
      id: '__a340_well_patch', group: shell.group, data: { bboxMm: [[-outer, -outer, -.2], [outer, outer, .2]] },
      pivot, mesh, line, home: pivot.position.clone(), explode: shell.explode.clone(), system: 'enclosure', keyIndex: -1,
      baseColor: mesh.material.color.clone(), baseRoughness: .28, baseMetalness: .16, baseRotation: mesh.rotation.clone(),
    });
  }

  const assemblyCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  for (const part of parts.values()) { part.pivot.position.sub(assemblyCenter); part.home.copy(part.pivot.position); }
  root.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
  const baseRadius = Math.max(170, sphere.radius / Math.tan(DEG(17)) * 1.05);

  let lcd = null, lcdCanvas = null, lcdCtx = null, lcdTexture = null;
  const host = parts.get(roleId('displayModule')) || parts.get(roleId('screenBezel'));
  if (host) {
    lcdCanvas = document.createElement('canvas'); lcdCanvas.width = 640; lcdCanvas.height = 480; lcdCtx = lcdCanvas.getContext('2d');
    lcdTexture = new THREE.CanvasTexture(lcdCanvas); lcdTexture.colorSpace = THREE.SRGBColorSpace;
    const [w, h] = A340_PROFILE.dimensions.displayVisible;
    lcd = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: lcdTexture, transparent: true, opacity: .9, side: THREE.DoubleSide, toneMapped: false }));
    lcd.position.z = sizeOf(host.data.bboxMm).z * .5 + .52;
    host.pivot.add(lcd);
  }

  return { scene, camera, renderer, root, parts, roleMatch, baseRadius, lcd, lcdCanvas, lcdCtx, lcdTexture };
}
