import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('src/app.js',root),'utf8');
const engine=fs.readFileSync(new URL('vendor/engine.js',root),'utf8');
const context=vm.createContext({window:{},console,AbortController});
vm.runInContext(engine,context,{displayErrors:false});
vm.runInContext(app.slice(app.indexOf('window.ClubPhysics='),app.indexOf('/* Cypress court.')),context);
const P=context.window.ClubPhysics,{V}=P;
const player=V(0,0,8.8);
const log=[];
function check(name,run){run();log.push({name,passed:true});console.log('PASS',name)}

check('finite reach admits nearby off-circle contact and rejects remote, behind and high balls',()=>{
  const ball=V(.85,1.1,8),before=ball.toArray();
  assert.equal(P.strikeContact({ball,player}).accepted,true);
  assert.deepEqual(ball.toArray(),before);
  for(const ball of [V(3,1.1,8),V(0,1.1,10),V(.5,3.4,8),V(.5,.1,8)])assert.equal(P.strikeContact({ball,player}).accepted,false);
  assert.equal(P.strikeContact({ball:V(1.35,1.1,8.5),player,assisted:true}).accepted,true);
  assert.equal(P.strikeContact({ball:V(1.35,1.1,8.5),player,assisted:false}).accepted,false);
});

// Execute the production contact/actor functions with renderer-free characters.
// The ball simulation, shot model, movement and swing-window control remain real.
function productionFunction(name,next){return app.slice(app.indexOf(' function '+name+'('),app.indexOf(' function '+next+'('))}
Object.assign(context,{P,V,clamp:P.clamp,mix:(a,b,t)=>a+(b-a)*t,C:{defs:{forehand:{start:.2,contact:.6,duration:1.2,label:'正手'},serve:{start:.2,contact:.6,duration:1.2,label:'发球'}}},clock:0,demo:false,mode:'practice',input:{x:0,z:0,power:0,held:false,queued:false},keys:new Set(),profile:()=>P.opponents.steady,getPlan:()=>null,axis:V(0,1,0),burst:()=>{},sound:()=>{},syncHUD:()=>{},toast:()=>{},record:(type,data)=>context.events.push({type,...data})});
context.difficulty=()=>P.difficulties[context.options.difficulty];
context.chooseAI=(index,b,kind,power)=>P.automatic({incoming:b.v,side:context.actors[index].side,kind,power});
vm.runInContext(productionFunction('contact','animateActor')+productionFunction('animateActor','stepBalls'),context);
vm.runInContext(productionFunction('release','startSwing')+productionFunction('startSwing','chooseAI'),context);
function reset({ball=V(.85,1.1,8),assisted=true,difficulty='easy',aimMode='physics'}={}){
  context.options={difficulty,contactAssist:assisted,timingAssist:true,autoMove:false,aimMode};
  context.events=[];context.clock=.31;
  context.actors=[1,-1].map(side=>({side,velocity:V(),plan:{goal:V(1.3,0,8.8)},swing:null,char:{group:{visible:true,position:V(0,0,8.8*side)},racketWorld:()=>V(-.4,1.1,8*side),setAnimation:(kind,t,aim)=>assert.equal(aim,undefined,'contact must not force a hand to the ball'),idle:()=>{}}}));
  context.actors[0].swing={kind:'forehand',started:0,lead:.31,hit:false,power:.45,planTime:.31};
  context.active=P.create(ball,V(0,-1,12));Object.assign(context.active,{receiver:0,lastHitter:1,hitAt:0});
  Object.assign(context,{stats:{errors:[],hits:[0,0],autoShots:0,manualShots:0,chosenShots:[],longestRally:0},practice:{hits:0,streak:0,best:0},rally:0,forecastId:0,lastPrediction:null,speed:0,aim:{position:V(1,0,-8)}});
}

check('production contact hits 1.3 m off recommendation without moving the ball or aiming IK',()=>{
  reset();const b=context.active,origin=b.p.toArray();
  assert.ok(context.actors[0].char.group.position.distanceTo(context.actors[0].plan.goal)>1.2);
  assert.ok(context.actors[0].char.racketWorld().distanceTo(b.p)>.67,'outside previous easy racket-only tolerance');
  context.contact(0);
  assert.equal(context.stats.hits[0],1);assert.equal(b.receiver,1);assert.ok(b.v.z<0);assert.deepEqual(b.p.toArray(),origin);
  assert.equal(context.events.filter(e=>e.type==='hit').length,1);
  context.contact(0);assert.equal(context.stats.hits[0],1,'a swing cannot hit twice');
});

check('swing retries after first miss, then connects inside the late window',()=>{
  reset({ball:V(2.0,1.1,8)});const before=context.active.v.toArray();
  context.animateActor(0,1/120);
  assert.equal(context.actors[0].swing.hit,false);assert.deepEqual(context.active.v.toArray(),before);
  context.clock=.41;context.active.p.set(.9,1.1,8);context.animateActor(0,1/120);
  assert.equal(context.actors[0].swing.hit,true);assert.equal(context.stats.hits[0],1);
});

