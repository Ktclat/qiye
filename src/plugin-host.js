// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { resolveWidgetSource } from './widget-sources.js';
import { validatePluginData } from './plugin-data.js';
import { validateCommunityData } from './community-format.js';
import { publicHttpsUrl } from './public-json.js';

const sessions = new Map();
const appearanceKeys = ['theme','themeColor','useThemeColor','surfaceStyle','surfaceOpacity','surfaceBlur','reducedEffects','uiFont','gridSize','gap','radius','showSeconds','hour12'];
export function pluginCard(item) {
 return `<section class="plugin-slot" data-plugin-slot data-widget-id="${e(item.id)}"><button class="plugin-placeholder" data-action="widget-sources"><strong>${e(item.title)}</strong><small>${t('启用小组件源')}</small></button></section>`;
}
export function pluginWorkspace(item) {
 let plugin;try{plugin=resolveWidgetSource(item);}catch{}
 return `<header class="plugin-window-header"><h2 id="dialog-title" tabindex="-1">${e(item.title)}</h2>${plugin?.manifest.capabilities?.includes('bookmarks')?`<button data-plugin-grant>${t('授权浏览器书签')}</button>`:''}${plugin?.manifest.capabilities?.includes('geolocation')?`<button data-plugin-location>${t('授权定位')}</button>`:''}<button data-action="widget-sources" aria-label="${t('小组件源')}">${icon('settings')}</button><button data-plugin-expand aria-label="${t('切换窗口大小')}">${icon('maximize')}</button><button data-close aria-label="${t('关闭')}">${icon('close')}</button></header>${pluginCard(item)}`;
}
function payload(item) {
 return item.widget==='community'?{value:item.data.value||'null',revision:item.data.value||'null'}
 :{legacy:{widget:item.widget,config:item.config,data:item.data},revision:JSON.stringify({config:item.config,data:item.data})};
}
function scopedKey(item,plugin) { return 'qiye.plugin.'+encodeURIComponent(plugin.source+'|'+plugin.manifest.id+'|'+item.id); }
function grantKey(plugin) { return 'qiye.plugin.grant.'+encodeURIComponent(plugin.source+'|'+plugin.manifest.id); }

