import * as THREE from '/vendor/three.module.js';
import { BEAT_RANGES, TOTAL_TIME, beatAt, motion } from './film.js';
import { A340_PROFILE } from './model-profile.js';

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => {
  if (a === b) return x >= b ? 1 : 0;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createFilmUi(engine) {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const leaders = $('#leader-lines');
  const stagePath = $('#lcd-stage-path');
  const stageDot = $('#stage-origin-dot');
  const beatPanels = $$('.beat-panel');
  const blueprintLabels = $$('.blueprint-label');
  const featureCallouts = $$('.feature-callout');
  const profile = $('#film-profile');
  const shot = $('#film-shot');
  const bar = $('#film-progress-bar');
  const text = $('#film-progress-text');

  if (profile) profile.textContent = A340_PROFILE.label;
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
    const amount = clamp(motion.stageExpand, 0, 1);
    const out = quad.map((point, index) => [
      THREE.MathUtils.lerp(point[0], target[index][0], amount),
      THREE.MathUtils.lerp(point[1], target[index][1], amount),
    ]);

    stagePath.setAttribute('d', `M ${out.map((point) => point.map((value) => value.toFixed(1)).join(' ')).join(' L ')} Z`);
    stagePath.style.opacity = String(clamp(motion.stageStrength, 0, 1));

    if (stageDot) {
      const center = quad.reduce((acc, point) => [acc[0] + point[0] / 4, acc[1] + point[1] / 4], [0, 0]);
      stageDot.setAttribute('cx', center[0].toFixed(1));
      stageDot.setAttribute('cy', center[1].toFixed(1));
      stageDot.style.opacity = String(.2 + clamp(motion.stageStrength, 0, 1) * .65);
    }
  }

  function blueprintPaths(paths) {
    const opacity = clamp(motion.blueprintLabels, 0, 1);
    if (opacity < .01) {
      blueprintLabels.forEach((element) => { element.style.opacity = '0'; });
      return;
    }

    const hero = engine.productRect();
    for (const element of blueprintLabels) {
      element.style.opacity = String(opacity);
      const world = engine.roleWorld(element.dataset.role);
      if (!world) continue;

      const [sx, sy] = engine.project(world);
      const rect = element.getBoundingClientRect();
      const left = element.dataset.side !== 'right';
      const tx = left ? rect.right + 7 : rect.left - 7;
      const ty = rect.top + rect.height / 2;
      const clearanceX = left ? hero.left - 24 : hero.right + 24;
      const exitX = left ? Math.min(sx - 28, clearanceX) : Math.max(sx + 28, clearanceX);

      paths.push(`<path class="leader-path" d="M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${exitX.toFixed(1)} ${sy.toFixed(1)} L ${clearanceX.toFixed(1)} ${ty.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}"/>`);
      paths.push(`<circle class="leader-dot" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.5"/>`);
    }
  }

  function featurePaths(paths) {
    for (const element of featureCallouts) {
      const opacity = element.dataset.beat === 'input' ? motion.inputCallouts : motion.computeCallouts;
      element.style.opacity = String(clamp(opacity, 0, 1));
      if (opacity < .01) continue;

      const frac = (element.dataset.frac || '0,0,0').split(',').map(Number);
      const world = engine.anchor(element.dataset.role, frac);
      if (!world) continue;

      const [sx, sy] = engine.project(world);
      const rect = element.getBoundingClientRect();
      const left = element.dataset.side === 'left';
      const tx = left ? rect.right + 7 : rect.left - 7;
      const ty = rect.top + rect.height / 2;
      const elbow = left ? Math.max(tx + 24, sx - 48) : Math.min(tx - 24, sx + 48);
      paths.push(`<path class="callout-line" d="M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${elbow.toFixed(1)} ${sy.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}"/>`);
      paths.push(`<circle class="leader-dot" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.4"/>`);
    }
  }

  function overlays() {
    stage();
    if (!leaders) return;
    const paths = [];
    blueprintPaths(paths);
    featurePaths(paths);
    leaders.innerHTML = paths.join('');
    leaders.style.opacity = paths.length ? '1' : '0';
  }

  // Copy transitions deliberately overlap editorial boundaries. The previous
  // implementation faded the outgoing panel to zero before the next panel was
  // allowed to enter, which made continuous 3D motion feel like a hard cut.
  function copy(time) {
    const overlap = 250;
    for (const [id, start, end] of BEAT_RANGES) {
      const panel = beatPanels.find((element) => element.dataset.beat === id);
      if (!panel) continue;

      const fadeIn = start === 0 ? 1 : smooth(start - overlap, start + 150, time);
      const fadeOut = end === TOTAL_TIME ? 1 : 1 - smooth(end - 170, end + overlap, time);
      const opacity = clamp(fadeIn * fadeOut, 0, 1);
      const progress = clamp((time - start) / Math.max(1, end - start), 0, 1);
      panel.style.opacity = String(opacity);
      panel.style.transform = `translate3d(0, ${(0.48 - progress) * 28}px, 0)`;
      panel.style.pointerEvents = opacity > .48 ? 'auto' : 'none';
    }
  }

  function hud(time) {
    const beat = beatAt(time);
    const index = BEAT_RANGES.findIndex(([id]) => id === beat.id) + 1;
    const progress = clamp(time / TOTAL_TIME, 0, 1);
    document.body.dataset.beat = beat.id;
    if (shot) shot.textContent = `${String(index).padStart(2, '0')} / ${String(BEAT_RANGES.length).padStart(2, '0')} · ${beat.id.toUpperCase()}`;
    if (bar) bar.style.transform = `scaleX(${progress})`;
    if (text) text.textContent = `${Math.round(progress * 100)}%`;
  }

  return {
    update(time) {
      overlays();
      copy(time);
      hud(time);
    },
  };
}
