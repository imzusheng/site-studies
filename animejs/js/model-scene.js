import * as THREE from '/vendor/three.module.js';
import { STLLoader } from '/vendor/STLLoader.js';
import { A344_PROFILE as PROFILE, roleId, roleIds } from './model-profile.js';

export const sizeOf = b => new THREE.Vector3(...b[1]).sub(new THREE.Vector3(...b[0]));
const centerOf = b => new THREE.Vector3(...b[0]).add(new THREE.Vector3(...b[1])).multiplyScalar(.5);
const DEG = THREE.MathUtils.degToRad;
const applyCreasedNormals = (geometry, creaseAngle = DEG(38)) => {
  const position = geometry.getAttribute('position');
  const faceCount = Math.floor(position.count / 3);
  const faceNormals = new Float32Array(faceCount * 3);
  const faceWeights = new Float32Array(faceCount);
  const vertexFaces = new Map();
  const keys = new Array(position.count);
  const precision = 10000;

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = `${Math.round(position.getX(vertex) * precision)},${Math.round(position.getY(vertex) * precision)},${Math.round(position.getZ(vertex) * precision)}`;
    keys[vertex] = key;
    if (!vertexFaces.has(key)) vertexFaces.set(key, []);
    vertexFaces.get(key).push(Math.floor(vertex / 3));
  }

  for (let face = 0; face < faceCount; face += 1) {
    const a = face * 3;
    const ax = position.getX(a); const ay = position.getY(a); const az = position.getZ(a);
    const abx = position.getX(a + 1) - ax; const aby = position.getY(a + 1) - ay; const abz = position.getZ(a + 1) - az;
    const acx = position.getX(a + 2) - ax; const acy = position.getY(a + 2) - ay; const acz = position.getZ(a + 2) - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    faceWeights[face] = length;
    nx /= length; ny /= length; nz /= length;
    faceNormals[face * 3] = nx;
    faceNormals[face * 3 + 1] = ny;
    faceNormals[face * 3 + 2] = nz;
  }

  const normals = new Float32Array(position.count * 3);
  const creaseDot = Math.cos(creaseAngle);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const ownFace = Math.floor(vertex / 3);
    const ox = faceNormals[ownFace * 3];
    const oy = faceNormals[ownFace * 3 + 1];
    const oz = faceNormals[ownFace * 3 + 2];
    let nx = 0; let ny = 0; let nz = 0;
    for (const face of vertexFaces.get(keys[vertex])) {
      const fx = faceNormals[face * 3];
      const fy = faceNormals[face * 3 + 1];
      const fz = faceNormals[face * 3 + 2];
      if (ox * fx + oy * fy + oz * fz < creaseDot) continue;
      const weight = faceWeights[face];
      nx += fx * weight; ny += fy * weight; nz += fz * weight;
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    normals[vertex * 3] = nx / length;
    normals[vertex * 3 + 1] = ny / length;
    normals[vertex * 3 + 2] = nz / length;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
};


