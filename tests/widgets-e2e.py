#!/usr/bin/env python3
"""Dialog scaling and widget API/data regression against production modules."""
import argparse
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', default='test-results/widgets')
args = parser.parse_args()
OUT = Path(args.output); OUT.mkdir(parents=True, exist_ok=True)
base_state = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"], cwd=ROOT))
base_state['settings']['language'] = 'zh-CN'
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name); print('PASS', name, flush=True)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    errors = []

    def setup(state=None, width=1440, height=950, extension=False):
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page(); page.set_default_timeout(7000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**/*', lambda route: route.abort())
        if extension:
            page.route('**/widget-extensions.js', lambda route: route.fulfill(content_type='text/javascript', body="import { counterWidget } from './widget-example.js'; export const widgetExtensions = [counterWidget];"))
        payload = json.dumps(state or base_state, ensure_ascii=False)
        page.add_init_script('if(!localStorage.getItem("qiye.state.v4"))localStorage.setItem("qiye.state.v4",' + json.dumps(payload) + ')')
        page.goto(base, wait_until='domcontentloaded')
        page.locator('[data-item]').first.wait_for()
        return context, page

    def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v4"))')

    def add(page, widget):
        page.locator('.top-tools [data-action=add]').click()
        page.locator('[data-add-tab=widgets]').click()
        page.locator(f'[data-add-widget={widget}]').click()
        page.locator('#dialog').wait_for(state='hidden')

    try:
        context, page = setup()
        page.locator('#brand-button').click(); page.locator('[data-settings-tab=appearance]').click()
        for scale in [75, 100, 150]:
            page.locator('#range-dialogScale').fill(str(scale))
            page.locator('#range-dialogScale').dispatch_event('change')
            page.wait_for_function('(s)=>JSON.parse(localStorage.getItem("qiye.state.v4")).settings.dialogScale===s', arg=scale)
            rect = page.locator('#dialog').bounding_box()
            check(f'{scale}% settings remains inside viewport', rect['x'] >= -1 and rect['y'] >= -1 and rect['x'] + rect['width'] <= 1441 and rect['y'] + rect['height'] <= 951)
            check(f'{scale}% actually scales controls', abs(float(page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom')) - scale / 100) < .001)
        page.screenshot(path=str(OUT / 'settings-150.png'))
        page.locator('[data-close]').first.click(); page.reload(); page.locator('#brand-button').click()
        check('scale survives reload', page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom') == '1.5')
        page.locator('[data-settings-tab=appearance]').click(); page.locator('[data-action=reset-dialog-scale]').click()
        check('reset restores 100%', page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom') == '1')
        context.close()

        for theme in ['dark', 'light']:
            state = copy.deepcopy(base_state); state['settings']['language']='zh-CN';state['settings'].update({'dialogScale': 150, 'theme': theme})
            context, page = setup(state, width=360, height=640)
            page.locator('#brand-button').click(); page.locator('[data-settings-tab=appearance]').click()
            check(f'{theme} narrow 150% settings can scroll', page.locator('.settings-content').evaluate('n=>n.scrollHeight>n.clientHeight && n.scrollWidth<=n.clientWidth+1'))
            page.wait_for_timeout(250)
            check(f'{theme} narrow 150% close stays reachable', page.locator('[data-close]').first.evaluate('n=>{const r=n.getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("[data-close]")}'))
            page.screenshot(path=str(OUT / f'settings-mobile-{theme}.png'))
            page.locator('[data-close]').first.click()
            for action in ['add', 'wallpaper']:
                page.locator(f'.top-tools [data-action={action}]').click()
                rect = page.locator('#dialog').bounding_box()
                check(f'{theme} narrow {action} fits', rect['x'] >= -1 and rect['x'] + rect['width'] <= 361 and rect['y'] + rect['height'] <= 641)
                page.locator('[data-close]').first.click()
            context.close()

        state = copy.deepcopy(base_state)
        state['items'] = []
        for widget in ['notes', 'todo', 'habit', 'focus']:
            for index in [1, 2]:
                state['items'].append({'id': f'{widget}-{index}', 'groupId': 'home', 'type': 'widget', 'widget': widget, 'title': f'{widget}-{index}', 'size': '2x2', 'config': copy.deepcopy(next(i['config'] for i in base_state['items'] if i.get('widget') == widget)), 'data': copy.deepcopy(next(i['data'] for i in base_state['items'] if i.get('widget') == widget))})
        context, page = setup(state)
        original = page.locator('[data-item=notes-2] textarea').input_value()
        page.locator('[data-item=notes-1] textarea').fill('first note only')
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v4")).items.find(i=>i.id==="notes-1").data?.notes==="first note only"')
        check('editing one note leaves sibling unchanged', page.locator('[data-item=notes-2] textarea').input_value() == original)
        for widget in ['todo', 'habit']:
            second_before = page.locator(f'[data-item={widget}-2] li').all_text_contents()
            page.locator(f'[data-item={widget}-1] input[name=text]').fill(f'unique {widget}')
            page.locator(f'[data-item={widget}-1] input[name=text]').press('Enter')
            check(f'{widget} new entry is isolated', page.locator(f'[data-item={widget}-2] li').all_text_contents() == second_before)
        page.locator('[data-item=focus-1] [data-action=widget-focus-toggle]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v4")).items.find(i=>i.id==="focus-1").data?.focus.running')
        check('focus timers run independently', page.locator('[data-item=focus-2] [data-live=focus-button]').inner_text() == '开始')
        page.reload(); page.locator('[data-item=notes-1] textarea').wait_for()
        check('independent notes survive reload', page.locator('[data-item=notes-1] textarea').input_value() == 'first note only' and page.locator('[data-item=notes-2] textarea').input_value() == original)
        add(page, 'notes')
        check('new note starts empty', page.locator('[data-widget-input=notes]').last.input_value() == '')
        page.locator('.top-tools [data-action=add]').click(); page.locator('[data-add-tab=widgets]').click()
        page.locator('#widget-query').fill('计时')
        check('catalog filters by purpose', page.locator('[data-add-widget]:visible').count() >= 1 and page.locator('[data-add-widget]:visible').count() < 13)
        page.locator('#widget-query').fill('does-not-exist')
        check('catalog has useful empty state', page.locator('#widget-catalog-empty').is_visible())
        page.locator('#widget-query').fill('便签'); page.locator('[name=widgetSize]').select_option('4x2')
        page.locator('[data-add-widget=notes]').click(); page.locator('#dialog').wait_for(state='hidden')
        check('catalog size selection persists', saved(page)['items'][-1]['size'] == '4x2')
        context.close()

        context, page = setup(extension=True)
        add(page, 'counter')
        page.locator('[data-counter-add]').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v4")).items.find(i=>i.widget==="counter").config.count===1')
        page.locator('[data-widget=counter] [data-action=widget-config]').click()
        page.locator('[name=config-label]').fill('My counter'); page.locator('[name=config-count]').fill('5')
        page.locator('#widget-form button[type=submit]').click(); page.locator('#dialog').wait_for(state='hidden')
        check('extension auto-generated settings persist and render', page.locator('[data-counter-value]').inner_text() == '5' and page.locator('[data-counter-label]').inner_text() == 'My counter')
        add(page, 'counter')
        check('two extension instances are independent', page.locator('[data-counter-value]').all_text_contents() == ['5', '0'])
        page.reload(); page.locator('[data-counter-value]').first.wait_for()
        check('extension state survives reload', page.locator('[data-counter-value]').all_text_contents() == ['5', '0'])
        page.locator('[data-group=code]').click(); page.locator('[data-group=home]').click()
        page.locator('[data-counter-add]').first.click()
        page.wait_for_function('document.querySelector("[data-counter-value]").textContent!=="5"')
        check('remount does not duplicate listeners', page.locator('[data-counter-value]').first.inner_text() == '6')
        first_id=next(i['id'] for i in saved(page)['items'] if i.get('widget')=='counter')
        page.locator(f'[data-item="{first_id}"]').click(button='right',position={'x':3,'y':3});page.locator('#context-menu [data-size="1x1"]').click()
        page.locator(f'[data-item="{first_id}"] [data-compact]').wait_for()
        check('extension compact view is a host launcher',page.locator(f'[data-item="{first_id}"] [data-counter-add]').count()==0)
        page.locator(f'[data-item="{first_id}"] [data-action=widget-open]').click();page.locator('#dialog [data-counter-add]').click()
        page.wait_for_function('(id)=>JSON.parse(localStorage.getItem("qiye.state.v4")).items.find(i=>i.id===id).config.count===7',arg=first_id)
        page.locator('#dialog [data-close]').click();page.locator('#dialog').wait_for(state='hidden')
        check('extension viewer saves without changing desktop size',next(i for i in saved(page)['items'] if i['id']==first_id)['size']=='1x1')
        page.locator('.top-tools [data-action=add]').click();page.locator('[name=widgetSize]').select_option('4x2')
        check('chooser disables unsupported extension size',page.locator('[data-add-widget=counter]').is_disabled())
        page.locator('[name=widgetSize]').select_option('1x1');check('chooser supports extension compact size',page.locator('[data-add-widget=counter]').is_enabled())

        context.close()
        check('no uncaught runtime errors', errors == [])
        print(f'{len(checks)} widget/browser checks passed.', flush=True)
    finally:
        (OUT / 'widget-report.json').write_text(json.dumps({'passed': checks, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close(); server.shutdown()
