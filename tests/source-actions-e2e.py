#!/usr/bin/env python3
"""Real source controls with slow/failed catalogs, cancellation and saved instances."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import argparse,json,tempfile,threading,zipfile
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');parser.add_argument('--live',action='store_true');parser.add_argument('--extension',action='store_true');args=parser.parse_args()
OUT=ROOT/'output/playwright/source-actions'/('extension' if args.extension else 'live' if args.live else 'preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads((ROOT/'tests/fixtures/plugin-source/index.json').read_text(encoding='utf-8'))
notes=catalog['widgets'][0]
catalog['widgets'] += [{**notes,'id':f'qiye.example-{i}','name':f'示例组件 {i}'} for i in range(1,19)]
state=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
state['settings'].update(theme='dark',language='zh-CN',reducedEffects=True)
state['items']=[{'id':'saved-note','groupId':'home','type':'widget','widget':'community','title':'保留的便签','size':'2x2','config':{'source':SOURCE,'manifest':{**notes,'release':'0.9.0'}},'data':{'value':'{"text":"请保留这些内容"}'}}]
state['activeGroupId']='home'
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='https://ktclat.github.io/qiye/' if args.live else f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else '')
held=[];requests=[];mode='hold';checks=[]
def external(route):
    global mode
    url=route.request.url
    if url==SOURCE:
        requests.append(url)
        if mode=='hold':held.append(route);return
        return route.fulfill(status=503 if mode=='error' else 200,json={} if mode=='error' else catalog,headers={'Access-Control-Allow-Origin':'*'})
    if '/qiye-widgets/releases/1.0.0/widget.html' in url:
        return route.fulfill(path=str(ROOT/'tests/fixtures/plugin-source/releases/1.0.0/widget.html'),headers={'Access-Control-Allow-Origin':'*'})
    return route.fulfill(json={},headers={'Access-Control-Allow-Origin':'*'})
def check(name,ok=True):
    assert ok,name
    checks.append(name);print('PASS',name,flush=True)
def desktop(page):
    return page.evaluate("async()=>globalThis.chrome?.runtime?.id?(await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']:JSON.parse(localStorage.getItem('qiye.state.v5'))")
with sync_playwright() as pw:
    temporary=None
    if args.extension:
        temporary=tempfile.TemporaryDirectory(prefix='qiye-source-actions-');directory=Path(temporary.name).resolve()
        assert directory.parent==Path(tempfile.gettempdir()).resolve() and directory.name.startswith('qiye-source-actions-')
        version=json.loads((ROOT/'manifest.json').read_text())['version']
        with zipfile.ZipFile(ROOT/f'dist/qiye-{version}-chrome-edge.zip') as package:package.extractall(directory/'extension')
        context=pw.chromium.launch_persistent_context(str(directory/'profile'),channel='chromium',headless=True,ignore_default_args=['--disable-extensions'],args=['--enable-unsafe-extension-debugging'],viewport={'width':1200,'height':900},locale='zh-CN',timezone_id='Asia/Hong_Kong')
        browser=context.browser;cdp=browser.new_browser_cdp_session()
        extension_id=cdp.send('Extensions.loadUnpacked',{'path':str(directory/'extension')})['id'];base=f'chrome-extension://{extension_id}/index.html'
    else:
        browser=pw.chromium.launch(**({'executable_path':r'C:\Program Files\Google\Chrome\Application\chrome.exe'} if args.live else {}))
        context=browser.new_context(viewport={'width':1200,'height':900},locale='zh-CN',timezone_id='Asia/Hong_Kong')
    context.route('https://ktclat.github.io/qiye-widgets/**',external)
    if not args.live:context.route('https://**/*',external)
    context.add_init_script("if(window===top&&!localStorage.getItem('source-actions-seeded')){localStorage.setItem('qiye.state.v5',%s);localStorage.setItem('qiye.community.v1',%s);localStorage.setItem('source-actions-seeded','yes')}"%(json.dumps(json.dumps(state)),json.dumps(json.dumps([{'url':SOURCE,'enabled':True,'catalog':catalog}]))))
    page=context.new_page();page.set_default_timeout(8000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    try:
        page.goto(base,wait_until='domcontentloaded')
        if args.extension:
            page.evaluate("state=>chrome.storage.local.set({'qiye.state.v5':state})",state);page.reload(wait_until='domcontentloaded')
        page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click();page.locator('[data-source-details]').first.click()
        original=desktop(page)['items'][0]
        status=page.locator('[data-community-status]');refresh=page.locator('[data-source-refresh]');toggle=page.locator('[data-source-toggle]');browse=page.locator('[data-source-browse]')
        page.locator('#dialog').screenshot(path=str(OUT/'before.png'))
        page.mouse.move(0,0);idle=refresh.evaluate('e=>getComputedStyle(e).backgroundColor');refresh.hover();page.wait_for_timeout(180)
        check('Hover visibly highlights the full button',refresh.evaluate('e=>getComputedStyle(e).backgroundColor')!=idle)
        page.mouse.down();check('Pressed button has inset feedback',refresh.evaluate("e=>getComputedStyle(e).boxShadow!=='none'"));page.mouse.up()
        page.wait_for_function("document.querySelector('[data-community-status]').textContent.length>0")
        check('Slow refresh shows a busy button',refresh.get_attribute('aria-busy')=='true')
        check('Pending feedback is inside the visible settings panel',status.evaluate("e=>{const r=e.getBoundingClientRect(),p=e.closest('.settings-content').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom}"))
        page.locator('#dialog').screenshot(path=str(OUT/'checking-dark.png'))
        bounds=refresh.bounding_box();page.mouse.click(bounds['x']+bounds['width']/2,bounds['y']+bounds['height']/2)
        check('Repeated check does not start another request',len(requests)==1)
        toggle.click();expect(toggle).to_have_attribute('aria-checked','false')
        check('Disable works while a refresh is pending',not page.evaluate("JSON.parse(localStorage.getItem('qiye.community.v1'))[0].enabled"))
        for route in held:
            try:route.fulfill(json=catalog,headers={'Access-Control-Allow-Origin':'*'})
            except Exception:pass
        held.clear();page.wait_for_timeout(100)
        check('Late refresh cannot re-enable the source',not page.evaluate("JSON.parse(localStorage.getItem('qiye.community.v1'))[0].enabled"))
        check('Disabling preserves installed data',desktop(page)['items'][0]==original)
        expect(browse).to_be_disabled();toggle.focus();page.keyboard.press('Space');expect(toggle).to_have_attribute('aria-checked','true')
        check('Keyboard toggle keeps focus on the replacement control',toggle.evaluate('e=>e===document.activeElement'))
        refresh.click();expect(refresh).to_have_attribute('aria-busy','true');browse.click()
        page.locator('[data-community-card]').first.wait_for();check('Preview opens during a slow catalog check')
        page.locator('[data-community-query]').fill('便签');card=page.locator('[data-community-card]:visible').first
        card.locator('[data-community-add]').click();expect(status).to_contain_text('已添加')
        check('Add confirms the result immediately',len(desktop(page)['items'])==2)
        page.locator('.community-manage').click();page.locator('[data-source-details]').first.click()
        mode='error';refresh.click();expect(status).to_contain_text('503');expect(refresh).not_to_have_attribute('aria-busy','true')
        check('Failure remains visible and leaves a usable retry button',refresh.is_enabled() and status.is_visible())
        page.locator('#dialog').screenshot(path=str(OUT/'error-dark.png'))
        mode='success';refresh.click();expect(status).to_contain_text('可更新')
        row=page.locator('[data-source-widget]').filter(has=page.get_by_role('heading',name='便签',exact=True))
        row.locator('[data-community-update]').click();expect(status).to_contain_text('原有数据已保留')
        updated=desktop(page)['items'][0]
        check('Update preserves the instance and saved contents',all(updated[k]==original[k] for k in ['id','title','groupId','size','data']) and updated['config']['manifest']['release']==notes['release'])
        expect(row).to_contain_text('已是最新');refresh.click();expect(status).to_contain_text('已是最新')
        page.locator('#dialog').screenshot(path=str(OUT/'updated-dark.png'))
        page.locator('[data-settings-tab=appearance]').click();page.locator('[data-theme=light]').click();page.locator('[data-settings-tab=sources]').click();page.locator('[data-source-details]').first.click()
        page.set_viewport_size({'width':390,'height':844})
        check('Narrow actions have full touch targets',all(button.bounding_box()['height']>=36 for button in [toggle,refresh,browse]))
        check('Narrow panel has no horizontal overflow',page.locator('.settings-content').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
        refresh.click();expect(status).to_contain_text('已是最新');page.locator('#dialog').screenshot(path=str(OUT/'narrow-light.png'))
        page.locator('#dialog [data-close]').first.click();page.reload(wait_until='domcontentloaded');page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click()
        check('Enable state and updated version persist after reload',page.evaluate("JSON.parse(localStorage.getItem('qiye.community.v1'))[0].enabled") and desktop(page)['items'][0]['config']['manifest']['release']=='1.0.0')
        check('No browser exceptions',not errors)
    finally:
        (OUT/'verification.json').write_text(json.dumps({'live':args.live,'catalog_fixture':True,'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        for route in held:
            try:route.abort()
            except Exception:pass
        context.unroute_all(behavior='ignoreErrors')
        browser.close();server.shutdown()
        if temporary:temporary.cleanup()
print(f'PASS {len(checks)} source action checks',flush=True)
