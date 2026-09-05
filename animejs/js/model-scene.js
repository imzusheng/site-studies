import * as THREE from '/vendor/three.module.js';
import { STLLoader } from '/vendor/STLLoader.js';
import { A340_PROFILE, roleId, roleIds } from './model-profile.js';

const DEG = THREE.MathUtils.degToRad;
const FACE_ANGLE = DEG(A340_PROFILE.dimensions.faceAngleDeg);
const FACE_NORMAL = new THREE.Vector3(0, -Math.sin(FACE_ANGLE), Math.cos(FACE_ANGLE)).normalize();
const FACE_TANGENT = new THREE.Vector3(0, Math.cos(FACE_ANGLE), Math.sin(FACE_ANGLE)).normalize();
const BOARD_RIGHT = new THREE.Vector3(1, 0, 0);

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

const addPlanarUv = (geometry) => {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const spanX = Math.max(.001, box.max.x - box.min.x);
  const spanY = Math.max(.001, box.max.y - box.min.y);
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = (position.getX(i) - box.min.x) / spanX;
    uv[i * 2 + 1] = (position.getY(i) - box.min.y) / spanY;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
};

const addPresentationColors = (geometry, data) => {
  const id = data.id.toLowerCase();
  const isShell = id === 'cosmetic_upper_shell';
  const isKeycap = /^keycap_/.test(id);
  if (!isShell && !isKeycap) return;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  let faceMin = Infinity;
  let faceMax = -Infinity;
  if (isKeycap) {
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const height = position.getY(vertex) * FACE_NORMAL.y + position.getZ(vertex) * FACE_NORMAL.z;
      faceMin = Math.min(faceMin, height);
      faceMax = Math.max(faceMax, height);
    }
  }

  const smoothstep = (from, to, value) => {
    const t = Math.max(0, Math.min(1, (value - from) / Math.max(.0001, to - from)));
    return t * t * (3 - 2 * t);
  };
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    let factor;
    if (isShell) {
      const y = (position.getY(vertex) - box.min.y) / Math.max(.001, box.max.y - box.min.y);
      factor = .56 + .44 * smoothstep(.48, .98, y);
    } else {
      const height = position.getY(vertex) * FACE_NORMAL.y + position.getZ(vertex) * FACE_NORMAL.z;
      const level = (height - faceMin) / Math.max(.001, faceMax - faceMin);
      factor = .58 + .42 * smoothstep(.48, .88, level);
    }
    colors[vertex * 3] = factor;
    colors[vertex * 3 + 1] = factor * .975;
    colors[vertex * 3 + 2] = factor * .94;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
};

const applyCreasedNormals = (geometry, creaseAngle = DEG(38)) => {
  const position = geometry.getAttribute('position');
  const faceCount = Math.floor(position.count / 3);
  const faceNormals = new Float32Array(faceCount * 3);
  const faceWeights = new Float32Array(faceCount);
  const vertexFaces = new Map();
  const keys = new Array(position.count);
  const precision = 10000;

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = `${Math.round(position.getX(vertex) * precision)},${Math.round(position.getY(vertex) * precision)},${Math.round(position.getZ(vertex) * precision)}`;
    keys[vertex] = key;
    if (!vertexFaces.has(key)) vertexFaces.set(key, []);
    vertexFaces.get(key).push(Math.floor(vertex / 3));
  }

  for (let face = 0; face < faceCount; face += 1) {
    const a = face * 3;
    const ax = position.getX(a); const ay = position.getY(a); const az = position.getZ(a);
    const abx = position.getX(a + 1) - ax; const aby = position.getY(a + 1) - ay; const abz = position.getZ(a + 1) - az;
    const acx = position.getX(a + 2) - ax; const acy = position.getY(a + 2) - ay; const acz = position.getZ(a + 2) - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    faceWeights[face] = length;
    nx /= length; ny /= length; nz /= length;
    faceNormals[face * 3] = nx;
    faceNormals[face * 3 + 1] = ny;
    faceNormals[face * 3 + 2] = nz;
  }

  const normals = new Float32Array(position.count * 3);
  const creaseDot = Math.cos(creaseAngle);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const ownFace = Math.floor(vertex / 3);
    const ox = faceNormals[ownFace * 3];
    const oy = faceNormals[ownFace * 3 + 1];
    const oz = faceNormals[ownFace * 3 + 2];
    let nx = 0; let ny = 0; let nz = 0;
    for (const face of vertexFaces.get(keys[vertex])) {
      const fx = faceNormals[face * 3];
      const fy = faceNormals[face * 3 + 1];
      const fz = faceNormals[face * 3 + 2];
      if (ox * fx + oy * fy + oz * fz < creaseDot) continue;
      const weight = faceWeights[face];
      nx += fx * weight; ny += fy * weight; nz += fz * weight;
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[vertex * 3] = nx / length;
    normals[vertex * 3 + 1] = ny / length;
    normals[vertex * 3 + 2] = nz / length;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
};

