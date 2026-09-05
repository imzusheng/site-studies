import { BEAT_RANGES, SHOTS, TOTAL_TIME, beatAt } from './film.js';
import { A340_PROFILE } from './model-profile.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / Math.max(.0001, b - a));
  return t * t * (3 - 2 * t);
};

const CALLOUTS = Object.freeze({
  xray: [
    { role: 'activeGlass', label: '2.0 英寸显示屏', x: .07, y: .29, align: 'left' },
    { role: 'mainboard', label: 'ESP32-S3 计算板', x: .07, y: .38, align: 'left' },
    { role: 'inputBoards', label: '双三键输入矩阵', x: .07, y: .47, align: 'left' },
    { role: 'lipo', label: '薄型锂电池', x: .07, y: .56, align: 'left' },
  ],
  'safe-open': [
    { role: 'keycapFocus', label: '独立功能键帽', x: .71, y: .28, align: 'right' },
    { role: 'upperShell', label: '一体上壳', x: .71, y: .38, align: 'right' },
    { role: 'switches', label: 'CHOC V2 键轴', x: .71, y: .48, align: 'right' },
  ],
  explode: [
    { role: 'upperShell', label: 'ENCLOSURE', x: .07, y: .28, align: 'left' },
    { role: 'mainboard', label: 'COMPUTE · 137', x: .07, y: .38, align: 'left' },
    { role: 'inputBoards', label: 'INPUT · 54', x: .07, y: .48, align: 'left' },
    { role: 'powerBoard', label: 'POWER · 22', x: .07, y: .58, align: 'left' },
  ],
  board: [
    { role: 'cpu', label: 'ESP32-S3R8', x: .07, y: .26, align: 'left' },
    { role: 'flash', label: '16MB FLASH', x: .07, y: .35, align: 'left' },
    { role: 'imu', label: 'QMI8658 IMU', x: .07, y: .44, align: 'left' },
    { role: 'usb', label: 'USB-C', x: .07, y: .53, align: 'left' },
  ],
  'display-stack': [
    { role: 'activeGlass', label: 'ACTIVE GLASS', x: .92, y: .30, align: 'right' },
    { role: 'displayModule', label: 'BACKLIGHT / LCD', x: .92, y: .41, align: 'right' },
    { role: 'mainboard', label: 'MAIN PCB', x: .92, y: .52, align: 'right' },
  ],
  cpu: [
    { role: 'cpu', label: 'ESP32-S3R8 · 8MB PSRAM', x: .92, y: .34, align: 'right' },
    { role: 'flash', label: '16MB FLASH', x: .92, y: .46, align: 'right' },
  ],
  wireless: [
    { role: 'mainboard', label: 'WI-FI', x: .07, y: .34, align: 'left' },
    { role: 'activeGlass', label: '状态同步回屏幕', x: .07, y: .46, align: 'left' },
  ],
  imu: [
    { role: 'imu', label: 'QMI8658 IMU', x: .92, y: .39, align: 'right' },
  ],
  storage: [
    { role: 'microsd', label: 'MICROSD', x: .07, y: .35, align: 'left' },
    { role: 'usb', label: 'USB-C', x: .07, y: .47, align: 'left' },
  ],
  headers: [
    { role: 'batteryHeader', label: 'BATTERY HEADER', x: .92, y: .44, align: 'right' },
    { role: 'mainboard', label: 'GPIO HEADERS', x: .92, y: .55, align: 'right' },
  ],
  power: [
    { role: 'lipo', label: '3.7V THIN LIPO', x: .07, y: .34, align: 'left' },
    { role: 'powerBoard', label: 'PROTECTION / FUEL GAUGE', x: .07, y: .46, align: 'left' },
  ],
  'input-pcb': [
    { role: 'inputBoards', label: '2 × 3-KEY MATRIX PCB', x: .92, y: .34, align: 'right' },
    { role: 'switches', label: '6 × CHOC V2', x: .92, y: .46, align: 'right' },
  ],
  printable: [
    { role: 'upperShell', label: 'UPPER SHELL', x: .07, y: .28, align: 'left' },
    { role: 'screenBezel', label: 'SCREEN BEZEL', x: .07, y: .38, align: 'left' },
    { role: 'knob', label: 'EC11 KNOB', x: .07, y: .48, align: 'left' },
    { role: 'keycapFocus', label: '6 × KEYCAP', x: .07, y: .58, align: 'left' },
  ],
});

