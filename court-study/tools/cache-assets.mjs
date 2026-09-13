/** Cache pinned upstream BVH bytes, verify Git blob SHA-1, then optionally bake.
 * Requires ordinary Internet access. Never called by the running game.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {sources,commit,repository} from './sources.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'assets-source/full');
const args=new Set(process.argv.slice(2));
for(const arg of args)if(!['--dry-run','--apply'].includes(arg))throw new Error(`Unknown argument: ${arg}`);
const hash=(algo,b)=>crypto.createHash(algo).update(b).digest('hex');
const gitHash=b=>hash('sha1',Buffer.concat([Buffer.from(`blob ${b.length}\0`),b]));
async function main(){
 if(args.has('--dry-run')){console.log(JSON.stringify({networkRequested:false,repository,commit,sources},null,2));return;}
 fs.mkdirSync(dir,{recursive:true});const receipts=[];
 for(const s of sources){
  const dest=path.join(dir,s.filename);let bytes=fs.existsSync(dest)?fs.readFileSync(dest):null;
  if(bytes&&gitHash(bytes)!==s.gitBlobSHA1)throw new Error(`${s.filename}: existing file checksum differs; move it away before retrying.`);
  if(!bytes){
   for(let attempt=1;attempt<=3;attempt++){
    try{
     console.log(`Downloading ${s.filename} (${attempt}/3)`);
     const response=await fetch(s.url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'CourtStudy-AssetCache/0.1'}});
     if(!response.ok)throw new Error(`HTTP ${response.status}`);
     bytes=Buffer.from(await response.arrayBuffer());
     if(bytes.length>8*1024*1024||!bytes.subarray(0,40).toString().includes('HIERARCHY'))throw new Error('Not an expected BVH file');
     if(gitHash(bytes)!==s.gitBlobSHA1)throw new Error('Pinned Git blob checksum mismatch');
     fs.writeFileSync(dest+'.part',bytes);fs.renameSync(dest+'.part',dest);break;
    }catch(e){bytes=null;if(attempt===3)throw e;await new Promise(r=>setTimeout(r,800*attempt));}
   }
  }
  receipts.push({...s,path:path.relative(root,dest).replaceAll(path.sep,'/'),bytes:bytes.length,sha256:hash('sha256',bytes),cached:true,verifiedAt:new Date().toISOString()});
 }
 fs.writeFileSync(path.join(dir,'receipts.json'),JSON.stringify({repository,commit,assets:receipts},null,2));
 console.log('Both full BVH sources cached and checksum-verified. See licenses/TENNIS-MOCAP-NOTICE.md.');
 if(args.has('--apply')){
  for(const cmd of [['tools/bake-motion.mjs','--full'],['tools/build.mjs'],['tools/verify.mjs']]){
   const result=spawnSync(process.execPath,cmd,{cwd:root,stdio:'inherit'});
   if(result.status!==0)throw new Error(`${cmd[0]} failed`);
  }
  console.log('Full-frame build generated. Recheck timing, grip and foot contact before release: full tracks can expose motion details absent in sparse samples.');
 }
}
main().catch(e=>{console.error(`Asset cache failed: ${e.message}\nThe bundled offline demo has not been removed. Retry on an Internet-connected machine.`);process.exitCode=1});
