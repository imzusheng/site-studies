/** Convert verified BVH or bundled samples to native-rig quaternion clips.
 * No npm dependencies. All math uses the vendored Three.js library.
 * This is same-axis retargeting, NOT a generic cross-rig retargeter.
 */
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {sources} from './sources.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const full=process.argv.includes('--full');
if(!full&&!process.argv.includes('--samples'))throw new Error('Use --samples or --full');
const context=vm.createContext({window:{},console,AbortController,TextDecoder,TextEncoder,URL});vm.runInContext(fs.readFileSync(path.join(root,'vendor/three.bundle.js'),'utf8'),context,{timeout:10000});
const T=context.window.THREE;
const rig=JSON.parse(fs.readFileSync(path.join(root,'assets-source/rig.json'),'utf8'));
const round=(v,n)=>Number(v.toFixed(n));const clips={};
for(const s of sources){
 let data,times,fps=100;
 if(full){
  const bytes=fs.readFileSync(path.join(root,'assets-source/full',s.filename));
  const gitHash=crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if(gitHash!==s.gitBlobSHA1)throw new Error(`${s.filename}: source checksum mismatch`);
  const text=bytes.toString('utf8');const cut=text.indexOf('MOTION');
  if(cut<0)throw new Error('Missing MOTION section');
  const names=[...text.slice(0,cut).matchAll(/(?:ROOT|JOINT)\s+(\S+)/g)].map(m=>m[1]);
  if(JSON.stringify(names)!==JSON.stringify(rig.names))throw new Error('Skeleton order differs; manual retarget mapping required');
  const lines=text.slice(cut).trim().split(/\r?\n/);const count=Number(lines[1].split(':')[1]);fps=1/Number(lines[2].split(':')[1]);
  data=lines.slice(3).filter(l=>l.trim()).map(l=>l.trim().split(/\s+/).map(Number));
  if(data.length!==count||count!==s.frames)throw new Error('Frame count does not match pinned source');
  times=data.map((_,i)=>i/fps);
 }else{
  const rows=fs.readFileSync(path.join(root,`assets-source/${s.kind}-samples.txt`),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.trim().split(/\s+/).map(Number)).sort((a,b)=>a[0]-b[0]);
  times=rows.map(r=>r[0]/fps);data=rows.map(r=>r.slice(1));
 }
 if(data.some(r=>r.length!==57||r.some(v=>!Number.isFinite(v))))throw new Error('Each pose must have 57 finite BVH channels');
 const yaw0=data[0][5], correction=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-yaw0*Math.PI/180);
 const origin=new T.Vector3(data[0][0]*rig.scale,0,data[0][2]*rig.scale);
 const positions=[],quaternions=[];
 for(let f=0;f<data.length;f++){
  const row=data[f];positions.push(new T.Vector3(...row.slice(0,3)).multiplyScalar(rig.scale).sub(origin).applyQuaternion(correction).toArray().map(v=>round(v,7)));
  const q=[];
  for(let i=0;i<18;i++){
   const offset=3+i*3,[z,x,y]=row.slice(offset,offset+3).map(v=>v*Math.PI/180);
   const value=new T.Quaternion().setFromEuler(new T.Euler(x,y,z,'ZXY'));
   if(i===0)value.premultiply(correction);
   let values=value.toArray();if(f&&values.reduce((sum,v,k)=>sum+v*quaternions[f-1][i][k],0)<0)values=values.map(v=>-v);
   q.push(values.map(v=>round(v,8)));
  }
  quaternions.push(q);
 }
 clips[s.kind]={times:times.map(t=>round(t,6)),positions,quaternions,sourceFrames:times.map(t=>Math.round(t*fps)),sourceFPS:fps,sampling:full?'full-frame':'sparse-excerpt',sourceFile:s.filename,headingCorrection:-yaw0};
 console.log(`${s.kind}: ${data.length} ${full?'full-source frames':'sparse source poses'}`);
}
const out={schemaVersion:1,rig,clips,notice:full?'Full frames from two pinned CC BY-SA 3.0 BVH recordings, heading-normalized onto the native rig. Manual clip/contact markers still require visual validation.':'Real recorded joint data, sparsely extracted from CC BY-SA 3.0 upstream BVH. Not full-rate recordings. Base movement loops are authored separately.'};
fs.writeFileSync(path.join(root,'assets/motions.json'),JSON.stringify(out));
