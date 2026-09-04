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
  ['final', 14600, TOTAL_TIME],
];

export const motion = {
  filmTime: 0,
  cameraAzimuth: 24,
  cameraElevation: 30,
  cameraRadiusScale: 1.08,
  cameraFov: 34,
  framingX: .08,
  framingY: -.015,

  focusProduct: .45,
  focusDisplay: .55,
  focusKeyboard: 0,
  focusKnob: 0,
  focusMainboard: 0,

  productYaw: -.035,
  productPitch: .025,
  productRoll: 0,

  blueprintSeparation: 0,
  formReveal: 0,
  keycapLift: 0,
  knobRotation: 0,
  knobReveal: 0,
  displayInspect: 0,
  serviceCoverOpen: 0,
  boardLift: 0,
  boardFlip: 0,

  cadMix: 0,
  inkMix: 0,
  stageExpand: .08,
  stageStrength: .38,
  blueprintLabels: 0,
  inputCallouts: 0,
  computeCallouts: 0,
  lcdIntensity: .78,
  lcdInteraction: 0,
};

export const keycapMotion = Array.from({ length: 6 }, () => ({ lift: 0 }));

const INITIAL = { ...motion };
const TRACKS = [];
const add = (property, from, to, start, end, ease = 'inOut(3)') => {
  if (!(property in motion)) throw new Error(`Unknown film property: ${property}`);
  TRACKS.push({ property, from, to, start, end, ease });
};

// CAMERA DIRECTION
// Editorial beats are not camera cuts. The orbit only changes direction after a
// visible low-velocity hold, so stage/blueprint/form/input/control read as one shot.
add('cameraAzimuth', 24, 40, 0, 3200, 'inOut(2)');
add('cameraAzimuth', 40, 40, 3200, 3450, 'linear');
add('cameraAzimuth', 40, -14, 3450, 10100, 'inOut(2)');
add('cameraAzimuth', -14, -14, 10100, 10450, 'linear');
add('cameraAzimuth', -14, 58, 10450, 14500, 'inOut(2)');
add('cameraAzimuth', 58, 58, 14500, 14900, 'linear');
add('cameraAzimuth', 58, 30, 14900, 16800, 'inOut(2)');
add('cameraAzimuth', 30, 30, 16800, 17000, 'linear');

add('cameraElevation', 30, 26, 0, 3000, 'inOut(2)');
add('cameraElevation', 26, 42, 3000, 7600, 'inOut(2)');
add('cameraElevation', 42, 20, 7600, 11600, 'inOut(2)');
add('cameraElevation', 20, 54, 11600, 14500, 'inOut(2)');
add('cameraElevation', 54, 54, 14500, 14900, 'linear');
add('cameraElevation', 54, 28, 14900, 16800, 'inOut(2)');
add('cameraElevation', 28, 28, 16800, 17000, 'linear');

// CAMERA DISTANCE
// Dolly travel is longer than the previous six-shot implementation. Reversals
// happen inside a beat, not exactly on the editorial boundary.
add('cameraRadiusScale', 1.08, .96, 0, 2200, 'inOut(2)');
add('cameraRadiusScale', .96, 1.28, 2200, 4700, 'inOut(2)');
add('cameraRadiusScale', 1.28, .86, 4700, 6500, 'inOut(2)');
add('cameraRadiusScale', .86, .50, 6500, 8600, 'inOut(2)');
add('cameraRadiusScale', .50, .64, 8600, 10300, 'inOut(2)');
add('cameraRadiusScale', .64, .54, 10300, 12000, 'inOut(2)');
add('cameraRadiusScale', .54, .82, 12000, 13200, 'inOut(2)');
add('cameraRadiusScale', .82, .47, 13200, 14500, 'inOut(2)');
add('cameraRadiusScale', .47, .47, 14500, 14900, 'linear');
add('cameraRadiusScale', .47, 1.02, 14900, 16800, 'inOut(2)');
add('cameraRadiusScale', 1.02, 1.02, 16800, 17000, 'linear');

add('cameraFov', 34, 32, 6200, 8800, 'inOut(2)');
add('cameraFov', 32, 30, 10000, 12100, 'inOut(2)');
add('cameraFov', 30, 28, 12600, 14000, 'inOut(2)');
add('cameraFov', 28, 34, 14900, 16600, 'inOut(2)');

// SCREEN COMPOSITION
add('framingX', .08, .12, 0, 2500, 'inOut(2)');
add('framingX', .12, -.02, 2500, 5000, 'inOut(2)');
add('framingX', -.02, .14, 5000, 7200, 'inOut(2)');
add('framingX', .14, .17, 7200, 8700, 'inOut(2)');
add('framingX', .17, -.12, 8700, 10500, 'inOut(2)');
add('framingX', -.12, .10, 10500, 12100, 'inOut(2)');
add('framingX', .10, -.13, 12100, 14500, 'inOut(2)');
add('framingX', -.13, .08, 14900, 16800, 'inOut(2)');
add('framingY', -.015, .025, 2800, 5200, 'inOut(2)');
add('framingY', .025, -.035, 6200, 8800, 'inOut(2)');
add('framingY', -.035, .015, 8800, 12100, 'inOut(2)');
add('framingY', .015, .06, 12100, 14500, 'inOut(2)');
add('framingY', .06, -.015, 14900, 16800, 'inOut(2)');

