/* Rain/Snow adaptations: Blender Studio CC-BY. Attribution is in About. */
window.ClubCharacters=(function(){
 const T=window.THREE, V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), Q=()=>new T.Quaternion();
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n)};
 const library=window.CLUB_ASSETS.motion;
 const defs={...library.clips};
 defs.reach={...defs.forehand,label:'正手救球',derived:true,sourceKind:'forehand'};
 defs.slice={...defs.backhand,label:'反手切削',derived:true,sourceKind:'backhand'};
 function rawPose(kind,time,character='rain'){
  const c=defs[kind]||window.CLUB_ASSETS.locomotion?.clips[kind]||defs.forehand;time=clamp(time,0,c.duration);let hi=1;while(hi<c.times.length-1&&c.times[hi]<time)hi++;let lo=hi-1;const u=clamp((time-c.times[lo])/(c.times[hi]-c.times[lo]),0,1);
  const po={q:c.q[lo].map((q,i)=>Q().fromArray(q).slerp(Q().fromArray(c.q[hi][i]),u)),p:V(...c.p[lo]).lerp(V(...c.p[hi]),u)};
  const full=window.CLUB_ASSETS[`${character}Motion`]?.clips[c.sourceKind||kind];
  if(full)po.full={p:full.p[lo].map((p,i)=>V(...p).lerp(V(...full.p[hi][i]),u)),q:full.q[lo].map((q,i)=>Q().fromArray(q).slerp(Q().fromArray(full.q[hi][i]),u)),s:full.s[lo].map((s,i)=>V(...s).lerp(V(...full.s[hi][i]),u))};
  if(c.derived){const envelope=smooth(time/c.contact)*(1-smooth((time-c.contact)/(c.duration-c.contact)));
   if(kind==='reach'){po.q[1].multiply(Q().setFromAxisAngle(V(0,0,1),-.11*envelope));po.q[9].multiply(Q().setFromAxisAngle(V(0,1,0),-.08*envelope));}
   else{po.q[11].multiply(Q().setFromAxisAngle(V(1,0,0),-.16*envelope));}
  }
  return po;
 }
 function mixPose(a,b,w){const out={q:a.q.map((q,i)=>q.clone().slerp(b.q[i],w)),p:a.p.clone().lerp(b.p,w)};if(a.full&&b.full)out.full={p:a.full.p.map((p,i)=>p.clone().lerp(b.full.p[i],w)),q:a.full.q.map((q,i)=>q.clone().slerp(b.full.q[i],w)),s:a.full.s.map((s,i)=>s.clone().lerp(b.full.s[i],w))};else out.full=b.full||a.full;return out}
 function fromBase64(data){const raw=atob(data),arr=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return arr.buffer}
 async function load(name){const loader=new window.BASELINE_ENGINE.GLTFLoader();const a=window.CLUB_ASSETS.characters[name];if(!a)throw Error('人物资源缺失：'+name);return new Promise((resolve,reject)=>loader.parse(fromBase64(a),'',resolve,reject))}
 class Character{
  constructor(gltf,name){
   this.name=name;this.model=gltf.scene;this.group=new T.Group();this.group.add(this.model);this.facing=0;this.gait=0;this.kind='forehand';this.time=0;this.stance=0;
   this.model.traverse(n=>{if(n.userData?.rig)this.rig=n.userData.rig;if(n.userData?.professionalRig)this.professionalRig=n.userData.professionalRig});
   if(!this.rig)throw Error('角色缺少适配骨架');this.bones=this.rig.names.map(n=>this.model.getObjectByName(n));this.materials=[];const localMaterials=new Map();this.model.traverse(n=>{if(n.isMesh){const clone=m=>{if(!localMaterials.has(m))localMaterials.set(m,m.clone());return localMaterials.get(m)};n.material=Array.isArray(n.material)?n.material.map(clone):clone(n.material);}});
   this.model.traverse(n=>{if(n.isMesh){n.castShadow=n.receiveShadow=true;n.frustumCulled=false;const m=Array.isArray(n.material)?n.material:[n.material];m.forEach(mat=>{mat.envMapIntensity=.45;if(!this.materials.includes(mat)){mat.userData.baseColor=mat.color.clone();this.materials.push(mat)}})}});
   const findBone=n=>this.model.getObjectByName(n)||this.model.getObjectByName(n.replace(/[.\[\]:/]/g,''));
   this.deformBones=this.professionalRig?.names.map(findBone);this.gripBone=this.professionalRig?findBone(this.professionalRig.rightHand):this.bones[11];
   this.socket=new T.Group();this.socket.name='RacketSocket';this.gripBone.add(this.socket);
   if(this.professionalRig){this.socket.position.fromArray(this.professionalRig.socketPosition||[-.028,.079,0]);this.socket.rotation.set(...(this.professionalRig.socketRotation||[-Math.PI/2,0,0]));this.socket.scale.setScalar(1/this.rig.scale)}else this.socket.position.set(.037,-.056,.018);
   this.racketCenter=V(0,-.45,0);this.makeRacket();this.rootRatio=this.rig.offsets[0][1]/.912;
   this.lastPose=null;this.contacts={};
   Object.keys(defs).forEach(kind=>{const d=defs[kind],p=rawPose(kind,d.contact,this.name);this.apply(p);this.group.updateMatrixWorld(true);const point=this.group.worldToLocal(this.racketWorld());this.contacts[kind]={point:point.clone(),quat:this.gripBone.getWorldQuaternion(Q()),root:p.p.clone()};});
   this.setAnimation('forehand',0);this.setOutfit('ivory');
  }
  makeRacket(){
   const matte=new T.MeshStandardMaterial({color:'#234d41',roughness:.37,metalness:.24}),ivory=new T.MeshStandardMaterial({color:'#eee8d8',roughness:.85}),accent=new T.MeshStandardMaterial({color:'#d39463',roughness:.42});
   const add=(g,m,p)=>{const o=new T.Mesh(g,m);if(p)o.position.copy(p);o.castShadow=true;this.socket.add(o);return o};
   const curve=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;curve.push(V(Math.sin(a)*.135,-.45+Math.cos(a)*.177,0))}
   add(new T.TubeGeometry(new T.CatmullRomCurve3(curve),96,.0095,8,false),matte);
   add(new T.CylinderGeometry(.015,.017,.176,12),ivory,V(0,-.024,0));
   for(const s of [-1,1])add(new T.TubeGeometry(new T.CatmullRomCurve3([V(0,-.11,0),V(s*.03,-.20,0),V(s*.066,-.29,0)]),18,.008,7,false),matte);
   for(let i=0;i<8;i++){const o=add(new T.TorusGeometry(.016,.001,5,14),accent,V(0,.049-i*.02,0));o.rotation.x=Math.PI/2;}
   const strings=[];for(let i=-7;i<=7;i++){const x=i*.016,y=.165*Math.sqrt(1-x*x/(.126*.126));strings.push(x,-.45-y,0,x,-.45+y,0)}for(let i=-9;i<=9;i++){const y=i*.017,x=.126*Math.sqrt(Math.max(0,1-y*y/.165**2));strings.push(-x,-.45+y,0,x,-.45+y,0)}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(strings,3));this.socket.add(new T.LineSegments(g,new T.LineBasicMaterial({color:'#eee9c9',transparent:true,opacity:.8})));
  }
  setOutfit(style){
   const palette={ivory:['#e7e9d5','#173e37','#efeddf'],green:['#487566','#d9dcc5','#cfd5c3'],rust:['#b55b43','#27343a','#e5dac1'],navy:['#355d7a','#d9d7bc','#e9e2ca']};const p=palette[style]||palette.ivory;
   this.materials.forEach(m=>{const n=m.name.toLowerCase();if(/top|shirt/.test(n))m.color.set(p[0]);else if(/jeans|pants/.test(n))m.color.set(p[1]);else if(/shoe/.test(n))m.color.set(p[2]);else m.color.copy(m.userData.baseColor)});
  }
  pose(kind,t){return rawPose(kind,t,this.name)}
  apply(po,rootOffset=false){
   for(let i=0;i<18;i++)this.bones[i].quaternion.copy(po.q[i]);
   if(this.deformBones&&po.full)this.deformBones.forEach((b,i)=>{b.position.copy(po.full.p[i]);b.quaternion.copy(po.full.q[i]);b.scale.copy(po.full.s[i])});
   this.bones[0].position.set(rootOffset?po.p.x:0,po.p.y*this.rootRatio,this.rig.offsets[0][2]);
   this.model.position.y=0;this.group.updateMatrixWorld(true);
   let bottom=Infinity;for(const b of [14,17])for(const o of [V(0,-.075,-.03),V(0,-.07,.16)]){this.bones[b].localToWorld(o);bottom=Math.min(bottom,o.y-this.group.position.y)}
   this.model.position.y=-bottom+.013;this.group.updateMatrixWorld(true);this.lastPose=po;
  }
  setAnimation(kind,time,aim=null){
   this.idleKind=null;
   this.kind=kind;this.time=time;const po=rawPose(kind,time,this.name);this.apply(po);
   if(!this.professionalRig&&(kind==='backhand'||kind==='backVolley'||kind==='slice')&&time>defs[kind].start*.6){
    const w=smooth(time/Math.max(.1,defs[kind].start));const target=this.socket.localToWorld(V(0,-.13,0));const hand=this.bones[7].getWorldPosition(V());if(hand.distanceTo(target)<.36)this.armIK(5,target,w*.75);
   }
   // Only small corrections; never stretch an arm to a distant ball.
   if(aim&&!this.professionalRig){const d=this.racketWorld().distanceTo(aim);if(d<.30){const target=this.bones[11].getWorldPosition(V()).add(aim.clone().sub(this.racketWorld()));this.armIK(9,target,1)}}
   // Calibrate the displayed string plane once per animation kind; it always stays on the hand.
   const c=this.contacts[kind];if(c&&!this.professionalRig){const v=V(0,0,1).applyQuaternion(c.quat.clone().invert());this.socket.rotation.y=Math.atan2(v.x,v.z)}this.lastPose.q=this.bones.map(b=>b.quaternion.clone());
  }
  armIK(shoulderIndex,target,weight){
   const b=this.bones,si=shoulderIndex,ei=si+1,wi=si+2,s=b[si].getWorldPosition(V()),e=b[ei].getWorldPosition(V()),h=b[wi].getWorldPosition(V());
   const wanted=h.clone().lerp(target,weight),dir=wanted.clone().sub(s),l1=s.distanceTo(e),l2=e.distanceTo(h),d=clamp(dir.length(),.08,l1+l2-.002);dir.normalize();
   let pole=e.clone().sub(s).addScaledVector(dir,-e.clone().sub(s).dot(dir));if(pole.length()<.001)pole=V(0,-1,0);pole.normalize();
   const x=(l1*l1-l2*l2+d*d)/(2*d),y=Math.sqrt(Math.max(0,l1*l1-x*x)),elbow=s.clone().addScaledVector(dir,x).addScaledVector(pole,y);
   let dq=Q().setFromUnitVectors(e.clone().sub(s).normalize(),elbow.sub(s).normalize());let q=dq.multiply(b[si].getWorldQuaternion(Q()));b[si].quaternion.copy(b[si].parent.getWorldQuaternion(Q()).invert().multiply(q));this.group.updateMatrixWorld(true);
   const e2=b[ei].getWorldPosition(V()),h2=b[wi].getWorldPosition(V());dq=Q().setFromUnitVectors(h2.sub(e2).normalize(),wanted.sub(e2).normalize());q=dq.multiply(b[ei].getWorldQuaternion(Q()));b[ei].quaternion.copy(b[ei].parent.getWorldQuaternion(Q()).invert().multiply(q));this.group.updateMatrixWorld(true);
  }
  idle(dt,speed=0,velocity=V()){
   const clips=window.CLUB_ASSETS.locomotion?.clips,full=window.CLUB_ASSETS[`${this.name}Motion`]?.clips;
   if(clips?.run&&(!this.professionalRig||full?.run)){
    const v=velocity.clone().applyAxisAngle(V(0,1,0),-this.group.rotation.y),moving=speed>.08;
    const kind=!moving?'ready':Math.abs(v.x)>Math.abs(v.z)*.7?(v.x<0?'strafeLeft':'strafeRight'):v.z<0?'backward':'run';
    const clip=clips[kind],ready=rawPose('forehand',.03,this.name);
    let cyclePose=null;
    if(clip){const nominal=kind==='run'?3.2:kind==='backward'?1.8:2.5,overlap=Math.min(.1,clip.duration*.12),cycle=clip.duration-overlap;this.gait=(this.gait+Math.max(0,dt)*clamp(speed/nominal,.45,1.6)/cycle)%1;const time=this.gait*cycle+overlap;cyclePose=rawPose(kind,time,this.name);if(time>cycle)cyclePose=mixPose(cyclePose,rawPose(kind,time-cycle,this.name),smooth((time-cycle)/overlap))}
    let po=cyclePose?mixPose(ready,cyclePose,smooth(speed/.7)):ready;
    if(kind!==this.idleKind){this.idleFrom=this.lastPose?mixPose(this.lastPose,this.lastPose,0):po;this.idleElapsed=dt===0?.16:0;this.idleKind=kind}
    this.idleElapsed=Math.min(.16,this.idleElapsed+Math.max(0,dt));
    if(this.idleFrom&&this.idleElapsed<.16)po=mixPose(this.idleFrom,po,smooth(this.idleElapsed/.16));
    this.apply(po);return;
   }
   this.gait+=dt*(1.5+speed*.4);const po=rawPose('forehand',.03,this.name);const amount=clamp(speed/5,0,1),s=Math.sin(this.gait*6.283),q=Q();
   const lateral=velocity.x*Math.cos(this.group.rotation.y)>0?1:-1;
   for(const [hip,knee,v] of [[12,13,s],[15,16,-s]]){po.q[hip].multiply(q.setFromAxisAngle(V(1,0,0),v*.40*amount));po.q[knee].multiply(q.setFromAxisAngle(V(1,0,0),Math.max(0,-v)*.62*amount));}
   po.q[1].multiply(q.setFromAxisAngle(V(0,0,1),-.045*lateral*amount));po.p.y+=Math.abs(s)*.024*amount;this.apply(po);
  }
  racketWorld(){this.group.updateMatrixWorld(true);return this.socket.localToWorld(this.racketCenter.clone())}
  localContact(kind){return this.contacts[kind].point.clone()}
  worldContact(kind){return this.localContact(kind).applyAxisAngle(V(0,1,0),this.group.rotation.y).add(this.group.position)}
  diagnostics(){let triangles=0,vertices=0,weightError=0;this.model.traverse(n=>{if(n.isSkinnedMesh){const g=n.geometry;triangles+=g.index?g.index.count/3:g.attributes.position.count/3;vertices+=g.attributes.position.count;const w=g.attributes.skinWeight;for(let i=0;i<w.count;i++)weightError=Math.max(weightError,Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1))}});return {name:this.name,bones:18+(this.deformBones?.length||0),deformBones:this.deformBones?.length||18,professionalRig:!!this.professionalRig,triangles,vertices,weightError,socketAttached:this.socket.parent===this.gripBone}}
 }
 return {defs,rawPose,load,Character};
})();

