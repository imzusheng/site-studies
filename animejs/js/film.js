import { createTimeline, onScroll, stagger } from 'animejs';

export const TOTAL_TIME = 17000;

export const BEAT_RANGES = [
  ['hero', 0, 1900],
  ['stage', 1900, 3300],
  ['blueprint', 3300, 5200],
  ['form', 5200, 6800],
  ['input', 6800, 8800],
  ['control', 8800, 10400],
  ['display', 10400, 12100],
  ['compute', 12100, 14600],
  ['final', 14600, 17000],
];

export const motion = {
  filmTime: 0,
  cameraAzimuth: 24,
  cameraElevation: 30,
  cameraRadiusScale: 1.08,
  cameraFov: 34,
  framingX: 0.08,
  framingY: -0.015,
  focusProduct: 0.45,
  focusDisplay: 0.55,
  focusKeyboard: 0,
  focusKnob: 0,
  focusMainboard: 0,
  productYaw: -0.035,
  productPitch: 0.025,
  productRoll: 0,
  blueprintSeparation: 0,
  formReveal: 0,
  keycapLift: 0,
  knobRotation: 0,
  knobReveal: 0,
  serviceCoverOpen: 0,
  boardLift: 0,
  boardFlip: 0,
  cadMix: 0,
  inkMix: 0,
  stageExpand: 0.08,
  stageStrength: 0.38,
  blueprintLabels: 0,
  inputCallouts: 0,
  computeCallouts: 0,
  lcdIntensity: 0.78,
  lcdInteraction: 0,
  displayInspect: 0,
};

export const keycapMotion = Array.from({ length: 6 }, () => ({ lift: 0 }));

const INITIAL = { ...motion };
const TRACKS = [];
const add = (property, from, to, start, end, ease = 'inOut(3)') => {
  TRACKS.push({ property, from, to, start, end, ease });
};

// Camera — long travel, intentional stops before reversals, no shot-boundary pose switches.
add('cameraAzimuth', 24, 35, 0, 1900, 'inOut(3)');
add('cameraAzimuth', 35, 42, 1900, 3300, 'inOut(3)');
add('cameraAzimuth', 42, 25, 3300, 5200, 'inOut(3)');
add('cameraAzimuth', 25, -8, 5200, 6800, 'inOut(3)');
add('cameraAzimuth', -8, 18, 6800, 8800, 'inOut(3)');
add('cameraAzimuth', 18, -12, 8800, 10400, 'inOut(3)');
add('cameraAzimuth', -12, 8, 10400, 12100, 'inOut(3)');
add('cameraAzimuth', 8, 55, 12100, 14600, 'inOut(3)');
add('cameraAzimuth', 55, 30, 14600, 17000, 'inOut(3)');

add('cameraElevation', 30, 25, 0, 1900);
add('cameraElevation', 25, 27, 1900, 3300);
add('cameraElevation', 27, 38, 3300, 5200);
add('cameraElevation', 38, 22, 5200, 6800);
add('cameraElevation', 22, 42, 6800, 8800);
add('cameraElevation', 42, 27, 8800, 10400);
add('cameraElevation', 27, 18, 10400, 12100);
add('cameraElevation', 18, 52, 12100, 14600);
add('cameraElevation', 52, 28, 14600, 17000);

add('cameraRadiusScale', 1.08, 0.94, 0, 1900);
add('cameraRadiusScale', 0.94, 1.02, 1900, 3300);
add('cameraRadiusScale', 1.02, 1.34, 3300, 5200);
add('cameraRadiusScale', 1.34, 0.86, 5200, 6800);
add('cameraRadiusScale', 0.86, 0.50, 6800, 8800);
add('cameraRadiusScale', 0.50, 0.64, 8800, 10400);
add('cameraRadiusScale', 0.64, 0.53, 10400, 12100);
add('cameraRadiusScale', 0.53, 0.78, 12100, 13000, 'out(3)');
add('cameraRadiusScale', 0.78, 0.48, 13000, 14600, 'inOut(3)');
add('cameraRadiusScale', 0.48, 1.02, 14600, 16600, 'inOut(3)');
add('cameraRadiusScale', 1.02, 1.02, 16600, 17000, 'linear');

add('cameraFov', 34, 32, 6500, 8800);
add('cameraFov', 32, 30, 10400, 14600);
add('cameraFov', 30, 34, 14600, 16600);

