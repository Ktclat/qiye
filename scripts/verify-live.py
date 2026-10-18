#!/usr/bin/env python3
"""Verify deployed host bytes and a real public widget without response mocks."""
import argparse,hashlib,json,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default='https://ktclat.github.io/qiye/');parser.add_argument('--expected',type=Path,required=True);parser.add_argument('--output',type=Path,default=ROOT/'test-results/live');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
report={'url':args.url,'api_mocks':False,'assets':{},'checks':[]}
def check(name,value):
 assert value,name
 report['checks'].append(name);print('PASS',name,flush=True)
try:
 for path in ['index.html','LICENSE',*[p.relative_to(args.expected).as_posix() for p in (args.expected/'icons').glob('*') if p.is_file()]]:
  request=urllib.request.Request(args.url+path,headers={'Cache-Control':'no-cache'})
  with urllib.request.urlopen(request,timeout=30) as response:raw=response.read()
  expected=(args.expected/path).read_bytes()
  if path.endswith(('.html','.svg')):expected=expected.replace(b'\r\n',b'\n')
  check('Published '+path+' equals local build',raw==expected)
  report['assets'][path]=hashlib.sha256(raw).hexdigest()
 with sync_playwright() as pw:
  browser=pw.chromium.launch();context=browser.new_context(locale='zh-CN',viewport={'width':1440,'height':960});page=context.new_page();page.set_default_timeout(30000)
  errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if '/qiye-widgets/' in r.url else None)
  page.goto(args.url,wait_until='domcontentloaded');page.locator('#desktop .tile-link').first.wait_for();check('Fresh public desktop has no widgets',page.locator('#desktop .tile-widget').count()==0)
  page.locator('#brand-button').click();page.locator('[data-settings-tab=sources]').click();check('Official source disabled with no requests',page.locator('[data-source-toggle]').first.get_attribute('aria-checked')=='false' and not requests)
  page.screenshot(path=str(args.output/'sources-disabled.png'))
  page.locator('[data-source-toggle]').first.click();page.locator('[data-community-add]').first.wait_for();check('Public catalog fetched',bool(requests))
  page.locator('[data-community-query]').fill('便签');page.locator('[data-community-add]').click();page.locator('#dialog [data-close]').first.click();page.locator('#desktop iframe[data-ready=true]').wait_for()
  frame=page.frame_locator('#desktop iframe');check('Published widget sandbox denies parent DOM',frame.locator('body').evaluate('()=>{try{void parent.document;return false}catch{return true}}'))
  frame.locator('[data-widget-input=notes]').fill('Public split verification')
  page.wait_for_function("JSON.parse(localStorage.getItem('qiye.state.v5')).items.some(i=>i.data?.value?.includes('Public split verification'))")
  page.reload(wait_until='domcontentloaded');page.locator('#desktop iframe[data-ready=true]').wait_for();check('Public widget save survives reload',page.frame_locator('#desktop iframe').locator('[data-widget-input=notes]').input_value()=='Public split verification')
  page.screenshot(path=str(args.output/'published-desktop.png'));check('No page errors',not errors);browser.close()
finally:(args.output/'public-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
