"""Real MV3 host: opt-in plugin source, sandbox, save/flush/reload and CSP."""
import argparse,json,tempfile,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--widgets',type=Path,default=ROOT/'tests/fixtures/plugin-source');args=parser.parse_args()
catalog=json.loads((args.widgets/'index.json').read_text(encoding='utf-8'))
OUT=ROOT/'test-results/extension';OUT.mkdir(parents=True,exist_ok=True)
requests=[];errors=[]
def external(route):
 url=route.request.url
 if url.startswith('https://ktclat.github.io/qiye-widgets/'):
  requests.append(url);path=args.widgets/url.split('/qiye-widgets/',1)[1].split('?')[0]
  return route.fulfill(path=str(path),headers={'Access-Control-Allow-Origin':'*'})
 return route.fulfill(status=200,content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'})
with tempfile.TemporaryDirectory(prefix='qiye-mv3-') as profile,sync_playwright() as pw:
 context=pw.chromium.launch_persistent_context(profile,channel='chromium',headless=True,locale='zh-CN',viewport={'width':1440,'height':960},args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'])
 context.route('https://**/*',external)
 worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=20000)
 extension_id=worker.url.split('/')[2];page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(f'chrome-extension://{extension_id}/index.html');page.locator('#desktop .tile-link').first.wait_for()
  assert page.locator('#desktop .tile-widget').count()==0 and not requests
  manifest=page.evaluate('chrome.runtime.getManifest()');assert manifest['version']==json.loads((ROOT/'manifest.json').read_text())['version']
  page.locator('#engine-button').click();page.locator('#engine-menu [data-engine=google]').click()
  page.wait_for_function("async()=> (await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']?.settings.searchEngine==='google'")
  page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click();assert page.locator('[data-source-toggle]').first.get_attribute('aria-checked')=='false'
  page.locator('[data-source-toggle]').first.click();page.wait_for_function("n=>document.querySelectorAll('[data-community-card]').length===n",arg=len(catalog['widgets']))
  page.locator('[data-community-query]').fill('便签');page.locator('[data-community-add]').click();page.locator('#dialog [data-close]').first.click()
  page.locator('#desktop iframe[data-ready=true]').wait_for();card=page.frame_locator('#desktop iframe')
  assert card.locator('body').evaluate('()=>{try{void parent.document;return false}catch{return true}}')
  card.locator('[data-widget-input=notes]').fill('MV3 independent widget')
  page.wait_for_function("async()=> (await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5'].items.some(i=>i.widget==='community'&&i.data.value.includes('MV3 independent widget'))")
  card.locator('[data-action=widget-open]').first.click();page.locator('#dialog iframe[data-ready=true]').wait_for()
  page.frame_locator('#dialog iframe').locator('[data-close]').first.click();expect(page.locator('#dialog')).not_to_be_visible()
  page.reload();page.locator('#desktop iframe[data-ready=true]').wait_for();assert page.frame_locator('#desktop iframe').locator('[data-widget-input=notes]').input_value()=='MV3 independent widget'
  page.screenshot(path=str(OUT/'mv3-widgets.png'))
  assert not errors,errors
  print('PASS real MV3: blank defaults, disabled public source, no unnecessary host permission, isolated remote frame, chrome.storage save, close flush, reload, search and manifest')
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'));print('ERRORS',errors,'REQUESTS',requests,flush=True);print(page.locator('body').inner_text()[-3500:],flush=True);raise
 finally:context.close()
