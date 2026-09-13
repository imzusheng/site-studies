// Retarget CC0 Mesh2Motion lower-body motion into the existing 18-joint source rig.
// Tennis ready arms are retained as an upper-body layer. Root X/Z is removed,
// because the game controller owns translation. Deformation is baked separately.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const context=vm.createContext({window:{},console,AbortController});
vm.runInContext(fs.readFileSync(path.join(root,'vendor/engine.js'),'utf8'),context,{timeout:10000});
const T=context.window.THREE,V=(a=[0,0,0])=>new T.Vector3(...a),Q=(a=[0,0,0,1])=>new T.Quaternion(...a);
const source=path.join(root,'assets-source/community/mesh2motion-human-addon-animations.glb'),bytes=fs.readFileSync(source);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
if(sha256!=='a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95')throw Error('Unexpected community motion source hash');
const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+size)),binary=bytes.subarray(28+size);
function accessor(index){const a=doc.accessors[index],b=doc.bufferViews[a.bufferView],components={SCALAR:1,VEC3:3,VEC4:4}[a.type];if(a.componentType!==5126||!components)throw Error('Expected float motion track');const data=[];for(let i=0;i<a.count;i++){const row=[];for(let j=0;j<components;j++)row.push(binary.readFloatLE((b.byteOffset||0)+(a.byteOffset||0)+i*(b.byteStride||components*4)+j*4));data.push(row)}return data;}
const parents=doc.nodes.map(()=>-1);doc.nodes.forEach((n,i)=>(n.children||[]).forEach(child=>parents[child]=i));
const transforms=()=>doc.nodes.map(n=>({p:V(n.translation),q:Q(n.rotation),s:V(n.scale||[1,1,1])}));
function worlds(local){const out=[];function resolve(i){if(out[i])return out[i];const n=local[i],m=new T.Matrix4().compose(n.p,n.q,n.s);out[i]=parents[i]<0?m:resolve(parents[i]).clone().multiply(m);return out[i]}local.forEach((_,i)=>resolve(i));return out;}
const rest=worlds(transforms()),node=name=>{const i=doc.nodes.findIndex(n=>n.name===name);if(i<0)throw Error(name);return i};
const sourceBones=['pelvis','spine_03','neck_01','head','clavicle_l','upperarm_l','lowerarm_l','hand_l','clavicle_r','upperarm_r','lowerarm_r','hand_r','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'].map(node);
const library=JSON.parse(fs.readFileSync(path.join(root,'assets/motions.json'),'utf8'));
const ready=library.clips.forehand.q[1],targetParents=library.rig.parents;
const boneRotation=(matrix)=>Q().setFromRotationMatrix(new T.Matrix4().extractRotation(matrix));
const restRotation=sourceBones.map(i=>boneRotation(rest[i]));
const position=matrix=>V().setFromMatrixPosition(matrix),restHip=position(rest[sourceBones[0]]).y;
const alignment=sourceBones.map(()=>Q());
for(const [bone,child] of [[12,13],[13,14],[15,16],[16,17]]){
 const dir=position(rest[sourceBones[child]]).sub(position(rest[sourceBones[bone]])).normalize();
 alignment[bone].setFromUnitVectors(V(library.rig.offsets[child]).normalize(),dir);
}
function sampleTrack(track,time){const {times,values,kind,interpolation}=track,make=kind==='rotation'?Q:V;if(times.length===1)return make(values[0]);let hi=1;while(hi<times.length-1&&times[hi][0]<=time)hi++;const lo=Math.max(0,hi-1);if(interpolation==='STEP')return make(values[time>=times[hi][0]?hi:lo]);const u=Math.max(0,Math.min(1,(time-times[lo][0])/(times[hi][0]-times[lo][0]||1)));return kind==='rotation'?Q(values[lo]).slerp(Q(values[hi]),u):V(values[lo]).lerp(V(values[hi]),u);}
const names={run:'Run_Female',strafeLeft:'Strafe_left',strafeRight:'Strafe_right',backward:'Walk_Backwards'},clips={};
for(const [name,sourceClip] of Object.entries(names)){
 const anim=doc.animations.find(a=>a.name===sourceClip);if(!anim)throw Error(sourceClip);
 const tracks=anim.channels.map(c=>{const s=anim.samplers[c.sampler];if(s.interpolation&&!['LINEAR','STEP'].includes(s.interpolation))throw Error(s.interpolation);return {node:c.target.node,kind:c.target.path,interpolation:s.interpolation||'LINEAR',times:accessor(s.input),values:accessor(s.output)}});
 const first=Math.min(...tracks.map(t=>t.times[0][0])),duration=Math.max(...tracks.map(t=>t.times.at(-1)[0]))-first,count=Math.ceil(duration*30),times=[],qs=[],ps=[];
 for(let frame=0;frame<=count;frame++){
  const time=frame/count*duration,local=transforms();for(const track of tracks)local[track.node][{translation:'p',rotation:'q',scale:'s'}[track.kind]]=sampleTrack(track,time+first);
  const global=worlds(local),rotations=sourceBones.map((i,j)=>boneRotation(global[i]).multiply(restRotation[j].clone().invert()).multiply(alignment[j]));
  const q=ready.map(v=>Q(v));q[0].copy(rotations[0]);
  for(const bone of [12,13,14,15,16,17])q[bone].copy(rotations[targetParents[bone]].clone().invert().multiply(rotations[bone]));
  times.push(+time.toFixed(7));qs.push(q.map(v=>v.normalize().toArray().map(n=>+n.toFixed(7))));
  ps.push([0,+(.912+(position(global[sourceBones[0]]).y-restHip)*(.912/restHip)).toFixed(7),0]);
 }
 clips[name]={label:sourceClip,duration,times,q:qs,p:ps,start:0,contact:duration*.5,bakedFPS:30,sourceClip,rootMotion:'in-place; X/Z removed; original vertical motion retained',upperBody:'Tennis-MoCap ready pose',sourceSHA256:sha256};
}
const out={version:1,rig:library.rig,source:'https://github.com/Mesh2Motion/mesh2motion-app',sourceLicense:'CC0-1.0',adaptationLicense:'CC-BY-SA-3.0 (tennis-ready upper-body layer)',sha256,clips};
fs.writeFileSync(path.join(root,'assets/locomotion-source.json'),JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(clips).map(([k,v])=>[k,{source:v.sourceClip,seconds:v.duration,frames:v.times.length}])));
