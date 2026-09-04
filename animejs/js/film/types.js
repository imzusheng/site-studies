export const clamp01 = (value) => Math.min(1, Math.max(0, value));

export const eases = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2,
};

export function track(keys, fallbackEase = 'linear') {
  if (!Array.isArray(keys) || keys.length === 0) throw new TypeError('track requires keyframes');
  const frames = keys.map(([at, value, ease = fallbackEase]) => ({ at, value, ease }));
  if (frames.some((f) => !Number.isFinite(f.at))) throw new TypeError('track keyframe positions must be finite');
  frames.sort((a, b) => a.at - b.at);
  return {
    keys: frames,
    key(progress) {
      const p = clamp01(progress);
      if (p <= frames[0].at) return cloneValue(frames[0].value);
      const last = frames[frames.length - 1];
      if (p >= last.at) return cloneValue(last.value);
      const i = frames.findIndex((frame, index) => index > 0 && p <= frame.at);
      const a = frames[i - 1], b = frames[i];
      const span = b.at - a.at || 1;
      const raw = (p - a.at) / span;
      const eased = (eases[a.ease] || eases.linear)(raw);
      return interpolate(a.value, b.value, eased);
    },
  };
}

export const anchorRef = (name, offset = [0, 0, 0]) => ({ type: 'anchor', name, offset: [...offset] });

export function interpolate(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((value, i) => interpolate(value, b[i], t));
  if (a && typeof a.clone === 'function' && b && typeof b.clone === 'function') return a.clone().lerp(b, t);
  return t < 0.5 ? cloneValue(a) : cloneValue(b);
}

export function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value.clone === 'function') return value.clone();
  if (value && typeof value === 'object') return { ...value };
  return value;
}

export function evalTrack(value, progress) {
  return typeof value?.key === 'function' ? value.key(progress) : cloneValue(value);
}