/* Shared deterministic ball simulation and contact-state shot model. Units: m, s, rad/s. */
window.ClubPhysics=(function(){
 const T=window.THREE,V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const C={gravity:9.81,radius:.0335,drag:.008,magnus:.00125,restitution:.73,courtX:4.115,courtZ:11.885,wallX:9.75,wallZ:17.65};
 function create(p,v,spin=V()){return {p:p.clone(),v:v.clone(),spin:spin.clone(),bounces:0,age:0,dead:false,rolling:false,sleeping:false,netCooldown:0}}
 function copy(b){return {...b,p:b.p.clone(),v:b.v.clone(),spin:b.spin.clone()}}
 function acceleration(b){const speed=b.v.length(),a=b.v.clone().multiplyScalar(-C.drag*speed);const m=b.spin.clone().cross(b.v).multiplyScalar(C.magnus).clampLength(0,12);return a.add(m).add(V(0,-C.gravity,0))}
 function step(b,dt,{walls=true,net=true,floor=true}={}){
  b.age+=dt;b.netCooldown=Math.max(0,b.netCooldown-dt);if(b.sleeping)return [];
  const events=[],prev=b.p.clone();if(b.rolling){b.p.addScaledVector(b.v,dt);b.p.y=C.radius;b.v.multiplyScalar(Math.exp(-1.5*dt));b.v.y=0;b.spin.multiplyScalar(Math.exp(-dt*2));if(b.v.length()<.08){b.v.set(0,0,0);b.sleeping=true}}else{const a=acceleration(b);b.p.addScaledVector(b.v,dt).addScaledVector(a,dt*dt*.5);b.v.addScaledVector(a,dt);b.spin.multiplyScalar(Math.exp(-dt*.10));}
  if(floor&&b.p.y<C.radius&&b.v.y<0){
   const speed=-b.v.y;b.p.y=C.radius;b.v.y=speed*C.restitution;b.v.x*=.88;b.v.z*=.88;
   // Tangential contact with court changes linear speed and reduces spin.
   b.v.x+=clamp(b.spin.z*C.radius*.045,-.5,.5);b.v.z-=clamp(b.spin.x*C.radius*.045,-.5,.5);b.spin.multiplyScalar(.78);b.bounces++;events.push({type:'bounce',p:b.p.clone(),count:b.bounces});
   if(speed<.85){b.v.y=0;b.p.y=C.radius;b.rolling=true;}
  }
  if(floor&&b.p.y<=C.radius+.0001&&b.v.y<=.02){
   b.v.y=0;b.v.x*=Math.exp(-1.5*dt);b.v.z*=Math.exp(-1.5*dt);b.spin.multiplyScalar(Math.exp(-dt*2));
   if(Math.hypot(b.v.x,b.v.z)<.08){b.v.set(0,0,0);b.sleeping=true}
  }
  if(net&&b.netCooldown===0&&prev.z*b.p.z<0&&Math.abs(b.p.x)<5.88){
   const f=Math.abs(prev.z)/(Math.abs(prev.z)+Math.abs(b.p.z)),y=prev.y+(b.p.y-prev.y)*f,x=prev.x+(b.p.x-prev.x)*f,height=.916+.152*(Math.abs(x)/5.85)**2;
   if(y-C.radius<height){b.p.z=Math.sign(prev.z)*(C.radius+.015);b.v.z*=-.16;b.v.x*=.6;b.v.y*=.45;b.netCooldown=.18;events.push({type:'net',p:b.p.clone()})}
  }
  if(walls){for(const axis of ['x','z']){const bound=axis==='x'?C.wallX:C.wallZ;if(Math.abs(b.p[axis])>bound){b.p[axis]=Math.sign(b.p[axis])*bound;b.v[axis]*=-.48;events.push({type:'wall',axis})}}}
  if(!Number.isFinite(b.p.lengthSq()+b.v.lengthSq()))throw Error('Non-finite ball state');return events;
 }
 function predict(ball,horizon=3.5,dt=1/120){
  const b=copy(ball),samples=[],bounces=[];let lastNet=false;
  for(let i=1;i<=horizon/dt;i++){
   const events=step(b,dt,{walls:false,net:true}),time=i*dt;
   for(const e of events){if(e.type==='bounce'){bounces.push({t:time,p:e.p.clone(),count:e.count});}if(e.type==='net')lastNet=true;}
   if(i%4===0)samples.push({t:time,p:b.p.clone(),v:b.v.clone(),bounces:b.bounces});
   if(lastNet||b.bounces>=ball.bounces+2||Math.abs(b.p.z)>25||Math.abs(b.p.x)>16)break;
  }
  return {samples,bounces,net:lastNet};
 }
 function inside(p,side){return Math.abs(p.x)<=C.courtX&&p.z*side>0&&Math.abs(p.z)<=C.courtZ}
 /** Auto mode has no target argument. Landing is an output of the contact/flight model. */
 function automatic({incoming,spin=V(),side=1,kind='forehand',power=.5,timing=0,lateral=0,height=1.1,balance=1,movement=0,stance=0,lift=0}){
  const forward=-side,back=kind==='backhand'||kind==='backVolley'||kind==='slice',hand=back?-1:1;
  const slice=kind==='slice',volley=kind.includes('olley'),over=kind==='smash'||kind==='serve';
  // The phase shift is local to this stroke; it is NOT a universal rule that all late shots go cross-court.
  const yaw=clamp(stance+timing*1.35*hand+clamp(lateral,-.6,.6)*.16+movement*.016,-.52,.52);
  const loft=(over?-.005:slice?.100:volley?.10:.130)+clamp((1.10-height)*.065,-.014,.060)+lift;
  const n=V(Math.sin(yaw),loft,forward*Math.cos(yaw)).normalize();
  const racketSpeed=(volley?3.0:over?6.0:4.0)+power*(over?8:5.5);
  const racket=V(n.x*racketSpeed,.6+power*.6,n.z*racketSpeed);
  const relative=incoming.clone().sub(racket),closing=relative.dot(n);
  const restitution=slice?.48:.57;
  let velocity=incoming.clone().addScaledVector(n,-(1+restitution)*Math.min(-.3,closing));
  const tang=relative.clone().addScaledVector(n,-relative.dot(n));velocity.addScaledVector(tang,-.10);
  velocity.multiplyScalar(.88+.12*clamp(balance,.25,1));
  // Near-edge impacts lose energy; no mid-flight steering or net-clearance clamp.
  velocity.multiplyScalar(1-Math.min(.18,Math.abs(lateral)*.12));
  if(Math.abs(velocity.z)<5)velocity.z=forward*5;
  if(over)velocity.y=-.3+power*.8;
  const omega=V((slice?-1:1)*forward*(45+100*power)*(volley?.3:1),-yaw*60,0).addScaledVector(spin,.13);
  return {v:velocity,spin:omega,normal:n,racketVelocity:racket,mode:'physics',inputs:{timing,power,lateral,balance,kind,stance,height,lift}};
 }
 /** Manual target mode chooses launch parameters before flight; no trajectory correction afterwards. */
 function targeted({origin,target,power=.5,side=1,spin=V(),error=0}){
  const goal=target.clone();goal.y=C.radius;
  const distance=origin.distanceTo(goal);let duration=clamp(distance/(16+power*8),.85,1.65);
  const f=clamp(origin.z/(origin.z-goal.z),.05,.95);const lin=origin.y*(1-f)+C.radius*f;
  duration=Math.max(duration,Math.sqrt(Math.max(0,2*(1.20-lin)/(C.gravity*f*(1-f))))+.035);
  let v=goal.clone().sub(origin).divideScalar(duration);v.y+=C.gravity*duration*.5;
  // Shooting-method refinement for the same drag/spin integration as gameplay.
  for(let k=0;k<6;k++){const b=create(origin,v,spin);for(let j=0;j<Math.round(duration*120);j++)step(b,1/120,{walls:false,net:false,floor:false});const delta=goal.clone().sub(b.p);v.x+=delta.x/duration*.9;v.z+=delta.z/duration*.9;v.y+=delta.y/duration*.9;}
  v.x+=error;return {v,spin:spin.clone(),mode:'target'};
 }
 // Player controls stay the same when the opponent or feed difficulty changes.
 const playerControls={speed:6.6,buffer:1.4};
 const contactProfiles={assisted:{reach:1.50,behind:.70,minHeight:.22,maxHeight:2.85,before:.12,after:.20},manual:{reach:1.18,behind:.45,minHeight:.30,maxHeight:2.65,before:.065,after:.085}};
 function contactProfile(assisted=true){return contactProfiles[assisted?'assisted':'manual']}
 // A finite player-reach envelope, independent of forecast/recommended standing position.
 // This tests the current ball; it never moves the ball or changes its flight.
 function strikeContact({ball,player,side=1,phase=0,assisted=true}){
  const rules=contactProfile(assisted),horizontal=Math.hypot(ball.x-player.x,ball.z-player.z),height=ball.y-player.y,behind=(ball.z-player.z)*side;
  const reachable=horizontal<=rules.reach&&behind<=rules.behind&&height>=rules.minHeight&&height<=rules.maxHeight;
  const inWindow=phase>=-rules.before&&phase<=rules.after;
  return {accepted:reachable&&inWindow,reachable,inWindow,horizontal,height,phase};
 }
 const difficulties={
  easy:{label:'轻松',speed:10.8,width:1.65,depth:6.3,spin:28,aiScale:.84,aiWindow:.18,aiReach:.67},
  club:{label:'俱乐部',speed:13.2,width:3.1,depth:7.0,spin:60,aiScale:1,aiWindow:.13,aiReach:.56},
  pro:{label:'竞技',speed:16.5,width:4.0,depth:8.2,spin:100,aiScale:1.18,aiWindow:.09,aiReach:.46}
 };
 const opponents={
  steady:{name:'Rowan',label:'稳健底线',character:'snow',outfit:'green',scale:[.99,1.00,.99],speed:5.6,reaction:.18,power:.38,spread:.020,spin:1.35,aggression:.30,recovery:8.7,description:'深球、长回合，优先减少失误。'},
  power:{name:'Kai',label:'强力进攻',character:'snow',outfit:'rust',scale:[1.045,1.035,1.045],speed:5.0,reaction:.23,power:.75,spread:.095,spin:.75,aggression:.86,recovery:8.2,description:'更快的球速和更大的角度，也更容易失误。'},
  tactician:{name:'Noa',label:'变线高手',character:'rain',outfit:'navy',scale:[.985,1.01,.985],speed:5.4,reaction:.17,power:.48,spread:.045,spin:1.0,aggression:.62,recovery:5.6,description:'交替长短与左右线路，用切削改变节奏。'}
 };
 return {C,create,copy,step,predict,inside,automatic,targeted,difficulties,opponents,playerControls,contactProfile,strikeContact,clamp,V};
})();

