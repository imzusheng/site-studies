'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const compiler=path.join(__dirname,'node_modules/typescript/bin/tsc');
if(fs.existsSync(compiler))cp.execFileSync(process.execPath,[compiler,'--pretty','false'],{cwd:__dirname,stdio:'inherit'});else cp.execSync('tsc --pretty false',{cwd:__dirname,stdio:'inherit'});
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
let vendor='';
if(process.argv.includes('--local')){
  const model=path.join(__dirname,'assets/Michelle.glb');if(!fs.existsSync(model))throw new Error('先运行 npm run assets 下载人物。');
  const esbuild=require('esbuild');esbuild.buildSync({entryPoints:[path.join(__dirname,'tools/vendor.mjs')],bundle:true,format:'iife',outfile:path.join(__dirname,'dist/vendor.js'),minify:true});
  fs.cpSync(path.join(__dirname,'node_modules/three/examples/jsm/libs/draco'),path.join(__dirname,'dist/draco'),{recursive:true});
  vendor='<script>'+read('dist/vendor.js').replace(/<\/script/gi,'<\\/script')+'</script>';
  vendor+='<script>window.BASELINE_DECODER_PATH="./draco/";window.BASELINE_MODEL_DATA="'+fs.readFileSync(model).toString('base64')+'";</script>';
}
const html=read('template.html').replace('/*__CSS__*/',read('style.css')).replace('/*__APP__*/',read('dist/game.js').replace(/<\/script/gi,'<\\/script')).replace('<!--__VENDOR__-->',vendor);
fs.writeFileSync(path.join(__dirname,'dist/baseline-motion.html'),html);
console.log(`Built baseline-motion.html (${Math.round(Buffer.byteLength(html)/1024)} KiB). ${vendor?'Local assets build; serve dist over HTTP.':'Network runtime dependencies required.'}`);
