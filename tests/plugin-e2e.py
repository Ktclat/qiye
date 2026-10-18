#!/usr/bin/env python3
"""Real cross-origin plugin protocol against source and standalone shell builds."""
from pathlib import Path
import argparse,json,threading,os
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--widgets',type=Path,default=ROOT/'tests/fixtures/plugin-source');parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/plugins'/('fixture' if args.widgets==ROOT/'tests/fixtures/plugin-source' else 'integration')/('preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
catalog=json.loads((args.widgets/'index.json').read_text(encoding='utf-8'))
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
requests=[]
def route_external(route):
 url=route.request.url
 if url.startswith('https://ktclat.github.io/qiye-widgets/'):
  requests.append(url)
  path=args.widgets/url.split('/qiye-widgets/',1)[1].split('?')[0]
  return route.fulfill(path=str(path),headers={'Access-Control-Allow-Origin':'*'})
 return route.fulfill(status=200,content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'})
with sync_playwright() as pw:
 browser=pw.chromium.launch(args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':960},locale='zh-CN',timezone_id='Asia/Hong_Kong')
 context.route('https://**/*',route_external)
 page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('console',lambda message:print('BROWSER',message.text,flush=True) if message.type=='error' else None)
 page.goto(base+('/Qiye-preview.html' if args.preview else '/'))
 page.locator('#desktop .tile-link').first.wait_for()
 assert page.locator('#desktop .tile-widget').count()==0
 assert not requests,requests
 page.locator('#brand-button').click();page.locator('[data-settings-tab="sources"]').click()
 page.locator('[data-source-toggle]').first.wait_for()
 assert page.locator('[data-source-toggle]').first.get_attribute('aria-checked')=='false'
 assert not requests,requests
 page.screenshot(path=str(OUT/'sources-disabled.png'))
 page.locator('[data-source-toggle]').first.click()
 page.wait_for_function("count=>document.querySelectorAll('[data-community-card]').length===count",arg=len(catalog['widgets']))
 assert len(requests)==1,requests
 page.locator('[data-community-query]').fill('便签')
 page.locator('[data-community-add]').click()
 page.locator('#dialog [data-close]').first.click()
 try:page.locator('#desktop iframe[data-ready="true"]').wait_for()
 except Exception:
  print('PAGE ERRORS',errors,'REQUESTS',requests,flush=True)
  print(page.locator('#desktop').inner_text(),flush=True)
  page.screenshot(path=str(OUT/'failure.png'))
  raise
 card=page.frame_locator('#desktop iframe')
 assert card.locator('body').evaluate("()=>document.featurePolicy.allowsFeature('clipboard-write')&&!document.featurePolicy.allowsFeature('clipboard-read')")
 card.locator('[data-widget-input="notes"]').fill('分仓后的独立数据 🪴')
 page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5')).items.some(i=>i.widget==='community'&&i.data.value.includes('分仓后的独立数据'))")
 card.locator('[data-action="widget-open"]').first.click()
 page.locator('#dialog iframe[data-ready="true"]').wait_for()
 workspace=page.frame_locator('#dialog iframe')
 assert '分仓后的独立数据' in workspace.locator('body').inner_text() or workspace.locator('textarea').first.input_value()=='分仓后的独立数据 🪴'
 page.screenshot(path=str(OUT/'notes-window-dark.png'))
 workspace.locator('[data-close]').first.click()
 page.wait_for_function("!document.querySelector('#dialog').open")
 # A broken plugin cannot trap the user in its window; confirmed data stays intact.
 card.locator('[data-action="widget-open"]').first.click();page.locator('#dialog iframe[data-ready=true]').wait_for()
 page.frame_locator('#dialog iframe').locator('body').evaluate("()=>{if(window.qiyeBridge)qiyeBridge.flush=async()=>{throw Error('Test save failure')};else window.rejectFlush=true;}")
 page.locator('#dialog').press('Escape');page.locator('[data-plugin-force-close]').wait_for();page.locator('[data-plugin-force-close]').click()
 page.wait_for_function("!document.querySelector('#dialog').open")
 page.reload();page.locator('#desktop iframe[data-ready="true"]').wait_for()
 assert page.frame_locator('#desktop iframe').locator('[data-widget-input="notes"]').input_value()=='分仓后的独立数据 🪴'
 # Theme changes and adding a sibling must retain an existing editor's frame.
 page.locator('#desktop iframe').evaluate("frame=>frame.dataset.retained='yes'")
 page.locator('#brand-button').click();page.locator('[data-settings-tab=appearance]').click();page.locator('button[data-theme=light]').click()
 page.locator('[data-settings-tab=sources]').click();page.locator('[data-community-query]').fill('便签');page.locator('[data-community-add]').click()
 page.locator('#dialog [data-close]').first.click();page.wait_for_function("document.querySelectorAll('#desktop iframe[data-ready=true]').length===2")
 assert page.locator('#desktop iframe[data-retained=yes]').count()==1
 # A source switch stops existing frames without deleting their data.
 page.locator('#brand-button').click();page.locator('[data-settings-tab="sources"]').click();page.locator('[data-source-toggle]').first.click()
 assert page.locator('#desktop iframe').count()==0
 assert page.evaluate("JSON.parse(localStorage.getItem('qiye.state.v5')).items.find(i=>i.widget==='community').data.value").find('分仓后的独立数据')>=0
 page.reload();assert page.locator('#desktop iframe').count()==0
 # Both theme and narrow settings remain usable with the source disabled.
 page.locator('#brand-button').click();page.locator('[data-settings-tab="appearance"]').click();page.locator('button[data-theme="light"]').click()
 page.locator('[data-settings-tab="sources"]').click();page.set_viewport_size({'width':390,'height':844})
 page.screenshot(path=str(OUT/'sources-narrow-light.png'))
 assert page.locator('[data-source-toggle]').first.is_visible()
 if args.widgets!=ROOT/'tests/fixtures/plugin-source':
  # An installed pre-split desktop remains dormant until the source is enabled.
  legacy=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
  note=next(item for item in legacy['items'] if item.get('widget')=='notes');note['data']['notes']='旧桌面保留的内容';legacy['items']=[note];legacy['activeGroupId']=note['groupId']
  page.set_viewport_size({'width':1440,'height':960})
  page.evaluate("s=>{localStorage.clear();localStorage.setItem('qiye.state.v5',JSON.stringify(s));}",legacy);page.reload()
  assert page.locator('#desktop iframe').count()==0
  page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click();page.locator('[data-source-toggle]').first.click()
  page.locator('#dialog [data-close]').first.click();page.locator('#desktop iframe[data-ready=true]').wait_for()
  assert page.frame_locator('#desktop iframe').locator('[data-widget-input=notes]').input_value()=='旧桌面保留的内容'
  page.frame_locator('#desktop iframe').locator('[data-widget-input=notes]').fill('旧桌面首次保存后独立运行')
  page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5')).items[0].widget==='community'")
  converted=page.evaluate("JSON.parse(localStorage.getItem('qiye.state.v5')).items[0]")
  assert converted['id']==note['id'] and converted['config']['manifest']['id']=='qiye.notes'
  assert '旧桌面首次保存后独立运行' in converted['data']['value']
  print('PASS: existing desktop keeps data and migrates only on first successful plugin save',flush=True)
 assert not errors,errors
 browser.close()
server.shutdown()
print('PASS: blank shell, disabled source, explicit enable, add, isolated card/window, save/reload, disable/reload, light/narrow',flush=True)
