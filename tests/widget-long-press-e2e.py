#!/usr/bin/env python3
"""Long-press interaction regression: --widgets-root PATH, or --live after publishing."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import argparse,json,threading,urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--widgets-root',type=Path,default=ROOT.parent/'qiye-widgets');parser.add_argument('--live',action='store_true');parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/widget-long-press'/('live' if args.live else 'preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads(urllib.request.urlopen(SOURCE).read()) if args.live else json.loads((args.widgets_root/'dist/index.json').read_text(encoding='utf-8'))
manifests={m['id'].split('.')[1]:m for m in catalog['widgets']}
state=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
state['items']=[];state['activeGroupId']=state['groups'][0]['id'];state['settings']['theme']='dark'
for kind in manifests:
    value='null'
    if kind=='notes':value=json.dumps({'config':{},'data':{'notes':'Press and hold anywhere. Select text normally.'}})
    if kind=='todo':value=json.dumps({'config':{},'data':{'todos':[{'id':'task-one','text':'Keep this task','done':False}]}})
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
    browser=pw.chromium.launch()
    context=browser.new_context(viewport={'width':1440,'height':980},locale='zh-CN',has_touch=True)
    if not args.live:context.route('https://ktclat.github.io/qiye-widgets/**',local_assets)
    context.add_init_script('''if(window===top&&!localStorage.getItem('hold-seeded')){localStorage.setItem('qiye.state.v5',%s);localStorage.setItem('qiye.community.v1',%s);localStorage.setItem('hold-seeded','yes');}'''%(json.dumps(json.dumps(state)),json.dumps(json.dumps([{'url':SOURCE,'enabled':True,'catalog':catalog}]))))
    page=context.new_page();page.set_default_timeout(30000);errors=[];requests=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:requests.append(request.url) if '/releases/' in request.url else None)
    def tile(kind):return page.locator('#desktop>[data-item="w-'+kind+'"]')
    def widget(kind):return tile(kind).locator('iframe').element_handle().content_frame()
    def order():return page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')
    def ready():page.wait_for_function('n=>document.querySelectorAll("#desktop iframe[data-ready=true]").length===n',arg=len(manifests))
    def begin(kind,selector='#widget-root',position=None):
        tile(kind).scroll_into_view_if_needed();frame=widget(kind);node=frame.locator(selector).first
        node.wait_for(state='visible');rect=node.bounding_box()
        assert rect,(kind,selector)
        x=rect['x']+(position[0] if position else rect['width']/2);y=rect['y']+(position[1] if position else rect['height']/2)
        page.mouse.move(x,y);page.mouse.down()
        page.wait_for_function('document.body.classList.contains("is-dragging")')
        frame.locator('html.widget-dragging').wait_for(state='attached')
        assert page.locator('.drag-ghost iframe[data-ready=true]').count()==1
        return frame,x,y
    try:
        page.goto(base,wait_until='domcontentloaded');ready()
        for theme in ['dark','light']:
            if theme=='light':
                page.evaluate('()=>{const s=JSON.parse(localStorage.getItem("qiye.state.v5"));s.settings.theme="light";localStorage.setItem("qiye.state.v5",JSON.stringify(s));}');page.reload(wait_until='domcontentloaded');ready()
            assert page.locator('#desktop .widget-host-actions,#desktop .widget-drag-handle,#desktop .tile-widget .tile-actions').count()==0
            for kind in manifests:
                tile(kind).scroll_into_view_if_needed();frame=widget(kind)
                assert frame.locator('[data-action=widget-config]:visible').count()==0,kind
                original=order();count=len(requests)
                frame,x,y=begin(kind)
                page.mouse.move(x+18,y+10,steps=5)
                page.keyboard.press('Escape')
                if kind=='file-converter':page.wait_for_timeout(900)
                page.mouse.up()
                page.wait_for_function('!document.body.classList.contains("is-dragging")')
                assert not page.locator('#dialog').evaluate('e=>e.open'),kind
                assert order()==original and len(requests)==count,kind
            check(theme+': all 19 cards hold without buttons, iframe reload or release click; Escape restores order',True)
        # Focused editors remain editable and ordinary text selection never sorts.
        tile('notes').scroll_into_view_if_needed();note=widget('notes').locator('textarea');note.fill('Keep the draft while dragging. Select this text.')
        rect=note.bounding_box();before=order()
        page.mouse.move(rect['x']+12,rect['y']+12);page.mouse.down();page.mouse.move(rect['x']+100,rect['y']+12,steps=3);page.mouse.up()
        assert not page.locator('body').evaluate('e=>e.classList.contains("is-dragging")') and order()==before
        assert note.evaluate('e=>e.selectionEnd>e.selectionStart')
        check('focused note supports ordinary text selection',True)
        frame,x,y=begin('notes','textarea');target=tile('todo').bounding_box()
        page.mouse.move(target['x']+target['width']*.8,target['y']+target['height']/2,steps=20);page.wait_for_timeout(180)
        assert order()!=before
        page.screenshot(path=str(OUT/'live-card-drag.png'))
        page.keyboard.press('Escape');page.mouse.up();page.wait_for_function('!document.body.classList.contains("is-dragging")')
        assert order()==before
        assert page.locator('#desktop iframe').evaluate_all('nodes=>nodes.every(n=>n.clientWidth>0&&n.clientHeight>0)')
        check('Escape after live reordering restores every frame and the original order',True)
        frame,x,y=begin('notes','textarea');target=tile('todo').bounding_box()
        page.mouse.move(target['x']+target['width']*.8,target['y']+target['height']/2,steps=20);page.wait_for_timeout(180);page.mouse.up()
        page.wait_for_function('!document.body.classList.contains("is-dragging")')
        assert order()!=before
        assert widget('notes').locator('textarea').input_value()=='Keep the draft while dragging. Select this text.'
        saved_order=order();page.reload(wait_until='domcontentloaded');ready();assert order()==saved_order
        check('long hold in focused text reorders and persists without losing the draft',True)
        # Holding native controls does not toggle/delete; short clicks still work.
        for selector in ['.w-todo-row input[type=checkbox]','.w-row-delete']:
            begin('todo',selector);page.mouse.up();page.wait_for_function('!document.body.classList.contains("is-dragging")')
            assert widget('todo').locator('.w-todo-row').count()==1
            assert not widget('todo').locator('input[type=checkbox]').is_checked()
        widget('todo').locator('input[type=checkbox]').check()
        check('checkbox/delete long holds do not activate; short checkbox click still works',True)
        # Right click also works over the note input, with no on-card menu button.
        tile('notes').scroll_into_view_if_needed();widget('notes').locator('textarea').click(button='right')
        page.locator('#context-menu [data-command=notes-export]').wait_for(state='visible')
        page.keyboard.press('Escape')
        check('right-click input opens the widget-specific menu',True)
        # Real touch events exercise browser scrolling/cancellation, not synthetic pointers.
        tile('notes').scroll_into_view_if_needed();rect=widget('notes').locator('textarea').bounding_box();x=rect['x']+25;y=rect['y']+25
        cdp=context.new_cdp_session(page)
        before=order()
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-40}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert not page.locator('body').evaluate('e=>e.classList.contains("is-dragging")') and order()==before
        tile('notes').scroll_into_view_if_needed();rect=widget('notes').locator('textarea').bounding_box();x=rect['x']+25;y=rect['y']+25
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
        page.wait_for_function('document.body.classList.contains("is-dragging")')
        cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+35,'y':y+12}]})
        assert page.locator('body').evaluate('e=>e.classList.contains("is-dragging")')
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        page.wait_for_function('!document.body.classList.contains("is-dragging")')
        check('touch hold and release complete without a stuck capture',True)
        page.screenshot(path=str(OUT/'no-card-controls.png'))
        assert not errors,errors
        check('no browser errors',True)
    except Exception:
        print('BROWSER ERRORS',errors,flush=True);page.screenshot(path=str(OUT/'failure.png'));raise
    finally:browser.close();server.shutdown()
