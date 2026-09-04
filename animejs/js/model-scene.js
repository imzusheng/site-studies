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

const materialSpec = (data) => {
  const id = data.id.toLowerCase();
  const group = data.group;

  if (id === 'lcd_active_glass') return { kind: 'glass', color: 0x10212c, roughness: .18, metalness: 0, opacity: .12 };
  if (id === 'cosmetic_upper_shell') return { color: 0x1b1f24, roughness: .72, metalness: 0 };
  if (id === 'bottom_service_cover') return { color: 0x13171b, roughness: .76, metalness: 0 };
  if (id === 'screen_bezel') return { color: 0x080a0d, roughness: .44, metalness: 0 };
  if (id === 'ec11_knob_24x8p5') return { color: 0x171b20, roughness: .54, metalness: 0 };
  if (/^keycap_/.test(id)) return { color: 0x777570, roughness: .70, metalness: 0 };
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

const makeMaterial = (data) => {
  const spec = materialSpec(data);
  const shared = {
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: Boolean(spec.opacity),
    opacity: spec.opacity ?? 1,
    depthWrite: (spec.opacity ?? 1) > .5,
  };
  if (spec.kind === 'glass') {
    return new THREE.MeshPhysicalMaterial({ ...shared, clearcoat: .55, clearcoatRoughness: .18, side: THREE.DoubleSide });
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .78;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const lights = {
    ambient: new THREE.HemisphereLight(0x9aabb8, 0x010204, .34),
    key: new THREE.DirectionalLight(0xf5f1e8, .45),
    rim: new THREE.DirectionalLight(0x9dbed2, 2.7),
    edge: new THREE.DirectionalLight(0xe7eef4, 1.25),
  };
  lights.key.position.set(-170, -220, 260);
  lights.rim.position.set(210, 190, 90);
  lights.edge.position.set(-230, 70, 55);
  scene.add(lights.ambient, lights.key, lights.rim, lights.edge);

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
      geometry.computeVertexNormals();
      const center = centerOf(data.bboxMm);
      geometry.translate(-center.x, -center.y, -center.z);

      const material = makeMaterial(data);
      const mesh = new THREE.Mesh(geometry, material);
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
  lcdHost.pivot.add(lcd);
  const lcdHomePosition = lcd.position.clone();
  const lcdDatumHome = lcdHost.home.clone();

  const screenLight = new THREE.PointLight(0x8fd9ff, .10, 78, 2);
  screenLight.position.copy(lcdDatumHome).add(new THREE.Vector3(0, -7, 16));
  root.add(screenLight);
  lights.screen = screenLight;

  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x6ccde6, transparent: true, opacity: .055, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
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
