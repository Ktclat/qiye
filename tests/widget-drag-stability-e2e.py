"""Measure real iframe drag trajectories, including delayed messages and browser zoom."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
import argparse,json,tempfile,threading,urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--widgets-root',type=Path,default=ROOT.parent/'qiye-widgets');parser.add_argument('--preview',action='store_true');parser.add_argument('--live',action='store_true');parser.add_argument('--case',help='Run only cases containing this text');args=parser.parse_args()
DIST=args.widgets_root/'dist';SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads(urllib.request.urlopen(SOURCE,timeout=30).read()) if args.live else json.loads((DIST/'index.json').read_text(encoding='utf-8'))
OUT=ROOT/'output/playwright/widget-drag-stability'/('live' if args.live else 'preview' if args.preview else 'source');OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='https://ktclat.github.io/qiye/' if args.live else f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else '')
def assets(route):
 path=DIST/urlsplit(route.request.url).path.removeprefix('/qiye-widgets/')
 if not path.is_file():return route.abort()
 route.fulfill(status=200,content_type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'}.get(path.suffix,'application/octet-stream'),body=path.read_bytes(),headers={'Access-Control-Allow-Origin':'*'})
def fixture(size,theme):
 state=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'));state['items']=[];state['activeGroupId']=state['groups'][0]['id'];state['settings']['theme']=theme
 for kind,card_size in [('notes',size),('todo','2x2'),('file-converter','1x1'),('clock','2x1'),('pomodoro','2x2')]:
  m=next(m for m in catalog['widgets'] if m['id']=='qiye.'+kind)
  state['items'].append({'id':'w-'+kind,'groupId':state['activeGroupId'],'type':'widget','widget':'community','title':m['name'],'size':card_size,'config':{'source':SOURCE,'manifest':m},'data':{'value':json.dumps({'config':{},'data':{'notes':'Keep this draft while dragging.'}}) if kind=='notes' else 'null'}})
 return state

report=[]
with sync_playwright() as pw:
 for size,theme,zoom,width in [('1x1','dark',1,1440),('1x2','light',1,1440),('2x1','dark',1,1440),('2x2','light',1.25,1440),('4x2','dark',.8,1440),('2x2','dark',1,390)]:
  label=f'{size}-{theme}-{zoom}-{width}'
  if args.case and args.case not in label:continue
  with tempfile.TemporaryDirectory(prefix='qiye-drag-stability-') as profile:
   context=pw.chromium.launch_persistent_context(profile,channel='chromium',headless=True,locale='zh-CN',has_touch=True,device_scale_factor=2 if size=='2x1' else 1,viewport={'width':width,'height':980},args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'])
   if not args.live:context.route('https://ktclat.github.io/qiye-widgets/**',assets)
   context.add_init_script('if(window===top&&!localStorage.getItem("stability-seed")){localStorage.setItem("qiye.state.v5",%s);localStorage.setItem("qiye.community.v1",%s);localStorage.setItem("stability-seed","yes");}'%(json.dumps(json.dumps(fixture(size,theme))),json.dumps(json.dumps([{'url':SOURCE,'enabled':True,'catalog':catalog}]))))
   # Exercise a busy iframe: mouse movement arrives 35ms late, after its rect
   # may have changed. Real browser pointer events still determine every point.
   context.add_init_script('''const send=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(message,...rest){if(message?.type==='interaction'&&message.action==='pointermove'&&message.pointerType==='mouse'){setTimeout(()=>send.call(this,message,...rest),35);return;}return send.call(this,message,...rest)};
   if(window===top){window.dragSamples=[];function sample(){const g=document.querySelector('.drag-ghost');if(g){const r=g.getBoundingClientRect();dragSamples.push({time:performance.now(),x:r.x,y:r.y,width:r.width,height:r.height,order:[...document.querySelectorAll('#desktop>[data-item]')].map(n=>n.dataset.item).join(',')});}requestAnimationFrame(sample)}requestAnimationFrame(sample)}''')
   worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=20000)
   page=context.new_page();page.set_default_timeout(45000);errors=[];requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if '/releases/' in r.url else None)
   try:
    page.goto(base,wait_until='domcontentloaded')
    # Chromium can expose the worker before extension APIs are initialized.
    for _ in range(100):
     if worker.evaluate('!!globalThis.chrome?.tabs?.query'):break
     page.wait_for_timeout(50)
    else:raise AssertionError('Zoom test extension did not initialize')
    tab_id=worker.evaluate('async()=> (await chrome.tabs.query({})).at(-1).id')
    worker.evaluate('async({id,zoom})=>chrome.tabs.setZoom(id,zoom)',{'id':tab_id,'zoom':zoom})
    page.wait_for_function('document.querySelectorAll("#desktop iframe[data-ready=true]").length===5')
    tile=page.locator('[data-item=w-notes]');tile.scroll_into_view_if_needed();page.wait_for_timeout(350)
    frame=tile.locator('iframe').element_handle().content_frame();node=frame.locator('#widget-root');rect=node.bounding_box();x=rect['x']+20;y=rect['y']+min(40,rect['height']/2)
    original=tile.bounding_box();frame_size=frame.evaluate('({width:innerWidth,height:innerHeight})');request_count=len(requests)
    page.mouse.move(x,y);page.mouse.down();started=page.evaluate('performance.now()')
    page.wait_for_function('document.body.classList.contains("is-dragging")');frame.locator('html.widget-dragging').wait_for(state='attached');page.wait_for_timeout(80)
    origin=page.locator('.drag-ghost').bounding_box();first=page.evaluate('dragSamples[0].time')
    assert first-started>=350,(label,'hold too short',first-started)
    assert abs(origin['width']-original['width'])<.5 and abs(origin['height']-original['height'])<.5,(label,'drag resized the card')
    assert frame.evaluate('({width:innerWidth,height:innerHeight})')==frame_size,(label,'iframe viewport changed')
    distance=min(210,page.evaluate('innerWidth')-x-65);assert distance>45
    phase=page.evaluate('performance.now()')
    for step in range(1,61):
     page.mouse.move(x+distance*step/60,y);page.wait_for_timeout(5)
    page.wait_for_timeout(180)
    samples=page.evaluate('start=>dragSamples.filter(s=>s.time>=start)',phase)
    backwards=[b['x']-a['x'] for a,b in zip(samples,samples[1:]) if b['x']<a['x']-.6]
    end=page.locator('.drag-ghost').bounding_box();error=abs(end['x']-origin['x']-distance)
    assert not backwards,(label,'card moved against the pointer',backwards)
    assert error<1,(label,'card drifted',error)
    page.screenshot(path=str(OUT/f'{label}-drag.png'))
    # Pause, then tremble at a boundary: do not keep shuffling after reflow.
    order=page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')
    for dx in [1,-1,0,1,0]:page.mouse.move(x+distance+dx,y);page.wait_for_timeout(70)
    assert page.locator('#desktop>[data-item]').evaluate_all('nodes=>nodes.map(n=>n.dataset.item)')==order,(label,'boundary tremor repeatedly reordered cards')
    assert len(requests)==request_count,(label,'drag reloaded the iframe')
    page.mouse.up();page.wait_for_function('!document.body.classList.contains("is-dragging")')
    assert not page.locator('#dialog').evaluate('d=>d.open')
    if width==390:
     # CDP omits touch screen coordinates. Check the legacy-coordinate fallback
     # and release with native delivery; absolute screen mapping has unit tests.
     tile.scroll_into_view_if_needed();page.wait_for_timeout(250);rect=node.bounding_box();tx=rect['x']+20;ty=rect['y']+35
     cdp=context.new_cdp_session(page);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':tx,'y':ty}]})
     page.wait_for_function('document.body.classList.contains("is-dragging")');origin=page.locator('.drag-ghost').bounding_box()
     for step in range(1,21):
      cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':tx+step*2,'y':ty+step}]});page.wait_for_timeout(8)
     page.wait_for_timeout(180);end=page.locator('.drag-ghost').bounding_box()
     assert abs(end['x']-origin['x']-40)<1 and abs(end['y']-origin['y']-20)<1,(label,'touch drift',{'dx':end['x']-origin['x'],'dy':end['y']-origin['y']})
     cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_function('!document.body.classList.contains("is-dragging")')
     print('PASS narrow touch trajectory and release',flush=True)
    assert not errors,errors
    report.append({'case':label,'backward_steps':len(backwards),'endpoint_error':error,'iframe_reloads':len(requests)-request_count})
    print('PASS',label,'delayed messages: no backward steps, endpoint error',round(error,3),'px',flush=True)
   except Exception:
    page.screenshot(path=str(OUT/f'{label}-failure.png'));raise
   finally:
    context.close();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
server.shutdown()
