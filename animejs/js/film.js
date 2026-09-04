import { createTimeline, onScroll, stagger } from 'animejs';

export const TOTAL_TIME = 6500;
export const SHOT_RANGES = [
  ['hero', 0, 1000],
  ['blueprint', 1000, 2000],
  ['input', 2000, 3000],
  ['control', 3000, 4000],
  ['compute', 4000, 5200],
  ['final', 5200, 6500],
];

export const motion = {
  cameraAzimuth: 28,
  cameraElevation: 28,
  cameraRadiusScale: 1,
  cameraFov: 34,
  focusDisplay: 1,
  focusKeyboard: 0,
  focusKnob: 0,
  focusMainboard: 0,
  productYaw: 0,
  productPitch: 0,
  productRoll: 0,
  blueprintSeparation: 0,
  keycapLift: 0,
  keycapSequence: 0,
  knobRotation: 0,
  serviceCoverOpen: 0,
  boardLift: 0,
  boardFlip: 0,
  cadMix: 0,
  inkMix: 0,
  stageExpand: 0.1,
  blueprintLabels: 0,
  inputCallouts: 0,
  computeCallouts: 0,
  lcdIntensity: 1,
  lcdInteraction: 0,
};

const initial = { ...motion };
const tracks = [];
const add = (property, from, to, start, end, ease = 'linear') => tracks.push({ property, from, to, start, end, ease });
const hold = (property, value = initial[property]) => add(property, value, value, 0, TOTAL_TIME);

hold('cameraFov', 34);
add('cameraAzimuth', 26, 36, 0, 1000, 'inOut(3)');
add('cameraAzimuth', 36, 28, 1000, 2000, 'inOut(3)');
add('cameraAzimuth', 28, 18, 2000, 3000, 'inOut(3)');
add('cameraAzimuth', 18, -4, 3000, 4000, 'inOut(3)');
add('cameraAzimuth', -4, 54, 4000, 5200, 'inOut(3)');
add('cameraAzimuth', 54, 30, 5200, 6500, 'inOut(3)');
add('cameraElevation', 30, 24, 0, 1000, 'inOut(3)');
add('cameraElevation', 24, 36, 1000, 2000, 'inOut(3)');
add('cameraElevation', 36, 42, 2000, 3000, 'inOut(3)');
add('cameraElevation', 42, 28, 3000, 4000, 'inOut(3)');
add('cameraElevation', 28, 54, 4000, 5200, 'inOut(3)');
add('cameraElevation', 54, 28, 5200, 6500, 'inOut(3)');
add('cameraRadiusScale', 1.05, 0.96, 0, 1000, 'inOut(3)');
add('cameraRadiusScale', 0.96, 1.25, 1000, 2000, 'inOut(3)');
add('cameraRadiusScale', 1.25, 0.58, 2000, 3000, 'inOut(3)');
add('cameraRadiusScale', 0.58, 0.68, 3000, 4000, 'inOut(3)');
add('cameraRadiusScale', 0.68, 0.48, 4000, 5200, 'inOut(3)');
add('cameraRadiusScale', 0.48, 1.02, 5200, 6500, 'inOut(3)');

add('focusDisplay', 1, 1, 0, 1000); add('focusDisplay', 1, 1, 1000, 2000);
add('focusDisplay', 1, 0, 2000, 3000, 'inOut(3)');
add('focusDisplay', 0, 0.45, 3000, 4000, 'inOut(3)');
add('focusDisplay', 0.45, 0.15, 4000, 5200, 'inOut(3)');
add('focusDisplay', 0.15, 1, 5200, 6500, 'inOut(3)');
add('focusKeyboard', 0, 1, 2000, 2550, 'inOut(3)'); add('focusKeyboard', 1, 0, 2550, 3000, 'inOut(3)');
add('focusKnob', 0, 1, 3000, 3550, 'inOut(3)'); add('focusKnob', 1, 0.55, 3550, 4000, 'inOut(3)');
add('focusMainboard', 0, 1, 4000, 4550, 'inOut(3)'); add('focusMainboard', 1, 0, 4550, 6500, 'inOut(3)');

