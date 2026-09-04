import { createTimeline, onScroll, stagger } from 'animejs';

export const motion = {
  filmProgress: 0,
  cameraAzimuth: 28,
  cameraElevation: 28,
  cameraRadiusScale: 1,
  cameraFov: 34,
  focusDisplay: 1,
  focusKeyboard: 0,
  focusKnob: 0,
  focusMainboard: 0,
  blueprintSeparation: 0,
  keycapLift: 0,
  keycapSequence: 0,
  knobRotation: 0,
  serviceCoverOpen: 0,
  boardLift: 0,
  boardFlip: 0,
  cadMix: 0,
  inkMix: 0,
  stageExpand: 0,
  blueprintLabels: 0,
  inputCallouts: 0,
  computeCallouts: 0,
  lcdIntensity: 1,
  lcdInteraction: 0,
};

export const SHOT_RANGES = [
  ['hero', 0, 1000],
  ['blueprint', 1000, 2000],
  ['input', 2000, 3000],
  ['control', 3000, 4000],
  ['compute', 4000, 5200],
  ['final', 5200, 6500],
];

const addTrack = (tl, prop, from, to, duration, position, ease = 'linear') => {
  tl.add(motion, { [prop]: to, duration, ease }, position);
  motion[prop] = from;
};

export function createFilmTimeline(filmRoot, onUpdate) {
  const scroll = onScroll({ target: filmRoot, enter: 'top top', leave: 'bottom bottom', sync: true });
  const tl = createTimeline({ autoplay: scroll, onUpdate });
  addTrack(tl, 'filmProgress', 0, 1000, 1000, 0, 'linear');
  addTrack(tl, 'filmProgress', 1000, 2000, 1000, 1000, 'linear');
  addTrack(tl, 'filmProgress', 2000, 3000, 1000, 2000, 'linear');
  addTrack(tl, 'filmProgress', 3000, 4000, 1000, 3000, 'linear');
  addTrack(tl, 'filmProgress', 4000, 5200, 1200, 4000, 'linear');
  addTrack(tl, 'filmProgress', 5200, 6500, 1300, 5200, 'linear');
  // Meaningful product tracks are timeline-owned; they are applied by the existing Three.js scene consumer.
  addTrack(tl, 'blueprintSeparation', 0, 1, 700, 1100, 'inOut(3)');
  addTrack(tl, 'keycapLift', 0, 8, 500, 2250, 'out(3)');
  addTrack(tl, 'knobRotation', 0, Math.PI * 1.6, 700, 3250, 'inOut(3)');
  addTrack(tl, 'boardLift', 0, 1, 450, 4300, 'out(3)');
  addTrack(tl, 'boardFlip', 0, 1, 500, 4550, 'inOut(3)');
  addTrack(tl, 'cadMix', 0, 1, 220, 1000, 'inOut(3)');
  addTrack(tl, 'cadMix', 1, 0, 500, 5450, 'out(3)');
  addTrack(tl, 'stageExpand', 0.1, 1, 800, 200, 'inOut(3)');
  addTrack(tl, 'stageExpand', 1, 0.25, 700, 5600, 'out(3)');
  addTrack(tl, 'lcdInteraction', 0, 1, 600, 3300, 'inOut(3)');
  return tl;
}

export function shotAt(progress) {
  const p = Math.max(0, Math.min(6500, progress));
  const found = SHOT_RANGES.find(([, start, end]) => p >= start && p <= end) || SHOT_RANGES.at(-1);
  return { id: found[0], progress: (p - found[1]) / (found[2] - found[1]) };
}

export { stagger };
