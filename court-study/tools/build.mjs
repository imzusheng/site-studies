/** Build a truly self-contained HTML. Network is never used by this script. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p));
if(!fs.existsSync(path.join(root,'assets/motions.json')))fs.writeFileSync(path.join(root,'assets/motions.json'),gunzipSync(read('assets/motions.json.gz')));
const modules=['athlete.js','venue.js','presentation.js','app.js'];
if(!fs.existsSync(path.join(root,'vendor/three.bundle.js'))){
 console.error('Local engine is missing. Run npm ci && npm run vendor once, or use the offline source ZIP.');process.exit(1);
}
const paths=['vendor/three.bundle.js','assets/motions.json',...modules.map(n=>'src/'+n)];
const manifest=paths.map(p=>({path:p,bytes:read(p).byteLength,sha256:crypto.createHash('sha256').update(read(p)).digest('hex'),cached:true,license:p==='assets/motions.json'?'CC-BY-SA-3.0':'MIT'}));
const escapeHTML=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const notices=['LICENSE','licenses/THREE-MIT.txt','licenses/TENNIS-MOCAP-NOTICE.md'].map(p=>read(p).toString()).join('\n\n---\n\n');
const assets={motion:JSON.parse(read('assets/motions.json')),manifest,buildDate:'2026-09-13',version:'1.0.0-rc1'};
let html=read('src/template.html').toString()
 .replace('/*__NOTICES__*/',()=>escapeHTML(notices))
 .replace('/*__STYLE__*/',()=>read('src/style.css').toString())
 .replace('/*__VENDOR__*/',()=>read('vendor/three.bundle.js').toString())
 .replace('/*__ASSETS__*/',()=>JSON.stringify(assets).replaceAll('</script','<\\/script'))
 .replace('/*__APP__*/',()=>modules.map(n=>read('src/'+n).toString()).join('\n'));
if(html.includes('/*__'))throw new Error('Unreplaced build placeholders');
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist/court-study.html'),html);
fs.writeFileSync(path.join(root,'index.html'),html);
fs.writeFileSync(path.join(root,'assets/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Built ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MiB offline HTML (${manifest.length} embedded resources).`);
