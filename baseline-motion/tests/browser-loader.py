"""Only tests dependency-failure UX in a real browser. Never substitutes a renderer/model."""
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
cases=[]
def check(name,condition):
    assert condition,name
    cases.append(name)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    failures=[];requests=[]
    page.on('pageerror',lambda error:failures.append(str(error)))
    def block(route):
        requests.append(route.request.url)
        route.abort()
    page.route('https://**/*',block)
    page.set_content((ROOT/'dist/baseline-motion.html').read_text(),wait_until='domcontentloaded')
    page.wait_for_selector('#asset-loading.failed',timeout=5000)
    check('Unavailable CDNs produce a visible error rather than a blank game',page.locator('#asset-loading').is_visible() and 'CDN' in page.locator('#asset-detail').inner_text())
    check('Loader attempts both configured engine origins',len(requests)==2)
    check('Retry action remains available after dependency failure',page.locator('#asset-retry').is_visible())
    check('No primitive renderer or auto-started game replaces the missing engine',page.evaluate('!window.__rally'))
    check('Loader failure is handled without an uncaught exception',not failures)
    for width,height in [(1440,900),(1280,720)]:
        page.set_viewport_size({'width':width,'height':height})
        box=page.locator('#asset-loading section').bounding_box()
        check(f'Error panel remains inside {width}x{height} viewport',box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height)
    report={'scope':'Browser dependency-failure UX ONLY. CDN requests intentionally blocked. No model, Three.js rendering or live gameplay visual verification.', 'browser':browser.version,'passed':len(cases),'cases':cases,'requests':requests,'uncaughtErrors':failures}
    (ROOT/'tests/browser-loader-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
    browser.close()
