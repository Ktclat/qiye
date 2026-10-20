// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { fetchWallpaperPage, fetchCommonsWallpaperPage, resolveCommonsWallpaper, fetchCatalogWallpaperPage, catalogWallpaperPages } from './wallpapers.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const WALLPAPER_SOURCES=Object.freeze([
 {id:'custom',name:'自定义背景'},
 {id:'official',name:'官方背景'},
 {id:'deepin',name:'deepin',endpoint:true,snapshot:true,intro:'deepin 官方背景 · CC BY 4.0 · 固定版本清单'},
 {id:'wallhaven',name:'Wallhaven',endpoint:true,snapshot:true,intro:'SFW 精选 · 2026-10-12 清单快照 · 非实时榜单'},
 {id:'picsum',name:'Lorem Picsum',endpoint:true,intro:'摄影图片 · Lorem Picsum'},
 {id:'commons',name:'Wikimedia Commons',endpoint:true,intro:'开放许可的横向摄影图片'}
]);
/** On-demand, bounded gallery. No requests on creation. Preview is a view inside
 * the same dialog, never a modal layered over a modal. Only Apply writes state. */
export function createWallpaperLibrary({getState,wallpapers,renderCustom,renderParameters,rerender,enable,apply,toast,local,
 fetchers={picsum:fetchWallpaperPage,commons:fetchCommonsWallpaperPage,deepin:o=>fetchCatalogWallpaperPage('deepin',o),wallhaven:o=>fetchCatalogWallpaperPage('wallhaven',o)},resolve=resolveCommonsWallpaper}) {
 const state={tab:'official',page:1,photos:[],uploads:[],currentLocalId:null,loading:false,applying:false,error:'',preview:null,deleteId:null};
 const cache=new Map();let controller=null,sequence=0;
 function stop(){sequence++;controller?.abort();controller=null;state.loading=false;state.applying=false;}
 function refresh(){rerender();}
 function releaseUploads(){for(const row of state.uploads)URL.revokeObjectURL(row.url);state.uploads=[];}
 async function loadUploads(){
  if(!local)return;
  stop();const token=sequence;state.loading=true;state.error='';state.preview=null;state.deleteId=null;refresh();
  try{
   const {rows,currentId,error=''}=await local.load();
   if(sequence!==token)return;
   releaseUploads();state.uploads=rows.map(row=>({...row,url:URL.createObjectURL(row.blob)}));state.currentLocalId=currentId;state.error=error;
  }catch(error){if(sequence===token)state.error=error.message||t('无法读取本机壁纸库，请重试。');}
  finally{if(sequence===token){state.loading=false;refresh();}}
 }
 async function load(){
  if(state.tab==='custom')return loadUploads();
  if(!getState().settings.wallpaperApiEnabled || !fetchers[state.tab])return;
  stop();const token=sequence,key=`${state.tab}:${state.page}`;state.error='';state.preview=null;
  if(cache.has(key)){state.photos=cache.get(key);refresh();return;}
  state.loading=true;state.photos=[];controller=new AbortController();refresh();
  try{
   const photos=await fetchers[state.tab]({page:state.page,signal:controller.signal});
   if(sequence!==token)return;
   state.photos=photos;cache.set(key,photos);if(cache.size>5)cache.delete(cache.keys().next().value);
  }catch(e){if(sequence===token)state.error=e.message||t("图片清单加载失败");}
  finally{if(sequence===token){state.loading=false;refresh();}}
 }
 function photoDetails(photo){
  return `<div class="preview-credit">${photo.author ? `<span>${esc(photo.author)}</span>` : ''}<a href="${esc(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t("图片来源 ↗")}</a><a href="${esc(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(photo.license)}</a></div>`;
 }
 function previewMarkup(){
  const view=state.preview,photo=view.photo;
  if(view.local)return `<div class="wallpaper-preview" aria-label="${t('壁纸预览')}"><button class="preview-back" data-gallery-back>${t('← 返回图库')}</button><h3>${esc(photo.name)}</h3><div class="wallpaper-preview-art">${localVisual(photo,true)}</div><div class="wallpaper-preview-meta"><span>${t('本机上传 · 离线可用')} · ${formatSize(photo.blob.size)}</span><button class="primary-button" data-gallery-local-apply="${photo.id}" ${state.applying?'disabled':''}>${state.applying?t('正在应用…'):t('选用壁纸')}</button></div><p class="wallpaper-status" role="status">${esc(state.error)}</p></div>`;
  const builtin=view.builtin;
  return `<div class="wallpaper-preview" aria-label="${t("壁纸预览")}"><button class="preview-back" data-gallery-back>${t("← 返回图库")}</button><h3>${esc(builtin?t(photo.title||photo.name):photo.title||photo.name)}</h3><div class="wallpaper-preview-art" ${builtin?`style="background:${photo.background}"`:''}>${builtin?'':`<img src="${esc(photo.url||photo.thumbnail)}" alt="${esc(photo.title)}" referrerpolicy="no-referrer" decoding="async">`}</div><div class="wallpaper-preview-meta">${builtin?`<span>${t("栖页内置背景 · 离线可用")}</span>`:photoDetails(photo)}<button class="primary-button" ${builtin?`data-wallpaper="${esc(photo.id)}"`:`data-gallery-apply="${view.index}"`} ${state.loading||state.applying?'disabled':''}>${state.applying?t("正在应用…"):t("选用壁纸")}</button></div><p class="wallpaper-status" role="status">${state.loading?t("正在加载预览…"):esc(state.error)}</p></div>`;
 }
 function formatSize(bytes){return bytes<1024*1024?Math.max(1,Math.round(bytes/1024))+' KiB':(bytes/1024/1024).toFixed(1)+' MiB';}
 function localVisual(row,preview=false){
  return row.type==='video'?`<video src="${esc(row.url)}" ${preview?'controls':''} preload="metadata" muted playsinline aria-label="${esc(row.name)}"></video>`:`<img src="${esc(row.url)}" alt="${esc(row.name)}" loading="lazy" decoding="async" draggable="false">`;
 }
 function uploadsMarkup(){
  const status=state.loading?t('正在读取已上传壁纸…'):state.error;
  return `<div class="local-wallpaper-heading"><h4>${t('已上传的壁纸')}</h4><span>${t('{v0} 项',{v0:state.uploads.length})}</span></div><p class="wallpaper-status ${status?'':'is-quiet'}" role="status">${esc(status)}</p>${state.error?`<button class="secondary-button" data-gallery-local-retry>${t('重新加载')}</button>`:''}${!state.uploads.length&&!state.loading&&!state.error?`<p class="local-wallpaper-empty">${t('上传后，图片和视频会显示在这里，可随时重新选用。')}</p>`:''}<div class="wallpaper-grid local-wallpaper-grid">${state.uploads.map(row=>`<article class="wallpaper-photo-card wallpaper-upload ${row.id===state.currentLocalId?'selected':''}" data-local-wallpaper="${row.id}"><div class="wallpaper-photo-visual">${localVisual(row)}<div class="wallpaper-photo-actions"><button data-gallery-local-preview="${row.id}" aria-label="${t('预览壁纸：{v0}',{v0:esc(row.name)})}">${t('预览')}</button><button data-gallery-local-apply="${row.id}" aria-label="${t('选用壁纸：{v0}',{v0:esc(row.name)})}" ${state.applying?'disabled':''}>${t('选用')}</button></div></div><div class="wallpaper-upload-caption"><strong title="${esc(row.name)}">${esc(row.name)}</strong><span>${row.id===state.currentLocalId?t('正在使用'):row.type==='video'?t('视频'):t('图片')} · ${formatSize(row.blob.size)}</span><button class="wallpaper-upload-delete" data-gallery-local-delete="${row.id}" aria-label="${t('删除壁纸：{v0}',{v0:esc(row.name)})}" ${state.applying?'disabled':''}>${t('删除')}</button></div>${state.deleteId===row.id?`<div class="wallpaper-delete-confirm" role="group" aria-label="${t('确认删除壁纸')}"><p>${t(row.id===state.currentLocalId?'删除后将恢复官方背景。':'从此浏览器的壁纸库中删除？')}</p><button class="danger-button" data-gallery-local-remove="${row.id}">${t('确认删除')}</button><button data-gallery-local-cancel>${t('取消')}</button></div>`:''}</article>`).join('')}</div>`;
 }
 function render(){
  const settings=getState().settings,tab=WALLPAPER_SOURCES.find(s=>s.id===state.tab);
  let content='';
  if(state.preview)content=previewMarkup();
  else if(state.tab==='official')content=`<div class="gallery-intro"><h3>${t("官方背景")}</h3><p>${t("内置渐变 · 离线可用")}</p></div><div class="wallpaper-grid">${wallpapers.map(w=>`<article class="wallpaper-photo-card wallpaper-builtin ${settings.wallpaper===w.id&&!settings.customWallpaper&&!(settings.wallpaperApiEnabled&&settings.remoteWallpaper)?'selected':''}"><div class="wallpaper-photo-visual" style="background:${w.background}"><span class="wallpaper-builtin-name">${t(w.name)}</span><div class="wallpaper-photo-actions"><button data-gallery-builtin-preview="${w.id}" aria-label="${t("预览{v0}背景", {v0: w.name})}">${t("预览")}</button><button data-wallpaper="${w.id}" aria-label="${t("选用{v0}背景", {v0: w.name})}">${t("选用")}</button></div></div></article>`).join('')}</div>`;
  else if(state.tab==='custom')content=renderCustom()+(local?uploadsMarkup():'');
  else if(state.tab==='parameters')content=renderParameters();
  else{
   content=`<div class="gallery-intro"><h3>${esc(t(tab.name))}</h3><p>${esc(t(tab.intro))}</p></div>`;
   if(!settings.wallpaperApiEnabled)content+=`<div class="wallpaper-permission"><strong>${t("连接 {v0}", {v0: esc(t(tab.name))})}</strong><p>${t("启用后直接加载该图库和图片域名，不发送桌面内容或同步凭据。")}</p><button class="primary-button" data-gallery-enable>${t("启用并加载图片")}</button></div>`;
   else content+=`<div class="wallpaper-status ${!state.loading&&!state.applying&&!state.error&&state.photos.length?'is-quiet':''}" role="status">${state.applying?t("正在加载高清壁纸…"):state.loading?t("正在加载图片清单…"):esc(state.error)||(!state.photos.length?t("这一页暂无可用图片。"):'')}</div>${state.error?`<button class="secondary-button" data-gallery-retry>${t("重新加载")}</button>`:''}<div class="wallpaper-grid">${state.photos.map((p,i)=>`<article class="wallpaper-photo-card ${settings.remoteWallpaper?.provider===p.provider&&settings.remoteWallpaper?.id===p.id?'selected':''}"><div class="wallpaper-photo-visual"><img src="${esc(p.thumbnail)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${esc(p.title)}" draggable="false"><div class="wallpaper-photo-actions"><button data-gallery-preview="${i}" aria-label="${t("预览壁纸：{v0}", {v0: esc(p.title)})}" ${state.loading||state.applying?'disabled':''}>${t("预览")}</button><button data-gallery-apply="${i}" aria-label="${t("选用壁纸：{v0}", {v0: esc(p.title)})}" ${state.loading||state.applying?'disabled':''}>${t("选用")}</button></div></div></article>`).join('')}</div><div class="wallpaper-pagination"><button class="secondary-button" data-gallery-page="-1" ${state.page===1||state.loading||state.applying?'disabled':''}>${t("上一页")}</button><span>${t("第 {v0} 页", {v0: state.page})}</span><button class="secondary-button" data-gallery-page="1" ${state.page>=(tab.snapshot?catalogWallpaperPages(state.tab):50)||state.loading||state.applying?'disabled':''}>${t("下一页")}</button></div>`;
  }
  return `<div class="wallpaper-browser"><nav class="wallpaper-nav" role="tablist" aria-orientation="vertical" aria-label="${t("壁纸来源")}"><h2 class="workspace-title" id="workspace-title">${t("壁纸库")}</h2>${WALLPAPER_SOURCES.map(s=>`<button data-gallery-tab="${s.id}" role="tab" aria-selected="${state.tab===s.id}" aria-controls="wallpaper-content"><span class="source-symbol" aria-hidden="true">${({custom:'＋',official:'◈',deepin:'◉',wallhaven:'W',picsum:'P',commons:'◎'})[s.id]}</span><span>${t(s.name)}</span></button>`).join('')}<button class="wallpaper-parameters" data-gallery-tab="parameters" role="tab" aria-controls="wallpaper-content" aria-selected="${state.tab==='parameters'}"><span class="source-symbol" aria-hidden="true">☷</span><span>${t("参数设置")}</span></button></nav><section id="wallpaper-content" class="wallpaper-content" role="tabpanel" aria-label="${t("壁纸内容")}">${content}</section></div>`;
 }
 function back(){if(!state.preview)return false;stop();state.preview=null;state.error='';refresh();return true;}
 async function handleClick(button){
  if(button.dataset.galleryTab){
   const tab=button.dataset.galleryTab;if(tab!=='parameters'&&!WALLPAPER_SOURCES.some(s=>s.id===tab))return true;
   stop();releaseUploads();state.tab=tab;state.page=1;state.photos=[];state.preview=null;state.error='';state.deleteId=null;refresh();await load();return true;
  }
  if(button.hasAttribute('data-gallery-local-retry')){await loadUploads();return true;}
  if(button.hasAttribute('data-gallery-local-cancel')){state.deleteId=null;refresh();return true;}
  for(const action of ['preview','apply','delete','remove']){
   if(!button.hasAttribute(`data-gallery-local-${action}`))continue;
   const id=button.dataset['galleryLocal'+action[0].toUpperCase()+action.slice(1)],row=state.uploads.find(row=>row.id===id);
   if(!row||!local||state.applying||state.loading)return true;
   if(action==='preview'){stop();state.preview={local:true,id,photo:row};state.error='';state.deleteId=null;refresh();return true;}
   if(action==='delete'){state.deleteId=id;refresh();return true;}
   if(action==='remove'&&state.deleteId!==id)return true;
   stop();const token=sequence;state.applying=true;state.error='';refresh();
   try{
    if(action==='apply'){const applied=await local.apply(row,{isCurrent:()=>sequence===token});if(sequence===token&&applied!==false)state.currentLocalId=id;}
    else{await local.remove(row);if(sequence===token){URL.revokeObjectURL(row.url);state.uploads=state.uploads.filter(entry=>entry.id!==id);state.deleteId=null;if(state.currentLocalId===id)state.currentLocalId=null;}}
   }catch(error){if(sequence===token){state.error=error.message||t('操作没有完成。');if(!error.notified)toast(state.error);}}
   finally{if(sequence===token){state.applying=false;refresh();}}
   return true;
  }
  if(button.hasAttribute('data-gallery-back')){back();return true;}
  if(button.hasAttribute('data-gallery-builtin-preview')){
   const photo=wallpapers.find(w=>w.id===button.dataset.galleryBuiltinPreview);if(photo){stop();state.preview={builtin:true,photo};refresh();}return true;
  }
  if(button.hasAttribute('data-gallery-preview')){
   const index=Number(button.dataset.galleryPreview),photo=state.photos[index];if(!photo||state.applying)return true;
   stop();const token=sequence;state.error='';state.preview={index,photo};controller=new AbortController();
   if(photo.provider==='commons'){
    state.loading=true;refresh();
    try {const full=await resolve(photo,{signal:controller.signal});if(sequence===token)state.preview={index,photo:full};}
    catch(e){if(sequence===token)state.error=e.message||t("高清预览暂不可用");}
    finally{if(sequence===token){state.loading=false;refresh();}}
   }else refresh();return true;
  }
  if(button.hasAttribute('data-gallery-enable')){await enable();await load();return true;}
  if(button.hasAttribute('data-gallery-retry')){cache.delete(`${state.tab}:${state.page}`);await load();return true;}
  if(button.dataset.galleryPage){state.page=Math.max(1,Math.min(WALLPAPER_SOURCES.find(s=>s.id===state.tab)?.snapshot?catalogWallpaperPages(state.tab):50,state.page+Number(button.dataset.galleryPage)));await load();return true;}
  if(button.hasAttribute('data-gallery-apply')){
   if(state.applying || state.loading)return true;
   const index=Number(button.dataset.galleryApply),photo=state.preview?.index===index?state.preview.photo:state.photos[index];if(!photo)return true;
   stop();const token=sequence;controller=new AbortController();state.applying=true;state.error='';refresh();
   try{
    const full=photo.provider==='commons'?await resolve(photo,{signal:controller.signal}):photo;
    if(sequence!==token)return true;
    await apply(full,{isCurrent:()=>sequence===token});
   }catch(e){if(sequence===token){state.error=e.message||t("应用失败，原壁纸已保留");toast(state.error);}}
   finally{if(sequence===token){state.applying=false;refresh();}}
   return true;
  }
  return false;
 }
 return {render,handleClick,back,open:()=>state.tab==='custom'?loadUploads():undefined,showCustom:()=>{stop();state.tab='custom';state.preview=null;},close:()=>{stop();releaseUploads();state.deleteId=null;if(state.preview?.local)state.preview=null;},getState:()=>({...state,photos:[...state.photos],uploads:[...state.uploads]})};
}