/* Cypress court. Original geometry and deterministic locally generated textures. */
window.createCourtVenue=function(T,scene,renderer){
 const world=new T.Group();world.name='CypressClub';scene.add(world);
 let seed=13579;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},rr=(a,b)=>a+(b-a)*random();
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const mat=(color,roughness=.88)=>new T.MeshStandardMaterial({color,roughness,metalness:0});
 const mats={white:mat('#f0eee5'),dark:mat('#17332f'),wood:mat('#967757'),silver:mat('#839386',.5),clay:mat('#637e79'),ground:mat('#8b9471'),leaf:mat('#456047')};
 function mesh(g,m,parent=world,pos){const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;if(pos)o.position.copy(pos);parent.add(o);return o}
 const box=(x,y,z,m,parent=world,p)=>mesh(new T.BoxGeometry(x,y,z),m,parent,p);
 const plane=(w,h,m,parent=world,p)=>mesh(new T.PlaneGeometry(w,h),m,parent,p);
 const tube=(pts,r,m,parent=world)=>mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>Array.isArray(p)?V(...p):p)),Math.max(8,pts.length*5),r,6,false),m,parent);
 function textTexture(text,bg,fg,w=1024,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.font=`500 ${Math.floor(h*.40)}px Arial`;x.textAlign='center';x.textBaseline='middle';x.fillText(text,w/2,h/2);const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tx}
 function grainTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),im=x.createImageData(256,256);for(let i=0;i<im.data.length;i+=4){const n=175+random()*75;im.data[i]=im.data[i+1]=im.data[i+2]=n;im.data[i+3]=255}x.putImageData(im,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(28,54);t.anisotropy=8;return t}
 const grit=grainTexture();mats.clay.bumpMap=grit;mats.clay.bumpScale=.019;
 const lawnMap=new T.TextureLoader().load(window.CLUB_ASSETS.textures.grassDiffuse),lawnNormal=new T.TextureLoader().load(window.CLUB_ASSETS.textures.grassNormal);
 for(const texture of [lawnMap,lawnNormal]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(600,600);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
 lawnMap.colorSpace=T.SRGBColorSpace;
 const turf=mat('#759c60');turf.map=lawnMap;turf.normalMap=lawnNormal;turf.normalScale.set(.5,.5);const gnd=plane(1200,1200,turf,world,V(0,-.12,0));gnd.rotation.x=-Math.PI/2;gnd.castShadow=false;
 box(20.3,.14,36,mats.clay,world,V(0,-.082,0));
 const courtMat=mat('#335d76');courtMat.bumpMap=grit;courtMat.bumpScale=.006;courtMat.roughness=.91;
 const court=plane(10.97,23.77,courtMat,world,V(0,.004,0));court.rotation.x=-Math.PI/2;court.castShadow=false;
 const lineMat=mat('#e5e5ce');function line(x,z,w,d){const o=box(w,.005,d,lineMat,world,V(x,.011,z));o.castShadow=false}
 for(const x of [-5.485,5.485])line(x,0,.055,23.82);for(const x of [-4.115,4.115])line(x,0,.05,23.77);
 for(const z of [-11.885,11.885]){line(0,z,10.97,.062);line(0,z-Math.sign(z)*.095,.052,.19)}
 for(const z of [-6.4,6.4])line(0,z,8.23,.052);for(const z of [-3.2,3.2])line(0,z,.05,6.4);
 // One mesh for the net, with a physical catenary-like top edge and a repeated alpha mask.
 const ncv=document.createElement('canvas');ncv.width=ncv.height=64;const nc=ncv.getContext('2d');nc.clearRect(0,0,64,64);nc.strokeStyle='#24312c';nc.lineWidth=3;nc.strokeRect(0,0,64,64);
 const nt=new T.CanvasTexture(ncv);nt.wrapS=nt.wrapT=T.RepeatWrapping;nt.repeat.set(120,11);nt.anisotropy=8;
 const netGeo=new T.PlaneGeometry(11.7,1.05,48,1),np=netGeo.attributes.position;
 for(let i=0;i<np.count;i++){const x=np.getX(i),top=.916+.152*Math.pow(Math.abs(x)/5.85,2);np.setY(i,np.getY(i)>0?top:.10)}netGeo.computeVertexNormals();
 const net=mesh(netGeo,new T.MeshStandardMaterial({map:nt,transparent:true,alphaTest:.12,side:T.DoubleSide,roughness:1,depthWrite:false}),world);net.castShadow=false;
 tube([[-5.85,1.078,0],[-3,.96,0],[0,.927,0],[3,.96,0],[5.85,1.078,0]],.025,mats.white);
 tube([[0,.01,0],[0,.92,0]],.018,mats.white);
 for(const x of [-5.87,5.87]){mesh(new T.CylinderGeometry(.055,.06,1.12,12),mats.dark,world,V(x,.56,0));box(.1,.012,.15,mats.white,world,V(x,1.127,0));box(.28,.02,.24,mats.dark,world,V(x,.012,0))}
 // An enclosure, not a toy picket fence. Side wind screens and unobtrusive wire above.
 const fence=mat('#183c33'),stone=mat('#c1b597'),screen=mat('#234b3c');
 const wireCanvas=document.createElement('canvas');wireCanvas.width=wireCanvas.height=64;const wc=wireCanvas.getContext('2d');wc.clearRect(0,0,64,64);wc.strokeStyle='#2b493a';wc.lineWidth=1.6;wc.beginPath();wc.moveTo(32,0);wc.lineTo(64,32);wc.lineTo(32,64);wc.lineTo(0,32);wc.closePath();wc.stroke();const wt=new T.CanvasTexture(wireCanvas);wt.wrapS=wt.wrapT=T.RepeatWrapping;wt.repeat.set(70,7);wt.anisotropy=8;
 const wm=new T.MeshStandardMaterial({map:wt,side:T.DoubleSide,transparent:true,alphaTest:.15,depthWrite:false});
 for(const sign of [-1,1]){
  const x=sign*10.05;box(.16,.34,36,stone,world,V(x,.1,0));box(.06,.06,36,fence,world,V(x,2.45,0));
  for(let z=-18;z<=18;z+=3){mesh(new T.CylinderGeometry(.032,.045,2.5,8),fence,world,V(x,1.25,z))}
  const side=plane(36,1.68,screen,world,V(x,1.07,0));side.rotation.y=Math.PI/2;side.material=screen.clone();side.material.side=T.DoubleSide;side.castShadow=false;
  const wire=plane(36,.65,wm,world,V(x,2.13,0));wire.rotation.y=Math.PI/2;wire.castShadow=false;
 }
 box(20.2,.33,.20,stone,world,V(0,.1,-18));box(20.2,1.67,.035,screen,world,V(0,1.07,-18));
 const backwire=plane(20.2,.65,wm,world,V(0,2.13,-18));backwire.castShadow=false;
 for(let x=-10;x<=10;x+=2.5){mesh(new T.CylinderGeometry(.032,.04,2.5,8),fence,world,V(x,1.25,-18))}box(20.2,.06,.06,fence,world,V(0,2.45,-18));
 const sign=plane(6.8,.74,new T.MeshStandardMaterial({map:textTexture('B A S E L I N E   C L U B','#234b3c','#e4e5c5'),roughness:1}),world,V(0,1.16,-17.967));sign.castShadow=false;
 const courtNo=plane(1.2,.53,new T.MeshStandardMaterial({map:textTexture('01','#234b3c','#e4e5c5',256,128)}),world,V(7.4,1.16,-17.967));courtNo.castShadow=false;
 for(const [x,z,angle] of [[-7.9,8,Math.PI/2],[7.9,-8,-Math.PI/2]]){
  const bench=new T.Group();bench.position.set(x,0,z);bench.rotation.y=angle;world.add(bench);
  for(let i=0;i<4;i++)box(2.15,.05,.115,mats.wood,bench,V(0,.47,-.24+i*.14));for(let i=0;i<3;i++)box(2.15,.12,.05,mats.wood,bench,V(0,.66+i*.14,-.28));
  for(const xx of [-.82,.82]){box(.055,.5,.48,fence,bench,V(xx,.25,0));box(.055,.85,.06,fence,bench,V(xx,.55,-.29))}
  const bag=box(.6,.23,.27,mats.dark,bench,V(.45,.62,.02));bag.rotation.z=.06;
  mesh(new T.CylinderGeometry(.045,.047,.26,12),mat('#c8855a'),bench,V(-.56,.63,.02));mesh(new T.CylinderGeometry(.026,.026,.035,12),fence,bench,V(-.56,.78,.02));
 }
 // Clubhouse terrace and an architectural pergola, carefully outside the playable bounds.
 const plaster=mat('#d8cfb4'),shade=mat('#554f3c'),glass=new T.MeshStandardMaterial({color:'#487269',metalness:.25,roughness:.2});
 box(32,.6,8,stone,world,V(0,-.1,-24));box(32,1.75,.28,plaster,world,V(0,.94,-28));
 for(const x of [-14,-7,0,7,14]){box(.22,3.45,.22,plaster,world,V(x,1.8,-23.7));box(.22,3.45,.22,plaster,world,V(x,1.8,-27.3))}
 box(29.5,.21,4.6,plaster,world,V(0,3.58,-25.5));
 for(let x=-14;x<=14;x+=.58)box(.09,.11,4.3,mats.wood,world,V(x,3.40,-25.5));
 for(const x of [-10,0,10]){box(4.5,1.9,.10,glass,world,V(x,1.22,-27.81));box(4.65,.06,.2,shade,world,V(x,2.19,-27.7))}
 for(const x of [-9.9,0,9.9]){box(2.4,.14,.75,plaster,world,V(x,.76,-25.6));for(const xx of [-.9,.9])box(.08,.7,.52,shade,world,V(x+xx,.4,-25.6))}
 for(const sign of [-1,1]){box(1.3,.62,33,stone,world,V(sign*12,.11,0));for(let i=0;i<3;i++)box(3,.15,1.0,stone,world,V(sign*11,-.035+i*.15,18+i*.8))}
 // Curved-profile floodlights; emissive trim becomes visible in the evening preset.
 const emit=new T.MeshStandardMaterial({color:'#fff1cc',emissive:'#ffd9a6',emissiveIntensity:.4,roughness:.3});const lampLights=[];
 for(const [x,z] of [[-10.3,-12.5],[10.3,-12.5],[-10.3,12.5],[10.3,12.5]]){
  mesh(new T.CylinderGeometry(.055,.09,6.8,10),fence,world,V(x,3.4,z));box(.55,.07,.65,fence,world,V(x,6.78,z));box(.48,.018,.57,emit,world,V(x,6.736,z));
  const l=new T.PointLight('#ffdfb7',0,22,2);l.position.set(x,6.5,z);scene.add(l);lampLights.push(l);
 }
 // Detailed foliage cards and coherent trunks. Variation is seeded, never a network asset.
 const treePoints=[];for(let i=0;i<9;i++){const sign=i%2?-1:1;treePoints.push([sign*rr(14,20),rr(-25,19),rr(3.4,6.5)])}for(let i=0;i<5;i++)treePoints.push([rr(-35,35),rr(-38,-32),rr(4.5,7.8)]);
 const leafShape=new T.Shape();leafShape.moveTo(0,-.11);leafShape.quadraticCurveTo(.075,-.05,0,.12);leafShape.quadraticCurveTo(-.065,.025,0,-.11);
 const leafGeo=new T.ShapeGeometry(leafShape,3),leafMat=new T.MeshStandardMaterial({color:'#92a167',side:T.DoubleSide,roughness:1});
 const foliage=new T.InstancedMesh(leafGeo,leafMat,treePoints.length*1100);foliage.castShadow=true;foliage.receiveShadow=true;world.add(foliage);const d=new T.Object3D();let leafId=0;
 const crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),mat('#cad6b9'),treePoints.length*4);crowns.castShadow=true;crowns.receiveShadow=true;world.add(crowns);crowns.visible=false;let crownId=0;
 treePoints.forEach(([x,z,h],id)=>{
  tube([[x,0,z],[x+.06,h*.42,z+.04],[x-.13,h*.74,z+.09]],.070,mats.wood);for(let j=0;j<3;j++)tube([[x,h*.4,z],[x+(j-1)*.40,h*.65,z+.12],[x+(j-1)*.72,h*.83,z+(j===1?.40:0)]],.027,mats.wood);
  const w=rr(.7,1.25);for(let j=0;j<4;j++){d.position.set(x+(j%2-.5)*w,h*.74+(j>1?.55:0),z+(j<2?-.25:.35));d.scale.set(w,.73,w*.72);d.rotation.set(rr(-.3,.3),rr(0,6),rr(-.3,.3));d.updateMatrix();crowns.setMatrixAt(crownId,d.matrix);crowns.setColorAt(crownId++,new T.Color().setHSL(rr(.24,.29),rr(.18,.25),rr(.23,.37)))}
  for(let j=0;j<1100;j++){const a=rr(0,Math.PI*2),v=rr(-1,1),r=Math.sqrt(1-v*v),radius=rr(.75,1.25);d.position.set(x+Math.cos(a)*r*w*radius,h*.80+v*.95,z+Math.sin(a)*r*w*.80*radius);d.scale.setScalar(rr(1.2,2.5));d.rotation.set(rr(-1.3,1.3),rr(0,6.28),rr(0,6.28));d.updateMatrix();foliage.setMatrixAt(leafId,d.matrix);foliage.setColorAt(leafId++,new T.Color().setHSL(rr(.22,.29),rr(.14,.32),rr(.3,.55)))}
 });
 // Tapered cypress silhouettes frame the court without obscuring it.
 const cg=new T.LatheGeometry([[0,0],[.25,.08],[.56,.6],[.62,1.4],[.47,2.6],[.22,3.5],[0,4.1]].map(p=>new T.Vector2(...p)),14);const cp=cg.attributes.position;for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),n=1+.07*Math.sin(y*12+x*19+z*9);cp.setXYZ(i,x*n,y,z*n)}cg.computeVertexNormals();
 const cypresses=new T.InstancedMesh(cg,mat('#c1ceb0'),30);cypresses.castShadow=true;cypresses.receiveShadow=true;world.add(cypresses);cypresses.visible=false;
 for(let i=0;i<30;i++){const side=i%2?-1:1;d.position.set(side*rr(13.6,17.2),0,-29+Math.floor(i/2)*3.3);d.rotation.set(0,rr(0,6.28),rr(-.04,.04));d.scale.set(rr(.75,1.12),rr(.8,1.55),rr(.7,1.03));d.updateMatrix();cypresses.setMatrixAt(i,d.matrix);cypresses.setColorAt(i,new T.Color().setHSL(rr(.25,.3),rr(.22,.3),rr(.25,.39)))}
 // Low hedges cover structural bases and give the court a human-scale boundary.
 const hedge=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat('#536b43'),108);hedge.castShadow=true;hedge.receiveShadow=true;world.add(hedge);
 for(let i=0;i<108;i++){const side=i%2?-1:1;d.position.set(side*12,rr(.32,.56),-17+Math.floor(i/2)*.65);d.scale.set(rr(.5,.65),rr(.36,.59),rr(.4,.65));d.rotation.set(0,rr(0,6),0);d.updateMatrix();hedge.setMatrixAt(i,d.matrix);hedge.setColorAt(i,new T.Color().setHSL(rr(.23,.29),.24,rr(.24,.34)))}
 // Atmospheric ridgelines provide depth, not an endless blank beige floor.
 const hills=[];for(const [z,height,color] of [[-160,27,'#c1c7b7'],[-123,22,'#9caca0'],[-86,14,'#819686']]){
  const v=[],idx=[],n=38;for(let i=0;i<=n;i++){const x=-190+i*10,top=height+Math.sin(i*.48)*height*.25+Math.sin(i*1.29)*2.5;v.push(x,-3,z,x,top,z-rr(0,5))}for(let i=0;i<n;i++){const a=i*2;idx.push(a,a+2,a+1,a+2,a+3,a+1)}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();const o=mesh(geo,mat(color),world);o.castShadow=false;hills.push(o);o.visible=false
 }
 const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color('#82b6cc')},horizon:{value:new T.Color('#dce6cf')},sun:{value:V(-.57,.22,-.79)}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;uniform vec3 top;uniform vec3 horizon;uniform vec3 sun;void main(){vec3 d=normalize(p);float h=smoothstep(-.24,.48,d.y);vec3 c=mix(horizon,top,h);float s=max(0.,dot(d,normalize(sun)));c+=vec3(.14,.11,.06)*pow(s,12.);c+=vec3(.4,.31,.16)*pow(s,450.);gl_FragColor=vec4(c,1.);}'});
 // Community photographic HDRI provides both visible sky and reflected light.
 // It is embedded in the standalone build; no network fetch occurs at runtime.
 const raw=Uint8Array.from(atob(window.CLUB_ASSETS.environment),c=>c.charCodeAt(0));
 const hdr=new window.ClubHDRLoader().parse(raw.buffer);
 const environment=new T.DataTexture(hdr.data,hdr.width,hdr.height,T.RGBAFormat,hdr.type);
 environment.colorSpace=T.LinearSRGBColorSpace;environment.flipY=true;environment.minFilter=environment.magFilter=T.LinearFilter;environment.mapping=T.EquirectangularReflectionMapping;environment.needsUpdate=true;
 const pmrem=new T.PMREMGenerator(renderer),reflection=pmrem.fromEquirectangular(environment);pmrem.dispose();scene.environment=reflection.texture;scene.environmentIntensity=.55;
 const sky=new T.Mesh(new T.SphereGeometry(700,48,24),new T.MeshBasicMaterial({map:environment,side:T.BackSide,depthWrite:false,fog:false}));sky.rotation.y=-1.2;scene.add(sky);
 scene.background=new T.Color('#63735b');scene.fog=new T.FogExp2('#63735b',.0045);
 const hemi=new T.HemisphereLight('#dfebff','#8e856e',.65);scene.add(hemi);
 const sun=new T.DirectionalLight('#fff2e1',2.6);sun.position.set(-16,19,9);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);sun.shadow.camera.left=-19;sun.shadow.camera.right=19;sun.shadow.camera.top=21;sun.shadow.camera.bottom=-21;sun.shadow.camera.near=1;sun.shadow.camera.far=70;sun.shadow.normalBias=.012;sun.shadow.bias=-.00004;sun.shadow.radius=2;scene.add(sun);
 const fill=new T.DirectionalLight('#d9eced',.72);fill.position.set(10,9,17);scene.add(fill);
 const rim=new T.DirectionalLight('#ffe7b8',.72);rim.position.set(3,7,-11);scene.add(rim);
 // The same ball machine, now with readable housing, hopper, feet and a lens.
 const machine=new T.Group();machine.name='BallMachine';machine.userData.skipBatch=true;world.add(machine);machine.position.set(0,0,-10.9);
 box(.68,.52,.57,mats.white,machine,V(0,.80,0));box(.72,.16,.60,mats.dark,machine,V(0,.51,0));box(.61,.08,.51,mats.dark,machine,V(0,1.075,0));
 const mouth=mesh(new T.CylinderGeometry(.112,.132,.30,24),mats.dark,machine,V(0,1.14,.40));mouth.rotation.x=Math.PI/2;
 mesh(new T.CircleGeometry(.096,24),new T.MeshBasicMaterial({color:'#101e19'}),machine,V(0,1.14,.557));
 for(const x of [-.25,.25]){box(.055,.36,.36,mats.dark,machine,V(x,.23,0));const wheel=mesh(new T.CylinderGeometry(.11,.11,.07,18),mats.dark,machine,V(x,.16,-.15));wheel.rotation.z=Math.PI/2}
 for(const x of [-.29,.29])for(const z of [-.21,.21])box(.018,.24,.018,mats.dark,machine,V(x,1.23,z));
 for(const y of [1.14,1.29,1.37]){box(.6,.013,.015,mats.dark,machine,V(0,y,.21));box(.6,.013,.015,mats.dark,machine,V(0,y,-.21));box(.014,.013,.42,mats.dark,machine,V(-.29,y,0));box(.014,.013,.42,mats.dark,machine,V(.29,y,0))}
 const balls=mat('#d2df55');for(let i=0;i<12;i++){const o=mesh(new T.SphereGeometry(.038,10,8),balls,machine,V(rr(-.24,.24),1.12+rr(0,.20),rr(-.17,.17)));o.castShadow=false}
 function lighting(preset){
  const evening=preset==='evening';sun.color.set(evening?'#ffc184':'#fff2e1');sun.intensity=evening?2.05:2.6;sun.position.set(evening?-22:-16,evening?10:19,9);hemi.intensity=evening?.42:.65;fill.intensity=evening?.35:.55;scene.environmentIntensity=evening?.28:.55;sky.material.color.set(evening?'#a89789':'#ffffff');
  skyMat.uniforms.top.value.set(evening?'#748da0':'#82b6cc');skyMat.uniforms.horizon.value.set(evening?'#e5b68e':'#dce6cf');scene.fog.color.set(evening?'#79735e':'#63735b');lampLights.forEach(l=>{l.intensity=evening?14:0;l.visible=evening});emit.emissiveIntensity=evening?3:.4;
 }
 return {world,mats,mesh,box,plane,tube,mat,machine,sun,sky,lighting,foliage};
};