// SEMANTIC FOCUS HANDOFFS
// Every local feature is entered and exited by weighted overlap. No beat id ever
// assigns a new lookAt target directly.
add('focusProduct', .45, .50, 0, 5000, 'inOut(2)');
add('focusDisplay', .55, .50, 0, 5000, 'inOut(2)');

add('focusProduct', .50, .78, 5000, 6200, 'inOut(3)');
add('focusDisplay', .50, .22, 5000, 6200, 'inOut(3)');

add('focusProduct', .78, .15, 6200, 7400, 'inOut(3)');
add('focusDisplay', .22, .05, 6200, 7400, 'inOut(3)');
add('focusKeyboard', 0, .88, 6200, 7400, 'inOut(3)');
add('focusKeyboard', .88, .88, 7400, 8200, 'linear');

add('focusKeyboard', .88, .08, 8200, 9200, 'inOut(3)');
add('focusKnob', 0, .58, 8200, 9200, 'inOut(3)');
add('focusDisplay', .05, .28, 8200, 9200, 'inOut(3)');
add('focusProduct', .15, .08, 8200, 9200, 'inOut(3)');

add('focusKnob', .58, .75, 9200, 9850, 'out(3)');
add('focusDisplay', .28, .35, 9200, 9850, 'out(3)');

add('focusKeyboard', .08, 0, 9850, 10800, 'inOut(3)');
add('focusKnob', .75, .06, 9850, 11100, 'inOut(3)');
add('focusDisplay', .35, .93, 9850, 11100, 'inOut(3)');
add('focusProduct', .08, .07, 9850, 11100, 'linear');

add('focusKnob', .06, 0, 11100, 12100, 'inOut(3)');
add('focusDisplay', .93, .93, 11100, 11600, 'linear');
add('focusDisplay', .93, .12, 11600, 12900, 'inOut(3)');
add('focusProduct', .07, .18, 11600, 12900, 'inOut(3)');
add('focusMainboard', 0, .82, 11600, 12900, 'inOut(3)');
add('focusMainboard', .82, 1, 12900, 13500, 'out(3)');
add('focusMainboard', 1, 1, 13500, 14500, 'linear');

add('focusMainboard', 1, 0, 14500, 16000, 'inOut(3)');
add('focusProduct', .18, .45, 14500, 16000, 'inOut(3)');
add('focusDisplay', .12, .55, 14500, 16000, 'inOut(3)');

// PRODUCT ORIENTATION — small counter-motion only.
add('productYaw', -.035, .065, 0, 5200, 'inOut(2)');
add('productYaw', .065, -.055, 5200, 10500, 'inOut(2)');
add('productYaw', -.055, -.10, 10500, 14500, 'inOut(2)');
add('productYaw', -.10, 0, 14900, 16800, 'inOut(2)');
add('productPitch', .025, .025, 0, 5000, 'linear');
add('productPitch', .025, -.025, 5000, 8800, 'inOut(2)');
add('productPitch', -.025, .015, 8800, 12100, 'inOut(2)');
add('productPitch', .015, -.06, 12100, 14500, 'inOut(2)');
add('productPitch', -.06, .025, 14900, 16800, 'inOut(2)');

// STAGE + MATERIAL LANGUAGE
add('stageExpand', .08, .72, 800, 3000, 'inOut(3)');
add('stageExpand', .72, 1, 3000, 3900, 'out(3)');
add('stageExpand', 1, .70, 4900, 6800, 'inOut(3)');
add('stageExpand', .70, .46, 6800, 8800, 'inOut(3)');
add('stageExpand', .46, .22, 9800, 11600, 'inOut(3)');
add('stageExpand', .22, .62, 11700, 13600, 'inOut(3)');
add('stageExpand', .62, .20, 14600, 16400, 'inOut(3)');
add('stageStrength', .38, .78, 800, 3900, 'inOut(3)');
add('stageStrength', .78, .48, 4900, 8800, 'inOut(3)');
add('stageStrength', .48, .72, 11700, 13600, 'inOut(3)');
add('stageStrength', .72, .35, 14600, 16400, 'inOut(3)');

add('cadMix', 0, 1, 2800, 3750, 'inOut(3)');
add('cadMix', 1, 1, 3750, 4550, 'linear');
add('cadMix', 1, .15, 4550, 6200, 'inOut(3)');
add('cadMix', .15, 0, 6200, 7000, 'inOut(3)');
add('inkMix', 0, .66, 4900, 6200, 'inOut(3)');
add('inkMix', .66, .86, 6200, 8800, 'inOut(3)');
add('inkMix', .86, .60, 8800, 12100, 'inOut(2)');
add('inkMix', .60, .82, 12100, 13600, 'inOut(3)');
add('inkMix', .82, 0, 14600, 16100, 'inOut(3)');

