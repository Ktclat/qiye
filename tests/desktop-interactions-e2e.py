"""Real website drag/menu actions and persistence, on source, preview, web or MV3."""
import argparse
import copy
import json
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_checks import wait_for_async

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
parser.add_argument('--live', action='store_true')
parser.add_argument('--extension', type=Path)
args = parser.parse_args()
mode = 'extension' if args.extension else 'live' if args.live else 'preview' if args.preview else 'source'
OUT = ROOT / 'output/playwright/desktop-interactions' / mode
OUT.mkdir(parents=True, exist_ok=True)
fixture = json.loads((ROOT / 'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
fixture['groups'] = [dict(id='home', name='常用', icon='home'), dict(id='work', name='工作', icon='folder')]
fixture['activeGroupId'] = 'home'
fixture['items'] = [dict(id=name, type='link', groupId='home', title=name, url=f'https://{name}.example/',
                         icon='globe', iconMode='text', color='#397b70', size='1x1', folderId=None)
                    for name in ['alpha', 'beta', 'gamma', 'delta']]
fixture['items'] += [dict(id='tools', type='folder', groupId='home', title='工具', icon='folder', color='#397b70', size='1x1'),
                     dict(id='child', type='link', groupId='home', title='文件夹网站', url='https://child.example/',
                          icon='globe', iconMode='text', color='#397b70', size='1x1', folderId='tools')]
fixture['settings'].update(language='zh-CN', autoExtractIcons=False, reducedEffects=True, navigationMode='top',
                           rememberGroup=True, gridSize=60, gap=20, dragHoldMs=200)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = 'https://ktclat.github.io/qiye/' if args.live else f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
checks = []

def check(label, condition=True):
    assert condition, label
    checks.append(label)
    print('PASS', label, flush=True)

with tempfile.TemporaryDirectory(prefix='qiye-drag-menu-') as profiles, sync_playwright() as pw:
    browser = None if args.extension else pw.chromium.launch()
    try:
        for theme, width, height in [('dark', 1440, 960), ('light', 1440, 960), ('dark', 390, 640), ('light', 320, 560)]:
            state = copy.deepcopy(fixture)
            state['settings']['theme'] = theme
            options = dict(viewport={'width': width, 'height': height}, locale='zh-CN', timezone_id='Asia/Hong_Kong')
            if args.extension:
                extension = args.extension.resolve()
                context = pw.chromium.launch_persistent_context(str(Path(profiles) / f'{theme}-{width}'), channel='chromium', headless=True,
                    args=[f'--disable-extensions-except={extension}', f'--load-extension={extension}'], **options)
                worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
                base = f'chrome-extension://{worker.url.split("/")[2]}/index.html'
            else:
                context = browser.new_context(**options)
                context.add_init_script("if(window===window.top&&!localStorage.getItem('qiye.state.v5'))localStorage.setItem('qiye.state.v5',%s)" % json.dumps(json.dumps(state)))
            page = context.new_page()
            page.set_default_timeout(10000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            # Only fixture destinations and icon services are blocked. Public host files load normally.
            context.route('https://*.example/**', lambda route: route.fulfill(status=200, body='Test website'))
            context.route('https://www.google.com/s2/**', lambda route: route.abort())
            context.route('https://icons.duckduckgo.com/**', lambda route: route.abort())
            page.goto(base)
            if args.extension:
                page.locator('#desktop .tile-link').first.wait_for()
                page.evaluate("state=>chrome.storage.local.set({'qiye.state.v5':state})", state)
                page.reload()
            page.locator('[data-item="alpha"]').wait_for()
            prefix = f'{theme}/{width}'
            saved_js = "(await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']" if args.extension else "JSON.parse(localStorage.getItem('qiye.state.v5'))"
            def saved(): return page.evaluate(f'async()=>{saved_js}')
            def persisted(predicate): return wait_for_async(page, f'async()=>{{const s={saved_js};return {predicate};}}')
            def tile(item): return page.locator(f'#desktop>[data-item="{item}"]')
            def order(): return page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')
            def menu(item):
                tile(item).click(button='right')
                expect(page.locator('#context-menu')).to_be_visible()
            def bounds():
                return page.locator('#context-menu').evaluate('n=>{const r=n.getBoundingClientRect();return r.left>=7&&r.top>=7&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7}')
            def begin(item, target, x=.88, y=.82):
                tile(item).scroll_into_view_if_needed()
                a = tile(item).bounding_box()
                b = page.locator(target).bounding_box()
                page.mouse.move(a['x']+a['width']/2, a['y']+a['height']/2)
                page.mouse.down()
                page.mouse.move(b['x']+b['width']*x, b['y']+b['height']*y, steps=18)
                page.wait_for_function('document.body.classList.contains("is-dragging")')

            try:
                menu('alpha')
                check(prefix+' website menu is bounded and has no widget sizes', bounds() and page.locator('#context-menu [data-context=resize]').count()==0)
                page.keyboard.press('End')
                expect(page.locator('#context-menu [data-context=delete]')).to_be_focused()
                page.keyboard.press('Home')
                expect(page.locator('#context-menu [data-context=edit]')).to_be_focused()
                page.keyboard.press('Escape')
                expect(tile('alpha')).to_be_focused()
                check(prefix+' keyboard menu navigation returns focus')
                menu('alpha')
                page.locator('#groups [data-group=work]').click()
                expect(page.locator('#context-menu')).to_be_hidden()
                persisted("s.activeGroupId==='work'")
                page.locator('#groups [data-group=home]').click()
                check(prefix+' switching groups dismisses the old item menu')
                menu('alpha')
                page.locator('#engine-button').click()
                expect(page.locator('#context-menu')).to_be_hidden()
                page.keyboard.press('Escape')
                check(prefix+' opening search controls dismisses the item menu')
                menu('alpha')
                page.locator('#groups [data-group=work]').focus()
                page.keyboard.press('Enter')
                expect(page.locator('#context-menu')).to_be_hidden()
                page.locator('#groups [data-group=home]').click()
                check(prefix+' keyboard activation also dismisses the previous menu')

                menu('alpha')
                page.locator('[data-context=duplicate]').click()
                persisted('s.items.length===7')
                copy_id = next(i['id'] for i in saved()['items'] if i['id'] not in [x['id'] for x in state['items']])
                menu(copy_id)
                page.locator('[data-context=delete]').click()
                persisted('s.items.length===6')
                page.locator('#toast button').click()
                persisted('s.items.length===7')
                menu(copy_id)
                page.locator('[data-context=delete]').click()
                persisted('s.items.length===6')
                check(prefix+' duplicate, remove and undo affect only the selected website')
                menu('delta')
                page.locator('[data-context=move]').click()
                page.locator('#move-form [name=groupId]').select_option('work')
                page.locator('#move-form button[type=submit]').click()
                persisted("s.items.find(i=>i.id==='delta').groupId==='work'")
                check(prefix+' context menu moves a website to the selected group')

                before = order()
                tile('alpha').focus()
                page.keyboard.press('Alt+ArrowRight')
                page.wait_for_function('before=>JSON.stringify([...document.querySelectorAll("#desktop>[data-item]")].map(n=>n.dataset.item))!==JSON.stringify(before)', arg=before)
                check(prefix+' keyboard reorder works')
                before = order()
                begin('alpha', '[data-item="tools"]')
                page.wait_for_timeout(200)
                page.keyboard.press('Escape')
                page.mouse.up()
                check(prefix+' Escape restores the exact order and does not open a website', order()==before and len(context.pages)==(2 if args.extension else 1))
                begin('alpha', '[data-item="tools"]')
                page.wait_for_timeout(180)
                page.mouse.up()
                expected = order()
                check(prefix+' pointer reorder changes the visible order', expected!=before)
                persisted('s.items.filter(i=>i.groupId===s.activeGroupId&&!i.folderId).map(i=>i.id).join(",")==='+json.dumps(','.join(expected)))
                page.reload()
                tile('alpha').wait_for()
                check(prefix+' pointer order persists after reload', order()==expected)
                begin('gamma', '[data-item="tools"]', .5, .4)
                page.locator('[data-item="tools"].drop-inside').wait_for()
                page.mouse.up()
                persisted("s.items.find(i=>i.id==='gamma').folderId==='tools'")
                tile('tools').click()
                child = page.locator('[data-folder-item="gamma"] .folder-link')
                child.focus()
                page.keyboard.press('Shift+F10')
                expect(page.locator('#dialog #context-menu [data-context=edit]')).to_be_visible()
                page.keyboard.press('Escape')
                expect(child).to_be_focused()
                page.locator('#dialog [data-close]').first.click()
                check(prefix+' folder drop keeps existing children and supports keyboard right-click inside')
                begin('beta', '#groups [data-group=work]', .5, .5)
                page.mouse.up()
                persisted("s.items.find(i=>i.id==='beta').groupId==='work'")
                page.reload()
                tile('alpha').wait_for()
                check(prefix+' cross-group drag persists without changing folder children', all(i['folderId']=='tools' for i in saved()['items'] if i['id'] in ['gamma','child']))
                # Exercise genuine edge positioning, including a short narrow window.
                page.mouse.click(width-2, height-2, button='right')
                expect(page.locator('#context-menu')).to_be_visible()
                check(prefix+' menu remains reachable at the bottom-right edge', bounds())
                page.screenshot(path=str(OUT/f'{theme}-{width}.png'))
                page.keyboard.press('Escape')
                # Start a fresh, isolated desktop to verify folder dwell and a whole-folder move.
                page.evaluate("state=>chrome.storage.local.set({'qiye.state.v5':state})" if args.extension else "state=>localStorage.setItem('qiye.state.v5',JSON.stringify(state))", state)
                page.reload()
                tile('alpha').wait_for()
                begin('alpha', '[data-item="beta"]', .5, .4)
                page.locator('[data-item="beta"].folder-ready').wait_for()
                page.mouse.up()
                persisted("s.items.filter(i=>i.type==='folder').length===2")
                folder_id = next(i['id'] for i in saved()['items'] if i['type']=='folder' and i['id']!='tools')
                check(prefix+' deliberate hover creates one folder containing both websites', all(i.get('folderId')==folder_id for i in saved()['items'] if i['id'] in ['alpha','beta']))
                begin(folder_id, '#groups [data-group=work]', .5, .5)
                page.mouse.up()
                persisted('s.items.filter(i=>'+json.dumps(['alpha','beta',folder_id])+'.includes(i.id)).every(i=>i.groupId==="work")')
                page.reload()
                tile('tools').wait_for()
                check(prefix+' moving a folder keeps both children in its group after reload', all(i['groupId']=='work' for i in saved()['items'] if i['id'] in ['alpha','beta',folder_id]))
                check(prefix+' no browser exceptions', not errors)
            except Exception:
                page.screenshot(path=str(OUT/f'failure-{theme}-{width}.png'))
                raise
            finally:
                context.close()
    finally:
        if browser: browser.close()
        server.shutdown()
print(f'PASS {len(checks)} desktop drag/context checks; {mode}', flush=True)
