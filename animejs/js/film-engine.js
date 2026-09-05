import * as THREE from '/vendor/three.module.js';
import { createExplosionSpace } from './explosion-space.js';
import { A343_PROFILE as PROFILE, roleId } from './model-profile.js';
const angle=PROFILE.dimensions.faceAngleDeg*Math.PI/180;
const normal=new THREE.Vector3(0,-Math.sin(angle),Math.cos(angle));
const vertical=new THREE.Vector3(0,Math.cos(angle),Math.sin(angle));

export function createFilmEngine(model){
 const {scene,camera,renderer,root,parts,dust}=model,space=createExplosionSpace(model);
 const paper=new THREE.Color(0xe9e6df),ink=new THREE.Color(0x67665f);
 scene.background=paper;dust.visible=false;
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
  const m=p.mesh.material;m.color.set(0xd8d5ce);m.roughness=.88;m.metalness=0;m.envMapIntensity=.12;
  if('transmission' in m)m.transmission=0;
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
 const target=new THREE.Vector3(0,0,24),direction=new THREE.Vector3(.32,-.75,.58).normalize();
 let progress=0;
 function update(value=progress){
  progress=THREE.MathUtils.clamp(value,0,1);space.update(progress);
  // A single gently opening view: the same optical axis and fixed light volume
  // carry both the assembled and separated composition, including reverse scroll.
  const u=progress*progress*(3-2*progress);
  target.set(0,2,8+u*17);
  camera.fov=34;camera.near=2;camera.far=1600;
  const framing=THREE.MathUtils.lerp(195,365,u);
  const distance=framing/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*Math.max(1,1.22/camera.aspect);
  camera.position.copy(target).addScaledVector(direction,distance);
  camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  renderer.toneMappingExposure=1.02;
 }
 function render(){renderer.render(scene,camera);}
 function resize(){
  const box=renderer.domElement.parentElement.getBoundingClientRect();
  const width=Math.max(1,box.width),height=Math.max(1,box.height);
  camera.aspect=width/height;
  if(width>760)camera.setViewOffset(width,height,-width*.16,0,width,height);else camera.clearViewOffset();
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(width,height,false);update();
 }
 return {update,render,resize};
}
