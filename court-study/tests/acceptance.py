"""Deterministic acceptance of the built HTML in headed Chromium/SwiftShader.
Run with xvfb-run -a python tests/acceptance.py. No network dependency at runtime.
This is browser emulation, not real mobile/GPU performance certification.
"""
from pathlib import Path
import hashlib, json, os, time
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT/'index.html').read_text().replace('<head>', '<head><script>window.requestAnimationFrame=()=>0;</script>')
OUT = ROOT/'artifacts'; OUT.mkdir(exist_ok=True)
report = {'htmlSHA256': hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest(), 'method': 'Built self-contained HTML injected into blank pages; headed Chromium using SwiftShader; 120 Hz deterministic simulation. Desktop and touch viewports are emulated, not real-device performance tests.', 'checks': [], 'errors': [], 'requests': [], 'consoleErrors': []}
def check(name, condition, detail=None):
    report['checks'].append({'name': name, 'passed': bool(condition), 'detail': detail})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    (OUT/'browser-acceptance.partial.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
def ev(p, js, arg=None): return p.evaluate(js, arg)
def snap(p, name):
    p.wait_for_timeout(300); p.screenshot(path=str(OUT/name), timeout=45000)
def attach(p):
    p.on('pageerror', lambda e: report['errors'].append(str(e)))
    p.on('request', lambda r: report['requests'].append(r.url))
    p.on('console',lambda msg: report['consoleErrors'].append(msg.text) if msg.type=='error' else None)
def boot(p):
    attach(p); p.set_content(HTML, wait_until='load', timeout=45000)
    p.wait_for_function('window.__court?.ready || window.__courtError', timeout=45000)
    if ev(p,'window.__courtError||null'): raise RuntimeError(ev(p,'window.__courtError'))
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH','/usr/bin/chromium'), headless=False, args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
    p = browser.new_page(viewport={'width':1440,'height':960}, device_scale_factor=1); p.set_default_timeout(15000); boot(p)
    check('Offline boot succeeds', ev(p,'window.__court.ready'))
    r = ev(p,'window.__court.inspectRig()'); report['rig']=r
    check('18 bones, normalized finite skinning and hand socket',r['bones']==18 and r['meshes']>0 and r['maxWeightError']<1e-5 and r['finite'] and r['socketAttached'],r)
    snap(p,'release-home.png')
    for kind,interval,contact in [('forehand',(1.65,3.4),2.835),('forehandReach',(1.72,3.4),2.835),('backhand',(.15,1.8),1.17),('backhandSlice',(.15,1.8),1.17)]:
        finite = True
        for k in range(7):
            d = ev(p,'([kind,t])=>window.__court.seek(kind,t,false)',[kind,interval[0]+(interval[1]-interval[0])*k/6])
            finite &= ev(p,'window.__court.inspectRig().finite')
        ev(p,'([kind,t])=>window.__court.seek(kind,t)',[kind,contact]); snap(p,f'release-{kind}.png')
        check(kind+' seven-pose finite rig / selection',finite and d['motion']['kind']==kind)
    p.locator('#skeletonToggle').check();p.locator('#wireToggle').check();ev(p,'window.__court.step(.05)')
    check('Motion studio diagnostic toggles',p.locator('#skeletonToggle').is_checked() and p.locator('#wireToggle').is_checked())
    p.locator('#skeletonToggle').uncheck();p.locator('#wireToggle').uncheck()
    p.locator('#slowBtn').click();check('Slow-motion speed cycles',p.locator('#slowBtn').inner_text()=='1×')
    ev(p,"window.__court.startDemo();window.__court.setAssist(true)"); d=ev(p,'window.__court.step(120)');report['rallySimulation120s']=d
    check('120 simulated seconds yields >=25 valid returns',d['stats']['returns']>=25,d['stats']['returns'])
    check('Base forehand and backhand execute',{'forehand','backhand'}.issubset(set(d['stats']['shotKinds'])),sorted(set(d['stats']['shotKinds'])))
    check('Assisted hit error stays inside reach volume',max(d['stats']['contactErrors'],default=999)<.62, max(d['stats']['contactErrors'],default=999))
    check('Original court landing logic still active',d['stats']['in']>0 and d['stats']['feeds']>25)
    ev(p,'window.__court.render()');snap(p,'release-rally.png')
    # Save game state, then replay the last hit without advancing gameplay.
    before=ev(p,'window.__court.telemetry()');started=ev(p,'window.__court.startReplay()');during=ev(p,'window.__court.step(.45)')
    check('Last-shot replay is available',started and during['replay'] and during['replayFrameCount']>=6,during['replayFrameCount'])
    check('Replay freezes gameplay clock and counters',during['simTime']==before['simTime'] and during['stats']==before['stats'])
    p.keyboard.down('Space');blocked=ev(p,'window.__court.telemetry()');p.keyboard.up('Space')
    check('Replay blocks gameplay charge',not blocked['input']['held'])
    snap(p,'release-replay.png');p.keyboard.press('Escape');after=ev(p,'window.__court.telemetry()')
    check('Replay restores live pose/ball state',not after['replay'] and after['actor']==before['actor'] and after['ball']==before['ball'] and after['simTime']==before['simTime'])
    check('Play continues after replay',ev(p,'window.__court.step(.1).simTime')>after['simTime'])
    # About temporarily pauses, Escape closes, an existing pause remains paused.
    p.locator('#assetsTab').click();before=ev(p,'window.__court.telemetry()');after=ev(p,'window.__court.step(.5)')
    check('About pauses play without consuming simulation',p.locator('#assetsDialog').is_visible() and before['simTime']==after['simTime'])
    check('Credits collected only in About',ev(p,"[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&e.textContent.includes('CC BY-SA')&&!e.closest('#assetsDialog')&&e.tagName!=='SCRIPT'&&e.tagName!=='STYLE').length===0"))
    p.keyboard.press('Escape');p.wait_for_timeout(250);check('About close resumes prior running state',not ev(p,'window.__court.telemetry().paused'))
    p.keyboard.press('KeyP');p.locator('#assetsTab').click();p.locator('#closeAssets').click();p.wait_for_timeout(250)
    check('About preserves explicit prior pause',ev(p,'window.__court.telemetry().paused'))
    p.keyboard.press('KeyP')
    # Settings are functional and don't consume the in-flight rally.
    p.locator('#settingsBtn').click();p.locator('[data-light="evening"]').click();p.locator('[data-outfit="cypress"]').click();p.locator('[data-quality="eco"]').click();p.locator('#effectsToggle').uncheck();p.locator('#closeSettings').click();p.wait_for_timeout(250);ev(p,'window.__court.render()');d=ev(p,'window.__court.telemetry()')
    check('Lighting, costume and quality switches work',d['settings']['light']=='evening' and d['settings']['outfit']=='cypress' and d['settings']['quality']=='eco' and not d['settings']['effects'])
    snap(p,'release-evening.png');p.locator('#soundBtn').click();p.wait_for_timeout(150);check('Audio toggle accepts a user gesture',p.locator('#soundBtn').get_attribute('aria-label')=='关闭声音');p.locator('#soundBtn').click();p.locator('#cameraBtn').click();check('Wide camera toggle',ev(p,'window.__court.telemetry().settings.camera')=='wide')
    ev(p,"window.__court.setSetting('light','day');window.__court.setSetting('quality','auto');window.__court.setSetting('outfit','ivory');window.__court.setSetting('camera','follow');window.__court.setSetting('effects',true)")
    # Manual charge, hold, release; no autoplay when user controls the racket.
    ev(p,'window.__court.startPractice();window.__court.setAssist(true);window.__court.step(1.05)')
    p.keyboard.down('Space');d=ev(p,'window.__court.step(.65)');d2=ev(p,'window.__court.step(.08)');check('Full charge stays held',d['input']['power']==1 and d2['input']['power']==1 and d2['input']['held'])
    p.keyboard.up('Space');check('Release queues the shot',ev(p,'window.__court.telemetry().input.queued'))
    d=ev(p,'window.__court.step(1.5)');check('Manual release produces a hit',d['stats']['returns']>0,d['stats']['returns'])
    ev(p,'window.__court.startPractice();window.__court.setAssist(false)');before=ev(p,'window.__court.telemetry().actor');p.keyboard.down('KeyA');d=ev(p,'window.__court.step(.25)');p.keyboard.up('KeyA');check('WASD moves player',d['actor'][0]<before[0]-.5)
    d=ev(p,'window.__court.step(4)');check('No hidden auto-hit in manual mode',d['stats']['returns']==0 and d['stats']['misses']>=1)
    # Target scoring: real landing events while aiming at the actual target.
    ev(p,"window.__court.setGameMode('target');window.__court.startDemo();window.__court.setAssist(true)")
    for i in range(30): ev(p,'(()=>{const t=window.__court.telemetry().target;window.__court.aimAt(t[0],t[2]);return window.__court.step(1.5,false)})()')
    ev(p,'window.__court.render()')
    d=ev(p,'window.__court.telemetry()');report['targetSimulation45s']=d
    check('Target mode can score through normal ballistic landings',d['challenge']['score']>0 and d['challenge']['targetHits']>0,d['challenge'])
    snap(p,'release-target.png')
    # Endurance drains precisely three lives and cannot be unpaused after game-over.
    ev(p,"window.__court.setGameMode('endurance');window.__court.startPractice();window.__court.setAssist(true)");d=ev(p,'window.__court.step(20)');before=d['simTime'];p.keyboard.press('KeyP');after=ev(p,'window.__court.step(1)')
    check('Endurance game-over is terminal until restart',d['challenge']['lives']==0 and after['gameOver'] and after['paused'] and after['simTime']==before,d['challenge'])
    p.keyboard.press('KeyR');d=ev(p,'window.__court.telemetry()');check('Restart restores three lives',d['challenge']['lives']==3 and not d['gameOver'] and not d['paused'])
    ev(p,"window.__court.setGameMode('endurance');window.__court.startDemo()");d=ev(p,'window.__court.step(100)');report['enduranceDemo100s']=d
    check('Endurance includes slice variant and can return',d['stats']['returns']>=20 and 'backhandSlice' in d['stats']['shotKinds'],{'returns':d['stats']['returns'],'kinds':sorted(set(d['stats']['shotKinds']))})
    # Mobile emulation. Cover home, touch gameplay, studio and About.
    for width,height in [(390,844),(844,390),(768,1024)]:
        ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=True,is_mobile=True)
        mob=ctx.new_page();boot(mob);snap(mob,f'release-home-{width}x{height}.png')
        ev(mob,'window.__court.startPractice();window.__court.step(1.05)');snap(mob,f'release-play-{width}x{height}.png')
        layout=ev(mob,"""()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,controls:['hitButton','joystick','modeTargetBtn','modeEnduranceBtn','assetsTab'].map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height,visible:!!el.checkVisibility?.()}})})""")
        check(f'{width}x{height} layout fits viewport',layout['scroll']<=width and all(c['x']>=0 and c['x']+c['w']<=width+1 and c['y']>=0 and c['y']+c['h']<=height+1 and c['visible'] for c in layout['controls']),layout)
        # Real pointer events, not test-only direct calls, drive touch charge and joystick.
        hit=mob.locator('#hitButton').bounding_box();mob.touchscreen.tap(hit['x']+hit['width']/2,hit['y']+hit['height']/2)
        check(f'{width}x{height} touch HIT queues a shot',ev(mob,'window.__court.telemetry().input.queued'))
        ev(mob,"window.__court.seek('backhand',1.17)");snap(mob,f'release-studio-{width}x{height}.png')
        check(f'{width}x{height} studio has no horizontal overflow',ev(mob,'document.documentElement.scrollWidth')<=width)
        mob.locator('#assetsTab').click();check(f'{width}x{height} About remains usable',mob.locator('#assetsDialog').is_visible() and mob.locator('#closeAssets').is_visible());mob.locator('#closeAssets').click()
        ctx.close()
    check('No external runtime resource requests',len(report['requests'])==0,report['requests'])
    check('No uncaught JavaScript errors',len(report['errors'])==0,report['errors'])
    check('No shader/WebGL console errors',len(report['consoleErrors'])==0,report['consoleErrors'])
    report['browserVersion']=browser.version;report['passed']=all(c['passed'] for c in report['checks'])
    (OUT/'browser-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
print('OVERALL', report['passed'],flush=True)
if not report['passed']: raise SystemExit(1)
