#!/usr/bin/env python3
"""Verify a published Qiye deployment with actual network assets (no mocks).
Run after publishing: python scripts/verify-live.py --expected /path/qiye-pages.
A fresh, disposable browser profile is used; no personal desktop or credentials.
"""
from pathlib import Path
import argparse,hashlib,json,urllib.request
from playwright.sync_api import sync_playwright,TimeoutError as BrowserTimeout
parser=argparse.ArgumentParser();parser.add_argument('--url',default='https://ktclat.github.io/qiye/');parser.add_argument('--expected',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('test-results/live'));a=parser.parse_args();a.output.mkdir(parents=True,exist_ok=True)
report={'url':a.url,'api_mocks':False,'assets':{},'checks':[]}
for path in ['index.html','icons/icon32.png','LICENSE']:
 req=urllib.request.Request(a.url+('' if path=='index.html' else path),headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=30) as r:
  raw=r.read();record={'status':r.status,'url':r.url,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
 assert record['status']==200 and raw==(a.expected/path).read_bytes(),record
 report['assets'][path]=record
with sync_playwright() as p:
 browser=p.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(10000);errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def wait_theme(theme):
  page.locator(f'button[data-theme="{theme}"]').click();page.wait_for_function('theme=>document.documentElement.dataset.theme===theme && JSON.parse(localStorage.getItem("qiye.state.v1")).settings.theme===theme',arg=theme)
 def close():page.locator('#dialog [data-close]').first.click();page.locator('#dialog').wait_for(state='hidden')
 def settle_images(selector):
  try:page.wait_for_function('(sel)=>Array.from(document.querySelectorAll(sel)).every(i=>i.complete)',arg=selector,timeout=12000)
  except BrowserTimeout:pass
 try:
  assert page.goto(a.url,wait_until='domcontentloaded',timeout=45000).status==200
  page.locator('#desktop .tile').first.wait_for();page.locator('#brand-button').click()
  assert '0.3.2' in page.locator('.settings-nav').inner_text()
  assert page.locator('#dialog .dialog-head').count()==0
  page.locator('[data-settings-tab=appearance]').click();wait_theme('light');page.screenshot(path=str(a.output/'live-settings-light.png'));close()
  report['checks'].append('Published v0.3.2; compact workspace and light theme')
  page.locator('#brand-button').click();page.locator('[data-settings-tab=appearance]').click();wait_theme('dark');close()
  settle_images('#desktop img');page.screenshot(path=str(a.output/'live-dark.png'))
  page.locator('[data-group=design]').click();page.locator('#desktop [data-item=design-figma]').wait_for()
  page.locator('#desktop [data-item=design-figma]').click(button='right');page.locator('#context-menu [data-context=edit]').click();page.locator('[data-action=extract-favicon]').click()
  page.wait_for_function('!document.querySelector("[data-action=extract-favicon]").disabled',timeout=15000)
  settle_images('[data-icon-results] img')
  report['native_candidates']=page.locator('[data-icon-results] button').evaluate_all('(ns)=>ns.map(n=>({source:n.title,ready:n.dataset.iconReady,dimensions:n.querySelector("small").textContent}))')
  page.screenshot(path=str(a.output/'live-native-editor.png'))
  ready=page.locator('button[data-icon-ready=true]')
  if ready.count():
   ready.first.click();chosen=page.locator('[name=iconUrl]').input_value();page.locator('#link-form button[type=submit]').click();page.locator('#dialog').wait_for(state='hidden');page.reload(wait_until='domcontentloaded');page.locator('#desktop .tile').first.wait_for()
   assert page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v1")).items.find(i=>i.id==="design-figma").iconUrl')==chosen
   report['checks'].append('Actual native candidate selection persisted after reload')
  else:report['native_limitation']='No source image loaded in this network run';close()
  page.locator('.top-tools').hover();page.locator('.top-tools [data-action=wallpaper]').click();assert page.locator('#dialog .dialog-head').count()==0
  page.locator('[data-gallery-tab=deepin]').click();enable=page.locator('[data-gallery-enable]')
  if enable.count():enable.click()
  page.locator('.wallpaper-photo-card').first.wait_for();settle_images('.wallpaper-photo-visual img')
  report['wallpaper_loaded']=page.locator('.wallpaper-photo-visual img').evaluate_all('(ns)=>({total:ns.length,loaded:ns.filter(n=>n.complete&&n.naturalWidth>0).length})')
  page.locator('.wallpaper-photo-card').first.hover();page.screenshot(path=str(a.output/'live-wallpaper-library.png'))
  page.locator('[data-gallery-preview]').first.click();assert page.locator('.wallpaper-preview').is_visible();assert page.locator('dialog[open]').count()==1
  page.keyboard.press('Escape');page.locator('.wallpaper-grid').wait_for();report['checks'].append('Live wallpaper library; preview and apply separate; Escape returns to gallery')
  assert not errors,errors
  report['page_errors']=errors;report['result']='passed'
 finally:
  (a.output/'public-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
print(json.dumps(report,ensure_ascii=False,indent=2))
