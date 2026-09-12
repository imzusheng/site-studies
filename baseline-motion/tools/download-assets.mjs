import {mkdir,writeFile} from 'node:fs/promises';
const urls=['https://threejs.org/examples/models/gltf/Michelle.glb','https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/Michelle.glb','https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Michelle.glb'];
await mkdir(new URL('../assets/',import.meta.url),{recursive:true});
let success=false;
for(const url of urls){try{const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const b=Buffer.from(await r.arrayBuffer());if(b.readUInt32LE(0)!==0x46546c67)throw new Error('Response is not GLB');await writeFile(new URL('../assets/Michelle.glb',import.meta.url),b);console.log(`Saved ${b.length} bytes from ${url}`);success=true;break;}catch(e){console.error(url,e.message);}}
if(!success){console.error('No model downloaded. No placeholder has been substituted.');process.exitCode=1;}
