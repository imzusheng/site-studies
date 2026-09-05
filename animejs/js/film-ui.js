import { BEAT_RANGES, SHOTS, TOTAL_TIME, beatAt, evaluateMotion } from './film.js';

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => {
  const t = clamp((value - a) / Math.max(.0001, b - a));
  return t * t * (3 - 2 * t);
};
const CALLOUTS = {
  recovery: [{ role: 'mainboard', label: 'FIRMWARE RECOVERY' }],
  fit: [{ role: 'keycapFocus', label: 'KEYCAP CLEARANCE' }],
  shoulder: [{ role: 'upperShell', label: 'SWITCH SUPPORT' }],
  closure: [{ role: 'serviceCover', label: 'M3 FASTENING' }],
  unfold: [{ role: 'upperShell', label: 'ENCLOSURE' }, { role: 'mainboard', label: 'COMPUTE CORE' }],
  core: [{ role: 'mainboard', label: 'ESP32-S3-LCD-2' }],
  display: [{ role: 'activeGlass', label: '2.0 INCH LCD' }],
  optics: [{ role: 'displayModule', label: 'DISPLAY MODULE' }],
  mechanism: [{ role: 'switchStems', label: 'MECHANICAL INPUT' }],
  dial: [{ role: 'knob', label: 'ROTATE + PRESS' }],
  encoder: [{ role: 'encoder', label: 'EC11 ENCODER' }],
  stability: [{ role: 'retainer', label: 'BOARD RETAINER' }],
  service: [{ role: 'serviceCover', label: 'SERVICE COVER' }],
  controls: [{ role: 'keycapFocus', label: 'SIX TACTILE KEYS' }, { role: 'knob', label: 'ROTATE + PRESS' }],
  craft: [{ role: 'upperShell', label: 'PRINTABLE ENCLOSURE' }, { role: 'screenBezel', label: 'MODULAR STRUCTURE' }],
};

