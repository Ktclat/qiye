"""Persistent resources, opaque isolation, group retention and version changes."""
import argparse,json,tempfile,threading,time,re
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--extension',action='store_true');parser.add_argument('--preview',action='store_true');parser.add_argument('--widgets',type=Path);args=parser.parse_args()
SOURCE='https://ktclat.github.io/qiye-widgets/index.json'
catalog=json.loads((ROOT/'tests/fixtures/plugin-source/index.json').read_text(encoding='utf-8'))
if args.widgets:catalog=json.loads((args.widgets/'index.json').read_text(encoding='utf-8'));catalog['widgets']=[next(m for m in catalog['widgets'] if m['id']=='qiye.notes')]
state=json.loads((ROOT/'tests/fixtures/installed-desktop.json').read_text(encoding='utf-8'))
fixture=(ROOT/'tests/fixtures/plugin-view.html').read_text(encoding='utf-8')
script=re.search(r'<script>(.*?)</script>',fixture,re.S)[1]
html=re.sub(r'<script>.*?</script>','<script src="runtime.js"></script><link rel="stylesheet" href="styles.css">',fixture,flags=re.S)
offline=False;requests=[];errors=[]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
def external(route):
 if '/qiye-widgets/releases/' in route.request.url:
  requests.append(route.request.url)
  if offline:return route.abort()
  # A slow first download must not hit the old 15-second startup timeout.
  if len(requests)==1 and args.extension:time.sleep(16)
  if args.widgets:
   path=args.widgets/route.request.url.split('/qiye-widgets/',1)[1].split('?')[0].split('#')[0]
   return route.fulfill(path=str(path),headers={'Access-Control-Allow-Origin':'*'})
  kind='javascript' if route.request.url.endswith('.js') else 'css' if route.request.url.endswith('.css') else 'html'
  return route.fulfill(content_type='text/'+kind,body=script if kind=='javascript' else 'body{font-size:14px}' if kind=='css' else html,headers={'Access-Control-Allow-Origin':'*'})
 return route.fulfill(content_type='application/json',body='{}',headers={'Access-Control-Allow-Origin':'*'})
with tempfile.TemporaryDirectory(prefix='qiye-cache-') as profile,sync_playwright() as pw:
 browser=None
 if args.extension:
  context=pw.chromium.launch_persistent_context(profile,channel='chromium',headless=True,locale='zh-CN',viewport={'width':1440,'height':960},args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'])
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
  url=f'chrome-extension://{worker.url.split("/")[2]}/index.html'
 else:
  browser=pw.chromium.launch();context=browser.new_context(locale='zh-CN',viewport={'width':1440,'height':960})
  url=f'http://127.0.0.1:{server.server_port}/'+('Qiye-preview.html' if args.preview else 'index.html')
 context.route('https://**/*',external);page=context.new_page();page.set_default_timeout(60000);page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',str(e),flush=True)))
 page.on('console',lambda m:print('CONSOLE',m.text[:300],flush=True) if m.type=='error' else None)
 try:
  page.goto(url);page.locator('#desktop .tile-link').first.wait_for()
  page.evaluate('''async({state,catalog,source,extension})=>{
   state.activeGroupId='home';state.items=['a','b'].map((id,i)=>({id,type:'widget',widget:'community',title:'便签 '+id,size:'2x2',groupId:i?'code':'home',config:{source,manifest:catalog.widgets[0]},data:{value:JSON.stringify({config:{},data:{notes:'saved '+id}})}}));
   if(extension)await chrome.storage.local.set({'qiye.state.v5':state});else localStorage.setItem('qiye.state.v5',JSON.stringify(state));
   localStorage.setItem('qiye.community.v1',JSON.stringify([{url:source,enabled:true,catalog}]));
  }''',dict(state=state,catalog=catalog,source=SOURCE,extension=args.extension))
  page.reload();page.locator('#desktop iframe[data-ready=true]').wait_for()
  assert len(requests)==3,requests
  card=page.frame_locator('#desktop iframe')
  assert card.locator('body').evaluate("()=>new URL(location.href).searchParams.get('widget')")== 'notes'
  assert card.locator('body').evaluate('()=>isSecureContext && typeof crypto.randomUUID==="function"')
  assert card.locator('body').evaluate('()=>{try{void parent.document;return false}catch{return true}}')
  boot=card.locator('body').evaluate('()=>window.cacheTestIdentity=crypto.randomUUID()');card.locator('textarea').fill('cached draft')
  page.locator('[data-group=code]').click();page.locator('#desktop [data-item=b] iframe[data-ready=true]').wait_for()
  assert len(requests)==3,requests
  page.locator('[data-group=home]').click();page.locator('#desktop [data-item=a] iframe[data-ready=true]').wait_for()
  assert page.frame_locator('#desktop iframe').locator('body').evaluate('()=>window.cacheTestIdentity')==boot
  expect(page.frame_locator('#desktop iframe').locator('textarea')).to_have_value('cached draft')
  # Real notes debounce edits for 400ms; reload only after the host has
  # acknowledged persistence, not while the editor still says "saving".
  for _ in range(100):
   persisted=page.evaluate('''async extension=>{
   const saved=extension?(await chrome.storage.local.get('qiye.state.v5'))['qiye.state.v5']:JSON.parse(localStorage.getItem('qiye.state.v5'));
   return saved?.items.some(item=>item.id==='a'&&item.data?.value?.includes('cached draft'));
   }''',args.extension)
   if persisted:break
   page.wait_for_timeout(50)
  else:raise AssertionError('Widget draft was not saved')
  offline=True;requests.clear()
  if args.extension:context.set_offline(True)
  page.reload();page.locator('#desktop iframe[data-ready=true]').wait_for()
  expect(page.frame_locator('#desktop iframe').locator('textarea')).to_have_value('cached draft')
  other=context.new_page();other.goto(url);other.locator('#desktop iframe[data-ready=true]').wait_for()
  assert not requests,requests
  assert not errors,errors
  print('PASS slow first download, 3 shared resources, same frame across groups, offline reload/new tab, saved data, query and opaque sandbox')
 finally:
  context.close()
  if browser:browser.close()
  server.shutdown()
