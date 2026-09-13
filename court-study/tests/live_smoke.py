"""Real requestAnimationFrame smoke test. Uses actual built HTML, no fixed-clock stub.
Local Chromium/Playwright/Xvfb required; software-renderer timing is not phone FPS.
"""
from pathlib import Path
import hashlib, json, os, time
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
report = {'htmlSHA256': hashlib.sha256((ROOT/'index.html').read_bytes()).hexdigest(),
          'method': 'Headed Chromium / SwiftShader / real requestAnimationFrame loop; built HTML injected into a blank page.',
          'checks': [], 'errors': [], 'requests': [], 'consoleErrors': []}
def check(name, value, detail=None):
    report['checks'].append({'name': name, 'passed': bool(value), 'detail': detail})
    print(('PASS ' if value else 'FAIL ') + name, flush=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'), headless=False,
      args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 640, 'height': 420}, device_scale_factor=1)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('request', lambda r: report['requests'].append(r.url))
    page.on('console', lambda m: report['consoleErrors'].append(m.text) if m.type == 'error' else None)
    page.set_content((ROOT/'index.html').read_text(), wait_until='load', timeout=60000)
    page.wait_for_function('window.__court?.ready || window.__courtError', timeout=60000)
    check('Real-loop boot', page.evaluate('!!window.__court?.ready'), page.evaluate('window.__courtError || null'))
    if not page.evaluate('!!window.__court?.ready'):
        (ROOT/'artifacts/live-smoke.json').write_text(json.dumps(report, indent=2))
        raise SystemExit(1)
    page.evaluate("window.__court.setSetting('quality','eco');window.__court.startDemo()")
    t0 = page.evaluate('window.__court.telemetry()'); wall = time.monotonic()
    deadline = time.monotonic() + 70
    while time.monotonic() < deadline:
        current = page.evaluate('window.__court.telemetry()')
        if current['stats']['returns'] >= 1 and current['simTime'] > 3: break
        page.wait_for_timeout(500)
    live = page.evaluate('window.__court.telemetry()'); report['wallSeconds'] = round(time.monotonic()-wall, 3)
    report['live'] = live
    check('Real animation loop advances clock', live['simTime'] > t0['simTime'] + 2, {'simulationSeconds': live['simTime']-t0['simTime'], 'wallSeconds': report['wallSeconds']})
    check('Live demo feeds and returns a ball', live['stats']['feeds'] >= 1 and live['stats']['returns'] >= 1, {'feeds': live['stats']['feeds'], 'returns': live['stats']['returns']})
    page.keyboard.press('KeyP'); a = page.evaluate('window.__court.telemetry()')
    page.wait_for_timeout(600); b = page.evaluate('window.__court.telemetry()')
    check('Live pause holds the clock', a['paused'] and a['simTime'] == b['simTime'])
    page.keyboard.press('KeyP'); page.wait_for_timeout(1000); c = page.evaluate('window.__court.telemetry()')
    check('Live resume advances the clock', not c['paused'] and c['simTime'] > b['simTime'])
    check('No outbound resource requests', not report['requests'], report['requests'])
    check('No uncaught JavaScript errors', not report['errors'], report['errors'])
    check('No WebGL / shader console errors', not report['consoleErrors'], report['consoleErrors'])
    report['passed'] = all(c['passed'] for c in report['checks']); report['browserVersion'] = browser.version
    (ROOT/'artifacts/live-smoke.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
print('OVERALL', report['passed'], flush=True)
if not report['passed']: raise SystemExit(1)
