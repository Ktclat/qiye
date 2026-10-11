// SPDX-License-Identifier: GPL-3.0-only
import { fetchWallpaperPage, fetchCommonsWallpaperPage, resolveCommonsWallpaper } from './wallpapers.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const WALLPAPER_SOURCES=Object.freeze([
 {id:'custom',name:'自定义背景',section:'我的背景'},
 {id:'official',name:'官方背景'},
 {id:'picsum',name:'Lorem Picsum',section:'在线图库',endpoint:true,url:'https://picsum.photos/'},
 {id:'commons',name:'Wikimedia Commons',endpoint:true,url:'https://commons.wikimedia.org/'},
 {id:'unsplash',name:'Unsplash ↗',section:'更多灵感 · 网站入口',url:'https://unsplash.com/wallpapers',license:'https://unsplash.com/license'},
 {id:'pexels',name:'Pexels ↗',url:'https://www.pexels.com/search/wallpaper/',license:'https://www.pexels.com/license/'}
]);
/** On-demand gallery with per-source pagination, bounded cache and cancellation.
 * No API keys; no fetch is performed merely by creating or rendering it. */
export function createWallpaperLibrary({getState,wallpapers,renderCustom,renderParameters,rerender,enable,apply,toast,
 fetchers={picsum:fetchWallpaperPage,commons:fetchCommonsWallpaperPage},resolve=resolveCommonsWallpaper}) {
 const state={tab:'official',page:1,photos:[],loading:false,applying:false,error:''};
 const cache=new Map();let controller=null,sequence=0;
 function stop(){sequence++;controller?.abort();controller=null;state.loading=false;state.applying=false;}
 function refresh(){rerender();}
 async function load(){
  if(!getState().settings.wallpaperApiEnabled || !fetchers[state.tab])return;
  stop();const token=sequence,key=`${state.tab}:${state.page}`;state.error='';
  if(cache.has(key)){state.photos=cache.get(key);refresh();return;}
  state.loading=true;state.photos=[];controller=new AbortController();refresh();
  try{
   const photos=await fetchers[state.tab]({page:state.page,signal:controller.signal});
   if(sequence!==token)return;
   state.photos=photos;cache.set(key,photos);if(cache.size>5)cache.delete(cache.keys().next().value);
  }catch(e){if(sequence===token)state.error=e.message||'图片清单加载失败';}
  finally{if(sequence===token){state.loading=false;refresh();}}
 }
 function render(){
  const settings=getState().settings,tab=WALLPAPER_SOURCES.find(s=>s.id===state.tab);
  let content='';
  if(state.tab==='official')content=`<h3>官方背景</h3><p class="help-text">栖页内置渐变 · 离线可用 · 无需连接外部服务</p><div class="wallpaper-grid">${wallpapers.map(w=>`<button class="wallpaper-option ${settings.wallpaper===w.id&&!settings.customWallpaper&&!(settings.wallpaperApiEnabled&&settings.remoteWallpaper)?'selected':''}" style="background:${w.background}" data-wallpaper="${w.id}" aria-label="${w.name}壁纸"><span>${w.name} · ${w.tag}</span></button>`).join('')}</div>`;
  else if(state.tab==='custom')content=renderCustom();
  else if(state.tab==='parameters')content=renderParameters();
  else if(!tab?.endpoint)content=`<h3>${esc(tab?.name)}</h3><div class="wallpaper-external"><p class="help-text">此来源提供网站入口，不会静默抓取图片，也不绕过 API 授权。请在原网站选择、下载获准使用的图片，再从“自定义背景”导入。</p><div class="button-row"><a class="primary-button" href="${tab.url}" target="_blank" rel="noopener noreferrer">访问 ${esc(tab.name.replace(' ↗',''))}</a><a class="text-button" href="${tab.license}" target="_blank" rel="noopener noreferrer">查看使用许可</a></div></div>`;
  else{
   const intro=state.tab==='commons'?'筛选具有明确 CC / 公共领域许可的横向图片，保留作者与每张图的许可。':'公开摄影图片接口，保留摄影师、原始照片及许可链接。';
   content=`<h3>${esc(tab.name)}</h3><p class="help-text">${intro}</p>`;
   if(!settings.wallpaperApiEnabled)content+=`<div class="wallpaper-permission"><strong>按需连接在线图库</strong><p>点击后，浏览器会直接连接 ${esc(tab.name)} 及其图片域名。不会发送桌面内容、搜索历史或同步凭据。</p><button class="primary-button" data-gallery-enable>启用并加载图片</button></div>`;
   else content+=`<div class="wallpaper-status" role="status">${state.applying?'正在加载高清壁纸…':state.loading?'正在加载图片清单…':esc(state.error)||(!state.photos.length?'这一页暂无可用图片，可以翻页或重新加载。':'点击图片应用背景')}</div>${state.error?'<button class="secondary-button" data-gallery-retry>重新加载</button>':''}<div class="wallpaper-grid">${state.photos.map((p,i)=>`<article class="wallpaper-photo-card"><button data-gallery-apply="${i}" aria-label="应用壁纸：${esc(p.title)}" ${state.loading||state.applying?'disabled':''}><img src="${esc(p.thumbnail)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${esc(p.title)}" draggable="false"></button><div class="wallpaper-photo-credit"><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(p.author)}">${esc(p.author)}</a><a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.license)}</a></div></article>`).join('')}</div><div class="wallpaper-pagination"><button class="secondary-button" data-gallery-page="-1" ${state.page===1||state.loading||state.applying?'disabled':''}>上一页</button><span>第 ${state.page} 页</span><button class="secondary-button" data-gallery-page="1" ${state.page>=50||state.loading||state.applying?'disabled':''}>下一页</button></div>`;
  }
  return `<div class="wallpaper-browser"><nav class="wallpaper-nav" role="tablist" aria-orientation="vertical" aria-label="壁纸来源">${WALLPAPER_SOURCES.map(s=>`${s.section?`<small>${s.section}</small>`:''}<button data-gallery-tab="${s.id}" role="tab" aria-selected="${state.tab===s.id}" aria-controls="wallpaper-content">${s.name}</button>`).join('')}<button class="wallpaper-parameters" data-gallery-tab="parameters" role="tab" aria-controls="wallpaper-content" aria-selected="${state.tab==='parameters'}">壁纸参数</button></nav><section id="wallpaper-content" class="wallpaper-content" role="tabpanel" aria-label="壁纸内容">${content}</section></div>`;
 }
 async function handleClick(button){
  if(button.dataset.galleryTab){
   const tab=button.dataset.galleryTab;if(tab!=='parameters'&&!WALLPAPER_SOURCES.some(s=>s.id===tab))return true;
   stop();state.tab=tab;state.page=1;state.photos=[];state.error='';refresh();await load();return true;
  }
  if(button.hasAttribute('data-gallery-enable')){await enable();await load();return true;}
  if(button.hasAttribute('data-gallery-retry')){cache.delete(`${state.tab}:${state.page}`);await load();return true;}
  if(button.dataset.galleryPage){state.page=Math.max(1,Math.min(50,state.page+Number(button.dataset.galleryPage)));await load();return true;}
  if(button.hasAttribute('data-gallery-apply')){
   if(state.applying || state.loading)return true;
   const photo=state.photos[Number(button.dataset.galleryApply)];if(!photo)return true;
   stop();const token=sequence;controller=new AbortController();state.applying=true;state.error='';refresh();
   try{
    const full=photo.provider==='commons'?await resolve(photo,{signal:controller.signal}):photo;
    if(sequence!==token)return true;
    await apply(full,{isCurrent:()=>sequence===token});
   }catch(e){if(sequence===token){state.error=e.message||'应用失败，原壁纸已保留';toast(state.error);}}
   finally{if(sequence===token){state.applying=false;refresh();}}
   return true;
  }
  return false;
 }
 return {render,handleClick,close:stop,getState:()=>({...state,photos:[...state.photos]})};
}
