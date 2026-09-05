import * as THREE from '/vendor/three.module.js';
import { createExplosionSpace } from './explosion-space.js';
import { A344_PROFILE as PROFILE, roleId } from './model-profile.js';
const angle=PROFILE.dimensions.faceAngleDeg*Math.PI/180;
const normal=new THREE.Vector3(0,-Math.sin(angle),Math.cos(angle));
const vertical=new THREE.Vector3(0,Math.cos(angle),Math.sin(angle));

export function createFilmEngine(model){
 const {scene,camera,renderer,root,parts,dust}=model,space=createExplosionSpace(model);
 const paper=new THREE.Color(0xe9e6df),ink=new THREE.Color(0x343b3b),night=new THREE.Color(0x000000);
 const displayParts=[];
 scene.background=paper.clone();dust.visible=false;
 // The vendor STEP contains duplicated connector solids at the same placement.
 // The canonical shape suffix alone is insufficient: repeated hardware elsewhere
 // must remain visible. Require both that identity and identical source bounds.
 const placedVendorShapes=new Map();
 for(const p of [...parts.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  if(p.group==='waveshare'){
   const shape=p.id.match(/_([0-9a-f]{8})$/)?.[1];
   const signature=shape?`${shape}:${JSON.stringify(p.data.bboxMm)}`:null;
   if(signature&&placedVendorShapes.has(signature)){
    p.presentationDuplicateOf=placedVendorShapes.get(signature);
    p.mesh.visible=false;if(p.line)p.line.visible=false;
    continue;
   }
   if(signature)placedVendorShapes.set(signature,p.id);
  }
  p.presentationColor=p.baseColor.clone();
  if(p.data.printable)p.presentationColor.set(0x222a30);
  displayParts.push(p);
  const m=p.mesh.material;m.color.set(0xd8d5ce);m.roughness=.88;m.metalness=0;m.envMapIntensity=.12;
  // Preserve the authored material response for the dark studio passage.
  m.emissive.copy(paper);
  m.polygonOffset=true;m.polygonOffsetFactor=1;m.polygonOffsetUnits=1;
  // Internal optical interfaces are not decorative contours. The LCD remains
  // assembled and opaque; outlining its touching layers creates shimmering seams.
  const internalOptic=p.group==='lcd'&&!['lcd_rear_frame','lcd_front_cover_glass','lcd_black_mask'].includes(p.id)&&!p.id.startsWith('lcd_fpc_');
  if(p.line){p.line.visible=!internalOptic;p.line.material.color.copy(ink);p.line.material.opacity=p.data.printable?.62:.35;}
 }
 const host=parts.get(roleId('activeGlass'));
 const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#333938';ctx.fillRect(0,0,800,600);
 ctx.fillStyle='#e0dfd7';ctx.font='500 43px sans-serif';ctx.fillText('Living room',54,125);
 ctx.font='500 20px sans-serif';ctx.fillStyle='#a8b1aa';ctx.fillText('LUMA',54,60);
 for(let i=0;i<3;i++){ctx.fillStyle=i===0?'#696c5e':'#454c49';ctx.fillRect(50,190+i*108,700,80);ctx.fillStyle='#dedfd5';ctx.font='500 28px sans-serif';ctx.fillText(['Evening','Focus','Away'][i],78,242+i*108);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const pos=host.mesh.geometry.getAttribute('position');let top=-Infinity;
 for(let i=0;i<pos.count;i++)top=Math.max(top,normal.x*pos.getX(i)+normal.y*pos.getY(i)+normal.z*pos.getZ(i));
 // The original cover glass and black mask share exactly the same front plane.
 // Print the UI on that physical face, with a disjoint mask aperture. No second
 // transparent display plane, depth-bias lottery, or camera-dependent draw order.
 host.mesh.material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{uDisplay:{value:texture},uGlassNormal:{value:normal},uGlassVertical:{value:vertical},uGlassTop:{value:top}});
  const vary='varying vec3 vGlassPosition;\n';
  shader.vertexShader=vary+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vGlassPosition=position;');
  shader.fragmentShader=vary+'uniform sampler2D uDisplay; uniform vec3 uGlassNormal; uniform vec3 uGlassVertical; uniform float uGlassTop;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
   bool frontGlass=dot(vGlassPosition,uGlassNormal)>uGlassTop-0.001;
   vec2 glassXY=vec2(vGlassPosition.x,dot(vGlassPosition,uGlassVertical));
   if(frontGlass && (abs(glassXY.x)>20.7 || abs(glassXY.y)>15.6)) discard;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`#include <tonemapping_fragment>
   if(frontGlass && abs(glassXY.x)<20.4 && abs(glassXY.y)<15.3) gl_FragColor.rgb=texture2D(uDisplay,glassXY/vec2(40.8,30.6)+0.5).rgb;
  `);
 };
 host.mesh.material.needsUpdate=true;
 // A single forward dolly rail with a fixed lens and a gentle continuous arc. The camera
 // advances toward the intact display/compute cluster; it never pulls back to
 // reset the assembly. The following reading section carries the transition.
 const smooth=x=>{const t=THREE.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};
 const railStart=new THREE.Vector3(0,0,36);
 const railEnd=new THREE.Vector3(15,7,-27);
 const railDirection=new THREE.Vector3(.45,-.78,.44).normalize();
 const orbitAxis=new THREE.Vector3(0,0,1);
 const stage=renderer.domElement.parentElement;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden';stage.append(svg);
 const labelSpecs=[['screen_bezel','DISPLAY BEZEL'],['keycap_2','PRINTED KEYCAP'],['cosmetic_upper_shell','OUTER ENCLOSURE'],['lcd_front_cover_glass','DISPLAY + COMPUTE'],['esp32_m3_retainer','INNER SUPPORT'],['bottom_service_cover_battery_cradle','SERVICE COVER']];
 const labels=labelSpecs.map(([id,text])=>{
  const group=document.createElementNS(svg.namespaceURI,'g'),path=document.createElementNS(svg.namespaceURI,'path'),dot=document.createElementNS(svg.namespaceURI,'circle'),label=document.createElementNS(svg.namespaceURI,'text');
  path.setAttribute('fill','none');path.setAttribute('stroke-width','.7');dot.setAttribute('r','1.6');label.textContent=text;label.setAttribute('font-size','8');label.setAttribute('font-family','monospace');label.setAttribute('letter-spacing','1');group.append(path,dot,label);svg.append(group);return {part:parts.get(id),group,path,dot,label};
 });
 const projected=new THREE.Vector3();
 function annotate(dark){
  const {width:w,height:h}=stage.getBoundingClientRect();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const focused=progress>.48;
  const candidates=labels.map(item=>{item.part.pivot.getWorldPosition(projected);projected.project(camera);return {...item,x:(projected.x*.5+.5)*w,y:(-.5*projected.y+.5)*h,z:projected.z};}).sort((a,b)=>a.y-b.y);
  let lastY=-100;
  const accepted=candidates.filter(item=>{
   item.group.style.display='none';
   if(progress<.14||w<900||item.z>1||item.x<w*.42||item.x>w*.81||item.y<h*.14||item.y>h*.86||item.y-lastY<48||(focused&&item.part.id!=='lcd_front_cover_glass'))return false;
   lastY=item.y;return true;
  });
  const rail=Math.max(w*.79,...accepted.map(item=>item.x+12)),elbow=rail+28,labelX=Math.min(w-138,elbow+24);
  for(const item of accepted){
   const color=dark>.5?'#aebbc4':'#73736b';item.group.style.display='';item.group.setAttribute('opacity',String(.8));
   item.path.setAttribute('d',`M ${item.x} ${item.y} H ${rail} l 28 -28 H ${labelX}`);item.path.setAttribute('stroke',color);
   item.dot.setAttribute('cx',item.x);item.dot.setAttribute('cy',item.y);item.dot.setAttribute('fill',color);
   item.label.setAttribute('x',labelX+7);item.label.setAttribute('y',item.y-25);item.label.setAttribute('fill',color);
  }
 }
 const target=new THREE.Vector3(),direction=new THREE.Vector3();
 let progress=0;
 function update(value=progress){
  progress=THREE.MathUtils.clamp(value,0,1);
  const opening=.64+.36*smooth(progress/.30);
  space.update(opening);
  const dark=(1-smooth(progress/.12))+smooth((progress-.25)/.15)*(1-smooth((progress-.80)/.20));
  scene.background.copy(paper).lerp(night,dark);
  dust.visible=dark>.01;dust.material.opacity=dark*.24;
  for(const part of displayParts){
   const mat=part.mesh.material;
   const lineColor=ink.clone().lerp(new THREE.Color(0xc8d5db),dark);
   if(part.silhouette){part.silhouette.material.color.copy(lineColor);part.silhouette.material.opacity=.8;}
   // Both passages are illustrations: opaque paper fill, then inverted ink.
   // Material lighting never takes over mid-shot.
   mat.color.set(0x000000);
   mat.emissive.copy(paper).lerp(night,dark);mat.emissiveIntensity=.72;
   mat.roughness=1;mat.metalness=0;mat.envMapIntensity=0;
   if('transmission' in mat)mat.transmission=0;
   if(part.line){part.line.material.color.copy(lineColor);part.line.material.opacity=part.data.printable?.85:.52;}

  }
  target.copy(railStart).lerp(railEnd,progress);
  // Ten degrees over the whole passage; no chapter-local easing or reversal.
  direction.copy(railDirection).applyAxisAngle(orbitAxis,progress*.175);
  camera.fov=34;camera.near=2;camera.far=1600;
  const distance=(520-270*progress)*Math.max(1,1.22/camera.aspect);
  camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  renderer.toneMappingExposure=1.02;
  stage.style.setProperty('--structure-ink',dark>.48?'#eef0ed':'#303534');stage.style.setProperty('--structure-muted',dark>.48?'#bac5cc':'#626a67');
  stage.dataset.sceneTone=dark>.48?'dark':'light';
  annotate(dark);
 }
 function render(){renderer.render(scene,camera);}
 function resize(){
  const box=renderer.domElement.parentElement.getBoundingClientRect();
  const width=Math.max(1,box.width),height=Math.max(1,box.height);
  camera.aspect=width/height;
  if(width>760)camera.setViewOffset(width,height,-width*.13,0,width,height);else camera.clearViewOffset();
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(width,height,false);update();
 }
 return {update,render,resize};
}
