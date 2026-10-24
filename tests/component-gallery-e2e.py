#!/usr/bin/env python3
"""Source drill-down, multi-source gallery, previews, rounded cards and delayed frames."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
import argparse,json,threading,copy
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--widgets',type=Path,default=ROOT/'tests/fixtures/plugin-source');parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/gallery'/('fixture' if args.widgets==ROOT/'tests/fixtures/plugin-source' else 'integration')/('preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
official=json.loads((args.widgets/'index.json').read_text(encoding='utf-8'));notes=next(m for m in official['widgets'] if m['id']=='qiye.notes')
customs={f'https://community-{i}.example.com/index.json':{'format':'qiye-widget-source','version':1,'name':name,'widgets':[{**notes,'name':'社区便签','author':name}]} for i,name in enumerate(['青柠工作室','长名称作者的实用组件收藏'])}
customs['https://community-1.example.com/index.json']['widgets'][0]['sizes']=['4x2','2x2','1x1','2x1','1x2']
calls=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
def fulfill(route):
 path=args.widgets/route.request.url.split('/qiye-widgets/',1)[1].split('?')[0]
 route.fulfill(path=str(path),headers={'Access-Control-Allow-Origin':'*'})
def route_external(route):
 url=route.request.url;calls.append(url)
 if url=='https://ktclat.github.io/qiye-widgets/index.json':return route.fulfill(json=official,headers={'Access-Control-Allow-Origin':'*'})
 if url in customs:return route.fulfill(json=customs[url],headers={'Access-Control-Allow-Origin':'*'})
 if url.startswith('https://ktclat.github.io/qiye-widgets/'):
  return fulfill(route)
 return route.fulfill(json={},headers={'Access-Control-Allow-Origin':'*'})
def check(name,ok=True):
 assert ok,name
 print('PASS',name,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch();context=browser.new_context(viewport={'width':1440,'height':960},locale='zh-CN',timezone_id='Asia/Hong_Kong');context.route('https://**/*',route_external)
 page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.goto(base+('/Qiye-preview.html' if args.preview else '/'));page.locator('#desktop .tile-link').first.wait_for()
  page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click()
  check('Settings label is 组件源',page.locator('[data-settings-tab=sources]').inner_text().strip()=='组件源')
  check('Source overview has no widget list or gallery',page.locator('[data-community-card],[data-source-widget],[data-community-query]').count()==0)
  check('Disabled sources do not load widget code',not any('/qiye-widgets/' in c for c in calls))
  page.locator('[data-source-toggle]').first.click();page.locator('[data-source-toggle][aria-checked=true]').wait_for()
  check('Enabling only fetches the catalog',len([c for c in calls if '/qiye-widgets/' in c])==1)
  for url in customs:
   page.locator('[data-community-source] input').fill(url);page.locator('[data-community-source] button').click();page.locator('.widget-source').filter(has_text=url).locator('[aria-checked=true]').wait_for()
  page.screenshot(path=str(OUT/'sources-dark.png'))
  page.locator('[data-source-details]').first.click();check('Widget management is scoped to source details',page.locator('[data-source-widget]').count()==len(official['widgets']))
  page.locator('[data-community-query]').fill('便签');page.locator('[data-source-widget]:visible summary').click();check('Permissions and version are in source details',page.locator('[data-source-widget]:visible').inner_text().find('v'+notes['release'])>=0)
  page.screenshot(path=str(OUT/'source-details-dark.png'));page.locator('[data-source-browse]').click()
  all_cards=page.locator('[data-community-card]:visible')
  page.locator('[data-community-category=all]').click();check('All subscribed sources appear',all_cards.count()==len(official['widgets'])+2)
  page.locator('[data-community-category=community]').click();check('Community aggregates only custom sources',all_cards.count()==2)
  check('Preferred wide card and legacy square defaults coexist',[all_cards.nth(i).get_attribute('data-preview-size') for i in range(2)]==['2x2','4x2'])
  page.get_by_role('button',name='青柠工作室',exact=True).first.click();check('Author/source filter selects one source',all_cards.count()==1)
  page.locator('[data-community-category=official]').focus();page.keyboard.press('Space');check('Keyboard can select the official source',all_cards.count()==len(official['widgets']))
  # First non-launcher size is the source's preferred presentation. Old catalogs
  # starting with 1x1 retain the previous 2x2 default.
  for i,manifest in enumerate(official['widgets']):
   expected='2x2' if manifest['sizes'][0]=='1x1' else manifest['sizes'][0]
   check('Source default size '+manifest['id'],all_cards.nth(i).get_attribute('data-preview-size')==expected)
  page.locator('[data-community-query]').fill('便签');card=all_cards.first
  page.locator('.community-preview iframe[data-ready=true]').wait_for()
  saved=page.evaluate("localStorage.getItem('qiye.state.v5')")
  for size in notes['sizes']:
   card.locator(f'[data-community-size="{size}"]').click();card.locator('iframe[data-ready=true]').wait_for()
   check('Live preview size '+size,card.get_attribute('data-preview-size')==size)
   frame=card.frame_locator('iframe');width,height=map(int,size.split('x'))
   actual=frame.locator('body').evaluate('()=>({w:innerWidth,h:innerHeight})')
   check('Native preview viewport '+size+' '+str(actual),actual=={'w':width*60+(width-1)*30,'h':height*60+(height-1)*30})
   if args.widgets!=ROOT/'tests/fixtures/plugin-source':
    check('Preview has no installed data or storage',frame.locator('body').evaluate("()=>qiyeBridge.init.environment.preview&&qiyeBridge.init.value==='null'&&Object.keys(qiyeBridge.init.storage).length===0"))
    check('Preview rejects attempted host write',frame.locator('body').evaluate("async()=>{try{await qiyeBridge.call('storage',{value:{secret:'bad'}});return false}catch{return true}}"))
  check('Preview never writes desktop state',page.evaluate("localStorage.getItem('qiye.state.v5')")==saved)
  page.screenshot(path=str(OUT/'preview-wide-dark.png'))
  card.locator('iframe').evaluate("f=>f.dataset.retained='yes'");card.locator('[data-community-add]').click();page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5'))?.items.some(i=>i.widget==='community'&&i.size==='4x2')")
  check('Add preserves preview and selected size',card.locator('iframe[data-retained=yes]').count()==1 and card.get_attribute('data-preview-size')=='4x2')
  card.locator('[data-community-add]').click();page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5'))?.items.filter(i=>i.widget==='community').length===2")
  page.locator('[data-community-query]').fill('');page.locator('[data-community-category=all]').click();page.wait_for_timeout(400)
  page.screenshot(path=str(OUT/'gallery-dark.png'))
  check('Gallery loads only visible previews',page.locator('.community-preview iframe').count()<len(official['widgets'])+2 or len(official['widgets'])<4)
  if len(official['widgets'])>4:
   saved=page.evaluate("localStorage.getItem('qiye.state.v5')")
   for index in range(all_cards.count()):
    visible=all_cards.nth(index);visible.scroll_into_view_if_needed();visible.locator('iframe[data-ready=true]').wait_for();page.wait_for_timeout(180)
   check('Every source widget previews without changing desktop data',page.evaluate("localStorage.getItem('qiye.state.v5')")==saved)
  page.locator('#dialog [data-close]').first.click();page.locator('#desktop iframe[data-ready=true]').first.wait_for()
  check('Closing gallery releases its frames',page.locator('.community-preview iframe').count()==0)
  check('Desktop cards retain 20px clipping',page.locator('#desktop .tile-widget .tile-body').first.evaluate("e=>getComputedStyle(e).borderRadius==='20px'&&getComputedStyle(e).overflow==='hidden'"))
  page.screenshot(path=str(OUT/'rounded-desktop-dark.png'))
  # The legacy fixture has no view-switch feature, but its window still shares
  # the downloaded bundle. Opening it must not request the document again.
  # Real cold/slow downloads are covered by widget-cache-e2e.
  page.evaluate("()=>{Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}});dispatchEvent(new Event('qiye:widget-sources-changed'));}")
  for theme in ['dark','light']:
   if theme=='light':
    page.locator('#brand-button').click();page.locator('[data-settings-tab=appearance]').click();page.locator('[data-theme=light]').click();page.locator('#dialog [data-close]').first.click()
   before=len(calls);page.frame_locator('#desktop iframe').first.locator('[data-action=widget-open]').first.click()
   page.locator('#dialog iframe[data-ready=true]').wait_for()
   check(theme+' cached window has no new resource requests',len(calls)==before)
   check('Ready frame replaces loading surface',page.locator('#dialog .plugin-loading').count()==0)
   page.screenshot(path=str(OUT/('cached-window-'+theme+'.png')))
   page.frame_locator('#dialog iframe').locator('[data-close]').first.click();expect(page.locator('#dialog')).not_to_be_visible()
  page.evaluate('delete navigator.connection')
  # Refreshing source metadata leaves installed data pinned until explicit update.
  page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click();page.locator('[data-source-details]').first.click()
  latest=next(m for m in official['widgets'] if m['id']=='qiye.notes');old=latest['release'];latest['release']='9.0.0'
  page.locator('[data-source-refresh]').click();page.locator('[data-community-update]').first.wait_for()
  check('Refreshing catalog does not update installed version',page.evaluate("JSON.parse(localStorage.getItem('qiye.state.v5')).items.find(i=>i.widget==='community').config.manifest.release")==old)
  page.locator('[data-community-update]').first.click();page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5')).items.filter(i=>i.widget==='community').every(i=>i.config.manifest.release==='9.0.0')")
  page.locator('[data-source-browse]').click();page.locator('[data-community-query]').fill('便签');page.wait_for_timeout(200);page.screenshot(path=str(OUT/'gallery-light.png'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'gallery-narrow-light.png'))
  check('Narrow gallery fits dialog',page.locator('#dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+2'))
  check('Title bar remains 46px',abs(page.locator('.add-header').bounding_box()['height']-46)<2)
  check('Narrow search and add remain reachable',page.locator('[data-community-query]').is_visible() and page.locator('[data-community-card]:visible [data-community-add]').first.is_visible())
  page.locator('[data-community-card]:visible iframe[data-ready=true]').first.wait_for()
  expect(page.locator('[data-community-card]:visible .community-preview').first).to_have_css('width','120px')
  check('Resizing uses the desktop native card dimensions',page.locator('[data-community-card]:visible .community-preview').first.evaluate('e=>e.clientHeight')==120)
  page.locator('.community-manage').click();page.screenshot(path=str(OUT/'sources-narrow-light.png'))
  check('Narrow source overview still has no widget list',page.locator('[data-source-widget],[data-community-card]').count()==0)
  check('No browser script errors',not errors)
 finally:
  browser.close();server.shutdown()
