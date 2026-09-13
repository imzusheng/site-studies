/* Cypress court. Original geometry and deterministic locally generated textures. */
window.createCourtVenue=function(T,scene,renderer){
 const world=new T.Group();world.name='CypressClub';scene.add(world);
 let seed=13579;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},rr=(a,b)=>a+(b-a)*random();
 const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
 const mat=(color,roughness=.88)=>new T.MeshStandardMaterial({color,roughness,metalness:0});
 const mats={white:mat('#f0ebd4'),dark:mat('#173e37'),wood:mat('#977357'),silver:mat('#839386',.5),clay:mat('#a96349'),ground:mat('#8b9471'),leaf:mat('#456047')};
 function mesh(g,m,parent=world,pos){const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;if(pos)o.position.copy(pos);parent.add(o);return o}
 const box=(x,y,z,m,parent=world,p)=>mesh(new T.BoxGeometry(x,y,z),m,parent,p);
 const plane=(w,h,m,parent=world,p)=>mesh(new T.PlaneGeometry(w,h),m,parent,p);
 const tube=(pts,r,m,parent=world)=>mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>Array.isArray(p)?V(...p):p)),Math.max(8,pts.length*5),r,6,false),m,parent);
 function textTexture(text,bg,fg,w=1024,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.font=`500 ${Math.floor(h*.40)}px Arial`;x.textAlign='center';x.textBaseline='middle';x.fillText(text,w/2,h/2);const tx=new T.CanvasTexture(c);tx.colorSpace=T.SRGBColorSpace;tx.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return tx}
 function grainTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),im=x.createImageData(256,256);for(let i=0;i<im.data.length;i+=4){const n=175+random()*75;im.data[i]=im.data[i+1]=im.data[i+2]=n;im.data[i+3]=255}x.putImageData(im,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(28,54);t.anisotropy=8;return t}
 const grit=grainTexture();mats.clay.bumpMap=grit;mats.clay.bumpScale=.019;
 const turf=mat('#365b49');const gnd=plane(400,400,turf,world,V(0,-.12,0));gnd.rotation.x=-Math.PI/2;gnd.castShadow=false;
 box(20.3,.14,36,mats.clay,world,V(0,-.082,0));
 const courtMat=mat('#2b6754');courtMat.bumpMap=grit;courtMat.bumpScale=.016;courtMat.roughness=.97;
 const court=plane(10.97,23.77,courtMat,world,V(0,.004,0));court.rotation.x=-Math.PI/2;court.castShadow=false;
 const lineMat=mat('#e5e5ce');function line(x,z,w,d){const o=box(w,.005,d,lineMat,world,V(x,.011,z));o.castShadow=false}
 for(const x of [-5.485,5.485])line(x,0,.055,23.82);for(const x of [-4.115,4.115])line(x,0,.05,23.77);
 for(const z of [-11.885,11.885]){line(0,z,10.97,.062);line(0,z-Math.sign(z)*.095,.052,.19)}
 for(const z of [-6.4,6.4])line(0,z,8.23,.052);for(const z of [-3.2,3.2])line(0,z,.05,6.4);
 // One mesh for the net, with a physical catenary-like top edge and a repeated alpha mask.
 const ncv=document.createElement('canvas');ncv.width=ncv.height=64;const nc=ncv.getContext('2d');nc.clearRect(0,0,64,64);nc.strokeStyle='#24312c';nc.lineWidth=3;nc.strokeRect(0,0,64,64);
 const nt=new T.CanvasTexture(ncv);nt.wrapS=nt.wrapT=T.RepeatWrapping;nt.repeat.set(120,11);nt.anisotropy=8;
 const netGeo=new T.PlaneGeometry(11.7,1.05,48,1),np=netGeo.attributes.position;
 for(let i=0;i<np.count;i++){const x=np.getX(i),top=.916+.152*Math.pow(Math.abs(x)/5.85,2);np.setY(i,np.getY(i)>0?top:.10)}netGeo.computeVertexNormals();
 const net=mesh(netGeo,new T.MeshStandardMaterial({map:nt,transparent:true,alphaTest:.12,side:T.DoubleSide,roughness:1,depthWrite:false}),world);net.castShadow=false;
 tube([[-5.85,1.078,0],[-3,.96,0],[0,.927,0],[3,.96,0],[5.85,1.078,0]],.025,mats.white);
 tube([[0,.01,0],[0,.92,0]],.018,mats.white);
 for(const x of [-5.87,5.87]){mesh(new T.CylinderGeometry(.055,.06,1.12,12),mats.dark,world,V(x,.56,0));box(.1,.012,.15,mats.white,world,V(x,1.127,0));box(.28,.02,.24,mats.dark,world,V(x,.012,0))}
 // An enclosure, not a toy picket fence. Side wind screens and unobtrusive wire above.
 const fence=mat('#183c33'),stone=mat('#c1b597'),screen=mat('#234b3c');
 const wireCanvas=document.createElement('canvas');wireCanvas.width=wireCanvas.height=64;const wc=wireCanvas.getContext('2d');wc.clearRect(0,0,64,64);wc.strokeStyle='#2b493a';wc.lineWidth=1.6;wc.beginPath();wc.moveTo(32,0);wc.lineTo(64,32);wc.lineTo(32,64);wc.lineTo(0,32);wc.closePath();wc.stroke();const wt=new T.CanvasTexture(wireCanvas);wt.wrapS=wt.wrapT=T.RepeatWrapping;wt.repeat.set(70,7);wt.anisotropy=8;
 const wm=new T.MeshStandardMaterial({map:wt,side:T.DoubleSide,transparent:true,alphaTest:.15,depthWrite:false});
 for(const sign of [-1,1]){
  const x=sign*10.05;box(.16,.34,36,stone,world,V(x,.1,0));box(.06,.06,36,fence,world,V(x,2.45,0));
  for(let z=-18;z<=18;z+=3){mesh(new T.CylinderGeometry(.032,.045,2.5,8),fence,world,V(x,1.25,z))}
  const side=plane(36,1.68,screen,world,V(x,1.07,0));side.rotation.y=Math.PI/2;side.material=screen.clone();side.material.side=T.DoubleSide;side.castShadow=false;
  const wire=plane(36,.65,wm,world,V(x,2.13,0));wire.rotation.y=Math.PI/2;wire.castShadow=false;
 }
 box(20.2,.33,.20,stone,world,V(0,.1,-18));box(20.2,1.67,.035,screen,world,V(0,1.07,-18));
 const backwire=plane(20.2,.65,wm,world,V(0,2.13,-18));backwire.castShadow=false;
 for(let x=-10;x<=10;x+=2.5){mesh(new T.CylinderGeometry(.032,.04,2.5,8),fence,world,V(x,1.25,-18))}box(20.2,.06,.06,fence,world,V(0,2.45,-18));
 const sign=plane(6.8,.74,new T.MeshStandardMaterial({map:textTexture('C O U R T   S T U D Y','#234b3c','#e4e5c5'),roughness:1}),world,V(0,1.16,-17.967));sign.castShadow=false;
 const courtNo=plane(1.2,.53,new T.MeshStandardMaterial({map:textTexture('01','#234b3c','#e4e5c5',256,128)}),world,V(7.4,1.16,-17.967));courtNo.castShadow=false;
 for(const [x,z,angle] of [[-7.9,8,Math.PI/2],[7.9,-8,-Math.PI/2]]){
  const bench=new T.Group();bench.position.set(x,0,z);bench.rotation.y=angle;world.add(bench);
  for(let i=0;i<4;i++)box(2.15,.05,.115,mats.wood,bench,V(0,.47,-.24+i*.14));for(let i=0;i<3;i++)box(2.15,.12,.05,mats.wood,bench,V(0,.66+i*.14,-.28));
  for(const xx of [-.82,.82]){box(.055,.5,.48,fence,bench,V(xx,.25,0));box(.055,.85,.06,fence,bench,V(xx,.55,-.29))}
  const bag=box(.6,.23,.27,mats.dark,bench,V(.45,.62,.02));bag.rotation.z=.06;
  mesh(new T.CylinderGeometry(.045,.047,.26,12),mat('#c8855a'),bench,V(-.56,.63,.02));mesh(new T.CylinderGeometry(.026,.026,.035,12),fence,bench,V(-.56,.78,.02));
 }
 // Clubhouse terrace and an architectural pergola, carefully outside the playable bounds.
 const plaster=mat('#d8cfb4'),shade=mat('#554f3c'),glass=new T.MeshStandardMaterial({color:'#487269',metalness:.25,roughness:.2});
 box(32,.6,8,stone,world,V(0,-.1,-24));box(32,1.75,.28,plaster,world,V(0,.94,-28));
 for(const x of [-14,-7,0,7,14]){box(.22,3.45,.22,plaster,world,V(x,1.8,-23.7));box(.22,3.45,.22,plaster,world,V(x,1.8,-27.3))}
 box(29.5,.21,4.6,plaster,world,V(0,3.58,-25.5));
 for(let x=-14;x<=14;x+=.58)box(.09,.11,4.3,mats.wood,world,V(x,3.40,-25.5));
 for(const x of [-10,0,10]){box(4.5,1.9,.10,glass,world,V(x,1.22,-27.81));box(4.65,.06,.2,shade,world,V(x,2.19,-27.7))}
 for(const x of [-9.9,0,9.9]){box(2.4,.14,.75,plaster,world,V(x,.76,-25.6));for(const xx of [-.9,.9])box(.08,.7,.52,shade,world,V(x+xx,.4,-25.6))}
 for(const sign of [-1,1]){box(1.3,.62,33,stone,world,V(sign*12,.11,0));for(let i=0;i<3;i++)box(3,.15,1.0,stone,world,V(sign*11,-.035+i*.15,18+i*.8))}
 // Curved-profile floodlights; emissive trim becomes visible in the evening preset.
 const emit=new T.MeshStandardMaterial({color:'#fff1cc',emissive:'#ffd9a6',emissiveIntensity:.4,roughness:.3});const lampLights=[];
 for(const [x,z] of [[-10.3,-12.5],[10.3,-12.5],[-10.3,12.5],[10.3,12.5]]){
  mesh(new T.CylinderGeometry(.055,.09,6.8,10),fence,world,V(x,3.4,z));box(.55,.07,.65,fence,world,V(x,6.78,z));box(.48,.018,.57,emit,world,V(x,6.736,z));
  const l=new T.PointLight('#ffdfb7',0,22,2);l.position.set(x,6.5,z);scene.add(l);lampLights.push(l);
 }
 // Detailed foliage cards and coherent trunks. Variation is seeded, never a network asset.
 const treePoints=[];for(let i=0;i<9;i++){const sign=i%2?-1:1;treePoints.push([sign*rr(14,20),rr(-25,19),rr(3.4,6.5)])}for(let i=0;i<5;i++)treePoints.push([rr(-35,35),rr(-38,-32),rr(4.5,7.8)]);
 const leafShape=new T.Shape();leafShape.moveTo(0,-.11);leafShape.quadraticCurveTo(.075,-.05,0,.12);leafShape.quadraticCurveTo(-.065,.025,0,-.11);
 const leafGeo=new T.ShapeGeometry(leafShape,3),leafMat=new T.MeshStandardMaterial({color:'#92a167',side:T.DoubleSide,roughness:1});
 const foliage=new T.InstancedMesh(leafGeo,leafMat,treePoints.length*170);foliage.castShadow=true;foliage.receiveShadow=true;world.add(foliage);const d=new T.Object3D();let leafId=0;
 const crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),mat('#cad6b9'),treePoints.length*4);crowns.castShadow=true;crowns.receiveShadow=true;world.add(crowns);let crownId=0;
 treePoints.forEach(([x,z,h],id)=>{
  tube([[x,0,z],[x+.06,h*.42,z+.04],[x-.13,h*.74,z+.09]],.070,mats.wood);for(let j=0;j<3;j++)tube([[x,h*.4,z],[x+(j-1)*.40,h*.65,z+.12],[x+(j-1)*.72,h*.83,z+(j===1?.40:0)]],.027,mats.wood);
  const w=rr(.7,1.25);for(let j=0;j<4;j++){d.position.set(x+(j%2-.5)*w,h*.74+(j>1?.55:0),z+(j<2?-.25:.35));d.scale.set(w,.73,w*.72);d.rotation.set(rr(-.3,.3),rr(0,6),rr(-.3,.3));d.updateMatrix();crowns.setMatrixAt(crownId,d.matrix);crowns.setColorAt(crownId++,new T.Color().setHSL(rr(.24,.29),rr(.18,.25),rr(.23,.37)))}
  for(let j=0;j<170;j++){const a=rr(0,Math.PI*2),v=rr(-1,1),r=Math.sqrt(1-v*v),radius=rr(.75,1.25);d.position.set(x+Math.cos(a)*r*w*radius,h*.80+v*.95,z+Math.sin(a)*r*w*.80*radius);d.scale.setScalar(rr(1.1,2.4));d.rotation.set(rr(-1.3,1.3),rr(0,6.28),rr(0,6.28));d.updateMatrix();foliage.setMatrixAt(leafId,d.matrix);foliage.setColorAt(leafId++,new T.Color().setHSL(rr(.22,.29),rr(.14,.32),rr(.3,.55)))}
 });
 // Tapered cypress silhouettes frame the court without obscuring it.
 const cg=new T.LatheGeometry([[0,0],[.25,.08],[.56,.6],[.62,1.4],[.47,2.6],[.22,3.5],[0,4.1]].map(p=>new T.Vector2(...p)),14);const cp=cg.attributes.position;for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),n=1+.07*Math.sin(y*12+x*19+z*9);cp.setXYZ(i,x*n,y,z*n)}cg.computeVertexNormals();
 const cypresses=new T.InstancedMesh(cg,mat('#c1ceb0'),30);cypresses.castShadow=true;cypresses.receiveShadow=true;world.add(cypresses);
 for(let i=0;i<30;i++){const side=i%2?-1:1;d.position.set(side*rr(13.6,17.2),0,-29+Math.floor(i/2)*3.3);d.rotation.set(0,rr(0,6.28),rr(-.04,.04));d.scale.set(rr(.75,1.12),rr(.8,1.55),rr(.7,1.03));d.updateMatrix();cypresses.setMatrixAt(i,d.matrix);cypresses.setColorAt(i,new T.Color().setHSL(rr(.25,.3),rr(.22,.3),rr(.25,.39)))}
 // Low hedges cover structural bases and give the court a human-scale boundary.
 const hedge=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat('#536b43'),108);hedge.castShadow=true;hedge.receiveShadow=true;world.add(hedge);
 for(let i=0;i<108;i++){const side=i%2?-1:1;d.position.set(side*12,rr(.32,.56),-17+Math.floor(i/2)*.65);d.scale.set(rr(.5,.65),rr(.36,.59),rr(.4,.65));d.rotation.set(0,rr(0,6),0);d.updateMatrix();hedge.setMatrixAt(i,d.matrix);hedge.setColorAt(i,new T.Color().setHSL(rr(.23,.29),.24,rr(.24,.34)))}
 // Atmospheric ridgelines provide depth, not an endless blank beige floor.
 const hills=[];for(const [z,height,color] of [[-160,27,'#c1c7b7'],[-123,22,'#9caca0'],[-86,14,'#819686']]){
  const v=[],idx=[],n=38;for(let i=0;i<=n;i++){const x=-190+i*10,top=height+Math.sin(i*.48)*height*.25+Math.sin(i*1.29)*2.5;v.push(x,-3,z,x,top,z-rr(0,5))}for(let i=0;i<n;i++){const a=i*2;idx.push(a,a+2,a+1,a+2,a+3,a+1)}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();const o=mesh(geo,mat(color),world);o.castShadow=false;hills.push(o)
 }
 const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color('#82b6cc')},horizon:{value:new T.Color('#dce6cf')},sun:{value:V(-.57,.22,-.79)}},vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 p;uniform vec3 top;uniform vec3 horizon;uniform vec3 sun;void main(){vec3 d=normalize(p);float h=smoothstep(-.24,.48,d.y);vec3 c=mix(horizon,top,h);float s=max(0.,dot(d,normalize(sun)));c+=vec3(.14,.11,.06)*pow(s,12.);c+=vec3(.4,.31,.16)*pow(s,450.);gl_FragColor=vec4(c,1.);}'});
 const sky=new T.Mesh(new T.SphereGeometry(270,48,24),skyMat);scene.add(sky);
 scene.background=new T.Color('#becab3');scene.fog=new T.FogExp2('#c7d4c9',.006);
 const hemi=new T.HemisphereLight('#d6e9ed','#8d8561',1.65);scene.add(hemi);
 const sun=new T.DirectionalLight('#ffedcf',3.05);sun.position.set(-16,19,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-19;sun.shadow.camera.right=19;sun.shadow.camera.top=21;sun.shadow.camera.bottom=-21;sun.shadow.camera.near=1;sun.shadow.camera.far=70;sun.shadow.normalBias=.017;sun.shadow.bias=-.00006;sun.shadow.radius=3;scene.add(sun);
 const fill=new T.DirectionalLight('#d9eced',.72);fill.position.set(10,9,17);scene.add(fill);
 const rim=new T.DirectionalLight('#ffe7b8',.72);rim.position.set(3,7,-11);scene.add(rim);
 // The same ball machine, now with readable housing, hopper, feet and a lens.
 const machine=new T.Group();machine.name='BallMachine';machine.userData.skipBatch=true;world.add(machine);machine.position.set(0,0,-10.9);
 box(.68,.52,.57,mats.white,machine,V(0,.80,0));box(.72,.16,.60,mats.dark,machine,V(0,.51,0));box(.61,.08,.51,mats.dark,machine,V(0,1.075,0));
 const mouth=mesh(new T.CylinderGeometry(.112,.132,.30,24),mats.dark,machine,V(0,1.14,.40));mouth.rotation.x=Math.PI/2;
 mesh(new T.CircleGeometry(.096,24),new T.MeshBasicMaterial({color:'#101e19'}),machine,V(0,1.14,.557));
 for(const x of [-.25,.25]){box(.055,.36,.36,mats.dark,machine,V(x,.23,0));const wheel=mesh(new T.CylinderGeometry(.11,.11,.07,18),mats.dark,machine,V(x,.16,-.15));wheel.rotation.z=Math.PI/2}
 for(const x of [-.29,.29])for(const z of [-.21,.21])box(.018,.24,.018,mats.dark,machine,V(x,1.23,z));
 for(const y of [1.14,1.29,1.37]){box(.6,.013,.015,mats.dark,machine,V(0,y,.21));box(.6,.013,.015,mats.dark,machine,V(0,y,-.21));box(.014,.013,.42,mats.dark,machine,V(-.29,y,0));box(.014,.013,.42,mats.dark,machine,V(.29,y,0))}
 const balls=mat('#d2df55');for(let i=0;i<12;i++){const o=mesh(new T.SphereGeometry(.038,10,8),balls,machine,V(rr(-.24,.24),1.12+rr(0,.20),rr(-.17,.17)));o.castShadow=false}
 function lighting(preset){
  const evening=preset==='evening';sun.color.set(evening?'#ffc184':'#ffedcf');sun.intensity=evening?2.25:3.05;sun.position.set(evening?-22:-16,evening?10:19,9);hemi.intensity=evening?1.25:1.65;fill.intensity=evening?.50:.72;
  skyMat.uniforms.top.value.set(evening?'#748da0':'#82b6cc');skyMat.uniforms.horizon.value.set(evening?'#e5b68e':'#dce6cf');scene.fog.color.set(evening?'#bbb2a0':'#c7d4c9');lampLights.forEach(l=>{l.intensity=evening?14:0;l.visible=evening});emit.emissiveIntensity=evening?3:.4;
 }
 return {world,mats,mesh,box,plane,tube,mat,machine,sun,sky,lighting,foliage};
};
