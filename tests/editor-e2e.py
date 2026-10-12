#!/usr/bin/env python3
"""v0.3.2 editor/workspace integration checks using actual production modules.
HTTP origin and real localStorage by default; --local-document uses an isolated
render plus a storage double. Icon and API responses are controlled test fixtures.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
import argparse,subprocess,json,copy,os,threading,zlib,struct
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--local-document',action='store_true');parser.add_argument('--output',default='test-results/editor');args=parser.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True)
state0=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFAULT_STATE} from './src/core.js';console.log(JSON.stringify(DEFAULT_STATE))"],cwd=ROOT))
SITE='https://icons.example.com/'
def png(size,color):
 def chunk(t,b):return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
 rows=b''.join(b'\0'+bytes(color)*size for _ in range(size))
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
IMAGES={'/small.png':png(16,(190,55,60,255)),'/native.png':png(128,(25,135,170,255)),'/alternate.png':png(192,(210,135,40,255)),'/favicon.ico':png(32,(110,90,155,255))}
SVG='<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><path d="M48 5 90 82H6Z" fill="#70b68e"/></svg>'
HTML='<link rel="icon" sizes="16x16" href="/small.png"><link rel="icon" sizes="128x128" href="/native.png"><link rel="manifest" href="/site.webmanifest">'
PHOTO={'id':'10','author':'Test Photographer','url':'https://unsplash.com/photos/test','download_url':'https://picsum.photos/id/10/2500/1667','width':2500,'height':1667}
results=[];server=None
if not args.local_document:
 class Quiet(SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}'
def eq(a,b):assert a==b,(a,b)
def ok(v):assert v,v
def check(name,fn):fn();results.append(name);print('PASS',name,flush=True)
with sync_playwright() as p:
 executable=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if args.local_document else None)
 browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
 def setup(theme='dark',width=1440):
  state=copy.deepcopy(state0);state['settings'].update({'theme':theme,'autoExtractIcons':False,'toolbarVisibility':'always'})
  state['items'].insert(0,{'id':'native-test','groupId':'home','type':'link','title':'测试原站','url':SITE,'icon':'原','iconMode':'auto','color':'#4976df','size':'1x1'})
  ctx=browser.new_context(viewport={'width':width,'height':960});page=ctx.new_page();page.set_default_timeout(5000)
  errors=[];requests=[];policy={'fail':False};page.on('pageerror',lambda e:errors.append(str(e)))
  def external(route):
   u=route.request.url;requests.append(u);headers={'Access-Control-Allow-Origin':'*'}
   if 'picsum.photos/v2/list' in u:return route.fulfill(status=200,content_type='application/json',body=json.dumps([PHOTO]),headers=headers)
   if u.startswith(SITE):
    suffix=u[len(SITE)-1:]
    if policy['fail']:return route.fulfill(status=404,body='Unavailable',headers=headers)
    if suffix=='/':return route.fulfill(status=200,content_type='text/html',body=HTML,headers=headers)
    if suffix=='/site.webmanifest':return route.fulfill(status=200,content_type='application/manifest+json',body=json.dumps({'icons':[{'src':'/alternate.png','sizes':'192x192'},{'src':'/vector.svg','type':'image/svg+xml','sizes':'any'}]}),headers=headers)
    if suffix in IMAGES:return route.fulfill(status=200,content_type='image/png',body=IMAGES[suffix],headers=headers)
    if suffix=='/vector.svg':return route.fulfill(status=200,content_type='image/svg+xml',body=SVG,headers=headers)
    return route.fulfill(status=404,body='Unavailable',headers=headers)
   return route.fulfill(status=200,content_type='image/svg+xml',body=SVG,headers=headers)
  page.route('https://**/*',external)
  data=json.dumps(state,ensure_ascii=False)
  if args.local_document:
   page.evaluate('''s=>{const m=new Map([['qiye.state.v1',s]]);Object.defineProperty(window,'localStorage',{value:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})}''',data)
   page.set_content((ROOT/'Qiye-preview.html').read_text(),wait_until='domcontentloaded')
  else:
   page.add_init_script('if(!localStorage.getItem("qiye.state.v1"))localStorage.setItem("qiye.state.v1",'+json.dumps(data)+')');page.goto(base+'/',wait_until='domcontentloaded')
  page.locator('#desktop [data-item="native-test"]').wait_for();return ctx,page,errors,requests,policy
 def saved(page):return page.evaluate('JSON.parse(localStorage.getItem("qiye.state.v1"))')
 def link(page):return next(i for i in saved(page)['items'] if i['id']=='native-test')
 def edit(page):
  page.locator('#desktop [data-item="native-test"]').click(button='right');page.locator('#context-menu [data-context="edit"]').click();page.locator('#link-form').wait_for()
 def close(page):page.locator('#dialog [data-close]').first.click();page.locator('#dialog').wait_for(state='hidden')
 def get(page):
  page.locator('[data-action="extract-favicon"]').click();page.wait_for_function('document.querySelectorAll("[data-icon-ready=true]").length>=4')
 def candidate(page,suffix):return page.locator('[data-icon-choice="candidate"]').filter(has=page.locator(f'[data-favicon-selected="{SITE}{suffix}"]'))
 try:
  ctx,page,errors,requests,policy=setup();edit(page)
  check('website editor has exactly two semantic sections',lambda:eq(page.locator('#link-form>.editor-section').count(),2))
  check('fetch action shares the URL field container',lambda:eq(page.locator('.address-control input[name=url],.address-control [data-action=extract-favicon]').count(),2))
  check('current and text choices precede the result list',lambda:eq(page.locator('.icon-choices>[data-icon-choice]').evaluate_all('(ns)=>ns.map(n=>n.dataset.iconChoice)'),['current','text','upload']))
  old=link(page);get(page)
  check('native declarations and manifest variants are enumerated',lambda:ok(SITE+'site.webmanifest' in requests))
  check('multiple decoded native icons offered for explicit choice',lambda:ok(page.locator('[data-icon-ready=true]').count()>=4))
  check('candidate dimensions reflect decoded low resolution',lambda:eq(candidate(page,'small.png').locator('small').inner_text(),'16 × 16'))
  check('SVG is described as vector, not enlarged bitmap',lambda:eq(candidate(page,'vector.svg').locator('small').inner_text(),'SVG · 矢量'))
  check('extraction never changes persistent site or selected choice',lambda:eq(link(page),old))
  check('current original is selected until user decides',lambda:eq(page.locator('button[data-icon-choice=current]').get_attribute('aria-pressed'),'true'))
  page.screenshot(path=str(OUT/'editor-native-dark.png'))
  candidate(page,'small.png').click();check('small alternative can be deliberately selected',lambda:eq(page.locator('[name=iconUrl]').input_value(),SITE+'small.png'))
  check('candidate preview still does not persist anything',lambda:eq(link(page),old))
  page.locator('#link-form button[type=submit]').click();page.locator('#dialog').wait_for(state='hidden')
  check('save retains exact chosen native URL',lambda:eq(link(page)['iconUrl'],SITE+'small.png'))
  page.wait_for_function('document.querySelector("[data-item=\\"native-test\\"] img").naturalWidth===16')
  check('desktop respects native choice without automatic replacement',lambda:eq(page.locator('#desktop [data-item=native-test] img').get_attribute('src'),SITE+'small.png'))
  if not args.local_document:
   page.reload(wait_until='domcontentloaded');page.locator('#desktop [data-item=native-test]').wait_for()
   check('selected URL survives real browser reload',lambda:eq(link(page)['iconUrl'],SITE+'small.png'))
  edit(page);check('reopened editor displays stored native current icon',lambda:eq(page.locator('button[data-icon-choice=current] .site-visual').get_attribute('data-favicon-selected'),SITE+'small.png'))
  get(page);candidate(page,'alternate.png').click();close(page)
  check('cancel retains earlier selection',lambda:eq(link(page)['iconUrl'],SITE+'small.png'))
  edit(page);page.locator('button[data-icon-choice=text]').click();page.locator('[name=icon]').fill('原生');page.locator('[data-color="#eb617e"]').click()
  check('text icon preview responds to typed text',lambda:eq(page.locator('[data-text-icon-preview]').inner_text(),'原生'))
  get(page);check('fetching while text-selected keeps text mode',lambda:eq(page.locator('[name=iconMode]').input_value(),'text'))
  page.locator('#link-form button[type=submit]').click();page.locator('#dialog').wait_for(state='hidden')
  check('text mode and color persist without remote selection',lambda:eq([link(page)['iconMode'],link(page)['icon'],link(page)['color'],link(page).get('iconUrl')],['text','原生','#eb617e',None]))
  edit(page);page.locator('#site-icon-upload').set_input_files({'name':'local.png','mimeType':'image/png','buffer':png(100,(65,170,130,255))});page.wait_for_function('document.querySelector("[name=iconUrl]").value.startsWith("data:image/")')
  page.locator('#link-form button[type=submit]').click();page.locator('#dialog').wait_for(state='hidden')
  check('uploaded icon is locally re-encoded and persisted',lambda:ok(link(page)['iconUrl'].startswith('data:image/')))
  edit(page);page.locator('[name=url]').fill('https://different.example.com/');check('changing website clears stale candidate and original asset',lambda:eq(page.locator('[name=iconUrl]').input_value(),''));close(page)
  check('cancelled URL change does not alter saved website',lambda:eq(link(page)['url'],SITE))
  edit(page);policy['fail']=True;page.locator('[data-action=extract-favicon]').click();page.wait_for_function('!document.querySelector("[data-action=extract-favicon]").disabled')
  check('failed extraction leaves selected uploaded image unchanged',lambda:ok(page.locator('[name=iconUrl]').input_value().startswith('data:image/')))
  close(page);check('icon editor interactions produce no uncaught errors',lambda:eq(errors,[]));ctx.close()

  ctx,page,errors,requests,policy=setup('light');page.locator('#brand-button').click()
  check('settings uses navigation title and no tall header',lambda:eq([page.locator('#dialog .dialog-head').count(),page.locator('#workspace-title').inner_text()],[0,'设置']))
  check('dialog accessible label resolves to navigation title',lambda:eq(page.locator('#dialog').get_attribute('aria-labelledby'),'workspace-title'))
  page.locator('[data-settings-tab=sidebar]').click();check('sidebar accent starts neutral',lambda:eq(page.locator('html').get_attribute('data-sidebar-accent'),'neutral'))
  page.locator('[data-setting=sidebarUseAccent]').check();page.wait_for_function('document.documentElement.dataset.sidebarAccent==="theme" && JSON.parse(localStorage.getItem("qiye.state.v1")).settings.sidebarUseAccent===true');check('theme accent opt-in persists',lambda:eq(saved(page)['settings']['sidebarUseAccent'],True))
  page.locator('[data-setting=sidebarUseAccent]').uncheck();page.wait_for_function('document.documentElement.dataset.sidebarAccent==="neutral" && JSON.parse(localStorage.getItem("qiye.state.v1")).settings.sidebarUseAccent===false')
  page.screenshot(path=str(OUT/'settings-light.png'));close(page)
  before=page.locator('.search-form').evaluate('(n)=>{const s=getComputedStyle(n);return [s.boxShadow,s.borderTopColor,s.backdropFilter,s.backgroundColor]}')
  page.locator('#search-input').click();after=page.locator('.search-form').evaluate('(n)=>{const s=getComputedStyle(n);return [s.boxShadow,s.borderTopColor,s.backdropFilter,s.backgroundColor]}')
  check('search focus adds no ring, darker border or extra glass',lambda:eq(before,after))
  page.locator('.top-tools [data-action=add]').click();check('add dialog has two columns and no tall header',lambda:eq([page.locator('.add-nav').is_visible(),page.locator('#dialog .dialog-head').count()],[True,0]));close(page)
  edit(page);get(page);page.screenshot(path=str(OUT/'editor-light.png'));check('light editor uses layered quiet surfaces',lambda:ok(page.locator('.editor-section').first.evaluate('n=>getComputedStyle(n).backgroundColor')!='rgb(255, 255, 255)'));close(page)
  page.locator('.top-tools [data-action=wallpaper]').click();check('wallpaper library uses left title instead of header',lambda:eq([page.locator('#workspace-title').inner_text(),page.locator('#dialog .dialog-head').count()],['壁纸库',0]))
  page.locator('[data-gallery-tab=picsum]').click();page.locator('[data-gallery-enable]').click();page.locator('[data-gallery-preview]').first.wait_for()
  check('source notice is shown once not on every thumbnail',lambda:eq(page.get_by_text('图片权利归原作者，来源与许可见预览详情。',exact=True).count(),1))
  oldbg=saved(page)['settings'].get('remoteWallpaper');page.locator('.wallpaper-photo-card').first.hover();page.wait_for_function('getComputedStyle(document.querySelector(".wallpaper-photo-actions")).opacity==="1"')
  check('hover exposes separate preview and apply controls',lambda:eq(page.locator('.wallpaper-photo-actions').first.evaluate('n=>getComputedStyle(n).opacity'),'1'))
  page.locator('[data-gallery-preview]').first.click();check('preview stays inside one dialog',lambda:eq(page.locator('dialog[open]').count(),1));check('preview does not change wallpaper',lambda:eq(saved(page)['settings'].get('remoteWallpaper'),oldbg))
  check('preview carries author and original source link',lambda:ok('Test Photographer' in page.locator('.preview-credit').inner_text()))
  page.keyboard.press('Escape');page.locator('[data-gallery-preview]').first.wait_for();check('Escape returns to gallery rather than closing parent',lambda:ok(page.locator('#dialog').is_visible()))
  page.locator('.wallpaper-photo-card').first.hover();page.locator('[data-gallery-apply]').first.click();page.wait_for_function('JSON.parse(localStorage.getItem("qiye.state.v1")).settings.remoteWallpaper?.id==="10"');check('apply persists wallpaper explicitly',lambda:eq(saved(page)['settings']['remoteWallpaper']['id'],'10'))
  page.screenshot(path=str(OUT/'wallpaper-library-light.png'));check('workspace changes produce no uncaught errors',lambda:eq(errors,[]));ctx.close()

  for width in [520,390]:
   ctx,page,errors,requests,policy=setup('light',width);page.locator('#brand-button').click();page.locator('[data-settings-tab=appearance]').click()
   check(f'{width}px settings keeps left-right layout',lambda:ok(page.locator('.settings-content').bounding_box()['x']>page.locator('.settings-nav').bounding_box()['x']))
   check(f'{width}px settings content fits width',lambda:ok(page.locator('.settings-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')))
   close(page);page.locator('.top-tools [data-action=wallpaper]').click();check(f'{width}px wallpaper content fits width',lambda:ok(page.locator('.wallpaper-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1')));close(page)
   edit(page);get(page);check(f'{width}px editor candidates wrap without overflow',lambda:ok(page.locator('#link-form').evaluate('n=>n.scrollWidth<=n.clientWidth+1')))
   page.screenshot(path=str(OUT/f'editor-mobile-{width}.png'));close(page);check(f'{width}px no runtime errors',lambda:eq(errors,[]));ctx.close()
 finally:
  (OUT/'editor-report.json').write_text(json.dumps({'passed':len(results),'checks':results,'mode':'isolated/storage-double' if args.local_document else 'HTTP/real-localStorage','external_api_fixtures':True},ensure_ascii=False,indent=2));browser.close()
  if server:server.shutdown()
print(f'{len(results)} editor/workspace checks passed; controlled external fixtures; mode={"local-document" if args.local_document else "HTTP"}',flush=True)