// SPARSE MECHANICAL REVEALS
add('blueprintSeparation', 0, 1, 3500, 4550, 'inOut(3)');
add('blueprintSeparation', 1, .34, 4550, 5550, 'inOut(3)');
add('blueprintSeparation', .34, 0, 5550, 6500, 'inOut(3)');
add('formReveal', 0, 1, 5200, 5900, 'inOut(3)');
add('formReveal', 1, 0, 6200, 6800, 'inOut(3)');

add('keycapLift', 0, 7.2, 7000, 7600, 'out(3)');
add('keycapLift', 7.2, 7.2, 7600, 8250, 'linear');
add('keycapLift', 7.2, 0, 8250, 8750, 'in(3)');

add('knobRotation', 0, Math.PI * 1.45, 9000, 10100, 'inOut(3)');
add('knobReveal', 0, 1, 9200, 9800, 'inOut(3)');
add('knobReveal', 1, 0, 10000, 10500, 'inOut(3)');
add('displayInspect', 0, 1, 10400, 11250, 'inOut(3)');
add('displayInspect', 1, 0, 11600, 12100, 'inOut(3)');

add('serviceCoverOpen', 0, 1, 12200, 13000, 'out(3)');
add('boardLift', 0, 1, 12600, 13500, 'out(3)');
add('boardFlip', 0, 1, 13200, 14000, 'inOut(3)');
add('boardFlip', 1, 0, 14600, 15300, 'inOut(3)');
add('boardLift', 1, 0, 15100, 15800, 'in(3)');
add('serviceCoverOpen', 1, 0, 15500, 16100, 'in(3)');

// LABELS + LCD
add('blueprintLabels', 0, 1, 3650, 4200, 'out(3)');
add('blueprintLabels', 1, 0, 4750, 5350, 'in(3)');
add('inputCallouts', 0, 1, 7350, 7800, 'out(3)');
add('inputCallouts', 1, 0, 8250, 8750, 'in(3)');
add('computeCallouts', 0, 1, 13500, 14000, 'out(3)');
add('computeCallouts', 1, 0, 14500, 15100, 'in(3)');

add('lcdIntensity', .78, .58, 2800, 3900, 'inOut(3)');
add('lcdIntensity', .58, .88, 6200, 8800, 'inOut(3)');
add('lcdInteraction', 0, 1, 9000, 10300, 'inOut(3)');
add('lcdInteraction', 1, .35, 10300, 11100, 'inOut(3)');
add('lcdInteraction', .35, .75, 11100, 12000, 'inOut(3)');
add('lcdInteraction', .75, .28, 12100, 14100, 'inOut(3)');
add('lcdInteraction', .28, .65, 15100, 16400, 'inOut(3)');
add('lcdIntensity', .88, 1, 15100, 16400, 'inOut(3)');

export const MOTION_TRACKS = Object.freeze(TRACKS.map((track) => Object.freeze({ ...track })));

const easeValue = (name, t) => {
  if (name === 'inOut(2)') return t < .5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  if (name === 'inOut(3)') return t < .5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
  if (name === 'out(3)') return 1 - (1 - t) ** 3;
  if (name === 'in(3)') return t ** 3;
  return t;
};

export function evaluateMotion(time) {
  const t = Math.max(0, Math.min(TOTAL_TIME, Number(time) || 0));
  const result = { ...INITIAL, filmTime: t };
  for (const track of MOTION_TRACKS) {
    if (t < track.start) continue;
    if (t >= track.end || track.start === track.end) {
      result[track.property] = track.to;
      continue;
    }
    const p = (t - track.start) / (track.end - track.start);
    result[track.property] = track.from + (track.to - track.from) * easeValue(track.ease, p);
  }
  return result;
}

export function beatAt(time) {
  const t = Math.max(0, Math.min(TOTAL_TIME, Number(time) || 0));
  const beat = BEAT_RANGES.find(([, start, end], index) => t >= start && (t < end || index === BEAT_RANGES.length - 1)) || BEAT_RANGES.at(-1);
  return {
    id: beat[0],
    progress: Math.max(0, Math.min(1, (t - beat[1]) / Math.max(1, beat[2] - beat[1]))),
  };
}

export function createFilmTimeline(filmRoot, onUpdate = () => {}) {
  Object.assign(motion, INITIAL);
  keycapMotion.forEach((item) => { item.lift = 0; });

  const scroll = onScroll({
    target: filmRoot,
    enter: 'top top',
    leave: 'bottom bottom',
    sync: true,
  });
  const timeline = createTimeline({ autoplay: scroll, onUpdate });

  for (const [id, start] of BEAT_RANGES) timeline.label(id, start);
  timeline.add(motion, { filmTime: [0, TOTAL_TIME], duration: TOTAL_TIME, ease: 'linear' }, 0);

  for (const track of MOTION_TRACKS) {
    timeline.add(motion, {
      [track.property]: [track.from, track.to],
      duration: track.end - track.start,
      ease: track.ease,
    }, track.start);
  }

  // Anime.js itself phases the six physical keys. This is not a decorative DOM
  // animation; the values are read by the Three.js part transform path.
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
