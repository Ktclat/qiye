"""Use a real MV3 favicon cache and a site whose icon requires its visit cookie.
No chrome.* replacements, permission grants, favicon routes or cache doubles.
Also check the shared source/standalone web fallback.
"""
import copy,json,os,struct,subprocess,tempfile,threading,zlib
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/tab-favicon';OUT.mkdir(parents=True,exist_ok=True)
seed=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE,STORAGE_KEY} from './src/core.js';console.log(JSON.stringify({state:DEFAULT_STATE,key:STORAGE_KEY}))"],cwd=ROOT))
requests=[];checks=[];errors=[]
def png(color=(30,160,110,255)):
    def chunk(kind,data):return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    rows=b''.join(b'\0'+bytes(color)*32 for _ in range(32))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',32,32,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
class Site(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def send(self,status,mime,body,cookie=False):
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)))
        if cookie:self.send_header('Set-Cookie','icon-visit=yes; SameSite=Lax; Path=/')
        self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if self.path.startswith('/protected-icon.png'):
            authorized='icon-visit=yes' in self.headers.get('Cookie','')
            requests.append({'path':self.path,'authorized':authorized,'destination':self.headers.get('Sec-Fetch-Dest')})
            self.send(200 if authorized else 403,'image/png' if authorized else 'text/plain',png((30,100,240,255) if 'blue' in self.path else (30,160,110,255)) if authorized else b'Visit first');return
        if self.path.startswith('/visit-fixture'):
            icon='/protected-icon.png?blue' if 'blue' in self.path else '/protected-icon.png'
            self.send(200,'text/html',f'<title>Visit fixture</title><link rel="icon" type="image/png" href="{icon}"><h1>Icon requires this visit cookie</h1>'.encode(),True);return
        if self.path.startswith('/redirect-fixture'):
            self.send_response(302);self.send_header('Location',f'http://localhost:{server.server_port}/visit-fixture?blue');self.end_headers();return
        if self.path.startswith('/no-icon'):
            self.send(200,'text/html',b'<title>No icon</title><h1>This site has no icon</h1>');return
        if self.path=='/favicon.ico':self.send(404,'text/plain',b'No icon');return
        super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Site);threading.Thread(target=server.serve_forever,daemon=True).start()
