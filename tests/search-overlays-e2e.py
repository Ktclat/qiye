"""Hit-test search overlays against real desktop widgets, in both web builds."""
import argparse
import copy
import json
import os
import subprocess
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'test-results/search-overlays' / ('preview' if args.preview else 'source')
OUT.mkdir(parents=True, exist_ok=True)
seed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {DEFAULT_STATE,STORAGE_KEY} from './src/core.js';console.log(JSON.stringify({state:DEFAULT_STATE,key:STORAGE_KEY}))"], cwd=ROOT))
seed['state']=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
checks, errors = [], []


def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)


def exposed(controls):
    return controls.evaluate_all('''nodes => nodes.length > 0 && nodes.every(n => {
        const r = n.getBoundingClientRect();
        return [.25, .5, .75].every(f => n.contains(document.elementFromPoint(r.x + r.width*f, r.y + r.height/2)));
    })''')


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH')
        browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
        try:
            context = browser.new_context(locale='zh-CN')
            page = context.new_page()
            page.set_default_timeout(7000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**/*', lambda route: route.abort())
            page.goto(f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else ''))
            for width, height in [(1440, 900), (390, 844)]:
                page.set_viewport_size({'width': width, 'height': height})
                for theme in ['dark', 'light']:
                    for pin_clock, pin_search in [(False, False), (True, False), (False, True), (True, True)]:
                        state = copy.deepcopy(seed['state'])
                        state['settings'].update({'autoExtractIcons': False, 'language': 'zh-CN', 'theme': theme,
                                                  'pinClock': pin_clock, 'pinSearch': pin_search})
                        page.evaluate('([key,s])=>localStorage.setItem(key,JSON.stringify(s))', [seed['key'], state])
                        page.reload()
                        page.locator('#desktop .tile-widget').first.wait_for()
                        label = f'{width}px {theme} pins={pin_clock}/{pin_search}'
                        page.locator('#engine-button').click()
                        check(label + ': every engine and settings button is above the desktop', exposed(page.locator('#engine-menu button')))
                        if width == 1440 and not pin_clock and not pin_search:
                            check(label + ': menu actually overlaps widget bounds', page.locator('#engine-menu').evaluate('''n=>{
                                const r=n.getBoundingClientRect();
                                return [...document.querySelectorAll('#desktop .tile-widget')].some(w=>{
                                    const b=w.getBoundingClientRect();return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;
                                });
                            }'''))
                            page.screenshot(path=str(OUT / f'engine-menu-{theme}.png'))
                        page.locator('#engine-menu [data-engine=google]').click()
                        expect(page.locator('#engine-menu')).to_be_hidden()
                        page.wait_for_function('(key)=>JSON.parse(localStorage.getItem(key)).settings.searchEngine==="google"', arg=seed['key'])
                        check(label + ': engine selection is clickable and persisted', page.locator('#engine-button').get_attribute('aria-expanded') == 'false')
                        page.locator('#search-input').fill('GitHub')
                        expect(page.locator('#search-suggestions')).to_be_visible()
                        check(label + ': search suggestions are above the desktop', exposed(page.locator('#search-suggestions button')))
                        page.locator('#search-input').press('ArrowDown')
                        expect(page.locator('#search-suggestions button').first).to_be_focused()
                        page.keyboard.press('Escape')
                        expect(page.locator('#search-suggestions')).to_be_hidden()

            # Desktop edit controls and modal dialogs must retain their intended ordering.
            page.set_viewport_size({'width': 1440, 'height': 900})
            page.reload()
            page.locator('#content-scroll').focus()
            page.keyboard.press('e')
            page.locator('#engine-button').click()
            check('edit mode: search menu remains clickable above tile actions', exposed(page.locator('#engine-menu button')))
            page.locator('#engine-menu [data-action=search-settings]').click()
            expect(page.locator('#dialog')).to_be_visible()
            page.locator('#dialog [data-close]').first.click(trial=True)
            check('search settings open above the desktop', exposed(page.locator('#dialog [data-close]').first))
            page.locator('#dialog [data-close]').first.click()
            expect(page.locator('#dialog')).to_be_hidden()
            page.keyboard.press('Escape')
            page.locator('#engine-button').click()
            page.locator('#clock').click()
            expect(page.locator('#engine-menu')).to_be_hidden()
            page.locator('#engine-button').click()
            check('minimal mode: search engines stay accessible', exposed(page.locator('#engine-menu button')))
            page.keyboard.press('Escape')
            page.set_viewport_size({'width': 1440, 'height': 600})
            page.locator('#engine-button').click()
            page.locator('#content-scroll').evaluate('n=>n.scrollTo({top:100,behavior:"instant"})')
            expect(page.locator('#engine-menu')).to_be_hidden()
            check('scroll closes the menu and updates its trigger', page.locator('#content-scroll').evaluate('n=>n.scrollTop>0') and page.locator('#engine-button').get_attribute('aria-expanded') == 'false')
            check('no runtime exceptions', not errors)
            (OUT / 'results.json').write_text(json.dumps({'checks': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f'{len(checks)} search overlay checks passed', flush=True)
        except Exception:
            if 'page' in locals(): page.screenshot(path=str(OUT / 'failure.png'))
            raise
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
