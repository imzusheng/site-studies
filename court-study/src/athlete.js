/* Original Court Study character. Authored surfaces; same 18-joint motion rig. */
window.createCourtAthlete = function(T, rig) {
 'use strict';
 const group=new T.Group(); group.name='CourtAthlete';
 const bones=rig.names.map(n=>{const b=new T.Bone();b.name=n;return b});
 bones.forEach((b,i)=>{b.position.fromArray(rig.offsets[i]);if(i===0)b.position.set(0,.912,0);(rig.parents[i]<0?group:bones[rig.parents[i]]).add(b)});
 group.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();
 const palettes={ivory:['#c58b6a','#f1efdf','#173e38','#a95743','#302b29','#b7745e','#201f21','#ecebde','#968b79','#cdccc0'],cypress:['#c58b6a','#234d42','#e4dfca','#c3694e','#302b29','#b7745e','#201f21','#ecebde','#968b79','#cdccc0']};
 const materials=palettes.ivory.map((c,i)=>new T.MeshStandardMaterial({name:['Skin','Jersey','Shorts','Trim','Hair','Lips','Eyes','Sclera','Sole','Laces'][i],color:c,roughness:[.82,.95,.9,.9,.66,.78,.37,.66,.91,.93][i],metalness:0}));
 const parts=materials.map(()=>[]);
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
 const skin=(v,type)=>{
  const ids=[0,0,0,0],w=[1,0,0,0];
  if(Number.isInteger(type)){ids[0]=type;return [ids,w]}
  if(type==='torso'){const t=smooth((v[1]-1.07)/.31),c=smooth((Math.abs(v[0])-.095)/.12)*smooth((v[1]-1.37)/.09)*.85;ids[1]=1;ids[2]=v[0]>0?4:8;w[0]=(1-t)*(1-c);w[1]=t*(1-c);w[2]=c}
  if(type==='pants'){const t=smooth((.98-v[1])/.24)*(.12+.88*smooth(Math.abs(v[0])/.10)),side=smooth((v[0]+.05)/.10);ids[1]=12;ids[2]=15;w[0]=1-t;w[1]=t*side;w[2]=t*(1-side)}
  if(type==='armL'||type==='armR'){
   const b=type==='armL'?5:9,x=Math.abs(v[0]),t=smooth((x-.43)/.13),h=smooth((x-.652)/.055);
   const c=1-smooth((x-.155)/.125);ids[0]=b;ids[1]=b+1;ids[2]=b+2;ids[3]=b-1;w[0]=(1-t)*(1-h)*(1-c);w[1]=t*(1-h)*(1-c);w[2]=h*(1-c);w[3]=c;
  }
  if(type==='legL'||type==='legR'){
   const b=type==='legL'?12:15,t=smooth((.546-v[1])/.115),h=smooth((.17-v[1])/.065);
   ids[0]=b;ids[1]=b+1;ids[2]=b+2;w[0]=(1-t)*(1-h);w[1]=t*(1-h);w[2]=h;
  }
  return [ids,w];
 };
 function surface(verts,faces,mat,type){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts.flat(),3));g.setIndex(faces.flat());g.computeVertexNormals();
  const ids=[],weights=[];for(const v of verts){const [i,w]=skin(v,type);ids.push(...i);weights.push(...w)}
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));parts[mat].push(g);
 }
 function rings(rows,mat,type,{sides=32,transform=null,detail=null,cap=true,flip=false}={}){
  const verts=[],faces=[];
  if(rows.length>3){const rr=[];const cat=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);for(let j=0;j<rows.length-1;j++){for(let k=0;k<3;k++){const t=k/3;rr.push(Array.from({length:5},(_,i)=>cat(rows[Math.max(0,j-1)][i]||0,rows[j][i]||0,rows[j+1][i]||0,rows[Math.min(rows.length-1,j+2)][i]||0,t)))}}rr.push(rows.at(-1));rows=rr}
  rows.forEach((r,j)=>{for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2;let v=[r[4]||0,r[0],r[3]||0];v[0]+=r[1]*Math.cos(a);v[2]+=r[2]*Math.sin(a);if(detail)v=detail(v,a,j);if(transform)v=transform(v);verts.push(v)}});
  for(let j=0;j<rows.length-1;j++)for(let i=0;i<sides;i++){const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;faces.push([a,c,b],[b,c,d])}
  if(cap){for(const [row,reverse] of [[0,true],[rows.length-1,false]]){const center=[0,0,0];for(let i=0;i<sides;i++)for(let c=0;c<3;c++)center[c]+=verts[row*sides+i][c]/sides;const idx=verts.length;verts.push(center);for(let i=0;i<sides;i++){const a=row*sides+i,b=row*sides+(i+1)%sides;faces.push(reverse?[idx,a,b]:[idx,b,a])}}}
  surface(verts,flip?faces.map(f=>f.reverse()):faces,mat,type);
 }
 function ell(c,r,mat,bone,rows=12,cols=20){
  const rr=[];for(let i=0;i<=rows;i++){const a=(i/rows-.5)*Math.PI;rr.push([c[1]+Math.sin(a)*r[1],Math.max(.0001,Math.cos(a)*r[0]),Math.max(.0001,Math.cos(a)*r[2]),c[2],c[0]])}rings(rr,mat,bone,{sides:cols,cap:false});
 }
 function ribbon(points,r,mat,bone,segments=32,radial=8){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));const g=new T.TubeGeometry(curve,segments,r,radial,false);const a=g.getAttribute('position'),v=[];for(let i=0;i<a.count;i++)v.push([a.getX(i),a.getY(i),a.getZ(i)]);const idx=Array.from(g.index.array),f=[];for(let i=0;i<idx.length;i+=3)f.push(idx.slice(i,i+3));surface(v,f,mat,bone);g.dispose();
 }
 // A fitted, sleeveless technical top; an uninterrupted waist-to-shoulder silhouette.
 rings([[1.012,.153,.107,0],[1.043,.156,.106,0],[1.11,.144,.1,0],[1.2,.139,.104,.003],[1.29,.156,.113,.004],[1.37,.17,.117,.006],[1.43,.19,.102,0],[1.47,.191,.076,-.003],[1.491,.15,.064,-.003],[1.519,.058,.053,-.002]],1,'torso',{sides:48,detail:(v,a,j)=>{if(j>0&&j<6)v[2]+=.0015*Math.cos(a*7+j);return v}});
 // Side panels and neckline piping are genuine curves, not floating spheres.
 for(const sign of [-1,1]){
  ribbon([[sign*.148,1.03,.045],[sign*.134,1.16,.045],[sign*.145,1.3,.053],[sign*.177,1.42,.038]],.010,2,'torso',22,8);
  ribbon([[sign*.15,1.037,.054],[sign*.14,1.12,.057]],.0032,3,'torso',14,6);
 }
 const collar=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;collar.push([.059*Math.cos(a),1.521,.052*Math.sin(a)-.002])}ribbon(collar,.0045,2,1,48,8);
 rings([[1.017,.155,.109,0],[1.028,.156,.110,0]],2,0,{sides:48});
 // Tailored shorts with a coherent hip yoke, not three intersecting spheres.
 for(const sign of [-1,1]){
  const v=[],f=[],trim=[],n=40,steps=16;
  for(let j=0;j<=steps;j++)for(let i=0;i<n;i++){
   const t=j===0?0:j===1?.036:.036+(j-1)/(steps-1)*.964,a=i/n*Math.PI*2,c=Math.cos(a),z=Math.sin(a),ox=sign*(.124+.088*c),oz=.098*z;
   const tx=sign*.163*Math.max(0,c),tz=.114*z,ty=1.012-(c<0?.19*(-c):0);
   v.push([ox+(tx-ox)*t,.726+(ty-.726)*t,oz+(tz-oz)*t]);
  }
  for(let j=0;j<steps;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;(j===0?trim:f).push(sign>0?[a,c,b]:[a,b,c],sign>0?[b,c,d]:[b,d,c])}
  surface(v,f,2,'pants');surface(v,trim,1,'pants');
 }
 // Waistband intentionally recessed under the jersey; no overlapping contrast strip.
 for(const sign of [-1,1]){
  const leg=sign>0?12:15,arm=sign>0?5:9,x=sign*.1242,side=sign>0?'L':'R',ay=1.482;
  
  // Hem is part of the shorts surface, not a coincident second mesh.
  // Ankle, calf, knee and quadriceps defined by silhouette, not add-on kneecaps.
  rings([[.098,.035,.041,0,x],[.157,.036,.043,0,x],[.225,.046,.05,-.003,x],[.305,.055,.059,-.007,x],[.367,.054,.058,-.004,x],[.429,.045,.049,.006,x],[.474,.048,.05,.01,x],[.51,.052,.059,.002,x],[.593,.065,.071,-.003,x],[.674,.075,.08,-.005,x],[.766,.082,.085,-.006,x]],0,'leg'+side,{sides:28});
  // Continuous tapered arms. Forearm longitudinal axis is exactly the recorded rig axis.
  const armrows=[[.113,.009,.013],[.148,.039,.050],[.177,.056,.062],[.216,.061,.063],[.264,.055,.058],[.321,.049,.053],[.392,.038,.043],[.433,.034,.039],[.46,.035,.04],[.493,.041,.045],[.535,.043,.043],[.594,.035,.036],[.654,.027,.029],[.698,.025,.028]];
  rings(armrows,0,'arm'+side,{sides:28,flip:sign>0,transform:v=>[sign*v[1],ay+v[0],v[2]]});
  const wx=sign*.6993;
  // Compact anatomical grip: palm plus four curled fingers and opposed thumb.
  ell([wx,ay-.030,.002],[.029,.047,.026],0,arm+2,14,20);
  for(let f=0;f<4;f++){const yy=ay-.008-f*.017; ribbon([[wx-sign*.023,yy,.009],[wx-sign*.010,yy,.033],[wx+sign*.017,yy,.031],[wx+sign*.027,yy,.013]],.0073,0,arm+2,12,7)}
  ribbon([[wx+sign*.032,ay+.005,-.003],[wx+sign*.033,ay-.011,.018],[wx+sign*.017,ay-.026,.030]],.010,0,arm+2,14,9);
  rings([[.642,.034,.037],[.66,.034,.037]],1,arm+1,{sides:28,flip:sign>0,transform:v=>[sign*v[1],ay+v[0],v[2]]});
  rings([[.664,.03,.033],[.671,.03,.033]],3,arm+1,{sides:28,flip:sign>0,transform:v=>[sign*v[1],ay+v[0],v[2]]});
  // Knitted socks and court shoe, with separate outsole, foxing, heel and lace cage.
  rings([[.096,.042,.048,.008,x],[.19,.044,.049,.005,x],[.202,.046,.05,.005,x]],1,'leg'+side,{sides:28});
  rings([[.183,.045,.050,.005,x],[.188,.045,.051,.005,x]],2,'leg'+side,{sides:28});
  const sole=[[.012,.065,.139,.064,x],[.026,.071,.149,.064,x],[.044,.071,.149,.064,x],[.052,.067,.144,.064,x]];
  rings(sole,8,leg+2,{sides:36});rings([[.045,.070,.147,.064,x],[.058,.068,.143,.064,x]],1,leg+2,{sides:36});
  rings([[.055,.065,.14,.062,x],[.08,.064,.132,.06,x],[.11,.056,.107,.043,x],[.143,.045,.076,.021,x],[.15,.031,.037,.006,x]],1,leg+2,{sides:36});
  ribbon([[x-sign*.056,.074,-.027],[x-sign*.059,.085,.04],[x-sign*.04,.12,.077]],.0065,2,leg+2,18,7);
  ribbon([[x+sign*.057,.068,-.011],[x+sign*.058,.078,.025],[x+sign*.05,.09,.05]],.006,3,leg+2,18,7);
  for(let k=0;k<5;k++){const z=.033+k*.018,yy=.146-k*.005; ribbon([[x-.027,yy-.006,z],[x,yy,z+.004],[x+.027,yy-.006,z]],.0028,9,leg+2,8,6)}
 }
 rings([[1.493,.044,.046,0],[1.561,.046,.047,.003],[1.599,.049,.05,.009]],0,2,{sides:32});
 // Sculpted face: flat facial plane, angular jaw, cheek volume, built-in nose bridge.
 const headRows=[[1.579,.038,.039,.021],[1.594,.057,.058,.015],[1.621,.079,.079,.003],[1.653,.094,.087,-.002],[1.68,.10,.092,-.004],[1.711,.101,.097,-.009],[1.745,.098,.097,-.015],[1.777,.084,.085,-.017],[1.802,.056,.059,-.017],[1.816,.007,.009,-.017]];
 function faceDetail(v,a,j){const front=Math.max(0,Math.sin(a)),x=v[0],y=v[1];if(front>0){v[2]+=Math.pow(front,8)*(.012*Math.exp(-Math.pow((y-1.663)/.049,2)));v[2]+=.017*Math.exp(-Math.pow(x/.015,2)-Math.pow((y-1.665)/.033,2))*front;v[2]-=.005*Math.exp(-Math.pow((Math.abs(x)-.044)/.02,2)-Math.pow((y-1.691)/.013,2))*front;}return v}
 rings(headRows,0,3,{sides:64,detail:faceDetail});
 for(const sign of [-1,1]){
  ell([sign*.099,1.669,-.002],[.013,.025,.015],0,3,12,18);ell([sign*.106,1.669,.006],[.006,.013,.005],5,3,10,12);
  // Almond-shaped inset eye surfaces, not protruding white eyeballs.
  const cx=sign*.041,cy=1.691,cz=.092;
  function eyePatch(rx,ry,z,mat){const v=[[cx,cy,z]],f=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;v.push([cx+rx*Math.cos(a),cy+ry*Math.sin(a)*(Math.cos(a)*sign*.12+1),z-.006*Math.abs(Math.cos(a))])}for(let i=1;i<=32;i++)f.push([0,i,i+1]);surface(v,f,mat,3)}
  eyePatch(.023,.0095,cz,6);eyePatch(.020,.0067,cz+.0006,7);
  ell([cx-sign*.001,cy,cz+.0018],[.0068,.0073,.0013],2,3,12,16);ell([cx-sign*.001,cy+.0004,cz+.0031],[.0032,.0051,.0008],6,3,10,12);
  ell([cx-.002,cy+.003,cz+.0038],[.0018,.002,.0004],7,3,8,10);
  ribbon([[cx-sign*.023,cy+.006,cz-.006],[cx-sign*.012,cy+.010,cz-.001],[cx+sign*.009,cy+.009,cz],[cx+sign*.024,cy+.003,cz-.009]],.0016,6,3,16,5);
  ribbon([[cx-sign*.023,1.718,.084],[cx,1.722,.091],[cx+sign*.022,1.717,.082]],.0031,4,3,18,6);
 }
 ribbon([[-.02,1.624,.087],[-.008,1.626,.093],[0,1.6245,.095],[.01,1.626,.092],[.02,1.624,.087]],.0015,5,3,22,6);
 // Sculpted cap of hair swept back in graphic sections; compact ponytail behind neck.
 rings([[1.718,.103,.100,-.018],[1.754,.105,.102,-.019],[1.789,.09,.09,-.021],[1.814,.062,.064,-.021],[1.83,.012,.016,-.020]],4,3,{sides:56,detail:(v,a,j)=>{v[1]+=j===0?(.006*Math.sin(a*2)-.006*Math.sin(a)):0;v[2]-=.002*Math.cos(a*12);return v}});
 for(const sign of [-1,1]){
  ribbon([[sign*.023,1.824,.005],[sign*.079,1.796,-.005],[sign*.102,1.735,-.052],[sign*.065,1.694,-.096]],.011,4,3,24,10);
  ribbon([[sign*.09,1.767,.026],[sign*.104,1.718,-.002],[sign*.10,1.685,-.015]],.010,4,3,22,9);
 }
 const tail=[[0,1.753,-.102],[.02,1.724,-.146],[.038,1.665,-.165],[.039,1.60,-.181],[.017,1.557,-.196]];
 ribbon(tail,.03,4,3,32,14);ribbon([[.023,1.73,-.134],[.038,1.678,-.153],[.048,1.614,-.167],[.017,1.549,-.195]],.017,4,3,30,10);
 ell([.014,1.737,-.138],[.033,.012,.023],3,3,10,16);
 // Slim visor band and shaped brim, no massive floating disk.
 const band=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;band.push([.104*Math.cos(a),1.733+.005*Math.sin(a),-.011+.098*Math.sin(a)])}ribbon(band,.010,1,3,64,8);
 materials[1].side=T.DoubleSide;const vv=[],ff=[];for(let r=0;r<3;r++)for(let i=0;i<=32;i++){const a=Math.PI*i/32;const rr=.103+r*.037*Math.sin(a);vv.push([rr*Math.cos(a),1.735-r*.006-.006*Math.sin(a),-.005+(rr+.014)*Math.sin(a)])}for(let j=0;j<2;j++)for(let i=0;i<32;i++){const a=j*33+i;ff.push([a,a+1,a+33],[a+1,a+34,a+33]);}surface(vv,ff,1,3);
 // Sculpted nose bridge and tip, integrated by overlap with the facial plane.
 surface([[-.008,1.69,.102],[.008,1.69,.102],[-.012,1.658,.108],[0,1.661,.133],[.012,1.658,.108],[0,1.651,.116]],[ [0,2,3],[0,3,1],[1,3,4],[2,5,3],[3,5,4] ],0,3);
 // Brand-free chest insignia.
 ribbon([[.071,1.357,.12],[.074,1.367,.12],[.089,1.367,.115]],.003,2,1,12,6);
 for(let i=0;i<parts.length;i++){if(!parts[i].length)continue;const geo=window.BASELINE_ENGINE.mergeGeometries(parts[i],false);const pp=geo.getAttribute('position'),nn=geo.getAttribute('normal'),map=new Map();for(let k=0;k<pp.count;k++){const key=[pp.getX(k),pp.getY(k),pp.getZ(k)].map(v=>Math.round(v*1e6)).join(',');if(!map.has(key))map.set(key,[]);map.get(key).push(k)}for(const list of map.values()){if(list.length<2)continue;const n=new T.Vector3();for(const k of list)n.add(new T.Vector3(nn.getX(k),nn.getY(k),nn.getZ(k)));n.normalize();for(const k of list)nn.setXYZ(k,n.x,n.y,n.z)}const m=new T.SkinnedMesh(geo,materials[i]);m.name='Athlete_'+materials[i].name;m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;group.add(m);m.bind(skeleton);for(const p of parts[i])p.dispose()}
 group.userData.setOutfit=name=>{const pal=palettes[name]||palettes.ivory;materials.forEach((m,i)=>m.color.set(pal[i]))};
 group.userData.characterVersion='studio-athlete-1';group.userData.triangles=group.children.filter(m=>m.isSkinnedMesh).reduce((a,m)=>a+m.geometry.index.count/3,0);
 return group;
};
