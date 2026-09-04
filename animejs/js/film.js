import { createTimeline, onScroll } from 'animejs';

// A single clockwise camera path keeps spatial memory intact while the product changes state.
export const SHOTS = Object.freeze([
  { id: 'teaser', duration: 1250, label: '完整控制面', target: 'product', focus: 'product', az: 18, el: 47, radius: .68, fov: 27, frameX: 0, frameY: .34, look: 'teaser', bg: 0x010203, ui: 0, line: 0 },
  { id: 'reveal', duration: 1200, label: '实体控制', target: 'product', focus: 'product', az: 24, el: 36, radius: .92, fov: 28, frameX: -.12, frameY: .01, look: 'product', bg: 0x0d1114, ui: 0, line: 0 },
  { id: 'controls', duration: 1000, label: '三种输入', target: 'product', focus: 'input', az: 30, el: 44, radius: .84, fov: 29, frameX: .13, frameY: .02, look: 'product', bg: 0x17191a, ui: 0, line: .08 },
  { id: 'knob', duration: 950, label: 'EC11 旋钮', target: 'product', focus: 'control', az: 36, el: 50, radius: .62, fov: 29, frameX: -.20, frameY: .02, look: 'product', bg: 0x151718, ui: 0, line: .06 },
  { id: 'keypress', duration: 950, label: '低矮机械键', target: 'product', focus: 'input', az: 42, el: 42, radius: .64, fov: 27, frameX: .20, frameY: -.02, look: 'product', bg: 0x0c1012, ui: 0, line: .10 },
  { id: 'ha', duration: 1000, label: 'Home Assistant', target: 'product', focus: 'display', az: 48, el: 40, radius: .66, fov: 27, frameX: -.21, frameY: 0, look: 'product', bg: 0x09151c, ui: 0, line: .08 },
  { id: 'turn', duration: 900, label: '结构轮廓', target: 'product', focus: 'product', az: 54, el: 35, radius: 1.00, fov: 30, frameX: .10, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: 1 },
  { id: 'xray', duration: 1050, label: '内部层级', target: 'product', focus: 'product', az: 60, el: 34, radius: 1.20, fov: 30, frameX: -.55, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: 1 },
  { id: 'safe-open', duration: 1250, label: '装配边界', target: 'product', focus: 'product', az: 66, el: 32, radius: 1.18, fov: 31, frameX: .30, frameY: .02, look: 'technical', bg: 0x162127, ui: 0, line: .56 },
  { id: 'explode', duration: 1450, label: '231 对象', target: 'product', focus: 'product', az: 72, el: 29, radius: 1.38, fov: 33, frameX: -.30, frameY: 0, look: 'technical', bg: 0x252e33, ui: 0, line: .30 },
  { id: 'core-out', duration: 1050, label: '计算核心', target: 'compute', focus: 'compute', az: 78, el: 32, radius: .94, fov: 29, frameX: .20, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: .86 },
  { id: 'board', duration: 1300, label: 'ESP32-S3-LCD-2', target: 'compute', focus: 'compute', az: 84, el: 33, radius: .76, fov: 28, frameX: -.30, frameY: -.03, look: 'technical', bg: 0xd8d4cc, ui: 1, line: .78 },
  { id: 'display-stack', duration: 1150, label: '显示堆栈', target: 'compute', focus: 'display', az: 90, el: 35, radius: 1.08, fov: 29, frameX: .36, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: 1 },
  { id: 'lcd', duration: 1100, label: '2.0 英寸 LCD', target: 'compute', focus: 'display', az: 96, el: 42, radius: .84, fov: 28, frameX: -.28, frameY: 0, look: 'technical', bg: 0x0c202a, ui: 0, line: .10 },
  { id: 'cpu', duration: 1250, label: 'ESP32-S3 与存储', target: 'compute', focus: 'cpu', az: 102, el: 34, radius: .82, fov: 27, frameX: .30, frameY: .02, look: 'technical', bg: 0xd8d4cc, ui: 1, line: .92 },
  { id: 'wireless', duration: 1150, label: '无线与 HA', target: 'compute', focus: 'compute', az: 108, el: 33, radius: .86, fov: 28, frameX: -.22, frameY: 0, look: 'technical', bg: 0xcbd3d3, ui: 1, line: .72 },
  { id: 'imu', duration: 1050, label: 'QMI8658', target: 'compute', focus: 'imu', az: 114, el: 34, radius: .80, fov: 27, frameX: .28, frameY: .02, look: 'technical', bg: 0xd8d4cc, ui: 1, line: 1 },
  { id: 'storage', duration: 1100, label: 'MicroSD 与 USB-C', target: 'compute', focus: 'io', az: 120, el: 31, radius: .82, fov: 27, frameX: -.26, frameY: 0, look: 'technical', bg: 0xc8cecc, ui: 1, line: .86 },
  { id: 'headers', duration: 1100, label: '扩展接口', target: 'compute', focus: 'headers', az: 126, el: 31, radius: .88, fov: 28, frameX: .26, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: .90 },
  { id: 'power', duration: 1150, label: '电源系统', target: 'power', focus: 'power', az: 132, el: 30, radius: .74, fov: 28, frameX: -.34, frameY: 0, look: 'technical', bg: 0x171c1f, ui: 0, line: .42 },
  { id: 'input-pcb', duration: 1150, label: '输入矩阵', target: 'inputBoards', focus: 'input-pcb', az: 138, el: 33, radius: .92, fov: 29, frameX: .32, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: .86 },
  { id: 'printable', duration: 1450, label: '11 个可打印件', target: 'product', focus: 'printable', az: 144, el: 68, radius: 1.40, fov: 31, frameX: -.38, frameY: 0, look: 'technical', bg: 0xd8d4cc, ui: 1, line: 1 },
  { id: 'reassemble', duration: 1800, label: '一体结构', target: 'product', focus: 'product', az: 144, el: 68, radius: 1.40, fov: 31, frameX: -.38, frameY: 0, look: 'technical', bg: 0x151d21, ui: 0, line: 1 },
  { id: 'final', duration: 1300, label: '完整形态', target: 'product', focus: 'product', az: 150, el: 31, radius: 1.02, fov: 28, frameX: -.28, frameY: .02, look: 'teaser', bg: 0x020405, ui: 0, line: 0 },
]);

