// SPDX-License-Identifier: GPL-3.0-only
import { SOURCES_CHANGED } from './widget-sources.js';

// Prepare only the document. Instance data and the capability port are supplied
// by mountPlugin when the user actually opens the window, never while parked.
let prepared;
let listening=false;
const keyFor=(item,plugin)=>JSON.stringify([item.id,plugin.source,plugin.manifest]);

export function createPluginFrame(item,plugin,{preview=false}={}) {
 const frame=document.createElement('iframe');
 frame.title=item.title;frame.dataset.api=plugin.manifest.version;
 frame.sandbox=preview?'allow-scripts':'allow-scripts allow-forms allow-downloads';
 if(!preview)frame.allow='clipboard-write *';
 frame.referrerPolicy='no-referrer';frame.setAttribute('credentialless','');
 frame.className='plugin-frame';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
 return frame;
}

export function discardPreparedWindow(itemId) {
 if(!prepared||(itemId!==undefined&&prepared.itemId!==itemId))return;
 const entry=prepared;prepared=null;
 clearTimeout(entry.timer);entry.controller.abort();entry.stage.remove();
}

export function preparePluginWindow(item,plugin) {
 if(!document.body.moveBefore||document.hidden||navigator.connection?.saveData)return;
 const key=keyFor(item,plugin);
 if(prepared?.key===key)return;
 discardPreparedWindow();
 if(!listening){
  listening=true;
  window.addEventListener(SOURCES_CHANGED,()=>discardPreparedWindow());
  window.addEventListener('pagehide',()=>discardPreparedWindow());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)discardPreparedWindow();});
 }
 const stage=document.createElement('div');stage.className='plugin-preload-stage';stage.inert=true;stage.setAttribute('aria-hidden','true');
 const frame=createPluginFrame(item,plugin),controller=new AbortController();
 const entry={key,itemId:item.id,stage,frame,controller,loaded:false,timer:0};
 prepared=entry;
 frame.addEventListener('load',()=>{
  // A parked page that navigates itself must never receive a host session.
  if(entry.loaded){if(prepared===entry)discardPreparedWindow();return;}
  entry.loaded=true;
 },{signal:controller.signal});
 entry.timer=setTimeout(()=>{if(prepared===entry)discardPreparedWindow();},10000);
 frame.src=plugin.manifest.entry;stage.append(frame);document.body.append(stage);
}

export function takePreparedWindow(root,item,plugin) {
 if(!prepared)return null;
 const entry=prepared;
 if(entry.key!==keyFor(item,plugin)||!root.isConnected||!entry.frame.isConnected||!root.moveBefore){discardPreparedWindow();return null;}
 // append()/replaceChildren() would reload the iframe and defeat preparation.
 // moveBefore preserves the document, but is still feature-detected for older
 // browsers. A failed move falls back to the usual fresh sandboxed frame.
 try{root.moveBefore(entry.frame,null);}catch{discardPreparedWindow();return null;}
 prepared=null;clearTimeout(entry.timer);entry.controller.abort();entry.stage.remove();
 return {frame:entry.frame,loaded:entry.loaded};
}