const createMicroSurfaceTexture = (renderer) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  let seed = 0x340231;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = random() * 2 - 1;
      const value = Math.max(198, Math.min(238, Math.round(218 + grain * 20)));
      const offset = (y * size + x) * 4;
      pixels.data[offset] = value;
      pixels.data[offset + 1] = value;
      pixels.data[offset + 2] = value;
      pixels.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
};

const applyHeroReflection = (material, kind) => {
  const heroMix = { value: 1 };
  material.userData.heroMix = heroMix;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.lumaHeroMix = heroMix;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vLumaObjectPosition;\nvarying vec3 vLumaObjectNormal;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLumaObjectPosition = position;\nvLumaObjectNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float lumaHeroMix;\nvarying vec3 vLumaObjectPosition;\nvarying vec3 vLumaObjectNormal;\nvoid main() {');

    let reflection;
    if (kind === 'shell') {
      reflection = `
        float lumaFacing = clamp(dot(normalize(vLumaObjectNormal), vec3(0.0, -0.1573, 0.9876)), 0.0, 1.0);
        float lumaSurface = smoothstep(0.38, 0.92, lumaFacing);
        float lumaTopBand = pow(smoothstep(11.0, 40.5, vLumaObjectPosition.y), 1.35);
        float lumaSoftbox = lumaTopBand * mix(0.22, 1.0, lumaSurface);
        float lumaShoulder = smoothstep(29.0, 38.6, vLumaObjectPosition.y);
        float lumaHighlight = smoothstep(35.2, 39.45, vLumaObjectPosition.y);
        float lumaCrown = smoothstep(38.6, 40.35, vLumaObjectPosition.y);
        float lumaRim = lumaCrown * pow(1.0 - lumaFacing, 2.8);
        float lumaGrain = 0.82 + 0.36 * smoothstep(0.68, 0.96, texture2D(roughnessMap, vRoughnessMapUv).g);
        outgoingLight += lumaHeroMix * lumaGrain * (
          vec3(0.25, 0.18, 0.13) * lumaSoftbox
          + vec3(0.28, 0.21, 0.16) * lumaShoulder * mix(0.30, 1.0, lumaSurface)
          + vec3(0.38, 0.31, 0.26) * lumaHighlight * mix(0.25, 1.0, lumaSurface)
          + vec3(2.10, 1.78, 1.52) * lumaCrown * mix(0.40, 1.0, lumaSurface)
          + vec3(0.65, 0.52, 0.42) * lumaRim
        );
      `;
    } else if (kind === 'knob') {
      reflection = `
        float lumaFacing = clamp(dot(normalize(vLumaObjectNormal), vec3(0.0, -0.1573, 0.9876)), 0.0, 1.0);
        float lumaRim = pow(1.0 - lumaFacing, 1.72);
        float lumaSweep = smoothstep(0.0, 11.0, vLumaObjectPosition.y);
        float lumaGrain = 0.86 + 0.28 * smoothstep(0.68, 0.96, texture2D(roughnessMap, vRoughnessMapUv).g);
        outgoingLight += lumaHeroMix * lumaGrain * (
          vec3(0.032, 0.024, 0.019) * (0.35 + 0.65 * lumaFacing)
          + vec3(0.042, 0.031, 0.024) * lumaSweep * lumaFacing
          + vec3(0.34, 0.235, 0.17) * lumaRim
        );
      `;
    } else if (kind.startsWith('keycap')) {
      const sweepScale = kind === 'keycap-left' ? '1.65' : '0.72';
      reflection = `
        float lumaFacing = clamp(dot(normalize(vLumaObjectNormal), vec3(0.0, -0.1573, 0.9876)), 0.0, 1.0);
        float lumaFace = smoothstep(0.68, 0.94, lumaFacing);
        float lumaEdge = pow(1.0 - lumaFacing, 3.2);
        float lumaSweep = smoothstep(-2.0, 7.6, vLumaObjectPosition.y);
        float lumaGrain = 0.88 + 0.24 * smoothstep(0.68, 0.96, texture2D(roughnessMap, vRoughnessMapUv).g);
        outgoingLight *= mix(1.0, mix(0.32, 1.0, lumaFace), lumaHeroMix);
        outgoingLight += lumaHeroMix * lumaGrain * (
          mix(vec3(0.018, 0.014, 0.011), vec3(0.072, 0.052, 0.039) * ${sweepScale}, lumaSweep) * lumaFace
          + vec3(0.026, 0.013, 0.008) * lumaEdge
        );
      `;
    } else {
      reflection = `
        float lumaFacing = clamp(dot(normalize(vLumaObjectNormal), vec3(0.0, -0.1573, 0.9876)), 0.0, 1.0);
        float lumaRim = pow(1.0 - lumaFacing, 2.2);
        outgoingLight += lumaHeroMix * (
          vec3(0.028, 0.026, 0.024) * lumaFacing
          + vec3(0.18, 0.13, 0.096) * lumaRim
        );
      `;
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${reflection}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `luma-hero-reflection-${kind}-v1`;
};

const materialSpec = (data) => {
  const id = data.id.toLowerCase();
  const group = data.group;

  if (id === 'lcd_active_glass') return { kind: 'glass', color: 0x0c141a, roughness: .26, metalness: 0, opacity: .10 };
  if (id === 'cosmetic_upper_shell') return { color: 0x3c3834, roughness: .76, metalness: 0, micro: .04 };
  if (id === 'bottom_service_cover') return { color: 0x1b1c1d, roughness: .78, metalness: 0, micro: .035 };
  if (id === 'screen_bezel') return { color: 0x0b0c0e, roughness: .48, metalness: 0, micro: .03 };
  if (id === 'ec11_knob_24x8p5') return { color: 0x242321, roughness: .68, metalness: 0, micro: .03 };
  if (/^keycap_/.test(id)) return { color: 0x55514b, roughness: .74, metalness: 0, micro: .025 };
  if (/^choc_v2_/.test(id)) return { color: 0x191d20, roughness: .56, metalness: 0, emissive: 0x08151a };
  if (id === 'compute_pcb') return { color: 0x0b4054, roughness: .66, metalness: 0 };
  if (id === 'power_pcb' || /^input_pcb_/.test(id)) return { color: 0x124936, roughness: .68, metalness: 0 };
  if (id === 'lipo_cell') return { color: 0x858a90, roughness: .62, metalness: 0 };
  if (/pin|pad|terminal|tp\d|screw|m3|fuse/.test(id)) return { color: 0x756f65, roughness: .58, metalness: .04 };
  if (/connector|header|usb|microsd|fpc|jst/.test(id)) return { color: 0x252a2e, roughness: .60, metalness: .02 };
  if (/^compute_(u|q|t|d)|^power_(u|q)|ec11_reference/.test(id)) return { color: 0x0b0d0f, roughness: .50, metalness: 0 };
  if (group === 'compute') return { color: 0x252b30, roughness: .58, metalness: 0 };
  if (group === 'input' || group === 'power') return { color: 0x28302d, roughness: .64, metalness: 0 };
  if (group === 'fasteners') return { color: 0x4c5154, roughness: .62, metalness: .05 };
  return { color: 0x25292d, roughness: .68, metalness: 0 };
};

const makeMaterial = (data, microSurface, vertexColors = false) => {
  const spec = materialSpec(data);
  let surfaceMap = null;
  if (spec.micro) {
    const dimensions = sizeOf(data.bboxMm);
    surfaceMap = microSurface.clone();
    surfaceMap.repeat.set(Math.max(1, dimensions.x / 18), Math.max(1, dimensions.y / 18));
    surfaceMap.needsUpdate = true;
  }
  const shared = {
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: Boolean(spec.opacity),
    opacity: spec.opacity ?? 1,
    depthWrite: (spec.opacity ?? 1) > .5,
    roughnessMap: surfaceMap,
    bumpMap: surfaceMap,
    bumpScale: spec.micro ?? 0,
    vertexColors,
  };
  if (spec.kind === 'glass') {
    return new THREE.MeshPhysicalMaterial({ ...shared, clearcoat: .40, clearcoatRoughness: .30, ior: 1.46, side: THREE.DoubleSide });
  }
  return new THREE.MeshStandardMaterial({ ...shared, emissive: spec.emissive ?? 0x000000, emissiveIntensity: spec.emissive ? .12 : 0 });
};

const shouldOutline = (data) => {
  const id = data.id.toLowerCase();
  return data.printable
    || ['compute_pcb', 'power_pcb', 'input_pcb_left', 'input_pcb_right', 'lcd_active_glass', 'lcd_backlight_stack', 'lipo_cell'].includes(id)
    || /^(?:choc_v2_|compute_(?:u|q|d|l|usb|microsd|camera|battery)|power_(?:u|q|f|j)|p[12]_header|ec11_reference)/.test(id);
};

export async function createModelScene(canvas, onProgress = () => {}) {
  const scene = new THREE.Scene();
  scene.up.set(0, 0, 1);

  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 5000);
  camera.up.set(0, 0, 1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .78;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const lights = {
    ambient: new THREE.HemisphereLight(0x93a3ad, 0x010203, .28),
    key: new THREE.DirectionalLight(0xffefe7, .45),
    rim: new THREE.DirectionalLight(0xffeee6, 2.2),
    edge: new THREE.DirectionalLight(0xa7bfca, 1.05),
  };
  lights.key.position.set(0, -240, 300);
  lights.rim.position.set(260, 220, 46);
  lights.edge.position.set(-260, 220, 46);
  lights.key.castShadow = true;
  lights.key.shadow.mapSize.set(2048, 2048);
  lights.key.shadow.camera.left = -135;
  lights.key.shadow.camera.right = 135;
  lights.key.shadow.camera.top = 120;
  lights.key.shadow.camera.bottom = -120;
  lights.key.shadow.camera.near = 30;
  lights.key.shadow.camera.far = 760;
  lights.key.shadow.bias = -.0002;
  lights.key.shadow.normalBias = .08;
  scene.add(lights.ambient, lights.key, lights.rim, lights.edge);

  const microSurface = createMicroSurfaceTexture(renderer);

  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  onProgress({ phase: 'manifest', loaded: 0, total: A340_PROFILE.dimensions.sceneObjectCount });
  const manifestResponse = await fetch('ASSEMBLY_MANIFEST.json');
  if (!manifestResponse.ok) throw new Error(`场景清单读取失败（HTTP ${manifestResponse.status}）`);
  const manifest = await manifestResponse.json();
  if (manifest.profile?.id !== A340_PROFILE.id || manifest.parts?.length !== A340_PROFILE.dimensions.sceneObjectCount) {
    throw new Error(`场景清单不是完整 A3.40：${manifest.parts?.length ?? 0} / ${A340_PROFILE.dimensions.sceneObjectCount}`);
  }

  const parts = new Map();
  const roleMatch = (part, role) => roleIds(role).includes(part.id);
  const manager = new THREE.LoadingManager();
  const loader = new STLLoader(manager);
  const lineBase = new THREE.LineBasicMaterial({ color: 0xd9e3e8, transparent: true, opacity: 0 });
  let completed = 0;

  const loadPart = (data) => new Promise((resolve, reject) => {
    loader.load(`stl/${data.filename}`, (geometry) => {
      applyCreasedNormals(geometry);
      const center = centerOf(data.bboxMm);
      geometry.translate(-center.x, -center.y, -center.z);
      addPlanarUv(geometry);
      addPresentationColors(geometry, data);

      const material = makeMaterial(data, microSurface, Boolean(geometry.getAttribute('color')));
      if (data.id === 'cosmetic_upper_shell') applyHeroReflection(material, 'shell');
      else if (data.id === 'ec11_knob_24x8p5') applyHeroReflection(material, 'knob');
      else if (data.id === 'screen_bezel') applyHeroReflection(material, 'bezel');
      else if (/^keycap_/.test(data.id)) applyHeroReflection(material, Number(data.id.slice(-1)) % 2 ? 'keycap-left' : 'keycap-right');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = material.opacity > .5;
      mesh.receiveShadow = material.opacity > .5;
      let line = null;
      if (shouldOutline(data)) {
        line = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 26), lineBase.clone());
        line.visible = false;
        mesh.add(line);
      }

      const pivot = new THREE.Group();
      pivot.position.copy(center);
      pivot.add(mesh);
      root.add(pivot);

      const part = {
        id: data.id,
        group: data.group,
        data,
        pivot,
        mesh,
        line,
        sourceCenter: center.clone(),
        home: center.clone(),
        explode: new THREE.Vector3(...(data.explodeVectorMm || [0, 0, 0])),
        baseColor: material.color.clone(),
        baseRoughness: material.roughness,
        baseMetalness: material.metalness,
        baseOpacity: material.opacity,
        baseRotation: mesh.rotation.clone(),
        keyIndex: A340_PROFILE.roles.keycaps.indexOf(data.id),
        detailExplode: new THREE.Vector3(),
        detailRank: 0,
      };
      parts.set(data.id, part);
      completed += 1;
      onProgress({ phase: 'parts', loaded: completed, total: manifest.parts.length });
      resolve();
    }, undefined, () => reject(new Error(`模型零件加载失败：${data.filename}`)));
  });

  await Promise.all(manifest.parts.map(loadPart));
  for (const [role, values] of Object.entries(A340_PROFILE.roles)) {
    for (const id of (Array.isArray(values) ? values : [values])) {
      if (!parts.has(id)) throw new Error(`关键零件缺失：${role} → ${id}`);
    }
  }

  const assemblyCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  for (const part of parts.values()) {
    part.pivot.position.sub(assemblyCenter);
    part.home.copy(part.pivot.position);
  }
  root.updateMatrixWorld(true);

  const knob = parts.get(roleId('knob'));
  const knobPositions = knob.mesh.geometry.getAttribute('position');
  let knobFace = -Infinity;
  for (let vertex = 0; vertex < knobPositions.count; vertex += 1) {
    knobFace = Math.max(
      knobFace,
      knobPositions.getY(vertex) * FACE_NORMAL.y + knobPositions.getZ(vertex) * FACE_NORMAL.z,
    );
  }
  const markHalf = 2.15;
  const markRadius = .72;
  const knobMarkShape = new THREE.Shape();
  knobMarkShape.moveTo(-markHalf + markRadius, -markHalf);
  knobMarkShape.lineTo(markHalf - markRadius, -markHalf);
  knobMarkShape.quadraticCurveTo(markHalf, -markHalf, markHalf, -markHalf + markRadius);
  knobMarkShape.lineTo(markHalf, markHalf - markRadius);
  knobMarkShape.quadraticCurveTo(markHalf, markHalf, markHalf - markRadius, markHalf);
  knobMarkShape.lineTo(-markHalf + markRadius, markHalf);
  knobMarkShape.quadraticCurveTo(-markHalf, markHalf, -markHalf, markHalf - markRadius);
  knobMarkShape.lineTo(-markHalf, -markHalf + markRadius);
  knobMarkShape.quadraticCurveTo(-markHalf, -markHalf, -markHalf + markRadius, -markHalf);
  const knobMark = new THREE.Mesh(
    new THREE.ShapeGeometry(knobMarkShape, 8),
    new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: .92, metalness: 0, transparent: true, opacity: .45, depthWrite: false }),
  );
  knobMark.rotation.x = FACE_ANGLE;
  knobMark.position.copy(FACE_NORMAL).multiplyScalar(knobFace + .025);
  knobMark.renderOrder = 4;
  knob.mesh.add(knobMark);

  const groupCenters = new Map();
  for (const group of ['enclosure', 'controls', 'input', 'compute', 'power', 'fasteners']) {
    const center = new THREE.Vector3();
    const members = [...parts.values()].filter((part) => part.group === group);
    members.forEach((part) => center.add(part.home));
    if (members.length) center.multiplyScalar(1 / members.length);
    groupCenters.set(group, center);
  }

  // The compute board first moves as one rigid assembly, then its components spread
  // in a deterministic, board-relative field. This keeps reverse scrolling exact.
  const computePcb = parts.get(roleId('mainboard'));
  const detailMembers = [...parts.values()]
    .filter((part) => part.group === 'compute' && !['compute_pcb', 'lcd_backlight_stack', 'lcd_active_glass'].includes(part.id))
    .map((part) => {
      const relative = part.home.clone().sub(computePcb.home);
      const u = relative.dot(BOARD_RIGHT);
      const v = relative.dot(FACE_TANGENT);
      return { part, relative, u, v, distance: Math.hypot(u, v) };
    })
    .sort((a, b) => a.distance - b.distance || a.part.id.localeCompare(b.part.id));
  const maxDistance = Math.max(1, ...detailMembers.map((entry) => entry.distance));
  detailMembers.forEach((entry, index) => {
    const rank = detailMembers.length > 1 ? index / (detailMembers.length - 1) : 0;
    const radial = BOARD_RIGHT.clone().multiplyScalar(entry.u)
      .addScaledVector(FACE_TANGENT, entry.v);
    if (radial.lengthSq() < .01) radial.copy(BOARD_RIGHT);
    radial.normalize();
    const side = Math.sign(entry.relative.dot(FACE_NORMAL)) || 1;
    const distanceMix = Math.min(1, entry.distance / maxDistance);
    entry.part.detailExplode.copy(radial)
      .multiplyScalar(4 + distanceMix * 8)
      .addScaledVector(FACE_NORMAL, side * (4 + rank * 5));
    entry.part.detailRank = rank;
  });

  const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
  const baseRadius = Math.max(178, sphere.radius / Math.tan(DEG(16)) * 1.02);

  const lcdHost = parts.get(roleId('activeGlass'));
  const lcdCanvas = document.createElement('canvas');
  lcdCanvas.width = 640;
  lcdCanvas.height = 480;
  const lcdCtx = lcdCanvas.getContext('2d');
  const lcdTexture = new THREE.CanvasTexture(lcdCanvas);
  lcdTexture.colorSpace = THREE.SRGBColorSpace;
  const [lcdWidth, lcdHeight] = A340_PROFILE.dimensions.displayVisible;
  const lcd = new THREE.Mesh(
    new THREE.PlaneGeometry(lcdWidth, lcdHeight),
    new THREE.MeshBasicMaterial({ map: lcdTexture, transparent: true, opacity: .76, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }),
  );
  lcd.rotation.x = FACE_ANGLE;
  lcd.position.set(0, -.05, .28);
  lcd.renderOrder = 1;
  lcdHost.mesh.renderOrder = 2;
  lcdHost.pivot.add(lcd);
  const lcdHomePosition = lcd.position.clone();
  const lcdDatumHome = lcdHost.home.clone();

  const screenLight = new THREE.PointLight(0x8fd9ff, .10, 78, 2);
  screenLight.position.copy(lcdDatumHome).add(new THREE.Vector3(0, -7, 16));
  root.add(screenLight);
  lights.screen = screenLight;

  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xd8aa86, transparent: true, opacity: .035, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const keyGlows = [];
  for (const id of A340_PROFILE.roles.switches) {
    const part = parts.get(id);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(7.2, 32), glowMaterial);
    glow.rotation.x = FACE_ANGLE;
    glow.position.z = 2.4;
    part.pivot.add(glow);
    keyGlows.push(glow);
  }

  onProgress({ phase: 'ready', loaded: completed, total: manifest.parts.length });
  return {
    scene, camera, renderer, root, parts, roleMatch, baseRadius,
    lcd, lcdCanvas, lcdCtx, lcdTexture, lcdHomePosition, lcdDatumHome,
    assemblyCenter, groupCenters, lights, glowMaterial, keyGlows,
    manifest, profile: A340_PROFILE,
  };
}