/* A single HDR presentation pass: filmic highlights, edge AA, restrained glow and grain. */
window.createCourtPresentation=function(T,renderer){
 const gl=renderer.getContext(),hdr=renderer.extensions.has('EXT_color_buffer_float');
 const supported=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,hdr?gl.RGBA16F:gl.RGBA8,gl.SAMPLES)||[]);
 const target=new T.WebGLRenderTarget(1,1,{type:hdr?T.HalfFloatType:T.UnsignedByteType,depthBuffer:true,samples:0});
 const uniforms={image:{value:target.texture},pixel:{value:new T.Vector2(1,1)},time:{value:0},exposure:{value:1.0},glow:{value:.016}};
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms,
 vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`varying vec2 uv0;uniform sampler2D image;uniform vec2 pixel;uniform float time;uniform float exposure;uniform float glow;
 float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
 vec3 color(vec2 uv){return texture2D(image,uv).rgb;}
 void main(){vec2 uv=uv0;vec3 c=color(uv);vec3 n=color(uv+vec2(0.,pixel.y)),s=color(uv-vec2(0.,pixel.y)),e=color(uv+vec2(pixel.x,0.)),w=color(uv-vec2(pixel.x,0.));
 float hi=max(luma(c),max(max(luma(n),luma(s)),max(luma(e),luma(w))));float lo=min(luma(c),min(min(luma(n),luma(s)),min(luma(e),luma(w))));
 float edge=smoothstep(.06,.20,(hi-lo)/max(hi,.01));c=mix(c,(n+s+e+w+c*4.)/8.,edge*.44);
 vec3 bloom=vec3(0.);for(int i=0;i<4;i++){float a=float(i)*1.570796;vec3 v=color(uv+vec2(cos(a),sin(a))*pixel*5.);bloom+=max(v-vec3(1.15),vec3(0.));}c+=bloom*glow*.25;
 c*=exposure;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);c=clamp(c,0.,1.);c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));
 vec2 d=(uv-.5)*vec2(.90,1.);float vignette=1.-.19*dot(d,d);c*=vignette;
 float grain=fract(sin(dot(gl_FragCoord.xy+time*.03,vec2(12.9898,78.233)))*43758.5453)-.5;c+=grain*.003;gl_FragColor=vec4(c,1.);}`});
 const scene=new T.Scene();scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));const cam=new T.Camera();
 const api={last:{calls:0,triangles:0},resize(){const v=renderer.getDrawingBufferSize(new T.Vector2());target.setSize(v.x,v.y);uniforms.pixel.value.set(1/v.x,1/v.y)},quality(level){const desired=level==='high'?4:level==='eco'?0:2;target.samples=Math.max(0,...supported.filter(n=>n<=desired));target.dispose();api.resize()},render(world,camera,time){uniforms.time.value=time;renderer.setRenderTarget(target);renderer.render(world,camera);api.last={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};renderer.setRenderTarget(null);renderer.render(scene,cam)},dispose(){target.dispose();material.dispose()}};api.resize();return api;
};

