'use strict';
// Production math / collision / motion planner only. No real model is loaded or rendered in this suite.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(path.join(__dirname, '../dist/game.js'), 'utf8');
const cut = code.lastIndexOf('var Rally;');
assert(cut > 0, 'Namespace bootstrap must be identifiable');
const ctx = vm.createContext({ console, Math, Float32Array, Uint16Array });
vm.runInContext(code.slice(0, cut), ctx);
const R = ctx.Rally, { V, Ball, RacketPose, Actor, DEFAULT_SETUP: S } = R;
let passed = 0;
const cases = [];
function test(name, fn) { fn(); passed++; cases.push(name); console.log('PASS', name); }
function close(a,b,t=1e-6){ assert(Math.abs(a-b)<=t, `${a} != ${b}`); }
function collide(a,b,r0=new RacketPose(),r1=r0){return R.sweepContact(a,b,r0,r1,{hit:false,t:0,u:0,v:0,gap:0});}
test('A ball crossing the visible string bed contacts',()=>assert(collide(new V(0,0,-1),new V(0,0,1)).hit));
test('High speed crossing uses swept contact, not endpoint overlap',()=>{const c=collide(new V(0,0,-10),new V(0,0,10));assert(c.hit&&c.t>.4&&c.t<.6);});
test('A nearby body-height ball outside the racket does NOT contact',()=>assert(!collide(new V(1,0,-1),new V(1,0,1)).hit));
test('A ball above the racket does NOT contact',()=>assert(!collide(new V(0,1,-1),new V(0,1,1)).hit));
test('A parallel pass separated from the string plane does NOT contact',()=>assert(!collide(new V(-.1,0,.25),new V(.1,0,.25)).hit));
test('Visible rim can contact the ball edge',()=>assert(collide(new V(.33,0,-.2),new V(.33,0,.2)).hit));
test('Racket translation sweeps a stationary ball',()=>{const a=new RacketPose(),b=new RacketPose();a.p.z=-.5;b.p.z=.5;assert(collide(new V(),new V(),a,b).hit);});
test('Contact stores the interpolated surface position',()=>{const c=collide(new V(.12,.16,-1),new V(.12,.16,1));assert(c.hit&&c.gap<=R.BALL_R+.012);close(c.u,.12/.29);close(c.v,.16/.40);});
test('Gravity lowers vertical velocity',()=>{const b=new Ball();b.p.y=5;R.integrate(b,1/120);assert(b.v.y<0);});
test('Air resistance lowers horizontal velocity',()=>{const b=new Ball();b.p.y=5;b.v.z=20;R.integrate(b,1/120);assert(b.v.z<20);});
test('Bounce reverses downward motion',()=>{const b=new Ball();b.p.y=.096;b.v.y=-4;assert(R.integrate(b,1/120));assert(b.v.y>0&&b.bounces===1);});
test('Topspin drops earlier than backspin from the same state',()=>{const a=new Ball(),b=new Ball();a.p.y=b.p.y=5;a.top=2400;b.top=-750;for(let i=0;i<30;i++){R.integrate(a,1/120);R.integrate(b,1/120);}assert(a.p.y<b.p.y);});
test('Topspin produces a stronger forward / vertical rebound',()=>{const a=new Ball(),b=new Ball();a.p.y=b.p.y=.096;a.v.y=b.v.y=-4;a.v.z=b.v.z=12;a.top=2400;b.top=-750;R.integrate(a,1/120);R.integrate(b,1/120);assert(a.v.y>b.v.y&&a.v.z>b.v.z);});
test('Side spin changes lateral travel',()=>{const a=new Ball(),b=new Ball();a.p.y=b.p.y=5;a.side=220;b.side=-220;for(let i=0;i<60;i++){R.integrate(a,1/120);R.integrate(b,1/120);}assert(a.p.x>0&&b.p.x<0);});
test('Fixed simulation is independent of 30 / 60 / 144 Hz render grouping',()=>{const run=hz=>{const b=new Ball();b.p.set(0,4,0);b.v.set(2,3,-9);let acc=0;for(let f=0;f<hz*2;f++){acc+=1/hz;while(acc+1e-10>=1/120){R.integrate(b,1/120);acc-=1/120;}}return b;};const a=run(30),b=run(60),c=run(144);close(a.p.x,b.p.x);close(a.p.y,c.p.y);close(a.p.z,c.p.z);});
test('Trajectory solver reaches its intended first-bounce neighbourhood',()=>{const b=new Ball();R.launch(b,new V(.6,1.1,7.3),-1.7,-7,16,2000);for(let i=0;i<500&&!b.bounces;i++)R.integrate(b,1/120);assert(b.bounces===1);assert(Math.abs(b.p.x+1.7)<.15&&Math.abs(b.p.z+7)<.3);});
for(const [name,args,expected] of [
 ['normal ball',[1,-.8,.7,0,.5,false,1],'topspin'],
 ['left/right wide reach',[1,-.8,-1.3,0,.5,false,1],'reach'],
 ['emergency running reach',[1,-.8,.7,7,.5,false,1],'reach'],
 ['low ball',[.5,-.8,.7,0,.5,false,1],'slice'],
 ['late ball',[1,-.2,.7,0,.5,false,1],'slice'],
 ['volley without bounce',[1.3,-.8,.7,0,.4,true,0],'volley'],
 ['high opportunity smash',[2.3,-.8,.7,0,.8,false,0],'smash'],
 ['high attacking drive',[1.65,-.8,.7,0,.9,false,1],'drive']]) test('Automatic stroke: '+name,()=>assert.equal(R.chooseStroke(...args),expected));
