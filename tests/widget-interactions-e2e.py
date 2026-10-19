#!/usr/bin/env python3
"""Optional host/widget integration: --widgets-root PATH, or --live after publishing."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import argparse,json,threading,urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--widgets-root',type=Path,default=ROOT.parent/'qiye-widgets');parser.add_argument('--live',action='store_true');parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/widget-interactions'/('live' if args.live else 'preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads(urllib.request.urlopen(SOURCE).read()) if args.live else json.loads((args.widgets_root/'dist/index.json').read_text(encoding='utf-8'))
manifests={m['id'].split('.')[1]:m for m in catalog['widgets']}
state=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
state['items']=[];state['activeGroupId']=state['groups'][0]['id'];state['settings']['theme']='dark'
for kind in ['notes','todo','converter','clock','file-converter','hotsearch']:
    value='null'
    if kind=='hotsearch':value=json.dumps({'config':{'subscriptions':['zhihu','weibo'],'activeSource':'zhihu','layout':'list','enabled':True,'apiBase':'https://uapis.cn'},'data':{}})
    state['items'].append({'id':'w-'+kind,'groupId':state['activeGroupId'],'type':'widget','widget':'community','title':manifests[kind]['name'],'size':'2x2','config':{'source':SOURCE,'manifest':manifests[kind]},'data':{'value':value}})
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='https://ktclat.github.io/qiye/' if args.live else f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else '')
def local_assets(route):
    path=urlsplit(route.request.url).path.removeprefix('/qiye-widgets/')
    file=args.widgets_root/'dist'/path
    if not file.is_file():return route.abort()
    mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}.get(file.suffix,'application/octet-stream')
    route.fulfill(status=200,content_type=mime,body=file.read_bytes(),headers={'Access-Control-Allow-Origin':'*'})
def check(name,condition):
    assert condition,name
    print('PASS',name,flush=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':980},locale='zh-CN',timezone_id='Asia/Hong_Kong')
    if not args.live:context.route('https://ktclat.github.io/qiye-widgets/**',local_assets)
    context.add_init_script('''if(window===window.top&&!localStorage.getItem('integration-seeded')){localStorage.setItem('qiye.state.v5',%s);localStorage.setItem('qiye.community.v1',%s);localStorage.setItem('integration-seeded','yes');}'''%(json.dumps(json.dumps(state)),json.dumps(json.dumps([{'url':SOURCE,'enabled':True,'catalog':catalog}]))))
    page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base)
    page.wait_for_function("document.querySelectorAll('#desktop iframe[data-ready=true]').length===6")
    def tile(kind):return page.locator('#desktop>[data-item="w-'+kind+'"]')
    def card(kind):return page.frame_locator('[data-item="w-'+kind+'"] iframe')
    def window_frame():return page.frame_locator('#dialog iframe[data-ready=true]')
    def menu(kind):
        card(kind).locator('#widget-root').click(button='right',position={'x':45,'y':15})
        page.locator('#context-menu').wait_for(state='visible')
    card('notes').locator('textarea').fill('拖动、调整尺寸后保留的笔记')
    page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5')).items.find(i=>i.id==='w-notes').data.value.includes('保留的笔记')")
    menu('notes')
    check('note-specific export menu',page.locator('[data-command=notes-export]').count()==1)
    page.locator('[data-context=resize][data-size="4x2"]').click()
    page.wait_for_function("document.querySelector('[data-item=\"w-notes\"]').dataset.size==='4x2'")
    check('resize keeps saved note',card('notes').locator('textarea').input_value()=='拖动、调整尺寸后保留的笔记')
    menu('notes');page.locator('[data-context=resize][data-size="2x2"]').click()
    page.wait_for_function("document.querySelector('[data-item=\"w-notes\"]').dataset.size==='2x2'")
    # Real pointer drag starts inside the opaque frame, not at a host-only test hook.
    before=page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')
    title=card('notes').locator('[data-action=widget-open]').first.bounding_box();target=tile('converter').bounding_box()
    page.mouse.move(title['x']+title['width']/2,title['y']+title['height']/2);page.mouse.down();page.wait_for_timeout(450)
    page.mouse.move(target['x']+target['width']*.8,target['y']+target['height']/2,steps=25);page.wait_for_timeout(350);page.mouse.up()
    page.wait_for_function("before=>JSON.stringify([...document.querySelectorAll('#desktop>[data-item]')].map(n=>n.dataset.item))!==JSON.stringify(before)",arg=before)
    check('drag keeps initialized note',card('notes').locator('textarea').input_value()=='拖动、调整尺寸后保留的笔记')
    order=page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')
    page.reload();page.wait_for_function("document.querySelectorAll('#desktop iframe[data-ready=true]').length===6")
    check('drag order persists after reload',page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')==order)
    menu('clock');check('clock menu exposes three layouts',page.locator('[data-command^="clock-"]').count()==4)
    page.locator('[data-command=clock-3]').click();window_frame().locator('[data-clock-columns="3"][aria-pressed=true]').wait_for()
    window_frame().locator('[data-close]').click();page.wait_for_function("!document.querySelector('#dialog').open")
    menu('notes');page.locator('[data-command=settings]').click();window_frame().locator('#widget-form').wait_for()
    window_frame().locator('[data-plugin-back]').click();window_frame().locator('textarea').wait_for()
    check('settings command opens full window and returns',window_frame().locator('.life-notes').count()==1)
    window_frame().locator('[data-close]').click();page.wait_for_function("!document.querySelector('#dialog').open")
    # A new transient notification replaces the previous timer, then disappears.
    menu('todo');page.locator('[data-context=duplicate]').click();page.locator('#toast').wait_for(state='visible')
    check('toast is visible initially',page.locator('#toast').is_visible())
    page.locator('#toast').wait_for(state='hidden',timeout=4500)
    check('ordinary toast expires within 3 seconds plus scheduling tolerance',True)
    # The production API response is never intercepted: this verifies CORS from the host.
    menu('hotsearch');page.locator('[data-context=widget-open]').click()
    try:window_frame().locator('.hotsearch-rows li').first.wait_for(timeout=20000)
    except Exception:
        page.screenshot(path=str(OUT/'hotsearch-error.png'));print('HOTBOARD',json.dumps(window_frame().locator('body').inner_text()),flush=True);raise
    check('real Zhihu hotboard loads through host',window_frame().locator('.hotsearch-rows li').count()>0)
    page.screenshot(path=str(OUT/'hotsearch-live.png'))
    window_frame().locator('[data-close]').click();page.wait_for_function("!document.querySelector('#dialog').open")
    # Keyboard menu and movement remain available without a pointer.
    tile('notes').focus();page.keyboard.press('Shift+F10');page.locator('#context-menu').wait_for(state='visible')
    page.keyboard.press('ArrowDown');check('menu keyboard navigation',page.locator('#context-menu button:focus').count()==1)
    page.keyboard.press('Escape');check('menu returns focus to its tile',tile('notes').evaluate('e=>document.activeElement===e'))
    check('no page errors: '+json.dumps(errors),not errors)
    page.screenshot(path=str(OUT/'desktop.png'))
    browser.close()
server.shutdown()