/* Baseline Club: local-only tennis practice and opponent rallies. */
'use strict';
(async function boot(){
 const $=id=>document.getElementById(id),T=window.THREE,P=window.ClubPhysics,C=window.ClubCharacters;
 try{
 const {V,clamp}=P,Q=()=>new T.Quaternion(),mix=(a,b,t)=>a+(b-a)*t,axis=V(0,1,0),touch=matchMedia('(pointer:coarse)').matches;
 const options={quality:'auto',light:'day',outfit:'ivory',camera:'follow',effects:!matchMedia('(prefers-reduced-motion:reduce)').matches,character:'rain',opponent:'steady',difficulty:'easy',aimMode:'physics',autoMove:true,showBounce:true,showPosition:true,showTrajectory:false,showTiming:true,timingAssist:true,contactAssist:true};
 const enums={quality:['auto','high','eco'],light:['day','evening'],outfit:['ivory','green','rust','navy'],camera:['follow','wide'],character:['rain','snow'],opponent:Object.keys(P.opponents),difficulty:Object.keys(P.difficulties),aimMode:['physics','target']};
 try{const saved=JSON.parse(localStorage.getItem('baseline-club-settings')||'{}');for(const [k,v] of Object.entries(saved))if(enums[k]?.includes(v)||typeof options[k]==='boolean'&&typeof v==='boolean')options[k]=v}catch{}
 const save=()=>{try{localStorage.setItem('baseline-club-settings',JSON.stringify(options))}catch{}};
 const canvas=$('view'),renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.4));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.05,1000),venue=window.createCourtVenue(T,scene,renderer),presentation=window.createCourtPresentation(T,renderer);
 const {world,mats,mesh,box,plane,mat}=venue;
 const templates=Object.fromEntries(await Promise.all(['rain','snow'].map(async n=>[n,await C.load(n)])));
 const make=n=>new C.Character({scene:window.BASELINE_ENGINE.cloneSkeleton(templates[n].scene)},n);
 const playerChars={rain:make('rain'),snow:make('snow')},cpuChars={rain:make('rain'),snow:make('snow')};
 Object.values(playerChars).concat(Object.values(cpuChars)).forEach(c=>{scene.add(c.group);c.group.visible=false});
 let player=playerChars[options.character],cpu=cpuChars[P.opponents[options.opponent].character];
 const actors=[{char:player,side:1,velocity:V(),plan:null,swing:null},{char:cpu,side:-1,velocity:V(),plan:null,swing:null}];
 const difficulty=()=>P.difficulties[options.difficulty],profile=()=>P.opponents[options.opponent];
 let seed=437731;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},random=(a,b)=>mix(a,b,rng());
 let screen='home',mode='match',demo=false,paused=false,ended=false,clock=0,nextBall=1,frame=0,active=null,balls=[],sequence=0,rally=0,pointNo=0,lastImpact=-99,toastUntil=0,externalClock=false,labKind='forehand',labTime=0,labPlaying=true,labSpeed=.5,labYaw=.35,labElevation=1.60,labDistance=4.9;
 let score=[0,0],practice={hits:0,misses:0,streak:0,best:0,points:0,lives:3},speed=0;
 let lastPrediction=null,lastPredictionTime=-100,forecastId=-1;
 const input={held:false,since:0,power:0,queued:false,queuedAt:0,x:0,z:0},keys=new Set(),events=[];
 const record=(type,data={})=>{events.push({t:+clock.toFixed(4),type,...data});if(events.length>600)events.shift()};
 let history=[],lastReplay=[],replay=null,replayDue=-1,replayBase=null;
 const up=V(0,1,0),ground=new T.Plane(up,0),ray=new T.Raycaster();
 const stats={hits:[0,0],errors:[],deadRetained:0,maxDeadAge:0,autoShots:0,manualShots:0,chosenShots:[],netHits:0,longestRally:0};
 const rgba=(c,o=.6)=>new T.MeshBasicMaterial({color:c,transparent:true,opacity:o,side:T.DoubleSide,depthWrite:false});
 const flatRing=(inner,outer,color,parent=scene)=>{const o=mesh(new T.RingGeometry(inner,outer,48),rgba(color),parent);o.rotation.x=-Math.PI/2;o.castShadow=o.receiveShadow=false;return o};
 const aim=flatRing(.29,.33,'#e4ed96');aim.position.set(1.5,.035,-8);aim.visible=false;
 const target=flatRing(.65,.72,'#f1d480');target.position.set(-2,.04,-7);target.visible=false;
 const targetCore=flatRing(.16,.23,'#e89868');targetCore.position.copy(target.position).add(V(0,.001,0));targetCore.visible=false;
 const predictedRing=flatRing(.24,.29,'#dff38d'),positionRing=flatRing(.48,.51,'#d9ede2');predictedRing.visible=positionRing.visible=false;
 const positionArrow=mesh(new T.ConeGeometry(.085,.22,3),rgba('#d9ede2'),scene);positionArrow.rotation.x=Math.PI/2;positionArrow.visible=false;positionArrow.castShadow=false;
 const trajectoryGeo=new T.BufferGeometry(),trajectory=new T.Line(trajectoryGeo,new T.LineDashedMaterial({color:'#dbeeb0',transparent:true,opacity:.48,dashSize:.14,gapSize:.17}));scene.add(trajectory);trajectory.visible=false;
 const timingMarker=mesh(new T.RingGeometry(.088,.103,32),rgba('#e7f49d'),scene);timingMarker.visible=false;timingMarker.castShadow=false;
 const lab=new T.Group();scene.add(lab);lab.visible=false;const floor=plane(120,120,mat('#515d65'),lab,V(0,-.055,0));floor.rotation.x=-Math.PI/2;floor.castShadow=false;const plinth=mesh(new T.CylinderGeometry(1.5,1.55,.06,64),mat('#707d84'),lab,V(0,-.025,0));plinth.receiveShadow=true;
 const helper=new T.SkeletonHelper(player.model);helper.visible=false;helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.65;scene.add(helper);
 const pathGeo=new T.BufferGeometry(),pathLine=new T.Line(pathGeo,new T.LineBasicMaterial({color:'#dfdc94',transparent:true,opacity:.6}));lab.add(pathLine);pathLine.visible=false;
 const ballGeo=new T.SphereGeometry(.052,16,12),ballMat=new T.MeshStandardMaterial({color:'#dfed58',roughness:.94});
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=96;const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(48,48,4,48,48,46);gradient.addColorStop(0,'rgba(0,0,0,.7)');gradient.addColorStop(1,'transparent');sc.fillStyle=gradient;sc.fillRect(0,0,96,96);const shadowMap=new T.CanvasTexture(shadowCanvas),shadowGeo=new T.PlaneGeometry(.42,.42);
 const playerShadow=[];for(let i=0;i<2;i++){const m=mesh(new T.PlaneGeometry(1.35,1.35),new T.MeshBasicMaterial({color:'#102419',map:shadowMap,transparent:true,opacity:.65,depthWrite:false}),scene);m.rotation.x=-Math.PI/2;m.castShadow=false;playerShadow.push(m)}
 const trailGeo=new T.BufferGeometry(),trailArray=new Float32Array(32*3);trailGeo.setAttribute('position',new T.BufferAttribute(trailArray,3));trailGeo.setDrawRange(0,0);const trailLine=new T.Line(trailGeo,new T.LineBasicMaterial({color:'#dbed7b',transparent:true,opacity:.55,depthWrite:false}));scene.add(trailLine);let trail=[];
 const particles=[],bounceMarks=[];
 function visualBall(b){b.mesh=new T.Mesh(ballGeo,ballMat.clone());b.mesh.castShadow=true;scene.add(b.mesh);b.shadow=new T.Mesh(shadowGeo,new T.MeshBasicMaterial({color:'#163123',map:shadowMap,transparent:true,opacity:.7,depthWrite:false}));b.shadow.rotation.x=-Math.PI/2;scene.add(b.shadow);return b}
 function addBall(p,v,spin=V()){const b=P.create(p,v,spin);b.id=++sequence;b.lastHitter=1;b.hitAt=clock;b.pointOver=false;visualBall(b);balls.push(b);return b}
 function removeBall(b){scene.remove(b.mesh,b.shadow);b.mesh.material.dispose();b.shadow.material.dispose()}
 function clearBalls(){balls.forEach(removeBall);balls=[];active=null;trail=[];trailGeo.setDrawRange(0,0)}
 function retireBall(b,reason){if(!b||b.dead)return;b.dead=true;b.deadAt=clock;b.pointOver=true;stats.deadRetained++;record('dead-ball',{id:b.id,reason,p:b.p.toArray()});if(active===b)active=null;lastPrediction=null;actors.forEach(a=>a.plan=null);while(balls.length>7){const old=balls.find(v=>v.dead&&v!==b);if(!old)break;removeBall(old);balls.splice(balls.indexOf(old),1)}}
 function mark(p,inside=true){const ring=flatRing(.08,.105,inside?'#ebf0b3':'#e8946f');ring.position.set(p.x,.023,p.z);bounceMarks.push({mesh:ring,born:clock})}
 function burst(p){if(!options.effects)return;for(let i=0;i<8;i++){const m=new T.Mesh(new T.SphereGeometry(.017,5,4),rgba('#f2f3c1',.75));m.position.copy(p);scene.add(m);particles.push({mesh:m,v:V(random(-1,1),random(.1,1.5),random(-1,1)),born:clock})}}
 let audio=null,muted=true;
 function sound(kind){if(muted)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')void audio.resume().catch(()=>{});const now=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(kind==='hit'?240:140,now);o.frequency.exponentialRampToValueAtTime(55,now+.085);g.gain.setValueAtTime(kind==='hit'?.10:.035,now);g.gain.exponentialRampToValueAtTime(.001,now+.1);o.connect(g).connect(audio.destination);o.start(now);o.stop(now+.12);o.onended=()=>{o.disconnect();g.disconnect()}}catch{}}
 function toast(title,sub='',time=1.4){$('sessionToast').innerHTML='';const h=document.createElement('strong'),s=document.createElement('span');h.textContent=title;s.textContent=sub;$('sessionToast').append(h,s);$('sessionToast').classList.add('show');toastUntil=clock+time}
 function setPause(v){if(ended&&!v)return;paused=v;$('pauseBtn').textContent=paused?'▶':'Ⅱ';$('pauseBtn').setAttribute('aria-label',paused?'继续':'暂停');if(paused)toast(ended?'Match complete.':'Pause',ended?'重新开始，或选择另一位对手':'按 P 继续',999);else $('sessionToast').classList.remove('show')}
 function resetActors(){player=playerChars[options.character];cpu=cpuChars[profile().character];Object.values(playerChars).concat(Object.values(cpuChars)).forEach(c=>{c.group.visible=false;c.group.scale.setScalar(1)});player.group.visible=true;cpu.group.visible=screen==='play'&&mode==='match';actors[0].char=player;actors[1].char=cpu;player.setOutfit(options.outfit);cpu.setOutfit(profile().outfit);const sc=profile().scale||[1,1,1];cpu.group.scale.set(sc[0],sc[1],sc[2]);for(const a of actors){const baseZ=a.side>0?8.8:(mode==='match'?profile().recovery:8.8);a.char.group.position.set(0,0,a.side*baseZ);a.char.group.rotation.y=a.side>0?Math.PI:0;a.plan=null;a.swing=null;a.velocity.set(0,0,0);a.char.idle(0)}playerShadow[1].visible=cpu.group.visible;helper.root=player.model;helper.bones=player.bones;helper.matrix=player.model.matrixWorld;}
 function newTarget(){target.position.set(random(-3.3,3.3),.032,random(-10.2,-3));targetCore.position.copy(target.position).add(V(0,.001,0))}
 function switchScreen(next,newMode=mode,isDemo=false){
  if(replay)exitReplay();screen=next;mode=newMode;demo=isDemo;paused=false;ended=false;keys.clear();Object.assign(input,{held:false,queued:false,power:0,x:0,z:0});clearBalls();history=[];lastReplay=[];replayDue=-1;clock=0;frame=0;nextBall=1.2;pointNo=0;rally=0;score=[0,0];practice={hits:0,misses:0,streak:0,best:0,points:0,lives:3};stats.hits=[0,0];stats.errors=[];stats.longestRally=0;stats.autoShots=stats.manualShots=0;stats.chosenShots=[];stats.deadRetained=0;stats.maxDeadAge=0;events.length=0;
  document.body.dataset.screen=next;document.body.classList.toggle('playing',next==='play');world.visible=next!=='studio';venue.sky.visible=next!=='studio';lab.visible=next==='studio';scene.background.set(next==='studio'?'#353f49':'#bbcfb4');
  $('intro').classList.toggle('hidden',next!=='home');$('venueCaption').classList.toggle('hidden',next!=='home');$('bottomNav').classList.toggle('hidden',next==='home');
  for(const id of ['scoreboard','practiceLabel','chargeHUD','assistTools','desktopHint','touchControls'])$(id).classList.toggle('hidden',next!=='play');
  for(const id of ['motionPanel','timeline'])$(id).classList.toggle('hidden',next!=='studio');
  $('sessionToast').classList.remove('show');$('replayBtn').classList.add('hidden');$('replayBanner').classList.add('hidden');$('pauseBtn').textContent='Ⅱ';
  $('matchTab').classList.toggle('active',next==='play'&&mode==='match');$('courtTab').classList.toggle('active',next==='play'&&mode!=='match');$('motionTab').classList.toggle('active',next==='studio');
  $('modeTools').classList.toggle('hidden',mode==='match');venue.machine.visible=mode!=='match'&&next==='play';
  resetActors();helper.visible=false;pathLine.visible=false;predictedRing.visible=positionRing.visible=positionArrow.visible=trajectory.visible=timingMarker.visible=false;
  target.visible=targetCore.visible=next==='play'&&mode==='target';if(target.visible)newTarget();aim.visible=next==='play'&&options.aimMode==='target';trailLine.visible=next==='play';
  if(next==='home'){player.group.position.set(-.7,0,8.3);player.group.rotation.y=-.22;player.charKind='forehand';player.idle(0)}
  if(next==='studio'){player.group.position.set(0,0,0);player.group.rotation.y=0;labTime=0;labPlaying=true;selectMotion(labKind);}
  syncHUD();record('screen',{screen,mode,demo});
 }
 function point(winner,reason,b=active){
  if(!b||b.pointOver)return;
  if(mode==='match'){score[winner]++;pointNo++;const done=score[winner]>=7&&score[winner]-score[1-winner]>=2;toast(winner===0?'Your point.':'Opponent point.',`${score[0]} — ${score[1]} · ${reason}`,1.8);if(done){ended=true;paused=true;toast(winner===0?'You win.':'Well played.',`${score[0]} — ${score[1]} · ${profile().name}`,999)}}
  else {if(winner===1){practice.misses++;practice.streak=0;if(mode==='endurance'){practice.lives--;if(practice.lives<=0){ended=true;paused=true;toast('Session over.','三次机会用尽 · 按 R 再来一轮',999)}}if(!ended)toast('Next ball.',reason,1.4)}else if(!ended)toast('In.','落点有效',1.1)}
  retireBall(b,reason);nextBall=clock+(mode==='match'?2.2:1.35);rally=0;syncHUD();record('point',{winner,reason,score:[...score]});
 }
 function feed(){
  if(active||ended)return;const d=difficulty(),x=random(-d.width,d.width),bounceZ=random(3.5,d.depth),targetPos=V(x,P.C.radius,bounceZ),origin=mode==='match'?actors[1].char.worldContact('serve'):V(0,1.2,-10.45);
  const serveStyle=profile(),servePower=clamp((d.speed-9)/12+(mode==='match'?(serveStyle.power-.4)*.34:0),0,1),spin=V(d.spin*(mode==='match'?serveStyle.spin:1),random(-8,8),0),launch=P.targeted({origin,target:targetPos,power:servePower,side:-1,spin});
  active=addBall(origin,launch.v,spin);active.lastHitter=1;active.hitAt=clock;active.receiver=0;active.serve=true;lastPredictionTime=-100;forecastId=-1;actors[0].plan=null;input.queued=false;input.power=0;
  if(mode==='match'){const a=actors[1];a.swing={kind:'serve',started:clock,lead:.70,hit:false,isServe:true,launch};active.held=true;active.v.set(0,0,0)}
  record('feed',{id:active.id,mode,difficulty:options.difficulty,spin:spin.toArray(),initialSpeed:launch.v.length(),target:targetPos.toArray()});
 }
 function forecast(){if(!active||active.held)return null;if(lastPrediction&&clock-lastPredictionTime<.09&&forecastId===active.id)return lastPrediction;lastPrediction=P.predict(active,3.2);lastPredictionTime=clock;forecastId=active.id;return lastPrediction}
 function getPlan(index){
  const a=actors[index],b=active;if(!b||b.dead||b.held||b.receiver!==index)return null;
  if(a.swing)return a.plan;if(a.plan&&a.plan.id===b.id&&a.plan.hitAt===b.hitAt&&a.plan.at-clock<.56&&a.plan.at>clock-.15)return a.plan;
  const pred=forecast();if(!pred)return null;const base=a.char.group.position,moveSpeed=index===0?P.playerControls.speed:profile().speed*difficulty().aiScale;
  let best=null;
  for(const s of pred.samples){
   if(s.t<.22||s.t>2.5||s.bounces>1||s.p.z*a.side<.65||s.p.z*a.side>14.5||s.p.y<.40||s.p.y>2.5||s.v.z*a.side<0)continue;
   const isBack=(s.p.x-base.x)*a.side<-.1;let kinds=[isBack?'backhand':'forehand'];
   if(s.bounces===0&&Math.abs(base.z)<6.1)kinds=[isBack?'backVolley':'volley'];else if(s.bounces===0)continue;
   if(s.p.y>1.85)kinds=['smash'];
   if(index===1&&options.opponent==='tactician'&&isBack)kinds=['slice'];
   for(const kind of kinds){const offset=a.char.localContact(kind).applyAxisAngle(axis,a.side>0?Math.PI:0),goal=s.p.clone().sub(offset);goal.y=0;if(Math.abs(goal.x)>6.0||goal.z*a.side<1.0||goal.z*a.side>14)continue;
    const gap=Math.abs(s.p.y-offset.y),distance=Math.hypot(goal.x-base.x,goal.z-base.z),travel=distance/moveSpeed;
    const penalty=Math.max(0,travel-(s.t-.12))*3+gap*5+Math.abs(Math.abs(goal.z)-8.1)*.018+s.t*.025;
    if(!best||penalty<best.penalty)best={id:b.id,hitAt:b.hitAt,kind,at:clock+s.t,p:s.p.clone(),velocity:s.v.clone(),goal,penalty,bounce:pred.bounces[0]||null};
   }
  }
  a.plan=best;return best;
 }
 function beginCharge(){if(screen!=='play'||demo||paused||replay||ended||actors[0].swing)return;input.held=true;input.since=clock;input.queued=false;input.power=0}
 function release(){if(!input.held||screen!=='play'||paused||replay||demo||ended)return;input.held=false;input.queued=true;input.queuedAt=clock;input.power=Math.max(.12,input.power);if(!options.timingAssist){startSwing(0);input.queued=false;}record('release',{power:input.power,autoTiming:options.timingAssist})}
 function startSwing(index){const a=actors[index];if(a.swing||!active||active.receiver!==index)return;const p=a.plan||getPlan(index);if(!p)return;const kind=p.kind;let lead=kind.includes('olley')?.22:kind==='smash'?.32:.31;if(index===1||options.timingAssist||demo)lead=clamp(p.at-clock,.16,.36);
  a.swing={kind,started:clock,lead,hit:false,power:index===1?profile().power:input.power||.46,planTime:p.at};if(index===0){input.queued=false;input.held=false;}
 }
 function chooseAI(index,b,kind,power){
  const a=actors[index],pos=b.p,other=actors[1-index].char.group.position;
  const candidates=index===1?[-.30,-.19,-.10,0,.10,.19,.30]:[-.13,0,.13];let best=null;
  for(const stance of candidates)for(const factor of [.8,1])for(const lift of [0,.035]){
   const shot=P.automatic({incoming:b.v,spin:b.spin,side:a.side,kind,power:power*factor,stance,lift,height:pos.y,balance:1});if(index===1)shot.spin.multiplyScalar(profile().spin);
   const sim=P.predict(P.create(pos,shot.v,shot.spin),3.0);const landing=sim.bounces[0];if(!landing)continue;
   const good=P.inside(landing.p,-a.side)&&!sim.net,pressure=landing.p.distanceTo(other),safety=Math.min(P.C.courtX-Math.abs(landing.p.x),P.C.courtZ-Math.abs(landing.p.z));
   const rating=(good?15:-20)+pressure*(index===1?profile().aggression:.1)+safety*(index===1?1-profile().aggression:1.4)-Math.abs(stance)*.2;
   if(!best||rating>best.rating)best={...shot,rating,stance,lift,power:power*factor};
  }
  if(!best)return P.automatic({incoming:b.v,side:a.side,kind,power:.35});
  if(index===1){const spread=profile().spread*difficulty().aiScale;const jitter=random(-spread,spread);best=P.automatic({incoming:b.v,spin:b.spin,side:a.side,kind,power:best.power,stance:best.stance+jitter,lift:best.lift,height:pos.y,balance:1});best.spin.multiplyScalar(profile().spin);}
  return best;
 }
 function contact(index){
  const a=actors[index],sw=a.swing;if(!sw||sw.hit||sw.finished)return;const b=active;if(!b||b.held||b.receiver!==index)return;
  const preContactError=a.char.racketWorld().distanceTo(b.p),timing=clock-sw.planTime;
  const reach=P.strikeContact({ball:b.p,player:a.char.group.position,side:a.side,phase:clock-sw.started-sw.lead,assisted:options.contactAssist});
  const accepted=index===0?reach.accepted:preContactError<=difficulty().aiReach&&Math.abs(timing)<=difficulty().aiWindow;
  if(!accepted){sw.lastMiss={distance:preContactError,timing,reachable:reach.reachable};if(index===1){sw.finished=true;record('missed-swing',{by:index,distance:preContactError,timing});}return;}
  // Anchor follow-through at the accepted hit, while preserving the forecast timing.
  sw.hit=true;sw.lead=clock-sw.started;
  a.char.setAnimation(sw.kind,C.defs[sw.kind].contact);
  const contact=a.char.racketWorld(),distance=contact.distanceTo(b.p);
  stats.errors.push({player:index,distance:+distance.toFixed(4),timing:+timing.toFixed(4),reach:+reach.horizontal.toFixed(4)});if(stats.errors.length>160)stats.errors.shift();
  const lateral=clamp((b.p.x-contact.x)*a.side,-.6,.6),balance=index===0?clamp(1-Math.max(0,reach.horizontal-.75)*.38-a.velocity.length()*.016,.65,1):clamp(1-distance*.55-a.velocity.length()*.016,.45,1);
  let shot;
  if(index===1||demo)shot=chooseAI(index,b,sw.kind,sw.power);
  else if(options.aimMode==='target'){shot=P.targeted({origin:b.p,target:aim.position,power:sw.power,side:a.side,spin:V(-a.side*70,0,0),error:lateral*.8});stats.manualShots++;}
  else{shot=P.automatic({incoming:b.v,spin:b.spin,side:a.side,kind:sw.kind,power:sw.power,timing,lateral,height:b.p.y,balance,movement:a.velocity.x,stance:0});stats.autoShots++;}
  b.v.copy(shot.v);b.spin.copy(shot.spin);b.bounces=0;b.rolling=false;b.sleeping=false;b.lastHitter=index;b.receiver=1-index;b.hitAt=clock;b.serve=false;lastPrediction=null;forecastId=-1;
  a.plan=null;actors[1-index].plan=null;rally++;stats.longestRally=Math.max(stats.longestRally,rally);stats.hits[index]++;speed=b.v.length()*3.6;
  stats.chosenShots.push({by:index,kind:sw.kind,speed:+speed.toFixed(1),mode:shot.mode,profile:index===1?options.opponent:'player'});if(stats.chosenShots.length>100)stats.chosenShots.shift();
  if(index===0){practice.hits++;practice.streak++;practice.best=Math.max(practice.best,practice.streak);input.power=0;lastImpact=clock;replayDue=clock+.65;toast(Math.abs(timing)<.05&&distance<.3?'Clean.':'Good ball.',`${C.defs[sw.kind].label} · ${Math.round(speed)} km/h`,.85)}
  burst(b.p);sound('hit');record('hit',{by:index,kind:sw.kind,error:distance,preContactError,impactElapsed:sw.lead,reach:reach.horizontal,timing,mode:shot.mode,v:b.v.toArray(),spin:b.spin.toArray(),power:sw.power});syncHUD();
 }
 function animateActor(index,dt){
  const a=actors[index],c=a.char;if(!c.group.visible)return;
  if(a.swing){const sw=a.swing,d=C.defs[sw.kind],elapsed=clock-sw.started;
   let t=elapsed<=sw.lead?mix(d.start,d.contact,elapsed/sw.lead):mix(d.contact,d.duration,clamp((elapsed-sw.lead)/.60,0,1));
   c.setAnimation(sw.kind,t);a.velocity.multiplyScalar(.85);
   if(sw.isServe&&active?.held){
    const hit=c.worldContact('serve'),remaining=Math.max(0,sw.lead-elapsed);active.p.copy(hit);active.p.y+=remaining*2.2-remaining*remaining*3;
    if(elapsed>=sw.lead){active.p.copy(c.racketWorld());active.held=false;active.v.copy(sw.launch.v);active.hitAt=clock;lastPrediction=null;sw.hit=true;sound('hit');}
   }else if(!sw.hit&&!sw.finished){
    const window=index===0?P.contactProfile(options.contactAssist):{before:0,after:0},phase=elapsed-sw.lead;
    if(phase>=-window.before&&phase<=window.after+(index===1?dt:0))contact(index);
    if(!sw.hit&&phase>window.after){sw.finished=true;if(index===0){record('missed-swing',{by:index,...sw.lastMiss});toast('Next swing.',sw.lastMiss?.reachable?'稍微提早或推迟松开':'靠近来球即可，不必踩中站位圈',1.0);}}
   }
   if(elapsed>sw.lead+.60){c.idle(0);a.swing=null;}return;
  }
  let desire=V(),moving=V();if(index===0){moving.set(input.x,0,input.z);if(keys.has('KeyA')||keys.has('ArrowLeft'))moving.x-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))moving.x+=1;if(keys.has('KeyW')||keys.has('ArrowUp'))moving.z-=1;if(keys.has('KeyS')||keys.has('ArrowDown'))moving.z+=1;}
  const p=getPlan(index),reaction=index===1?profile().reaction/difficulty().aiScale:0,canReact=active&&clock-active.hitAt>=reaction;
  if(moving.lengthSq()>.01)desire.copy(moving).clampLength(0,1).multiplyScalar(P.playerControls.speed);
  else if(p&&canReact&&(index===1||options.autoMove||demo)){
   const delta=p.goal.clone().sub(c.group.position),speed=index===1?profile().speed*difficulty().aiScale:P.playerControls.speed;
   desire.copy(delta).multiplyScalar(1/Math.max(.06,p.at-clock-.29)).clampLength(0,speed);
  }else if((index===1||demo)&&(!active||active.receiver!==index)){
   const home=V(active?clamp(active.p.x*.28,-1.1,1.1):0,0,a.side*(index===1?profile().recovery:8.7));desire.copy(home.sub(c.group.position)).multiplyScalar(1.8).clampLength(0,3.3);
  }
  a.velocity.lerp(desire,1-Math.exp(-dt*18));if(desire.length()<.02&&a.velocity.length()<.08)a.velocity.set(0,0,0);c.group.position.addScaledVector(a.velocity,dt);c.group.position.x=clamp(c.group.position.x,-6.3,6.3);c.group.position.z=a.side*clamp(c.group.position.z*a.side,1.0,14.0);c.idle(dt,a.velocity.length(),a.velocity);
  if(p&&canReact&&index===1&&p.at-clock<=.31)startSwing(1);
  if(p&&index===0){if(demo&&p.at-clock<.75){input.power=.44;if(p.at-clock<=.31)startSwing(0)}else if(input.queued&&options.timingAssist&&p.at-clock<=.31&&p.at-clock>-.20)startSwing(0);
   // Charge holds a prepared pose; moving lower body remains visible.
   if((input.held||input.queued)&&a.velocity.length()<1.4){const ready=c.pose(p.kind,C.defs[p.kind].start);c.apply(ready);}
  }
 }
 function stepBalls(dt){
  for(const b of balls){if(b.held)continue;const wasAlive=b===active&&!b.dead;const ev=P.step(b,dt);
   for(const e of ev){if(e.type==='bounce'){
     if(!b.dead){mark(e.p,P.inside(e.p,-actors[b.lastHitter].side));sound('bounce')}
     if(wasAlive&&!b.pointOver){const expectedSide=actors[b.receiver].side;
      if(e.count===1){const good=P.inside(e.p,expectedSide);record('bounce',{id:b.id,count:e.count,inside:good,p:e.p.toArray(),lastHitter:b.lastHitter});
       if(!good)point(b.receiver,'出界',b);
       else if(mode!=='match'&&b.lastHitter===0){if(mode==='target'){const dist=V(e.p.x,0,e.p.z).distanceTo(V(target.position.x,0,target.position.z));const award=dist<.26?120:dist<.72?80:dist<1.2?30:0;practice.points+=award;if(award){toast('Target.',`+${award} · ${practice.points} 分`);newTarget()}}retireBall(b,'valid-return');nextBall=clock+1.25;practice.streak=Math.max(1,practice.streak)}
      }else if(e.count>=2)point(b.lastHitter,'二次落地',b);
     }
    }else if(e.type==='net'&&wasAlive&&!b.pointOver){stats.netHits++;point(b.receiver,'下网',b)}
   }
   if(b.dead){stats.maxDeadAge=Math.max(stats.maxDeadAge,clock-b.deadAt);const age=clock-b.deadAt;b.mesh.material.transparent=age>19;b.mesh.material.opacity=clamp((21-age)/2,0,1);if(age>21)b.expired=true;}
   else if(b===active&&(Math.abs(b.p.x)>9.0||Math.abs(b.p.z)>17.3||clock-b.hitAt>7))point(b.lastHitter,'未能回球',b);
  }
  balls=balls.filter(b=>{if(b.expired){removeBall(b);return false}return true});
 }
 function capture(){
  return {t:clock,actors:actors.map(a=>({pos:a.char.group.position.clone(),kind:a.char.kind,time:a.char.time,pose:a.char.lastPose?{q:a.char.lastPose.q.map(q=>q.clone()),p:a.char.lastPose.p.clone(),full:a.char.lastPose.full?Object.fromEntries(Object.entries(a.char.lastPose.full).map(([key,values])=>[key,values.map(v=>v.clone())])):null}:a.char.pose('forehand',0)})),ball:active?{p:active.p.clone(),id:active.id}:null};
 }
 function recordReplay(){if(frame%4)return;history.push(capture());while(history.length>100)history.shift();if(replayDue>0&&clock>=replayDue){lastReplay=history.filter(f=>f.t>=lastImpact-1.0&&f.t<=lastImpact+.65);replayDue=-1;$('replayBtn').classList.remove('hidden')}}
 function startReplay(){if(screen!=='play'||lastReplay.length<5||replay)return false;replayBase=capture();replay={elapsed:0,frames:lastReplay.slice()};$('replayBanner').classList.remove('hidden');$('chargeHUD').classList.add('hidden');$('touchControls').classList.add('hidden');input.held=input.queued=false;keys.clear();input.x=input.z=0;trail=[];updateHelpers();return true}
 function replayStep(dt){if(!replay)return;replay.elapsed+=dt*.5;const fs=replay.frames,t=fs[0].t+replay.elapsed;if(t>fs.at(-1).t+.15){exitReplay();return}let hi=1;while(hi<fs.length-1&&fs[hi].t<t)hi++;const a=fs[hi-1],b=fs[hi],u=clamp((t-a.t)/(b.t-a.t),0,1);
  for(let i=0;i<2;i++){const c=actors[i].char,ap=a.actors[i],bp=b.actors[i];c.group.position.copy(ap.pos).lerp(bp.pos,u);const full=ap.pose.full&&bp.pose.full?Object.fromEntries(Object.entries(ap.pose.full).map(([key,values])=>[key,values.map((v,j)=>key==='q'?v.clone().slerp(bp.pose.full[key][j],u):v.clone().lerp(bp.pose.full[key][j],u))])):null;c.apply({p:ap.pose.p.clone().lerp(bp.pose.p,u),q:ap.pose.q.map((q,j)=>q.clone().slerp(bp.pose.q[j],u)),full});}
  replay.ball=a.ball&&b.ball?a.ball.p.clone().lerp(b.ball.p,u):b.ball?.p;replay.ballId=b.ball?.id;
 }
 function exitReplay(){if(!replay)return;actors.forEach((a,i)=>{a.char.group.position.copy(replayBase.actors[i].pos);a.char.apply(replayBase.actors[i].pose)});replay=null;replayBase=null;$('replayBanner').classList.add('hidden');$('chargeHUD').classList.remove('hidden');$('touchControls').classList.remove('hidden');trail=[];updateHelpers();}
 function updateHelpers(){
  const p=actors[0].plan,play=screen==='play'&&!replay,fore=lastPrediction;
  predictedRing.visible=play&&options.showBounce&&!!active&&active.receiver===0&&!!fore?.bounces.length;
  if(predictedRing.visible){predictedRing.position.copy(fore.bounces[0].p);predictedRing.position.y=.025;}
  positionRing.visible=positionArrow.visible=play&&options.showPosition&&!!p;
  if(p){positionRing.position.copy(p.goal);positionRing.position.y=.031;positionArrow.position.copy(p.goal).add(V(0,.05,-.55))}
  trajectory.visible=play&&options.showTrajectory&&!!active&&!!fore;
  if(trajectory.visible){trajectoryGeo.setFromPoints([active.p,...fore.samples.map(s=>s.p)]);trajectory.computeLineDistances()}
  timingMarker.visible=play&&options.showTiming&&!!active&&active.receiver===0&&!!p&&Math.abs(p.at-clock)<.32;
  if(timingMarker.visible){timingMarker.position.copy(active.p);timingMarker.quaternion.copy(camera.quaternion);timingMarker.material.color.set(Math.abs(p.at-clock)<.09?'#e2ef71':'#d3e6e0')}
  aim.visible=play&&options.aimMode==='target';
 }
 function tick(dt){
  if(replay){replayStep(dt);return}if(paused&&screen==='play')return;clock+=dt;frame++;
  if(screen==='play'){
   if(!active&&clock>=nextBall&&!actors.some(a=>a.swing)&&!ended)feed();
   if(input.held)input.power=clamp((clock-input.since)/.55,0,1);
   if(input.queued&&clock-input.queuedAt>P.playerControls.buffer){input.queued=false;input.power=0;}
   stepBalls(dt);animateActor(0,dt);if(mode==='match')animateActor(1,dt);recordReplay();
   if(frame%8===0){updateHelpers();syncHUD();}
  }else if(screen==='studio'){
   const d=C.defs[labKind];if(labPlaying)labTime=(labTime+dt*labSpeed)%d.duration;player.setAnimation(labKind,labTime);helper.visible=$('skeletonToggle').checked;pathLine.visible=helper.visible;if(frame%4===0)updateMotionUI();
  }else player.idle(dt);
  if(clock>toastUntil&&!ended)$('sessionToast').classList.remove('show');
  for(let i=bounceMarks.length-1;i>=0;i--){const m=bounceMarks[i],age=clock-m.born;m.mesh.scale.setScalar(1+age*1.9);m.mesh.material.opacity=Math.max(0,.6-age*.4);if(age>1.5){scene.remove(m.mesh);m.mesh.geometry.dispose();m.mesh.material.dispose();bounceMarks.splice(i,1)}}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i],age=clock-p.born;p.v.y-=9.8*dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.scale.setScalar(Math.max(0,1-age/.38));if(age>.38){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();particles.splice(i,1)}}
 }
 const look=V(-1.2,1,8.3);camera.position.set(1.8,1.9,12);
 function draw(dt=1/60){
  const portrait=innerHeight>innerWidth,mobile=innerWidth<600,pc=player.group.position,to=V(),at=V();
  if(replay){to.copy(pc).add(V(2.7,1.7,2.6));at.copy(pc).add(V(0,1.05,0));camera.fov=47}
  else if(screen==='home'){to.set(mobile?1.6:1.35,1.8,mobile?12.45:11.85);at.set(mobile?-1.2:-1.7,1.05,8.3);camera.fov=mobile?49:43}
  else if(screen==='studio'){to.set(Math.sin(labYaw)*labDistance,labElevation,Math.cos(labYaw)*labDistance);at.set(mobile?-.05:-.65,.96,0);camera.fov=mobile?48:38;}
  else if(options.camera==='wide'||portrait){to.set(portrait?pc.x*.3+.65:5.5,portrait?14.4:11.6,portrait?26:24);at.set(portrait?pc.x*.2:0,.5,portrait?1.5:0);camera.fov=portrait?51:46;}
  else{to.set(clamp(pc.x*.24+.7,-1.2,2),5.2,clamp(pc.z+9.4,18.8,23.6));at.set(pc.x*.1,.7,-1.8);camera.fov=48}
  const f=1-Math.exp(-dt*5);camera.position.lerp(to,f);look.lerp(at,f);camera.lookAt(look);camera.updateProjectionMatrix();
  for(const b of balls){const rp=replay&&b.id===replay.ballId?replay.ball:b.p;b.mesh.visible=!replay||b.id===replay.ballId||b.dead;if(rp)b.mesh.position.copy(rp);b.mesh.rotation.x+=dt*b.spin.x;b.mesh.rotation.y+=dt*b.spin.y;b.shadow.visible=b.mesh.visible;b.shadow.position.set(b.mesh.position.x,.024,b.mesh.position.z);b.shadow.material.opacity=clamp(.70-b.mesh.position.y*.09,.1,.7);b.shadow.scale.setScalar(1+b.mesh.position.y*.08);}
  if(active&&!paused&&!replay&&!active.held){trail.unshift(active.p.clone());if(trail.length>32)trail.pop()}if(!active||replay)trail=[];for(let i=0;i<trail.length;i++)trail[i].toArray(trailArray,i*3);trailGeo.attributes.position.needsUpdate=true;trailGeo.setDrawRange(0,trail.length);
  actors.forEach((a,i)=>{playerShadow[i].position.set(a.char.group.position.x,.026,a.char.group.position.z);playerShadow[i].visible=a.char.group.visible});
  $('impactFlash').style.opacity=options.effects&&!replay&&screen==='play'?String(clamp(1-(clock-lastImpact)/.15,0,1)):0;
  helper.updateMatrixWorld(true);presentation.render(scene,camera,clock);
 }
 function syncHUD(){
  const match=mode==='match';$('returnsLabel').textContent=match?'你':'回球';$('streakLabel').textContent=match?profile().name:mode==='endurance'?'机会':'连续';$('returns').textContent=String(match?score[0]:practice.hits).padStart(2,'0');$('streak').textContent=String(match?score[1]:mode==='endurance'?practice.lives:practice.streak).padStart(2,'0');$('speed').innerHTML=(speed?Math.round(speed):'—')+'<small> km/h</small>';
  $('modeLabel').textContent=match?`${profile().name} · ${profile().label}`:mode==='target'?'目标挑战':mode==='endurance'?'耐力挑战':'发球机练习';
  const plan=actors[0].plan;$('shotHint').textContent=ended?'本轮结束':actors[0].swing?C.defs[actors[0].swing.kind].label:plan?`${C.defs[plan.kind].label} · 靠近来球即可`:'准备下一拍';
  $('challengeHint').textContent=match?`${difficulty().label} · 先到 7 分 / 领先 2 分 · ${rally} 拍`:mode==='target'?`${practice.points} 分 · ${difficulty().label}`:`最佳连续 ${practice.best} · ${difficulty().label}`;
  $('powerValue').textContent=Math.round(input.power*100)+'%';$('chargeFill').style.width=input.power*100+'%';
  $('chargeLabel').textContent=demo?'示范中 · 自动挥拍':input.held?(input.power>=1?'蓄满保持 · 松开击球':'正在蓄力'):input.queued?'已准备 · 等待来球':touch?'按住 HIT 蓄力':'按住空格蓄力';
  $('aimHint').textContent=options.aimMode==='physics'?'击球状态决定落点 · 时机 / 拍面 / 力量':'点击对面球场，选择目标落点';
  $('assistBtn').classList.toggle('active',options.autoMove);$('assistBtn').querySelector('b').textContent=options.autoMove?'开':'关';
  for(const [id,m] of [['modeRallyBtn','practice'],['modeTargetBtn','target'],['modeEnduranceBtn','endurance']])$(id).classList.toggle('active',mode===m);
 }
 function selectMotion(kind){if(!C.defs[kind])return;labKind=kind;labTime=0;document.querySelectorAll('[data-motion]').forEach(b=>b.classList.toggle('active',b.dataset.motion===kind));
  const points=[],saved=player.lastPose;for(let i=0;i<=48;i++){player.setAnimation(kind,C.defs[kind].duration*i/48);points.push(player.racketWorld())}pathGeo.setFromPoints(points);if(saved)player.apply(saved);updateMotionUI();}
 function updateMotionUI(){const d=C.defs[labKind];$('scrub').value=String(labTime/d.duration);$('clipTime').textContent=`${labTime.toFixed(2)} / ${d.duration.toFixed(2)}s`;$('phaseLabel').textContent=labTime<d.start?'转体准备':labTime<d.contact-.06?'引拍':labTime<d.contact+.08?'触球':'随挥回位';$('motionPlayBtn').textContent=labPlaying?'Ⅱ':'▶';}
 function configure(){
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,options.quality==='high'?1.8:options.quality==='eco'?1:touch?1.1:1.35,2300/Math.max(innerWidth,innerHeight)));renderer.setSize(innerWidth,innerHeight);presentation.quality(options.quality);
  const n=options.quality==='high'?4096:options.quality==='eco'?1024:2048;if(venue.sun.shadow.mapSize.x!==n){venue.sun.shadow.map?.dispose();venue.sun.shadow.map=null;venue.sun.shadow.mapSize.set(n,n);venue.sun.shadow.needsUpdate=true;}
  venue.lighting(options.light);venue.foliage.visible=options.quality!=='eco';player.setOutfit(options.outfit);
  for(const [k,values] of Object.entries(enums))document.querySelectorAll(`[data-${k.toLowerCase()}]`).forEach(b=>b.classList.toggle('active',b.getAttribute('data-'+k.toLowerCase())===options[k]));
  for(const [k,v] of Object.entries(options)){const el=$('opt-'+k);if(el?.type==='checkbox')el.checked=v;if(el?.tagName==='SELECT')el.value=v;}
  $('homeOpponent').textContent=`${profile().name} · ${profile().label} / ${difficulty().label}`;updateHelpers();syncHUD();save();
 }
 const dialogs=[$('assetsDialog'),$('settingsDialog'),$('setupDialog')],states=new WeakMap();
 function openDialog(d){if(d.open)return;if(replay)exitReplay();states.set(d,paused);if(screen==='play')paused=true;input.held=input.queued=false;keys.clear();input.x=input.z=0;d.showModal()}
 function closeDialog(d){if(states.has(d)){if(!ended)paused=states.get(d);states.delete(d)}d.close();}
 dialogs.forEach(d=>{d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d)});d.querySelector('.dialog-close').onclick=()=>closeDialog(d);d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d)}})});
 $('playBtn').onclick=()=>openDialog($('setupDialog'));$('practiceBtn').onclick=()=>switchScreen('play','practice');$('demoBtn').onclick=()=>switchScreen('play','match',true);$('home').onclick=e=>{e.preventDefault();switchScreen('home')};$('startMatchBtn').onclick=()=>{closeDialog($('setupDialog'));switchScreen('play','match',false)};
 $('matchTab').onclick=()=>openDialog($('setupDialog'));$('courtTab').onclick=()=>switchScreen('play','practice');$('motionTab').onclick=$('introMotionBtn').onclick=()=>switchScreen('studio');
 $('settingsBtn').onclick=()=>openDialog($('settingsDialog'));$('assetsTab').onclick=()=>openDialog($('assetsDialog'));$('pauseBtn').onclick=()=>setPause(!paused);$('restartBtn').onclick=()=>switchScreen('play',mode,demo);$('assistBtn').onclick=()=>{options.autoMove=!options.autoMove;configure()};
 $('modeRallyBtn').onclick=()=>switchScreen('play','practice',demo);$('modeTargetBtn').onclick=()=>switchScreen('play','target',demo);$('modeEnduranceBtn').onclick=()=>switchScreen('play','endurance',demo);
 $('cameraBtn').onclick=()=>{options.camera=options.camera==='follow'?'wide':'follow';save()};$('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{}};
 $('soundBtn').onclick=()=>{muted=!muted;$('soundBtn').setAttribute('aria-label',muted?'开启声音':'关闭声音');$('soundBtn').style.opacity=muted?'.55':'1';if(!muted)sound('hit')};
 $('replayBtn').onclick=startReplay;$('exitReplayBtn').onclick=exitReplay;
 document.querySelectorAll('[data-motion]').forEach(b=>b.onclick=()=>selectMotion(b.dataset.motion));$('motionPlayBtn').onclick=()=>{labPlaying=!labPlaying;updateMotionUI()};$('slowBtn').onclick=()=>{labSpeed=labSpeed===.5?1:labSpeed===1?.25:.5;$('slowBtn').textContent=labSpeed+'×'};
 $('scrub').oninput=()=>{labPlaying=false;labTime=Number($('scrub').value)*C.defs[labKind].duration;player.setAnimation(labKind,labTime);updateMotionUI()};
 $('wireToggle').onchange=()=>player.materials.forEach(m=>m.wireframe=$('wireToggle').checked);
 for(const key of Object.keys(enums)){
  document.querySelectorAll(`[data-${key.toLowerCase()}]`).forEach(b=>b.onclick=()=>{const v=b.getAttribute('data-'+key.toLowerCase());if(!enums[key].includes(v))return;options[key]=v;if(key==='character'){const oldScreen=screen;resetActors();if(oldScreen==='home'){player.group.position.set(-.7,0,8.3);player.group.rotation.y=-.22;}if(oldScreen==='studio'){player.group.position.set(0,0,0);player.group.rotation.y=0;selectMotion(labKind)}}configure()});
  const el=$('opt-'+key);if(el)el.onchange=()=>{if(enums[key].includes(el.value)){options[key]=el.value;actors.forEach(a=>a.plan=null);configure()}};
 }
 for(const key of Object.keys(options).filter(k=>typeof options[k]==='boolean')){const el=$('opt-'+key);if(el)el.onchange=()=>{options[key]=el.checked;configure()}}
 window.addEventListener('keydown',e=>{if(dialogs.some(d=>d.open))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(replay){if(e.code==='Escape')exitReplay();return}keys.add(e.code);if(e.repeat)return;if(e.code==='Space')beginCharge();if(e.code==='KeyP'&&screen==='play')setPause(!paused);if(e.code==='KeyR'&&screen==='play')switchScreen('play',mode,demo);if(e.code==='KeyJ')startReplay()});
 window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')release()});window.addEventListener('blur',()=>{keys.clear();input.held=input.queued=false;input.x=input.z=0;if(screen==='play'&&!dialogs.some(d=>d.open))setPause(true)});
 $('hitButton').onpointerdown=e=>{e.preventDefault();$('hitButton').setPointerCapture(e.pointerId);beginCharge()};$('hitButton').onpointerup=e=>{e.preventDefault();release()};$('hitButton').onpointercancel=()=>{input.held=false};
 let joyPointer=null;const joy=$('joystick'),knob=$('joystickKnob');const joyMove=e=>{const r=joy.getBoundingClientRect(),v=V(e.clientX-r.x-r.width/2,0,e.clientY-r.y-r.height/2).clampLength(0,r.width*.34);input.x=v.x/(r.width*.34);input.z=v.z/(r.width*.34);knob.style.transform=`translate(${v.x}px,${v.z}px)`};
 joy.onpointerdown=e=>{joyPointer=e.pointerId;joy.setPointerCapture(joyPointer);joyMove(e)};joy.onpointermove=e=>{if(e.pointerId===joyPointer)joyMove(e)};joy.onpointerup=joy.onpointercancel=()=>{joyPointer=null;input.x=input.z=0;knob.style.transform=''};
 let pointer=null;canvas.onpointerdown=e=>{pointer={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!pointer)return;if(screen==='studio'){labYaw-=(e.clientX-pointer.lastX)*.008;labElevation=clamp(labElevation+(e.clientY-pointer.lastY)*.005,.5,3.0)}pointer.lastX=e.clientX;pointer.lastY=e.clientY};
 canvas.onpointerup=e=>{if(pointer&&screen==='play'&&options.aimMode==='target'&&!paused&&!replay&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<12){ray.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);const p=ray.ray.intersectPlane(ground,V());if(p&&p.z<-.5)aim.position.set(clamp(p.x,-5.5,5.5),.035,clamp(p.z,-13,-2));}pointer=null};canvas.addEventListener('wheel',e=>{if(screen==='studio'){e.preventDefault();labDistance=clamp(labDistance+e.deltaY*.002,2.8,6.0)}},{passive:false});
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);presentation.resize()});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;$('fatal').classList.remove('hidden');$('fatalMessage').textContent='图形上下文丢失，请重新加载。'});
 function telemetry(){return {version:'baseline-club-2.0.0-local.1',screen,mode,demo,clock:+clock.toFixed(4),paused,ended,options:{...options},score:[...score],rally,practice:{...practice},stats:JSON.parse(JSON.stringify(stats)),events:events.slice(),actors:actors.map(a=>({character:a.char.name,p:a.char.group.position.toArray(),v:a.velocity.toArray(),plan:a.plan?{kind:a.plan.kind,at:a.plan.at,p:a.plan.p.toArray(),goal:a.plan.goal.toArray()}:null,swing:a.swing?{kind:a.swing.kind,lead:a.swing.lead,hit:a.swing.hit}:null})),active:active?{id:active.id,p:active.p.toArray(),v:active.v.toArray(),spin:active.spin.toArray(),receiver:active.receiver,bounces:active.bounces,held:!!active.held}:null,balls:balls.map(b=>({id:b.id,dead:b.dead,deadAge:b.dead?clock-b.deadAt:0,p:b.p.toArray(),v:b.v.toArray(),sleeping:b.sleeping})),input:{...input},aim:aim.position.toArray(),target:target.position.toArray(),replay:!!replay,replayFrames:lastReplay.length,helpers:{bounce:predictedRing.visible,position:positionRing.visible,trajectory:trajectory.visible,timing:timingMarker.visible,aim:aim.visible},render:presentation.last,rigs:[player.diagnostics(),cpu.diagnostics()]}}
 $('exportTelemetry').onclick=()=>{const blob=new Blob([JSON.stringify(telemetry(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='baseline-club-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 window.__club={ready:true,telemetry,freeze:v=>externalClock=v,render:()=>draw(10),step:(seconds,render=true)=>{externalClock=true;for(let i=0;i<Math.round(seconds*120);i++)tick(1/120);if(render)draw(10);return telemetry()},start:(m='match',isDemo=false)=>switchScreen('play',m,isDemo),home:()=>switchScreen('home'),studio:()=>switchScreen('studio'),seek:(kind,t,render=true)=>{if(screen!=='studio')switchScreen('studio');selectMotion(kind);labPlaying=false;labTime=t;player.setAnimation(kind,t);updateMotionUI();if(render)draw(10)},setOption:(key,val)=>{if(!(key in options))throw Error('Unknown option');options[key]=val;actors.forEach(a=>a.plan=null);configure()},setAim:(x,z)=>aim.position.set(x,.035,z),setSeed:n=>seed=n>>>0,setInput:(x,z)=>{input.x=x;input.z=z},charge:beginCharge,release,pose:()=>actors.map(a=>({kind:a.char.kind,time:a.char.time})),setLabView:(yaw,height,distance)=>{labYaw=yaw;labElevation=height;labDistance=distance;draw(10)},startReplay,exitReplay,pause:setPause,physics:P};
 configure();switchScreen('home');draw(10);$('loading').classList.add('hidden');
 let last=performance.now(),accumulator=0;function frameLoop(now){const dt=clamp((now-last)/1000,0,.065);last=now;if(!externalClock){accumulator+=dt;let n=0;while(accumulator>=1/120&&n++<9){tick(1/120);accumulator-=1/120}draw(dt)}requestAnimationFrame(frameLoop)}requestAnimationFrame(frameLoop);
 }catch(e){console.error(e);window.__clubError=String(e.stack||e);$('loading').classList.add('hidden');$('fatal').classList.remove('hidden');$('fatalMessage').textContent=String(e.message||e)}
})();
