/* Court Study. Original demo code. Third-party motion remains CC BY-SA 3.0.
 * No runtime CDN, analytics, remote fetch, or hidden asset download.
 */
'use strict';
(async function bootCourtStudy(){
 const $=id=>document.getElementById(id);
 try {
 const T=window.THREE;
 if(!T||!window.BASELINE_ENGINE?.mergeGeometries) throw new Error('本地 Three.js 资源缺失。请使用完整构建的 HTML。');
 const A=window.COURT_ASSETS, M=A.motion, rig=M.rig;
 const touchDevice=matchMedia('(pointer:coarse)').matches;
 const settings={quality:'auto',light:'day',outfit:'ivory',camera:'follow',effects:!matchMedia('(prefers-reduced-motion:reduce)').matches};
 try{const saved=JSON.parse(localStorage.getItem('court-study-settings')||'{}');for(const [k,allowed] of Object.entries({quality:['auto','high','eco'],light:['day','evening'],outfit:['ivory','cypress'],camera:['follow','wide']}))if(allowed.includes(saved[k]))settings[k]=saved[k];if(typeof saved.effects==='boolean')settings.effects=saved.effects}catch{}
 const saveSettings=()=>{try{localStorage.setItem('court-study-settings',JSON.stringify(settings))}catch{}};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), Q=()=>new T.Quaternion();
 const yAxis=V(0,1,0), worldTurn=Q().setFromAxisAngle(yAxis,Math.PI);
 const RACKET_POINT=V(0,-.47,0), G=9.81, BALL_R=.0335;
 let seed=92741;
 function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 const rand=(a,b)=>mix(a,b,rnd());
 const canvas=$('view');
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
 renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 const scene=new T.Scene();
 const camera=new T.PerspectiveCamera(43,innerWidth/innerHeight,.06,350);
 camera.position.set(2.3,2.1,12.8);let cameraLook=V(-.9,1.0,8.3);camera.lookAt(cameraLook);
 const venue=window.createCourtVenue(T,scene,renderer);
 const {world,mats,mesh,box,plane,tube,mat,machine,sun}=venue;
 const ballMesh=(r,m,parent=world,p=null,segments=14)=>mesh(new T.SphereGeometry(r,segments,12),m,parent,p);
 const ballMat=mat('#dbe94c',.87);
 renderer.toneMapping=T.NoToneMapping;
 const presentation=window.createCourtPresentation(T,renderer);
 // Animation sampling is separated from gameplay and mesh construction.
 const clips=M.clips;
 const strokeDefs={
  forehand:{label:'正手平击',base:'forehand',start:2.40,contact:2.835,end:3.40,inspectStart:1.65,inspectEnd:3.40,source:'Tennis-MoCap / lvargas_Derecha_4seg.bvh',derived:false,drive:'录制姿态 + 四元数插值'},
  forehandReach:{label:'正手救球',base:'forehand',start:2.40,contact:2.835,end:3.40,inspectStart:1.72,inspectEnd:3.40,source:'Derived from forehand base clip',derived:true,drive:'录制姿态 + 程序化补偿'},
  backhand:{label:'反手驱动',base:'backhand',start:.68,contact:1.17,end:1.80,inspectStart:.15,inspectEnd:1.80,source:'Tennis-MoCap / adorozco_Reves_8seg.bvh',derived:false,drive:'录制姿态 + 四元数插值'},
  backhandSlice:{label:'反手切削',base:'backhand',start:.68,contact:1.17,end:1.80,inspectStart:.15,inspectEnd:1.80,source:'Derived from backhand base clip',derived:true,drive:'录制姿态 + 程序化补偿'}
 };
 if(!clips.backhand){$('bhBtn').disabled=true;$('bsBtn').disabled=true;delete strokeDefs.backhand;delete strokeDefs.backhandSlice;}
 const XAX=V(1,0,0), ZAX=V(0,0,1);
 function twist(pose,index,axis,angle){pose.q[index].multiply(Q().setFromAxisAngle(axis,angle));}
 function stylizePose(kind,time,pose){
  const def=strokeDefs[kind];
  if(!def||!def.derived)return pose;
  const u=clamp((time-def.start)/Math.max(.0001,def.end-def.start),0,1);
  const rise=smooth(u/.55),fall=1-smooth((u-.58)/.42),peak=clamp(rise*fall,0,1);
  if(kind==='forehandReach'){
   twist(pose,0,ZAX,-.12*peak);twist(pose,1,ZAX,-.18*peak);twist(pose,1,yAxis,-.22*peak);twist(pose,9,yAxis,-.14*peak);
   twist(pose,9,ZAX,-.20*peak);twist(pose,10,ZAX,-.26*peak);twist(pose,11,XAX,.18*peak);twist(pose,5,ZAX,.11*peak);
   twist(pose,12,ZAX,-.11*peak);twist(pose,15,ZAX,.08*peak);pose.p.x+=.16*peak;pose.p.z-=.06*peak;
  }else if(kind==='backhandSlice'){
   twist(pose,0,XAX,.09*peak);twist(pose,1,XAX,.12*peak);twist(pose,1,yAxis,.18*peak);twist(pose,5,ZAX,-.10*peak);twist(pose,6,ZAX,-.12*peak);
   twist(pose,9,ZAX,.12*peak);twist(pose,10,ZAX,.20*peak);twist(pose,11,XAX,-.32*peak);twist(pose,11,yAxis,.16*peak);pose.p.y-=.035*peak;pose.p.z+=.04*peak;
  }
  return pose;
 }
 function sample(kind,time){
  const def=strokeDefs[kind]||strokeDefs.forehand;const source=clips[def.base||kind];time=clamp(time,source.times[0],source.times.at(-1));let hi=1;while(hi<source.times.length-1&&source.times[hi]<time)hi++;const lo=hi-1,u=(time-source.times[lo])/Math.max(1e-8,source.times[hi]-source.times[lo]);
  const pose={q:source.quaternions[lo].map((q,i)=>Q().fromArray(q).slerp(Q().fromArray(source.quaternions[hi][i]),u)),p:V(...source.positions[lo]).lerp(V(...source.positions[hi]),u)};
  if((def.base||kind)==='backhand')gripCorrection(pose,time);
  return stylizePose(kind,time,pose);
 }
 function fk(pose){
  const p=[],q=[];for(let i=0;i<18;i++){const parent=rig.parents[i];if(parent<0){p.push(V(0,pose.p.y,0));q.push(pose.q[i].clone())}else{p.push(p[parent].clone().add(V(...rig.offsets[i]).applyQuaternion(q[parent])));q.push(q[parent].clone().multiply(pose.q[i]))}}
  // A geometric foot-floor alignment, not a promise of full foot locking.
  let minFoot=Infinity;for(const i of [14,17])for(const offset of [[0,-.081,-.04],[0,-.076,.18]])minFoot=Math.min(minFoot,p[i].clone().add(V(...offset).applyQuaternion(q[i])).y);
  const lift=-minFoot+.005;for(const v of p)v.y+=lift;
  return {p,q,lift,racket:p[11].clone().add(RACKET_POINT.clone().applyQuaternion(q[11]))};
 }

 function gripCorrection(pose,time){
  // Small two-bone correction for the non-dominant hand. Base swing stays recorded.
  const influence=smooth((time-.30)/.35)*(1-smooth((time-1.52)/.26));
  if(influence<.001)return pose;
  const f=fk(pose),target=f.p[11].clone().add(V(0,-.105,0).applyQuaternion(f.q[11]));
  const err=target.distanceTo(f.p[7]);if(err>.34)return pose;
  const desired=f.p[7].clone().lerp(target,influence),shoulder=f.p[5],upper=f.p[6].distanceTo(shoulder),lower=f.p[7].distanceTo(f.p[6]);
  const dir=desired.clone().sub(shoulder);const distance=clamp(dir.length(),.07,upper+lower-.004);dir.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  let pole=f.p[6].clone().sub(shoulder);pole.addScaledVector(dir,-pole.dot(dir));if(pole.lengthSq()<1e-8)pole=V(0,-1,.2).addScaledVector(dir,-V(0,-1,.2).dot(dir));pole.normalize();
  const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,height);
  let delta=Q().setFromUnitVectors(f.p[6].clone().sub(shoulder).normalize(),elbow.clone().sub(shoulder).normalize());
  const shoulderWorld=delta.multiply(f.q[5]);pose.q[5]=f.q[4].clone().invert().multiply(shoulderWorld);
  const f2=fk(pose);delta=Q().setFromUnitVectors(f2.p[7].clone().sub(f2.p[6]).normalize(),desired.clone().sub(f2.p[6]).normalize());
  pose.q[6]=f2.q[5].clone().invert().multiply(delta.multiply(f2.q[6]));
  const f3=fk(pose),wristWorld=f3.q[11].clone().multiply(Q().setFromAxisAngle(yAxis,Math.PI));
  pose.q[7].slerp(f3.q[6].clone().invert().multiply(wristWorld),influence*.7);
  return pose;
 }
 
 const athlete=window.createCourtAthlete(T,rig);
 const actor=new T.Group();scene.add(actor);actor.position.set(-.7,0,8.3);actor.rotation.y=-.28;
 const model=athlete;actor.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false}});
 const bones=rig.names.map(name=>model.getObjectByName(name));if(bones.some(b=>!b))throw new Error('角色骨架与动作数据不一致。');
 const racket=new T.Group();racket.name='RacketSocket';bones[11].add(racket);
 const framePts=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;framePts.push(V(Math.sin(a)*.133,-.47+Math.cos(a)*.168,0))}
 const frameGeo=new T.TubeGeometry(new T.CatmullRomCurve3(framePts,false,'centripetal'),96,.011,6,false);
 mesh(frameGeo,mats.dark,racket);
 const handle=mesh(new T.CylinderGeometry(.014,.017,.18,10),mats.white,racket,V(0,-.055,0));
 for(let j=0;j<8;j++){const grip=mesh(new T.TorusGeometry(.017,.0016,4,14),mats.silver,racket,V(0,.023-j*.019,0));grip.rotation.x=Math.PI/2;}
 tube([[0,-.145,0],[-.035,-.227,0],[-.074,-.329,0]],.008,mats.dark,racket);tube([[0,-.145,0],[.035,-.227,0],[.074,-.329,0]],.008,mats.dark,racket);
 const strings=[];for(let i=-7;i<=7;i++){const x=i*.0158,y=Math.sqrt(1-x*x/(.126*.126))*.158;strings.push(x,-.47-y,.001,x,-.47+y,.001)}for(let i=-9;i<=9;i++){const y=i*.0165,x=Math.sqrt(Math.max(0,1-y*y/(.158*.158)))*.126;strings.push(-x,-.47+y,.001,x,-.47+y,.001)}
 const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(strings,3));racket.add(new T.LineSegments(sg,new T.LineBasicMaterial({color:'#f4eccb',transparent:true,opacity:.8})));
 const contactOrientation=fk(sample('forehand',strokeDefs.forehand.contact));const idealLocal=V(0,0,1).applyQuaternion(contactOrientation.q[11].clone().invert());racket.rotation.y=Math.atan2(idealLocal.x,idealLocal.z);
 const helper=new T.SkeletonHelper(model);helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.8;helper.visible=false;scene.add(helper);
 let currentPose=sample('forehand',0);
 function applyPose(pose,rootXY=false){
  currentPose=pose;for(let i=0;i<18;i++)bones[i].quaternion.copy(pose.q[i]);bones[0].position.set(rootXY?pose.p.x:0,pose.p.y,rootXY?pose.p.z:0);model.position.y=fk(pose).lift;model.updateMatrixWorld(true);
 }
 applyPose(currentPose);
 const lab=new T.Group();scene.add(lab);lab.visible=false;
 const labFloor=plane(100,100,mat('#234d45'),lab,V(0,-.05,0));labFloor.rotation.x=-Math.PI/2;labFloor.castShadow=false;const plinth=mesh(new T.CylinderGeometry(1.58,1.60,.055,80),mat('#436858'),lab,V(0,-.023,0));plinth.receiveShadow=true;
 const circleGeometry=new T.RingGeometry(1.38,1.385,96);const labRing=mesh(circleGeometry,new T.MeshBasicMaterial({color:'#789782',side:T.DoubleSide}),lab,V(0,.010,0));labRing.rotation.x=-Math.PI/2;
 const pathGeo=new T.BufferGeometry();const pathLine=new T.Line(pathGeo,new T.LineBasicMaterial({color:'#dbe883',transparent:true,opacity:.45}));lab.add(pathLine);pathLine.visible=false;
 function rebuildPath(kind){const def=strokeDefs[kind];const pts=[];for(let i=0;i<=80;i++){const po=sample(kind,mix(def.inspectStart,def.inspectEnd,i/80));const f=fk(po);const v=f.racket;v.x+=po.p.x;v.z+=po.p.z;pts.push(v)}pathGeo.setFromPoints(pts)}
 const tennisBall=ballMesh(.058,ballMat,scene,V(0,-20,0),18);tennisBall.castShadow=true;
 const seamPts=[];for(let j=0;j<=72;j++){const a=j/72*Math.PI*2;seamPts.push(V(Math.cos(a)*.056,Math.sin(a)*.037,Math.sin(a*2)*.035))}tube(seamPts,.0015,mats.white,tennisBall);
 function softShadowMap(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,5,64,64,63);g.addColorStop(0,'rgba(0,0,0,.75)');g.addColorStop(.35,'rgba(0,0,0,.4)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new T.CanvasTexture(c)}const shadowTexture=softShadowMap();
 const ballShadow=mesh(new T.CircleGeometry(.15,24),new T.MeshBasicMaterial({color:'#0b251c',map:shadowTexture,transparent:true,opacity:.55,depthWrite:false}),scene,V(0,.045,0));ballShadow.rotation.x=-Math.PI/2;ballShadow.castShadow=false;ballShadow.receiveShadow=false;ballShadow.visible=false;
 const trailGeo=new T.BufferGeometry();const trailArray=new Float32Array(24*3);trailGeo.setAttribute('position',new T.BufferAttribute(trailArray,3));trailGeo.setDrawRange(0,0);const trailLine=new T.Line(trailGeo,new T.LineBasicMaterial({color:'#dbe980',transparent:true,opacity:.5,depthWrite:false}));scene.add(trailLine);const trail=[];
 const racketHistory=[],sweepPositions=new Float32Array(18*2*3),sweepColors=new Float32Array(18*2*4),sweepIndices=[];
 for(let i=0;i<17;i++)sweepIndices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
 const sweepGeo=new T.BufferGeometry();sweepGeo.setAttribute('position',new T.BufferAttribute(sweepPositions,3));sweepGeo.setAttribute('color',new T.BufferAttribute(sweepColors,4));sweepGeo.setIndex(sweepIndices);sweepGeo.setDrawRange(0,0);
 const sweep=new T.Mesh(sweepGeo,new T.MeshBasicMaterial({vertexColors:true,transparent:true,side:T.DoubleSide,depthWrite:false}));sweep.frustumCulled=false;scene.add(sweep);
 function updateRacketTrail(){
  if(!settings.effects||!swing||replay||mode!=='play'||paused){racketHistory.length=0;sweepGeo.setDrawRange(0,0);return}
  const p=racketWorld();if(!racketHistory.length||p.distanceTo(racketHistory[0].p)>.012)racketHistory.unshift({p,t:simTime});while(racketHistory.length>18||racketHistory.length&&simTime-racketHistory.at(-1).t>.14)racketHistory.pop();
  const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0);for(let i=0;i<racketHistory.length;i++){const h=racketHistory[i],w=.043*(1-i/18);for(let j=0;j<2;j++){const v=h.p.clone().addScaledVector(right,(j?1:-1)*w);v.toArray(sweepPositions,(i*2+j)*3);const off=(i*2+j)*4;sweepColors[off]=.88;sweepColors[off+1]=.94;sweepColors[off+2]=.65;sweepColors[off+3]=.22*(1-(simTime-h.t)/.14)}}
  sweepGeo.attributes.position.needsUpdate=true;sweepGeo.attributes.color.needsUpdate=true;sweepGeo.setDrawRange(0,Math.max(0,(racketHistory.length-1)*6));
 }
 const aim=new T.Group();world.add(aim);aim.position.set(1.8,.045,-7.4);
 const aimRing=mesh(new T.RingGeometry(.39,.415,48),new T.MeshBasicMaterial({color:'#f0efc3',transparent:true,opacity:.7,side:T.DoubleSide}),aim);aimRing.rotation.x=-Math.PI/2;aimRing.castShadow=false;
 const markerMat=new T.MeshBasicMaterial({color:'#f0efc3',transparent:true,opacity:.55});const ax=box(.62,.008,.018,markerMat,aim);const az=box(.018,.008,.62,markerMat,aim);ax.castShadow=az.castShadow=false;
 const playerShadow=mesh(new T.CircleGeometry(.62,32),new T.MeshBasicMaterial({color:'#102d23',map:shadowTexture,transparent:true,opacity:.48,depthWrite:false}),scene,V(0,.046,0));playerShadow.rotation.x=-Math.PI/2;playerShadow.castShadow=false;
 const targetMarker=new T.Group();scene.add(targetMarker);targetMarker.visible=false;
 const targetOuter=mesh(new T.RingGeometry(.48,.56,48),new T.MeshBasicMaterial({color:'#e9edb2',transparent:true,opacity:.92,side:T.DoubleSide,depthWrite:false}),targetMarker,V(0,.046,0));targetOuter.rotation.x=-Math.PI/2;targetOuter.castShadow=false;
 const targetInner=mesh(new T.RingGeometry(.18,.30,40),new T.MeshBasicMaterial({color:'#d46c4c',transparent:true,opacity:.78,side:T.DoubleSide,depthWrite:false}),targetMarker,V(0,.047,0));targetInner.rotation.x=-Math.PI/2;targetInner.castShadow=false;
 const targetGlow=mesh(new T.CircleGeometry(.17,32),new T.MeshBasicMaterial({color:'#fff6cf',transparent:true,opacity:.25,depthWrite:false}),targetMarker,V(0,.048,0));targetGlow.rotation.x=-Math.PI/2;targetGlow.castShadow=false;

 // Batch static scene meshes by material. The animated character and aim marker stay separate.
 world.updateMatrixWorld(true);
 const batches=new Map(),toRemove=[];
 world.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||o===aim||o.parent===aim||Array.isArray(o.material))return;for(let n=o;n;n=n.parent){if(n.userData.skipBatch)return;}
  const key=o.material.uuid+'|'+o.castShadow+'|'+o.receiveShadow;
  if(!batches.has(key))batches.set(key,{material:o.material,cast:o.castShadow,receive:o.receiveShadow,geometries:[]});
  batches.get(key).geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));toRemove.push(o);
 });
 for(const b of batches.values()){
  const geo=window.BASELINE_ENGINE.mergeGeometries(b.geometries,false);
  if(!geo)throw new Error('静态场景合批失败。');const m=new T.Mesh(geo,b.material);m.castShadow=b.cast;m.receiveShadow=b.receive;world.add(m);
  for(const g of b.geometries)g.dispose();
 }
 for(const o of toRemove)o.removeFromParent();
 const bounceMarks=[];function markBounce(p,good=true){const material=new T.MeshBasicMaterial({color:good?'#e9edb2':'#db8d67',transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false});const o=mesh(new T.RingGeometry(.10,.13,28),material,scene,V(p.x,.046,p.z));o.rotation.x=-Math.PI/2;o.castShadow=false;bounceMarks.push({o,age:0})}
 const hitFX=[];function hitBurst(p){for(let i=0;i<10;i++){const o=ballMesh(.018,markerMat,scene,p.clone(),6);o.castShadow=false;hitFX.push({o,v:V(rand(-1.1,1.1),rand(.2,1.8),rand(-1.5,.3)),age:0})}}
 const keys=new Set();const input={x:0,z:0,held:false,heldAt:0,power:0,queued:false};
 let mode='intro',gameMode='rally',demo=false,assist=true,paused=false,simTime=0,nextFeed=0,feedNo=0;
 let ball=null,plan=null,swing=null,prepare=0,gait=0,moveSpeed=0,labKind='forehand',labTime=1.65,labPlaying=true,labSpeed=.5,labTheta=.3,labDistance=4.35,labElevation=1.8;
 let targetCamera=V(),targetLook=V(),externalFreeze=false,frameNo=0,toastUntil=0;
 const stats={returns:0,streak:0,best:0,misses:0,in:0,out:0,feeds:0,speed:0,contactErrors:[],shotKinds:[],events:[]};
 const challenge={score:0,lives:3,targetHits:0,level:1};
 let gameOver=false,lastHitTime=-999,replay=null,replaySaved=null,replayFrames=[],replayCaptureUntil=-1,history=[];
 const copyPose=po=>({q:po.q.map(q=>q.clone()),p:po.p.clone()});
 function captureFrame(){return {time:simTime,actor:actor.position.clone(),pose:copyPose(currentPose),ball:ball?ball.p.clone():null,visible:!!ball}}
 function recordFrame(){
  if(frameNo%4)return;const f=captureFrame();history.push(f);while(history.length>100)history.shift();
  if(replayCaptureUntil>0&&simTime>=replayCaptureUntil){replayFrames=history.filter(f=>f.time>=lastHitTime-1.10&&f.time<=lastHitTime+.65);replayCaptureUntil=-1;$('replayBtn').classList.remove('hidden')}
 }
 function startReplay(){if(mode!=='play'||replayFrames.length<6||replay||$('assetsDialog').open||$('settingsDialog').open)return false;replaySaved={actor:actor.position.clone(),pose:copyPose(currentPose),paused};replay={elapsed:0,frames:replayFrames.slice()};keys.clear();input.held=false;input.queued=false;input.x=input.z=0;trail.length=0;trailGeo.setDrawRange(0,0);$('replayBanner').classList.remove('hidden');$('chargeHUD').classList.add('hidden');$('touchControls').classList.add('hidden');$('sessionToast').classList.remove('show');return true}
 function exitReplay(){if(!replay)return;actor.position.copy(replaySaved.actor);applyPose(replaySaved.pose);paused=replaySaved.paused;replay=null;replaySaved=null;$('replayBanner').classList.add('hidden');if(mode==='play'){$('chargeHUD').classList.remove('hidden');$('touchControls').classList.remove('hidden')}tennisBall.visible=!!ball;ballShadow.visible=!!ball;trail.length=0;trailGeo.setDrawRange(0,0)}
 function replayStep(dt){const frames=replay.frames;replay.elapsed+=dt*.5;const t=frames[0].time+replay.elapsed;if(t>frames.at(-1).time+.20){exitReplay();return}let i=1;while(i<frames.length-1&&frames[i].time<t)i++;const a=frames[i-1],b=frames[i],u=clamp((t-a.time)/Math.max(.001,b.time-a.time),0,1);actor.position.copy(a.actor).lerp(b.actor,u);const po=copyPose(a.pose);po.q.forEach((q,j)=>q.slerp(b.pose.q[j],u));po.p.lerp(b.pose.p,u);applyPose(po);replay.ball=a.ball&&b.ball?a.ball.clone().lerp(b.ball,u):b.ball?.clone();tennisBall.visible=!!replay.ball;ballShadow.visible=!!replay.ball}

 const performanceData={frameMS:[],renderer:'',dpr:renderer.getPixelRatio(),errors:[]};
 try{const gl=renderer.getContext();const ext=gl.getExtension('WEBGL_debug_renderer_info');performanceData.renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'WebGL2'}catch{}
 const record=(type,data={})=>{stats.events.push({t:+simTime.toFixed(3),type,...data});if(stats.events.length>500)stats.events.shift()};
 function modeFeedDelay(base){return gameMode==='endurance'?Math.max(.55,base*.72):base}
 function updateModeButtons(){for(const [id,key] of [['modeRallyBtn','rally'],['modeTargetBtn','target'],['modeEnduranceBtn','endurance']])$(id).classList.toggle('active',gameMode===key)}
 function describeMode(){return gameMode==='target'?'Target · 命中落点得分':gameMode==='endurance'?'Endurance · 失误会掉血':'Rally · 常规练习'}
 function spawnTarget(){if(gameMode!=='target'){targetMarker.visible=false;return}const x=rand(-3.5,3.5),z=rand(-10.6,-3.2);targetMarker.visible=true;targetMarker.position.set(x,0,z)}
 function resetChallenge(){challenge.score=0;challenge.lives=3;challenge.targetHits=0;challenge.level=1;spawnTarget()}
 function registerPenalty(reason){if(gameMode!=='endurance'||gameOver)return;challenge.lives=Math.max(0,challenge.lives-1);if(challenge.lives<=0){gameOver=true;setPaused(true);record('gameover',{reason,mode:gameMode})}else notify('Keep going.',`还剩 ${challenge.lives} 次机会`,1.5)}
 function selectGameMode(next,{restart=true}={}){gameMode=next;updateModeButtons();resetChallenge();$('challengeHint').textContent=describeMode();if(restart&&mode==='play')switchMode('play',demo)}
 let audio=null,muted=true,audioOutput=null,impactNoise=null;
 function tone(type){
  if(muted)return;
  try{
   if(!audio){
    audio=new (window.AudioContext||window.webkitAudioContext)();
    audioOutput=audio.createDynamicsCompressor();audioOutput.threshold.value=-12;audioOutput.ratio.value=6;audioOutput.attack.value=.003;audioOutput.release.value=.1;audioOutput.connect(audio.destination);
    impactNoise=audio.createBuffer(1,Math.ceil(audio.sampleRate*.15),audio.sampleRate);const data=impactNoise.getChannelData(0);let n=8191;for(let i=0;i<data.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;data[i]=(n/2147483648-1)*Math.exp(-i/data.length*4)}
   }
   if(audio.state==='suspended')void audio.resume().catch(()=>{});
   const now=audio.currentTime,hit=type==='hit',pan=audio.createStereoPanner();pan.pan.value=clamp((ball?.p.x||actor.position.x)/10,-.65,.65);pan.connect(audioOutput);
   const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),env=audio.createGain();noise.buffer=impactNoise;filter.type='bandpass';filter.frequency.value=hit?2200:900;filter.Q.value=.7;env.gain.setValueAtTime(hit?.65:.22,now);env.gain.exponentialRampToValueAtTime(.001,now+.095);noise.connect(filter).connect(env).connect(pan);noise.start(now);noise.stop(now+.11);
   const body=audio.createOscillator(),bodyGain=audio.createGain();body.type='sine';body.frequency.setValueAtTime(hit?210:140,now);body.frequency.exponentialRampToValueAtTime(62,now+.055);bodyGain.gain.setValueAtTime(hit?.23:.16,now);bodyGain.gain.exponentialRampToValueAtTime(.001,now+.085);body.connect(bodyGain).connect(pan);body.start(now);body.stop(now+.105);
   body.onended=()=>{body.disconnect();bodyGain.disconnect()};noise.onended=()=>{noise.disconnect();filter.disconnect();env.disconnect();pan.disconnect()};
  }catch{ /* Audio is optional; unsupported or permission-denied devices remain playable. */ }
 }

 function notify(title,sub,seconds=1.6){$('sessionToast').innerHTML=`<strong>${title}</strong><span>${sub}</span>`;$('sessionToast').classList.add('show');toastUntil=simTime+seconds}
 function setPaused(value){if(gameOver&&!value)return;paused=value;$('pauseBtn').textContent=paused?'▶':'Ⅱ';$('pauseBtn').setAttribute('aria-label',paused?'继续':'暂停');if(paused)notify(gameOver?'Session over.':'Pause',gameOver?'本轮结束 · 按 R 重新开始':'按 P 或点击继续',999);else{$('sessionToast').classList.remove('show');toastUntil=0}}
 function updateHUD(){
  $('returns').textContent=String(stats.returns).padStart(2,'0');
  const streakValue=gameMode==='endurance'?challenge.lives:stats.streak;$('streak').textContent=String(streakValue).padStart(2,'0');
  $('speed').innerHTML=(stats.speed?Math.round(stats.speed):'—')+'<small> km/h</small>';
  $('streakLabel').textContent=gameMode==='endurance'?'机会':'连续';
  const power=clamp(input.power,0,1);$('powerValue').textContent=Math.round(power*100)+'%';$('chargeFill').style.width=power*100+'%';$('chargeFill').style.background=power>.92?'#f0c28a':'#dce980';
  $('chargeLabel').textContent=demo?'示范中 · 自动蓄力':input.held?(power>=1?'已蓄满 · 松开击球':'蓄力中'):input.queued?'已准备 · 等待击球窗口':(touchDevice?'按住 HIT 蓄力':'按住空格蓄力');
  $('shotHint').textContent=swing?`${strokeDefs[swing.kind].label} · ${swing.hit?'随挥与回位':'向前挥拍'}`:plan?`${strokeDefs[plan.kind].label}来球 · ${input.queued?'准备击球':'移动调整'}`:'准备接球';
  $('challengeHint').textContent=gameMode==='target'?`Target · ${challenge.score} 分 / ${challenge.targetHits} 命中`:gameMode==='endurance'?`Endurance · Lives ${challenge.lives}`:`Rally · Best ${stats.best}`;
 }
 function clearBall(){ball=null;plan=null;tennisBall.visible=false;ballShadow.visible=false;trail.length=0;trailGeo.setDrawRange(0,0)}
 function resetStats(){for(const k of ['returns','streak','best','misses','in','out','feeds','speed'])stats[k]=0;stats.events=[];stats.contactErrors=[];stats.shotKinds=[];feedNo=0;resetChallenge()}
 function switchMode(next,isDemo=false){
  exitReplay();mode=next;demo=isDemo;paused=false;gameOver=false;history=[];replayFrames=[];replayCaptureUntil=-1;$('replayBtn').classList.add('hidden');$('replayBanner').classList.add('hidden');document.body.dataset.screen=mode;$('bottomNav').classList.toggle('hidden',mode==='intro');$('venueCaption').classList.toggle('hidden',mode!=='intro');venue.sky.visible=mode!=='motion';scene.background.set(mode==='motion'?'#234d45':'#becab3');input.held=false;input.queued=false;input.power=0;swing=null;prepare=0;clearBall();targetMarker.visible=mode==='play'&&gameMode==='target';$('sessionToast').classList.remove('show');
  document.body.classList.toggle('playing',mode==='play');world.visible=mode!=='motion';lab.visible=mode==='motion';
  $('intro').classList.toggle('hidden',mode!=='intro');for(const id of ['scoreboard','practiceLabel','chargeHUD','assistTools','desktopHint','touchControls'])$(id).classList.toggle('hidden',mode!=='play');
  for(const id of ['motionPanel','timeline'])$(id).classList.toggle('hidden',mode!=='motion');
  $('motionTab').classList.toggle('active',mode==='motion');$('courtTab').classList.toggle('active',mode!=='motion');
  $('modeLabel').textContent=demo?'自动示范':gameMode==='target'?'目标挑战':gameMode==='endurance'?'耐力挑战':'自由练习';$('pauseBtn').textContent='Ⅱ';
  if(mode==='motion'){actor.position.set(0,0,0);actor.rotation.y=0;labTime=strokeDefs[labKind].inspectStart;labPlaying=true;rebuildPath(labKind);updateMotionUI();}
  else {helper.visible=false;pathLine.visible=false;actor.rotation.y=mode==='intro'?-.28:Math.PI;actor.position.set(-.7,0,8.3);applyPose(sample('forehand',strokeDefs.forehand.inspectStart));if(mode==='play'){resetStats();nextFeed=simTime+1.0;updateHUD();}}
  targetMarker.visible=mode==='play'&&gameMode==='target';playerShadow.visible=true;record('mode',{mode,demo,gameMode});
 }
 const calibration={};
 for(const [kind,def] of Object.entries(strokeDefs)){
  const start=sample(kind,def.start),contact=sample(kind,def.contact);const delta=contact.p.clone().sub(start.p);delta.y=0;
  const socket=fk(contact).racket.clone().applyQuaternion(worldTurn);
  calibration[kind]={socket,delta:delta.applyQuaternion(worldTurn),startRoot:start.p};
 }
 function feed(){
  feedNo++;stats.feeds++;
  const width=gameMode==='endurance'?3.65:2.85;const targetX=rand(-width,width);
  const isBackhand=clips.backhand&&targetX<actor.position.x-.15;
  const kind=isBackhand?(gameMode==='endurance'&&rnd()>.46?'backhandSlice':'backhand'):(Math.abs(targetX-actor.position.x)>1.65?'forehandReach':'forehand');
  const cal=calibration[kind],hitPoint=V(targetX,cal.socket.y,rand(7.55,gameMode==='endurance'?8.9:8.5));
  const pace=gameMode==='endurance'?.92:1.0;
  const firstT=clamp((1.07+Math.max(0,hitPoint.y-1.05)*.31)*pace,gameMode==='endurance'?.92:1.03,1.36),origin=V(0,1.14,-10.3);
  const initialY=(BALL_R-origin.y+.5*G*firstT*firstT)/firstT;
  const restitution=.79;const afterY=-(initialY-G*firstT)*restitution;
  const discriminant=afterY*afterY-2*G*(hitPoint.y-BALL_R);
  const afterT=discriminant>0?(afterY-Math.sqrt(discriminant))/G:afterY/G;
  const totalT=firstT+afterT;
  const velocity=V((hitPoint.x-origin.x)/totalT,initialY,(hitPoint.z-origin.z)/totalT);
  const startRoot=hitPoint.clone().sub(cal.socket).sub(cal.delta);startRoot.y=0;
  plan={kind,hitTime:simTime+totalT,hitPoint,startRoot,firstT,totalT,restitution,requested:false};
  ball={p:origin,v:velocity,phase:'incoming',bounces:0,restitution};input.queued=false;input.power=0;input.held=false;swing=null;
  tennisBall.visible=true;ballShadow.visible=true;trail.length=0;record('feed',{kind,target:hitPoint.toArray(),startRoot:startRoot.toArray(),gameMode});
 }
 function queueShot(){if(mode!=='play'||paused||demo||swing||replay||gameOver)return;input.held=false;input.queued=true;if(input.power<.1)input.power=.18;record('shot-request',{power:+input.power.toFixed(2)})}
 function beginCharge(){if(mode!=='play'||paused||demo||swing||replay||gameOver)return;input.held=true;input.heldAt=simTime;input.power=0;input.queued=false}
 function startSwing(){
  if(!plan||swing)return;const def=strokeDefs[plan.kind];const remaining=plan.hitTime-simTime;
  swing={kind:plan.kind,elapsed:0,contactDelay:Math.max(.24,remaining),hit:false,power:clamp(input.power||.65,.15,1),prevRoot:sample(plan.kind,def.start).p,started:simTime,completed:false};input.queued=false;input.held=false;prepare=1;record('swing',{kind:plan.kind});
 }
 function fail(reason){stats.misses++;stats.streak=0;record('miss',{reason,gameMode});registerPenalty(reason);if(!gameOver)notify('Next ball',reason==='reach'?'距离不足 · 调整跑位':'没有接到 · 提前蓄力',1.5);clearBall();nextFeed=simTime+modeFeedDelay(1.25);input.queued=false;input.held=false;input.power=0;updateHUD()}
 function racketWorld(){model.updateMatrixWorld(true);return bones[11].localToWorld(RACKET_POINT.clone())}
 function contact(){
  if(!swing||swing.hit)return;swing.hit=true;
  if(!ball||ball.phase!=='incoming'){record('empty-swing');return}
  const r=racketWorld(),err=r.distanceTo(ball.p);stats.contactErrors.push(+err.toFixed(5));stats.shotKinds.push(swing.kind);
  // Reach test is volumetric, not a requirement to stand in a floor circle.
  if(err>.62){fail('reach');return}
  const quality=clamp(1-err/.68,.18,1),pwr=swing.power;
  const target=aim.position.clone();target.y=BALL_R;
  const spread=(1-quality)*1.3+Math.max(0,pwr-.94)*2.5;
  target.x+=rand(-spread,spread);target.z+=rand(-spread,spread);
  const distance=Math.hypot(target.x-r.x,target.z-r.z),fraction=clamp(r.z/(r.z-target.z),.05,.95);
  // Increase flight time, not just vertical speed: clear the net without silently moving the chosen landing point.
  const clearance=1.18,linearHeight=r.y*(1-fraction)+target.y*fraction;
  const safeDuration=Math.sqrt(Math.max(0,2*(clearance-linearHeight)/(G*fraction*(1-fraction))));
  const duration=Math.max(clamp(distance/(15+pwr*13),.68,1.25),safeDuration);
  const vy=(target.y-r.y+.5*G*duration*duration)/duration;
  const vx=(target.x-r.x)/duration,vz=(target.z-r.z)/duration;
  // Small contact correction is visible in telemetry. It is not a physical paddle collision solver.
  ball.p.copy(r);ball.v.set(vx,vy,vz);ball.phase='outgoing';ball.bounces=0;ball.restitution=.70;
  stats.returns++;stats.streak++;stats.best=Math.max(stats.best,stats.streak);stats.speed=ball.v.length()*3.6;record('hit',{kind:swing.kind,error:err,quality,power:pwr,velocity:ball.v.toArray()});
  lastHitTime=simTime;replayCaptureUntil=simTime+.65;tone('hit');hitBurst(r);notify(quality>.90?'Clean.':quality>.55?'Good ball.':'Reach.',`${strokeDefs[swing.kind].label} · ${Math.round(stats.speed)} km/h`,1.1);updateHUD();
 }
 function ballStep(dt){
  if(!ball)return;const b=ball;const prev=b.p.clone();b.p.addScaledVector(b.v,dt);b.p.y-=.5*G*dt*dt;b.v.y-=G*dt;
  if(b.p.y<BALL_R&&b.v.y<0){b.p.y=BALL_R;b.v.y=-b.v.y*b.restitution;b.bounces++;tone('bounce');markBounce(b.p);record('bounce',{phase:b.phase,p:b.p.toArray()});
   if(b.phase==='incoming'&&b.bounces>=2){fail('timing');return}
   if(b.phase==='outgoing'&&b.bounces===1){
    const inside=Math.abs(b.p.x)<=4.115&&b.p.z>=-11.885&&b.p.z<0;
    if(inside){
      stats.in++;
      if(gameMode==='target'&&targetMarker.visible){
        const d=targetMarker.position.distanceTo(V(b.p.x,0,b.p.z));
        if(d<.58){challenge.targetHits++;challenge.score+=d<.26?120:80;notify('Bullseye.',`命中目标 · ${challenge.score} 分`,1.3);spawnTarget();}
        else if(d<1.08){challenge.score+=35;notify('Good zone.',`擦中目标圈 · ${challenge.score} 分`,1.2);spawnTarget();}
        else notify('In.','落点有效 · 继续压制',1.1);
      } else notify('In.',`落点有效 · 连续 ${stats.streak} 球`,1.2)
    }else{stats.out++;stats.streak=0;registerPenalty('out');if(!gameOver)notify('Out.','可以出界 · 降低蓄力或收紧落点',1.4)}
    record('landing',{inside,p:b.p.toArray(),gameMode,score:challenge.score});b.phase='settled';nextFeed=simTime+modeFeedDelay(1.5);updateHUD();
   }
  }
  if(b.phase==='outgoing'&&prev.z>0&&b.p.z<=0&&b.p.y<1.0&&Math.abs(b.p.x)<5.86){b.v.z*=-.13;b.v.x*=.5;b.phase='net';stats.streak=0;registerPenalty('net');record('net');if(!gameOver)notify('Net.','回球未过网',1.4);nextFeed=simTime+modeFeedDelay(1.5);updateHUD();}
  if(b.p.z>16||b.p.z< -19||Math.abs(b.p.x)>15){if(b.phase==='incoming')fail('timing');else{clearBall();nextFeed=simTime+modeFeedDelay(1.0)}}
 }
 function walkingPose(dt,speed){
  const po=sample('forehand',2.05);gait+=dt*(3.8+speed*.55);const amt=clamp(speed/4.6,0,1),sn=Math.sin(gait*2*Math.PI),cs=Math.cos(gait*2*Math.PI);
  twist(po,0,ZAX,input.x*.06*amt);twist(po,1,ZAX,input.x*.08*amt);twist(po,1,XAX,.10+.03*amt);
  twist(po,12,XAX,sn*.34*amt);twist(po,13,XAX,Math.max(0,-sn)*.58*amt);twist(po,15,XAX,-sn*.32*amt);twist(po,16,XAX,Math.max(0,sn)*.52*amt);
  twist(po,5,ZAX,.09*amt+.03*cs*amt);twist(po,6,ZAX,-.18*amt+.06*sn*amt);twist(po,9,ZAX,-.12*amt-.04*cs*amt);twist(po,10,ZAX,.11*amt-.08*sn*amt);
  po.p.y+=Math.abs(sn)*.015*amt;po.p.z-=.02*amt;return po;
 }
 function animationStep(dt){
  if(mode==='motion'){
   const def=strokeDefs[labKind];if(labPlaying)labTime=def.inspectStart+((labTime-def.inspectStart+dt*labSpeed)%(def.inspectEnd-def.inspectStart));
   const po=sample(labKind,labTime);applyPose(po,true);helper.visible=$('skeletonToggle').checked;pathLine.visible=helper.visible;updateMotionUI();return;
  }
  if(mode==='intro'){const po=sample('forehand',mix(0,.38,(Math.sin(simTime*.65)+1)*.5));applyPose(po);return}
  if(swing){
   const def=strokeDefs[swing.kind],sw=swing;sw.elapsed+=dt;let time;
   if(sw.elapsed<=sw.contactDelay)time=mix(def.start,def.contact,sw.elapsed/sw.contactDelay);
   else time=mix(def.contact,def.end,clamp((sw.elapsed-sw.contactDelay)/.62,0,1));
   const po=sample(sw.kind,time);const delta=po.p.clone().sub(sw.prevRoot);delta.y=0;actor.position.add(delta.applyQuaternion(worldTurn));sw.prevRoot.copy(po.p);applyPose(po);
   if(!sw.hit&&sw.elapsed>=sw.contactDelay)contact();
   if(sw.elapsed>sw.contactDelay+.62){sw.completed=true;const u=smooth((sw.elapsed-sw.contactDelay-.62)/.25),idle=walkingPose(0,0);for(let i=0;i<18;i++)po.q[i].slerp(idle.q[i],u);po.p.y=mix(po.p.y,idle.p.y,u);applyPose(po);if(u>=1){swing=null;input.power=0;prepare=0}}
   return;
  }
  const move=V(input.x,0,input.z);if(keys.has('KeyA')||keys.has('ArrowLeft'))move.x-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))move.x+=1;if(keys.has('KeyW')||keys.has('ArrowUp'))move.z-=1;if(keys.has('KeyS')||keys.has('ArrowDown'))move.z+=1;
  const manual=move.lengthSq()>.005;
  let desired=V();
  if(manual){desired.copy(move).clampLength(0,1).multiplyScalar(4.9)}
  else if((assist||demo)&&plan&&ball?.phase==='incoming'){const delta=plan.startRoot.clone().sub(actor.position);const remaining=plan.hitTime-simTime-.38;desired.copy(delta).multiplyScalar(1/Math.max(.07,remaining)).clampLength(0,6.4)}
  else if(demo&&!plan){desired.copy(V(-.4,0,8.1).sub(actor.position)).multiplyScalar(1.3).clampLength(0,2.8)}
  const old=actor.position.clone();actor.position.addScaledVector(desired,dt);actor.position.x=clamp(actor.position.x,-6.1,6.1);actor.position.z=clamp(actor.position.z,1.25,13.8);moveSpeed=old.distanceTo(actor.position)/Math.max(dt,.001);
  let po=walkingPose(dt,moveSpeed);
  const targetPrep=(input.held||input.queued||demo&&plan&&plan.hitTime-simTime<.95)?1:0;prepare=mix(prepare,targetPrep,1-Math.exp(-dt*8));
  if(prepare>.002&&plan){const prepPose=sample(plan.kind,strokeDefs[plan.kind].start);const w=prepare*(moveSpeed>1.4?.6:1);for(let i=0;i<18;i++)po.q[i].slerp(prepPose.q[i],w);po.p.y=mix(po.p.y,prepPose.p.y,w)}
  applyPose(po);
 }
 function updateMotionUI(){const def=strokeDefs[labKind],base=clips[def.base||labKind],fraction=(labTime-def.inspectStart)/(def.inspectEnd-def.inspectStart);$('scrub').value=String(clamp(fraction,0,1));$('clipTime').textContent=`${(labTime-def.inspectStart).toFixed(2)} / ${(def.inspectEnd-def.inspectStart).toFixed(2)}s`;$('phaseLabel').textContent=labTime<def.start?'转体准备':labTime<def.contact-.1?'引拍':labTime<def.contact+.09?'击球区间':'随挥与回位';$('sampleCount').textContent=`${base.times.length} 个源姿态 / ${def.derived?'派生动作':'基动作'} / ${base.sampling==='full-frame'?'完整源帧':'非完整帧率'}`;$('motionDrive').textContent=def.drive;$('motionSource').textContent=def.source;$('motionPlayBtn').textContent=labPlaying?'Ⅱ':'▶'}
 function step(dt){
  if(replay){replayStep(dt);return}if(paused&&mode==='play')return;simTime+=dt;
  if(mode==='play'){
   if((!ball||['settled','net'].includes(ball.phase))&&simTime>=nextFeed&&!swing)feed();
   if(input.held)input.power=clamp((simTime-input.heldAt)/.46,0,1);
   if(demo&&plan&&ball?.phase==='incoming'&&!swing){input.power=clamp((.92-(plan.hitTime-simTime))/.52,0,.83);if(plan.hitTime-simTime<=.37)input.queued=true}
   if(input.queued&&plan&&!swing&&plan.hitTime-simTime<=.37&&plan.hitTime-simTime>-.07)startSwing();
   // Physics and the animation are advanced on the same fixed clock.
   ballStep(dt);animationStep(dt);
   if(ball?.phase==='incoming'&&plan&&simTime>plan.hitTime+.5&&!swing)fail('timing');
   recordFrame();if(frameNo%6===0)updateHUD();
  }else animationStep(dt);
  if(toastUntil&&simTime>toastUntil){$('sessionToast').classList.remove('show');toastUntil=0}
  for(let i=bounceMarks.length-1;i>=0;i--){const m=bounceMarks[i];m.age+=dt;m.o.scale.setScalar(1+m.age*3);m.o.material.opacity=Math.max(0,.7-m.age*.55);if(m.age>1.3){scene.remove(m.o);m.o.geometry.dispose();m.o.material.dispose();bounceMarks.splice(i,1)}}
  for(let i=hitFX.length-1;i>=0;i--){const f=hitFX[i];f.age+=dt;f.v.y-=G*dt;f.o.position.addScaledVector(f.v,dt);f.o.scale.setScalar(Math.max(0,1-f.age/.4));if(f.age>.4){scene.remove(f.o);f.o.geometry.dispose();hitFX.splice(i,1)}}
  frameNo++;
 }
 function draw(dt=1/60){
  const mobile=innerWidth<600,portrait=innerHeight>innerWidth;
  if(replay){
   targetCamera.copy(actor.position).add(V(3.0,1.65,2.4));targetLook.copy(actor.position).add(V(0,1.03,0));camera.fov=portrait?53:45;
  }else if(mode==='motion'){
   targetCamera.set(Math.sin(labTheta)*labDistance,labElevation,Math.cos(labTheta)*labDistance);targetLook.set(mobile?-.04:-.61,mobile?.94:1.03,0);camera.fov=mobile?46:38;
  }else if(mode==='intro'){
   const orbit=settings.effects?Math.sin(simTime*.075)*.20:0;
   targetCamera.set(mobile?1.8:1.5+orbit,mobile?1.92:1.78,mobile?12.35:11.95);targetLook.set(mobile?-1.29:-1.68,mobile?1.02:1.04,8.3);camera.fov=mobile?49:43;
  }else if(settings.camera==='wide'||portrait){
   targetCamera.set(portrait?actor.position.x*.55+.75:5.8,portrait?13.8:10.5,portrait?26.0:23.3);targetLook.set(portrait?actor.position.x*.30:0,.55,portrait?2.0:.4);camera.fov=portrait?51:46;
  }else{
   targetCamera.set(clamp(actor.position.x*.32+1.25,-1.4,3),5.1,clamp(actor.position.z+10.0,17.0,22.0));targetLook.set(actor.position.x*.13,.62,-.50);camera.fov=48;
  }
  if(settings.effects&&mode==='play'&&!replay&&!paused){const hitAge=simTime-lastHitTime;if(hitAge>=0&&hitAge<.25){targetCamera.x+=Math.sin(hitAge*75)*.045*Math.exp(-hitAge*14);targetCamera.y+=Math.cos(hitAge*90)*.018*Math.exp(-hitAge*14)}}
  const a=1-Math.exp(-dt*5);camera.position.lerp(targetCamera,a);cameraLook.lerp(targetLook,a);camera.lookAt(cameraLook);camera.updateProjectionMatrix();
  playerShadow.position.set(actor.position.x,.046,actor.position.z);playerShadow.scale.set(1+clamp(moveSpeed/10,0,.2),1,1+clamp(moveSpeed/10,0,.2));
  if(targetMarker.visible){targetOuter.rotation.z+=dt*.35;targetInner.rotation.z-=dt*.22;targetGlow.material.opacity=.18+Math.sin(simTime*4)*.07}
  const displayBall=replay?replay.ball:ball?.p;$('impactFlash').style.opacity=settings.effects&&mode==='play'&&!replay?String(clamp(1-(simTime-lastHitTime)/.16,0,1)):0;
  if(displayBall){tennisBall.position.copy(displayBall);tennisBall.rotation.x+=dt*5;tennisBall.rotation.z+=dt*9;ballShadow.position.set(displayBall.x,.046,displayBall.z);ballShadow.scale.setScalar(1+displayBall.y*.2);ballShadow.material.opacity=clamp(.58-displayBall.y*.05,.1,.58);if(!paused&&!replay)trail.unshift(displayBall.clone());if(trail.length>24)trail.pop();for(let i=0;i<trail.length;i++)trail[i].toArray(trailArray,i*3);trailGeo.attributes.position.needsUpdate=true;trailGeo.setDrawRange(0,trail.length)}
  aimRing.rotation.z+=dt*.10;helper.updateMatrixWorld(true);updateRacketTrail();presentation.render(scene,camera,simTime);
 }
 $('playBtn').onclick=()=>switchMode('play',false);$('demoBtn').onclick=()=>switchMode('play',true);$('home').onclick=e=>{e.preventDefault();switchMode('intro')};
 $('courtTab').onclick=()=>switchMode('play',false);$('motionTab').onclick=()=>switchMode('motion');$('restartBtn').onclick=()=>switchMode('play',demo);$('pauseBtn').onclick=()=>{if(replay)exitReplay();else setPaused(!paused)};
 $('assistBtn').onclick=()=>{assist=!assist;$('assistBtn').classList.toggle('active',assist);$('assistBtn').querySelector('b').textContent=assist?'开':'关'};$('modeRallyBtn').onclick=()=>selectGameMode('rally');$('modeTargetBtn').onclick=()=>selectGameMode('target');$('modeEnduranceBtn').onclick=()=>selectGameMode('endurance');updateModeButtons();$('challengeHint').textContent=describeMode();
 $('soundBtn').onclick=()=>{muted=!muted;$('soundBtn').style.opacity=muted?'.5':'1';$('soundBtn').title=muted?'开启声音':'关闭声音';$('soundBtn').setAttribute('aria-label',muted?'开启声音':'关闭声音');if(!muted)tone('hit')};$('soundBtn').style.opacity='.5';
 $('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen?.()}catch{notify('Fullscreen','浏览器未允许全屏',2)}};
 const fullMotion=Object.values(clips).every(c=>c.sampling==='full-frame');if(fullMotion){$('motionCacheLabel').textContent='完整源帧已缓存';$('fullCacheLabel').textContent='已缓存'}
 const assetsDialog=$('assetsDialog'),settingsDialog=$('settingsDialog'),modalStates=new WeakMap();
 function restoreDialogState(dialog){if(!modalStates.has(dialog))return;const saved=modalStates.get(dialog);modalStates.delete(dialog);if(mode==='play'&&!gameOver)paused=saved}
 function closeDialog(dialog){restoreDialogState(dialog);dialog.close()}
 function openDialog(dialog){if(dialog.open)return;if(replay)exitReplay();modalStates.set(dialog,paused);if(mode==='play'){paused=true;input.held=false;input.queued=false;keys.clear();input.x=input.z=0}dialog.showModal()}
 for(const [dialog,button,close] of [[assetsDialog,$('assetsTab'),$('closeAssets')],[settingsDialog,$('settingsBtn'),$('closeSettings')]]){
  button.onclick=()=>openDialog(dialog);close.onclick=()=>closeDialog(dialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog(dialog)});
  dialog.addEventListener('close',()=>restoreDialogState(dialog));
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dialog)}});
 }
 function applySettings(){
  const quality=settings.quality,dpr=Math.min(devicePixelRatio||1,quality==='high'?2:quality==='eco'?1:touchDevice?1.25:1.6,2600/Math.max(innerWidth,innerHeight));renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight);presentation.quality(quality);
  const size=quality==='high'?2048:quality==='eco'?768:1536;if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.needsUpdate=true}
  venue.lighting(settings.light);venue.foliage.visible=quality!=='eco';model.userData.setOutfit(settings.outfit);$('effectsToggle').checked=settings.effects;performanceData.dpr=dpr;
  document.querySelectorAll('[data-quality]').forEach(b=>b.classList.toggle('active',b.dataset.quality===quality));document.querySelectorAll('[data-light]').forEach(b=>b.classList.toggle('active',b.dataset.light===settings.light));document.querySelectorAll('[data-outfit]').forEach(b=>b.classList.toggle('active',b.dataset.outfit===settings.outfit));
  $('cameraBtn').setAttribute('aria-label',settings.camera==='follow'?'切换到全场镜头':'切换到追踪镜头');saveSettings();
 }
 document.querySelectorAll('[data-quality]').forEach(b=>b.onclick=()=>{settings.quality=b.dataset.quality;applySettings()});document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>{settings.light=b.dataset.light;applySettings()});document.querySelectorAll('[data-outfit]').forEach(b=>b.onclick=()=>{settings.outfit=b.dataset.outfit;applySettings()});$('effectsToggle').onchange=()=>{settings.effects=$('effectsToggle').checked;saveSettings()};
 $('cameraBtn').onclick=()=>{settings.camera=settings.camera==='follow'?'wide':'follow';$('cameraBtn').setAttribute('aria-label',settings.camera==='follow'?'切换到全场镜头':'切换到追踪镜头');saveSettings()};$('introMotionBtn').onclick=()=>switchMode('motion');$('replayBtn').onclick=startReplay;$('exitReplayBtn').onclick=exitReplay;
 function selectMotion(kind){if(!strokeDefs[kind])return;labKind=kind;labTime=strokeDefs[kind].inspectStart;for(const [id,key] of [['fhBtn','forehand'],['frBtn','forehandReach'],['bhBtn','backhand'],['bsBtn','backhandSlice']])$(id).classList.toggle('active',kind===key);rebuildPath(kind);updateMotionUI()}
 $('fhBtn').onclick=()=>selectMotion('forehand');$('frBtn').onclick=()=>selectMotion('forehandReach');$('bhBtn').onclick=()=>selectMotion('backhand');$('bsBtn').onclick=()=>selectMotion('backhandSlice');$('motionPlayBtn').onclick=()=>{labPlaying=!labPlaying;updateMotionUI()};$('slowBtn').onclick=()=>{labSpeed=labSpeed===.5?1:labSpeed===1?.25:.5;$('slowBtn').textContent=labSpeed+'×'};
 $('scrub').addEventListener('input',()=>{labPlaying=false;const d=strokeDefs[labKind];labTime=mix(d.inspectStart,d.inspectEnd,Number($('scrub').value));applyPose(sample(labKind,labTime),true);updateMotionUI()});
 $('wireToggle').onchange=()=>model.traverse(o=>{if(o.isMesh)o.material.wireframe=$('wireToggle').checked});
 window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&mode==='play')e.preventDefault();if(assetsDialog.open||settingsDialog.open)return;keys.add(e.code);if(e.repeat)return;if(e.code==='KeyJ'){startReplay();return}if(e.code==='Escape'&&replay){exitReplay();return}if(e.code==='Space')beginCharge();if(e.code==='KeyP'&&mode==='play'&&!replay)setPaused(!paused);if(e.code==='KeyR'&&mode==='play')switchMode('play',demo)});
 window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&input.held)queueShot()});window.addEventListener('blur',()=>{keys.clear();input.x=input.z=0;if(input.held)input.held=false;input.queued=false;if(mode==='play')setPaused(true)});
 $('hitButton').addEventListener('pointerdown',e=>{e.preventDefault();$('hitButton').setPointerCapture(e.pointerId);beginCharge()});$('hitButton').addEventListener('pointerup',e=>{e.preventDefault();if(input.held)queueShot()});$('hitButton').addEventListener('pointercancel',()=>input.held=false);
 let joyId=null;const joy=$('joystick'),knob=$('joystickKnob');function joyMove(e){const r=joy.getBoundingClientRect();const v=V(e.clientX-r.left-r.width/2,0,e.clientY-r.top-r.height/2).clampLength(0,r.width*.35);input.x=v.x/(r.width*.35);input.z=v.z/(r.width*.35);knob.style.transform=`translate(${v.x}px,${v.z}px)`}
 joy.onpointerdown=e=>{joyId=e.pointerId;joy.setPointerCapture(joyId);joyMove(e)};joy.onpointermove=e=>{if(joyId===e.pointerId)joyMove(e)};joy.onpointerup=joy.onpointercancel=()=>{joyId=null;input.x=input.z=0;knob.style.transform=''};
 const raycaster=new T.Raycaster(),groundPlane=new T.Plane(V(0,1,0),0);let pointer=null;
 canvas.onpointerdown=e=>{pointer={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};canvas.setPointerCapture(e.pointerId)};
 canvas.onpointermove=e=>{if(!pointer)return;if(mode==='motion'){labTheta-=(e.clientX-pointer.lastX)*.008;labElevation=clamp(labElevation+(e.clientY-pointer.lastY)*.008,.4,4.2)}pointer.lastX=e.clientX;pointer.lastY=e.clientY};
 canvas.onpointerup=e=>{if(pointer&&mode==='play'&&!replay&&!paused&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<12){const ndc=new T.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2);raycaster.setFromCamera(ndc,camera);const p=raycaster.ray.intersectPlane(groundPlane,V());if(p&&p.z<-.4){aim.position.set(clamp(p.x,-5.5,5.5),.045,clamp(p.z,-13,-2));$('aimHint').textContent='落点已更新 · 边线外也可瞄准';record('aim',{target:aim.position.toArray()})}}pointer=null};
 canvas.addEventListener('wheel',e=>{if(mode==='motion'){e.preventDefault();labDistance=clamp(labDistance+e.deltaY*.002,2.7,6)}},{passive:false});
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);presentation.resize()});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;$('fatal').classList.remove('hidden');$('fatalMessage').textContent='WebGL 上下文丢失。关闭其他高负载页面后重新加载。'});
 const telemetry=()=>{const def=strokeDefs[labKind],base=clips[def.base||labKind];return {build:'court-study-cypress-1.0.0-rc1',mode,gameMode,demo,assist,paused,gameOver,replay:!!replay,replayFrameCount:replayFrames.length,settings:{...settings},simTime:+simTime.toFixed(3),input:{held:input.held,power:input.power,queued:input.queued},stats:JSON.parse(JSON.stringify(stats)),challenge:JSON.parse(JSON.stringify(challenge)),target:targetMarker.position.toArray(),actor:actor.position.toArray(),ball:ball?{p:ball.p.toArray(),phase:ball.phase,bounces:ball.bounces}:null,motion:{kind:labKind,time:labTime,source:def.source,sampling:base.sampling,derived:def.derived},render:{triangles:presentation.last.triangles,calls:presentation.last.calls,characterTriangles:model.userData.triangles,...performanceData},assets:A.manifest}};
 $('exportTelemetry').onclick=()=>{const blob=new Blob([JSON.stringify(telemetry(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='court-study-validation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 function inspectRig(){let meshes=0,vertices=0,maxWeightError=0,finite=true;model.traverse(o=>{if(o.isSkinnedMesh){meshes++;const w=o.geometry.attributes.skinWeight,ids=o.geometry.attributes.skinIndex,pos=o.geometry.attributes.position;vertices+=pos.count;for(let i=0;i<w.count;i++){const ww=[w.getX(i),w.getY(i),w.getZ(i),w.getW(i)];maxWeightError=Math.max(maxWeightError,Math.abs(ww.reduce((a,b)=>a+b,0)-1));if(!ww.every(Number.isFinite)||!Number.isFinite(pos.getX(i)+pos.getY(i)+pos.getZ(i)))finite=false;for(const j of [ids.getX(i),ids.getY(i),ids.getZ(i),ids.getW(i)])if(j<0||j>=18)finite=false}}});return {bones:bones.length,meshes,vertices,maxWeightError,finite:finite&&bones.every(b=>b.matrixWorld.elements.every(Number.isFinite)),socketAttached:racket.parent===bones[11]}}
 window.__court={ready:true,inspectRig,telemetry,render:()=>draw(10),freeze:v=>externalFreeze=v,startDemo:()=>switchMode('play',true),startPractice:()=>switchMode('play',false),setMode:switchMode,setGameMode:selectGameMode,setSetting:(k,v)=>{if(k in settings){settings[k]=v;applySettings()}},setLabView:(t,e,d)=>{labTheta=t;labElevation=e;labDistance=d;draw(10)},startReplay,exitReplay,step:(seconds,render=true)=>{externalFreeze=true;for(let i=0,n=Math.round(seconds*120);i<n;i++){step(1/120)}if(render)draw(10);return telemetry()},seek:(kind,time,render=true)=>{if(mode!=='motion')switchMode('motion');selectMotion(kind);labPlaying=false;labTime=time;applyPose(sample(kind,time),true);if(render)draw(10);updateMotionUI();return telemetry()},charge:beginCharge,release:queueShot,aimAt:(x,z)=>{aim.position.set(clamp(x,-5.5,5.5),.045,clamp(z,-13,-2))},setAssist:v=>{assist=v;$('assistBtn').classList.toggle('active',assist);$('assistBtn').querySelector('b').textContent=assist?'开':'关'},setInput:(x,z)=>{input.x=x;input.z=z},calibration:Object.fromEntries(Object.entries(calibration).map(([k,v])=>[k,{socket:v.socket.toArray(),delta:v.delta.toArray()}]))};
 applySettings();switchMode('intro');updateMotionUI();draw(10);$('loading').classList.add('hidden');$('buildInfo').textContent=`OFFLINE / ${A.buildDate} / ${A.manifest.length} RESOURCE ENTRIES`;
 let last=performance.now(),accumulator=0;
 function frame(now){const dt=Math.max(0,Math.min(.07,(now-last)/1000));last=now;if(!externalFreeze){accumulator+=dt;while(accumulator>=1/120){step(1/120);accumulator-=1/120}draw(dt);if(performanceData.frameMS.length<240)performanceData.frameMS.push(+((dt)*1000).toFixed(2))}requestAnimationFrame(frame)}
 requestAnimationFrame(frame);record('ready');
 }catch(error){console.error(error);$('loading').classList.add('hidden');$('fatal').classList.remove('hidden');$('fatalMessage').textContent=String(error?.message||error);window.__courtError=String(error?.stack||error)}
})();
