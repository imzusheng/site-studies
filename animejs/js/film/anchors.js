import * as THREE from "../../vendor/three.module.js";

const GROUP_ALIASES = {
  input: ["keycaps", "choc-v2-switches"],
  control: ["ec11-stack"],
  compute: ["esp32-retention", "esp32-stack"],
  enclosure: ["enclosure-closure", "enclosure"],
};

const partById = (manifest) => new Map((manifest.parts || []).map((part) => [part.id, part]));
const groupMembers = (manifest, names) => {
  const groups = new Map((manifest.selectionGroups || []).map((group) => [group.id, group.memberIds || []]));
  const ids = names.flatMap((name) => groups.get(name) || []);
  return [...new Set(ids)];
};
const bboxCenter = (part) => new THREE.Vector3(
  (part.bboxMm[0][0] + part.bboxMm[1][0]) / 2,
  (part.bboxMm[0][1] + part.bboxMm[1][1]) / 2,
  (part.bboxMm[0][2] + part.bboxMm[1][2]) / 2,
);
const averageCenters = (parts) => {
  const result = new THREE.Vector3();
  parts.forEach((part) => result.add(bboxCenter(part)));
  return parts.length ? result.multiplyScalar(1 / parts.length) : result;
};

function findDisplayPart(manifest) {
  const parts = manifest.parts || [];
  return parts.find((p) => p.id === "screen_bezel")
    || parts.find((p) => !p.printable && /lcd|display|screen/i.test(`${p.id} ${p.label} ${p.sourceKind}`))
    || parts.find((p) => /lcd|display|screen/i.test(`${p.id} ${p.label}`));
}

export function computeAnchors(manifest, rootOffset = [0, 0, 0]) {
  const byId = partById(manifest);
  const offset = new THREE.Vector3(...rootOffset);
  const membersFor = (semantic) => groupMembers(manifest, GROUP_ALIASES[semantic] || [semantic]).map((id) => byId.get(id)).filter(Boolean);
  const display = findDisplayPart(manifest);
  const displayCenter = display ? bboxCenter(display) : averageCenters(membersFor("enclosure"));
  const lcdNormalOffset = new THREE.Vector3(0, 0, 3);
  const displayPlane = { center: displayCenter.clone().add(offset), normal: new THREE.Vector3(0, 0, 1) };
  return {
    display_center: displayCenter.clone().add(lcdNormalOffset).add(offset),
    display_plane: displayPlane,
    keyboard_region: averageCenters(membersFor("input")).add(offset),
    keyboard_center: averageCenters(membersFor("input")).add(offset),
    knob_axis: averageCenters(membersFor("control")).add(offset),
    mainboard_plane: { center: averageCenters(membersFor("compute").filter((p) => !p.printable && /lcd|display|board|esp32/i.test(`${p.id} ${p.label} ${p.sourceKind}`))).add(offset), normal: new THREE.Vector3(0, 0, 1) },
    mainboard_center: averageCenters(membersFor("compute").filter((p) => !p.printable && /lcd|display|board|esp32/i.test(`${p.id} ${p.label} ${p.sourceKind}`))).add(offset),
  };
}

export { GROUP_ALIASES };
