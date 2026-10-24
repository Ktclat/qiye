"""Legacy website spans normalize to a standard icon, with menus and saved state verified."""
import argparse
import base64
import copy
import json
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/site-sizes'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
base_state = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
sizes = ['1x1', '1x2', '2x1', '2x2', '4x2']
artwork = 'data:image/png;base64,' + base64.b64encode((ROOT/'icons/icon128.png').read_bytes()).decode()
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
checks = 0
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width, grid in [(1440, 48), (1440, 74), (1440, 120), (520, 74), (360, 48)]:
        for theme in ['dark', 'light']:
            context = browser.new_context(viewport={'width': width, 'height': 1080}, locale='zh-CN')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            # Local, selected artwork stays selected. Failed icons exercise the
            # exact fallback path in the user's screenshot, not a CSS-only mock.
            context.route('https://**/*', lambda route: route.fulfill(status=404, body='offline'))
            state = copy.deepcopy(base_state)
            state['settings'].update({'language': 'zh-CN', 'theme': theme, 'gridSize': grid,
                'autoExtractIcons': False, 'labelSize': 16, 'gap': 30})
            state['items'] = [dict(id=f'{kind}-{size}', type='link', groupId='home',
                title='较长的网站名称 · Example' if kind == 'loaded' else 'Spotify',
                url=f'https://{kind}.example/', icon='globe', iconMode='auto',
                iconUrl=artwork if kind == 'loaded' else None,
                color='#397b70', size=size, folderId=None)
                for kind in ['loaded', 'failed'] for size in sizes]
            state['items'].append(dict(id='folder-standard',type='folder',groupId='home',title='保留文件夹尺寸',icon='folder',color='#397b70',size='2x2'))
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
            page.goto(base + ('/Qiye-preview.html' if args.preview else '/'))
            page.locator('[data-item="loaded-4x2"] .site-visual.is-loaded').wait_for()
            for tile in page.locator('.tile-link').all():
                result = tile.evaluate('''n=>{
                  const b=n.querySelector('.tile-body'),l=n.querySelector('.tile-label');
                  const frame=n.getBoundingClientRect(),icon=b.getBoundingClientRect(),label=l.getBoundingClientRect();

                  return {size:n.dataset.size,square:Math.abs(icon.width-icon.height)<1,
                    max:icon.width<=Math.max(96,parseFloat(getComputedStyle(n).getPropertyValue('--tile-size')))+1,
                    fit:icon.left>=frame.left-1&&icon.right<=frame.right+1&&icon.top>=frame.top-1&&icon.bottom<=frame.bottom+1,
                    labelFit:label.left>=frame.left-1&&label.right<=frame.right+1,
                    gap:label.top-icon.bottom,
                    textVisible:label.width>12&&label.height>=12,
                    contain:!n.querySelector('img')||getComputedStyle(n.querySelector('img')).objectFit==='contain'};
                }''')
                assert result['size']=='1x1', result
                assert result['square'] and result['max'] and result['fit'] and result['labelFit'] and result['textVisible'] and result['contain'], (width, grid, theme, result)
                assert -1 <= result['gap'] <= 17, (width, grid, theme, result)
                checks += 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
            if grid == 74:
                page.screenshot(path=str(OUT/f'{theme}-{width}{"-preview" if args.preview else ""}.png'), full_page=True)
            # Keyboard context menu has no per-website size controls; edit/save
            # persists the normalized record without changing its selected image.
            tile = page.locator('[data-item="loaded-1x1"]')
            tile.focus();tile.press('Shift+F10')
            assert page.locator('#context-menu [data-context="edit"]').is_visible()
            assert page.locator('#context-menu [data-context="resize"]').count()==0
            page.locator('#context-menu [data-context="edit"]').click()
            assert page.locator('#link-form [name="size"]').count()==0
            page.locator('#link-form [name="title"]').fill('保留选定图标')
            page.locator('#link-form button[type="submit"]').click()
            page.locator('#dialog').wait_for(state='hidden')
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.filter(i=>i.type==="link").every(i=>i.size==="1x1")')
            saved=page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
            assert [i['id'] for i in saved['items']]==[i['id'] for i in state['items']]
            for old,new in zip(state['items'],saved['items']):
                if old['type']!='link':
                    assert old==new
                    continue
                assert new['url']==old['url'] and new['folderId']==old['folderId']
                assert new.get('iconUrl')==old.get('iconUrl')
            page.reload()
            page.locator('[data-item="loaded-1x1"][data-size="1x1"] .site-visual.is-loaded').wait_for()
            assert page.locator('.tile-link:not([data-size="1x1"])').count()==0
            # Folder sizing is intentionally still available and persistent.
            page.locator('[data-item="folder-standard"]').click(button='right')
            page.locator('#context-menu [data-context="resize"][data-size="2x1"]').click()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="folder-standard").size==="2x1"')
            assert not errors, errors
            context.close()
    browser.close()
server.shutdown()
print(f'PASS {checks} standard website geometry checks; legacy migration, menus, folder resize and persistence; preview={args.preview}')
