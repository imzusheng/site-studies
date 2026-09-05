import { createFilmTimeline, motion, scrollMotion } from './film.js';
import { createModelScene } from './model-scene.js';
import { createFilmEngine } from './film-engine.js';
import { createFilmUi } from './film-ui.js';
import { createHeroVideo } from './hero-video.js';

const canvas = document.getElementById('webgl-canvas');
const loading = document.getElementById('model-loading');
const loadingStatus = document.getElementById('loading-status');
const loadingCount = document.getElementById('loading-count');
const loadingPercent = document.getElementById('loading-percent');
const loadingBar = document.getElementById('loading-bar');
const retry = document.getElementById('loading-retry');

const updateLoading = ({ phase, loaded, total }) => {
  const ratio = total ? loaded / total : 0;
  if (loadingBar) loadingBar.style.transform = `scaleX(${ratio})`;
  if (loadingPercent) loadingPercent.textContent = `${String(Math.round(ratio * 100)).padStart(3, '0')}%`;
  if (loadingCount) loadingCount.textContent = `${loaded} / ${total}`;
  if (loadingStatus) {
    loadingStatus.textContent = phase === 'manifest'
      ? '正在读取场景'
      : phase === 'ready' ? '正在准备第一帧' : '正在载入完整结构';
  }
};

async function boot() {
  try {
    const model = await createModelScene(canvas, updateLoading);
    const engine = createFilmEngine(model);
    const ui = createFilmUi(engine);
    window.__film = { ...model, engine, motion };
    window.__filmTimeline = createFilmTimeline(document.getElementById('film-sequence'));
    addEventListener('resize', () => { engine.resize(); engine.update(); engine.render(); });

    model.root.visible = true;
    engine.update();
    ui.update(motion.filmTime);
    engine.render();

    let lastFrame = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(100, now - lastFrame);
      lastFrame = now;
      const delta = scrollMotion.filmTime - motion.filmTime;
      if (Math.abs(delta) < .01) return;
      motion.filmTime = Math.abs(delta) < .1 || reduced.matches
        ? scrollMotion.filmTime
        : motion.filmTime + delta * (1 - Math.exp(-dt / 65));
      engine.update();
      ui.update(motion.filmTime);
      engine.render();
    };
    requestAnimationFrame(frame);
    requestAnimationFrame(() => {
      document.body.dataset.loading = 'false';
      loading?.classList.add('is-ready');
      createHeroVideo();
      loading?.setAttribute('aria-hidden', 'true');
    });
  } catch (error) {
    console.error('Luma A3.43 film boot failed', error);
    document.body.dataset.error = 'true';
    if (loadingStatus) loadingStatus.textContent = '模型加载失败';
    if (loadingCount) loadingCount.textContent = error.message;
    retry?.removeAttribute('hidden');
  }
}

retry?.addEventListener('click', () => location.reload());
boot();
