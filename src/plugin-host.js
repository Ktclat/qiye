// SPDX-License-Identifier: GPL-3.0-only
import { fetchPluginHotboard } from './plugin-hotboard.js';
import { t, getLocale } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { resolveWidgetSource } from './widget-sources.js';
import { validatePluginData } from './plugin-data.js';
import { validateCommunityData } from './community-format.js';
import { publicHttpsUrl } from './public-json.js';
import { createPluginFrame, preparePluginWindow, takePreparedWindow, discardPreparedWindow } from './plugin-preload.js';

const sessions = new Map(), queuedCommands = new Map();
export function pluginMenu(itemId) { return [...sessions.values()].find(s=>s.itemId===itemId)?.menu || []; }
export function setPluginDragState(itemId,state) { [...sessions.values()].find(s=>s.itemId===itemId)?.dragState(state); }
export function queuePluginCommand(itemId, command) {
 if(command!=='settings'&&!pluginMenu(itemId).some(entry=>entry.id===command))return false;
 queuedCommands.set(itemId,command);return true;
}
export function validatePluginMenu(value) {
 if(!Array.isArray(value))return [];
 const seen=new Set();return value.slice(0,8).flatMap(entry=>{
  if(!entry||typeof entry.id!=='string'||!(/^[a-z][a-z0-9-]{0,39}$/).test(entry.id)||seen.has(entry.id)||typeof entry.label!=='string'||!entry.label.trim())return [];
  seen.add(entry.id);return [{id:entry.id,label:entry.label.slice(0,60),icon:['settings','plus','list','grid','refresh','download','trash'].includes(entry.icon)?entry.icon:'grid'}];
 });
}
const appearanceKeys = ['theme','themeColor','useThemeColor','surfaceStyle','surfaceOpacity','surfaceBlur','reducedEffects','uiFont','gridSize','gap','radius','showSeconds','hour12'];
export function pluginCard(item) {
 return `<section class="plugin-slot" data-plugin-slot data-widget-id="${e(item.id)}"><button class="plugin-placeholder" data-action="widget-sources"><strong>${e(item.title)}</strong><small>${t('启用组件源')}</small></button></section>`;
}
export function pluginWorkspace(item) {
 let plugin;try{plugin=resolveWidgetSource(item);}catch{}
 return `<header class="plugin-window-header"><h2 id="dialog-title" tabindex="-1">${e(item.title)}</h2>${plugin?.manifest.id==='qiye.hotsearch'&&globalThis.chrome?.runtime?.id?`<button data-plugin-hotboard-grant>${t('授权热榜访问')}</button>`:''}${plugin?.manifest.capabilities?.includes('bookmarks')?`<button data-plugin-grant>${t('授权浏览器书签')}</button>`:''}${plugin?.manifest.capabilities?.includes('geolocation')?`<button data-plugin-location>${t('授权定位')}</button>`:''}<button data-action="widget-sources" aria-label="${t('组件源')}">${icon('settings')}</button><button data-plugin-expand aria-label="${t('切换窗口大小')}">${icon('maximize')}</button><button data-close aria-label="${t('关闭')}">${icon('close')}</button></header>${pluginCard(item)}`;
}
function payload(item) {
 return item.widget==='community'?{value:item.data.value||'null',revision:item.data.value||'null'}
 :{legacy:{widget:item.widget,config:item.config,data:item.data},revision:JSON.stringify({config:item.config,data:item.data})};
}
function scopedKey(item,plugin) { return 'qiye.plugin.'+encodeURIComponent(plugin.source+'|'+plugin.manifest.id+'|'+item.id); }
function grantKey(plugin) { return 'qiye.plugin.grant.'+encodeURIComponent(plugin.source+'|'+plugin.manifest.id); }

