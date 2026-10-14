"""Smoke test an unpacked MV3 build in a disposable browser profile."""
import json,os,tempfile,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
key=subprocess.check_output(['node','--input-type=module','-e',"import {STORAGE_KEY} from './src/core.js';console.log(STORAGE_KEY)"],cwd=root,text=True).strip()
(root/'test-results').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='qiye-extension-') as profile, sync_playwright() as p:
    context=p.chromium.launch_persistent_context(profile,**({'executable_path':os.environ['CHROMIUM_PATH']} if os.environ.get('CHROMIUM_PATH') else {'channel':'chromium'}),headless=True,locale='en-US',args=[f'--disable-extensions-except={root}',f'--load-extension={root}'])
    try:
        worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=20000)
        extension_id=worker.url.split('/')[2]
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'chrome-extension://{extension_id}/index.html')
        page.locator('[data-widget=memo]').wait_for()
        page.locator('#engine-button').click()
        assert page.locator('#engine-menu button').evaluate_all('ns=>ns.every(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})'), 'Search engines must be above widgets'
        page.locator('#engine-menu [data-engine=google]').click()
        expect(page.locator('#engine-menu')).to_be_hidden()
        page.wait_for_function('async key=>(await chrome.storage.local.get(key))[key]?.settings.searchEngine==="google"',arg=key)
        page.locator('#brand-button').click();page.locator('[data-preference=language]').select_option('en');page.wait_for_function('document.querySelector("#workspace-title")?.textContent==="Settings"')
        page.locator('[data-close]').first.click();page.locator('#dialog').wait_for(state='hidden')
        page.locator('[data-widget=memo] [data-action=widget-memo-new]').first.click();page.locator('#memo-title').fill('Extension test');page.locator('#memo-text').fill('Uses chrome.storage.local')
        page.locator('[data-close]').first.click();page.locator('#dialog').wait_for(state='hidden')
        page.wait_for_function('async(key)=>{const s=await chrome.storage.local.get(key);return s[key]?.items.some(i=>i.widget==="memo"&&i.data.entries.some(e=>e.title==="Extension test"))}',arg=key)
        page.reload();page.locator('[data-widget=memo]').wait_for()
        expect(page.locator('[data-widget=memo]')).to_contain_text('Extension test')
        page.goto(f'chrome-extension://{extension_id}/popup.html');page.wait_for_function('document.documentElement.lang==="en"');assert page.locator('h1').inner_text()=='Save this page'
        manifest=page.evaluate('chrome.runtime.getManifest()');assert manifest['version']==version and '__MSG_' not in manifest['name'];assert not errors,errors
        community=json.loads((root/'community/widgets/qiye.counter.json').read_text(encoding='utf-8'))
        await_state=page.evaluate('''async ([key,manifest])=>{const s=(await chrome.storage.local.get(key))[key];s.items.push({id:'community-test',groupId:'home',type:'widget',widget:'community',title:'Counter test',size:'1x1',config:{manifest,source:'https://ktclat.github.io/qiye/community/index.json'},data:{value:'null'}});await chrome.storage.local.set({[key]:s})}''',[key,community])
        page.route('https://ktclat.github.io/qiye/community/examples/counter/index.html',lambda route:route.fulfill(body=(root/'community/examples/counter/index.html').read_text(encoding='utf-8'),content_type='text/html',headers={'Access-Control-Allow-Origin':'*'}))
        page.route('https://ktclat.github.io/qiye/community/sdk.js',lambda route:route.fulfill(body=(root/'community/sdk.js').read_text(encoding='utf-8'),content_type='text/javascript',headers={'Access-Control-Allow-Origin':'*'}))
        page.goto(f'chrome-extension://{extension_id}/index.html');page.locator('#desktop [data-item=community-test]').focus();page.keyboard.press('Enter');assert page.locator('.community-frame-host iframe').count()==0
        page.locator('[data-community-run]').click();expect(page.locator('[data-community-status]')).to_have_text('Widget is running')
        page.frame_locator('.community-frame-host iframe').locator('#increase').click()
        page.wait_for_function('async key=>(await chrome.storage.local.get(key))[key].items.find(i=>i.id==="community-test").data.value===\'{"count":1}\'',arg=key)
        assert page.frame_locator('.community-frame-host iframe').locator('body').evaluate('()=>{try{void parent.document;return false}catch{return true}}')
        page.locator('[data-close]').first.click();expect(page.locator('.community-frame-host iframe')).to_have_count(0);assert not errors,errors
        result={'browser':context.browser.version if context.browser else 'Chromium','manifest_name':manifest['name'],'version':version,'checks':['MV3 service worker starts','new tab loads bundled modules','search menu receives pointer events above widgets','selected search engine saves to chrome.storage.local','English preference persists','memo uses chrome.storage.local','memo survives reload','popup uses chosen language','manifest locale placeholders resolve'],'errors':errors}
        result['checks']+=['community detail waits for explicit run','MV3 CSP allows isolated community handshake','community saves its own chrome.storage.local data','community cannot access extension DOM','closing removes the remote iframe']
        (root/'test-results/extension-smoke.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
    except Exception:
        if 'page' in locals() and not page.is_closed():
            try:
                page.screenshot(path=str(root/'test-results/extension-failure.png'))
                diagnostic={'body':page.locator('body').inner_text(),'stored':page.evaluate('async(key)=>(await chrome.storage.local.get(key))[key]',key),'errors':errors}
                (root/'test-results/extension-failure.json').write_text(json.dumps(diagnostic,ensure_ascii=False,indent=2),encoding='utf-8')
                print(json.dumps(diagnostic,ensure_ascii=False),flush=True)
            except Exception:pass
        raise
    finally:
        context.close()
