/** Static release gates. Browser acceptance is a separate executable test. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const check=(ok,why)=>{if(!ok)throw new Error(why)};
for(const file of ['src/athlete.js','src/venue.js','src/presentation.js','src/app.js'])new vm.Script(read(file),{filename:file});
const html=read('index.html');check(html===read('dist/court-study.html'),'Distribution differs from index');
check(!html.includes('/*__'),'Build placeholder present');
check(!/<script[^>]+\bsrc=/i.test(html),'External script tag');
check(!/@import\s|@font-face/i.test(read('src/style.css')),'Remote/custom font dependency');
check(html.includes("connect-src 'none'"),'Outbound network is not blocked');
const ids=[...read('src/template.html').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);check(ids.length===new Set(ids).size,'Duplicate element IDs');
for(const m of read('src/app.js').matchAll(/\$\('([^']+)'\)/g))check(ids.includes(m[1]),'Missing UI ID: '+m[1]);
const motion=JSON.parse(read('assets/motions.json'));check(motion.rig.names.length===18,'Wrong skeleton');
let samples=0,maxQuaternionError=0;
for(const c of Object.values(motion.clips)){
 check(c.times.length===c.positions.length&&c.times.length===c.quaternions.length,'Mismatched motion track lengths');
 check(c.times.every((t,i)=>Number.isFinite(t)&&(i===0||t>c.times[i-1])),'Invalid key times');
 for(const frame of c.quaternions){check(frame.length===18,'Missing joints');for(const q of frame){check(q.length===4&&q.every(Number.isFinite),'Invalid quaternion');maxQuaternionError=Math.max(maxQuaternionError,Math.abs(Math.hypot(...q)-1));}}
 samples+=c.times.length;
}
check(maxQuaternionError<1e-6,'Non-normalized motion');
const manifest=JSON.parse(read('assets/manifest.json'));
for(const r of manifest){const bytes=fs.readFileSync(path.join(root,r.path));check(r.cached&&r.bytes===bytes.length,'Incorrect cache metadata');check(r.sha256===crypto.createHash('sha256').update(bytes).digest('hex'),'Asset hash mismatch: '+r.path);}
const about=read('src/template.html').split('<dialog id="assetsDialog">')[1];check(about&&about.includes('CC BY-SA 3.0'),'About lost attribution');
const report={passed:true,htmlBytes:Buffer.byteLength(html),htmlSHA256:crypto.createHash('sha256').update(html).digest('hex'),embeddedResources:manifest.length,motionSourceSamples:samples,maxQuaternionError,modulesParsed:4,uniqueUIIds:ids.length};
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/integrity.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
