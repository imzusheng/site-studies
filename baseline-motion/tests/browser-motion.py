"""Real Chromium + Three.js + production HumanRig verification.
Run: xvfb-run -a python tests/browser-motion.py --case rig
Install: python -m pip install playwright ; use system Chromium or --browser.
Manual fixed steps make inputs repeatable; no rendering/physics/rig substitutes.
"""
import argparse,json,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ap=argparse.ArgumentParser();ap.add_argument('--case',default='rig');ap.add_argument('--browser',default=shutil.which('chromium') or shutil.which('google-chrome'));args=ap.parse_args()
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests'/'browser-evidence';OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=args.browser,headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1280,'height':900},device_scale_factor=1)
 errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.set_content('<script>window.requestAnimationFrame=()=>0;</script>'+ (ROOT/'dist/index.html').read_text(),wait_until='load')
 page.wait_for_function('window.__rally?.assetsReady',polling=100,timeout=25000)
 page.evaluate("__rally.sound.enabled=false;window.contextLosses=0;document.getElementById('court').addEventListener('webglcontextlost',()=>contextLosses++);")
 result={}
 if args.case=='rig':
  result=page.evaluate('''()=>{let g=__rally,a=g.player,rows=[],maxGap=0,maxJump=0,boneError=0,last=null;
    let skinBad=0,verts=0; a.visual.model.traverse(o=>{if(o.isSkinnedMesh){const w=o.geometry.attributes.skinWeight;for(let i=0;i<w.count;i++){let sum=w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i);if(!Number.isFinite(sum)||Math.abs(sum-1)>1e-5)skinBad++;verts++;}}});
    for(const motion of ['forehand','backhand'])for(const frame of ['ready','load','contact','follow']){
      g.enterInspection(motion);g.inspectFrame(frame);const d=a.visual.diagnostic;
      rows.push({motion,frame,handGap:d.handGap,leftHandGap:d.leftHandGap,correction:d.reachCorrection,elbow:d.elbowAngle});maxGap=Math.max(maxGap,d.handGap,d.leftHandGap);
    }
    for(const hand of [1,-1]){
      a.reset(0,6.5);a.hand=hand;a.charging=true;for(let i=0;i<85;i++)a.tick(1/120,g.setup);
      a.start(new __Rally.V(hand*.78,1.25,6.5-a.getContactDepth()),g.setup);last=null;
      for(let i=0;i<95;i++){
        a.tick(1/120,g.setup);const rig=a.visual,T=THREE,bs=rig.bones;
        const s=bs.rightarm.getWorldPosition(new T.Vector3()),e=bs.rightforearm.getWorldPosition(new T.Vector3()),w=bs.righthand.getWorldPosition(new T.Vector3());boneError=Math.max(boneError,Math.abs(s.distanceTo(e)-.295),Math.abs(e.distanceTo(w)-.265));
        maxGap=Math.max(maxGap,rig.diagnostic.handGap,rig.diagnostic.leftHandGap);
        const f=new T.Matrix4().makeBasis(new T.Vector3(a.racket.u.x,a.racket.u.y,a.racket.u.z),new T.Vector3(a.racket.v.x,a.racket.v.y,a.racket.v.z),new T.Vector3(a.racket.n.x,a.racket.n.y,a.racket.n.z));
        const relative=new T.Quaternion().setFromRotationMatrix(f).invert().multiply(bs.righthand.getWorldQuaternion(new T.Quaternion()));if(last)maxJump=Math.max(maxJump,relative.angleTo(last));last=relative;
      }
    }
    g.enterInspection('forehand');g.inspectFrame('contact');g.inspectAngle=2.3;g.world.update(g,.016);
    return {rows,maxGap,boneError,gripFrameDeviationRadians:maxJump,verticesChecked:verts,badWeights:skinBad,frameLength:__Rally.RACKET.length,bodyHeight:1.838,contextLosses};}''')
  assert result['maxGap']<.003,result
  assert result['boneError']<1e-6,result
  assert result['gripFrameDeviationRadians']<1e-5,result
  assert result['badWeights']==0,result
 elif args.case=='serves':
  result=page.evaluate('''()=>{let g=__rally,rows=[];for(const who of [1,2])for(let n=0;n<10;n++){g.start(0,true);g.player.charge=g.ai.charge=.7;g.serveToss(who);let hit=false;for(let i=0;i<140;i++){g.fixed(1/120);if(g.lastContactDiagnostics.some(d=>d.who===who)){hit=true;break;}if(g.pointOver)break;}rows.push({who,hit,gap:g.lastContactDiagnostics.at(-1)?.gap,handError:(who===1?g.player:g.ai).visual.diagnostic.handGap});}g.world.update(g,.016);return {rows,passed:rows.filter(r=>r.hit).length};}''')
  assert result['passed']==20,result
 elif args.case.startswith('drill'):
  drill=int(args.case[-1]); result=page.evaluate('''drill=>{let g=__rally;g.start(drill);let rows=[],old=0;for(let i=0;i<(drill===1?3000:1500)&&!g.levelOver;i++){const a=g.player,b=g.ball;g.wallTime=g.clock;for(const k of ['KeyA','KeyD','KeyW','KeyS'])g.keys[k]=false;
    if(b.active&&b.last!==1&&!g.pointOver&&!g.tossOwner){
      if((drill===1||drill===3||drill===6)&&g.interceptValid){const dx=g.interceptX-.73-a.x,dz=g.interceptZ+.8-a.z;g.keys.KeyA=dx<-.15;g.keys.KeyD=dx>.15;g.keys.KeyW=dz<-.18;g.keys.KeyS=dz>.18;}
      if(a.swing<0&&!a.charging)g.charge();if(a.charging&&g.releaseIn<a.getWindup(g.setup)&&g.releaseIn>.04)g.release();
    }g.fixed(1/120);if(g.stats.hits>old){rows.push({hand:a.hand,type:a.stroke,timing:g.lastShot.timing,gap:g.lastShot.gap,handError:a.visual.diagnostic.handGap});old=g.stats.hits;}}
    g.ui.update();g.world.update(g,.016);return {drill,rows,stats:g.stats,completed:g.completed,contacts:g.lastContactDiagnostics};}''',drill)
  assert result['stats']['hits']>0,result
 elif args.case=='input':
  page.locator('#start').click();page.keyboard.down('d');page.evaluate('for(let i=0;i<24;i++)__rally.fixed(1/120)');page.keyboard.up('d');x=page.evaluate('__rally.player.x');assert x>.5,x
  page.keyboard.down('Space');page.evaluate('for(let i=0;i<30;i++)__rally.fixed(1/120)');assert page.evaluate('__rally.player.charge')>.2
  page.keyboard.up('Space');assert page.evaluate('__rally.player.swing')>=0
  page.keyboard.down('Space');page.evaluate('for(let i=0;i<85;i++)__rally.fixed(1/120)');queued=page.evaluate('__rally.player.charging');assert queued
  page.keyboard.up('Space');page.keyboard.down('Shift');page.keyboard.up('Shift');assert page.evaluate('__rally.player.dashCooldown')>0
  page.keyboard.press('Escape');assert page.evaluate('__rally.paused')
  page.keyboard.press('Escape');assert not page.evaluate('__rally.paused')
  page.keyboard.press('v');page.locator('[data-frame=contact]').click();assert page.evaluate('__rally.inspectFrozen')
  result={'realKeyboardMovement':x,'heldSpaceQueuesAfterFollowThrough':queued,'swingOnRelease':True,'dash':True,'pauseResume':True,'frameInspector':True};page.evaluate('__rally.world.update(__rally,.016)')
 else: raise ValueError(args.case)
 page.screenshot(path=str(OUT/(args.case+'.png')))
 result['pageErrors']=errors;result['requests']=requests;result['contextLosses']=page.evaluate('contextLosses');result['renderer']=page.evaluate('({draws:__rally.world.r.threeRenderer.info.render.calls,triangles:__rally.world.r.threeRenderer.info.render.triangles})')
 (OUT/(args.case+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps(result,ensure_ascii=False))
 assert not errors,errors
 assert not requests,requests
 assert result['contextLosses']==0
 browser.close()
