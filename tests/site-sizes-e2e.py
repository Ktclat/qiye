"""Website shortcut geometry: real desktop, five spans, loaded and failed icons."""
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
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
            page.goto(base + ('/Qiye-preview.html' if args.preview else '/'))
            page.locator('[data-item="loaded-4x2"] .site-visual.is-loaded').wait_for()
            for tile in page.locator('.tile-link').all():
                result = tile.evaluate('''n=>{
                  const b=n.querySelector('.tile-body'),l=n.querySelector('.tile-label');
                  const frame=n.getBoundingClientRect(),icon=b.getBoundingClientRect(),label=l.getBoundingClientRect();
                  const horizontal=['2x1','4x2'].includes(n.dataset.size);
                  return {size:n.dataset.size,square:Math.abs(icon.width-icon.height)<1,
                    max:icon.width<=Math.max(96,parseFloat(getComputedStyle(n).getPropertyValue('--tile-size')))+1,
                    fit:icon.left>=frame.left-1&&icon.right<=frame.right+1&&icon.top>=frame.top-1&&icon.bottom<=frame.bottom+1,
                    labelFit:label.left>=frame.left-1&&label.right<=frame.right+1,
                    gap:horizontal?label.left-icon.right:label.top-icon.bottom,
                    textVisible:label.width>12&&label.height>=12,
                    contain:!n.querySelector('img')||getComputedStyle(n.querySelector('img')).objectFit==='contain'};
                }''')
                assert result['square'] and result['max'] and result['fit'] and result['labelFit'] and result['textVisible'] and result['contain'], (width, grid, theme, result)
                assert -1 <= result['gap'] <= 17, (width, grid, theme, result)
                checks += 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
            if grid == 74:
                page.screenshot(path=str(OUT/f'{theme}-{width}{"-preview" if args.preview else ""}.png'), full_page=True)
            # Resize through the actual menu and verify saved geometry after reload.
            tile = page.locator('[data-item="loaded-1x1"]')
            tile.click(button='right')
            page.locator('#context-menu [data-context="resize"][data-size="1x2"]').click()
            page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id==="loaded-1x1").size==="1x2"')
            page.reload()
            page.locator('[data-item="loaded-1x1"][data-size="1x2"] .site-visual.is-loaded').wait_for()
            assert not errors, errors
            context.close()
    browser.close()
server.shutdown()
print(f'PASS {checks} website size/theme/icon geometry checks; resize persistence; preview={args.preview}')
