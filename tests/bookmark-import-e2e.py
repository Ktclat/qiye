"""Bookmark selection, narrow/light UI, configurable hold time and revocation."""
import json,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/playwright/bookmark-import';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
api="""(()=>{
 const listeners=[],grants=new Set(JSON.parse(localStorage.getItem('test.grants')||'["bookmarks","history","https://uapis.cn/*","https://dav.example/*"]'));
 const result=(value,callback)=>{if(callback)callback(value);return Promise.resolve(value)};
 window.removals=[];
 const keys=d=>[...(d.permissions||[]),...(d.origins||[])];
 window.chrome={runtime:{id:'test',getManifest:()=>({host_permissions:[]})},permissions:{
 contains:(d,cb)=>result(keys(d).every(k=>grants.has(k)),cb),
 request:(d,cb)=>{keys(d).forEach(k=>grants.add(k));return result(true,cb)},
 remove:(d,cb)=>{removals.push(d);keys(d).forEach(k=>grants.delete(k));localStorage.setItem('test.grants',JSON.stringify([...grants]));listeners.forEach(fn=>fn(d));return result(true,cb)},
 getAll:()=>Promise.resolve({permissions:[...grants].filter(k=>!k.includes('://')),origins:[...grants].filter(k=>k.includes('://'))}),
 onRemoved:{addListener:fn=>listeners.push(fn)},onAdded:{addListener:()=>{}}
 },bookmarks:{getTree:cb=>result([{title:'',children:Array.from({length:5},(_,f)=>({title:['开发工具','设计资料','产品灵感','阅读收藏','未整理'][f],children:Array.from({length:85},(_,i)=>({title:i===0&&f===0?'Google':`资源 ${f}-${i}`,url:i===0&&f===0?'https://www.google.com/':`https://example.org/${f}/${i}`}))}))}],cb)}};
})();"""
with sync_playwright() as pw:
 browser=pw.chromium.launch();context=browser.new_context(locale='zh-CN',viewport={'width':1440,'height':960});context.add_init_script(api)
 context.route('https://**/*',lambda r:r.fulfill(content_type='application/json',body='{}'))
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/');page.locator('#desktop .tile-link').first.wait_for()
 try:
  page.locator('#brand-button').click()
  expect(page.locator('[data-preference=dragHoldMs]')).to_have_value('200')
  page.locator('[data-preference=dragHoldMs]').select_option('600')
  page.wait_for_function("()=>JSON.parse(localStorage.getItem('qiye.state.v5'))?.settings.dragHoldMs===600")
  page.reload();page.locator('#brand-button').click();expect(page.locator('[data-preference=dragHoldMs]')).to_have_value('600')
  page.locator('[data-settings-tab=data]').click();page.locator('[data-action=import-bookmarks]').click()
  expect(page.locator('.bookmark-import-header small')).to_have_text('425')
  page.locator('#dialog').evaluate('e=>Promise.all(e.getAnimations().map(a=>a.finished))')
  assert abs(page.locator('.bookmark-import-header').bounding_box()['height']-46)<0.1
  assert page.locator('[data-bookmark-index]').count()==100
  page.screenshot(path=str(OUT/'dark.png'))
  page.locator('[data-bookmark-query]').fill('example.org/0/7')
  page.locator('[data-bookmark-select-all]').check()
  expect(page.locator('[data-bookmark-count]')).to_have_text('已选 11 个')
  page.locator('[data-bookmark-query]').fill('资源 1-84');page.locator('[data-bookmark-index]').check()
  expect(page.locator('[data-bookmark-count]')).to_have_text('已选 12 个')
  page.locator('[name=groupId]').select_option('code')
  page.locator('#bookmarks-form [type=submit]').click();expect(page.locator('#dialog')).not_to_be_visible()
  page.wait_for_function("()=>JSON.parse(localStorage.getItem('qiye.state.v5')).items.filter(i=>i.url?.startsWith('https://example.org/')).length===12")
  page.locator('#brand-button').click();page.locator('[data-settings-tab=data]').click();page.locator('[data-action=import-bookmarks]').click()
  page.locator('[name=groupId]').select_option('code');page.locator('[data-bookmark-query]').fill('example.org/0/7')
  assert page.locator('.is-duplicate').count()==11
  page.locator('[data-bookmark-query]').fill('')
  expect(page.locator('#toast')).not_to_be_visible()
  page.evaluate("()=>document.documentElement.dataset.theme='light'");page.screenshot(path=str(OUT/'light.png'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'narrow.png'))
  assert page.locator('#dialog').evaluate('e=>e.scrollWidth<=e.clientWidth')
  assert page.locator('.bookmark-import-results').evaluate('e=>e.scrollWidth<=e.clientWidth')
  page.locator('[data-revoke-permission]').click();expect(page.locator('#dialog')).not_to_be_visible()
  assert page.evaluate('()=>removals.some(d=>d.permissions?.includes("bookmarks"))')
  page.locator('#brand-button').click();page.locator('[data-settings-tab=permissions]').click()
  expect(page.locator('[data-revoke-permission]').first).to_be_disabled()
  page.locator('[data-revoke-permission]').filter(has_text='撤销授权').last.click()
  assert page.evaluate('()=>removals.some(d=>d.origins?.includes("https://dav.example/*"))')
  page.set_viewport_size({'width':1440,'height':960});page.screenshot(path=str(OUT/'permissions.png'))
  assert not errors,errors
  print('PASS 425 bookmarks, folders, search, cross-filter selection, duplicates, import, 46px header, themes/narrow, 200ms default, persisted override and permission removal')
 finally:browser.close();server.shutdown()
