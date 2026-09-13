// Built only into qa.html. Deterministic views run through the game's test API.
// Browser automation navigates and reads this page; production index.html is unchanged.
(async()=>{
 const params=new URLSearchParams(location.search),deadline=performance.now()+20000;
 while(!window.__club?.ready){if(window.__clubError||performance.now()>deadline)throw Error(window.__clubError||'Game readiness timeout');await new Promise(r=>setTimeout(r,80));}
 const game=window.__club,scene=params.get('scene')||'studio';game.freeze(true);
 if(params.has('character'))game.setOption('character',params.get('character'));
 if(params.has('light'))game.setOption('light',params.get('light'));
 if(params.has('opponent'))game.setOption('opponent',params.get('opponent'));
 if(params.has('difficulty'))game.setOption('difficulty',params.get('difficulty'));
 if(scene==='studio'){
   const kind=params.get('kind')||'forehand',clip=window.ClubCharacters.defs[kind]||window.CLUB_ASSETS.locomotion?.clips[kind];
   if(!clip)throw Error('Unknown QA motion: '+kind);
   window.ClubCharacters.defs[kind]=clip; // Allow a static locomotion view in this QA-only action room.
   game.seek(kind,Number(params.get('phase')||.68)*clip.duration,false);
   game.setLabView(Number(params.get('yaw')||.35),Number(params.get('height')||1.6),Number(params.get('distance')||4.9));
 }else if(scene==='home'){game.home();game.render();}
 else if(scene==='assisted'){
   game.setSeed(437731);game.start('practice',false);let heldAt=null;
   for(let i=0;i<200;i++){
     const state=game.step(.1,false),plan=state.actors[0].plan;
     if(heldAt===null&&plan&&plan.at-state.clock<.85&&plan.at-state.clock>.35){game.charge();heldAt=state.clock;}
     if(heldAt!==null&&state.clock-heldAt>=.4){game.release();heldAt=null;}
     if(i%10===9)await new Promise(resolve=>setTimeout(resolve,0));
   }
   game.render();
 }else {game.setSeed(437731);game.start(scene==='match'||scene==='replay'?'match':'practice',true);game.step(Math.min(Number(params.get('seconds')||20),45));}
 const report=game.telemetry();
 if(scene==='replay'){
   const before=JSON.stringify(report.actors.map(a=>a.p)),clockBefore=report.clock;
   const started=game.startReplay();game.step(.5);const during=game.telemetry();
   report.replayCheck={started,activeDuring:during.replay,clockPaused:during.clock===clockBefore};
   if(params.get('hold')!=='true'){game.exitReplay();game.render();const after=game.telemetry();report.replayCheck.restoredPositions=JSON.stringify(after.actors.map(a=>a.p))===before;report.replayCheck.exited=!after.replay;}
 }
 const summary=document.createElement('details');summary.id='qa-summary';summary.style.cssText='position:fixed;right:12px;top:76px;z-index:999;background:#101820ed;color:#eef4f0;padding:10px;border:1px solid #81918c;max-width:420px;max-height:70vh;overflow:auto;font:11px monospace';
 const label=document.createElement('summary');label.textContent=`QA · ${scene} · ${report.rigs.map(r=>r.name+': '+r.bones+' bones').join(' / ')} · hits ${report.stats.hits.join(':')}`;
 const pre=document.createElement('pre');pre.style.whiteSpace='pre-wrap';pre.textContent=JSON.stringify(report,null,2);summary.append(label,pre);document.body.append(summary);
 document.documentElement.dataset.qa='ready';
})().catch(error=>{const pre=document.createElement('pre');pre.id='qa-error';pre.style.cssText='position:fixed;inset:20px;z-index:99999;background:#500;color:white';pre.textContent=String(error.stack||error);document.body.append(pre);});
