#!/usr/bin/env python3
"""Map workspace interactions with controlled provider responses, never live tile scans."""
import argparse
import copy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/playwright/map'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--preview', action='store_true')
args = parser.parse_args()
seed = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {DEFAULT_STATE} from './src/core.js';import {newWidgetConfig} from './src/widget-registry.js';import {newWidgetData} from './src/widget-data.js';const state=structuredClone(DEFAULT_STATE);state.items=[{id:'map-e2e',groupId:'home',type:'widget',widget:'map',title:'地图',size:'4x2',config:newWidgetConfig('map'),data:newWidgetData('map')}];console.log(JSON.stringify(state))"], cwd=ROOT))
checks = []

def check(label, condition=True):
    assert condition, label
    checks.append(label)
    print('PASS', label, flush=True)

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/' + ('Qiye-preview.html' if args.preview else '')
tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7ece1"/><path d="M0 0H256V256H0Z M0 128H256 M128 0V256" fill="none" stroke="#d4ddcf"/><text x="24" y="60" fill="#71866c" font-size="12">CONTROLLED TEST TILE</text></svg>'
with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_PATH')
    browser = p.chromium.launch(**({'executable_path': executable} if executable else {}))
    try:
        for language, theme in [('zh-CN', 'light'), ('en', 'dark')]:
            state = copy.deepcopy(seed)
            state['settings'].update(language=language, theme=theme, autoExtractIcons=False)
            context = browser.new_context(viewport={'width':1440,'height':960}, permissions=['clipboard-read','clipboard-write'])
            page = context.new_page()
            page.set_default_timeout(10000)
            errors, requests = [], []
            fail_tiles = [False]
            page.on('pageerror', lambda error: errors.append(str(error)))
            map_hosts=['tile.openstreetmap.org','mapapi.geodata.gov.hk','wmts.nlsc.gov.tw','tianditu.gov.cn','restapi.amap.com','tiles.example.com','api.hkmapservice.gov.hk']
            page.on('request', lambda request: requests.append(request.url) if any(host in request.url for host in map_hosts) else None)
            def route_network(route):
                request = route.request.url
                if '/v3/place/text' in request:
                    route.fulfill(json={'status':'1','pois':[{'name':'深圳测试地点','location':'114.0630,22.5400','address':'Test address'}]})
                elif any(host in request for host in ['tile.openstreetmap.org','mapapi.geodata.gov.hk','wmts.nlsc.gov.tw','tianditu.gov.cn','restapi.amap.com','tiles.example.com']):
                    if fail_tiles[0]: route.abort()
                    else: route.fulfill(body=tile, content_type='image/svg+xml', headers={'Access-Control-Allow-Origin':'*'})
                else: route.abort()
            page.route('https://**/*', route_network)
            payload = json.dumps(state, ensure_ascii=False)
            page.add_init_script('if(!localStorage.getItem("qiye.state.v5"))localStorage.setItem("qiye.state.v5",'+json.dumps(payload)+')')
            try:
                page.goto(url, wait_until='domcontentloaded')
                page.locator('#desktop [data-widget=map]').wait_for()
                check(f'{language} card does not request any map provider', not requests)
                page.locator('#desktop .map-card-open').click()
                expect(page.locator('.map-app')).to_be_visible()
                check(f'{language} unopened maps remain offline', not requests)
                expect(page.locator('[data-map-gate]')).to_be_visible()
                query=page.locator('#map-search-form [name=query]')
                query.fill('澳門')
                expect(page.locator('[data-map-result]')).to_have_count(1)
                page.locator('[data-map-result]').click()
                check(f'{language} traditional place alias selects Macao', page.locator('.map-regions [data-map-region=MO]').get_attribute('aria-pressed')=='true')
                page.locator('[data-map-action=favorite]').click()
                expect(page.locator('[data-map-favorite-count]')).to_have_text('1')
                query.fill('')
                page.locator('[data-map-tab=favorites]').click()
                page.locator('[data-map-result]').click()
                check(f'{language} saved places reopen without schema errors', page.locator('[data-map-action=favorite]').get_attribute('aria-pressed')=='true')
                page.locator('[data-map-action=copy]').click()
                check(f'{language} coordinates copy with their coordinate system', 'WGS84' in page.evaluate('navigator.clipboard.readText()'))
                page.locator('.map-regions [data-map-region=HK]').click()
                page.locator('[data-map-action=enable]').click()
                expect(page.locator('[data-map-gate]')).to_be_hidden()
                page.wait_for_function('document.querySelector(".map-image-plane img")?.complete')
                check(f'{language} Hong Kong uses official base and labels', any('/basemap/WGS84/' in u for u in requests) and any('/label/hk/' in u for u in requests))
                expect(page.locator('[data-map-layer=satellite]')).to_be_disabled()
                check(f'{language} attribution remains visible', page.locator('[data-map-attribution]').is_visible() and 'Lands Department' in page.locator('[data-map-attribution]').inner_text())
                before=page.locator('[data-map-center]').inner_text()
                viewport=page.locator('.map-viewport')
                rect=viewport.bounding_box()
                page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2)
                page.mouse.down()
                page.mouse.move(rect['x']+rect['width']/2+80,rect['y']+rect['height']/2+40,steps=8)
                page.mouse.up()
                check(f'{language} dragging changes map center', page.locator('[data-map-center]').inner_text()!=before)
                center=page.locator('[data-map-center]').inner_text()
                check(f'{language} drag stays near Hong Kong', 113<float(center.split(',')[0])<115)
                page.locator('[data-map-action=zoom-in]').click()
                viewport.focus()
                viewport.press('ArrowRight')
                check(f'{language} keyboard panning works', page.locator('[data-map-center]').inner_text()!=center)
                page.locator('.map-regions [data-map-region=TW]').click()
                page.wait_for_function('document.querySelector("[data-map-provider]").textContent.includes("Taiwan") || document.querySelector("[data-map-provider]").textContent.includes("台湾")')
                page.locator('[data-map-layer=satellite]').click()
                page.wait_for_function('document.querySelector("[data-map-layer=satellite]").getAttribute("aria-pressed")==="true"')
                check(f'{language} Taiwan satellite uses PHOTO2', any('/PHOTO2/' in u for u in requests))
                page.locator('[data-map-action=settings]').first.click()
                form=page.locator('#map-settings-form')
                form.locator('[name=amapKey]').fill('map-test-key')
                form.locator('[name=tiandituKey]').fill('tdt-test-key')
                for name in ['Custom one','Custom two']:
                    page.locator('[data-map-action=add-source]').click()
                    custom=page.locator('[data-map-custom]').last
                    custom.locator('[name=custom-name]').fill(name)
                    custom.locator('[name=custom-template]').fill('https://tiles.example.com/{z}/{x}/{y}.png')
                    custom.locator('[name=custom-credit]').fill('© Test provider')
                    custom.locator('[name=custom-credit]').press('Tab')
                page.screenshot(path=str(OUT/f'settings-{language}{"-preview" if args.preview else ""}.png'))
                form.locator('[type=submit]').click()
                expect(page.locator('.map-settings-panel')).to_be_hidden()
                check(f'{language} multiple custom sources are saved locally', page.evaluate('JSON.parse(localStorage.getItem("qiye.map.sources.v1")).custom.length')==2)
                check(f'{language} keys never enter the desktop backup', not page.evaluate('localStorage.getItem("qiye.state.v5").includes("map-test-key")'))
                page.locator('.map-regions [data-map-region=CN]').click()
                page.wait_for_function('document.querySelector("[data-map-provider]").textContent.includes("Amap") || document.querySelector("[data-map-provider]").textContent.includes("高德")')
                check(f'{language} mainland picks configured Amap static service', any('/v3/staticmap?' in u for u in requests))
                page.locator('[name=searchSource]').select_option('amap')
                query.fill('测试地点')
                before_search=len([u for u in requests if '/v3/place/text' in u])
                check(f'{language} Amap search waits for submit',before_search==0)
                query.press('Enter')
                page.locator('[data-map-result]').wait_for()
                page.locator('[data-map-result]').click()
                expect(page.locator('.map-coordinate-line')).to_contain_text('GCJ-02')
                page.locator('[data-map-action=favorite]').click()
                page.locator('[data-map-source]').select_option('osm')
                page.wait_for_function('document.querySelector("[data-map-provider]").textContent==="OpenStreetMap"')
                expect(page.locator('.map-coordinate-line')).to_contain_text('GCJ-02')
                check(f'{language} provider changes retain original selected coordinate system')
                fail_tiles[0]=True
                page.locator('[data-map-action=zoom-in]').click()
                page.wait_for_function('document.querySelector("[data-map-load]").dataset.status==="error"')
                check(f'{language} failed tiles show retry', page.locator('[data-map-action=retry]').is_visible())
                fail_tiles[0]=False
                page.locator('[data-map-action=retry]').click()
                expect(page.locator('[data-map-load]')).to_be_hidden()
                page.screenshot(path=str(OUT/f'workspace-{language}{"-preview" if args.preview else ""}.png'))
                page.locator('[data-map-action=settings]').first.click()
                page.locator('[name=enabled]').uncheck()
                page.locator('#map-settings-form [type=submit]').click()
                expect(page.locator('[data-map-gate]')).to_be_visible()
                check(f'{language} disabling maps clears network images', page.locator('.map-image-plane img').count()==0)
                page.locator('[data-close]').click()
                expect(page.locator('#dialog')).to_be_hidden()
                page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].data.favorites.length===2')
                before_close=len(requests)
                page.reload()
                page.locator('#desktop [data-widget=map]').wait_for()
                check(f'{language} reopening desktop makes no background map requests',len(requests)==before_close)
                page.set_viewport_size({'width':360,'height':740})
                page.locator('#desktop .map-card-open').click()
                expect(page.locator('.map-sidebar')).to_be_hidden()
                check(f'{language} narrow map uses available width', page.locator('.map-stage').bounding_box()['width']>300)
                check(f'{language} narrow map has no overflow',page.locator('#dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                page.locator('[data-map-action=places]').click()
                expect(page.locator('.map-sidebar')).to_be_visible()
                page.locator('[data-map-tab=favorites]').click()
                expect(page.locator('[data-map-result]')).to_have_count(2)
                page.locator('[data-map-result]').first.click()
                expect(page.locator('.map-sidebar')).to_be_hidden()
                page.screenshot(path=str(OUT/f'mobile-{language}{"-preview" if args.preview else ""}.png'))
                page.locator('[data-map-action=settings]').first.click()
                check(f'{language} narrow settings have no horizontal overflow',page.locator('.map-settings-panel').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                page.keyboard.press('Escape')
                expect(page.locator('.map-settings-panel')).to_be_hidden()
                expect(page.locator('#dialog')).to_be_visible()
                check(f'{language} Escape closes settings before the map')
                page.locator('[data-close]').click()
                expect(page.locator('#dialog')).to_be_hidden()
                page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v5")).items[0].data.selected.region==="MO"')
                page.evaluate('''() => { const s=JSON.parse(localStorage.getItem('qiye.state.v5')); const original=s.items[0];s.items=['1x1','1x2','2x1','2x2','4x2'].map((size,i)=>({...original,id:'map-'+i,size}));localStorage.setItem('qiye.state.v5',JSON.stringify(s)); }''')
                page.set_viewport_size({'width':1440,'height':960})
                page.reload()
                expect(page.locator('#desktop [data-widget=map]')).to_have_count(5)
                page.screenshot(path=str(OUT/f'cards-{language}{"-preview" if args.preview else ""}.png'))
                check(f'{language} five sizes fit without overflowing their cards',page.locator('#desktop [data-widget=map]').evaluate_all('nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1&&n.scrollHeight<=n.clientHeight+1)'))
                check(f'{language} no uncaught browser errors',not errors)
            except Exception:
                page.screenshot(path=str(OUT/'failure.png'))
                (OUT/'failure.txt').write_text(page.locator('body').inner_text()+'\n'+json.dumps(errors),encoding='utf-8')
                (OUT/'geometry.json').write_text(json.dumps(page.evaluate('''() => ['#dialog','#dialog-content','#map-workspace','.map-app','.map-header','.map-regions','.map-layout','.map-stage','.map-footer','.map-settings-panel'].map(s=>{const n=document.querySelector(s);if(!n)return {s};const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {s,r:r.toJSON(),client:[n.clientWidth,n.clientHeight],scroll:[n.scrollWidth,n.scrollHeight,n.scrollTop,n.scrollLeft],height:c.height,width:c.width,display:c.display,position:c.position,flex:c.flex,background:c.background};})'''),indent=2),encoding='utf-8')
                raise
            finally:
                context.close()
        (OUT/f'report{"-preview" if args.preview else ""}.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'browser':browser.version},indent=2),encoding='utf-8')
    finally:
        browser.close()
        server.shutdown()
print(f'{len(checks)} map checks passed.', flush=True)