// Light cards belong to the lighting environment, never to object-space colour.
function studioEnvironment(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color(.11,.13,.16);
  const card = (position, scale, color, intensity) => {
    const material = new THREE.MeshBasicMaterial({ color:new THREE.Color(color).multiplyScalar(intensity), side:THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(...scale),material);
    plane.position.set(...position); plane.lookAt(0,0,0); room.add(plane);
  };
  card([-150,-120,180],[260,240],0xe4edfa,1.3);
  card([100,130,100],[180,260],0xffe6c9,1.5);
  card([180,-60,-60],[200,200],0xc6dcf4,.8);
  card([-50,-100,-180],[220,180],0xd7e2ee,.65);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(room,.02,.1,1000);
  room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  pmrem.dispose();
  return target;
}
function microTexture() {
  const a = new Uint8Array(256*256*4); let seed=343;
  for(let i=0;i<a.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0; const n=180+(seed%66);a[i]=a[i+1]=a[i+2]=n;a[i+3]=255;}
  const t=new THREE.DataTexture(a,256,256);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
function materialFor(data, micro) {
  const id=data.id.toLowerCase();
  let color=0x41484c,roughness=.45,metalness=.15;
  if(data.printable){color=0x46433f;roughness=.76;metalness=0;}
  if(id.includes('keycap')) {color=0x45423f;roughness=.80;metalness=0;}
  if(id.includes('knob')) {color=0x3d3b38;roughness=.76;metalness=0;}
  if(id.includes('bezel')) {color=0x202427;roughness=.76;metalness=0;}
  if(/pcb/.test(id)){color=0x133c32;roughness=.54;metalness=.05;}
  if(/contact|pin|spring|screw|shield|metal|usb|microsd/.test(id)){color=0xa1a8aa;roughness=.28;metalness=.85;}
  if(/housing|body|chip|stem|^ic_/.test(id)){color=0x24292b;roughness=.5;metalness=0;}
  // CAD colour is useful for the official board's hundreds of component solids.
  if(data.color && !data.printable) {
    if(Array.isArray(data.color))color=new THREE.Color().setRGB(...data.color.slice(0,3));
    else if(typeof data.color==='string')color=data.color;
  }
  if(data.colorRgba && !data.printable) color=new THREE.Color().setRGB(...data.colorRgba.slice(0,3).map(v=>v/255),THREE.SRGBColorSpace);
  if(id.includes('top_housing')) return new THREE.MeshPhysicalMaterial({color:0xe1e6e3,roughness:.22,metalness:0,transmission:.86,thickness:.8,ior:1.46,envMapIntensity:.55});
  const material=new THREE.MeshStandardMaterial({color,roughness,metalness,envMapIntensity:.55});
  if(data.printable){const map=micro.clone();map.repeat.set(.45,.45);map.needsUpdate=true;material.bumpMap=map;material.bumpScale=.20;}
  return material;
}
export async function createModelScene(canvas,onProgress=()=>{}) {
  const scene=new THREE.Scene();scene.up.set(0,0,1);scene.background=new THREE.Color(0x080b0e);
  const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.5,2400);camera.up.set(0,0,1);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight,false);renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=false;
  const environment=studioEnvironment(renderer);scene.environment=environment.texture;
  // A fixed, diffuse light volume: the camera travels through it. No cone lights,
  // camera-following lights or shadow maps that sweep across the product.
  const lights={
    ambient:new THREE.HemisphereLight(0xdde8f5,0x465464,.30),
    key:new THREE.DirectionalLight(0xe9eff5,1.5),
    rim:new THREE.DirectionalLight(0xd5e5fa,1.3),
    edge:new THREE.DirectionalLight(0xd9e5f1,.40),
    under:new THREE.DirectionalLight(0xc6d8ec,.38),
  };
  lights.ambient.position.set(0,0,1);
  lights.key.position.set(-160,90,200);
  lights.rim.position.set(130,140,100);
  lights.edge.position.set(80,-180,45);
  lights.under.position.set(-30,-70,-180);
  scene.add(...Object.values(lights));
  const root=new THREE.Group();root.visible=false;scene.add(root);
  onProgress({phase:'manifest',loaded:0,total:0});
  const response=await fetch(PROFILE.manifestUrl);
  if(!response.ok)throw new Error('A3.44 场景清单无法读取');
  const manifest=await response.json();
  if(manifest.profile?.id!==PROFILE.id)throw new Error('模型版本与 A3.44 不匹配');
  const assetBase=manifest.assetBase;
  const loader=new STLLoader();const parts=new Map();const micro=microTexture();let completed=0;
  async function load(data){
    const response=await fetch(`${assetBase}stl/${data.filename}.gz`);
    if(!response.ok)throw new Error(`零件加载失败 ${data.id}`);
    const payload=await response.arrayBuffer();
    const signature=new Uint8Array(payload,0,Math.min(2,payload.byteLength));
    const bytes=signature[0]===31&&signature[1]===139
      ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : payload;
    const geometry=loader.parse(bytes);const center=centerOf(data.bboxMm);
    if(data.printable) applyCreasedNormals(geometry);
    geometry.translate(-center.x,-center.y,-center.z);
    const position=geometry.getAttribute('position');const uv=new Float32Array(position.count*2);
    for(let i=0;i<position.count;i++){uv[i*2]=position.getX(i)/30;uv[i*2+1]=(position.getY(i)+position.getZ(i)*.25)/30;}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const material=materialFor(data,micro);const mesh=new THREE.Mesh(geometry,material);
    mesh.castShadow=false;mesh.receiveShadow=false;
    const pivot=new THREE.Group();pivot.position.copy(center);pivot.add(mesh);root.add(pivot);
    let line=null;
    if(data.printable||sizeOf(data.bboxMm).length()>12){
      line=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,32),new THREE.LineBasicMaterial({color:0xb6cedd,transparent:true,opacity:0,depthWrite:false}));
      line.visible=false;pivot.add(line);
    }
    let silhouette=null;
    if(data.printable){
      silhouette=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x343b3b,side:THREE.BackSide,transparent:true,opacity:0,depthWrite:false}));
      silhouette.scale.setScalar(1.006);pivot.add(silhouette);
    }
    parts.set(data.id,{silhouette,id:data.id,group:data.group,data,pivot,mesh,line,sourceCenter:center,home:center.clone(),explode:new THREE.Vector3(...(data.explodeVectorMm||[0,0,0])),baseColor:material.color.clone(),baseRoughness:material.roughness,baseMetalness:material.metalness,baseTransmission:material.transmission||0});
    completed++;onProgress({phase:'parts',loaded:completed,total:manifest.parts.length});
  }
  // Bound decompression and mesh work so the loading UI continues to paint.
  for(let i=0;i<manifest.parts.length;i+=6){await Promise.all(manifest.parts.slice(i,i+6).map(load));await new Promise(requestAnimationFrame);}
  const assemblyCenter=new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  for(const p of parts.values()){p.pivot.position.sub(assemblyCenter);p.home.copy(p.pivot.position);}
  const roleMatch=(p,role)=>roleIds(role).includes(p.id);
  const baseRadius=280;
  // A restrained field gives camera translation a visible depth reference.
  const stars=new Float32Array(100*3);let seed=83;
  for(let i=0;i<stars.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;stars[i]=(seed/4294967295-.5)*1100;}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(stars,3));
  const dust=new THREE.Points(sg,new THREE.PointsMaterial({color:0x8799a6,size:.5,transparent:true,opacity:0,depthWrite:false}));scene.add(dust);
  onProgress({phase:'ready',loaded:completed,total:manifest.parts.length});
  return {scene,camera,renderer,root,parts,roleMatch,baseRadius,assemblyCenter,manifest,profile:PROFILE,lights,dust};
}
