#!/usr/bin/env python3
"""Real-browser size layouts, catalog previews, adaptive windows and theme controls."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse, copy, json, os, subprocess, threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'test-results/presentation'
OUT.mkdir(parents=True, exist_ok=True)
state = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';import {listWidgetDefinitions,newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const s=structuredClone(DEFAULT_STATE);s.settings.autoExtractIcons=false;s.items=listWidgetDefinitions().map(w=>({id:w.type,groupId:'home',type:'widget',widget:w.type,title:w.title,size:'2x2',config:newWidgetConfig(w.type),data:newWidgetData(w.type)}));console.log(JSON.stringify(s))"], cwd=ROOT))
checks, errors = [], []
def check(name, condition):
    assert condition, name
    checks.append(name)
    print('PASS', name, flush=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        context = browser.new_context(viewport={'width':1440, 'height':900}, locale='zh-CN')
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**/*', lambda route: route.abort())
        page.goto(f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else ''))
        sizes = {'1x1':(60,60), '1x2':(60,150), '2x1':(150,60), '2x2':(150,150), '4x2':(330,150)}
        for theme, language in [('dark','zh-CN'), ('light','en')]:
            for size, dimensions in sizes.items():
                fixture = copy.deepcopy(state)
                fixture['settings'].update({'theme':theme, 'language':language})
                for item in fixture['items']: item['size'] = size
                page.evaluate('(s)=>localStorage.setItem("qiye.state.v5",JSON.stringify(s))', fixture)
                page.reload()
                page.locator('#desktop [data-item=clock]').wait_for()
                rects = page.locator('#desktop .tile-widget').evaluate_all('ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}))')
                check(f'{theme} {size}: exact shared geometry', all(abs(r['w']-dimensions[0])<1 and abs(r['h']-dimensions[1])<1 for r in rects))
                overflow = page.locator('#desktop .widget-inner').evaluate_all('''ns=>ns.flatMap(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('button,input,textarea')].filter(e=>e.getClientRects().length).flatMap(e=>{const b=e.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1?[n.dataset.widget+':'+e.className]:[]})})''')
                check(f'{theme} {size}: controls remain inside frame ({overflow})', not overflow)
                if size in ['1x2','2x2','4x2']:
                    page.screenshot(path=str(OUT/f'{theme}-{size}.png'), animations='disabled')
        page.locator('.top-tools [data-action=add]').click()
        card = page.locator('[data-catalog-widget=countdown]')
        for size in sizes:
            card.locator(f'[data-catalog-size="{size}"]').click()
            check(f'preview {size}: selected layout and accessible dot agree', card.get_attribute('data-preview-size')==size and card.locator('[aria-pressed=true]').get_attribute('data-catalog-size')==size and card.locator('.catalog-preview').get_attribute('data-size')==size)
        card.locator('[data-catalog-step="1"]').click()
        check('next preview wraps to 1x1', card.get_attribute('data-preview-size')=='1x1')
        card.locator('[data-catalog-step="-1"]').click()
        check('previous preview wraps to 4x2', card.get_attribute('data-preview-size')=='4x2')
        card.locator('[data-catalog-size="2x1"]').click()
        page.locator('[data-catalog-widget=calendar] [data-catalog-size="1x2"]').click()
        check('preview size is independent per widget', card.get_attribute('data-preview-size')=='2x1')
        page.locator('#catalog-group').select_option('code')
        card.locator('[data-add-widget]').click()
        page.wait_for_function('document.querySelector("[data-add-feedback]")?.textContent.length > 0')
        check('adding keeps the chooser and selected preview available', page.locator('#dialog').is_visible() and card.get_attribute('data-preview-size')=='2x1')
        page.locator('#dialog [data-close]').click()
        page.locator('#dialog').wait_for(state='hidden')
        saved = page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
        check('add commits displayed size and target group', saved['items'][-1]['size']=='2x1' and saved['items'][-1]['groupId']=='code')
        page.locator('#brand-button').click()
        page.locator('[data-settings-tab=appearance]').click()
        page.locator('[data-preference=settingsPresentation]').select_option('window')
        page.locator('[data-close]').first.click()
        page.locator('#dialog').wait_for(state='hidden')
        page.locator('#brand-button').click()
        page.locator('[data-settings-tab=appearance]').click()
        widths, fonts = [], []
        for percent in ['75','100','125','150']:
            page.locator('[data-preference=windowSize]').select_option(percent)
            widths.append(page.locator('#dialog').bounding_box()['width'])
            fonts.append(page.locator('[data-preference=windowSize]').evaluate('n=>getComputedStyle(n).fontSize'))
            check(f'{percent}% window is unscaled', page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom')=='1')
        check('window sizes allocate more space with constant type size', widths==sorted(set(widths)) and len(set(fonts))==1)
        for theme in ['dark','light']:
            page.locator(f'[data-theme={theme}]').click()
            page.locator('[data-setting=useThemeColor]').check()
            check(f'{theme} accent switch is global', page.locator('html').get_attribute('data-accent')=='custom' and page.locator('#clock').evaluate('n=>getComputedStyle(n).color')=='rgb(121, 215, 180)')
            selector = page.locator('[data-preference=windowSize]')
            colors = selector.evaluate('n=>({scheme:getComputedStyle(n).colorScheme,bg:getComputedStyle(n.options[0]).backgroundColor,fg:getComputedStyle(n.options[0]).color})')
            check(f'{theme} native dropdown has explicit matching palette', colors['scheme']==theme and colors['bg']!='rgba(0, 0, 0, 0)' and colors['bg']!=colors['fg'])
            selector.focus()
            page.keyboard.press('Home')
            page.keyboard.press('Enter')
            check(f'{theme} dropdown retains keyboard selection', selector.input_value()=='75')
            page.locator('[data-setting=useThemeColor]').uncheck()
            check(f'{theme} disabling global accent restores defaults', page.locator('html').get_attribute('data-accent')=='default')
        check('no runtime exceptions', not errors)
        print(f'{len(checks)} presentation checks passed', flush=True)
    finally:
        (OUT/('preview.json' if args.preview else 'source.json')).write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
        server.shutdown()