let cursor = 0;
export const BEAT_RANGES = Object.freeze(SHOTS.map((shot) => {
  const range = Object.freeze([shot.id, cursor, cursor + shot.duration]);
  cursor += shot.duration;
  return range;
}));
export const TOTAL_TIME = cursor;

export const motion = { filmTime: 0 };

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = (a, b, value) => {
  const t = clamp01((value - a) / Math.max(.0001, b - a));
  return t * t * (3 - 2 * t);
};
const actionPulse = (value) => value < .58
  ? smooth(.34, .58, value)
  : 1 - smooth(.68, .86, value);

export function beatAt(time) {
  const t = Math.max(0, Math.min(TOTAL_TIME, Number(time) || 0));
  const index = BEAT_RANGES.findIndex(([, start, end], i) => t >= start && (t < end || i === BEAT_RANGES.length - 1));
  const range = BEAT_RANGES[Math.max(0, index)];
  return {
    id: range[0],
    index: Math.max(0, index),
    progress: clamp01((t - range[1]) / Math.max(1, range[2] - range[1])),
    shot: SHOTS[Math.max(0, index)],
  };
}

export function evaluateMotion(time) {
  const beat = beatAt(time);
  const { shot, index, progress } = beat;
  const previous = index > 0 ? SHOTS[index - 1] : shot;
  const cameraTransition = smooth(0, .28, progress);
  const sceneTransition = smooth(0, .34, progress);

  let controlLift = 0;
  let controlFan = 0;
  let shellOpen = 0;
  let switchOpen = 0;
  let internalOpen = 0;

  if (index === 8) {
    controlLift = smooth(.34, .48, progress);
    shellOpen = smooth(.58, .78, progress);
  } else if (index >= 9 && index <= 21) {
    controlLift = 1;
    shellOpen = 1;
    controlFan = index === 9 ? smooth(.34, .48, progress) : 1;
    switchOpen = index === 9 ? smooth(.52, .64, progress) : 1;
    internalOpen = index === 9 ? smooth(.68, .88, progress) : 1;
  } else if (index === 22) {
    controlLift = 1 - smooth(.92, 1, progress);
    shellOpen = 1 - smooth(.80, .90, progress);
    controlFan = 1 - smooth(.70, .78, progress);
    switchOpen = 1 - smooth(.60, .68, progress);
    internalOpen = 1 - smooth(.42, .58, progress);
  }

  let componentSpread = 0;
  if (index === 11) componentSpread = smooth(.34, .78, progress);
  else if (index >= 12 && index <= 21) componentSpread = 1;
  else if (index === 22) componentSpread = 1 - smooth(.16, .28, progress);

  let displayLayer = 0;
  if (index === 12) displayLayer = smooth(.34, .72, progress);
  else if (index === 13) displayLayer = 1 - smooth(.64, .86, progress);

  let computeTurn = 0;
  if (index === 14) computeTurn = smooth(.34, .72, progress);
  else if (index >= 15 && index <= 21) computeTurn = 1;
  else if (index === 22) computeTurn = 1 - smooth(.30, .40, progress);

  let printableLayout = 0;
  if (index === 21) printableLayout = smooth(.34, .60, progress);
  else if (index === 22) printableLayout = 1 - smooth(.02, .14, progress);

  const weight = (item, look) => item.look === look ? 1 : 0;
  const lcdLevel = (item) => item.id === 'teaser' ? .30 : ['ha', 'lcd'].includes(item.id) ? 1 : .66;
  const keyLevel = (item) => item.id === 'teaser' ? .12 : ['controls', 'keypress'].includes(item.id) ? .50 : .14;
  const lineArt = mix(previous.line, shot.line, sceneTransition);
  let shellOpacity = 1;
  if (index === 7) shellOpacity = mix(1, .22, smooth(.34, .78, progress));
  else if (index >= 8 && index <= 21) shellOpacity = .22;
  else if (index === 22) shellOpacity = mix(.22, 1, 1 - shellOpen);

  return {
    filmTime: Math.max(0, Math.min(TOTAL_TIME, Number(time) || 0)),
    shotId: shot.id,
    shotIndex: index,
    shotProgress: progress,
    cameraTargetFrom: previous.target,
    cameraTarget: shot.target,
    cameraTargetMix: cameraTransition,
    cameraAzimuth: mix(previous.az, shot.az, cameraTransition),
    cameraElevation: mix(previous.el, shot.el, cameraTransition),
    cameraRadiusScale: mix(previous.radius, shot.radius, cameraTransition),
    cameraFov: mix(previous.fov, shot.fov, cameraTransition),
    framingX: mix(previous.frameX, shot.frameX, cameraTransition),
    framingY: mix(previous.frameY, shot.frameY, cameraTransition),
    teaserMix: mix(weight(previous, 'teaser'), weight(shot, 'teaser'), sceneTransition),
    technicalMix: mix(weight(previous, 'technical'), weight(shot, 'technical'), sceneTransition),
    backgroundFrom: previous.bg,
    backgroundTo: shot.bg,
    backgroundMix: sceneTransition,
    uiLightMix: mix(previous.ui, shot.ui, sceneTransition),
    lineArt,
    focusFrom: previous.focus,
    focus: shot.focus,
    focusMix: sceneTransition,
    controlLift,
    controlFan,
    shellOpen,
    switchOpen,
    internalOpen,
    displayLayer,
    componentSpread,
    computeTurn,
    computeExplode: internalOpen,
    powerExplode: internalOpen,
    inputExplode: internalOpen,
    printableLayout,
    keyPress: index === 4 ? -1.2 * actionPulse(progress) : 0,
    knobRotation: index === 3 ? Math.PI * .55 * actionPulse(progress) : 0,
    shellOpacity,
    edgeMix: Math.max(lineArt, mix(weight(previous, 'technical'), weight(shot, 'technical'), sceneTransition) * .34),
    lcdIntensity: mix(lcdLevel(previous), lcdLevel(shot), sceneTransition),
    keyGlow: mix(keyLevel(previous), keyLevel(shot), sceneTransition),
  };
}

export function createFilmTimeline(filmRoot, onUpdate = () => {}) {
  motion.filmTime = 0;
  const scroll = onScroll({ target: filmRoot, enter: 'top top', leave: 'bottom bottom', sync: true });
  const timeline = createTimeline({ autoplay: scroll, onUpdate });
  for (const [id, start] of BEAT_RANGES) timeline.label(id, start);
  timeline.add(motion, { filmTime: [0, TOTAL_TIME], duration: TOTAL_TIME, ease: 'linear' }, 0);
  return timeline;
}