empty_server=ThreadingHTTPServer(('127.0.0.1',0),Site);threading.Thread(target=empty_server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
def check(name,condition=True):
    assert condition,name
    checks.append(name);print('PASS',name,flush=True)
def state_for(url):
    state=copy.deepcopy(seed['state']);state['settings'].update({'language':'zh-CN','autoExtractIcons':False})
    state['items']=[{'id':'capture-test','groupId':'home','type':'link','title':'Visit capture','url':url,'icon':'V','iconMode':'text','color':'#4976df','size':'1x1','folderId':None}]
    return state
def edit(page):
    page.locator('#desktop [data-item=capture-test]').click(button='right');page.locator('#context-menu [data-context=edit]').click();page.locator('#link-form').wait_for()
def saved(page):return page.evaluate('async key=>(await chrome.storage.local.get(key))[key]',seed['key'])
def return_to_editor(page):
    page.bring_to_front()
    # Chromium's headless window may not activate a tab via Page.bringToFront.
    page.evaluate('async()=>{const tab=await chrome.tabs.getCurrent();await chrome.tabs.update(tab.id,{active:true})}')

with sync_playwright() as p, tempfile.TemporaryDirectory(prefix='qiye-tab-icon-') as profile:
    context=p.chromium.launch_persistent_context(profile,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {'channel':'chromium'}),headless=True,viewport={'width':1280,'height':860},args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'])
    try:
        worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
        extension_id=worker.url.split('/')[2]
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'chrome-extension://{extension_id}/index.html')
        page.locator('#desktop [data-item]').first.wait_for()
        page.evaluate('async([key,state])=>chrome.storage.local.set({[key]:state})',[seed['key'],state_for(base+'/visit-fixture?user-choice=1')])
        page.reload();edit(page)
        before=saved(page);manifest=page.evaluate('chrome.runtime.getManifest()')
        check('no tabs/history/scripting/all-sites permissions added',manifest['permissions']==['storage','activeTab','contextMenus','favicon'])
        blocked=page.evaluate('async url=>{try{return (await fetch(url,{credentials:"omit"})).status}catch{return 0}}',base+'/protected-icon.png')
        check('direct icon request cannot access the protected image',blocked!=200)
        with context.expect_page() as opened:page.locator('[data-action=visit-favicon]').click()
        website=opened.value;website.wait_for_load_state()
        check('explicit visit preserves the user URL',website.url==base+'/visit-fixture?user-choice=1')
        check('does not read a challenge icon while the user is still visiting',page.locator('[data-icon-index]').count()==0)
        return_to_editor(page)
        expect(page.locator('#favicon-status')).to_contain_text('已加入标签页图标',timeout=12000)
        choice=page.locator('[data-icon-index]');expect(choice).to_be_enabled()
        captured=choice.get_attribute('data-icon-url')
        check('browser cache produces a portable PNG candidate',captured.startswith('data:image/png;base64,'))
        check('real browser loaded the protected favicon with its visit cookie',any(r['authorized'] for r in requests))
        check('browser result is labeled without claiming high resolution',choice.locator('[data-icon-label]').inner_text()=='标签页图标')
        check('no desktop write or selection change before user selection',saved(page)==before and page.locator('[name=iconMode]').input_value()=='text')
        page.screenshot(path=str(OUT/'captured-extension-dark.png'))
        choice.click();check('selection only changes the draft',saved(page)==before)
        page.locator('#link-form button[type=submit]').click();page.locator('#dialog').wait_for(state='hidden')
        check('save persists the captured image, not a browser-private URL',saved(page)['items'][0]['iconUrl']==captured)
        page.reload();expect(page.locator('#desktop [data-item=capture-test] img')).to_have_attribute('src',captured)
        check('captured image survives extension reload')
        edit(page)
        with context.expect_page() as opened:page.locator('[data-action=visit-favicon]').click()
        another=opened.value;another.wait_for_load_state();return_to_editor(page)
        page.locator('[name=url]').fill('https://different.example/')
        expect(page.locator('[data-action=visit-favicon]')).to_have_text('访问网站取图标')
        check('editing destination cancels capture and keeps selected image',page.locator('[name=iconUrl]').input_value()==captured)
        page.locator('[name=url]').fill(base+'/visit-fixture')
        with context.expect_page() as opened:page.locator('[data-action=visit-favicon]').click()
        closing=opened.value;closing.wait_for_load_state();closing.close();return_to_editor(page)
        expect(page.locator('#favicon-status')).to_contain_text('已加入标签页图标',timeout=12000)
        check('closing a visited tab still permits reading its cached icon')
        page.locator('[name=url]').fill(base+'/redirect-fixture')
        with context.expect_page() as opened:page.locator('[data-action=visit-favicon]').click()
        redirected=opened.value;redirected.wait_for_load_state();return_to_editor(page)
        expect(page.locator('#favicon-status')).to_contain_text('已加入标签页图标',timeout=12000)
        expect(page.locator('[data-icon-index]')).to_have_count(2)
        blue=page.locator('[data-icon-index]').last
        expect(blue).to_be_enabled()
        pixel=blue.locator('img').evaluate('(img)=>{const c=document.createElement("canvas");c.width=c.height=1;const ctx=c.getContext("2d");ctx.drawImage(img,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data]}')
        check('cross-origin redirect captures the final site icon without extra permissions',pixel==[30,100,240,255])
        page.locator('[name=url]').fill(f'http://localhost:{empty_server.server_port}/no-icon')
        with context.expect_page() as opened:page.locator('[data-action=visit-favicon]').click()
        empty=opened.value;empty.wait_for_load_state();return_to_editor(page)
        expect(page.locator('#favicon-status')).to_contain_text('还没有这个网站的图标',timeout=12000)
        check('generic browser icon is rejected while earlier candidates stay',page.locator('[data-icon-index]').count()==2)
        check('extension flow has no uncaught errors',not errors)
    except Exception:
        if 'page' in locals():
            print(json.dumps({'body':page.locator('body').inner_text(),'icons':page.locator('[data-icon-index]').evaluate_all('(rows)=>rows.map(row=>({html:row.outerHTML,width:row.querySelector("img").naturalWidth,complete:row.querySelector("img").complete}))'),'errors':errors,'requests':requests},ensure_ascii=False),flush=True);page.screenshot(path=str(OUT/'failure.png'))
        raise
    finally:context.close()
    browser=p.chromium.launch(**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {}))
    try:
        for entry in ['index.html','Qiye-preview.html']:
            ctx=browser.new_context(viewport={'width':900,'height':760});page=ctx.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            ctx.route('https://**/*',lambda route:route.abort())
            web_state=state_for(base+'/visit-fixture');web_state['items'][0].update({'iconMode':'auto','iconUrl':captured})
            english=entry=='Qiye-preview.html';web_state['settings'].update({'language':'en' if english else 'zh-CN','theme':'light' if english else 'dark'})
            page.goto(base+'/'+entry);page.evaluate('([key,state])=>localStorage.setItem(key,JSON.stringify(state))',[seed['key'],web_state]);page.reload()
            expect(page.locator('#desktop [data-item=capture-test] img')).to_have_attribute('src',captured)
            check(entry+' displays a captured extension image without browser permissions')
            edit(page)
            button=page.locator('[data-action=visit-favicon]');expect(button).to_have_text('Visit website' if english else '访问网站')
            check(entry+' clearly explains extension-only tab capture',('you can upload an image' if english else '网页版可上传本机图片') in page.locator('.visit-icon-control').inner_text())
            with ctx.expect_page() as opened:button.click()
            website=opened.value;website.wait_for_load_state();return_state=page.locator('#favicon-status').inner_text()
            check(entry+' visit works without pretending to read another tab',('The web version cannot read' if english else '网页版无法读取其他标签页') in return_state and page.locator('[data-icon-index]').count()==0)
            check(entry+' keeps local upload available',page.locator('[data-icon-choice=upload]').is_visible())
            page.screenshot(path=str(OUT/('web-'+entry+'.png')));ctx.close()
        check('web/source/preview have no uncaught errors',not errors)
    finally:browser.close();server.shutdown();empty_server.shutdown()
(OUT/'results.json').write_text(json.dumps({'checks':checks,'count':len(checks),'requests':requests,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'count':len(checks),'errors':errors},ensure_ascii=False))
