// Vendor an MIT-licensed Three.js loader against the already embedded engine.
import fs from 'node:fs';
import path from 'node:path';
const source=process.argv[2];
if(!source) throw Error('Pass three/examples/jsm/loaders/HDRLoader.js');
let js=fs.readFileSync(source,'utf8');
js=js.replace(/import\s*\{([\s\S]*?)\}\s*from 'three';/, 'const {$1} = window.THREE;').replace('export { HDRLoader };','window.ClubHDRLoader = HDRLoader;');
fs.writeFileSync(path.resolve(import.meta.dirname,'../vendor/hdr-loader.js'),'/* Three.js r180 HDRLoader, MIT. Copyright 2010-2025 Three.js authors. */\n(()=>{\n'+js+'\n})();\n');