export function createFilmUi(engine) {
  const panels = [...document.querySelectorAll('.beat-panel')];
  const calloutNodes = [...document.querySelectorAll('.part-callout')];
  const profile = document.getElementById('film-profile');
  const shotLabel = document.getElementById('film-shot');
  const bar = document.getElementById('film-progress-bar');
  const progressText = document.getElementById('film-progress-text');

  if (profile) profile.textContent = A340_PROFILE.label;
  document.documentElement.dataset.model = A340_PROFILE.id;

  const copy = (time) => {
    for (const [id, start, end] of BEAT_RANGES) {
      const panel = panels.find((element) => element.dataset.beat === id);
      if (!panel) continue;
      const progress = clamp((time - start) / Math.max(1, end - start));
      const fadeIn = start === 0 ? smooth(.10, .22, progress) : smooth(.16, .32, progress);
      const fadeOut = id === 'teaser' ? smooth(.42, .60, progress) : smooth(.78, .95, progress);
      const opacity = fadeIn * (1 - fadeOut);
      panel.style.opacity = String(opacity);
      panel.style.transform = `translate3d(0, ${(0.48 - progress) * 24}px, 0)`;
      panel.style.pointerEvents = opacity > .45 ? 'auto' : 'none';
    }
  };

  const callouts = (beat) => {
    const items = CALLOUTS[beat.id] || [];
    calloutNodes.forEach((node, index) => {
      const item = items[index];
      if (!item) {
        node.style.opacity = '0';
        return;
      }
      const anchor = engine.anchor(item.role);
      if (!anchor) {
        node.style.opacity = '0';
        return;
      }
      const [anchorX, anchorY] = engine.project(anchor);
      if (![anchorX, anchorY].every(Number.isFinite) || anchorX < -80 || anchorX > innerWidth + 80 || anchorY < -80 || anchorY > innerHeight + 80) {
        node.style.opacity = '0';
        return;
      }

      const labelX = innerWidth * item.x;
      const labelY = innerHeight * item.y;
      const lineStartX = labelX + (item.align === 'left' ? 136 : -136);
      const lineStartY = labelY + 1;
      const dx = anchorX - lineStartX;
      const dy = anchorY - lineStartY;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const enter = smooth(.32 + index * .035, .48 + index * .035, beat.progress);
      const exit = 1 - smooth(.82, .96, beat.progress);
      const draw = smooth(.34 + index * .035, .58 + index * .035, beat.progress) * exit;
      const label = node.querySelector('.callout-label');
      const line = node.querySelector('.callout-line');

      node.style.opacity = String(enter * exit);
      label.textContent = item.label;
      label.style.left = `${labelX}px`;
      label.style.top = `${labelY}px`;
      label.style.textAlign = item.align;
      label.style.transform = `translate(${item.align === 'right' ? '-100%' : '0'}, -50%)`;
      label.style.opacity = String(smooth(.50 + index * .035, .64 + index * .035, beat.progress) * exit);
      line.style.left = `${lineStartX}px`;
      line.style.top = `${lineStartY}px`;
      line.style.width = `${length}px`;
      line.style.transform = `rotate(${angle}rad) scaleX(${draw})`;
    });
  };

  const hud = (time) => {
    const beat = beatAt(time);
    const progress = clamp(time / TOTAL_TIME);
    document.body.dataset.beat = beat.id;
    document.body.dataset.look = beat.shot.look;
    if (shotLabel) shotLabel.textContent = `${String(beat.index + 1).padStart(2, '0')} / ${SHOTS.length} · ${beat.shot.label}`;
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (progressText) progressText.textContent = `${Math.round(progress * 100)}%`;
    callouts(beat);
  };

  return {
    update(time) {
      copy(time);
      hud(time);
    },
  };
}