export async function performPluginCall(method,params,{item,plugin,host,active,mode='card',preview=false}) {
 if(!active())throw new Error(t('组件已停止'));
 if(preview)throw new Error(t('预览不会修改桌面数据'));
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
 if(method==='hotboard')return fetchPluginHotboard(params.platform);
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

export function mountPlugin(root,item,host,mode='card',{preview=false}={}) {
 let plugin;try{plugin=resolveWidgetSource(item);}catch(error){root.title=error.message;}
 if(!plugin)return ()=>{};
 // A supporting card already owns an isolated, initialized document. Borrow it
 // for its window instead of downloading and booting a second copy of the app.
 if(mode==='window'&&!preview){
  for(const session of new Set(sessions.values())){
   const release=session.borrow?.(root,item,plugin);if(release)return release;
  }
 }
 const homeRoot=root,homeMode=mode;
 const controller=new AbortController();let port,timer,prepareTimer,observer,themeObserver,ready=false,loaded=false,busy=false,closed=false,lastSignature='',flushJob,flushPromise,retryCleanup=()=>{};
 let reusable=false,borrowed=false,homeDetached=false,viewJob,viewSequence=0,viewTransition=Promise.resolve(),parkedLabel,viewError,onHomeRetry,homeRetryCleanup=()=>{};
 const loading=document.createElement('div');loading.className='plugin-loading';loading.setAttribute('role','status');loading.innerHTML=`<span class="plugin-loading-mark">${icon('grid')}</span><strong>${e(item.title)}</strong><span>${t('正在打开组件…')}</span><i aria-hidden="true"></i>`;
 root.replaceChildren(loading);
 const prepared=mode==='window'&&!preview?takePreparedWindow(root,item,plugin):null;
 const frame=prepared?.frame||createPluginFrame(item,plugin,{preview});
 root.setAttribute('aria-busy','true');
 const pluginKey=JSON.stringify(plugin);
 const active=()=>{
  if(closed||!root.isConnected)return false;
  const latest=host.getState().items.find(entry=>entry.id===item.id);if(!latest)return false;
  try{return JSON.stringify(resolveWidgetSource(latest))===pluginKey;}catch{return false;}
 };
 const environment=()=>({hostFeatures:['hotboard','interactions','commands','long-press'],locale:getLocale(),theme:document.documentElement.dataset.theme||host.getState().settings.theme,extension:!preview&&!!globalThis.chrome?.runtime?.id,mode,preview,size:current()?.size||item.size,width:root.clientWidth,height:root.clientHeight,settings:Object.fromEntries(appearanceKeys.map(key=>[key,host.getState().settings[key]]))});
 const commandEnvironment=()=>{const env=environment();if(mode==='window'&&queuedCommands.has(item.id)){env.command=queuedCommands.get(item.id);queuedCommands.delete(item.id);}return env;};
 const current=()=>host.getState().items.find(entry=>entry.id===item.id);
 const update=()=>{
  if(!ready||!active())return;
  const next={type:'state',...payload(current()),environment:environment()};const signature=JSON.stringify(next);
  if(signature!==lastSignature){lastSignature=signature;port.postMessage(next);}
 };
 const dispose=()=>{closed=true;clearTimeout(timer);clearTimeout(prepareTimer);if(homeMode==='card'&&!preview)discardPreparedWindow(item.id);observer?.disconnect();themeObserver?.disconnect();controller.abort();port?.close();frame.remove();loading.remove();parkedLabel?.remove();viewError?.remove();root.removeAttribute('aria-busy');if(viewJob){clearTimeout(viewJob.timer);viewJob.reject(new Error(t('组件已停止')));viewJob=null;}for(const key of [root,homeRoot])if(sessions.get(key)?.frame===frame)sessions.delete(key);};
 const fail=message=>{
  dispose();const html=`<button class="plugin-placeholder" data-plugin-retry><strong>${e(item.title)}</strong><small>${e(message)}</small><span>${t('重试')}</span></button>`;
  root.innerHTML=html;root.addEventListener('click',onRetry,{once:true});
  if(borrowed&&homeRoot.isConnected&&!homeDetached){
   homeRoot.innerHTML=html;onHomeRetry=()=>{homeRetryCleanup=mountPlugin(homeRoot,current()||item,host,'card');};
   homeRoot.addEventListener('click',onHomeRetry,{once:true});
  }
 };
 const onRetry=()=>{root.replaceChildren();retryCleanup=mountPlugin(root,item,host,mode,{preview});};
 const initialize=()=>{
  // Never transfer a new capability after an untrusted frame navigates itself.
  if(loaded){fail(t('组件页面已跳转，请重试。'));return;}loaded=true;
  const channel=new MessageChannel();port=channel.port1;
  port.onmessage=async event=>{
   const message=event.data;if(!active())return;
   if(message?.type==='view-ready'&&viewJob&&message.id===viewJob.id){const job=viewJob;viewJob=null;clearTimeout(job.timer);message.error?job.reject(new Error(message.error)):job.resolve();return;}
   if(message?.type==='flushed'&&flushJob){const job=flushJob;flushJob=null;clearTimeout(job.timer);message.error?job.reject(new Error(message.error)):job.resolve();return;}
   if(message?.type==='ready'&&message.version===plugin.manifest.version){session.menu=validatePluginMenu(message.contextMenu);ready=true;reusable=plugin.manifest.version===2&&Array.isArray(message.features)&&message.features.includes('view-switch');clearTimeout(timer);requestAnimationFrame(()=>{if(!active())return;frame.dataset.ready='true';frame.removeAttribute('aria-hidden');if(!preview)frame.removeAttribute('tabindex');root.setAttribute('aria-busy','false');loading.remove();});update();return;}
   if(!ready)return;
   if(message?.type==='interaction'&&mode==='card'&&!preview){
    const rect=frame.getBoundingClientRect(),x=Number(message.x),y=Number(message.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>20000||Math.abs(y)>20000)return;
    const point={clientX:rect.left+x*rect.width/(frame.clientWidth||1),clientY:rect.top+y*rect.height/(frame.clientHeight||1)};
    if(message.action==='contextmenu')host.openWidgetContext?.(item.id,point);
    if(['pointerdown','pointermove','pointerup','pointercancel'].includes(message.action)&&Number.isInteger(message.pointerId))host.widgetPointer?.(item.id,{...point,type:message.action,pointerId:message.pointerId,pointerType:message.pointerType==='touch'?'touch':'mouse',button:0,buttons:message.buttons===0?0:1});
    return;
   }
   if(plugin.manifest.version===1&&message?.type==='save'){
    try{if(preview)throw new Error(t('预览不会修改桌面数据'));if(busy)throw new Error('Save in progress');busy=true;const data=validateCommunityData({value:message.value});await host.saveData(item.id,data,JSON.stringify(current().data));if(active())port.postMessage({type:'saved',id:message.id,ok:true});}
    catch(error){if(active())port.postMessage({type:'saved',id:message.id,error:error.message});}finally{busy=false;}return;
   }
   if(message?.type!=='call'||typeof message.id!=='string'||message.id.length>80)return;
   const reply=data=>{if(active())port.postMessage({type:'result',id:message.id,...data});};
   const writing=['save','bookmarks'].includes(message.method);
   if(writing&&busy){reply({error:'Operation in progress'});return;}
   if(writing)busy=true;
   try{reply({value:await performPluginCall(message.method,message.params||{},{item,plugin,host,active,mode,preview})});}
   catch(error){reply({error:error.message});}finally{if(writing)busy=false;}
  };
  let storage={};try{if(!preview)storage=validatePluginData(JSON.parse(localStorage.getItem(scopedKey(item,plugin))||'{}'));}catch{}
  const init={type:'qiye:init',version:plugin.manifest.version,...payload(current()),data:current().data.value||'null',item:{id:item.id,title:item.title,size:item.size},environment:commandEnvironment(),storage};
  // Opaque sandbox origin requires '*'; the channel is sent only to this frame.
  frame.contentWindow.postMessage(init,'*',[channel.port2]);
  observer=new ResizeObserver(update);observer.observe(root);
  themeObserver=new MutationObserver(update);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});
 };
 frame.addEventListener('load',initialize,{signal:controller.signal});
 if(mode==='card'&&!preview){
  const target=root.closest('.tile-widget')||root;
  const prepare=()=>{
   clearTimeout(prepareTimer);
   if(!ready||reusable||mode!=='card'||!active()||document.querySelector('#dialog[open]')||document.body.classList.contains('editing'))return;
   const item=current(),plugin=resolveWidgetSource(item);
   if(plugin)preparePluginWindow(item,plugin);
  };
  target.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')prepareTimer=setTimeout(prepare,60);},{signal:controller.signal});
  target.addEventListener('pointerleave',()=>clearTimeout(prepareTimer),{signal:controller.signal});
  target.addEventListener('focusin',prepare,{signal:controller.signal});
 }
 timer=setTimeout(()=>fail(t('组件未响应，请检查网络后重试。')),15000);
 const flush=()=>!ready||plugin.manifest.version!==2||!active()?Promise.resolve():flushPromise||(flushPromise=new Promise((resolve,reject)=>{
  flushJob={resolve,reject,timer:setTimeout(()=>{flushJob=null;reject(new Error(t('组件没有确认保存，请稍后重试关闭。')));},5000)};port.postMessage({type:'flush'});
 }).finally(()=>{flushPromise=null;}));
 const requestView=()=>{
  root.setAttribute('aria-busy','true');
  const promise=new Promise((resolve,reject)=>{
   const id=String(++viewSequence);
   viewJob={id,resolve,reject,timer:setTimeout(()=>{viewJob=null;reject(new Error(t('组件未响应，请检查网络后重试。')));},5000)};
   port.postMessage({type:'view',id,environment:commandEnvironment()});
  }).finally(()=>{if(!closed)root.setAttribute('aria-busy','false');});
  // The window may close while the switch is in flight. flush() awaits this
  // same promise, while this handler prevents an unobserved rejection.
  promise.catch(()=>{});return promise;
 };
 const release=async(force=false)=>{
  if(closed){if(root!==homeRoot){root.removeEventListener('click',onRetry);await retryCleanup();}return;}
  if(!borrowed)return;
  try{await viewTransition;}catch(error){if(!force)throw error;}
  const windowRoot=root;
  if(homeDetached||!homeRoot.isConnected||!active()){dispose();return;}
  try{homeRoot.moveBefore(frame,null);}catch(error){dispose();root=homeRoot;fail(error.message);return;}
  sessions.delete(windowRoot);windowRoot.removeAttribute('aria-busy');
  root=homeRoot;mode='card';borrowed=false;parkedLabel?.remove();viewError?.remove();
  observer?.disconnect();observer?.observe(root);lastSignature='';
  viewTransition=requestView();
  try{await viewTransition;update();}catch(error){fail(error.message);}
 };
 const session={itemId:item.id,menu:[],dragState:state=>{if(ready&&active())port.postMessage({type:'drag-state',...state});},command:command=>{if(ready&&active())port.postMessage({type:'command',command});},update,dispose,frame,flush:async()=>{if(!active())return;await viewTransition;await flush();},borrow(target,candidate,resolved){
  if(preview||homeMode!=='card'||mode!=='card'||borrowed||!reusable||!ready||!active()||!target.moveBefore||!homeRoot.moveBefore||candidate.id!==item.id||JSON.stringify(resolved)!==JSON.stringify(plugin))return null;
  target.replaceChildren();
  try{target.moveBefore(frame,null);}catch{return null;}
  discardPreparedWindow();clearTimeout(prepareTimer);
  parkedLabel=document.createElement('div');parkedLabel.className='plugin-parked-card';parkedLabel.textContent=item.title;homeRoot.append(parkedLabel);
  root=target;mode='window';borrowed=true;sessions.set(root,session);
  observer?.disconnect();observer?.observe(root);lastSignature='';update();
  viewTransition=requestView();viewTransition.catch(error=>{
   if(!active()||!borrowed)return;
   root.closest('dialog')?.querySelector('.plugin-window-header')?.classList.add('needs-recovery');
   viewError=document.createElement('div');viewError.className='plugin-view-error';viewError.setAttribute('role','alert');viewError.textContent=error.message;root.append(viewError);
  });
  return release;
 }};
 sessions.set(root,session);
 if(prepared?.loaded)initialize();
 if(!prepared){frame.src=plugin.manifest.entry;root.append(frame);}
 return ()=>{
  // A desktop layout refresh can remove the original slot while its window is
  // open. Keep that live editor until close, but never reuse it after revocation.
  if(borrowed&&active()){homeDetached=true;sessions.delete(homeRoot);return;}
  dispose();root.removeEventListener('click',onRetry);if(onHomeRetry)homeRoot.removeEventListener('click',onHomeRetry);homeRetryCleanup();retryCleanup();
 };
}
export function updatePluginFrames(container) { for(const [root,session] of sessions)if(container.contains(root))session.update(); }
export function bindPluginWorkspace(root,item,host) {
 const controller=new AbortController();
 const cleanup=mountPlugin(root.querySelector('[data-plugin-slot]'),item,host,'window');
 const hotboardButton=root.querySelector('[data-plugin-hotboard-grant]');let hotboardTimer;
 if(hotboardButton)chrome.permissions.contains({origins:['https://uapis.cn/*']}).then(allowed=>{if(root.isConnected&&!allowed)root.querySelector('.plugin-window-header')?.classList.add('needs-grant');});
 root.addEventListener('click',async event=>{
  if(event.target.closest('[data-plugin-force-close]')){await cleanup(true);controller.abort();void host.closeDialog();return;}
  if(event.target.closest('[data-plugin-hotboard-grant]')){
   try{if(await chrome.permissions.request({origins:['https://uapis.cn/*']})){
    root.querySelector('.plugin-window-header')?.classList.remove('needs-grant');host.toast(t('已授权热榜访问，正在刷新。'));
    clearTimeout(hotboardTimer);hotboardTimer=setTimeout(()=>{if(root.isConnected)sessions.get(root.querySelector('[data-plugin-slot]'))?.command('hot-refresh');},3100);
   }}catch(error){host.toast(error.message);}return;
  }
  if(event.target.closest('[data-plugin-expand]'))root.closest('dialog').classList.toggle('widget-app-expanded');
  if(event.target.closest('[data-plugin-location]')){
   try{const plugin=resolveWidgetSource(item);if(plugin&&(!globalThis.chrome?.permissions?.request||await chrome.permissions.request({permissions:['geolocation']}))){localStorage.setItem(grantKey(plugin)+'|geolocation','true');root.querySelector('.plugin-window-header')?.classList.remove('needs-grant');host.toast(t('已授权，请在组件中重新点击定位。'));}}
   catch(error){host.toast(error.message);}
  }
  if(event.target.closest('[data-plugin-grant]')){
   try{const plugin=resolveWidgetSource(item);if(plugin&&globalThis.chrome?.permissions?.request&&await chrome.permissions.request({permissions:['bookmarks']})){localStorage.setItem(grantKey(plugin),'true');root.querySelector('.plugin-window-header')?.classList.remove('needs-grant');host.toast(t('已授权，请在组件中重新选择浏览器书签。'));}else host.toast(t('此功能需要 Chrome / Edge 扩展版。'));}catch(error){host.toast(error.message);}
  }
 },{signal:controller.signal});
 return async()=>{
  try{await sessions.get(root.querySelector('[data-plugin-slot]'))?.flush();await cleanup();}
  catch(error){
   const header=root.querySelector('.plugin-window-header');header?.classList.add('needs-recovery');
   if(header&&!header.querySelector('[data-plugin-force-close]')){
    const button=document.createElement('button');button.dataset.pluginForceClose='';button.textContent=t('强制关闭');button.title=t('放弃未保存内容并关闭');button.setAttribute('aria-label',button.title);header.append(button);
   }
   throw error;
  }
  controller.abort();clearTimeout(hotboardTimer);
 };
}