export async function performPluginCall(method,params,{item,plugin,host,active,mode='card'}) {
 if(!active())throw new Error(t('组件已停止'));
 if(method==='save'){
  const value=validatePluginData(params.value);
  const current=host.getState().items.find(entry=>entry.id===item.id);
  if(!current||params.expected!==payload(current).revision)throw new Error(t('组件内容已在其他位置修改，请重新打开。'));
  await host.savePlugin(item.id,value,params.expected,{plugin,title:params.title,size:params.size});
  host.refreshCards?.();
  return payload(host.getState().items.find(entry=>entry.id===item.id));
 }
 if(method==='storage'){
  const checked=validatePluginData(params.value);
  if(Object.values(checked).some(value=>typeof value!=='string'))throw new Error('Storage values must be strings');
  localStorage.setItem(scopedKey(item,plugin),JSON.stringify(checked));
  return true;
 }
 if(method==='open'){host.openDialog('widget-detail',{item:host.getState().items.find(entry=>entry.id===item.id)});return true;}
 if(method==='settings'){host.openDialog('widget-config',{item:host.getState().items.find(entry=>entry.id===item.id)});return true;}
 if(method==='close'){if(mode!=='window')throw new Error('No widget window');void host.closeDialog();return true;}
 if(method==='expand'){if(mode!=='window')throw new Error('No widget window');document.querySelector('#dialog')?.classList.toggle('widget-app-expanded');return true;}
 if(method==='toast'){host.toast(String(params.message||'').slice(0,300));return true;}
 if(method==='openUrl'){window.open(publicHttpsUrl(params.url),'_blank','noopener,noreferrer');return true;}
 if(method==='wallpaper'){
  if(!plugin.manifest.capabilities?.includes('wallpaper'))throw new Error('Capability not declared');
  if(params.blob){if(!(params.blob instanceof Blob)||params.blob.size>20*1024*1024)throw new Error('Invalid image');return host.applyWallpaperBlob(params.blob);}
  if(params.photo)return host.applyWallpaper(params.photo);
  host.openWallpaper();return true;
 }
 if(method==='geolocation'){
  if(!plugin.manifest.capabilities?.includes('geolocation'))throw new Error('Capability not declared');
  if(localStorage.getItem(grantKey(plugin)+'|geolocation')!=='true'){
   document.querySelector('.plugin-window-header')?.classList.add('needs-grant');
   throw new Error(t('请先点击窗口标题栏的“授权定位”。'));
  }
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:10000,maximumAge:60000}));
  return {timestamp:position.timestamp,coords:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy}};
 }
 if(method==='bookmarks'){
  if(!plugin.manifest.capabilities?.includes('bookmarks'))throw new Error('Capability not declared');
  const allowed=localStorage.getItem(grantKey(plugin))==='true'&&!!globalThis.chrome?.bookmarks&&await chrome.permissions.contains({permissions:['bookmarks']});
  if(params.action==='contains')return allowed;
  if(params.action==='request'){
   if(allowed)return true;
   document.querySelector('.plugin-window-header')?.classList.add('needs-grant');
   throw new Error(t('请先点击窗口标题栏的“授权浏览器书签”。'));
  }
  if(!allowed)throw new Error(t('请先点击窗口标题栏的“授权浏览器书签”。'));
  const action=params.action,args=params.args||[];
  if(!['getTree','create','update','move','remove','removeTree'].includes(action)||!Array.isArray(args)||args.length>2)throw new Error('Unsupported bookmark operation');
  if(action!=='getTree'){
   if(action!=='create'&&(typeof args[0]!=='string'||args[0].length>100))throw new Error('Invalid bookmark id');
   const details=action==='create'?args[0]:args[1];
   if(['create','update','move'].includes(action)){
    validatePluginData(details);
    if(Object.keys(details).some(key=>!['title','url','parentId','index'].includes(key)))throw new Error('Invalid bookmark fields');
    if(details.url!==undefined){const url=new URL(details.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Unsafe bookmark URL');}
    if(details.title!==undefined&&(typeof details.title!=='string'||details.title.length>300))throw new Error('Invalid bookmark title');
    if(details.parentId!==undefined&&typeof details.parentId!=='string')throw new Error('Invalid parent id');
    if(details.index!==undefined&&(!Number.isInteger(details.index)||details.index<0))throw new Error('Invalid index');
   }
  }
  return chrome.bookmarks[action](...args);
 }
 throw new Error('Unsupported plugin API');
}

export function mountPlugin(root,item,host,mode='card') {
 let plugin;try{plugin=resolveWidgetSource(item);}catch(error){root.title=error.message;}
 if(!plugin)return ()=>{};
 const controller=new AbortController();let port,timer,observer,themeObserver,ready=false,loaded=false,busy=false,closed=false,lastSignature='',flushJob,flushPromise,retryCleanup=()=>{};
 const frame=document.createElement('iframe');frame.title=item.title;frame.dataset.api=plugin.manifest.version;frame.sandbox='allow-scripts allow-forms allow-downloads';frame.referrerPolicy='no-referrer';frame.setAttribute('credentialless','');
 const active=()=>!closed&&root.isConnected&&!!host.getState().items.find(entry=>entry.id===item.id)&&!!resolveWidgetSource(item);
 const environment=()=>({locale:getLocale(),theme:document.documentElement.dataset.theme||host.getState().settings.theme,extension:!!globalThis.chrome?.runtime?.id,mode,size:item.size,width:root.clientWidth,height:root.clientHeight,settings:Object.fromEntries(appearanceKeys.map(key=>[key,host.getState().settings[key]]))});
 const current=()=>host.getState().items.find(entry=>entry.id===item.id);
 const update=()=>{
  if(!ready||!active())return;
  const next={type:'state',...payload(current()),environment:environment()};const signature=JSON.stringify(next);
  if(signature!==lastSignature){lastSignature=signature;port.postMessage(next);}
 };
 const dispose=()=>{closed=true;clearTimeout(timer);observer?.disconnect();themeObserver?.disconnect();controller.abort();port?.close();frame.remove();if(sessions.get(root)?.frame===frame)sessions.delete(root);};
 const fail=message=>{dispose();root.innerHTML=`<button class="plugin-placeholder" data-plugin-retry><strong>${e(item.title)}</strong><small>${e(message)}</small><span>${t('重试')}</span></button>`;root.addEventListener('click',onRetry,{once:true});};
 const onRetry=()=>{root.replaceChildren();retryCleanup=mountPlugin(root,item,host,mode);};
 frame.addEventListener('load',()=>{
  // Never transfer a new capability after an untrusted frame navigates itself.
  if(loaded){fail(t('组件页面已跳转，请重试。'));return;}loaded=true;
  const channel=new MessageChannel();port=channel.port1;
  port.onmessage=async event=>{
   const message=event.data;if(!active())return;
   if(message?.type==='flushed'&&flushJob){const job=flushJob;flushJob=null;clearTimeout(job.timer);message.error?job.reject(new Error(message.error)):job.resolve();return;}
   if(message?.type==='ready'&&message.version===plugin.manifest.version){ready=true;clearTimeout(timer);frame.dataset.ready='true';update();return;}
   if(!ready)return;
   if(plugin.manifest.version===1&&message?.type==='save'){
    try{if(busy)throw new Error('Save in progress');busy=true;const data=validateCommunityData({value:message.value});await host.saveData(item.id,data,JSON.stringify(current().data));if(active())port.postMessage({type:'saved',id:message.id,ok:true});}
    catch(error){if(active())port.postMessage({type:'saved',id:message.id,error:error.message});}finally{busy=false;}return;
   }
   if(message?.type!=='call'||typeof message.id!=='string'||message.id.length>80)return;
   const reply=data=>{if(active())port.postMessage({type:'result',id:message.id,...data});};
   const writing=['save','bookmarks'].includes(message.method);
   if(writing&&busy){reply({error:'Operation in progress'});return;}
   if(writing)busy=true;
   try{reply({value:await performPluginCall(message.method,message.params||{},{item,plugin,host,active,mode})});}
   catch(error){reply({error:error.message});}finally{if(writing)busy=false;}
  };
  let storage={};try{storage=validatePluginData(JSON.parse(localStorage.getItem(scopedKey(item,plugin))||'{}'));}catch{}
  const init={type:'qiye:init',version:plugin.manifest.version,...payload(current()),data:current().data.value||'null',item:{id:item.id,title:item.title,size:item.size},environment:environment(),storage};
  // Opaque sandbox origin requires '*'; the channel is sent only to this frame.
  frame.contentWindow.postMessage(init,'*',[channel.port2]);
  observer=new ResizeObserver(update);observer.observe(root);
  themeObserver=new MutationObserver(update);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});
 },{signal:controller.signal});
 timer=setTimeout(()=>fail(t('组件未响应，请检查网络后重试。')),15000);
 const flush=()=>!ready||plugin.manifest.version!==2||!active()?Promise.resolve():flushPromise||(flushPromise=new Promise((resolve,reject)=>{
  flushJob={resolve,reject,timer:setTimeout(()=>{flushJob=null;reject(new Error(t('组件没有确认保存，请稍后重试关闭。')));},5000)};port.postMessage({type:'flush'});
 }).finally(()=>{flushPromise=null;}));
 frame.src=plugin.manifest.entry;root.replaceChildren(frame);sessions.set(root,{update,dispose,flush,frame});
 return ()=>{dispose();root.removeEventListener('click',onRetry);retryCleanup();};
}
export function updatePluginFrames(container) { for(const [root,session] of sessions)if(container.contains(root))session.update(); }
export function bindPluginWorkspace(root,item,host) {
 const controller=new AbortController();
 const cleanup=mountPlugin(root.querySelector('[data-plugin-slot]'),item,host,'window');
 root.addEventListener('click',async event=>{
  if(event.target.closest('[data-plugin-expand]'))root.closest('dialog').classList.toggle('widget-app-expanded');
  if(event.target.closest('[data-plugin-location]')){
   try{const plugin=resolveWidgetSource(item);if(plugin&&(!globalThis.chrome?.permissions?.request||await chrome.permissions.request({permissions:['geolocation']}))){localStorage.setItem(grantKey(plugin)+'|geolocation','true');root.querySelector('.plugin-window-header')?.classList.remove('needs-grant');host.toast(t('已授权，请在组件中重新点击定位。'));}}
   catch(error){host.toast(error.message);}
  }
  if(event.target.closest('[data-plugin-grant]')){
   try{const plugin=resolveWidgetSource(item);if(plugin&&globalThis.chrome?.permissions?.request&&await chrome.permissions.request({permissions:['bookmarks']})){localStorage.setItem(grantKey(plugin),'true');root.querySelector('.plugin-window-header')?.classList.remove('needs-grant');host.toast(t('已授权，请在组件中重新选择浏览器书签。'));}else host.toast(t('此功能需要 Chrome / Edge 扩展版。'));}catch(error){host.toast(error.message);}
  }
 },{signal:controller.signal});
 return async()=>{await sessions.get(root.querySelector('[data-plugin-slot]'))?.flush();controller.abort();cleanup();};
}
