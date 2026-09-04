import { createFilmTimeline, motion } from './film.js';
import { createModelScene } from './model-scene.js';
import { createFilmEngine } from './film-engine.js';
import { createFilmUi } from './film-ui.js';

const canvas = document.getElementById('webgl-canvas');

createModelScene(canvas).then((model) => {
  const engine = createFilmEngine(model);
  const ui = createFilmUi(engine);
  window.__film = { ...model, engine, motion };
  window.__filmTimeline = createFilmTimeline(document.getElementById('film-sequence'), () => {});
  addEventListener('resize', engine.resize);
  const frame = () => {
    requestAnimationFrame(frame);
    engine.update();
    ui.update(motion.filmTime);
    engine.render();
  };
  requestAnimationFrame(frame);
}).catch((error) => {
  console.error('Luma A3.40 film boot failed', error);
  document.body.dataset.error = 'true';
});
