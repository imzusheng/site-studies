import { anchorRef, evalTrack } from "./types.js";

const clamp = (v) => Math.min(1, Math.max(0, v));

export function resolveAnchor(ref, anchors) {
  if (!ref || ref.type !== "anchor") return ref;
  const base = anchors[ref.name];
  if (!base) return [0, 0, 0];
  const point = base.center || base;
  if (typeof point.clone === "function") return point.clone().add({ x: ref.offset?.[0] || 0, y: ref.offset?.[1] || 0, z: ref.offset?.[2] || 0 });
  return point.map((v, i) => v + (ref.offset?.[i] || 0));
}

function blendLocalAnchor(target, shot, progress, anchors) {
  if (!shot.anchor) return target;
  const global = anchors.display_center;
  const local = anchors[shot.anchor.use];
  if (!global || !local) return target;
  const enter = shot.anchor.enter ?? 0.15;
  const exit = shot.anchor.exit ?? 0.85;
  let mix = progress <= enter ? progress / Math.max(enter, 1e-6) : progress >= exit ? (1 - progress) / Math.max(1 - exit, 1e-6) : 1;
  mix = Math.min(1, Math.max(0, mix));
  if (typeof global.clone === "function") return global.clone().lerp(local, mix);
  return global.map((v, i) => v + (local[i] - v) * mix);
}

export function evaluateShot(shot, progress, anchors, parts = []) {
  const p = clamp(progress);
  const camera = shot.camera || {};
  const targetRef = evalTrack(camera.target || anchorRef("display_center"), p);
  const target = blendLocalAnchor(resolveAnchor(targetRef, anchors), shot, p, anchors);
  const result = {
    shot: shot.id,
    shotProgress: p,
    camera: {
      target,
      azimuth: evalTrack(camera.azimuth, p),
      elevation: evalTrack(camera.elevation, p),
      radius: evalTrack(camera.radius, p),
      fov: evalTrack(camera.fov, p),
    },
    product: Object.fromEntries(Object.entries(shot.product || {}).map(([key, value]) => [key, evalTrack(value, p)])),
    parts: new Map(),
    material: { mode: shot.material?.mode || "pbr", focusMix: new Map() },
  };
  for (const part of parts) {
    const tracks = shot.parts?.filter((track) => track.system === part.system || track.partId === part.id) || [];
    const state = { posOffset: [0, 0, 0], rotation: [0, 0, 0], visible: true };
    tracks.forEach((track) => {
      const value = evalTrack(track.track, p);
      if (track.prop === "liftZ") state.posOffset[2] += value;
      else if (track.prop === "posOffset") state.posOffset = value;
      else if (track.prop === "rotation") state.rotation = value;
      else if (track.prop === "visible") state.visible = Boolean(value);
    });
    result.parts.set(part.id, state);
    if (shot.material?.focus?.system === part.system) result.material.focusMix.set(part.id, evalTrack(shot.material.focus.blend, p));
  }
  return result;
}

export function evaluateFilm(film, progress, anchors, parts = []) {
  const index = Math.min(film.shots.length - 1, Math.floor(clamp(progress) * film.shots.length));
  const local = clamp(progress * film.shots.length - index);
  return evaluateShot(film.shots[index], local, anchors, parts);
}
