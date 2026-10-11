#!/usr/bin/env python3
"""Chromium end-to-end regression suite. Run --local-document for an isolated,
network-free renderer (storage double); normal mode serves genuine HTTP origin.
Remote APIs are fixtures, not availability probes. No credential required.
"""
from pathlib import Path
import argparse, base64, copy, json, os, subprocess, threading, time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--local-document',action='store_true');parser.add_argument('--output',default='test-results');args=parser.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True)
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"],cwd=ROOT))
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><circle cx="128" cy="128" r="105" fill="#4caaa0"/><path d="M75 131l37 38 71-85" stroke="white" stroke-width="20" fill="none"/></svg>'
PHOTO={'id':'10','author':'Test Photographer','url':'https://unsplash.com/photos/test','download_url':'https://picsum.photos/id/10/2500/1667','width':2500,'height':1667}
COMMONS={'query':{'pages':[{'title':'File:Landscape.jpg','imageinfo':[{'url':'https://upload.wikimedia.org/wikipedia/commons/a/ab/Landscape.jpg','thumburl':'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Landscape.jpg/640px-Landscape.jpg','descriptionurl':'https://commons.wikimedia.org/wiki/File:Landscape.jpg','width':2560,'height':1440,'mime':'image/jpeg','extmetadata':{'Artist':{'value':'<b>Test Author</b>'},'LicenseShortName':{'value':'CC BY-SA 4.0'},'LicenseUrl':{'value':'https://creativecommons.org/licenses/by-sa/4.0/'}}}]}]}}
results=[]
def check(name,fn):
 fn();results.append(name);print('PASS',name,flush=True)
