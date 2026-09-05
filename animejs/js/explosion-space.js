import * as THREE from '../vendor/three.module.js';
import { A343_PROFILE as PROFILE } from './model-profile.js';
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { const t = clamp(x); return t*t*(3-2*t); };
const normal = new THREE.Vector3(0,-Math.sin(PROFILE.dimensions.faceAngleDeg*Math.PI/180),Math.cos(PROFILE.dimensions.faceAngleDeg*Math.PI/180));

// One local editorial demonstration. Functional assemblies stay rigid; clearance
// follows the real insertion axes before the separated groups turn for the page.
export function createExplosionSpace({parts,root}) {
 const all=[...parts.values()], used=new Set(), tracks=[];
 const add=(members,clear,end,turn=0,start=0,endClear=.42)=>{
  members=members.filter(p=>!used.has(p.id));if(!members.length)return;
  const home=new THREE.Vector3();members.forEach(p=>{home.add(p.home);used.add(p.id);});home.divideScalar(members.length);
  tracks.push({members,home,clear:home.clone().add(new THREE.Vector3(...clear)),end:new THREE.Vector3(...end),turn,start,endClear});
 };
 const match=f=>all.filter(f), id=name=>match(p=>p.id===name), lift=n=>normal.clone().multiplyScalar(n).toArray();
 add(match(p=>p.id==='bottom_service_cover_battery_cradle'||p.id.startsWith('service_m3_')||p.group==='power'), [0,0,-100], [20,12,-108],-.10,0,.30);
 add(match(p=>p.id==='esp32_m3_retainer'||p.id.startsWith('retainer_m3_')), [0,0,-73], [-30,-8,-65],.10,.045,.34);
 add(match(p=>p.group==='waveshare'||p.group==='connector'||p.group==='lcd'), [0,0,-38], [15,7,-27],-.05,.13,.42);
 add(match(p=>p.id.startsWith('ec11_')&&p.id!=='ec11_knob_22p5'), [0,0,-40], [45,-47,-58],.10,.13,.42);
 for(let i=1;i<=6;i++) {
  const key=parts.get(`keycap_${i}`), x=key.home.x, y=key.home.y;
  add(id(`keycap_${i}`),lift(78),[x+(i%2?-5:5),y-7,150+(i%3-1)*3],(i-3.5)*.025,0,.40);
  add(match(p=>p.id.startsWith(`choc_v2_${i}_`)),lift(70),[x,y,108+(i%3-1)*2],(i-3.5)*.02,.015,.42);
 }
 add(id('ec11_knob_22p5'),lift(75),[0,-51,105],.16,0,.40);
 add(id('screen_bezel'),lift(80),[8,61,150],-.08,0,.40);
 add(id('cosmetic_upper_shell'),[0,0,42],[-25,0,57],-.08,.42,.64);
 // Any nonvisual helper or future accessory remains attached to the board group.
 add(match(p=>!used.has(p.id)),[0,0,-38],[15,7,-27],-.05,.13,.42);
 function update(progress){
  const p=clamp(progress), spread=ease((p-.64)/.36);
  for(const t of tracks){
   const center=t.home.clone().lerp(t.clear,ease((p-t.start)/(t.endClear-t.start))).lerp(t.end,spread);
   const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),t.turn*spread);
   for(const part of t.members){part.pivot.position.copy(part.home).sub(t.home).applyQuaternion(q).add(center);part.pivot.quaternion.copy(q);}
  }
  root.updateMatrixWorld(true);
 }
 return {update,tracks};
}