for(const [name,z,off,lead] of [['Perfect',-.8,.2,0],['Good',-.65,.4,0],['Early',-.8,.3,.10],['Late',-.8,.3,-.12]])test('Timing tier: '+name,()=>assert.equal(R.timingFor(z,off,lead),name));
test('Heavy frame trades maneuverability for power and stability',()=>{const a=R.rate({...S,weight:270}),b=R.rate({...S,weight:330});assert(a.agility>b.agility&&a.stability<b.stability&&a.power<b.power);});
test('Head-heavy balance trades maneuverability for power',()=>{const a=R.rate({...S,balance:30}),b=R.rate({...S,balance:34});assert(a.agility>b.agility&&a.power<b.power);});
test('Low tension trades control for power / forgiveness',()=>{const a=R.rate({...S,tension:44}),b=R.rate({...S,tension:60});assert(a.control<b.control&&a.power>b.power&&a.forgiveness>b.forgiveness);});
test('Large head increases actual collision ellipse and trades control',()=>{const a=new Actor(R.C.lime),b=new Actor(R.C.lime);a.pose(0,{...S,head:95});b.pose(0,{...S,head:110});assert(b.racket.rx>a.racket.rx);assert(R.rate({...S,head:110}).control<R.rate({...S,head:95}).control);});
test('Racket weight changes actual windup duration',()=>{const a=new Actor(R.C.lime),b=new Actor(R.C.lime);a.start(new V(.73,1.1,7.4),{...S,weight:270});b.start(new V(.73,1.1,7.4),{...S,weight:330});assert(a.windup<b.windup);});
test('Committed shot chooses forehand for right-side balls',()=>{const a=new Actor(R.C.lime);a.start(new V(.73,1.1,7.4),S);assert.equal(a.hand,1);});
test('Committed shot chooses backhand for left-side balls',()=>{const a=new Actor(R.C.lime);a.start(new V(-.73,1.1,7.4),S);assert.equal(a.hand,-1);});
test('Planned racket frames remain orthonormal across both sides and heights',()=>{for(const x of [-1.1,-.6,.6,1.1])for(const y of [.5,1.2,2.5]){const a=new Actor(R.C.lime);a.charging=true;a.charge=.8;a.pose(.1,S);a.start(new V(x,y,7.4),S);for(let i=0;i<120;i++){a.tick(1/120,S);const p=a.racket;close(p.u.dot(p.v),0);close(p.n.dot(p.v),0);close(p.n.len(),1);close(p.u.len(),1);assert(Number.isFinite(p.p.x+p.p.y+p.p.z));}}});
test('Planned grip uses the exact handle offset rather than a separate swing path',()=>{const a=new Actor(R.C.lime);a.start(new V(.7,1.1,7.4),S);a.tick(.14,S);const grip=new V().copy(a.racket.p).addScaled(a.racket.v,-.50);close(grip.dist(a.grip),0);});
test('Idle planted feet do not drift',()=>{const a=new Actor(R.C.lime),p=new V().copy(a.feet[0]);for(let i=0;i<120;i++)a.tick(1/120,S);close(a.feet[0].dist(p),0);});
test('Moving foot targets lift during a step',()=>{const a=new Actor(R.C.lime);a.vx=4;let high=0;for(let i=0;i<90;i++){a.x+=4/120;a.tick(1/120,S);high=Math.max(high,a.feet[0].y,a.feet[1].y);}assert(high>.20);});
test('Starting serve swing exits trophy / toss pose',()=>{const a=new Actor(R.C.lime);a.tossing=true;a.start(new V(.7,2.5,7.4),S,true);assert.equal(a.tossing,false);});
test('Seven drill definitions have actionable goals',()=>{assert.equal(R.DRILLS.length,7);assert(R.DRILLS.every(d=>d.goal>0&&d.task.length>0));});
test('Charged swing has an outside backswing, forward contact and cross-body finish',()=>{for(const hand of [1,-1]){const a=new Actor(R.C.lime);a.hand=hand;a.charging=true;for(let i=0;i<85;i++)a.tick(1/120,S);const prep=a.racket.p.x;assert(a.racket.p.z>a.z-.35);a.start(new V(hand*.73,1.25,7.4),S);a.swing=a.windup;a.pose(.01,S);close(a.racket.p.z,7.4);a.swing=a.windup+.36;a.pose(.01,S);assert(a.racket.p.x*hand<0);assert(Math.abs(prep-a.racket.p.x)>1);}});
test('A complete planned swing occupies load/contact/follow/recovery phases',()=>{const a=new Actor(R.C.lime);a.start(new V(.73,1.25,7.4),S);const stages=new Set;for(let i=0;i<130;i++){a.tick(1/120,S);stages.add(a.actionPhase);}assert([...stages].some(x=>x.includes('LOAD')));assert([...stages].some(x=>x.includes('SWING')));assert([...stages].some(x=>x.includes('FOLLOW')));assert([...stages].some(x=>x.includes('RECOVER')));assert.equal(a.swing,-1);});
test('Committed swing retains its chosen forehand/backhand side',()=>{const a=new Actor(R.C.lime);a.start(new V(-.73,1.25,7.4),S);for(let i=0;i<95;i++){a.tick(1/120,S);assert.equal(a.hand,-1);}});
test('Low contact lowers the pelvis rather than only extending the arm',()=>{const a=new Actor(R.C.lime),b=new Actor(R.C.lime);a.start(new V(.73,.46,7.4),S);b.start(new V(.73,1.25,7.4),S);a.tick(.15,S);b.tick(.15,S);assert(a.bodyY<b.bodyY-.12);});
test('Torso loads then rotates through a forehand instead of remaining square',()=>{const a=new Actor(R.C.lime);a.charging=true;for(let i=0;i<85;i++)a.tick(1/120,S);const load=a.bodyYaw;a.start(new V(.73,1.25,7.4),S);for(let i=0;i<70;i++)a.tick(1/120,S);assert(load<-.5&&a.bodyYaw>.40);});
test('Foot plan contains heel strike, toe-off and airborne recovery',()=>{const a=new Actor(R.C.lime);a.vz=-4.8;let lo=0,hi=0,lift=0,heel=0;for(let i=0;i<240;i++){a.z+=a.vz/120;a.tick(1/120,S);for(const f of a.footState){lo=Math.min(lo,f.pitch);hi=Math.max(hi,f.pitch);lift=Math.max(lift,f.p.y);heel=Math.max(heel,f.stance?f.p.y:0);}}assert(lo<-.5&&hi>.18&&lift>.38&&heel>.17);});
test('Planted-foot horizontal coordinates do not follow the moving pelvis',()=>{const a=new Actor(R.C.lime);a.vx=3;let observed=0;for(let i=0;i<240;i++){const prev=a.footState.map(f=>({x:f.p.x,z:f.p.z,stance:f.stance,phase:f.phase}));a.x+=3/120;a.tick(1/120,S);a.footState.forEach((f,j)=>{if(f.stance&&prev[j].stance&&f.phase>prev[j].phase&&f.phase<.30){assert(Math.hypot(f.p.x-prev[j].x,f.p.z-prev[j].z)<.01);observed++;}});}assert(observed>20);});
test('Changing prepared sides eases the planned racket rather than teleporting it',()=>{const a=new Actor(R.C.lime);a.charging=true;for(let i=0;i<90;i++)a.tick(1/120,S);const previous=new V().copy(a.racket.p);a.hand=-1;a.prep*=.45;a.tick(1/120,S);assert(previous.dist(a.racket.p)<.22);});
fs.writeFileSync(path.join(__dirname,'core-results.json'),JSON.stringify({scope:'Non-rendering: physics and authored motion planner, real HumanRig not instantiated',passed,cases},null,2));
console.log(`\n${passed} checks passed.`);
