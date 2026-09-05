import * as THREE from '/vendor/three.module.js';
import { createDepthOfField } from './depth-of-field.js';
import { createCameraRoute } from './camera-route.js';
import { createExplosionSpace } from './explosion-space.js';
import { evaluateMotion, motion, SHOTS, BEAT_RANGES, TOTAL_TIME, smooth } from './film.js';
import { A343_PROFILE as PROFILE, roleIds, roleId } from './model-profile.js';
const V=a=>new THREE.Vector3(...a);
const normal=V([0,-Math.sin(PROFILE.dimensions.faceAngleDeg*Math.PI/180),Math.cos(PROFILE.dimensions.faceAngleDeg*Math.PI/180)]);
function spline(knots,t,column){
 let i=0;while(i<knots.length-2&&t>knots[i+1][0])i++;
 const a=knots[i],b=knots[i+1],p=knots[Math.max(0,i-1)],n=knots[Math.min(knots.length-1,i+2)];
 const dt=b[0]-a[0],u=Math.max(0,Math.min(1,(t-a[0])/dt)),x=a[column],y=b[column];
 const slope=(y-x)/dt;
 const previous=a[0]===p[0]?slope:(x-p[column])/(a[0]-p[0]);
 const next=n[0]===b[0]?slope:(n[column]-y)/(n[0]-b[0]);
 const tangent=(a,b)=>a*b<=0?0:2*a*b/(a+b);
 const m0=tangent(previous,slope),m1=tangent(slope,next);
 return (2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*dt*m0+(-2*u**3+3*u*u)*y+(u**3-u*u)*dt*m1;
}
export function createFilmEngine(model){
 const {scene,camera,renderer,root,parts,lights,dust}=model;
 const route=createCameraRoute(model);
 const space=createExplosionSpace(model),optics=createDepthOfField(renderer,camera);optics.resize();
 const roleWorld=role=>{
  if(role==='optical'){const ids=['lcd_rear_frame','lcd_diffuser','lcd_rear_polarizer','lcd_front_cover_glass'];return ids.reduce((v,id)=>v.add(parts.get(id).pivot.getWorldPosition(new THREE.Vector3())),new THREE.Vector3()).multiplyScalar(.25);}
  const ids=roleIds(role);const p=parts.get(ids[0]);
  return p?p.pivot.getWorldPosition(new THREE.Vector3()):space.core.clone();
 };
 const paperUniform={value:0};
 const color=new THREE.Color(),ink=new THREE.Color(0x353430),paperColor=new THREE.Color(0xe5e2dc),dark=new THREE.Color(0x141b22);
 // White paper receives solid, flat surfaces so only visible contour edges print.
 for(const p of parts.values()){
  p.physicalMaterial=p.mesh.material;
  p.physicalMaterial.polygonOffset=true;p.physicalMaterial.polygonOffsetFactor=1;p.physicalMaterial.polygonOffsetUnits=1;
  p.physicalMaterial.onBeforeCompile=shader=>{
   shader.uniforms.uPaper=paperUniform;
   shader.fragmentShader='uniform float uPaper;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>', '#include <tonemapping_fragment>\n gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3('+paperColor.r+','+paperColor.g+','+paperColor.b+'),uPaper);');
  };
  if(!p.line&&(p.group==='switch'||p.group==='lcd')){
   p.line=new THREE.LineSegments(new THREE.EdgesGeometry(p.mesh.geometry,35),new THREE.LineBasicMaterial({color:ink,transparent:true,opacity:0,depthWrite:false}));p.pivot.add(p.line);
  }
 }
 const frames=[[0,SHOTS[0]],...SHOTS.flatMap((shot,i)=>[[BEAT_RANGES[i][1]+shot.duration*.20,shot],[BEAT_RANGES[i][1]+shot.duration*.80,{...shot,az:shot.az+(shot.id==='teaser'?0:1.5),distance:shot.distance*(shot.id==='teaser'?.976:.99)}]]),[TOTAL_TIME,SHOTS.at(-1)]];
 let focal=V([0,0,0]),state=evaluateMotion(0);
  // Screen artwork stays attached to the real front glass through all assembly states.
  const host=parts.get(roleId('activeGlass'));
  const screenCanvas=document.createElement('canvas');screenCanvas.width=800;screenCanvas.height=600;
  const ctx=screenCanvas.getContext('2d');
  ctx.fillStyle='#080e13';ctx.fillRect(0,0,800,600);
  const text=(s,x,y,size,c='#d8e5e8')=>{ctx.fillStyle=c;ctx.font=`500 ${size}px sans-serif`;ctx.fillText(s,x,y);};
  text('LUMA',55,65,24,'#91a6b2');text('Living room',55,145,45);text('SCENES',55,205,16,'#647c8b');
  for(let i=0;i<3;i++){ctx.fillStyle=i===0?'#283630':'#131d24';ctx.beginPath();ctx.roundRect(50,230+i*92,700,74,13);ctx.fill();text(['Evening','Focus','Away'][i],80,277+i*92,27,i===0?'#edc989':'#bdcbd3');text(['72%','45%','Off'][i],640,277+i*92,23,'#95a7af');}
  ctx.fillStyle='#cba568';ctx.fillRect(55,554,240,3);text('LOCAL CONTROL',480,562,16,'#6c8794');
  const texture=new THREE.CanvasTexture(screenCanvas);texture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(...PROFILE.dimensions.displayVisible),new THREE.MeshBasicMaterial({map:texture,toneMapped:false,transparent:true,depthWrite:false}));
  screen.rotation.x=PROFILE.dimensions.faceAngleDeg*Math.PI/180;
  const pos=host.mesh.geometry.getAttribute('position');let surface=-Infinity;
  for(let i=0;i<pos.count;i++)surface=Math.max(surface,pos.getX(i)*normal.x+pos.getY(i)*normal.y+pos.getZ(i)*normal.z);
  screen.position.copy(normal).multiplyScalar(surface+.035);host.pivot.add(screen);
  const glass=host.mesh.material;glass.color.set(0x111b23);glass.roughness=.16;glass.metalness=.18;
  // One fine ring reveals the rotary input without substituting imaginary hardware.
  const knob=parts.get(roleId('knob'));
  const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({length:96},(_,i)=>{
    const a=i/96*Math.PI*2;return new THREE.Vector3(Math.cos(a)*15,Math.sin(a)*15,0);
  })),new THREE.LineBasicMaterial({color:0xd2b07b,transparent:true,opacity:0,depthWrite:false}));
  ring.quaternion.setFromUnitVectors(V([0,0,1]),normal);ring.position.copy(normal).multiplyScalar(5);knob.pivot.add(ring);


 function update(){
  const s=evaluateMotion(motion.filmTime);state=s;Object.assign(motion,s);
  space.update(s.explosion);root.updateMatrixWorld(true);
  const t=s.filmTime;
  let knots=frames.map(([time,shot])=>{
   const f=roleWorld(shot.focus);
   if(shot.id==='teaser'){f.set(0,19,27-model.assemblyCenter.z);}
   // Macro starts on the display plane, with the dial entering the lower edge.
   return[time,shot.az,shot.el,shot.distance,shot.lens,f.x,f.y,f.z];
  });
  const opening=BEAT_RANGES.find(([id])=>id==='unfold');
  const handoff=BEAT_RANGES.find(([id])=>id==='constellation');
  if(t<handoff[1]+900){
   const surfaceTarget=parts.get(roleId('upperShell')).home.clone().add(V([0,4,6]));
   const inside=roleWorld('mainboard');
   // The opaque reading section conceals this prepared, complete opening frame.
   // Once it scrolls away, one continuous arc carries us into the structure.
   knots=[
    [0,-12,52,275,33,...surfaceTarget],
    [opening[1],-12,52,275,33,...surfaceTarget],
    [opening[1]+1300,4,44,325,35,...surfaceTarget.clone().lerp(inside,.4)],
    [opening[2],22,34,385,37,...inside],
   ];
  }
  let distance=spline(knots,t,3),lens=spline(knots,t,4);
  const mobile=innerWidth<760;
  distance*=mobile?1.7:Math.max(1,1.6/camera.aspect);
  camera.fov=lens;camera.updateProjectionMatrix();
  focal.set(spline(knots,t,5),spline(knots,t,6),spline(knots,t,7));
  const az=spline(knots,t,1)*Math.PI/180,el=spline(knots,t,2)*Math.PI/180;
  camera.position.copy(focal).add(V([Math.sin(az)*Math.cos(el)*distance,-Math.cos(az)*Math.cos(el)*distance,Math.sin(el)*distance]));
  const forward=focal.clone().sub(camera.position).normalize(),right=new THREE.Vector3().crossVectors(forward,V([0,0,1])).normalize(),up=new THREE.Vector3().crossVectors(right,forward).normalize();
  const framing=distance*Math.tan(lens*Math.PI/360);
  const copySpace=1;
  const look=focal.clone().addScaledVector(right,mobile?0:-framing*camera.aspect*.31*copySpace).addScaledVector(up,mobile?-framing*.25:0);
  const openingPose=()=>({position:camera.position.clone(),target:look.clone(),fov:lens});
  const travel=route.sample(t,{aspect:camera.aspect,mobile,openingPose});
  if(travel){camera.position.copy(travel.position);camera.fov=travel.fov;camera.updateProjectionMatrix();look.copy(travel.target);focal.copy(travel.target);}
  camera.lookAt(look);camera.updateMatrixWorld(true);
  // Lighting is world-fixed. Subject framing never drives a light or its target.
  renderer.toneMappingExposure=1.25;
  scene.background=dark.clone().lerp(paperColor,s.paper);paperUniform.value=s.paper;
  for(const p of parts.values()){
   const d=p.pivot.position.distanceTo(focal);
   const attention=1-.14*smooth(85,260,d)*s.explosion;
   const m=p.physicalMaterial;
   color.copy(p.baseColor).multiplyScalar(attention);m.color.copy(color);
   m.envMapIntensity=p.data.printable?.65:.85;
   m.opacity=1;m.depthWrite=true;
   if(p.line){p.line.visible=s.paper>.001;p.line.material.color.copy(ink);const near=1-smooth(70,180,d);p.line.material.opacity=s.paper*(.075+.70*near);}
  }
  screen.visible=s.paper<.999;screen.material.opacity=1-s.paper;screen.material.color.setScalar(.46+.54*(1-s.hero));
  ring.material.opacity=(1-s.paper)*smooth(0,.4,s.shotProgress)*(s.shotId==='dial'?.5:0);
  dust.material.opacity=s.explosion*(1-s.paper)*.32;
 }
 function render(){optics.render(scene,focal,(1-state.paper)*(.15+state.explosion*.7));}
 function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight,false);optics.resize();}
 function project(world){const p=world.clone().project(camera);return[(p.x*.5+.5)*innerWidth,(-p.y*.5+.5)*innerHeight,p.z];}
 function productRect(){const box=new THREE.Box3().setFromObject(root),pts=[];for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])pts.push(project(V([x,y,z])));return{left:Math.min(...pts.map(p=>p[0])),right:Math.max(...pts.map(p=>p[0])),top:Math.min(...pts.map(p=>p[1])),bottom:Math.max(...pts.map(p=>p[1]))};}
 return{update,render,resize,project,anchor:roleWorld,roleWorld,productRect};
}
