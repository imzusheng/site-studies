import { createPromoPage } from './promo-page.js';
import { createDisplayDemo } from './display-demo.js';
const displayDemo = createDisplayDemo();

// Media and reading start immediately; 3D is only needed near its own section.
const page = createPromoPage();
const stage = document.getElementById('engine-stage');
const section = document.getElementById('structure');
const loading = document.getElementById('model-loading');
const retry = document.getElementById('loading-retry');
let started = false;

async function bootStructure() {
  if (started) return;
  started = true;
  try {
    const [{ createModelScene }, { createFilmEngine }] = await Promise.all([
      import('./model-scene.js'), import('./film-engine.js'),
    ]);
    const model = await createModelScene(document.getElementById('webgl-canvas'), ({loaded,total}) => {
      const ratio=total ? loaded/total : 0;
      document.getElementById('loading-bar').style.transform=`scaleX(${ratio})`;
      document.getElementById('loading-percent').textContent=`${Math.round(ratio*100)}%`;
      document.getElementById('loading-status').textContent='正在准备结构展示';
    });
    const engine = createFilmEngine(model);
    const state={progress:0,target:0};
    window.__film={...model,engine,state};
    model.root.visible=true;
    let frame=0, previous=performance.now();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    function draw(now) {
      frame=0;
      const dt=Math.min(100,now-previous);previous=now;
      state.progress=reduced.matches ? state.target : state.progress+(state.target-state.progress)*(1-Math.exp(-dt/65));
      if(Math.abs(state.target-state.progress)<.0001) state.progress=state.target;
      engine.update(state.progress);engine.render();
      if(state.progress!==state.target) frame=requestAnimationFrame(draw);
    }
    function update() {
      const rect=section.getBoundingClientRect();
      state.target=Math.max(0,Math.min(1,-rect.top/Math.max(1,rect.height-innerHeight)));
      if(!frame){previous=performance.now()-16;frame=requestAnimationFrame(draw);}
    }
    addEventListener('scroll',update,{passive:true});
    addEventListener('resize',()=>{engine.resize();update();});
    engine.resize();update();
    loading.classList.add('is-ready');loading.setAttribute('aria-hidden','true');
    page.update();
  } catch(error) {
    console.error('Luma structure failed',error);
    document.getElementById('loading-status').textContent='结构展示暂时无法载入';
    retry.hidden=false;started=false;
  }
}
const observer=new IntersectionObserver(entries=>{
  if(entries.some(e=>e.isIntersecting)){observer.disconnect();bootStructure();}
},{rootMargin:'1500px'});
observer.observe(stage);
retry.addEventListener('click',()=>{retry.hidden=true;bootStructure();});