export function createFilmUi(engine) {
  const panels = [...document.querySelectorAll('.beat-panel')];
  const calloutNodes = [...document.querySelectorAll('.part-callout')];
  const shotLabel = document.getElementById('film-shot');
  const bar = document.getElementById('film-progress-bar');
  const progressText = document.getElementById('film-progress-text');
  const sequence = document.getElementById('film-sequence');
  const signal = document.getElementById('signal-diagram');
  const signalPulse = signal?.querySelector('.signal-pulse');
  const links = [...document.querySelectorAll('a[href^="#"]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let activeId = '';
  const chapters = document.getElementById('chapter-select');
  const jumpTo = (id) => {
    const range = BEAT_RANGES.find(([key]) => key === id);
    if (!range) return;
    const time = range[1] === 0 || range[0] === 'surface' ? range[1] : range[1] + (range[2] - range[1]) * .5;
    window.scrollTo({ top: time / TOTAL_TIME * (sequence.offsetHeight - innerHeight), behavior: reduced.matches ? 'instant' : 'smooth' });
  };
  chapters?.addEventListener('change', () => jumpTo(chapters.value));

  const layout = () => {
    for (const [id, start, end] of BEAT_RANGES) {
      const section = document.getElementById(id);
      if (section) section.style.height = `${(end - start) / 1000 * innerHeight}px`;
    }
    sequence.style.paddingBottom = `${innerHeight}px`;
  };
  layout();
  addEventListener('resize', layout);
  links.forEach((link) => link.addEventListener('click', (event) => {
    const range = BEAT_RANGES.find(([id]) => `#${id}` === link.getAttribute('href'));
    if (!range) return;
    event.preventDefault();
    const time = range[1] === 0 || range[0] === 'surface' ? range[1] : range[1] + (range[2] - range[1]) * .5;
    window.scrollTo({ top: time / TOTAL_TIME * (sequence.offsetHeight - innerHeight), behavior: reduced.matches ? 'instant' : 'smooth' });
  }));

  const copy = (time) => {
    for (const panel of panels) {
      const range = BEAT_RANGES.find(([id]) => panel.dataset.beat === id);
      if (!range) continue;
      const [id, start, end] = range;
      const progress = (time - start) / (end - start);
      const first = start === 0;
      const last = id === 'final';
      const fadeIn = first ? 1 : smooth(-.025, .10, progress);
      const fadeOut = last ? 0 : smooth(.90, 1.025, progress);
      const opacity = progress < -.025 || (progress > 1.025 && !last) ? 0 : fadeIn * (1 - fadeOut);
      const offset = reduced.matches ? 0 : (1 - smooth(0, .23, progress)) * 12;
      panel.style.opacity = String(opacity);
      panel.style.transform = `translateY(calc(var(--panel-offset, -50%) + ${offset}px))`;
      panel.style.pointerEvents = opacity > .6 ? 'auto' : 'none';
      panel.inert = opacity < .6;
      panel.setAttribute('aria-hidden', String(opacity < .1));
    }
  };

  const callouts = (beat) => {
    const items = CALLOUTS[beat.id] || [];
    const occupied = [];
    const lineLength = Math.min(80, innerWidth * .055);
    const labelWidth = 170;
    calloutNodes.forEach((node, index) => {
      const item = items[index];
      const anchor = item && engine.anchor(item.role);
      if (!anchor || innerWidth <= 800) { node.style.opacity = '0'; return; }
      const [x, y] = engine.project(anchor);
      const labelX = x + lineLength + 12;
      if (![x, y].every(Number.isFinite) || x < innerWidth * .42 || labelX + labelWidth > innerWidth * .96 || y < 100 || y > innerHeight * .8) {
        node.style.opacity = '0'; return;
      }
      // A single horizontal lane includes both the leader and its label.
      // Keep the first annotation when another would crowd or cross that lane.
      const bounds = { left: x - 8, right: labelX + labelWidth + 8, top: y - 18, bottom: y + 18 };
      if (occupied.some((other) => bounds.left < other.right && bounds.right > other.left && bounds.top < other.bottom && bounds.bottom > other.top)) {
        node.style.opacity = '0'; return;
      }
      occupied.push(bounds);
      const opacity = smooth(.24, .40, beat.progress) * (1 - smooth(.75, .92, beat.progress));
      const label = node.querySelector('.callout-label');
      const line = node.querySelector('.callout-line');
      node.style.opacity = String(opacity);
      label.textContent = item.label;
      label.style.cssText = `left:${labelX}px;top:${y}px;text-align:left;transform:translateY(-50%)`;
      line.style.cssText = `left:${x}px;top:${y}px;width:${lineLength}px;transform:scaleX(${opacity})`;
    });
  };

  return {
    update(time) {
      copy(time);
      const paper = time < BEAT_RANGES[2][1] ? smooth(BEAT_RANGES[1][1]-90,BEAT_RANGES[1][1]-15,time) : evaluateMotion(time).paper;
      const blend = (dark, light) => `rgb(${dark.map((v, i) => Math.round(v + (light[i] - v) * paper)).join(' ')})`;
      const root = document.documentElement.style;
      root.setProperty('--paper', String(paper));
      root.setProperty('--fg', blend([238,241,243], [24,29,34]));
      root.setProperty('--muted', blend([165,173,182], [87,94,102]));
      root.setProperty('--accent', blend([223,175,115], [118,79,36]));
      root.setProperty('--soft', blend([112,124,136], [107,114,121]));
      root.setProperty('--line', blend([90,105,119], [155,162,169]));
      const beat = beatAt(time);
      const progress = clamp(time / TOTAL_TIME);
      if (activeId !== beat.id) {
        activeId = beat.id;
        if (chapters) chapters.value = beat.id;
        document.body.dataset.beat = beat.id;
        document.body.dataset.look = beat.shot.look;
        links.forEach((link) => link.setAttribute('aria-current', String(link.getAttribute('href') === `#${beat.id}`)));
        if (shotLabel) shotLabel.textContent = `${String(beat.index + 1).padStart(2, '0')} / ${String(SHOTS.length).padStart(2, '0')} — ${beat.shot.label}`;
      }
      if (bar) bar.style.transform = `scaleX(${progress})`;
      if (progressText) progressText.textContent = `${Math.round(progress * 100)}%`;
      if (signal) signal.style.opacity = String(beat.id === 'signal' ? smooth(.15, .32, beat.progress) * (1 - smooth(.8, .98, beat.progress)) : 0);
      if (signalPulse) signalPulse.style.strokeDashoffset = String(reduced.matches ? 0 : -time * .08);
      callouts(beat);
    },
  };
}
