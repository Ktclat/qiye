#!/usr/bin/env python3
"""Host gestures, every widget size, viewer, chooser and window preferences."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse, json, os, subprocess, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
OUT=ROOT/'test-results/interactions';OUT.mkdir(parents=True,exist_ok=True)
state=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';import {listWidgetDefinitions,newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const s=structuredClone(DEFAULT_STATE);s.settings.language='zh-CN';s.settings.autoExtractIcons=false;s.items=listWidgetDefinitions().map(w=>({id:w.type,groupId:'home',type:'widget',widget:w.type,title:w.title,size:'1x1',config:newWidgetConfig(w.type),data:newWidgetData(w.type)}));console.log(JSON.stringify(s))"],cwd=ROOT))
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name);print('PASS',name,flush=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}))
    try:
        context=browser.new_context(viewport={'width':1440,'height':950},locale='zh-CN')
        page=context.new_page();page.set_default_timeout(10000);errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://**/*',lambda r:r.abort())
        page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(json.dumps(state))+')')
        page.goto(f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else ''))
        page.locator('[data-item=calendar]').wait_for()
        def saved():return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v5"))')
        def close():
            page.locator('#dialog [data-close]').first.click();page.locator('#dialog').wait_for(state='hidden')
        check('all registered compact widgets render',page.locator('#desktop [data-widget][data-display-size="1x1"]').count()==len(state['items']))
        # The same pointer target has a short-click action and a long-press drag.
        button=page.locator('[data-item=calendar] [data-action=widget-open]');r=button.bounding_box()
        page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down();page.wait_for_timeout(380)
        check('long press on a widget button lifts entire card',page.locator('.drag-ghost').count()==1)
        page.keyboard.press('Escape');page.mouse.up();page.wait_for_timeout(60)
        check('cancel suppresses click and removes ghost',page.locator('.drag-ghost').count()==0 and not page.locator('#dialog').is_visible())
        button.click();check('short click opens calendar',page.locator('.calendar-app').is_visible())
        r=page.locator('#dialog').bounding_box();check('calendar default window is compact',r['width']<=1061 and r['height']<=691)
        page.screenshot(path=str(OUT/'calendar.png'),animations='disabled');close()
        original=[i['id'] for i in saved()['items']]
        a=button.bounding_box();b=page.locator('[data-item=notes]').bounding_box()
        page.mouse.move(a['x']+a['width']/2,a['y']+a['height']/2);page.mouse.down();page.wait_for_timeout(380)
        page.mouse.move(b['x']+b['width']-5,b['y']+b['height']/2,steps=12);page.wait_for_timeout(120);page.mouse.up()
        page.wait_for_function('(order)=>JSON.parse(localStorage.getItem("qiye.state.v5")).items.map(i=>i.id).join()!==order',arg=','.join(original))
        check('long press button drag commits without opening detail',not page.locator('#dialog').is_visible())
        for item in state['items']:
            widget=item['widget'];page.locator(f'[data-item={widget}] [data-action=widget-open]').click()
            check(f'{widget} compact opens interactive content',page.locator('#dialog').is_visible())
            if widget=='converter':
                page.locator('#cv-expression').fill('6*7');page.locator('#cv-expression').press('Enter')
                check('compact calculator evaluates in viewer',page.locator('#cv-expression').input_value()=='42')
            if widget=='notes':page.locator('#dialog textarea').fill('Compact note survives closing')
            close()
        page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.widget==="notes").data.notes.includes("survives")')
        check('viewer edits persist',True)
        for size in ['1x1','1x2','2x1','2x2','4x2']:
            # Persist a size change through the host's real context menu.
            for item in state['items']:
                tile=page.locator(f'[data-item={item["id"]}]');tile.click(button='right',position={'x':3,'y':3})
                page.locator(f'#context-menu [data-size="{size}"]').click()
                page.wait_for_function('([id,size])=>JSON.parse(localStorage.getItem("qiye.state.v5")).items.find(i=>i.id===id).size===size',arg=[item['id'],size])
            check(f'all widgets accept {size}',all(i['size']==size for i in saved()['items']))
            check(f'{size} controls stay within their frame',page.locator('#desktop .widget-inner').evaluate_all('''ns=>ns.every(n=>{const r=n.getBoundingClientRect();return [...n.querySelectorAll('button,input,textarea')].filter(e=>e.getClientRects().length).every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1 && b.right<=r.right+1 && b.top>=r.top-1 && b.bottom<=r.bottom+1})})'''))
            if size=='2x2':page.screenshot(path=str(OUT/'widgets.png'),animations='disabled')
        page.locator('#brand-button').click();check('settings defaults to right drawer',page.locator('#dialog').evaluate('n=>n.classList.contains("settings-drawer")'))
        page.locator('[data-settings-tab=appearance]').click();page.locator('[data-preference=settingsPresentation]').select_option('window')
        check('presentation is unchanged during current session',page.locator('#dialog').evaluate('n=>n.classList.contains("settings-drawer")'))
        page.locator('[data-settings-tab=general]').click();check('switching settings tabs retains drawer',page.locator('#dialog').evaluate('n=>n.classList.contains("settings-drawer")'))
        close();page.locator('#brand-button').click();check('reopening applies centered presentation',not page.locator('#dialog').evaluate('n=>n.classList.contains("settings-drawer")'))
        page.locator('[data-settings-tab=appearance]').click();before=page.locator('#dialog').bounding_box()['width']
        page.locator('[data-preference=windowSize]').select_option('75')
        check('window size changes independently of scale',page.locator('#dialog').bounding_box()['width']<before and page.locator('#dialog').evaluate('n=>getComputedStyle(n).zoom')=='1')
        page.locator('[data-preference=windowSize]').select_option('100')
        page.locator('[data-preference=settingsPresentation]').select_option('sidebar');close();page.locator('#brand-button').click()
        page.screenshot(path=str(OUT/'settings.png'),animations='disabled');close()
        page.locator('.top-tools [data-action=add]').click();check('add defaults to widget showcase',page.locator('[data-catalog-card]').count()==len(state['items']))
        page.screenshot(path=str(OUT/'catalog.png'),animations='disabled')
        page.locator('[data-catalog-category="工具"]').click();check('category filters actual catalog',page.locator('[data-catalog-card]:visible').evaluate_all('nodes=>nodes.every(node=>node.dataset.category==="工具")') and page.locator('[data-catalog-widget=converter]').is_visible())
        page.locator('#widget-query').fill('nothing-matches');check('combined search shows empty state',page.locator('#widget-catalog-empty').is_visible())
        page.locator('[data-add-tab=sites]').click();page.locator('#widget-query').fill('github');page.locator('#catalog-group').select_option('code')
        page.locator('[data-catalog-card]:visible [data-add-site]').first.click();page.locator('#dialog').wait_for(state='hidden');check('website picker honors target group',saved()['items'][-1]['groupId']=='code')
        page.locator('.top-tools [data-action=add]').click();page.locator('#catalog-group').select_option('life');page.locator('[data-catalog-widget=converter] [data-catalog-size="1x1"]').click();page.locator('[data-add-widget=converter]').click();page.locator('#dialog').wait_for(state='hidden')
        check('widget picker honors size and group',saved()['items'][-1]['size']=='1x1' and saved()['items'][-1]['groupId']=='life')
        page.locator('#dialog').wait_for(state='hidden')
        page.locator(f'[data-item="{saved()["items"][-1]["id"]}"]').wait_for()
        page.locator('#content-scroll').click(button='right',position={'x':10,'y':10});page.screenshot(path=str(OUT/'context.png'),animations='disabled')
        check('desktop menu keeps eight actions',page.locator('#context-menu [data-context]').count()==8)
        check('no runtime exceptions',not errors)
        (OUT/('preview.json' if args.preview else 'source.json')).write_text(json.dumps({'checks':checks,'errors':errors},indent=2),encoding='utf-8')
        print(f'{len(checks)} checks passed',flush=True)
    finally:browser.close();server.shutdown()
