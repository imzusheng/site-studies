/** Small, dependency-free checks of the recovered solver. NOT biomechanical validation. */
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({window:{},console,TextEncoder,TextDecoder,URL,AbortController});
vm.runInContext(fs.readFileSync(path.join(root,'vendor/engine.js'),'utf8'),ctx,{timeout:10000});
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');vm.runInContext(app.slice(app.indexOf('window.ClubPhysics='),app.indexOf('/* Cypress court.')),ctx,{timeout:5000});
const P=ctx.window.ClubPhysics,V=P.V,checks=[];
const check=(name,pass,detail)=>{checks.push({name,passed:!!pass,detail});if(!pass)throw Error(name)};
check('Fixed gravity',P.C.gravity===9.81);
check('Three opponent profiles',Object.keys(P.opponents).length===3);
check('Distinct opponent power/reaction',P.opponents.power.power>P.opponents.steady.power&&P.opponents.power.reaction!==P.opponents.tactician.reaction);
const b=P.create(V(0,2,8),V(1,1,-10),V(-40,0,0)),old=b.p.clone(),predict=P.predict(b,1);
check('Predict does not mutate input',b.p.equals(old)&&b.age===0);
const b2=P.copy(b),arr=[];for(let i=1;i<=120;i++){P.step(b2,1/120,{walls:false,net:true});if(i%4===0)arr.push(b2.p.clone())}
check('Prediction agrees with same integrator',predict.samples.every((s,i)=>s.p.distanceTo(arr[i])<1e-8));
const args={incoming:V(0,-1,12),spin:V(20,0,0),side:1,kind:'forehand',power:.5,timing:0,lateral:0,height:1.2,balance:1,movement:0,stance:0};
const a=P.automatic(args),t=P.automatic({...args,target:V(100,0,100)});
check('Automatic ignores arbitrary target input',a.v.distanceTo(t.v)<1e-9);
check('Power affects launch',a.v.distanceTo(P.automatic({...args,power:.9}).v)>.1);
check('Timing affects launch',a.v.distanceTo(P.automatic({...args,timing:.1}).v)>.01);
check('Contact lateral offset affects launch',a.v.distanceTo(P.automatic({...args,lateral:.4}).v)>.01);
const dead=P.create(V(0,2,4),V(3,0,2));dead.dead=true;let bounced=false;
for(let i=0;i<2400;i++){for(const e of P.step(dead,1/120))if(e.type==='bounce')bounced=true}
check('Dead ball still bounces',bounced);check('Dead ball eventually sleeps',dead.sleeping);
const wall=P.create(V(9.74,1,5),V(3,0,0));const events=P.step(wall,.04);check('Wall rebounds',events.some(e=>e.type==='wall')&&wall.v.x<0);
const report={passed:true,checks,scope:'Recovered solver basic regression only; not real-world calibration'};
fs.writeFileSync(path.join(root,'tests/physics-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
