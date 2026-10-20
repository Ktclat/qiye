#!/usr/bin/env python3
"""Reuse a live opaque card without navigation; exercise persistence and fallback."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import argparse,json,threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/plugin-reuse'/('preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads((ROOT/'tests/fixtures/plugin-source/index.json').read_text(encoding='utf-8'))
state=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
fixture=(ROOT/'tests/fixtures/plugin-view.html').read_text(encoding='utf-8')
requests=[];checks=[];supported=True
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
def external(route):
 if '/qiye-widgets/releases/' in route.request.url:
  requests.append(route.request.url)
  return route.fulfill(content_type='text/html',body=fixture if supported else fixture.replace("features:['view-switch']","features:[]"))
 return route.fulfill(content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'})
def check(name,value):
 assert value,name
 checks.append(name);print('PASS',name,flush=True)
def seed(page):
 page.goto(base+('/Qiye-preview.html' if args.preview else '/'))
 page.locator('#desktop .tile-link').first.wait_for() if not page.locator('#desktop .tile-widget').count() else None
 page.evaluate('''({state,catalog,source,supported})=>{
  state.settings.theme='dark';state.activeGroupId=state.groups[0].id;
  if(!supported){catalog=structuredClone(catalog);catalog.widgets[0].release='1.0.1';}
  state.items=['a','b'].map(id=>({id,type:'widget',widget:'community',title:'便签 '+id,size:'2x2',groupId:state.activeGroupId,config:{source,manifest:catalog.widgets[0]},data:{value:JSON.stringify({config:{},data:{notes:'内容 '+id}})}}));
  localStorage.setItem('qiye.state.v5',JSON.stringify(state));localStorage.setItem('qiye.community.v1',JSON.stringify([{url:source,enabled:true,catalog}]));
 }''',dict(state=state,catalog=catalog,source=SOURCE,supported=supported))
 page.reload();page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===2')
def card(page,id='a'):return page.frame_locator(f'#desktop [data-item={id}] iframe')
def open_window(page,id='a'):
 card(page,id).locator('[data-action=widget-open]').evaluate('e=>e.click()')
 page.wait_for_function('document.querySelector("#dialog iframe[data-ready=true]") && document.querySelector("#dialog [data-plugin-slot]").getAttribute("aria-busy")==="false"')
 return page.frame_locator('#dialog iframe')
def close(page):
 page.locator('#dialog').press('Escape');page.wait_for_function('!document.querySelector("#dialog").open')
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();context=browser.new_context(viewport={'width':1440,'height':900},locale='zh-CN')
  context.route('https://**/*',external);page=context.new_page();page.set_default_timeout(10000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)));seed(page)
  boot=card(page).locator('body').evaluate('()=>bootId');count=len(requests)
  f=open_window(page)
  check('Live card document and sandbox are reused without another request',len(requests)==count and f.locator('body').evaluate('()=>bootId')==boot and 'allow-same-origin' not in page.locator('#dialog iframe').get_attribute('sandbox'))
  check('No second initialization or opening placeholder',f.locator('body').evaluate('()=>initCount===1 && views.join()==="window"') and page.locator('#dialog .plugin-loading').count()==0)
  check('Switch is acknowledged before the window stops being busy',f.locator('body').get_attribute('data-view')=='window')
  f.locator('textarea').fill('关闭前立即保存');close(page)
  check('Close saves and returns the same document to its original card',card(page).locator('body').evaluate('()=>bootId')==boot and card(page).locator('textarea').input_value()=='关闭前立即保存' and '关闭前立即保存' in page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].data.value'))
  for width,theme in [(1440,'dark'),(390,'light')]:
   page.set_viewport_size({'width':width,'height':850});page.evaluate('theme=>document.documentElement.dataset.theme=theme',theme)
   f=open_window(page)
   check(f'Window fills its rounded container at {width}px/{theme}',page.locator('#dialog').evaluate('d=>{const r=d.getBoundingClientRect(),f=d.querySelector("iframe").getBoundingClientRect();return Math.abs(r.right-parseFloat(getComputedStyle(d).borderRightWidth)-f.right)<1.1}'))
   page.locator('#dialog').screenshot(path=str(OUT/f'{width}-{theme}.png'));close(page)
  page.set_viewport_size({'width':1440,'height':900});context.set_offline(True)
  f=open_window(page);check('Already loaded local runtime opens offline without fetching resources',f.locator('body').evaluate('()=>bootId')==boot and len(requests)==count);close(page);context.set_offline(False)
  f=open_window(page,'b');check('A different instance keeps its own saved data',f.locator('textarea').input_value()=='内容 b' and f.locator('body').evaluate('()=>bootId')!=boot);close(page)
  # Closing during a delayed transition must wait, not destroy the active editor.
  card(page).locator('body').evaluate('()=>window.holdView=true');card(page).locator('[data-action=widget-open]').evaluate('e=>e.click()')
  page.locator('#dialog iframe').element_handle().content_frame().wait_for_function('typeof window.finishView==="function"')
  f=page.frame_locator('#dialog iframe');f.locator('body').evaluate('()=>window.holdView=false')
  page.locator('#dialog').press('Escape')
  check('Close during a pending switch preserves the live document',page.locator('#dialog[open] iframe').count()==1)
  f.locator('body').evaluate('()=>finishView()');page.wait_for_function('!document.querySelector("#dialog").open')
  f=open_window(page);f.locator('body').evaluate('()=>window.rejectFlush=true');page.locator('#dialog').press('Escape')
  page.locator('[data-plugin-force-close]').wait_for();check('Failed save keeps the window open for recovery',page.locator('#dialog[open]').count()==1)
  page.locator('[data-plugin-force-close]').click();page.wait_for_function('!document.querySelector("#dialog").open')
  check('Force close leaves confirmed data intact','关闭前立即保存' in page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].data.value'))
  page.locator('#desktop [data-item=a] [data-plugin-retry]').click();page.locator('#desktop [data-item=a] iframe[data-ready=true]').wait_for()
  check('Forced-close recovery can retry the original card',card(page).locator('textarea').input_value()=='关闭前立即保存')
  page.reload();page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===2')
  card(page).locator('body').evaluate('()=>window.rejectFlush=true');open_window(page)
  check('A failed view switch exposes accessible host close controls',page.locator('.plugin-window-header.needs-recovery').is_visible() and page.locator('#dialog [role=alert]').count()==1)
  page.locator('.plugin-window-header [data-close]').click();page.locator('[data-plugin-force-close]').wait_for();page.locator('[data-plugin-force-close]').click();page.wait_for_function('!document.querySelector("#dialog").open')
  page.reload();page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===2');f=open_window(page)
  f.locator('body').evaluate('()=>location.href+="&navigate=1"')
  page.locator('#dialog [data-plugin-retry]').wait_for();close(page)
  check('A navigated borrowed document is revoked and its card remains recoverable',page.locator('#desktop [data-item=a] [data-plugin-retry]').count()==1)
  page.locator('#desktop [data-item=a] [data-plugin-retry]').click();page.locator('#desktop [data-item=a] iframe[data-ready=true]').wait_for()
  check('Retry restores the card without losing confirmed data',card(page).locator('textarea').input_value()=='关闭前立即保存')
  # Legacy instances resolve their version from the enabled source until their
  # first save. A source refresh while that window is open must revoke reuse.
  page.evaluate('''()=>{const s=JSON.parse(localStorage.getItem('qiye.state.v5'));Object.assign(s.items[0],{widget:'notes',config:{color:'yellow'},data:{notes:'关闭前立即保存'}});localStorage.setItem('qiye.state.v5',JSON.stringify(s));}''')
  page.reload();page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===2');f=open_window(page);boot=f.locator('body').evaluate('()=>bootId')
  page.evaluate('''()=>{const s=JSON.parse(localStorage.getItem('qiye.community.v1')),m=s[0].catalog.widgets[0];m.release='2.0.0';m.entry=m.entry.replace('/1.0.0/','/2.0.0/');localStorage.setItem('qiye.community.v1',JSON.stringify(s));dispatchEvent(new Event('qiye:widget-sources-changed'));}''')
  page.locator('#dialog iframe[data-entry*="/2.0.0/"][data-ready=true]').wait_for()
  check('A changed source manifest does not reuse the previous runtime',page.frame_locator('#dialog iframe').locator('body').evaluate('()=>bootId')!=boot)
  close(page)
  page.reload();page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===2');open_window(page)
  page.evaluate('()=>{const s=JSON.parse(localStorage.getItem("qiye.community.v1"));s[0].enabled=false;localStorage.setItem("qiye.community.v1",JSON.stringify(s));dispatchEvent(new Event("qiye:widget-sources-changed"));}')
  page.wait_for_function('!document.querySelector(".plugin-frame")');check('Revocation removes borrowed frames without deleting data','关闭前立即保存' in page.evaluate('localStorage.getItem("qiye.state.v5")'))
  # Existing sources and browsers without preserving moves keep their old path.
  supported=False;seed(page);boot=card(page).locator('body').evaluate('()=>bootId');f=open_window(page)
  check('Unadvertised community runtime uses compatible fresh loading',f.locator('body').evaluate('()=>bootId')!=boot and page.locator('#desktop iframe').count()==2);close(page)
  supported=True;seed(page);page.evaluate('()=>{delete Element.prototype.moveBefore}');boot=card(page).locator('body').evaluate('()=>bootId');f=open_window(page)
  check('Older browsers use fresh frames safely',f.locator('body').evaluate('()=>bootId')!=boot and page.locator('#desktop iframe').count()==2);close(page)
  check('No uncaught browser errors',not errors);browser.close()
finally:
 server.shutdown();(OUT/'report.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