// Composition. The semantic target blends continuously; no target is switched by beat id.
add('focusProduct', .45, .50, 0, 5200);
add('focusDisplay', .55, .50, 0, 5200);
add('focusProduct', .50, .78, 5200, 6300);
add('focusDisplay', .50, .22, 5200, 6300);
add('focusProduct', .78, .15, 6300, 7350);
add('focusDisplay', .22, 0, 6300, 7350);
add('focusKeyboard', 0, .85, 6300, 7350);
add('focusKeyboard', .85, .08, 8300, 9300);
add('focusKnob', 0, .52, 8300, 9300);
add('focusDisplay', 0, .33, 8300, 9300);
add('focusProduct', .15, .07, 8300, 9300);
add('focusKnob', .52, .08, 10000, 11100);
add('focusDisplay', .33, .85, 10000, 11100);
add('focusProduct', .07, .07, 10000, 11100);
add('focusDisplay', .85, .12, 11700, 12850);
add('focusProduct', .07, .18, 11700, 12850);
add('focusMainboard', 0, .70, 11700, 12850);
add('focusMainboard', .70, 0, 14600, 16050);
add('focusProduct', .18, .45, 14600, 16050);
add('focusDisplay', .12, .55, 14600, 16050);

add('framingX', .08, .12, 0, 1900);
add('framingX', .12, 0, 2400, 4300);
add('framingX', 0, .12, 5200, 6800);
add('framingX', .12, .16, 6800, 8800);
add('framingX', .16, -.12, 8800, 10400);
add('framingX', -.12, .10, 10400, 12100);
add('framingX', .10, -.13, 12100, 14600);
add('framingX', -.13, .08, 14600, 16600);
add('framingY', -.015, .02, 3300, 5200);
add('framingY', .02, -.03, 6800, 8800);
add('framingY', -.03, .02, 12100, 14600);
add('framingY', .02, -.015, 14600, 16600);

// Product motion remains secondary to camera motion.
add('productYaw', -.035, .055, 0, 3300);
add('productYaw', .055, .12, 3300, 5200);
add('productYaw', .12, -.05, 5200, 8800);
add('productYaw', -.05, .035, 8800, 12100);
add('productYaw', .035, -.09, 12100, 14600);
add('productYaw', -.09, 0, 14600, 16600);
add('productPitch', .025, .025, 0, 5200, 'linear');
add('productPitch', .025, -.025, 5200, 8800);
add('productPitch', -.025, .015, 8800, 12100);
add('productPitch', .015, -.06, 12100, 14600);
add('productPitch', -.06, .025, 14600, 16600);

// Stage / materials. All transitions span substantial scroll distance.
add('stageExpand', .08, .72, 900, 3000);
add('stageExpand', .72, 1, 3000, 3900, 'out(3)');
add('stageExpand', 1, .70, 5000, 6800);
add('stageExpand', .70, .46, 6800, 8800);
add('stageExpand', .46, .22, 9800, 11600);
add('stageExpand', .22, .62, 11700, 13600);
add('stageExpand', .62, .20, 14600, 16400);
add('stageStrength', .38, .78, 900, 3900);
add('stageStrength', .78, .48, 5000, 8800);
add('stageStrength', .48, .72, 11700, 13600);
add('stageStrength', .72, .35, 14600, 16400);

add('cadMix', 0, 1, 2850, 3750);
add('cadMix', 1, .15, 4800, 6200);
add('cadMix', .15, 0, 6200, 7000);
add('inkMix', 0, .66, 5000, 6200);
add('inkMix', .66, .86, 6200, 8800);
add('inkMix', .86, .60, 8800, 12100);
add('inkMix', .60, .82, 12100, 13600);
add('inkMix', .82, 0, 14600, 16100);