check('early and late accepted hits continue from contact into follow-through on the next frame',()=>{
  for(const elapsed of [.195,.43]){
    reset();const phases=[],actor=context.actors[0],clip=context.C.defs.forehand;
    actor.char.setAnimation=(kind,time,aim)=>{assert.equal(aim,undefined);phases.push(time)};
    actor.char.racketWorld=()=>phases.at(-1)===clip.contact?V(.85,1.1,8):V(-1.2,1.1,8);
    context.clock=elapsed;context.animateActor(0,1/120);
    assert.equal(actor.swing.hit,true);assert.equal(actor.swing.lead,elapsed);assert.equal(actor.swing.planTime,.31);
    assert.equal(phases.at(-1),clip.contact);
    const hit=context.events.find(e=>e.type==='hit');
    assert.ok(Math.abs(hit.timing-(elapsed-.31))<1e-9);assert.equal(hit.impactElapsed,elapsed);
    assert.equal(hit.error,0);assert.ok(hit.preContactError>2,'diagnostics distinguish wind-up from contact pose');
    context.clock=elapsed+1/120;context.animateActor(0,1/120);
    assert.ok(phases.at(-1)>clip.contact,'the next frame must not return to wind-up');
    assert.ok(Math.abs(phases.at(-1)-(clip.contact+(clip.duration-clip.contact)/72))<1e-9);
  }
});

check('a distant ball misses once the swing window closes and keeps flying',()=>{
  reset({ball:V(4,1.1,8)});const before=context.active.v.toArray();
  for(let t=.2;t<.55;t+=1/120){context.clock=t;context.animateActor(0,1/120)}
  assert.equal(context.stats.hits[0],0);assert.equal(context.actors[0].swing.finished,true);
  assert.equal(context.events.filter(e=>e.type==='missed-swing').length,1);assert.deepEqual(context.active.v.toArray(),before);
});

check('manual tolerance still allows off-circle contact, with a smaller time window',()=>{
  reset({assisted:false});context.contact(0);assert.equal(context.stats.hits[0],1);
  reset({assisted:false});context.clock=.43;context.contact(0);assert.equal(context.stats.hits[0],0);
  reset();context.clock=.43;context.contact(0);assert.equal(context.stats.hits[0],1);
});

check('opponent difficulty never changes player reach, timing or running speed',()=>{
  const results=[];
  for(const difficulty of Object.keys(P.difficulties)){
    reset({difficulty,ball:V(1.35,1.1,8.5)});context.clock=.43;context.contact(0);assert.equal(context.stats.hits[0],1);
    context.active=null;context.actors[0].swing=null;context.input.x=1;
    for(let i=0;i<60;i++)context.animateActor(0,1/120);
    results.push(context.actors[0].char.group.position.x);
    context.input.x=0;
  }
  assert.equal(results[0],results[1]);assert.equal(results[1],results[2]);
  assert.equal(P.playerControls.speed,6.6);
});

check('visual helper toggles do not change contact or outgoing velocity',()=>{
  const shots=[];
  for(const visible of [true,false]){
    reset();for(const key of ['showBounce','showPosition','showTrajectory','showTiming'])context.options[key]=visible;
    context.contact(0);assert.equal(context.stats.hits[0],1);shots.push(context.active.v.toArray());
  }
  assert.deepEqual(shots[0],shots[1]);
});

check('physics, target and demonstration return paths remain available',()=>{
  reset();context.contact(0);assert.equal(context.stats.autoShots,1);
  reset({aimMode:'target'});context.contact(0);assert.equal(context.stats.manualShots,1);assert.ok(context.active.v.z<0);
  reset();context.demo=true;context.contact(0);assert.equal(context.stats.hits[0],1);context.demo=false;
});

check('AI contact keeps its own existing reach and timing limits',()=>{
  reset();context.active.receiver=1;context.active.p.set(-.4,1.1,-8);context.active.v.set(0,-1,-12);
  context.actors[0].swing=null;context.actors[1].swing={kind:'forehand',started:0,lead:.31,hit:false,power:.45,planTime:.31};
  context.animateActor(1,1/120);assert.equal(context.stats.hits[1],1);assert.ok(context.active.v.z>0);
});

check('release buffers with rhythm assistance and starts immediately when it is disabled',()=>{
  reset();Object.assign(context,{screen:'play',paused:false,replay:null,ended:false});
  context.actors[0].swing=null;context.actors[0].plan={kind:'forehand',at:.7};context.input.held=true;context.input.power=.4;
  context.release();assert.equal(context.input.queued,true);assert.equal(context.input.queuedAt,.31);assert.equal(context.actors[0].swing,null);
  context.options.timingAssist=false;context.input.held=true;context.release();
  assert.equal(context.input.queued,false);assert.equal(context.actors[0].swing.started,.31);
});

const results={suite:'forgiving-contact',testedAt:new Date().toISOString(),runtime:process.version,passed:log.length,checks:log};
fs.writeFileSync(new URL('tests/contact-results.json',root),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
