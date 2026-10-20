// SPDX-License-Identifier: GPL-3.0-only
import { SANDBOX_DOCUMENT } from './plugin-sandbox.js';
import { publicHttpsUrl } from './public-json.js';

const DB='qiye.widget-cache.v1', LIMIT=12*1024*1024, MAX_ENTRIES=6;
const pending=new Map(), memory=new Map();
let database;
function openDB() {
 return database||(database=new Promise((resolve,reject)=>{
  const job=indexedDB.open(DB,1);
  job.onupgradeneeded=()=>job.result.createObjectStore('documents',{keyPath:'key'});
  job.onsuccess=()=>resolve(job.result);job.onerror=()=>reject(job.error);
 }).catch(()=>null));
}
async function read(key) {
 const db=await openDB();if(!db)return null;
 return new Promise(resolve=>{const job=db.transaction('documents').objectStore('documents').get(key);job.onsuccess=()=>resolve(job.result);job.onerror=()=>resolve(null);});
}
async function write(record) {
 const db=await openDB();if(!db)return;
 await new Promise(resolve=>{
  const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents');
  store.put(record);const job=store.getAll();
  job.onsuccess=()=>{const rows=job.result.sort((a,b)=>b.time-a.time);let bytes=0;rows.forEach((row,i)=>{bytes+=row.html.length*2;if(i>=MAX_ENTRIES||bytes>32*1024*1024)store.delete(row.key);});};
  tx.oncomplete=tx.onerror=tx.onabort=()=>resolve();
 });
}
async function textResource(url,signal) {
 const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'force-cache'});
 if(!response.ok)throw new Error('Widget resource HTTP '+response.status);
 if(Number(response.headers.get('content-length'))>LIMIT)throw new Error('Widget resource too large');
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>LIMIT){await reader.cancel();throw new Error('Widget resource too large');}text+=decoder.decode(chunk.value,{stream:true});}return text+decoder.decode();}
 finally{reader.releaseLock();}
}
function scriptDataUrl(text) {
 const bytes=new TextEncoder().encode(text),chunks=[];
 for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
 return 'data:text/javascript;base64,'+btoa(chunks.join(''));
}
export function widgetCacheKey(plugin) {
 const url=new URL(publicHttpsUrl(plugin.manifest.entry));
 // Official releases share one immutable runtime; the selected widget is
 // supplied in init. Other sources keep their query parameters in the key.
 if(plugin.source==='https://ktclat.github.io/qiye-widgets/index.json')url.search='';
 url.hash='';
 return url.href+'#qiye-release='+encodeURIComponent(plugin.manifest.release||'');
}
async function download(plugin,key) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const html=await textResource(key,controller.signal),doc=new DOMParser().parseFromString(html,'text/html');
  // Only self-contained classic-script documents are eligible. Modules/import
  // maps and child frames keep their normal remote loading path.
  if(doc.querySelector('base,[srcset],script[type="module"],script[type="importmap"],script[integrity],link[integrity],iframe,object,embed,meta[http-equiv="refresh" i],meta[http-equiv="content-security-policy" i]'))return null;
  const nodes=[...doc.querySelectorAll('script[src],link[rel="stylesheet"][href]')];
  if(nodes.length>12)return null;
  let total=html.length*2;
  const resources=await Promise.all(nodes.map(async node=>{
   const url=new URL(node.getAttribute(node.tagName==='SCRIPT'?'src':'href'),key);
   if(url.origin!==new URL(key).origin)throw new Error('Cross-origin widget bundle');
   const content=await textResource(url.href,controller.signal);
   total+=content.length*2;if(total>LIMIT){controller.abort();throw new Error('Widget bundle too large');}
   return {node,url,content};
  }));
  for(const {node,url,content} of resources){
   // Keep defer/async/nomodule semantics: converting a deferred script into an
   // inline head script would run it before its DOM exists.
   const replacement=node.tagName==='SCRIPT'?node.cloneNode(false):doc.createElement('style');
   if(node.tagName==='SCRIPT')replacement.src=scriptDataUrl(content);
   else replacement.textContent=content.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g,(match,_quote,path)=>/^(data:|blob:|#)/i.test(path)?match:'url("'+new URL(path.trim(),url).href+'")');
   node.replaceWith(replacement);
  }
  // MV3 also enforces the host's base-uri restriction. Resolve declarative
  // resources here rather than inserting a remote <base> into an extension page.
  for(const node of doc.querySelectorAll('[src],[href],[action],[poster]')){
   for(const attribute of ['src','href','action','poster']){
    const value=node.getAttribute(attribute);
    if(value&&!value.startsWith('#'))node.setAttribute(attribute,new URL(value,key).href);
   }
  }
  for(const node of doc.querySelectorAll('style'))node.textContent=node.textContent.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g,(match,_quote,path)=>/^(data:|blob:|#)/i.test(path)?match:'url("'+new URL(path.trim(),key).href+'")');
  const bundled='<!doctype html>'+doc.documentElement.outerHTML;
  if(bundled.length*2>LIMIT)return null;
  const record={key,html:bundled,time:Date.now()};
  await write(record);return record;
 }finally{clearTimeout(timer);}
}
export async function cachedWidgetDocument(plugin) {
 const key=widgetCacheKey(plugin);
 if(memory.has(key))return memory.get(key);
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const record=await read(key)||await download(plugin,key);
  if(record&&typeof record.html==='string'&&record.html.length*2<=LIMIT){
   memory.set(key,record.html);if(memory.size>MAX_ENTRIES)memory.delete(memory.keys().next().value);
   return record.html;
  }
  return null;
 })().finally(()=>pending.delete(key));
 pending.set(key,job);
 return job;
}
export function loadCachedFrame(frame,html,entry,signal,onReady) {
 const token=crypto.randomUUID();
 const receive=event=>{if(event.source===frame.contentWindow&&event.data?.type==='qiye:cached-ready'&&event.data.token===token){window.removeEventListener('message',receive);onReady();}};
 window.addEventListener('message',receive,{signal});
 frame.addEventListener('load',()=>frame.contentWindow.postMessage({type:'qiye:cached-document',token,html,entry},'*'),{once:true,signal});
 const query=new URL(entry).search;
 // srcdoc inherits the embedding document's secure context (clipboard, UUID)
 // while its sandbox still gives it an opaque, inaccessible origin.
 if(globalThis.chrome?.runtime?.id)frame.src=chrome.runtime.getURL('widget-sandbox.html')+query;
 else frame.srcdoc=SANDBOX_DOCUMENT;
}