add('productYaw', 0, 0.08, 0, 1000, 'inOut(3)'); add('productYaw', 0.08, 0.12, 1000, 2000, 'inOut(3)');
add('productYaw', 0.12, 0.08, 2000, 3000, 'inOut(3)'); add('productYaw', 0.08, 0.02, 3000, 4000, 'inOut(3)');
add('productYaw', 0.02, -0.12, 4000, 5200, 'inOut(3)'); add('productYaw', -0.12, 0, 5200, 6500, 'inOut(3)');
add('productPitch', 0, 0, 0, 2000); add('productPitch', 0, 0.05, 2000, 3000, 'inOut(3)'); add('productPitch', 0.05, 0, 3000, 6500, 'inOut(3)');
add('blueprintSeparation', 0, 1, 1100, 1800, 'inOut(3)'); add('blueprintSeparation', 1, 0, 2000, 2550, 'out(3)');
add('keycapLift', 0, 8, 2250, 2700, 'out(3)'); add('keycapLift', 8, 0, 2850, 3200, 'in(3)');
add('keycapSequence', 0, 1, 2300, 2800, 'out(3)');
add('knobRotation', 0, Math.PI * 1.6, 3250, 3900, 'inOut(3)');
add('serviceCoverOpen', 0, 1, 4200, 4550, 'out(3)'); add('serviceCoverOpen', 1, 0, 5300, 5700, 'in(3)');
add('boardLift', 0, 1, 4300, 4700, 'out(3)'); add('boardLift', 1, 0, 5200, 5650, 'in(3)');
add('boardFlip', 0, 1, 4500, 4900, 'inOut(3)'); add('boardFlip', 1, 0, 5150, 5550, 'inOut(3)');
add('cadMix', 0, 1, 1000, 1250, 'inOut(3)'); add('cadMix', 1, 0, 5400, 5800, 'out(3)');
add('inkMix', 0, 1, 2050, 2350, 'inOut(3)'); add('inkMix', 1, 0, 5300, 5900, 'out(3)');
add('stageExpand', 0.1, 1, 150, 1200, 'inOut(3)'); add('stageExpand', 1, 0.25, 5550, 6200, 'out(3)');
add('blueprintLabels', 0, 1, 1250, 1500, 'out(3)'); add('blueprintLabels', 1, 0, 1900, 2200, 'in(3)');
add('inputCallouts', 0, 1, 2350, 2600, 'out(3)'); add('inputCallouts', 1, 0, 2950, 3200, 'in(3)');
add('computeCallouts', 0, 1, 4550, 4800, 'out(3)'); add('computeCallouts', 1, 0, 5200, 5500, 'in(3)');
add('lcdInteraction', 0, 1, 3250, 3850, 'inOut(3)'); add('lcdIntensity', 1, 0.45, 1000, 1250); add('lcdIntensity', 0.45, 1, 5600, 6200, 'out(3)');

export const KEYCAP_STAGGER = stagger(60, { from: 'center' });
export const MOTION_TRACKS = tracks;

const easeValue = (name, t) => {
  if (name === 'inOut(3)') return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  if (name === 'out(3)') return 1 - (1 - t) ** 3;
  if (name === 'in(3)') return t ** 3;
  return t;
};
export function evaluateMotion(time) {
  const t = Math.max(0, Math.min(TOTAL_TIME, time));
  const result = { ...initial };
  for (const track of tracks) {
    if (t <= track.start) { if (track.start === 0) result[track.property] = track.from; continue; }
    if (t >= track.end) { result[track.property] = track.to; continue; }
    const p = (t - track.start) / (track.end - track.start);
    result[track.property] = track.from + (track.to - track.from) * easeValue(track.ease, p);
  }
  return result;
}

export function shotAt(time) {
  const p = Math.max(0, Math.min(TOTAL_TIME, time));
  const found = SHOT_RANGES.find(([, start, end]) => p >= start && p <= end) || SHOT_RANGES.at(-1);
  return { id: found[0], progress: (p - found[1]) / (found[2] - found[1]) };
}

export function createFilmTimeline(filmRoot, onUpdate) {
  const scroll = onScroll({ target: filmRoot, enter: 'top top', leave: 'bottom bottom', sync: true });
  const tl = createTimeline({ autoplay: scroll, onUpdate });
  for (const track of tracks) {
    tl.add(motion, { [track.property]: [track.from, track.to], duration: track.end - track.start, ease: track.ease }, track.start);
  }
  return tl;
}
