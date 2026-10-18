#!/usr/bin/env python3
"""Window preparation, sandbox lifecycle and flush rounded iframe boundaries."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import argparse, json, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/plugin-window'/('preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads((ROOT/'tests/fixtures/plugin-source/index.json').read_text(encoding='utf-8'))
manifest=catalog['widgets'][0]
initial=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
fixture=(ROOT/'tests/fixtures/plugin-source/releases/1.0.0/widget.html').read_text(encoding='utf-8')
fixture=fixture.replace('<script>','''<style>html,body{width:100%;height:100%;overflow:hidden;background:#30251f;color:#eee}</style>
<script>window.bootId=crypto.randomUUID();window.initCount=0;''')
fixture=fixture.replace("window.removeEventListener('message',init);", "window.initCount++;window.initReceived=e.data;window.removeEventListener('message',init);")
requests=[];checks=[];held=[];hold_requests=False
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'

def check(name,value):
    assert value,name
    checks.append(name);print('PASS',name,flush=True)

def route_external(route):
    url=route.request.url
    if '/qiye-widgets/releases/' in url:
        requests.append(url)
        if hold_requests:
            held.append(route);return
        return route.fulfill(content_type='text/html',body=fixture)
    return route.fulfill(content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'})

def seed(page):
    page.goto(base+('/Qiye-preview.html' if args.preview else '/'))
    page.locator('#desktop .tile-link').first.wait_for()
    page.evaluate('''({manifest,source,catalog,state})=>{
      state.settings.theme='dark';state.activeGroupId=state.groups[0].id;
      state.items=['a','b'].map(id=>({id,type:'widget',widget:'community',title:'组件 '+id,size:'2x2',groupId:state.activeGroupId,config:{source,manifest},data:{value:JSON.stringify({config:{},data:{notes:'原内容 '+id}})}}));
      localStorage.setItem('qiye.state.v5',JSON.stringify(state));
      localStorage.setItem('qiye.community.v1',JSON.stringify([{url:source,enabled:true,catalog}]));
    }''',{'manifest':manifest,'source':SOURCE,'catalog':catalog,'state':initial})
    page.reload()
    page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===2')

def prepare(page,item='a',keyboard=False):
    page.mouse.move(0,0)
    if keyboard:page.locator(f'#desktop [data-item="{item}"]').focus()
    else:page.locator(f'#desktop [data-item="{item}"] iframe').hover()
    selector=f'.plugin-preload-stage iframe[title="组件 {item}"]'
    page.locator(selector).wait_for(state='attached')
    page.locator(selector).element_handle().content_frame().wait_for_function('document.readyState==="complete" && typeof bootId==="string"')
    return page.frame_locator(selector)

def open_window(page,item='a',keyboard=False):
    if keyboard:page.locator(f'#desktop [data-item="{item}"]').press('Enter')
    else:page.frame_locator(f'#desktop [data-item="{item}"] iframe').locator('[data-action=widget-open]').evaluate('e=>e.click()')
    page.locator('#dialog iframe[data-ready=true]').wait_for()
    return page.frame_locator('#dialog iframe')

def close_window(page):
    page.frame_locator('#dialog iframe').locator('[data-close]').evaluate('e=>e.click()')
    page.wait_for_function('!document.querySelector("#dialog").open')

try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(args=['--disable-features=OverlayScrollbar'])
        context=browser.new_context(viewport={'width':1440,'height':900},locale='zh-CN')
        context.route('https://**/*',route_external)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.clock.install();seed(page)
        check('No speculative frames on initial desktop',page.locator('.plugin-preload-stage').count()==0)
        prepared=prepare(page)
        boot=prepared.locator('body').evaluate('()=>bootId')
        check('Prepared page receives no instance data or MessagePort',prepared.locator('body').evaluate('()=>initCount===0 && !window.initReceived'))
        check('Prepared page is inert, hidden and uses the same opaque sandbox',page.locator('.plugin-preload-stage').evaluate("e=>e.inert && e.getAttribute('aria-hidden')==='true' && getComputedStyle(e).visibility==='hidden'") and 'allow-same-origin' not in page.locator('.plugin-preload-stage iframe').get_attribute('sandbox'))
        # Edits made after preparation must be read at the actual open time.
        page.frame_locator('#desktop [data-item=a] iframe').locator('textarea').fill('准备之后的新内容')
        page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5')).items[0].data.value.includes('准备之后的新内容')")
        count=len(requests);f=open_window(page)
        check('Opening reuses the prepared document without another navigation',len(requests)==count and f.locator('body').evaluate('()=>bootId')==boot)
        check('Exactly one initialization receives the latest saved data',f.locator('body').evaluate('()=>initCount')==1 and f.locator('textarea').input_value()=='准备之后的新内容')
        check('Moving the document removes its staging container',page.locator('.plugin-preload-stage').count()==0)
        f.locator('textarea').fill('窗口关闭前保存')
        close_window(page)
        check('Closing flushes the prepared window before destroying it','窗口关闭前保存' in page.evaluate("JSON.parse(localStorage.getItem('qiye.state.v5')).items[0].data.value") and page.locator('#dialog iframe').count()==0)

        # Preparing a different instance evicts the old one; ports never cross.
        first=prepare(page).locator('body').evaluate('()=>bootId')
        second=prepare(page,'b').locator('body').evaluate('()=>bootId')
        check('Only one pending window exists across multiple cards',first!=second and page.locator('.plugin-preload-stage iframe').count()==1)
        f=open_window(page,'b')
        check('Each instance receives only its own data',f.locator('textarea').input_value()=='原内容 b' and f.locator('body').evaluate('()=>initReceived.item.id')=='b')

        # The outer dialog owns rounded clipping, and never reserves a gutter.
        for width,height in [(1440,900),(390,844)]:
            page.set_viewport_size({'width':width,'height':height})
            for theme in ['dark','light']:
                page.evaluate("theme=>document.documentElement.dataset.theme=theme",theme)
                for zoom in [1,1.25,1.5]:
                    page.evaluate('zoom=>document.documentElement.style.zoom=zoom',zoom)
                    page.locator('#dialog').evaluate('e=>e.getAnimations().forEach(a=>a.finish())')
                    geometry=page.locator('#dialog').evaluate('''d=>{
                      const f=d.querySelector('iframe'),r=d.getBoundingClientRect(),fr=f.getBoundingClientRect(),s=getComputedStyle(d),scale=r.width/d.offsetWidth;
                      return {left:fr.left-r.left-parseFloat(s.borderLeftWidth)*scale,right:r.right-fr.right-parseFloat(s.borderRightWidth)*scale,bottom:r.bottom-fr.bottom-parseFloat(s.borderBottomWidth)*scale,gutter:s.scrollbarGutter,overflow:s.overflow,radius:parseFloat(s.borderTopRightRadius),scroll:d.scrollWidth-d.clientWidth};
                    }''')
                    check(f'No exposed edge or outer scroll: {width}px {theme} zoom {zoom}',all(abs(geometry[k])<1 for k in ['left','right','bottom']) and geometry['scroll']<=1 and geometry['gutter']=='auto' and geometry['overflow']=='hidden' and geometry['radius']>0)
                page.screenshot(path=str(OUT/f'edges-{width}-{theme}.png'))
        page.evaluate('document.documentElement.style.zoom=1');page.set_viewport_size({'width':1440,'height':900})
        page.locator('#dialog').press('Escape');page.wait_for_function('!document.querySelector("#dialog").open')
        prepared=prepare(page,keyboard=True);boot=prepared.locator('body').evaluate('()=>bootId')
        f=open_window(page,keyboard=True)
        check('Keyboard focus prepares and Enter reuses the same document',f.locator('body').evaluate('()=>bootId')==boot)
        close_window(page)

        prepare(page)
        page.mouse.move(0,0)
        page.clock.fast_forward(10010)
        check('An unused prepared window expires after ten seconds',page.locator('.plugin-preload-stage').count()==0)
        page.clock.resume()
        page.mouse.move(0,0);hold_requests=True
        page.locator('#desktop [data-item=a] iframe').hover()
        page.locator('.plugin-preload-stage iframe').wait_for(state='attached')
        page.wait_for_timeout(100)
        page.locator('.plugin-preload-stage iframe').evaluate("f=>f.dataset.inflight='yes'")
        page.frame_locator('#desktop [data-item=a] iframe').locator('[data-action=widget-open]').evaluate('e=>e.click()')
        page.locator('#dialog iframe[data-inflight=yes]').wait_for(state='attached')
        check('An in-flight preparation moves without a second request',len(held)==1)
        hold_requests=False;held.pop().fulfill(content_type='text/html',body=fixture)
        page.locator('#dialog iframe[data-ready=true]').wait_for()
        check('An in-flight document initializes once after its eventual load',page.frame_locator('#dialog iframe').locator('body').evaluate('()=>initCount')==1)
        page.locator('#dialog').evaluate("e=>e.classList.add('widget-app-expanded')")
        check('Expanded window also has no reserved gutter',page.locator('#dialog').evaluate("e=>e.clientWidth===e.offsetWidth-2 && e.querySelector('iframe').offsetWidth===e.clientWidth"))
        close_window(page)

        # The suspended stage is never allowed to navigate into a live session.
        prepared=prepare(page)
        prepared.locator('body').evaluate("location.replace(location.href+'&navigation=1')")
        page.locator('.plugin-preload-stage').wait_for(state='detached')
        f=open_window(page)
        check('A self-navigated prepared document is discarded',f.locator('body').evaluate('()=>!location.search.includes("navigation") && initCount===1'))
        f.locator('body').evaluate("location.replace(location.href+'&navigation=1')")
        page.locator('#dialog [data-plugin-retry]').wait_for()
        check('A live navigation revokes the session and exposes retry',page.locator('#dialog iframe').count()==0)
        page.locator('#dialog [data-close]').first.click();page.wait_for_function('!document.querySelector("#dialog").open')

        prepare(page)
        page.evaluate("()=>{const sources=JSON.parse(localStorage.getItem('qiye.community.v1'));sources[0].enabled=false;localStorage.setItem('qiye.community.v1',JSON.stringify(sources));dispatchEvent(new Event('qiye:widget-sources-changed'));}")
        check('Disabling a source removes live and prepared documents',page.locator('.plugin-preload-stage,#desktop iframe').count()==0)
        check('Disabling retains the saved window data','窗口关闭前保存' in page.evaluate("JSON.parse(localStorage.getItem('qiye.state.v5')).items[0].data.value"))
        check('No browser errors',not errors)
        context.close()

        for label,script in [('unsupported',"delete Element.prototype.moveBefore"),('save-data',"Object.defineProperty(navigator,'connection',{value:{saveData:true}})")]:
            context=browser.new_context(viewport={'width':1440,'height':900},locale='zh-CN')
            context.add_init_script(script);context.route('https://**/*',route_external)
            page=context.new_page();seed(page)
            page.locator('#desktop [data-item=a] iframe').hover();page.wait_for_timeout(150)
            check(label+' skips preparation',page.locator('.plugin-preload-stage').count()==0)
            f=open_window(page)
            check(label+' still opens the widget normally',f.locator('textarea').input_value()=='原内容 a')
            close_window(page);context.close()
        browser.close()
finally:
    server.shutdown();(OUT/'report.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
