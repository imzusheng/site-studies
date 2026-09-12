"""Capture production poses and a slow-motion swing strip. No synthetic backgrounds.
Run after npm run build: xvfb-run -a python tests/capture-motion.py
"""
import io,json,shutil,time,argparse
ap=argparse.ArgumentParser();ap.add_argument("--gif",action="store_true");opt=ap.parse_args()
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/browser-evidence'
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1120,'height':840},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<script>window.requestAnimationFrame=()=>0;</script>'+(ROOT/'dist/index.html').read_text(),wait_until='load');page.wait_for_function('window.__rally?.assetsReady',polling=100)
 page.add_style_tag(content='body > :not(canvas){visibility:hidden!important} #court{visibility:visible!important}')
 frames=[];sheet=Image.new('RGB',(1600,1280),(18,26,23));draw=ImageDraw.Draw(sheet)
 for r,motion in enumerate(['forehand','backhand']):
  for c,stage in enumerate(['ready','load','contact','follow']):
   page.evaluate('''([motion,stage])=>{const g=__rally;g.enterInspection(motion);g.inspectFrame(stage);g.inspectAngle=2.3;g.world.update(g,.016)}''',[motion,stage])
   im=Image.open(io.BytesIO(page.screenshot(timeout=5000,animations="disabled"))).convert('RGB').crop((310,125,810,840)).resize((400,572))
   sheet.paste(im,(c*400,r*640+42));draw.text((c*400+14,r*640+13),f'{motion.upper()} / {stage.upper()}',font=font,fill=(221,231,221))
 sheet.save(OUT/'motion-contact-sheet.jpg',quality=90)
 if not opt.gif:
  b.close();raise SystemExit(0)
 page.evaluate("__rally.enterInspection('forehand');__rally.inspectAngle=2.3;__rally.inspectSpeed=1")
 for i in range(16):
  print('frame',i,flush=True)
  page.evaluate('''()=>{for(let k=0;k<16;k++)__rally.inspectTick(1/120);__rally.world.update(__rally,1/30)}''')
  im=Image.open(io.BytesIO(page.screenshot(timeout=5000,animations="disabled"))).convert('RGB').crop((270,125,850,805)).resize((464,544))
  ImageDraw.Draw(im).text((14,15),'ACTUAL WEBGL / 0.5x',font=font,fill='white');frames.append(im)
 frames[0].save(OUT/'forehand-motion.gif',save_all=True,append_images=frames[1:],duration=267,loop=0,optimize=True)
 assert not errors,errors;b.close()
 # Real requestAnimationFrame smoke test, without manual scheduler replacement.
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':960,'height':720},device_scale_factor=1);errs=[];requests=[]
 page.on('pageerror',lambda e:errs.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.set_content((ROOT/'dist/index.html').read_text(),wait_until='load');page.wait_for_function('window.__rally?.assetsReady',polling=100)
 page.evaluate("window.losses=0;document.getElementById('court').addEventListener('webglcontextlost',()=>losses++);__rally.sound.enabled=false;__rally.enterInspection('forehand')")
 start=time.monotonic();page.wait_for_timeout(12000)
 result=page.evaluate('({contextLosses:losses,clock:__rally.clock,motionPhase:__rally.player.actionPhase})');result.update(wallSeconds=round(time.monotonic()-start,2),pageErrors=errs,requests=requests)
 (OUT/'raf-smoke.json').write_text(json.dumps(result,indent=2));assert not errs and not requests and result['contextLosses']==0,result
 print(result);b.close()
