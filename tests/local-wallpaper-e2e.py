"""Uploaded wallpaper library: real IndexedDB, upload controls and persisted selection."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import argparse,base64,json,tempfile,threading
from playwright.sync_api import sync_playwright,expect
from browser_checks import wait_for_async
from image_fixtures import upload,png_image

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');parser.add_argument('--extension',action='store_true');parser.add_argument('--live',action='store_true');args=parser.parse_args()
mode='live' if args.live else 'extension' if args.extension else 'preview' if args.preview else 'source'
OUT=ROOT/'output/playwright/local-wallpapers'/mode;OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
url='https://ktclat.github.io/qiye/' if args.live else (ROOT/'Qiye-preview.html').as_uri() if args.preview else f'http://127.0.0.1:{server.server_port}/'
checks=[]
def check(name,value):
 assert value,name
 checks.append(name);print('PASS',name,flush=True)

with tempfile.TemporaryDirectory(prefix='qiye-local-wallpapers-') as profile,sync_playwright() as pw:
 context=pw.chromium.launch_persistent_context(profile,channel='chromium' if args.extension else None,headless=True,locale='zh-CN',viewport={'width':1440,'height':960},args=[f'--disable-extensions-except={ROOT}',f'--load-extension={ROOT}'] if args.extension else [])
 if not args.live:context.route('https://**/*',lambda route:route.abort())
 if args.extension:
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=20000)
  url=f'chrome-extension://{worker.url.split("/")[2]}/index.html'
 page=context.new_page();page.set_default_timeout(20000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def settings():return page.evaluate("async()=>{const key='qiye.state.v5';return (globalThis.chrome?.runtime?.id?(await chrome.storage.local.get(key))[key]:JSON.parse(localStorage.getItem(key)))?.settings}") or {}
 def open_uploads():
  page.locator('.top-tools').hover();page.locator('.top-tools [data-action=wallpaper]').click();page.locator('[data-gallery-tab=custom]').click();page.wait_for_function('()=>!document.querySelector(".wallpaper-status")?.textContent.includes("正在读取")')
 def close():page.locator('#dialog [data-close]').first.click()
 def rows():return page.locator('[data-local-wallpaper]')
 def upload_file(file,count):
  page.locator('#wallpaper-file').set_input_files(file);expect(rows()).to_have_count(count);page.wait_for_function('()=>document.querySelector(".wallpaper-upload.selected") && !document.querySelector(".wallpaper-status")?.textContent.includes("正在读取")')
  expect(page.locator('.wallpaper-upload.selected strong')).to_have_text(file['name'])
  page.wait_for_function('()=>[...document.querySelectorAll(".wallpaper-upload img")].every(img=>img.complete&&img.naturalWidth>0)')
 try:
  page.goto(url,wait_until='domcontentloaded');page.locator('#desktop .tile-link').first.wait_for();open_uploads()
  check('fresh custom gallery has an empty state',rows().count()==0 and '上传后' in page.locator('.local-wallpaper-empty').inner_text())
  first=upload('海边 <one>.png',width=640,height=360);second=upload('山间 two.png',width=480,height=320)
  upload_file(first,1);first_url=settings()['customWallpaper'];first_id=rows().first.get_attribute('data-local-wallpaper')
  check('upload appears with escaped filename and active state',rows().first.locator('strong').inner_text()==first['name'] and rows().first.get_attribute('class').endswith('selected'))
  upload_file(second,2);check('a second upload retains the first',rows().filter(has=page.locator(f'[data-gallery-local-apply="{first_id}"]')).count()==1)
  upload_file(first,2);check('reupload deduplicates identical media',rows().count()==2)
  page.locator('[data-gallery-tab=official]').click();page.locator('[data-wallpaper=forest]').click();page.locator('[data-gallery-tab=custom]').click();expect(rows()).to_have_count(2)
  check('switching to official backgrounds preserves uploads',settings()['customWallpaper'] is None and page.locator('.wallpaper-upload.selected').count()==0)
  page.locator(f'[data-gallery-local-preview="{first_id}"]').focus();page.keyboard.press('Enter');expect(page.locator('.wallpaper-preview')).to_be_visible()
  check('local preview is separate from applying',settings()['customWallpaper'] is None and page.locator('dialog[open]').count()==1)
  page.keyboard.press('Escape');expect(rows()).to_have_count(2)
  page.locator(f'[data-local-wallpaper="{first_id}"]').hover();page.locator(f'[data-gallery-local-apply="{first_id}"]').click()
  wait_for_async(page,"async value=>{const key='qiye.state.v5';const state=globalThis.chrome?.runtime?.id?(await chrome.storage.local.get(key))[key]:JSON.parse(localStorage.getItem(key));return state?.settings.customWallpaper===value}",arg=first_url)
  close();page.reload(wait_until='domcontentloaded');page.locator('#desktop .tile-link').first.wait_for();open_uploads();expect(rows()).to_have_count(2)
  check('selection and both uploaded files survive reload',settings()['customWallpaper']==first_url and page.locator(f'[data-local-wallpaper="{first_id}"].selected').count()==1)
  page.screenshot(path=str(OUT/'uploads-dark.png'))
  close();page.locator('#brand-button').click();page.locator('[data-settings-tab=appearance]').click();page.locator('[data-theme=light]').click();close();open_uploads()
  page.screenshot(path=str(OUT/'uploads-light.png'));page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
  check('narrow gallery has no horizontal overflow',page.locator('.wallpaper-content').evaluate('n=>n.scrollWidth<=n.clientWidth+1'))
  page.screenshot(path=str(OUT/'uploads-narrow.png'));page.set_viewport_size({'width':1440,'height':960})
  # A verified VP8/WebM fixture avoids platform-dependent MediaRecorder output.
  clip=json.loads((ROOT/'tests/fixtures/wallpaper-video.json').read_text(encoding='utf-8'))
  upload_file({'name':'动态背景.webm','mimeType':clip['mimeType'],'buffer':base64.b64decode(clip['base64'])},3)
  video=page.locator('.wallpaper-upload.selected');video_id=video.get_attribute('data-local-wallpaper')
  check('uploaded videos have a media thumbnail',video.locator('video').count()==1)
  page.wait_for_function('()=>document.querySelector(".wallpaper-upload.selected video").videoWidth>0')
  video.hover();video.locator('[data-gallery-local-preview]').click();expect(page.locator('.wallpaper-preview video[controls]')).to_be_visible();page.locator('[data-gallery-back]').click()
  page.locator(f'[data-gallery-local-delete="{video_id}"]').click();page.locator('[data-gallery-local-cancel]').click();check('cancel deletion preserves the upload',rows().count()==3)
  if not args.extension:
   active_video=settings()['customWallpaper']
   page.evaluate('''()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='qiye.state.v5'){Storage.prototype.setItem=original;throw new DOMException('Test storage full','QuotaExceededError')}return original.call(this,key,value)}}''')
   page.locator(f'[data-gallery-local-delete="{video_id}"]').click();page.locator(f'[data-gallery-local-remove="{video_id}"]').click()
   expect(page.locator('#toast')).to_contain_text('保存失败')
   expect(page.locator(f'[data-gallery-local-delete="{video_id}"]')).to_be_enabled()
   restored=page.evaluate('''id=>new Promise((resolve,reject)=>{const open=indexedDB.open('qiye.wallpapers.v1');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,read=db.transaction('wallpapers').objectStore('wallpapers').get(id);read.onsuccess=()=>{db.close();resolve(!!read.result)}}})''',video_id)
   check('failed active deletion restores both the upload and desktop',restored and settings()['customWallpaper']==active_video and rows().count()==3)
   page.locator('[data-gallery-local-cancel]').click()
  page.locator(f'[data-gallery-local-delete="{video_id}"]').click();page.locator(f'[data-gallery-local-remove="{video_id}"]').click();expect(rows()).to_have_count(2)
  check('deleting the active upload restores built-in background',settings()['customWallpaper'] is None)
  page.locator('#wallpaper-file').set_input_files({'name':'too-large.webm','mimeType':'video/webm','buffer':b'0'*(4*1024*1024+1)})
  expect(page.locator('#toast')).to_contain_text('4 MiB');check('rejected upload preserves the library',rows().count()==2 and settings()['customWallpaper'] is None)
  page.locator(f'[data-gallery-local-delete="{first_id}"]').click();page.locator(f'[data-gallery-local-remove="{first_id}"]').click();expect(rows()).to_have_count(1)
  close();page.reload(wait_until='domcontentloaded');page.locator('#desktop .tile-link').first.wait_for();open_uploads();expect(rows()).to_have_count(1)
  check('deletion survives reload',rows().first.locator('strong').inner_text()==second['name'])
  # Seed the old single-background format, then use normal startup migration.
  legacy='data:image/png;base64,'+base64.b64encode(png_image(320,240)).decode()
  close();page.evaluate('''async url=>{const key='qiye.state.v5',extension=!!globalThis.chrome?.runtime?.id;const state=extension?(await chrome.storage.local.get(key))[key]:JSON.parse(localStorage.getItem(key));state.settings.customWallpaper=url;state.settings.customWallpaperType='image';if(extension)await chrome.storage.local.set({[key]:state});else localStorage.setItem(key,JSON.stringify(state))}''',legacy)
  page.reload(wait_until='domcontentloaded');page.locator('#desktop .tile-link').first.wait_for();open_uploads();expect(rows()).to_have_count(2)
  check('legacy active background is collected without changing its data',settings()['customWallpaper']==legacy and page.locator('.wallpaper-upload.selected strong').inner_text()=='已保存的自定义背景')
  if not args.live and not args.preview:
   storage=page.evaluate('''async()=>{const {createLocalWallpaperStore}=await import('./src/local-wallpapers.js');const store=createLocalWallpaperStore({name:'qiye.wallpaper-limit-test'}),media=i=>new Blob([new Uint8Array([i+1])],{type:'image/png'});
    const [a,b]=await Promise.all([store.put(media(0),'first.png'),store.put(media(0),'duplicate.png')]);
    const deduplicated=a.id===b.id&&(await store.list()).length===1;
    for(let i=1;i<50;i++)await store.put(media(i),i+'.png');
    let rejected=false;try{await store.put(media(50),'overflow.png')}catch(error){rejected=error.message.includes('50')}
    const rows=await store.list(),preserved=rows.length===50&&rows.some(row=>row.id===a.id);
    await store.remove(a.id);await store.put(media(50),'replacement.png');
    return {deduplicated,rejected,preserved,recovered:(await store.list()).length===50};}''')
   check('concurrent identical uploads store only one copy',storage['deduplicated'])
   check('full library rejects atomically and accepts uploads after removal',storage['rejected'] and storage['preserved'] and storage['recovered'])
  check('no uncaught page errors',not errors)
 except Exception:
  page.screenshot(path=str(OUT/'failure.png'));print('ERRORS',errors,'MEDIA',page.locator('video').evaluate_all('(nodes)=>nodes.map(n=>({source:n.currentSrc.slice(0,90),ready:n.readyState,error:n.error?.message}))'),flush=True);raise
 finally:
  (OUT/'report.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8');context.close();server.shutdown()