def eq(a,b):assert a==b,(a,b)
def truth(a):assert a,a
server=None
if not args.local_document:
 class Quiet(SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
 base=f'http://127.0.0.1:{server.server_port}'

def route_external(route):
 u=route.request.url
 if 'picsum.photos/v2/list' in u:return route.fulfill(status=200,content_type='application/json',body=json.dumps([PHOTO]))
 if 'commons.wikimedia.org/w/api.php' in u:return route.fulfill(status=200,content_type='application/json',body=json.dumps(COMMONS))
 return route.fulfill(status=200,content_type='image/svg+xml',body=SVG)

with sync_playwright() as p:
 executable=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if args.local_document else None)
 browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
 def setup(settings=None,many=False,items=None,width=1440,height=950):
  state=copy.deepcopy(fixture);state['settings'].update(settings or {})
  if many:
   state['groups']=[{'id':f'g{i}','name':f'分组 {i}','icon':'folder'} for i in range(30)];state['groups'][0]['id']='home'
   state['items']=[x for x in state['items'] if x['groupId']=='home']
  if items is not None:state['items']=items
  ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1)
  page=ctx.new_page();page.set_default_timeout(7000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('https://**/*',route_external)
  payload=json.dumps(state,ensure_ascii=False)
  if args.local_document:
   page.evaluate('''data=>{const m=new Map([['qiye.state.v1',data]]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()}})}''',payload)
   page.set_content((ROOT/'Qiye-preview.html').read_text(),wait_until='domcontentloaded')
  else:
   page.add_init_script('if(!localStorage.getItem("qiye.state.v1"))localStorage.setItem("qiye.state.v1",'+json.dumps(payload)+')')
   page.goto(base+'/',wait_until='domcontentloaded')
  page.locator('[data-item]').first.wait_for();page.wait_for_timeout(300)
  return ctx,page,errors
 def saved(page):return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v1"))')
 def order(page):return page.locator('#desktop>[data-item]').evaluate_all('(ns)=>ns.map(n=>n.dataset.item)')
 def center(page,sel):r=page.locator(sel).bounding_box();return r['x']+r['width']/2,r['y']+r['height']/2
 def drag_begin(page,source,target,endfrac=.9):
  x,y=center(page,source);page.mouse.move(x,y);page.mouse.down();r=page.locator(target).bounding_box();page.mouse.move(r['x']+r['width']*endfrac,r['y']+r['height']/2,steps=14);page.wait_for_timeout(140)
 def setting(page,name,value):
  page.locator(f'[name="{name}"]').select_option(value);page.wait_for_timeout(120)

 try:
  ctx,page,errors=setup({'showSeconds':True,'toolbarVisibility':'auto','hideScrollbar':True})
  check('clock uses ordinary HH:MM:SS',lambda:truth(__import__('re').fullmatch(r'\d{2}:\d{2}:\d{2}',page.locator('#clock').text_content())))
  check('seconds inherit exact weight, size, opacity and color',lambda:eq(page.locator('#clock-seconds').evaluate('(n)=>{let a=getComputedStyle(n),b=getComputedStyle(document.querySelector("#clock-time"));return [a.fontSize===b.fontSize,a.fontWeight===b.fontWeight,a.color===b.color,a.opacity==="1"]}'),[True]*4))
  check('drag handles and default add tile absent',lambda:eq(page.locator('.tile-drag-handle,.tile-add').count(),0))
  page.mouse.move(500,850);page.wait_for_timeout(850)
  check('all four main tools hide together',lambda:eq(page.locator('.toolbar-actions').evaluate('n=>[getComputedStyle(n).opacity,n.querySelectorAll("button.tool-button").length]'),['0',4]))
  page.locator('.top-tools').hover();page.wait_for_timeout(220)
  check('hover reveals borderless toolbar',lambda:eq(page.locator('.toolbar-actions').evaluate('n=>[getComputedStyle(n).opacity,getComputedStyle(n.parentElement).borderTopWidth]'),['1','0px']))
  page.locator('#shortcuts-button').hover();page.locator('#shortcuts-tooltip').wait_for(state='visible');check('hover displays keyboard help',lambda:truth(page.locator('#shortcuts-tooltip').is_visible()))
  check('loaded website icons have no manufactured background',lambda:eq(page.locator('[data-item="site-google"] .tile-body').evaluate('n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).boxShadow]'),['rgba(0, 0, 0, 0)','none']))
  check('engine icon is not in a white plate',lambda:eq(page.locator('#engine-button .engine-mark .site-visual').evaluate('n=>getComputedStyle(n).backgroundColor'),'rgba(0, 0, 0, 0)'))
  page.mouse.move(700,800)
  before=page.locator('#daily-quote').bounding_box()['y'];page.locator('[data-group="design"]').click();page.wait_for_timeout(450)
  check('quote remains fixed across group size changes',lambda:eq(round(page.locator('#daily-quote').bounding_box()['y']),round(before)))
  page.locator('[data-group="home"]').click();page.wait_for_timeout(400)
  page.locator('#brand-button').click();check('logo opens settings, no brand name',lambda:truth(page.locator('#dialog[open]').is_visible()))
  page.locator('[data-close]').first.click();check('no runtime errors',lambda:eq(errors,[]));ctx.close()

  # Mixed-size widgets and link grid; direct surfaces, animations and save boundary.
  links=[x for x in fixture['items'] if x['groupId']=='home' and x['type']=='link' and not x.get('folderId')]
  ctx,page,errors=setup(items=links)
  original=order(page);a=f'[data-item="{original[0]}"]';target=f'[data-item="{original[3]}"]'
  drag_begin(page,a,target)
  check('live order changes BEFORE pointer release',lambda:truth(order(page)!=original))
  check('persistent state unchanged during preview',lambda:eq([i['id'] for i in saved(page)['items']],original))
  check('one clone follows pointer',lambda:eq(page.locator('.drag-ghost').count(),1))
  check('neighbours have actual transform animations',lambda:truth(page.locator('#desktop').evaluate('n=>n.getAnimations({subtree:true}).some(a=>a.effect.getKeyframes().some(k=>k.transform))')))
  during=order(page);page.mouse.up();page.wait_for_timeout(450)
  check('release commits visible order once',lambda:eq([i['id'] for i in saved(page)['items']],during))
  if not args.local_document:
   page.reload(wait_until='domcontentloaded');page.wait_for_timeout(400);check('real localStorage order survives reload',lambda:eq(order(page),during))
  original=order(page);drag_begin(page,f'[data-item="{original[0]}"]',f'[data-item="{original[4]}"]');page.keyboard.press('Escape');page.mouse.up();page.wait_for_timeout(400)
  check('Escape restores both preview and stored order',lambda:eq([order(page),[i['id'] for i in saved(page)['items']]],[original,original]))
  page.locator(f'[data-item="{original[0]}"]').focus();page.keyboard.press('Alt+ArrowRight');page.wait_for_timeout(350)
  check('keyboard sorting works without a handle',lambda:eq(order(page)[1],original[0]));check('dragging has no JS exceptions',lambda:eq(errors,[]));ctx.close()

  ctx,page,errors=setup()
  original=order(page);drag_begin(page,'[data-item="calendar-home"]','[data-item="focus-home"]');page.mouse.up();page.wait_for_timeout(450)
  check('mixed-size widget surface can move',lambda:truth(order(page)!=original))
  page.locator('[data-open-folder="folder-tools"]').click()
  check('folder has no default move-out buttons',lambda:eq(page.locator('.folder-item button').count(),0))
  page.locator('[data-folder-item]').first.click(button='right');check('folder contextual actions visible',lambda:truth(page.locator('[data-context="move"]').is_visible()))
  r=page.locator('#context-menu').bounding_box();check('folder contextual menu stays in viewport',lambda:truth(r['x']>=0 and r['y']>=0 and r['x']+r['width']<=1440 and r['y']+r['height']<=950))
  page.locator('[data-context="move"]').click();check('folder movement dialog still available',lambda:truth(page.locator('#dialog[open]').is_visible()))
  page.locator('[data-close]').first.click()
  check('widget move and folder menu produce no errors',lambda:eq(errors,[]));ctx.close()

  ctx,page,errors=setup({'hideScrollbar':True},many=True,height=720)
  page.locator('#groups').hover();page.mouse.wheel(0,1100);page.wait_for_timeout(250)
  check('sidebar scroll exposes hidden groups',lambda:truth(page.locator('#groups').evaluate('n=>n.scrollTop>0')))
  check('scrolling groups does not switch active group',lambda:eq(saved(page)['activeGroupId'],'home'))
  check('sidebar scrollbar hidden, list still scrollable',lambda:eq(page.locator('#groups').evaluate('n=>getComputedStyle(n).scrollbarWidth'),'none'))
  check('content scrollbar switch only hides track',lambda:eq(page.locator('html').evaluate('n=>getComputedStyle(n).scrollbarWidth'),'none'))
  page.mouse.move(1000,640);page.mouse.wheel(0,900);page.wait_for_timeout(200)
  check('content remains wheel-scrollable',lambda:truth(page.evaluate('window.scrollY>0')))
  check('scroll tests have no errors',lambda:eq(errors,[]));ctx.close()
  ctx,page,errors=setup({'sidebarWheelMode':'switch'})
  page.locator('#groups').hover();page.mouse.wheel(0,150);page.wait_for_timeout(450)
  check('opt-in wheel switching changes group',lambda:eq(saved(page)['activeGroupId'],'code'));ctx.close()

  ctx,page,errors=setup()
  page.locator('.wallpaper-launcher').click();check('wallpaper widget opens two-column library',lambda:eq(page.locator('.wallpaper-browser').evaluate('n=>getComputedStyle(n).display'),'grid'))
  check('gallery source categories and bottom parameters',lambda:eq(page.locator('[data-gallery-tab]').count(),7))
  page.locator('[data-gallery-tab="picsum"]').click();check('online gallery requires explicit consent',lambda:truth(page.locator('[data-gallery-enable]').is_visible()))
  page.locator('[data-gallery-enable]').click();page.locator('[data-gallery-apply]').wait_for();check('Picsum gallery response rendered',lambda:eq(page.locator('[data-gallery-apply]').count(),1))
  page.locator('[data-gallery-tab="commons"]').click();page.locator('[data-gallery-apply]').wait_for();check('Commons license attribution retained',lambda:truth('CC BY-SA' in page.locator('.wallpaper-photo-credit').inner_text()))
  page.locator('[data-gallery-tab="parameters"]').click();check('wallpaper sliders in separate parameters panel',lambda:truth(page.locator('[data-range="blur"]').is_visible()))
  page.locator('[data-gallery-tab="custom"]').click();check('custom upload is a separate category',lambda:truth(page.locator('[data-action="upload-wallpaper"]').is_visible()))
  page.locator('[data-gallery-tab="unsplash"]').click();check('keyed providers are honest external entries',lambda:truth('网站入口' in page.locator('.wallpaper-content').inner_text()))
  page.locator('[data-gallery-tab="official"]').click();page.screenshot(path=str(OUT/'wallpaper-library.png'))
  page.locator('[data-close]').first.click();check('gallery close produces no runtime errors',lambda:eq(errors,[]));ctx.close()

  ctx,page,errors=setup({'sidebarPosition':'right','sidebarWidth':44,'surfaceStyle':'acrylic','clockOffsetX':8,'searchOffsetX':-8})
  check('right sidebar respects configured width',lambda:eq(round(page.locator('.sidebar').bounding_box()['width']),44))
  check('right sidebar is right-aligned',lambda:eq(round(page.locator('.sidebar').bounding_box()['x']),1396))
  page.locator('#brand-button').click();page.locator('[data-settings-tab="sidebar"]').click()
  page.locator('#avatar-file').set_input_files(str(ROOT/'icons/icon128.png'));page.wait_for_function('document.querySelector("#brand-button img")!==null')
  check('local avatar decoded and committed',lambda:truth(saved(page)['settings']['avatar'].startswith('data:image/')))
  check('sidebar/position/avatar changes have no JS errors',lambda:eq(errors,[]));ctx.close()
  for theme in ['dark','light']:
   ctx,page,errors=setup({'theme':theme,'showSeconds':True,'surfaceStyle':'glass'})
   check(theme+' materials loaded',lambda:eq(page.locator('html').get_attribute('data-theme'),theme))
   page.screenshot(path=str(OUT/f'{theme}-desktop.png'));ctx.close()
  ctx,page,errors=setup({'navigationMode':'top'},width=520,height=820)
  check('mobile does not overflow horizontally',lambda:truth(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')))
  page.locator('.top-tools').hover();page.locator('.top-tools [data-action="wallpaper"]').click();check('mobile gallery fits viewport',lambda:truth(page.locator('#dialog').bounding_box()['width']<=520));page.screenshot(path=str(OUT/'mobile-wallpaper.png'));ctx.close()
  print(f'{len(results)} browser checks passed. API images are controlled fixtures. mode={"document/storage-double" if args.local_document else "HTTP/real-localStorage"}',flush=True)
 finally:
  (OUT/'browser-report.json').write_text(json.dumps({'mode':'local-document' if args.local_document else 'http','passed':results},ensure_ascii=False,indent=2))
  browser.close()
  if server:server.shutdown()
