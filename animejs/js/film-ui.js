import * as THREE from '/vendor/three.module.js';
import { BEAT_RANGES, TOTAL_TIME, beatAt, motion } from './film.js';
import { A340_PROFILE } from './model-profile.js';

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function createFilmUi(engine) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const leaders = $('#leader-lines');
  const stagePath = $('#lcd-stage-path');
  const stageDot = $('#stage-origin-dot');
  const beatPanels = $$('.beat-panel');
  const blueprintLabels = $$('.blueprint-label');
  const featureCallouts = $$('.feature-callout');
  if ($('#film-profile')) $('#film-profile').textContent = A340_PROFILE.label;
  document.documentElement.dataset.model = A340_PROFILE.id;

  function stage() {
    const quad = engine.lcdQuad();
    if (!quad || !stagePath) return;
    const cad = motion.cadMix;
    const target = [
      [innerWidth * THREE.MathUtils.lerp(.26, .10, cad), innerHeight * THREE.MathUtils.lerp(.12, .10, cad)],
      [innerWidth * THREE.MathUtils.lerp(.90, .91, cad), innerHeight * THREE.MathUtils.lerp(.12, .10, cad)],
      [innerWidth * THREE.MathUtils.lerp(.90, .91, cad), innerHeight * .90],
      [innerWidth * THREE.MathUtils.lerp(.26, .10, cad), innerHeight * .90],
    ];
    const t = clamp(motion.stageExpand, 0, 1);
    const out = quad.map((point, index) => [THREE.MathUtils.lerp(point[0], target[index][0], t), THREE.MathUtils.lerp(point[1], target[index][1], t)]);
    stagePath.setAttribute('d', `M ${out.map((point) => point.join(' ')).join(' L ')} Z`);
    stagePath.style.opacity = String(clamp(motion.stageStrength, 0, 1));
    if (stageDot) {
      const center = quad.reduce((acc, point) => [acc[0] + point[0] / 4, acc[1] + point[1] / 4], [0, 0]);
      stageDot.setAttribute('cx', center[0]); stageDot.setAttribute('cy', center[1]);
    }
  }

  function overlays() {
    stage();
    const paths = [];
    for (const element of blueprintLabels) {
      const opacity = clamp(motion.blueprintLabels, 0, 1);
      element.style.opacity = String(opacity);
      if (opacity < .01) continue;
      const world = engine.roleWorld(element.dataset.role);
      if (!world) continue;
      const [sx, sy] = engine.project(world), rect = element.getBoundingClientRect(), left = element.dataset.side !== 'right';
      const tx = left ? rect.right + 7 : rect.left - 7, ty = rect.top + rect.height / 2;
      const mx = left ? Math.min(tx + 40, sx - 28) : Math.max(tx - 40, sx + 28);
      paths.push(`<path class="leader-path" d="M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}"/><circle class="leader-dot" cx="${sx}" cy="${sy}" r="2.5"/>`);
    }
    for (const element of featureCallouts) {
      const opacity = element.dataset.beat === 'input' ? motion.inputCallouts : motion.computeCallouts;
      element.style.opacity = String(clamp(opacity, 0, 1));
      if (opacity < .01) continue;
      const frac = (element.dataset.frac || '0,0,0').split(',').map(Number);
      const world = engine.anchor(element.dataset.role, frac);
      if (!world) continue;
      const [sx, sy] = engine.project(world), rect = element.getBoundingClientRect(), tx = rect.left - 7, ty = rect.top + rect.height / 2;
      paths.push(`<path class="callout-line" d="M ${sx} ${sy} L ${Math.min(tx - 20, sx + 45)} ${sy} L ${tx} ${ty}"/><circle class="leader-dot" cx="${sx}" cy="${sy}" r="2.4"/>`);
    }
    leaders.innerHTML = paths.join('');
    leaders.style.opacity = paths.length ? '1' : '0';
  }

  function copy(time) {
    for (const [id, start, end] of BEAT_RANGES) {
      const panel = beatPanels.find((element) => element.dataset.beat === id);
      if (!panel) continue;
      const progress = (time - start) / (end - start);
      const opacity = Math.max(0, Math.min(1, (start ? smooth(0, .16, progress) : 1) * (1 - smooth(.78, 1, progress))));
      panel.style.opacity = String(opacity);
      panel.style.transform = `translateY(${(.48 - clamp(progress, 0, 1)) * 34}px)`;
    }
  }

  function hud(time) {
    const beat = beatAt(time), index = BEAT_RANGES.findIndex(([id]) => id === beat.id) + 1, progress = clamp(time / TOTAL_TIME, 0, 1);
    document.body.dataset.beat = beat.id;
    const shot = $('#film-shot'), bar = $('#film-progress-bar'), text = $('#film-progress-text');
    if (shot) shot.textContent = `${String(index).padStart(2, '0')} / 09 · ${beat.id.toUpperCase()}`;
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (text) text.textContent = `${Math.round(progress * 100)}%`;
  }

  return { update(time) { overlays(); copy(time); hud(time); } };
}