// Mechanical explanations. Most of the film is assembled.
add('blueprintSeparation', 0, 1, 3500, 4550);
add('blueprintSeparation', 1, .34, 4550, 5550);
add('blueprintSeparation', .34, 0, 5550, 6500);
add('formReveal', 0, 1, 5200, 5900);
add('formReveal', 1, 0, 6200, 6800);
add('keycapLift', 0, 7.2, 7000, 7600, 'out(3)');
add('keycapLift', 7.2, 7.2, 7600, 8250, 'linear');
add('keycapLift', 7.2, 0, 8250, 8750, 'in(3)');
add('knobRotation', 0, Math.PI * 1.45, 9000, 10100, 'inOut(3)');
add('knobReveal', 0, 1, 9200, 9800);
add('knobReveal', 1, 0, 10000, 10500);
add('displayInspect', 0, 1, 10400, 11250);
add('displayInspect', 1, 0, 11600, 12100);
add('serviceCoverOpen', 0, 1, 12200, 13000, 'out(3)');
add('boardLift', 0, 1, 12600, 13500, 'out(3)');
add('boardFlip', 0, 1, 13200, 14000, 'inOut(3)');
add('boardFlip', 1, 0, 14600, 15300, 'inOut(3)');
add('boardLift', 1, 0, 15100, 15800, 'in(3)');
add('serviceCoverOpen', 1, 0, 15500, 16100, 'in(3)');

add('blueprintLabels', 0, 1, 3650, 4200, 'out(3)');
add('blueprintLabels', 1, 0, 4750, 5350, 'in(3)');
add('inputCallouts', 0, 1, 7350, 7800, 'out(3)');
add('inputCallouts', 1, 0, 8250, 8750, 'in(3)');
add('computeCallouts', 0, 1, 13500, 14000, 'out(3)');
add('computeCallouts', 1, 0, 14500, 15100, 'in(3)');

add('lcdIntensity', .78, .58, 2850, 3900);
add('lcdIntensity', .58, .88, 6200, 8800);
add('lcdInteraction', 0, 1, 9000, 10300);
add('lcdInteraction', 1, .35, 10300, 11100);
add('lcdInteraction', .35, .75, 11100, 12000);
add('lcdInteraction', .75, .28, 12100, 14100);
add('lcdInteraction', .28, .65, 15100, 16400);
add('lcdIntensity', .88, 1, 15100, 16400);

export const MOTION_TRACKS = TRACKS;

const easeValue = (name, t) => {
  if (name === 'inOut(3)') return t < .5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
  if (name === 'out(3)') return 1 - (1 - t) ** 3;
  if (name === 'in(3)') return t ** 3;
  return t;
};

export function evaluateMotion(time) {
  const t = Math.max(0, Math.min(TOTAL_TIME, time));
  const result = { ...INITIAL, filmTime: t };
  for (const track of TRACKS) {
    if (t <= track.start) {
      if (track.start === 0) result[track.property] = track.from;
      continue;
    }
    if (t >= track.end) {
      result[track.property] = track.to;
      continue;
    }
    const p = (t - track.start) / (track.end - track.start);
    result[track.property] = track.from + (track.to - track.from) * easeValue(track.ease, p);
  }
  return result;
}

export function beatAt(time) {
  const t = Math.max(0, Math.min(TOTAL_TIME, time));
  const beat = BEAT_RANGES.find(([, start, end], index) => t >= start && (t < end || index === BEAT_RANGES.length - 1)) || BEAT_RANGES.at(-1);
  return { id: beat[0], progress: Math.max(0, Math.min(1, (t - beat[1]) / (beat[2] - beat[1]))) };
}

export function createFilmTimeline(filmRoot, onUpdate) {
  Object.assign(motion, INITIAL);
  keycapMotion.forEach((item) => { item.lift = 0; });
  const scroll = onScroll({ target: filmRoot, enter: 'top top', leave: 'bottom bottom', sync: true });
  const timeline = createTimeline({ autoplay: scroll, onUpdate });
  timeline.add(motion, { filmTime: [0, TOTAL_TIME], duration: TOTAL_TIME, ease: 'linear' }, 0);
  for (const track of TRACKS) {
    timeline.add(motion, {
      [track.property]: [track.from, track.to],
      duration: track.end - track.start,
      ease: track.ease,
    }, track.start);
  }
  // Real Anime.js stagger drives the six physical keycap proxy tracks.
  timeline.add(keycapMotion, {
    lift: [0, 1],
    duration: 720,
    delay: stagger(95, { from: 'center' }),
    ease: 'out(3)',
  }, 7000);
  timeline.add(keycapMotion, {
    lift: 0,
    duration: 520,
    delay: stagger(65, { from: 'center' }),
    ease: 'in(3)',
  }, 8250);
  return timeline;
}
