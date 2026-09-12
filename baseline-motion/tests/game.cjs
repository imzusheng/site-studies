'use strict';
const {R,createGame}=require('./harness.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const cases=[],detail={};
function test(name,fn){fn();cases.push(name);console.log('PASS',name);}
function policy(g,move=false){const p=g.player,b=g.ball;g.wallTime=g.clock;
  if(g.awaitServe){if(!p.charging)g.charge();if(p.charge>.7)g.release();return;}
  if(b.active&&b.last!==1&&!g.pointOver&&!g.tossOwner){
    if(move&&g.interceptValid){const dx=g.interceptX-.73-p.x,dz=g.interceptZ+.8-p.z;g.keys.KeyA=dx<-.17;g.keys.KeyD=dx>.17;g.keys.KeyW=dz<-.19;g.keys.KeyS=dz>.19;}
    if(!p.charging&&p.swing<0)g.charge();if(p.charging&&g.releaseIn<p.getWindup(g.setup)+.003&&g.releaseIn>.04)g.release();
  }
}
const tiers=[];for(const time of [0,.18,.285,.295,.34]){const g=createGame();g.start(0);let released=false;for(let i=0;i<600;i++){if(g.ball.active&&!g.pointOver&&!released){if(!g.player.charging)g.charge();if(g.releaseIn<=time){g.release();released=true;}}g.fixed(R.FIXED);if(g.stats.hits||g.pointOver)break;}tiers.push({time,tier:g.lastShot?.timing||'Miss',gap:g.lastShot?.gap});}
detail.timing=tiers;
test('Production contact code yields Perfect/Good/Early/Late/Miss',()=>assert.equal(new Set(tiers.map(t=>t.tier)).size,5));
test('All accepted contacts have geometric gap within ball radius plus thickness',()=>assert(tiers.every(t=>t.gap===undefined||t.gap<=R.BALL_R+.012)));
test('Without Space input there are no automatic returns',()=>{const g=createGame();g.start();for(let i=0;i<2400;i++)g.fixed(R.FIXED);assert.equal(g.stats.hits,0);assert(g.stats.errors>0);});
test('A ball outside reach is not sucked into the racket',()=>{const g=createGame();g.start();g.player.reset(4.8,8.2);for(let i=0;i<1200;i++){policy(g);g.fixed(R.FIXED);}assert.equal(g.stats.hits,0);});
test('Ready stance changes hands before commitment and locks after release',()=>{const g=createGame();g.start();g.ball.active=true;g.ball.p.set(-.8,1,2);g.ball.v.set(0,0,9);g.charge();g.fixed(R.FIXED);assert.equal(g.player.hand,-1);g.release();g.ball.p.x=2;g.fixed(R.FIXED);assert.equal(g.player.hand,-1);});
const drills=[];for(let d=0;d<7;d++){const g=createGame();g.start(d);g.mouseAim=d===2;const hands={},types={};for(let i=0;i<120*80&&!g.levelOver;i++){g.mouseX=g.targetX;policy(g,d===3||d===6);const h=g.stats.hits;g.fixed(R.FIXED);if(g.stats.hits>h){hands[g.lastShot.hand]=(hands[g.lastShot.hand]||0)+1;types[g.lastShot.type]=(types[g.lastShot.type]||0)+1;}}drills.push({drill:d,completed:g.completed,goal:R.DRILLS[d].goal,stats:g.stats,hands,types,aiContacts:g.lastContactDiagnostics.filter(c=>c.who===2).length,levelOver:g.levelOver,validContacts:g.lastContactDiagnostics.every(c=>c.gap<=R.BALL_R+.012)});}
detail.drills=drills;
for(const d of drills)test(`Drill ${d.drill}: new motion timing can complete its goal in the logic harness`,()=>assert(d.completed>=d.goal));
test('Both forehand and backhand return real simulated feeds',()=>assert(drills[0].hands[1]>0&&drills[0].hands[-1]>0));
test('Training partner sustains a rally using the new swing timings',()=>assert(drills[1].stats.bestRally>=8&&drills[1].aiContacts>=4));
test('Net and high-point drills choose volley and overhead without extra keys',()=>assert(drills[4].types.volley>0&&drills[5].types.smash>0));
test('Every drill retains swept racket contact constraints',()=>assert(drills.every(d=>d.validContacts)));
let g=createGame();g.start(0,true);const points=[];let old=0;for(let i=0;i<120*330&&!g.matchOver;i++){policy(g);g.fixed(R.FIXED);if(g.scoreP+g.scoreAI!==old){points.push([g.scoreP,g.scoreAI]);old=g.scoreP+g.scoreAI;}}
detail.match={completed:g.matchOver,score:[g.scoreP,g.scoreAI],points,stats:g.stats,time:g.clock};
test('A match finishes through actual rules and contacts, without injecting score',()=>assert(g.matchOver&&Math.max(g.scoreP,g.scoreAI)>=7&&Math.abs(g.scoreP-g.scoreAI)>=2));
test('Match includes player serve contact, not only service faults',()=>assert(g.stats.hits>3&&g.lastContactDiagnostics.some(d=>d.who===1)));
g=createGame();g.enterInspection('forehand');let cycles=0,previous=-1;for(let i=0;i<700;i++){g.inspectTick(.04);if(previous<0&&g.player.swing>=0)cycles++;previous=g.player.swing;}
test('Slow-motion inspector loops completed swings rather than freezing after one',()=>assert(cycles>=3));
g=createGame();g.start();for(let i=0;i<210;i++)g.fixed(R.FIXED);const p=g.ball.p.copy?new R.V().copy(g.ball.p):null;g.paused=true;for(let i=0;i<120;i++)g.fixed(R.FIXED);
test('Pausing for tuning does not advance the ball',()=>assert.equal(p.dist(g.ball.p),0));
fs.writeFileSync(path.join(__dirname,'game-results.json'),JSON.stringify({scope:'Non-rendering production Game fixed loop with no-op World/audio. HumanRig/asset loading/rendering NOT validated.',passed:cases.length,cases,detail},null,2));
console.log(`${cases.length} game logic checks passed. No rendering claims.`);
