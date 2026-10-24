// SPDX-License-Identifier: GPL-3.0-only
import { compressImage, MAX_IMAGE_INPUT_BYTES } from './image-compression.js';
import { renderCatalog, renderCatalogToolbar, filterCatalog, changeCatalogSize } from './widget-catalog.js';
import { TILE_SIZES, sizeLabel, gridMetrics } from './widget-sizes.js';
import { DEFAULT_STATE, createDefaultState, ENGINES, uid, safeUrl, loadState, saveState, subscribeState, validateImport, exportState, requestBookmarks, searchHistory } from './core.js';
import { renderWidget, widgetCatalog, bindWidgets, refreshLiveWidgets } from './widgets.js';
import { chineseLunarDate } from './desktop-date.js';
import { sharingView, bindSharing } from './sharing-ui.js';
import { communityView, communityToolbar, bindCommunity } from './community-ui.js';
import { pluginWorkspace, bindPluginWorkspace, pluginMenu, queuePluginCommand, setPluginDragState } from './plugin-host.js';
import { SOURCES_CHANGED, readWidgetSources, resolveWidgetSource } from './widget-sources.js';
import { t, setLocale, getLocale, formatDate, localizeDocument } from './i18n.js';
import { APP_VERSION } from './version.js';
import { extensionUpdatePanel } from './extension-update.js';
import { applyWindowSize, WINDOW_SIZES } from './window-layout.js';
import { themeTokens } from './theme.js';
import { getWidgetDefinition, newWidgetConfig } from './widget-registry.js';
import { newWidgetData, widgetContentSummary } from './widget-data.js';
import { icon, iconNames } from './icons.js';
import { normalizeWallpaperPhoto } from './wallpapers.js';
import { createWallpaperLibrary, WALLPAPER_SOURCES } from './wallpaper-library.js';
import { createLocalWallpaperStore, localWallpaperBlob, localWallpaperId } from './local-wallpapers.js';
import { webDAVStateFingerprint } from './webdav.js';
import { createSyncController } from './sync-ui.js';
import { getFaviconCandidates, discoverFavicon, faviconCacheReady } from './favicons.js';
import { normalizeIconSelection } from './icon-selection.js';
import { canVisitForFavicon, visitForFavicon } from './tab-favicon.js';
import { bindFaviconImages } from './favicon-view.js';
import { normalizeAvatarFile } from './avatar.js';
import { readSearchHistory, rememberSearch, clearSearchHistory } from './search-history.js';
import { createDesktopDragController, reorderById } from './drag.js';
import { reconcileKeyedChildren } from './keyed-view.js';
import { createDailyQuote } from './daily-quote.js';
import { bookmarkImportView, bindBookmarkImport } from './bookmark-import.js';
import { permissionsPanel, permissionControl, populatePermissionOrigins, installPermissionControls } from './permissions.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const COLORS = ['#4976df','#298d81','#eb617e','#ee9848','#8061c2','#202a39','#479ccd','#c85b4b','#6ca879','#cf9b44'];
const WALLPAPERS = [
 {id:'aurora',name:'流光',tag:'暖橙与深海',background:'radial-gradient(ellipse 42% 82% at 73% 49%,#77abb3 0%,#306376 40%,transparent 70%),radial-gradient(ellipse 45% 64% at 37% -5%,#ef9b39 0%,#c05a35 42%,transparent 70%),radial-gradient(ellipse 50% 72% at 3% 98%,#dc8128 0%,#8d302c 40%,transparent 67%),linear-gradient(130deg,#13212a,#17384d 42%,#08111d 75%,#224e72)'},
 {id:'ocean',name:'深海',tag:'静静地呼吸',background:'radial-gradient(ellipse 70% 85% at 90% 12%,#afd6ce 0%,#347c91 40%,transparent 75%),radial-gradient(ellipse 70% 90% at 20% 90%,#326b92 0%,#193a5a 47%,transparent 75%),linear-gradient(125deg,#0a2034,#24667b 60%,#0a1c30)'},
 {id:'forest',name:'森屿',tag:'住进绿色里',background:'radial-gradient(ellipse 80% 50% at 0% 15%,#92b5a2 0%,#4c8175 40%,transparent 70%),radial-gradient(ellipse 90% 80% at 100% 90%,#2f7669 0%,#12483c 50%,transparent 80%),linear-gradient(145deg,#294f44,#133b35 55%,#09241f)'},
 {id:'sunset',name:'日落',tag:'留一刻温柔',background:'radial-gradient(ellipse 65% 50% at 65% 13%,#ffc98b 0%,#d58a69 50%,transparent 85%),radial-gradient(ellipse 75% 55% at 20% 85%,#553e74 0%,transparent 72%),linear-gradient(140deg,#c58c7d,#885b77 55%,#332e53)'},
 {id:'lavender',name:'暮紫',tag:'慢一点也很好',background:'radial-gradient(ellipse 60% 75% at 65% 25%,#b4a6d0 0%,#7274ab 45%,transparent 76%),radial-gradient(ellipse 80% 70% at 0% 100%,#6c5090 0%,transparent 72%),linear-gradient(120deg,#2b3255,#58527e 55%,#171f3e)'},
 {id:'midnight',name:'静夜',tag:'为专注留白',background:'radial-gradient(ellipse 75% 60% at 75% 0%,#28495a 0%,transparent 75%),radial-gradient(ellipse 75% 70% at 0% 100%,#1a3546 0%,transparent 80%),linear-gradient(130deg,#101b29,#101820 65%,#09131e)'}
];
const dialog = $('#dialog');
const dailyQuote = createDailyQuote($('#daily-quote'), {
 onNotify: (message, duration) => toast(message, undefined, undefined, duration),
 onSearch: text => navigate(currentEngine().url.replace(/\{q\}/g, encodeURIComponent(text)), false, true),
});
let state = clone(DEFAULT_STATE);
let persistedState = clone(DEFAULT_STATE), saveQueue = Promise.resolve(), saveGeneration = 0;
let editing = false, widgetsCleanup = () => {}, saving = 0, revision = 0, blockedStorage = false, syncController = null;
let dialogKind = '', dialogData = {}, lastDialogFocus = null, lastToastTimer, undoAction = null;
let desktopDrag = null, localScope = 'desktop', localExtra = [], searchToken = 0;
let currentMedia = null, lastDate = '', renderedGroup = '', currentGridColumns = 14;
let widgetViewRevision = 0, widgetsBound = false;
const faviconFormStates = new WeakMap();
let faviconRequestSequence = 0;
let avatarRequestSequence = 0, renderedAvatar, renderedEngineKey = '', lastGroupWheel = 0;

function allEngines() { return [...ENGINES.map(engine=>({...engine,name:t(engine.name)})), ...(state.settings.customEngines || [])]; }
async function applyOnlineWallpaper(value,{isCurrent=()=>true}={}) {
 const photo = normalizeWallpaperPhoto(value);
 if (!photo) throw new Error(t("壁纸来源不受支持，请重新选择。"));
 const wallpaperChoice=JSON.stringify([state.settings.wallpaper,state.settings.customWallpaper,state.settings.remoteWallpaper,state.settings.wallpaperApiEnabled,state.settings.dailyWallpaper]);
 await new Promise((resolve,reject) => {
  const preview = new Image();
  preview.referrerPolicy = 'no-referrer';
  let finished = false;
  const done = error => {if(finished)return;finished=true;clearTimeout(timer);preview.onload=null;preview.onerror=null;error?reject(error):resolve();};
  const timer=setTimeout(()=>done(new Error(t("完整壁纸加载超时，原背景已保留。"))),15000);
  preview.onload=()=>done();preview.onerror=()=>done(new Error(t("完整壁纸暂时无法加载，请换一张或重试。")));
  preview.src=photo.url;
 });
 if(wallpaperChoice!==JSON.stringify([state.settings.wallpaper,state.settings.customWallpaper,state.settings.remoteWallpaper,state.settings.wallpaperApiEnabled,state.settings.dailyWallpaper])) throw new Error(t("加载期间壁纸设置已改变，请重新选择要应用的照片。"));
 if(!isCurrent())throw new Error(t("已取消壁纸应用。"));
 state.settings.remoteWallpaper=photo;state.settings.wallpaperApiEnabled=true;
 state.settings.customWallpaper=null;state.settings.customWallpaperType='image';state.settings.dailyWallpaper=false;
 await persist();applySettings();
 toast(`${t("已应用壁纸 · {v0}", {v0: photo.author})}`);
}
async function applySyncedDesktop(remote, expectedFingerprint) {
 await saveQueue;
 const before=clone(state), localRevision=revision;
 if(await webDAVStateFingerprint(before)!==expectedFingerprint || revision!==localRevision || JSON.stringify(state)!==JSON.stringify(before)) throw new Error(t("确认期间本机桌面又有修改，请重新检查同步。"));
 const incoming=validateImport(remote);incoming.updatedAt=state.updatedAt;
 state=incoming;
 const saved=await persist({fromSync:true});renderDesktop();return saved;
}
function currentEngine() { return allEngines().find(e => e.id === state.settings.searchEngine) || ENGINES[0]; }
function engineSiteUrl(engine) {
 // Resolve only the provider origin: templates and search text are never sent
 // to the favicon loader or page-discovery request.
 if (typeof engine?.url !== 'string') return null;
 const url = safeUrl(engine.url.replace(/\{q\}/g, ''));
 if (!url) return null;
 try {
  const origin = new URL(url).origin;
  // This known search subdomain uses its main site's icon; other origins stay exact.
  return origin === 'https://search.bilibili.com' ? 'https://www.bilibili.com/' : origin + '/';
 } catch { return null; }
}
function engineGlyph(engine) {
 return `<span class="engine-mark" style="--engine-color:${esc(engine.color || '#237fa4')}">${siteGlyph({url:engineSiteUrl(engine),title:engine.name,icon:engine.letter || engine.name?.slice(0,1),iconMode:'auto'})}</span>`;
}
async function extractEngineFavicon(button) {
 const engine = allEngines().find(e => e.id === button.dataset.extractEngineIcon);
 const url = engineSiteUrl(engine);
 if (!url || button.disabled) return;
 // Keep the permission request inside the original click gesture.
 const pending = discoverFavicon(url, {requestPermission:true, force:true, targetSize:26, pixelRatio:globalThis.devicePixelRatio || 1});
 button.disabled = true; button.textContent = t("正在提取…");
 try {
  const result = await pending;
  // A provider may have been deleted, or its settings dialog closed meanwhile.
  // Update matching provider images only; never rebuild a partially typed form.
  $$('.engine-mark').forEach(mark => {
   if ($('.site-visual',mark)?.dataset.faviconSite === url) bindFaviconImages(mark,{force:true,candidates:result.candidates?.length ? result.candidates : getFaviconCandidates(url)});
  });
  if (button.isConnected) toast(result.warning || t("已更新引擎图标，加载成功后会保存在本机缓存。"));
 } catch (err) {
  if (button.isConnected) toast(err.message || t("图标暂时无法提取，已保留文字回退。"));
 } finally {
  if (button.isConnected) { button.disabled = false; button.textContent = t("提取图标"); }
 }
}
function currentGroup() { return state.groups.find(g => g.id === state.activeGroupId) || state.groups[0]; }
function tileInk(color) {
 const hex=(color || '').replace('#','');
 if(hex.length!==6)return '#ffffff';
 const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
 return r*.299+g*.587+b*.114>200 ? '#31546c' : '#ffffff';
}
function siteGlyph(item) {
 const value = item.icon || item.title?.slice(0,2) || '↗';
 const fallback = iconNames.includes(value) ? icon(value) : `<span class="site-glyph ${[...value].length > 2 ? 'small' : ''}">${esc(value.slice(0,8))}</span>`;
 const url = item.iconMode === 'text' ? null : safeUrl(item.url);
 if (!url) return fallback;
 const selected=normalizeIconSelection(item.iconUrl);
 return `<span class="site-visual" data-favicon-site="${esc(url)}"${selected?` data-favicon-selected="${esc(selected)}"`:''}><span class="site-fallback" aria-hidden="true">${fallback}</span><img class="site-favicon" alt="" referrerpolicy="no-referrer" decoding="async" draggable="false" hidden></span>`;
}

function linkPreviewIdentity(form) {
 return `${form.elements.url.value.trim()}\n${form.elements.iconMode.value === 'text' ? 'text' : 'auto'}`;
}
function updateLinkPreview(form, options = {}) {
 if (!form?.isConnected) return;
 const identity=linkPreviewIdentity(form), mode=form.elements.iconMode.value === 'text' ? 'text' : 'auto';
 const url=safeUrl(form.elements.url.value);
 let view=faviconFormStates.get(form);
 if (!view) {
  view={identity,url,mode,request:++faviconRequestSequence,busy:false,candidates:[],variants:[],message:'',choice:form.dataset?.iconChoice || (mode==='text'?'text':'current'),previewSite:safeUrl(form.dataset?.originalUrl)||url,currentIcon:normalizeIconSelection(form.dataset?.originalIcon),measurements:new Map()};
  faviconFormStates.set(form,view);
 } else if (view.identity !== identity) {
  // The destination and icon artwork are independent. Invalidate only pending
  // discovery/upload work; keep decoded candidates, their DOM and the selection.
  const changedUrl=view.url!==url;
  if(view.visitController){view.visitController.abort();view.visitController=null;view.message=t('已取消获取，已打开的网站会保留。');}
  view.request=++faviconRequestSequence;view.busy=false;
  view.identity=identity;view.url=url;view.mode=mode;
  if(changedUrl){
   view.destinationChanged=true;
   view.message=t("网址已修改，图标与候选已保留；获取图标可追加这个网址的结果。");
  }
 }
 if(url && (!view.previewSite || !form.dataset?.originalUrl && !view.currentIcon && !view.variants.length))view.previewSite=url;
 if(view.destinationChanged && view.choice==='current' && mode==='auto' && view.currentIcon && form.elements.iconUrl)form.elements.iconUrl.value=view.currentIcon;
 const preview=$('#link-preview-icon',form), button=$('[data-action="extract-favicon"]',form), status=$('#favicon-status',form);
 const original=form.dataset?.originalUrl;
 const item=original?{url:original,iconMode:form.dataset.originalMode||'auto',iconUrl:form.dataset.originalIcon||null,icon:form.dataset.originalText,title:form.dataset.originalTitle}
   :{url:view.previewSite,iconMode:'auto',icon:form.elements.icon.value,title:form.elements.title.value};
 $('#link-preview-title',form).textContent=form.elements.title.value || t("网站");
 $('#link-preview-url',form).textContent=form.elements.url.value;
 preview.style.background=form.elements.color.value;
 preview.style.setProperty('--tile-ink',tileInk(form.elements.color.value));
 const markup=siteGlyph(item);
 if(view.rendered!==markup || view.preview!==preview){preview.innerHTML=markup;view.rendered=markup;view.preview=preview;}
 bindFaviconImages(preview,{onStatus:info=>{
  if(!form.isConnected||faviconFormStates.get(form)!==view)return;
  if(info.url){
   view.currentIcon=normalizeIconSelection(info.url);
   if(view.destinationChanged && view.choice==='current' && form.elements.iconMode.value==='auto' && form.elements.iconUrl)form.elements.iconUrl.value=view.currentIcon||'';
  }
  const quality=$('#favicon-quality',form);if(!quality)return;
  quality.dataset.quality=info.adequate?'sharp':'low';
  quality.textContent=info.url?(info.scalable?t("当前图标 · SVG 矢量"):`${t("当前图标 · {v0} × {v1}px{v2}", {v0: info.width, v1: info.height, v2: info.adequate?'':t(" · 原图偏小")})}`):t("当前图标无法加载，将显示文字。");
 }});
 const textPreview=$('[data-text-icon-preview]',form);
 if(textPreview){textPreview.textContent=form.elements.icon.value || form.elements.title.value.slice(0,2) || t("文");textPreview.style.background=form.elements.color.value;textPreview.style.color=tileInk(form.elements.color.value);}
 if(form.elements.icon){form.elements.icon.readOnly=mode!=='text';form.elements.icon.setAttribute?.('aria-disabled',String(mode!=='text'));}
 button.disabled=view.busy || !!view.visitController || !view.url;
 button.textContent=view.busy ? t("获取中…") : t("获取图标");
 const visitButton=$('[data-action="visit-favicon"]',form);
 if(visitButton){
  visitButton.disabled=!view.url;
  visitButton.textContent=view.visitController?t('取消获取'):canVisitForFavicon()?t('访问网站取图标'):t('访问网站');
 }
 status.textContent=view.message || (mode === 'text' ? t("文字图标 · 可编辑下方文字与颜色。") : t("保留当前图标，或获取网站提供的其他图标。"));
 renderLinkIconChoices(form,view);
}
function renderLinkIconChoices(form, view) {
 const results=$('[data-icon-results]',form);if(!results)return;
 const variants=(view.variants || []).filter(v=>normalizeIconSelection(v.url)).slice(0,48);
 const existing=new Map($$('[data-icon-index]',results).map(row=>[row.dataset.iconUrl,row]));
 const keep=new Set(variants.map(v=>v.url));
 for(const [url,row] of existing)if(!keep.has(url)){row.remove();view.measurements.delete(url);}
 for(const [index,entry] of variants.entries()){
  let row=existing.get(entry.url);
  const needsBinding=!row || view.retryUrls?.has(entry.url);
  if(!row){
   const template=document.createElement('template');
   template.innerHTML=`<button type="button" class="icon-choice" data-icon-choice="candidate" aria-pressed="false" disabled><span class="choice-art"><span class="site-visual" data-favicon-site="${esc(entry.sourceSite||view.previewSite||view.url)}" data-favicon-selected="${esc(entry.url)}"><span class="site-fallback" aria-hidden="true">…</span><img class="site-favicon" alt="" referrerpolicy="no-referrer" decoding="async" draggable="false" hidden></span></span><span data-icon-label></span><small data-icon-dimensions>${t("加载中")}</small></button>`;
   row=template.content.firstElementChild;row.dataset.iconUrl=entry.url;
   row.title=entry.url.startsWith('data:')?(entry.source||t('本机图片')):`${entry.source||t("网站图标")} · ${entry.url}`;
   results.append(row);
  }
  if(needsBinding){
   view.retryUrls?.delete(entry.url);
   bindFaviconImages(row,{force:!!existing.get(entry.url),autoDiscover:false,targetSize:64,onStatus:info=>{
    if(!form.isConnected||faviconFormStates.get(form)!==view||!row.isConnected)return;
    row.disabled=!info.url;row.dataset.iconReady=info.url?'true':'false';
    $('[data-icon-dimensions]',row).textContent=info.url?(info.scalable?t("SVG · 矢量"):`${info.width} × ${info.height}`):t("不可用");
    if(info.url)row.title=`${entry.source||t("网站图标")} · ${info.scalable?'SVG':info.width+' × '+info.height+'px'}${entry.url.startsWith('data:')?'':'\n'+entry.url}`;
    row.classList.toggle('icon-unavailable',!info.url);
    view.measurements.set(entry.url,Boolean(info.url));
   }});
  }
  row.dataset.iconIndex=String(index);
  $('[data-icon-label]',row).textContent=entry.browserIcon?t('标签页图标'):`${t("网站图标 {v0}", {v0: index+1})}`;
 }
 const selection=form.elements.iconUrl?.value||'';
 for(const row of $$('[data-icon-choice]',form)){
  const chosen=row.dataset.iconChoice===view.choice && (view.choice!=='candidate'||row.dataset.iconUrl===selection);
  row.setAttribute('aria-pressed',String(chosen));
 }
}
function chooseLinkIcon(button){
 const form=button.closest('#link-form');if(!form||button.disabled)return;
 updateLinkPreview(form);const view=faviconFormStates.get(form),choice=button.dataset.iconChoice;
 if(choice==='candidate'){
  const candidate=view.variants?.[Number(button.dataset.iconIndex)];
  if(!candidate||button.dataset.iconReady!=='true')return;
  form.elements.iconUrl.value=candidate.url;form.elements.iconMode.value='auto';
 }else if(choice==='text') {form.elements.iconMode.value='text';form.elements.iconUrl.value='';}
 else if(choice==='current') {form.elements.iconMode.value=form.dataset.originalMode||'auto';form.elements.iconUrl.value=view.currentIcon||form.dataset.originalIcon||'';}
 else if(choice==='upload'){ $('#site-icon-upload',form)?.click();return; }
 else return;
 form.dataset.iconChoice=choice;view.choice=choice;
 updateLinkPreview(form);
}
function isLinkPreviewCurrent(form, view, request) {
 return form.isConnected && dialog.open && faviconFormStates.get(form) === view && view.request === request && view.identity === linkPreviewIdentity(form);
}
async function extractLinkFavicon(button) {
 const form=button.closest('#link-form');
 if (!form || button.disabled) return;
 const url=safeUrl(form.elements.url.value);if (!url) return;
 // Request permission synchronously in the click gesture. Full enumeration also
 // reads a same-origin manifest even when one HTML icon is already sharp.
 const pending=discoverFavicon(url,{requestPermission:true,force:true,allCandidates:true,targetSize:64,pixelRatio:globalThis.devicePixelRatio || 1});
 updateLinkPreview(form);
 const view=faviconFormStates.get(form), request=++faviconRequestSequence;
 view.request=request;view.busy=true;view.message=t("正在读取网站图标声明…");updateLinkPreview(form);
 try {
  const result=await pending;if (!isLinkPreviewCurrent(form,view,request)) return;
  view.busy=false;view.candidates=result.candidates?.length ? result.candidates : getFaviconCandidates(url);
  const incoming=(result.variants?.length?result.variants:view.candidates.map(url=>({url,source:t("站点候选")}))).filter(v=>normalizeIconSelection(v.url)).slice(0,12);
  view.retryUrls=new Set(incoming.filter(v=>view.measurements.get(v.url)===false).map(v=>v.url));
  const known=new Set(view.variants.map(v=>v.url));
  for(const variant of incoming)if(!known.has(variant.url) && view.variants.length<48){view.variants.push({...variant,sourceSite:url});known.add(variant.url);}
  view.warning=result.warning||'';
  // Listing candidates never changes the selected asset or the website name.
  view.message=(result.warning ? result.warning+' ' : '')+(incoming.length?t("候选已追加，之前的图标与选择保留；选择后点击保存。"):t("这个网址没有新图标，已有候选与选择已保留。"));
  updateLinkPreview(form);
 } catch(err) {
  if (!isLinkPreviewCurrent(form,view,request)) return;
  view.busy=false;view.message=err.message || t("暂时无法获取，当前图标未更改。");updateLinkPreview(form);
 }
}
async function uploadSiteIcon(input){
 const form=input.closest('#link-form'),file=input.files?.[0];input.value='';if(!form||!file)return;
 updateLinkPreview(form);const view=faviconFormStates.get(form),request=++faviconRequestSequence;
 view.visitController?.abort();view.visitController=null;view.busy=false;
 view.request=request;view.message=t("正在处理本机图标…");updateLinkPreview(form);
 try{
  const image=await normalizeAvatarFile(file);if(!isLinkPreviewCurrent(form,view,request))return;
  form.elements.iconUrl.value=image;form.elements.iconMode.value='auto';
  view.variants=[...(view.variants||[]).filter(v=>v.url!==image).slice(0,47),{url:image,source:t("本机上传"),sourceSite:view.previewSite||view.url}];
  view.choice='candidate';form.dataset.iconChoice='candidate';view.message=t("已处理本机图标，保存后生效。");updateLinkPreview(form);
 }catch(error){if(isLinkPreviewCurrent(form,view,request)){view.message=error.message;updateLinkPreview(form);}}
}
function cancelLinkFaviconVisit() {
 faviconFormStates.get($('#link-form',dialog))?.visitController?.abort();
}
async function visitLinkFavicon(button) {
 const form=button.closest('#link-form');if(!form || button.disabled)return;
 updateLinkPreview(form);const view=faviconFormStates.get(form);
 if(view.visitController){
  view.visitController.abort();view.visitController=null;view.message=t('已取消获取，已打开的网站会保留。');updateLinkPreview(form);return;
 }
 if(!view.url)return;
 if(!canVisitForFavicon()){
  window.open(view.url,'_blank','noopener,noreferrer');
  view.message=t('网页版无法读取其他标签页的图标；可使用扩展版，或保存图片后通过“上传”选择。');updateLinkPreview(form);return;
 }
 const controller=new AbortController(),request=++faviconRequestSequence;
 view.visitController=controller;view.request=request;view.busy=false;
 view.message=t('正在打开网站…');updateLinkPreview(form);
 try{
  const result=await visitForFavicon(view.url,{signal:controller.signal,onWaiting:phase=>{
   if(!isLinkPreviewCurrent(form,view,request)||controller.signal.aborted)return;
   view.message=phase==='reading'?t('正在读取标签页图标…'):t('请在网站图标显示后返回栖页，图标会加入候选。');updateLinkPreview(form);
  }});
  if(!isLinkPreviewCurrent(form,view,request)||controller.signal.aborted)return;
  if(!view.variants.some(entry=>entry.url===result.dataUrl)){
   if(view.variants.length>=48){view.message=t('候选图标已满，请保存或重新打开编辑窗口后再试。');return;}
   view.variants.push({url:result.dataUrl,source:t('浏览器标签页缓存'),sourceSite:result.pageUrl,browserIcon:true});
  }
  view.message=t('已加入标签页图标，请选中后保存；图标已转为本地图片。');
 }catch(error){
  if(isLinkPreviewCurrent(form,view,request)&&!controller.signal.aborted)view.message=error.message||t('无法读取浏览器图标缓存。');
 }finally{
  if(view.visitController===controller){view.visitController=null;if(form.isConnected&&dialog.open)updateLinkPreview(form);}
 }
}
function toast(message, undo, actionLabel=t("撤销"), duration=3000) {
 clearTimeout(lastToastTimer); const el = $('#toast');
 (dialog.open ? dialog : document.body).append(el);
 $('span',el).textContent = message; $('button',el).hidden = !undo; $('button',el).textContent=actionLabel; undoAction = undo || null; el.hidden = false;
 lastToastTimer = setTimeout(() => { el.hidden = true; undoAction = null; }, undo ? 8000 : Math.max(1500,Math.min(10000,Number(duration)||3000)));
}
$('#toast button').addEventListener('click', async () => { const action = undoAction; $('#toast').hidden = true; undoAction = null; if (action) await action(); });
async function persist(options = {}) {
 if (blockedStorage) throw new Error(t("原有数据需要恢复，请先导入有效备份。"));
 const ticket = ++revision, snapshot = clone(state), previousPending = saving > 0, generation=saveGeneration; saving++;
 const job = saveQueue.then(async () => {
  if(generation!==saveGeneration){
   saving--;
   const cancelled=new Error(t("前一项修改未能保存，请在最新桌面上重新操作。"));
   cancelled.notified=true;
   throw cancelled;
  }
  try {
   if (previousPending && !options.replace) snapshot.updatedAt = persistedState.updatedAt;
   const saved = await saveState(snapshot, options);
   persistedState = clone(saved);
   state.updatedAt = saved.updatedAt;
   if (!options.fromSync) syncController?.scheduleLocal();
   return saved;
  } catch (err) {
   saveGeneration++;
   if (err.currentState) persistedState = clone(err.currentState);
   state = clone(persistedState);
   if (err.code === 'STATE_CONFLICT') {
    renderDesktop(); toast(t("另一个标签页已更新桌面。已载入最新内容，可导出本次未保存的改动。"),()=>exportBackup(snapshot),t("导出副本"));
   } else { toast(`${t("保存失败：{v0}", {v0: err.message || t("请检查可用存储空间")})}`); }
   err.notified=true;
   throw err;
  } finally { saving--; }
 });
 saveQueue = job.catch(() => {});
 return job;
}
async function saveWidgetData(id, data, expectedData) {
 await saveQueue;
 const item = state.items.find(item=>item.id===id);
 if (!item || JSON.stringify(item.data)!==expectedData) throw new Error(t('组件内容已在其他位置修改，请导出当前草稿后重新打开页面。'));
 item.data = clone(data);
 const saved = await persist();
 return saved.items.find(item=>item.id===id).data;
}
async function saveWidgetSettings(id, changes, expected) {
 await saveQueue;
 const existing=state.items.find(item=>item.id===id);
 if(!existing || JSON.stringify([existing.title,existing.config])!==expected)throw new Error(t('组件设置已在其他位置修改，请重新打开。'));
 const candidate=clone(state),item=candidate.items.find(item=>item.id===id);
 item.title=changes.title;item.config=changes.config;
 if(changes.duration!==undefined)item.data.focus={duration:changes.duration,remaining:changes.duration*60,running:false,endAt:null};
 state=validateImport(candidate);await persist();renderDesktop({preserveWidgets:true});
 return state.items.find(item=>item.id===id);
}
async function applyExchange(candidate,expected) {
 await saveQueue;
 if(JSON.stringify(state)!==expected)throw new Error(t('桌面已发生变化，请重新预览后再操作。'));
 state=validateImport({...candidate,updatedAt:state.updatedAt});await persist();renderDesktop({preserveWidgets:true});
}
async function commit(render = true, options = {}) { await persist(); if (render) renderDesktop(options); }
function navigate(url, forceNew = false, searchResult = false) {
 const target = safeUrl(url); if (!target) return toast(t("这个网址无效，请使用 http 或 https 网址。"));
 if (forceNew || (searchResult ? state.settings.searchNewTab : state.settings.openNewTab)) window.open(target, '_blank', 'noopener,noreferrer');
 else window.location.assign(target);
}
function renderClock() {
 const now = new Date(), s = state.settings;
 let hour = now.getHours(); const period = hour >= 12 ? t("下午") : t("上午");
 if (s.hour12) hour = hour % 12 || 12;
 $('#clock-time').textContent = `${String(hour).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 $('#clock-seconds').textContent = s.showSeconds ? ':' + String(now.getSeconds()).padStart(2,'0') : '';
 $('#clock-period').textContent = s.hour12 ? period : '';
 const dateKey = `${now.toDateString()}|${s.showWeekday}|${s.showLunar}|${getLocale()}`;
 if (lastDate !== dateKey) {
  lastDate = dateKey;
  const parts = [formatDate(now,{month:'long',day:'numeric'})];
  if (s.showWeekday) parts.push(new Intl.DateTimeFormat(getLocale(),{weekday:'long'}).format(now));
  if (s.showLunar) { const lunar = chineseLunarDate(now); if(lunar) parts.push(lunar); }
  $('#date').textContent = parts.join('　');
 }
}
// Pinned controls live OUTSIDE the scrollport. No shrink-on-scroll, overlay,
// backdrop change, or z-index trick is needed to keep cards away from them.
function positionHeaderRegions() {
 const dock=$('#header-dock'),flow=$('#flow-header');
 if(!dock||!flow)return;
 for(const [selector,pinned] of [['#clock-block',state.settings.pinClock],['.search-wrapper',state.settings.pinSearch]]) {
  const node=$(selector),target=pinned?dock:flow;
  if(node.parentElement!==target)target.append(node);
  node.classList.remove('is-stuck');
 }
 // Preserve time-before-search inside either region without moving stable nodes.
 for(const region of [dock,flow]) {
  const clock=$('#clock-block',region),search=$('.search-wrapper',region);
  if(clock&&search&&clock.nextElementSibling!==search)region.insertBefore(clock,search);
  region.hidden=![...region.children].some(node=>!node.hidden);
 }
 document.body.classList.toggle('has-pinned-header',!dock.hidden);
 document.body.classList.toggle('has-flow-header',!flow.hidden);
}
function updatePinnedHeader() {
 // Scrolling never changes the appearance of either header region.
 $('#clock-block').classList.remove('is-stuck');
 $('.search-wrapper').classList.remove('is-stuck');
}
function updateHeaderPlacement() {
 const clockText=$('#clock');
 clockText.style.fontSize='';
 const region=clockText.closest('.header-region')||$('#main');
 const available=Math.max(1,region.clientWidth-32);
 if(!clockText.hidden&&clockText.scrollWidth>available)clockText.style.fontSize=(parseFloat(getComputedStyle(clockText).fontSize)*available/clockText.scrollWidth)+'px';
 for(const [selector,key] of [['#clock-block','clock'],['.search-wrapper','search']]) {
  const el=$(selector),parent=el.parentElement,box=parent.getBoundingClientRect(),css=getComputedStyle(parent);
  const left=box.left+parseFloat(css.paddingLeft||0),right=box.right-parseFloat(css.paddingRight||0);
  const property=`--${key}-shift`,previous=parseFloat(el.style.getPropertyValue(property))||0,rect=el.getBoundingClientRect();
  if(el.hidden||!rect.width){el.style.setProperty(property,'0px');continue;}
  const desired=window.innerWidth/2-(rect.left-previous+rect.width/2)+state.settings[key+'OffsetX']*window.innerWidth/100;
  const offset=Math.max(left-(rect.left-previous),Math.min(right-(rect.right-previous),desired));
  el.style.setProperty(property,`${Math.round(offset*100)/100}px`);
 }
 updatePinnedHeader();
}
function renderAvatar() {
 const avatar = state.settings.avatar;
 if (avatar !== renderedAvatar) {
  $('#brand-button').innerHTML = avatar ? `<img class="brand-avatar" src="${esc(avatar)}" alt="" draggable="false">` : '<img class="brand-mark" src="icons/qiye-icon.svg" alt="" width="32" height="32" draggable="false">';
  renderedAvatar = avatar;
 }
 const preview = $('#avatar-preview',dialog);
 if (preview) preview.innerHTML = avatar ? `<img class="brand-avatar" src="${esc(avatar)}" alt="${t("当前头像")}">` : '<img class="brand-mark" src="icons/qiye-icon.svg" alt="" width="56" height="56" draggable="false">';
}
async function uploadAvatar(file,panel) {
 const request = ++avatarRequestSequence, previous = state.settings.avatar, originalState = state;
 const status = $('#avatar-status',panel);
 status.textContent = t("正在裁切头像…");
 try {
  if (blockedStorage) throw new Error(t("请先恢复本机桌面数据，再修改头像。"));
  const avatar = await normalizeAvatarFile(file);
  if (request !== avatarRequestSequence || !panel.isConnected || !dialog.open) return;
  if (state !== originalState || state.settings.avatar !== previous) { status.textContent = t("桌面已更新，请重新选择头像。"); return; }
  state.settings.avatar = avatar;
  await persist();
  renderAvatar();
  if (request === avatarRequestSequence && panel.isConnected) status.textContent = t("已保存头像。点击侧栏头像即可打开设置。");
 } catch (error) {
  if (request !== avatarRequestSequence || !panel.isConnected) return;
  renderAvatar();
  status.textContent = error.message || t("头像未能保存，请重试。");
 }
}
async function resetAvatar() {
 if (blockedStorage) throw new Error(t("请先恢复本机桌面数据，再修改头像。"));
 const request = ++avatarRequestSequence, panel = $('#avatar-panel',dialog);
 const current = () => request === avatarRequestSequence && panel?.isConnected && dialog.open;
 state.settings.avatar = null;
 try {
  await persist();
  if (current()) $('#avatar-status',panel).textContent = t("已恢复栖页默认图标。");
 } catch (error) {
  if (current()) $('#avatar-status',panel).textContent = error.message || t("重置头像未能保存，请重试。");
  throw error;
 } finally { renderAvatar(); }
}
function updateToolbar() {
 const auto = state.settings.toolbarVisibility === 'auto', button = $('#toolbar-visibility');
 $('.top-tools').classList.toggle('auto-hide', auto);
 button.innerHTML = icon(auto ? 'eyeOff' : 'eye');
 button.setAttribute('aria-pressed',String(auto));
 button.setAttribute('aria-label',auto ? t("始终显示工具按钮") : t("自动隐藏工具按钮"));
 button.title = auto ? t("工具自动隐藏 · 点击改为始终显示") : t("工具始终显示 · 点击改为自动隐藏");
 $('.top-tools [data-action=wallpaper]').hidden = !state.settings.showWallpaperButton;
 const reveal = $('#navigation-reveal');
 reveal.hidden = state.settings.sidebarVisibility === 'always' || state.settings.minimal;
 reveal.setAttribute('aria-expanded',String(document.body.classList.contains('navigation-open')));
}
function applySettings() {
 setLocale(state.settings.language);localizeDocument();document.title=t("栖页 · 新标签页");
 const s = state.settings;
 applyWindowSize(dialog, s.windowSize);
 const { theme, accent, ink } = themeTokens(s, matchMedia('(prefers-color-scheme: dark)').matches);
 const metrics = gridMetrics(s, window.innerWidth);

 const root = document.documentElement;
 root.dataset.theme = theme;
 root.dataset.material = s.surfaceStyle;
 root.dataset.navigation = s.navigationMode;
 root.dataset.sidebarPosition = s.sidebarPosition;
 root.dataset.sidebarVisibility = s.sidebarVisibility;
 root.dataset.accent = s.useThemeColor?'custom':'default';
 root.dataset.font = s.uiFont;
 root.dataset.iconShape=s.iconShape;
 root.dataset.iconDiscovery=s.autoExtractIcons?'auto':'manual';
 root.dataset.iconBackdrop=s.iconBackdrop;
 const properties = {
  '--gap':metrics.gap+'px','--tile-size':metrics.cell+'px','--radius':s.radius+'px',
  '--label-space':Math.max(24,Math.ceil(s.labelSize*1.3)+6)+'px','--cell-size':metrics.cell+'px','--icon-radius':Math.min(s.radius,s.gridSize/2)+'px',
  '--clock-size':s.clockSize+'px','--clock-weight':s.clockWeight,
  '--clock-offset-y':s.clockOffsetY+'px','--search-offset-y':s.searchOffsetY+'px',
  '--search-width':s.searchWidth+'px','--search-height':s.searchHeight+'px','--search-radius':s.searchRadius+'px',
  '--search-opacity':s.searchOpacity/100,'--sidebar-width':s.sidebarWidth+'px','--sidebar-opacity':s.sidebarOpacity/100,
  '--surface-opacity':s.surfaceOpacity/100,'--surface-blur':s.surfaceBlur+'px','--ui-scale':s.uiScale/100,
  '--quote-safe-space':s.quote?'84px':'0px',
  '--icon-opacity':s.iconOpacity/100,'--label-size':s.labelSize+'px','--label-color':s.labelColor,
  '--clock-color':s.useThemeColor?accent:s.clockColor,'--desktop-max-width':s.desktopMaxWidth+'px','--accent':accent,'--accent-ink':ink,
  '--wallpaper-blur':s.blur+'px','--wallpaper-dim':s.dim/100
 };
 for (const [key,value] of Object.entries(properties)) root.style.setProperty(key,String(value));
 document.body.classList.toggle('minimal', !!s.minimal);
 document.body.classList.toggle('no-labels', !s.showLabels);
 document.body.classList.toggle('no-sidebar-labels', !s.sidebarLabels);
 document.body.classList.toggle('reduce-effects', !!s.reducedEffects);
 root.classList.toggle('hide-content-scrollbar', !!s.hideScrollbar);
 root.classList.toggle('hide-editor-scrollbar', !!s.hideEditorScrollbar);
 document.body.classList.toggle('pin-clock', s.pinClock && (s.showClock || s.showDate));
 document.body.classList.toggle('pin-search', s.pinSearch && s.showSearch);
 $('#clock-block').hidden = !s.showClock && !s.showDate;
 $('#clock').hidden = !s.showClock;
 $('#date').hidden = !s.showDate;
 $('.search-wrapper').hidden = !s.showSearch;
 if (!s.showSearch) hideSearchMenus();
 dailyQuote.update(s.quote);
 positionHeaderRegions(); renderAvatar(); updateToolbar();
 let wallpaper = WALLPAPERS.find(w=>w.id === s.wallpaper) || WALLPAPERS[0];
 const remote = s.wallpaperApiEnabled && normalizeWallpaperPhoto(s.remoteWallpaper);
 if (s.dailyWallpaper && !s.customWallpaper && !remote) wallpaper = WALLPAPERS[Math.floor(Date.now()/86400000) % WALLPAPERS.length];
 const credit = $('#wallpaper-credit');
 if (credit) {
  credit.hidden = !s.showWallpaperCredit || !remote || !!s.customWallpaper || !remote.author || /原作者与来源见|摄影师未署名|见原始文件页/.test(remote.author);
  if (remote) {credit.href=remote.sourceUrl;credit.textContent=`${remote.author} · ${({commons:'Commons',picsum:'Picsum',deepin:'deepin',wallhaven:'Wallhaven'}[remote.provider]||remote.provider)}`;credit.title=t("查看壁纸摄影师与照片来源");}
  else {credit.removeAttribute('href');credit.textContent='';}
 }
 const video = $('#wallpaper-video');
 if (s.customWallpaper && s.customWallpaperType === 'video') {
  $('#wallpaper').style.backgroundImage = wallpaper.background;
  if (currentMedia !== s.customWallpaper) { currentMedia = s.customWallpaper; video.src = currentMedia; video.play().catch(()=>{}); }
  video.style.display = 'block';
 } else {
  video.style.display = 'none'; video.pause();
  if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
  currentMedia = null;
  const photoUrl = s.customWallpaper || remote?.url;
  $('#wallpaper').style.backgroundImage = photoUrl ? `url("${photoUrl.replace(/["\\\n\r]/g, '\\$&')}"), ${wallpaper.background}` : wallpaper.background;
 }
 updateGrid(); renderClock(); renderEngine(); updateHeaderPlacement();
}
function updateGrid() {
 const wrap = $('.desktop-wrap');
 const width = wrap.getBoundingClientRect().width;
 currentGridColumns = Math.max(2,Math.min(16,Math.floor((width + gridMetrics(state.settings,window.innerWidth).gap)/(gridMetrics(state.settings,window.innerWidth).cell + gridMetrics(state.settings,window.innerWidth).gap))));
 document.documentElement.style.setProperty('--columns', currentGridColumns);
 $$('.tile[data-size]').forEach(el => { const [w,h] = el.dataset.size.split('x').map(Number); el.style.gridColumn = `span ${Math.min(w,currentGridColumns)}`; el.style.gridRow = `span ${h}`; });
}
function renderGroups() {
 const groups = $('#groups'), oldScroll = [groups.scrollLeft,groups.scrollTop];
 $('#groups').innerHTML = state.groups.map(g=>`<button class="group-button ${g.id === currentGroup().id?'active':''}" data-group="${esc(g.id)}" aria-label="${t("{v0}分组", {v0: esc(g.name)})}" ${g.id===currentGroup().id?'aria-current="page"':''} title="${t("{v0} · 右键编辑", {v0: esc(g.name)})}" draggable="false">${icon(g.icon)}<span>${esc(g.name)}</span></button>`).join('');
 groups.scrollLeft=oldScroll[0];groups.scrollTop=oldScroll[1];
 $('.group-button.active',groups)?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function renderDesktop({preserveWidgets=false} = {}) {
 desktopDrag?.cancel();
 applySettings(); renderGroups();
 if(!preserveWidgets)widgetViewRevision++;
 const group = currentGroup(), switched = renderedGroup && renderedGroup !== group.id;
 state.activeGroupId = group.id; renderedGroup = group.id;
 $('.desktop-wrap').setAttribute('aria-label', `${t("{v0}桌面", {v0: group.name})}`);
 $('.desktop-heading').hidden = !editing;
 document.body.classList.toggle('editing', editing);
 $('#edit-button').classList.toggle('active',editing); $('#edit-button').setAttribute('aria-pressed',String(editing));
 $('#done-editing').hidden = !editing; $('#edit-hint').hidden = !editing;
 const items = state.items.filter(i=>i.groupId === group.id && !i.folderId);

 const desktop = $('#desktop');
 desktop.classList.toggle('group-enter', !!switched && state.settings.animateGroups && !state.settings.reducedEffects);
 let widgetSources=[];try{widgetSources=readWidgetSources();}catch{}
 const entries=items.map((item,index)=>({
  key:item.id,
  // Order is not visual identity. Folder previews alone depend on children;
  // a pure move retains live widget drafts and their existing event binding.
  signature:JSON.stringify([item.type==='widget'?[item.id,item.title,item.size,resolveWidgetSource(item,widgetSources)]:item,item.type==='folder'?state.items.filter(i=>i.folderId===item.id).slice(0,4):null,item.type==='link'?state.settings.openNewTab:null]),
  render:()=>renderTile(item,index)
 }));
 if(state.settings.showAddTile)entries.push({key:'$add',signature:'add',render:()=>`<div class="tile tile-add"><button class="tile-body" data-action="add" aria-label="${t("添加网站或组件")}">${icon('plus')}</button><span class="tile-label">${t("添加")}</span></div>`});
 if(!items.length && !state.settings.showAddTile)entries.push({key:'$empty',signature:'empty',render:()=>`<div class="desktop-empty"><span>${t("给这一页留一些喜欢的内容")}</span><button class="text-button" data-action="add">${t("添加网站或组件")}</button></div>`});
 let park=document.getElementById('widget-parking');
 if(!park){park=document.createElement('div');park.id='widget-parking';park.hidden=true;park.inert=true;document.body.append(park);}
 const retained=new Map(state.items.filter(i=>i.type==='widget'&&!i.folderId&&i.groupId!==group.id).slice(-24).map(i=>[i.id,JSON.stringify([[i.id,i.title,i.size,resolveWidgetSource(i,widgetSources)],null,null])]));
 const changed=reconcileKeyedChildren(desktop,entries,{park,retain:retained});
 items.forEach((item,index)=>desktop.children[index]?.style.setProperty('--enter-delay',Math.min(index,10)*16+'ms'));
 bindFaviconImages(desktop);
 if(!widgetsBound || [...changed.created,...changed.removed].some(node=>node.classList.contains('tile-widget'))){
  widgetsCleanup=bindWidgets(desktop,pluginHost());
  widgetsBound=true;
 }
 updateGrid(); refreshLiveWidgets($('#desktop'), state);
}
function renderTile(item,index=0) {
 const [width,height] = (item.type==='link'?'1x1':item.size || '1x1').split('x').map(Number);
 let body = '';
 if (item.type === 'widget') body = `<div class="tile-body">${renderWidget(item,state)}</div>`;
 else if (item.type === 'folder') {
  const children = state.items.filter(i=>i.folderId === item.id).slice(0,4);
  body = `<button class="tile-body" draggable="false" data-open-folder="${esc(item.id)}" aria-label="${t("打开文件夹：{v0}", {v0: esc(item.title)})}"><div class="folder-preview ${children.length?'':'empty'}">${children.length ? children.map(c=>`<span class="mini-site" style="--tile-color:${esc(c.color || '#507ca6')};--tile-ink:${tileInk(c.color)}">${siteGlyph(c)}</span>`).join('') : icon('folder')}</div></button>`;
 } else body = `<a class="tile-body" draggable="false" href="${esc(safeUrl(item.url) || '#')}" data-open-link="${esc(item.id)}" style="--tile-color:${esc(item.color || '#486c91')};--tile-ink:${tileInk(item.color)}" aria-label="${t("打开{v0}", {v0: esc(item.title)})}" target="${state.settings.openNewTab?'_blank':'_self'}" rel="noopener noreferrer">${siteGlyph(item)}</a>`;
 return `<article class="tile tile-${esc(item.type)}" data-item="${esc(item.id)}" data-item-type="${esc(item.type)}" data-size="${width}x${height}" style="grid-column:span ${Math.min(width,currentGridColumns)};grid-row:span ${height};--enter-delay:${Math.min(index,10)*16}ms" draggable="false" tabindex="0" aria-label="${t(item.type==='widget'?"{v0} · 长按拖动，右键设置，Alt 加方向键调整位置":"{v0} · 拖动排序，Alt 加方向键调整位置", {v0: esc(item.title)})}">${item.type==='widget'?'':`<div class="tile-actions"><button data-edit-item="${esc(item.id)}" aria-label="${t("编辑{v0}", {v0: esc(item.title)})}" title="${t("编辑")}">${icon('edit')}</button><button data-delete-item="${esc(item.id)}" aria-label="${t("移除{v0}", {v0: esc(item.title)})}" title="${t("移除")}">${icon('close')}</button></div>`}${body}<span class="tile-label">${esc(item.title)}</span></article>`;
}
function renderEngine() {
 const e = currentEngine(), key = JSON.stringify([e.id,allEngines()]);
 if (key === renderedEngineKey) return;
 renderedEngineKey = key;
 $('#engine-button').innerHTML = `${engineGlyph(e)}${icon('chevron')}`;
 $('#engine-button').title = `${t("{v0} · 点击切换搜索引擎", {v0: e.name})}`;
 $('#engine-button').setAttribute('aria-label',`${t("切换搜索引擎，当前为{v0}", {v0: e.name})}`);
 $('#engine-menu').innerHTML = allEngines().map(en=>`<button class="engine-option ${en.id===e.id?'active':''}" data-engine="${esc(en.id)}">${engineGlyph(en)}<span>${esc(en.name)}</span></button>`).join('') + `<button class="engine-manage" data-action="search-settings">${t("管理搜索引擎 · 支持自定义")}</button>`;
 bindFaviconImages($('#engine-button')); bindFaviconImages($('#engine-menu'));
}
function hideSearchMenus() { $('#engine-menu').hidden = true; $('#engine-button').setAttribute('aria-expanded','false'); $('#search-suggestions').hidden = true; }
function findItems(query) { const q = query.trim().toLocaleLowerCase(); return state.items.filter(i=>i.type==='link' && (!q || `${i.title} ${i.url}`.toLocaleLowerCase().includes(q))); }
function suggestions() {
 const q = $('#search-input').value.trim();
 $('#engine-menu').hidden = true;

 if (!q) {
  const history = readSearchHistory(state.settings.showSearchHistory).slice(0,6);
  $('#search-suggestions').innerHTML = history.length ? `<div class="suggestion-label">${t("最近搜索")}</div>` + history.map(term=>`<button class="suggestion" data-search-history="${esc(term)}">${icon('history')}<span><strong>${esc(term)}</strong></span></button>`).join('') : '';
  $('#search-suggestions').hidden = !history.length;
  return;
 }

 const found = findItems(q).slice(0,4);
 $('#search-suggestions').innerHTML = `<div class="suggestion-label">${found.length?t("我的收藏"):t("聚合搜索")}</div>` + found.map(i=>`<button class="suggestion" data-suggestion="${esc(i.id)}"><span class="suggestion-site" style="--tile-color:${esc(i.color || COLORS[0])};--tile-ink:${tileInk(i.color)}">${siteGlyph(i)}</span><span><strong>${esc(i.title)}</strong><small>${esc(i.url)}</small></span><span class="suggestion-arrow">↗</span></button>`).join('') + `<button class="suggestion" data-action="submit-search">${icon('search')}<span><strong>${t("使用 {v0} 搜索「{v1}」", {v0: esc(currentEngine().name), v1: esc(q.slice(0,48))})}</strong></span><span class="suggestion-arrow">↵</span></button>`;
 bindFaviconImages($('#search-suggestions'));
 $('#search-suggestions').hidden = false;
}
function submitSearch() {
 const q = $('#search-input').value.trim(); if (!q) return $('#search-input').focus();
 let url;
 if (/^https?:\/\//i.test(q) || /^(?:[\w-]+\.)+[\w-]{2,}(?:[\/:?#]|$)/.test(q)) url = safeUrl(q);
 else url = currentEngine().url.replace(/\{q\}/g,encodeURIComponent(q));
 if (!url) return toast(t("请输入有效的网址或搜索内容。"));
 rememberSearch(q,state.settings.showSearchHistory);
 hideSearchMenus(); navigate(url,false,true);
}
function dialogCloseButton(){return `<button class="dialog-close workspace-close" data-close aria-label="${t("关闭")}">${icon('close')}</button>`;}
function dialogHeader(title,subtitle='') { return compactDialogHeader(title)+(subtitle?`<p class="dialog-description" id="dialog-description">${esc(subtitle)}</p>`:''); }
function compactDialogHeader(title,details='',actions='',titleId='dialog-title') {
 return `<header class="dialog-head compact-dialog-head"><div class="compact-dialog-title"><h2 id="${titleId}" tabindex="-1" title="${esc(title)}">${esc(title)}</h2>${details}</div><div class="compact-dialog-actions">${actions}${dialogCloseButton()}</div></header>`;
}
function workspaceDialogHeader(title,context) {return compactDialogHeader(title,`<span class="dialog-context" title="${esc(context)}">${esc(context)}</span>`,'','workspace-title');}
function field(name,label,value='',options={}) { return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${options.type || 'text'}" value="${esc(value)}" ${options.required?'required':''} ${options.type==='number'?'step="any"':''} ${options.min!==undefined?`min="${options.min}"`:''} ${options.max!==undefined?`max="${options.max}"`:''} ${options.maxlength?`maxlength="${options.maxlength}"`:''} ${options.placeholder?`placeholder="${esc(options.placeholder)}"`:''}>${options.help?`<small>${esc(options.help)}</small>`:''}</label>`; }
function selectField(name,label,value,options) { return `<label class="field"><span>${esc(label)}</span><select name="${name}">${options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`; }
function formActions(label=t("保存")) { return `<div id="form-error" class="inline-error" hidden></div><div class="button-row"><button class="secondary-button" type="button" data-close>${t("取消")}</button><button class="primary-button" type="submit">${icon('check')}${esc(label)}</button></div>`; }
function groupOptions() { return state.groups.map(g=>({value:g.id,label:g.name})); }
function colorsHtml(selected) { return `<div class="color-options">${COLORS.map(c=>`<button class="color-option ${c===selected?'selected':''}" style="background:${c}" data-color="${c}" type="button" aria-label="${t("图标颜色 {v0}", {v0: c})}">${c===selected?icon('check'):''}</button>`).join('')}<input class="color-input" type="color" name="color" aria-label="${t("自定义图标颜色")}" value="${esc(selected || COLORS[0])}"></div>`; }
function blobToDataUrl(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error(t('文件读取失败')));
    reader.readAsDataURL(blob);
  });
}
let wallpaperUploadRevision=0;
const localWallpapers=createLocalWallpaperStore();
const wallpaperChoice=()=>JSON.stringify([state.settings.wallpaper,state.settings.customWallpaper,state.settings.remoteWallpaper,state.settings.dailyWallpaper]);
function wallpaperRequest() {
  const revision=++wallpaperUploadRevision, choice=wallpaperChoice();
  return ()=>revision===wallpaperUploadRevision && choice===wallpaperChoice();
}
async function storeLocalWallpaper(blob,type='image',isCurrent=wallpaperRequest(),name) {
  if(!(blob instanceof Blob) || !blob.size || blob.size>4*1024*1024)
    throw new Error(t('壁纸不能超过 4 MiB'));
  const url=await blobToDataUrl(blob);
  if(!isCurrent())return false;
  await localWallpapers.remember(state.settings.customWallpaper,state.settings.customWallpaperType);
  await localWallpapers.put(blob,name);
  if(!isCurrent())return false;
  state.settings.customWallpaper=url;
  state.settings.customWallpaperType=type;
  state.settings.remoteWallpaper=null;
  state.settings.dailyWallpaper=false;
  await persist();
  applySettings();
  return true;
}
async function removeLocalWallpaper(row) {
 const previous=state.settings.customWallpaper;
 const active=previous&&await localWallpaperId(localWallpaperBlob(previous))===row.id;
 await localWallpapers.remove(row.id);
 if(active&&state.settings.customWallpaper===previous){
  state.settings.customWallpaper=null;state.settings.customWallpaperType='image';state.settings.remoteWallpaper=null;state.settings.dailyWallpaper=false;
  try{await persist();}catch(error){await localWallpapers.put(row.blob,row.name);applySettings();throw error;}
  applySettings();
 }
}
let viewerCleanup=()=>{};
let viewerCleanupJob;
function cleanupViewer() {
 if(viewerCleanupJob)return viewerCleanupJob;
 const cleanup=viewerCleanup,result=cleanup();
 if(!result?.then){if(viewerCleanup===cleanup)viewerCleanup=()=>{};return;}
 viewerCleanupJob=Promise.resolve(result).then(()=>{if(viewerCleanup===cleanup)viewerCleanup=()=>{};}).finally(()=>{viewerCleanupJob=null;});
 return viewerCleanupJob;
}
function openDialog(kind,data={}) {
 wallpaperUploadRevision++;
 const pendingCleanup=cleanupViewer();
 if(pendingCleanup?.then){pendingCleanup.then(()=>openDialog(kind,data)).catch(error=>toast(error.message));return;}
 if(kind!=='settings' || !dialog.open || dialogKind!=='settings')dialog.classList.toggle('settings-drawer',kind==='settings' && state.settings.settingsPresentation==='sidebar');
 desktopDrag?.cancel();
 hideSearchMenus(); $('#context-menu').hidden = true;
 if (!dialog.open) lastDialogFocus = document.activeElement;
 avatarRequestSequence++;
 if(kind!=='wallpaper')wallpaperLibrary.close();
 dialogKind = kind; dialogData = data;
 dialog.classList.toggle('widget-detail-dialog',kind==='widget-detail');
 const detailWidget = kind === 'widget-detail' ? state.items.find(item => item.id === data.item?.id)?.widget : null;
 dialog.classList.toggle('widget-app-dialog', !!detailWidget);
 dialog.classList.toggle('plugin-dialog', !!detailWidget);
 dialog.classList.remove('widget-app-expanded','workspace-expanded');
 dialog.classList.toggle('wallpaper-dialog',kind==='wallpaper');
 dialog.classList.toggle('bookmark-import-dialog',kind==='import-preview');
 dialog.classList.toggle('settings-dialog',kind === 'settings');
 dialog.classList.toggle('add-dialog',kind==='add');
 dialog.classList.toggle('workspace-dialog',['add','settings','wallpaper'].includes(kind));
 dialog.classList.toggle('site-editor-dialog',kind==='edit-item'&&state.items.find(i=>i.id===data.id)?.type==='link');
 dialog.classList.toggle('folder-dialog',kind==='folder');
 dialog.classList.toggle('folder-editor-dialog',kind==='edit-item'&&state.items.find(i=>i.id===data.id)?.type==='folder');
 document.body.classList.remove('shortcuts-open');
 $('#shortcuts-button').setAttribute('aria-expanded','false');
 let html = '';
 if (kind === 'add') html = addDialog(data.tab || 'widgets',data);
 else if (kind === 'widget-detail') { const item=state.items.find(i=>i.id===data.item?.id);if(!item)return;html=pluginWorkspace(item); }
 else if (kind === 'edit-item') { const item = state.items.find(i=>i.id===data.id); if (!item) return; html = item.type==='widget'?widgetConfigDialog(item):addDialog(item.type==='folder'?'folder':'link',{item}); }
 else if (kind === 'widget-config') html = widgetConfigDialog(state.items.find(i=>i.id===data.item?.id) || data.item);
 else if (kind === 'settings') html = settingsDialog(data.tab || 'general');
 else if (kind === 'sync-review') html = dialogHeader(t("确认同步桌面"),t("选择要保留的版本，确认后再应用。")) + syncController.renderReview(data.result);
 else if (kind === 'wallpaper') html = wallpaperDialog();
 else if (kind === 'group') html = groupDialog(data.id);
 else if (kind === 'local-search') { localScope = 'desktop'; localExtra=[]; html = localSearchDialog(); }
 else if (kind === 'folder') html = folderDialog(data.id);
 else if (kind === 'move') html = moveDialog(data.id);
 else if (kind === 'import-preview') html = importPreviewDialog(data.bookmarks);
 else if (kind === 'restore-preview') html = restorePreviewDialog(data.state);
 else if (kind === 'confirm') html = confirmDialog(data);
 else return;
 document.body.append($('#context-menu'));
 cancelLinkFaviconVisit();
 $('#dialog-content').innerHTML = html;
 dialog.setAttribute('aria-labelledby',['add','settings','wallpaper'].includes(kind)?'workspace-title':'dialog-title');
 if($('#dialog-description',dialog))dialog.setAttribute('aria-describedby','dialog-description');
 else dialog.removeAttribute('aria-describedby');
 if (!dialog.open) dialog.showModal();
 bindFaviconImages($('#dialog-content'));
 if(kind==='add' && data.tab==='sharing')viewerCleanup=bindSharing($('#add-content'),{getState:()=>state,apply:applyExchange});
 if((kind==='add' && ['widgets','community'].includes(data.tab||'widgets')) || (kind==='settings' && data.tab==='sources'))viewerCleanup=bindCommunity($('#dialog-content'),{getState:()=>state,apply:applyExchange,openSources:source=>openDialog('settings',{tab:'sources',source}),openCatalog:source=>openDialog('add',{tab:'widgets',source})},data);
 if(kind==='widget-detail')viewerCleanup=bindPluginWorkspace($('#dialog-content'),state.items.find(i=>i.id===data.item?.id),pluginHost());
 if(kind==='import-preview')viewerCleanup=bindBookmarkImport($('#dialog-content'),data.bookmarks,()=>state);
 if (kind==='settings') {renderAvatar();void populatePermissionOrigins(dialog);}
 if (kind==='wallpaper')void wallpaperLibrary.open();
 if ($('#link-form',dialog)) updateLinkPreview($('#link-form',dialog));
 if (kind==='local-search') { $('#local-query')?.focus(); renderLocalResults(''); }
 else if(['add','settings','wallpaper'].includes(kind))$('#workspace-title',dialog)?.focus({preventScroll:true});
 else if(['widget-detail','import-preview','folder','confirm','restore-preview','sync-review'].includes(kind))$('#dialog-title',dialog)?.focus({preventScroll:true});
 else $('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=color]):not([type=range]),select',dialog)?.focus();
}
async function closeDialog() {
 wallpaperUploadRevision++;
 cancelLinkFaviconVisit();
 const pendingCleanup=cleanupViewer();
 try{await pendingCleanup;}catch(error){toast(error.message);return;}
 viewerCleanup=()=>{};
 wallpaperLibrary.close(); avatarRequestSequence++;
 if(dialog.open) dialog.close(); dialogKind=''; dialogData={};
 if(lastDialogFocus?.isConnected)lastDialogFocus.focus();
}
function linkEditorForm(item){
 const value=item||{},color=value.color||COLORS[0],mode=value.iconMode||'auto';
 return `<form id="link-form" class="site-editor" data-id="${esc(value.id||'')}" data-original-url="${esc(value.url||'')}" data-original-mode="${esc(mode)}" data-original-icon="${esc(value.iconUrl||'')}" data-original-text="${esc(value.icon||'')}" data-original-title="${esc(value.title||'')}" data-icon-choice="${mode==='text'?'text':'current'}">
 <input name="iconMode" type="hidden" value="${esc(mode)}"><input name="iconUrl" type="hidden" value="${esc(value.iconUrl||'')}">
 <section class="editor-section" aria-label="${t("网站信息")}">
  <label class="field"><span>${t("网址")}</span><div class="address-control">${icon('link')}<input name="url" type="text" value="${esc(value.url||'')}" required maxlength="2048" placeholder="https://example.com" autocomplete="off" spellcheck="false"><button class="get-icon-button" type="button" data-action="extract-favicon">${t("获取图标")}</button></div></label><button type="button" class="text-button" data-action="permissions">${t('管理网站访问授权')}</button>
  ${field('title',t("名称"),value.title||'',{required:true,maxlength:120,placeholder:t("网站名称")})}
 </section>
 <section class="editor-section icon-section" aria-label="${t("图标样式")}">
  <div class="icon-choices" role="group" aria-label="${t("选择网站图标")}">
   <button type="button" class="icon-choice" data-icon-choice="current" aria-pressed="${mode!=='text'}"><span class="choice-art preview-icon" id="link-preview-icon" style="background:${esc(color)}">${siteGlyph(value)}</span><span>${t("当前图标")}</span><small>${t("保留现有")}</small></button>
   <button type="button" class="icon-choice" data-icon-choice="text" aria-pressed="${mode==='text'}"><span class="choice-art" data-text-icon-preview></span><span>${t("文字图标")}</span><small>${t("自定义文字")}</small></button>
   <span class="icon-result-list" data-icon-results></span>
   <button type="button" class="icon-choice icon-upload-choice" data-icon-choice="upload" aria-label="${t("上传本机图标")}"><span class="choice-art">${icon('plus')}</span><span>${t("上传")}</span><small>${t("本机图片")}</small></button>
  </div>
  <span hidden id="link-preview-title"></span><span hidden id="link-preview-url"></span>
  <p id="favicon-status" class="icon-status" role="status" aria-live="polite"></p><p id="favicon-quality" class="icon-status icon-quality-summary"></p>
  <div class="visit-icon-control"><button type="button" class="secondary-button" data-action="visit-favicon">${canVisitForFavicon()?t('访问网站取图标'):t('访问网站')}</button><p class="icon-status">${canVisitForFavicon()?t('直接获取失败时，可访问网站，等标签页显示图标后返回。'):t('读取标签页图标需要 Chrome / Edge 扩展版；网页版可上传本机图片。')}</p></div>
  <label class="field icon-text-field"><span>${t("图标文字")}</span><input name="icon" value="${esc(value.icon||value.title?.slice(0,2)||'')}" maxlength="8" placeholder="${t("例如：知、G、🌿")}"></label>
  <div class="field icon-color-field"><span>${t("图标颜色")}</span>${colorsHtml(color)}</div>
  <input type="file" id="site-icon-upload" accept="image/png,image/jpeg,image/webp" hidden>
 </section>
 <div class="editor-footer">${selectField('groupId',t("所在分组"),value.groupId||currentGroup().id,groupOptions())}${formActions(item?t("保存"):t("添加到桌面"))}</div>
 </form>`;
}
function addDialog(tab,data) {
 const item = data.item;
 const catalog = tab === 'sites', widgetCatalog = ['widgets','community'].includes(tab);
 let content = '';
 if (catalog) content = renderCatalog({state,sites:DEFAULT_STATE.items.filter(item=>item.type==='link'&&!item.folderId),renderSite:siteGlyph,siteMode:tab==='sites'});
 else if(tab==='sharing')content=sharingView(state,data.url||'');
 else if(['widgets','community'].includes(tab))content=communityView({catalogOnly:true});
 else if (tab === 'folder') content = `<form id="folder-form" data-id="${esc(item?.id || '')}">${field('title',t("文件夹名称"),item?.title || '',{required:true,maxlength:24,placeholder:t("例如：灵感收藏")})}${selectField('groupId',t("所在分组"),item?.groupId || currentGroup().id,groupOptions())}<p class="help-text">${t("把网站卡片拖到文件夹中央即可收纳。文件夹中可将网站移回桌面。")}</p>${formActions(item?t("保存文件夹"):t("创建文件夹"))}</form>`;
 else content = linkEditorForm(item);
 const head=item?(item.type==='folder'?compactDialogHeader(t("编辑文件夹")):dialogHeader(t("编辑图标"))):`<header class="add-header"><h2 id="workspace-title" tabindex="-1">${t('添加')}</h2>${catalog?renderCatalogToolbar({state,groupId:data.groupId||currentGroup().id}):widgetCatalog?communityToolbar(state,data.groupId||currentGroup().id):''}<div class="add-window-actions"><button class="workspace-expand" data-action="workspace-expand" aria-label="${t('切换窗口大小')}">${icon('maximize')}</button>${dialogCloseButton()}</div></header>`;
 if(item)return head+`<div class="dialog-body">${content}</div>`;
 const tabs=[{id:'widgets',name:t("小组件"),icon:'grid'},{id:'sites',name:t('网址导航'),icon:'globe'},{id:'link',name:t('自定义图标'),icon:'edit'},{id:'folder',name:t("文件夹"),icon:'folder'},{id:'sharing',name:t('分享与导入'),icon:'download'}];
 return head+`<div class="add-layout"><nav class="add-nav" role="tablist" aria-orientation="vertical" aria-label="${t("添加内容分类")}">${tabs.map(t=>`<button role="tab" aria-controls="add-content" aria-selected="${tab===t.id}" data-add-tab="${t.id}">${icon(t.icon)}<span>${t.name}</span></button>`).join('')}<p>${t("内容仅保存到你的桌面")}</p></nav><section id="add-content" class="add-content${catalog||widgetCatalog?' catalog-content':''}" role="tabpanel" aria-label="${tabs.find(t=>t.id===tab)?.name||t("网站")}">${content}</section></div><p class="add-feedback" data-add-feedback role="status" aria-live="polite" aria-atomic="true"></p>`;

}
function groupDialog(id) {
 const g = state.groups.find(g=>g.id===id);
 return dialogHeader(g?t("编辑分组"):t("添加分组"),t("按照工作、兴趣或生活，整理你的常用网站。")) + `<div class="dialog-body"><form id="group-form" data-id="${esc(g?.id || '')}">${field('name',t("分组名称"),g?.name || '',{required:true,maxlength:16,placeholder:t("例如：阅读")})}<div class="field"><span>${t("分组图标")}</span><input type="hidden" name="icon" value="${esc(g?.icon || 'home')}"><div class="icon-picker">${['home','code','design','product','ai','game','bookmark','heart','globe','coffee','note','folder'].map(k=>`<button type="button" data-group-icon="${k}" class="${k===(g?.icon || 'home')?'selected':''}" aria-label="${k}">${icon(k)}</button>`).join('')}</div></div>${formActions(g?t("保存分组"):t("创建分组"))}</form>${g&&state.groups.length>1?`<div class="button-row"><button class="danger-button" data-delete-group="${esc(g.id)}">${t("删除此分组")}</button></div>`:''}</div>`;
}
function settingSwitch(key,title,help='') { return `<label class="setting-row"><span class="setting-copy"><strong>${title}</strong>${help?`<small>${help}</small>`:''}</span><input type="checkbox" class="switch" data-setting="${key}" ${state.settings[key]?'checked':''} aria-label="${title}"></label>`; }
function settingRange(key,title,min,max,unit='px') { return `<div class="range-setting"><header><label for="range-${key}">${title}</label><output id="output-${key}">${state.settings[key]}${unit}</output></header><input id="range-${key}" type="range" min="${min}" max="${max}" value="${state.settings[key]}" data-range="${key}" data-unit="${unit}"></div>`; }

function preferenceSelect(key,title,options,help='') {
 return `<label class="setting-row"><span class="setting-copy"><strong>${title}</strong>${help?`<small>${help}</small>`:''}</span><select class="preference-select" data-preference="${key}" aria-label="${title}">${options.map(([value,label])=>`<option value="${value}" ${String(state.settings[key])===String(value)?'selected':''}>${label}</option>`).join('')}</select></label>`;
}
function settingColor(key,title) {
 return `<label class="setting-row"><span class="setting-copy"><strong>${title}</strong></span><span class="setting-color-value"><code id="color-value-${key}">${esc(state.settings[key])}</code><input type="color" class="color-input" data-setting-color="${key}" value="${esc(state.settings[key])}" aria-label="${title}"></span></label>`;
}
function settingsDialog(tab) {
 const s = state.settings;
 const dragChoices=[...new Set([100,200,400,600,1000,1500,2000,3000,s.dragHoldMs])].sort((a,b)=>a-b).map(value=>[value,`${value/1000} s`]);
 const tabs = [
  {id:'general',name:t("打开方式"),icon:'link'}, {id:'search',name:t("搜索栏"),icon:'search'},
  {id:'icons',name:t("图标"),icon:'grid'}, {id:'clock',name:t("时间 / 日期"),icon:'clock'},
  {id:'appearance',name:t("主题与材质"),icon:'sun'}, {id:'layout',name:t("布局"),icon:'move'},
  {id:'sidebar',name:t("侧边栏"),icon:'panel'}, {id:'sync',name:t("同步"),icon:'sync'},
  {id:'sources',name:t('组件源'),icon:'grid'}, {id:'permissions',name:t('授权管理'),icon:'shield'}, {id:'data',name:t("备份与恢复"),icon:'download'}, {id:'about',name:t("关于栖页"),icon:'info'}
 ];
 if (!tabs.some(item=>item.id===tab)) tab='general';
 let content = '';
 if (tab==='general') content = `
  ${preferenceSelect('language',t("语言 / Language"),[['auto',t("跟随浏览器")],['zh-CN',t("简体中文")],['en','English']])}
  <div class="section-label">${t("打开方式")}</div>
  ${settingSwitch('openNewTab',t("新标签页打开网站"),t("点击桌面图标时保留栖页。"))}
  ${settingSwitch('searchNewTab',t("新标签页打开搜索结果"),t("可独立于网站图标的打开方式设置。"))}
  ${settingSwitch('rememberGroup',t("记住上次打开的分组"),t("关闭后，每次打开栖页从第一个分组开始。"))}
  <div class="section-label">${t("桌面工具")}</div>
  ${preferenceSelect('dragHoldMs',t("长按拖动时间"),dragChoices,t("在小组件任意位置长按后拖动，默认 0.2 秒。"))}
  ${preferenceSelect('toolbarVisibility',t("右上角工具按钮"),[['always',t("始终显示")],['auto',t("自动隐藏")]],t("自动隐藏时，移入右上角或用键盘聚焦即可展开。"))}
  ${settingSwitch('showWallpaperButton',t("显示更换壁纸按钮"))}
  <div class="section-label">${t("快捷键")}</div>
  <div class="keyboard-list"><span>${t("聚焦搜索")}<kbd>/</kbd></span><span>${t("切换引擎")}<kbd>Tab / Shift Tab</kbd></span><span>${t("搜索桌面收藏")}<kbd>Ctrl / ⌘ K</kbd></span><span>${t("搜索桌面收藏")}<kbd>Ctrl / ⌘ F</kbd></span><span>${t("编辑桌面")}<kbd>E</kbd></span><span>${t("关闭 / 取消拖动")}<kbd>Esc</kbd></span></div>
  <p class="help-text">${t("Tab 切换仅在搜索框内生效。安装扩展后，Alt + C 可打开本地搜索；可在浏览器的扩展快捷键页面调整。")}</p>`;
 else if (tab==='search') content = `
  <div class="section-label">${t("搜索栏")}</div>
  ${settingSwitch('showSearch',t("显示搜索框"))}
  ${settingSwitch('pinSearch',t("滚动时固定搜索框"),t("与时间分别设置，滚动桌面也能继续搜索。"))}
  ${settingRange('searchWidth',t("宽度"),360,960)}
  ${settingRange('searchHeight',t("高度"),36,64)}
  ${settingRange('searchRadius',t("圆角"),0,50)}
  ${settingRange('searchOpacity',t("透明度"),20,100,'%')}
  <p class="help-text">${t("100% 为完全不透明。位置可在“布局”中调整，材质可在“主题与材质”中选择。")}</p>
  ${settingSwitch('showSearchHistory',t("保存最近搜索"),t("仅在本机记录最近 20 条。关闭后停止记录，也不再显示。"))}
  <div class="button-row"><button class="secondary-button" data-action="clear-search-history">${t("清除最近搜索")}</button></div>
  <div class="section-label">${t("搜索引擎")}</div>
  ${selectField('searchEngine',t("默认搜索引擎"),s.searchEngine,allEngines().map(e=>({value:e.id,label:e.name})))}
  <button type="button" class="text-button" data-action="permissions">${t('管理网站访问授权')}</button><div>${allEngines().map(e=>`<div class="engine-list-row">${engineGlyph(e)}<div class="engine-list-copy"><strong>${esc(e.name)}</strong><small>${esc(e.url)}</small></div><button type="button" class="engine-extract-button" data-extract-engine-icon="${esc(e.id)}" aria-label="${t("提取{v0}图标", {v0: esc(e.name)})}">${t("提取图标")}</button>${s.customEngines.some(x=>x.id===e.id)?`<button data-delete-engine="${esc(e.id)}" aria-label="${t("删除{v0}", {v0: esc(e.name)})}">${icon('trash')}</button>`:''}</div>`).join('')}</div>
  <div class="section-label">${t("自定义引擎")}</div><form id="engine-form">
  ${field('name',t("引擎名称"),'',{required:true,maxlength:20,placeholder:t("例如：我的搜索")})}
  ${field('url',t("搜索地址模板"),'',{required:true,maxlength:2048,placeholder:'https://example.com/search?q={q}',help:t("用 {q} 代表关键词。支持 http 和 https 地址。")})}
  <div id="form-error" class="inline-error" hidden></div><div class="button-row"><button class="primary-button" type="submit">${t("{v0}添加引擎", {v0: icon('plus')})}</button></div></form>`;
 else if(tab==='icons') content = `
  <div class="icon-settings-preview" aria-label="${t("图标外观预览")}">${Array.from({length:3},()=>`<div class="tile tile-link" data-size="1x1" style="--tile-color:#102B3C"><span class="tile-body"><span class="site-visual is-loaded"><img class="site-favicon" src="icons/qiye-icon.svg" alt="" draggable="false"></span></span><span class="tile-label">${t("栖页")}</span></div>`).join('')}</div>
  <div class="section-label">${t("网站图标与卡片")}</div>
  ${settingRange('gridSize',t("图标大小"),48,120)}
  ${settingSwitch('autoExtractIcons',t("自动补充高清图标"),t("图标模糊或加载失败时，尝试获取更清晰的版本。"))}
  ${preferenceSelect('iconShape',t("图标形状"),[['rounded',t("统一圆角正方形")],['original',t("保留原始轮廓")]],t("统一外框，不拉伸网站标志；圆角只作用于图标，不再挤压小组件。"))}
  ${preferenceSelect('iconBackdrop',t("图标底色"),[['adaptive',t("轻量自适应底色")],['none',t("透明 · 不额外添加底色")]],t("图片自身的白底保留，不自动去白或重绘品牌标志。"))}
  ${settingRange('radius',t("图标圆角"),0,48)}
  ${settingRange('iconOpacity',t("图标不透明度"),20,100,'%')}
  ${settingRange('gap',t("图标间距"),8,40)}
  ${settingSwitch('showLabels',t("显示图标名称"))}
  ${settingRange('labelSize',t("名称字号"),10,20)}
  ${settingColor('labelColor',t("名称颜色"))}
  ${settingSwitch('showAddTile',t("在网格中显示添加按钮"),t("也可以使用右上角 +，或在桌面空白处右键添加。"))}
  <p class="help-text">${t("右键网站 → 编辑 → 获取图标，可重新选择图标。")}</p>`;
 else if(tab==='clock') content = `
  <div class="section-label">${t("时间")}</div>
  ${settingSwitch('showClock',t("显示时间"))}
  ${settingSwitch('pinClock',t("滚动时固定时间"),t("时间与日期共同固定，独立于搜索框设置。"))}
  ${settingSwitch('showSeconds',t("显示秒数"),t("统一显示 HH:MM:SS，字号、字重与颜色完全一致。"))}
  ${settingSwitch('hour12',t("使用 12 小时制"))}
  ${settingRange('clockSize',t("时钟字号"),30,160)}
  ${settingRange('clockWeight',t("时钟字重"),200,700,'')}
  ${settingColor('clockColor',t("时间颜色"))}
  <div class="section-label">${t("日期")}</div>
  ${settingSwitch('showDate',t("显示月日"))}
  ${settingSwitch('showWeekday',t("显示星期"))}
  ${settingSwitch('showLunar',t("显示农历"))}
  <p class="help-text">${t("点击时间可切换极简模式。字体在“主题与材质”中设置，位置在“布局”中设置。")}</p>`;
 else if(tab==='appearance') content = `
  <div class="section-label">${t("主题")}</div>
  <div class="theme-options">${[{id:'light',title:t("浅色"),icon:'sun'},{id:'dark',title:t("深色"),icon:'moon'},{id:'auto',title:t("跟随系统"),icon:'globe'}].map(t=>`<button class="theme-option ${s.theme===t.id?'selected':''}" data-theme="${t.id}" aria-pressed="${s.theme===t.id}">${icon(t.icon)}${t.title}</button>`).join('')}</div>
  ${settingSwitch('useThemeColor',t("全局使用主题色"),t("统一用于时间、导航、按钮和组件；关闭后使用默认配色。"))}
  ${settingColor('themeColor',t("主题色"))}
  <div class="section-label">${t("界面材质")}</div>
  <div class="material-options">${[
   ['solid',t("纯色"),t("清爽的色块表面")],['glass',t("毛玻璃"),t("通透、柔和的背景模糊")],
   ['acrylic',t("亚克力"),t("细微纹理与磨砂层次")],['mica',t("Mica 风格"),t("柔和着色，无背景模糊")]
  ].map(([value,name,description])=>`<button class="material-option ${s.surfaceStyle===value?'selected':''}" data-material="${value}" aria-pressed="${s.surfaceStyle===value}"><span class="material-swatch swatch-${value}"></span><strong>${name}</strong><small>${description}</small></button>`).join('')}</div>
  ${settingRange('surfaceOpacity',t("面板透明度"),20,100,'%')}
  ${settingRange('surfaceBlur',t("模糊强度"),0,24)}
  <p class="help-text">${t("侧栏与搜索框可单独设置透明度。纯色和 Mica 风格不使用背景模糊；Mica 风格为网页中的柔和着色效果。")}</p>
  ${settingSwitch('reducedEffects',t("减少视觉效果"),t("关闭面板模糊和过渡动画，使用更实的底色。"))}
  <div class="section-label">${t("字体")}</div>
  ${preferenceSelect('uiFont',t("界面字体"),[['inter',t("Inter + 系统中文")],['system',t("系统字体")]],t("Inter 随扩展提供；中文使用设备上的系统字体。"))}
  ${settingRange('uiScale',t("界面文字比例"),85,120,'%')}
  ${preferenceSelect('settingsPresentation',t('设置打开方式'),[['sidebar',t('侧边面板')],['window',t('居中窗口')]],t('关闭设置后重新打开生效。'))}
  ${preferenceSelect('windowSize',t('窗口大小'),WINDOW_SIZES.map(size=>[String(size),`${size}%`]),t('调整窗口可用空间，内容自动重新排版，文字和控件保持清晰。'))}
  <div class="button-row"><button class="secondary-button" data-action="wallpaper">${t("{v0}壁纸与背景", {v0: icon('wallpaper')})}</button></div>`;
 else if(tab==='layout') content = `
  <div class="section-label">${t("时间与搜索的滚动方式")}</div>
  <label class="setting-row"><span class="setting-copy"><strong>${t("顶部区域")}</strong><small>${t("随内容上滑消失，或固定在独立区域；固定时图标不会从下方穿过。")}</small></span><select data-header-mode aria-label="${t("顶部区域滚动方式")}"><option value="scroll" ${!s.pinClock&&!s.pinSearch?'selected':''}>${t("随内容滚动")}</option><option value="fixed" ${s.pinClock&&s.pinSearch?'selected':''}>${t("固定时间和搜索")}</option>${s.pinClock!==s.pinSearch?`<option value="mixed" selected>${t("分别设置")}</option>`:''}</select></label>
  <div class="section-label">${t("桌面布局")}</div>
  ${settingSwitch('minimal',t("极简模式"),t("只显示时间、搜索与壁纸；按 Esc 可恢复桌面。"))}
  ${settingSwitch('showWallpaperCredit',t("显示壁纸作者"),t("图片来源和许可仍可在壁纸预览中查看。"))}
  ${settingSwitch('quote',t("显示页底短句"),t("固定在底部；每次打开或刷新页面时获取一言，点击句子复制，悬停可换一句或搜索。"))}
  ${settingSwitch('hideScrollbar',t("隐藏内容区滚动条"),t("只隐藏轨道，滚轮、触屏、Page Down 和空格仍可滚动。"))}
  ${settingSwitch('hideEditorScrollbar',t("隐藏网站编辑窗口滚动条"),t("同时用于添加网站表单；仅隐藏轨道，内容仍可滚动，与桌面滚动条独立。"))}
  ${settingSwitch('animateGroups',t("分组切换动画"),t("图标从下方向上轻滑入场。遵循系统的减少动态效果设置。"))}
  ${settingRange('desktopMaxWidth',t("内容最大宽度"),720,2000)}
  <div class="section-label">${t("时间位置")}</div>
  ${settingRange('clockOffsetX',t("时间水平偏移"),-30,30,'vw')}
  ${settingRange('clockOffsetY',t("时间垂直偏移"),-60,160)}
  <div class="section-label">${t("搜索框位置")}</div>
  ${settingRange('searchOffsetX',t("搜索水平偏移"),-30,30,'vw')}
  ${settingRange('searchOffsetY',t("搜索垂直偏移"),-40,160)}
  <p class="help-text">${t("水平偏移以窗口宽度为基准，窄屏会自动限制在可见区域。垂直偏移调整排版间距，并保留最小间隔以避免重叠；固定后保留当前位置，在下方独立滚动桌面。")}</p>
  <div class="button-row"><button class="secondary-button" data-action="reset-positions">${t("恢复默认位置")}</button></div>`;
 else if(tab==='sidebar') content = `
  <div class="section-label">${t("头像与设置入口")}</div>
  <div class="avatar-panel" id="avatar-panel"><div class="avatar-row"><span id="avatar-preview" class="avatar-preview"></span><div><strong>${t("用一张喜欢的图作头像")}</strong><p>${t("PNG、JPEG、WebP，最大 4 MB。自动裁切成正方形。")}</p><div class="button-row"><button class="secondary-button" data-action="upload-avatar">${t("{v0}选择图片", {v0: icon('upload')})}</button><button class="text-button" data-action="reset-avatar">${t("恢复默认图标")}</button></div></div></div><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p class="help-text" id="avatar-status" role="status">${t("头像保存在本机，并随桌面备份与 WebDAV 同步。点击头像即可打开设置。")}</p></div>
  <div class="section-label">${t("导航形式")}</div>
  ${preferenceSelect('navigationMode',t("导航布局"),[['sidebar',t("侧边栏")],['top',t("顶部导航")]])}
  ${preferenceSelect('sidebarPosition',t("侧边栏位置"),[['left',t("左侧")],['right',t("右侧")]],t("左右位置仅用于侧边栏布局。"))}
  ${preferenceSelect('sidebarVisibility',t("导航显示方式"),[['always',t("始终显示")],['auto',t("自动隐藏")],['hidden',t("收起")]],t("收起后可点击边缘的展开按钮；自动隐藏支持鼠标移入与键盘聚焦。"))}
  ${settingRange('sidebarWidth',t("侧边栏宽度"),40,120)}
  ${settingRange('sidebarOpacity',t("导航透明度"),0,100,'%')}
  ${settingSwitch('sidebarLabels',t("显示分组名称"))}
  ${preferenceSelect('sidebarWheelMode',t("侧栏滚轮行为"),[['scroll',t("滚动分组列表")],['switch',t("切换当前分组")]],t("默认仅滚动导航列表以查看被遮挡的分组，不会切换桌面。编辑时始终滚动列表。"))}
  <p class="help-text">${t("分组支持右键重命名和编辑图标；编辑桌面时可拖动调整分组顺序。")}</p>`;
 else if(tab==='data') content = `
  <div class="data-card"><div><strong>${t("导出完整备份")}</strong><p>${t("包含网址、分组、布局、头像、组件数据和本地壁纸。")}</p></div><button class="secondary-button" data-action="export">${t("{v0}导出 JSON", {v0: icon('download')})}</button></div>
  <div class="data-card"><div><strong>${t("恢复已有备份")}</strong><p>${t("导入前可查看内容摘要，确认后替换当前桌面。")}</p></div><button class="secondary-button" data-action="import">${t("{v0}导入备份", {v0: icon('upload')})}</button></div>
  <div class="data-card"><div><strong>${t("导入浏览器书签")}</strong><p>${t("选择要复制到当前分组的网站，保留原有书签。")}</p></div><button class="secondary-button" data-action="import-bookmarks">${t("{v0}选择书签", {v0: icon('bookmark')})}</button>${permissionControl({permissions:['bookmarks']})}</div>
  <p class="help-text">${t("无需注册账号。跨设备可连接自己的 WebDAV；备份不包含 WebDAV 密码、最近搜索或网站图标缓存。")}</p>
  <div class="section-label">${t("重置设置")}</div>
  <div class="data-card"><div><strong>${t("恢复默认设置")}</strong><p>${t("还原显示、搜索、头像与壁纸偏好，保留网站、分组和组件内容。")}</p></div><button class="secondary-button" data-action="reset-preferences">${t("重置设置")}</button></div>
  <div class="button-row"><button class="danger-button" data-action="reset">${t("恢复初始桌面")}</button></div>`;
 else if(tab==='permissions') content = permissionsPanel();
 else if(tab==='sources') content = communityView();
 else if(tab==='sync') content = syncController.renderPanel();
 else content = `
  <div class="about-block"><img class="brand-mark" src="icons/qiye-icon.svg" alt="" width="66" height="66" draggable="false"><h3>${t("栖页 Qiye")}</h3><p>${t("专注效率与个性化的浏览器新标签页")}</p><span class="version-badge">${t("v{version} · GPL-3.0", {version: APP_VERSION})}</span></div>
  <div class="about-features"><div>${t("{icon}桌面编排", {icon: icon('grid')})}</div><div>${t("{icon}快捷搜索", {icon: icon('search')})}</div><div>${t("{icon}组件扩展", {icon: icon('layers')})}</div></div>
  ${extensionUpdatePanel()}
  <p class="about-note">${t("栖页是一款面向 Chrome 与 Edge 的开源新标签页扩展，集成网站导航、多引擎搜索与可扩展小组件。通过分组、灵活布局与主题定制，为工作和日常浏览提供有序的起点。")}</p>
  <p class="about-note">${t("桌面内容与设置默认保存在当前浏览器，支持 JSON 备份、恢复与 WebDAV 跨设备同步。小组件通过组件源按需启用；网站图标与在线服务会连接相应提供方。")} <a href="https://github.com/Ktclat/qiye/blob/main/docs/PRIVACY.md" target="_blank" rel="noopener noreferrer">${t("隐私说明")}</a></p>
  <p class="about-note">${t("Copyright © 2026 Ktclat and Qiye contributors. 本项目采用 GNU GPLv3 许可证。")}<a href="https://github.com/Ktclat/qiye/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${t("完整许可证")}</a> · <a href="https://github.com/Ktclat/qiye/blob/main/docs/README.md" target="_blank" rel="noopener noreferrer">${t("项目文档")}</a></p>
  <p class="about-note">${t("界面采用 Inter 与系统字体。Inter 以 SIL Open Font License 1.1 授权，随项目本地提供。")}</p>
  <div class="button-row"><a class="secondary-button" href="https://github.com/Ktclat/qiye" target="_blank" rel="noopener noreferrer">${t("{v0}源代码", {v0: icon('github')})}</a><a class="secondary-button" href="https://github.com/Ktclat/qiye/blob/main/docs/THIRD_PARTY.md" target="_blank" rel="noopener noreferrer">${t("字体与许可")}</a></div>`;
 const current = tabs.find(item=>item.id===tab);
 return workspaceDialogHeader(t("设置"),current.name) + `
 <div class="settings-layout"><nav class="settings-nav" aria-label="${t("设置分类")}">${tabs.map(t=>`<button class="settings-nav-button ${t.id===tab?'active':''}" data-settings-tab="${t.id}" ${t.id===tab?'aria-current="page"':''}>${icon(t.icon)}<span>${t.name}</span></button>`).join('')}<small>${t("栖页 Qiye · {v0}", {v0: APP_VERSION})}</small></nav>
 <section class="settings-content" aria-label="${t("{v0}设置", {v0: current.name})}">${content}</section></div>`;
}
const wallpaperLibrary = createWallpaperLibrary({
 getState:()=>state, wallpapers:WALLPAPERS, toast,
 rerender:()=>{
  if(dialogKind!=='wallpaper'||!dialog.open)return;
  const content=$('.wallpaper-content',dialog),nav=$('.wallpaper-nav',dialog);
  const focused=dialog.contains(document.activeElement)?document.activeElement:null;
  const focusData=focused?.dataset?Object.entries(focused.dataset).find(([key])=>key.startsWith('gallery')):null;
  const view=wallpaperLibrary.getState(),key=[view.tab,view.page,view.preview?.index??view.preview?.id??''].join('|');
  const y=content?.scrollTop||0,n=nav?.scrollTop||0,previous=dialog.dataset.galleryView;
  $('#dialog-content').innerHTML=wallpaperDialog();dialog.dataset.galleryView=key;
  if(previous===key&&$('.wallpaper-content',dialog))$('.wallpaper-content',dialog).scrollTop=y;
  if($('.wallpaper-nav',dialog))$('.wallpaper-nav',dialog).scrollTop=n;
  if(focusData&&!dialog.classList.contains('pointer-focus')){
   const [key,value]=focusData;
   const replacement=[...dialog.querySelectorAll('button')].find(button=>button.dataset[key]===value);
   (replacement||$('[data-gallery-back]',dialog)||$('[data-gallery-tab="custom"]',dialog))?.focus({preventScroll:true});
  }
  else if(focused?.id==='workspace-title')$('#workspace-title',dialog)?.focus({preventScroll:true});
 },
 enable:async()=>{state.settings.wallpaperApiEnabled=true;await persist();applySettings();},
 apply:applyOnlineWallpaper,
 local:{
  load:async()=>{let current=null,error='';try{current=await localWallpapers.remember(state.settings.customWallpaper,state.settings.customWallpaperType);}catch(e){error=e.message;}return {rows:await localWallpapers.list(),currentId:current?.id||null,error};},
  apply:async(row,{isCurrent})=>{const current=wallpaperRequest(),applied=await storeLocalWallpaper(row.blob,row.type,()=>isCurrent()&&current(),row.name);if(applied)toast(t('本地壁纸已保存。'));return applied;},
  remove:removeLocalWallpaper
 },
 renderCustom:()=>`<div class="gallery-intro"><p>${t('上传记录仅保存在此浏览器；当前选用的背景随备份与 WebDAV 同步。')}</p></div><button class="upload-zone local-wallpaper-upload" data-action="upload-wallpaper">${icon('upload')}<span><strong>${t('选择本地图片或视频')}</strong><small>${t('不上传到栖页服务器')}</small></span></button><p class="help-text local-wallpaper-help">${t('静态 PNG、JPEG、WebP 最多 32 MiB，自动压缩至 4 MiB 内；GIF、AVIF、MP4、WebM 须小于 4 MiB。')}</p>`,
 renderParameters:()=>`<p class="help-text">${t("参数独立于图库，修改后立即预览并保存。")}</p>${settingRange('blur',t("背景模糊"),0,20)}${settingRange('dim',t("背景暗度"),0,70,'%')}${settingSwitch('dailyWallpaper',t("每日轮换内置背景"),t("手动选择的本地或在线壁纸优先显示。"))}${settingSwitch('wallpaperApiEnabled',t("允许公开图片 API"),t("只在手动选择在线来源时加载图片清单。关闭后恢复内置或本地背景。"))}`
});
function wallpaperDialog() {
 const {tab}=wallpaperLibrary.getState(),context=tab==='parameters'?t('参数设置'):t(WALLPAPER_SOURCES.find(source=>source.id===tab)?.name||'壁纸库');
 return workspaceDialogHeader(t('壁纸库'),context)+wallpaperLibrary.render();
}

function widgetConfigDialog(item) {
 return dialogHeader(t('设置组件'))+`<div class="dialog-body"><form id="widget-form" data-id="${esc(item.id)}">${field('title',t('名称'),item.title,{required:true,maxlength:120})}${selectField('size',t('卡片尺寸'),item.size,(item.config?.manifest?.sizes||TILE_SIZES).map(value=>({value,label:sizeLabel(value)})))}<p>${t('组件功能设置请在组件窗口内打开。')}</p>${formActions()}</form></div>`;
}
function localSearchDialog() { return dialogHeader(t("搜索我的桌面"),t("快速找到收藏。搜索浏览历史时输入关键词，再按 Enter 或点击搜索。"))+`<div class="dialog-body"><div class="local-search-input"><input id="local-query" class="text-input" placeholder="${t("搜索名称或网址…")}" aria-label="${t("本地搜索关键词")}" autocomplete="off"><button class="secondary-button" data-action="query-local">${t("{v0}搜索", {v0: icon('search')})}</button></div><div class="search-scope"><button class="scope-button active" data-scope="desktop">${t("桌面收藏")}</button><button class="scope-button" data-scope="bookmarks">${t("浏览器书签")}</button><button class="scope-button" data-scope="history">${t("浏览历史")}</button></div><div class="local-permission-controls"><span>${t('浏览器书签')}${permissionControl({permissions:['bookmarks']})}</span><span>${t('浏览历史')}${permissionControl({permissions:['history']})}</span></div><div id="local-results" class="local-results"></div></div>`; }
function renderLocalResults(query) {
 const target=$('#local-results'); if(!target) return;
 const q=query.trim().toLocaleLowerCase();
 const result = (localScope==='desktop'?findItems(q):localExtra.filter(i=>`${i.title} ${i.url}`.toLocaleLowerCase().includes(q))).slice(0,50);
 target.innerHTML = result.length ? result.map(i=>`<button class="suggestion" data-url="${esc(i.url)}"><span class="suggestion-site" style="--tile-color:${esc(i.color || COLORS[0])};--tile-ink:${tileInk(i.color)}">${siteGlyph(i)}</span><span><strong>${esc(i.title || i.url)}</strong><small>${esc(i.url)}</small></span><span class="suggestion-arrow">↗</span></button>`).join('') : `<div class="local-empty">${q?t("没有找到匹配的网站。"):t("这里还没有可显示的内容。")}<br>${t("试试另一个关键词，或切换搜索范围。")}</div>`;
 bindFaviconImages(target);
}
async function chooseLocalScope(scope) {
 localScope=scope; localExtra=[]; $$('.scope-button',dialog).forEach(b=>b.classList.toggle('active',b.dataset.scope===scope));
 const token=++searchToken, query=$('#local-query')?.value || '';
 if(scope==='desktop') return renderLocalResults(query);
 if(scope==='history' && !query.trim()) { $('#local-results').innerHTML=`<div class="local-empty">${t("输入关键词，再按 Enter 或点击搜索。")}<br>${t("首次查询时，浏览器会询问是否允许读取历史记录。")}</div>`; $('#local-query').focus(); return; }
 $('#local-results').innerHTML = `<div class="local-empty">${t("正在读取，请在浏览器提示中选择是否授权…")}</div>`;
 try { const rows = scope==='bookmarks' ? await requestBookmarks() : await searchHistory(query); if(token!==searchToken || !$('#local-results'))return; localExtra=rows; renderLocalResults($('#local-query')?.value || ''); }
 catch(err) { if(token!==searchToken || !$('#local-results'))return; $('#local-results').innerHTML = `<div class="local-empty">${esc(err.message)}<br><button class="secondary-button" data-scope="${scope}">${t("重新尝试")}</button></div>`; }
}
function folderDialog(id) {
 const folder=state.items.find(i=>i.id===id); if(!folder)return compactDialogHeader(t("文件夹已移除"));
 const items=state.items.filter(i=>i.folderId===id);
 const count=`<span class="folder-count">${t("{count} 个网站",{count:items.length})}</span>`;
 const edit=`<button class="folder-edit" data-edit-item="${esc(id)}" aria-label="${t("编辑文件夹")}" title="${t("编辑文件夹")}">${icon('edit')}</button>`;
 return compactDialogHeader(folder.title,count,edit) + `<div class="folder-content">${items.length?`<ul class="folder-grid">${items.map(i=>`<li class="folder-item" data-folder-item="${esc(i.id)}"><a class="folder-link" data-open-link="${esc(i.id)}" href="${esc(i.url)}" target="${state.settings.openNewTab?'_blank':'_self'}" rel="noopener noreferrer" style="--tile-color:${esc(i.color)}" aria-label="${t("打开{v0}", {v0: esc(i.title)})}" title="${esc(i.title)}"><span class="folder-site" aria-hidden="true">${siteGlyph(i)}</span><span class="folder-label">${esc(i.title)}</span></a></li>`).join('')}</ul>`:`<div class="folder-empty">${icon('folder')}<strong>${t("文件夹还是空的。")}</strong><p>${t("把网站拖到这个文件夹中央即可收纳。")}</p></div>`}</div>${items.length?`<p class="folder-hint">${t("右键或 Shift+F10 编辑、移动网站")}</p>`:''}`;
}
function moveDialog(id) {
 const item=state.items.find(i=>i.id===id);if(!item)return '';
 const folders=state.items.filter(i=>i.type==='folder'&&i.id!==id);
 return dialogHeader(t("移动「")+item.title+'」')+`<div class="dialog-body"><form id="move-form" data-id="${esc(id)}">${selectField('groupId',t("目标分组"),item.groupId,groupOptions())}${item.type==='link'?selectField('folderId',t("放入文件夹"),item.folderId || '',[{value:'',label:t("直接放在分组桌面")},...folders.map(i=>({value:i.id,label:`${state.groups.find(g=>g.id===i.groupId)?.name || ''} / ${i.title}`}))]):''}<p class="help-text">${t("选择文件夹时，将使用该文件夹所在的分组。")}</p>${formActions(t("移动"))}</form></div>`;
}
function importPreviewDialog(bookmarks) {return bookmarkImportView(bookmarks,state.groups,currentGroup().id);}
function restorePreviewDialog(restored) { return dialogHeader(t("恢复备份"),t("请先确认备份内容。恢复后会替换当前桌面。"))+`<div class="dialog-body"><div class="about-features"><div><strong>${restored.groups.length}</strong><p>${t("个分组")}</p></div><div><strong>${restored.items.length}</strong><p>${t("个桌面项目")}</p></div><div><strong>${widgetContentSummary(restored.items).todos}</strong><p>${t("条待办")}</p></div></div><p class="help-text">${t("备份中的网址、便签、组件设置和壁纸将一并恢复。可以先导出当前桌面，保留一份副本。")}</p>${restored.items.some(i=>i.widget==='weather'&&i.config.enabled)?`<p class="help-text">${t("此备份已开启天气。恢复后会将「{v0}」的城市坐标发送至所选天气源获取预报。", {v0: esc(restored.items.filter(i=>i.widget==='weather'&&i.config.enabled).map(i=>i.config.city.name).join(', '))})}</p>`:''}<div class="button-row"><button class="secondary-button" data-action="export">${t("先备份当前桌面")}</button><button class="primary-button" data-action="confirm-restore">${t("确认恢复")}</button></div></div>`; }
function confirmDialog(data) { return dialogHeader(data.title)+`<div class="dialog-body"><p class="help-text">${esc(data.message)}</p><div class="button-row"><button class="secondary-button" data-close>${t("取消")}</button><button class="danger-button" data-action="confirm-callback">${esc(data.label || t("确认"))}</button></div></div>`; }

let catalogFeedbackTimer;
function catalogFeedback(message, failed = false) {
 const feedback=$('[data-add-feedback]',dialog);
 if(!feedback)return;
 clearTimeout(catalogFeedbackTimer);
 feedback.textContent=message;feedback.classList.toggle('is-error',failed);
 catalogFeedbackTimer=setTimeout(()=>{feedback.textContent='';},failed?9000:4500);
}
async function addCatalogItem(item, button, message) {
 if(button.getAttribute('aria-disabled')==='true')return;
 const session=dialogData;
 button.setAttribute('aria-disabled','true');button.setAttribute('aria-busy','true');
 catalogFeedback('');
 try {
  state.items.push(item);state.activeGroupId=item.groupId;await commit();
  if(dialog.open && dialogKind==='add' && dialogData===session)catalogFeedback(message);
 } catch(error) {
  if(dialog.open && dialogKind==='add' && dialogData===session)catalogFeedback(error.message||t('保存失败，请再试一次。'),true);
  throw error;
 } finally {
  button.removeAttribute('aria-disabled');button.removeAttribute('aria-busy');
 }
}
async function addWidget(type, button) {
 const w=widgetCatalog.find(x=>x.type===type); if(!w)return;
 const selectedSize=$(`[data-catalog-widget="${type}"]`,dialog)?.dataset.previewSize;
 const data=newWidgetData(type);
 const groupId=$('#catalog-group',dialog)?.value||currentGroup().id;
 const item={id:uid(),groupId,type:'widget',widget:type,title:t(w.title),size:w.sizes.includes(selectedSize)?selectedSize:w.size,config:newWidgetConfig(type),data};
 if(button)return await addCatalogItem(item,button,t('已添加{v0}，右键可调整设置。',{v0:t(w.title)}));
 state.items.push(item);state.activeGroupId=groupId;await commit();closeDialog();toast(`${t("已添加{v0}，右键可调整设置。", {v0: t(w.title)})}`);
}
async function removeItem(id) {
 const item=state.items.find(i=>i.id===id); if(!item)return;
 const removed=clone(item), oldIndex=state.items.indexOf(item), childIds=state.items.filter(i=>i.folderId===id).map(i=>i.id);
 if(item.type==='folder')state.items.forEach(i=>{if(i.folderId===id)i.folderId=null;});
 state.items=state.items.filter(i=>i.id!==id); await commit();
 toast(item.type==='folder'?t("文件夹已移除，里面的网站已移回桌面。"):`${t("已移除{v0}", {v0: item.title})}`,async()=>{
  if(!state.groups.some(g=>g.id===removed.groupId))removed.groupId=currentGroup().id;
  if(removed.folderId&&!state.items.some(i=>i.id===removed.folderId))removed.folderId=null;
  if(!state.items.some(i=>i.id===removed.id))state.items.splice(Math.min(oldIndex,state.items.length),0,removed);
  if(removed.type==='folder')state.items.forEach(i=>{if(childIds.includes(i.id)&&!i.folderId&&i.groupId===removed.groupId)i.folderId=removed.id;});
  await commit();toast(t("已撤销移除。"));
 });
}
async function moveItem(id,targetGroup,folderId=null,renderOptions={}) {
 const item=state.items.find(i=>i.id===id); if(!item)return;
 item.groupId=targetGroup;if(item.type==='link')item.folderId=folderId;
 if(item.type==='folder')state.items.forEach(i=>{if(i.folderId===id)i.groupId=targetGroup;});
 await commit(true,renderOptions);
}
function exportBackup(source=state) {
 const data=exportState(source);const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`Qiye-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast(t("备份已导出。"));
}
async function importBookmarks(button) {
 if(button)button.disabled=true;
 try { const bookmarks=await requestBookmarks({includeFolders:true}); if(!bookmarks.length)return toast(t("浏览器中没有可导入的 http / https 书签。")); openDialog('import-preview',{bookmarks}); }
 catch(err){toast(err.message);}
 finally{if(button?.isConnected)button.disabled=false;}
}
function contextButton(action,label,glyph='grid',extra='') { return `<button role="menuitem" data-context="${action}" ${extra}>${icon(glyph)}${label}</button>`; }
function openContext(event,{itemId,groupId}={}) {
 event.preventDefault(); hideSearchMenus();
 const menu=$('#context-menu');(dialog.open ? dialog : document.body).append(menu);menu.dataset.item=itemId || '';menu.dataset.group=groupId || '';
 const item=state.items.find(i=>i.id===itemId),group=state.groups.find(g=>g.id===groupId);
 let html;
 if(item) {
  const sizes=item.type==='link'?[]:item.widget==='community'?item.config.manifest.sizes:item.type==='widget'?getWidgetDefinition(item.widget).sizes:TILE_SIZES;
  const resize=sizes.length?`<hr><div class="menu-label">${t("卡片尺寸")}</div><div class="size-options">${sizes.map(s=>`<button data-context="resize" data-size="${s}" class="${item.size===s?'selected':''}">${sizeLabel(s)}</button>`).join('')}</div>`:'';
  html = `${contextButton('edit',t("编辑")+(item.type==='widget'?t("组件"):item.type==='folder'?t("文件夹"):t("网站")),'edit')}${contextButton('move',t("移动到…"),'move')}${contextButton('duplicate',t("复制一份"),'copy')}${resize}<hr>${contextButton('delete',t("移除"),'trash','class="danger"')}`;
 }
 else if(group)html=`${contextButton('edit-group',t("编辑分组"),'edit')}${state.groups.length>1?contextButton('delete-group',t("删除分组"),'trash','class="danger"'):''}`;
 else html=`${contextButton('add-link',t("添加网站"),'link')}${contextButton('add-widget',t("添加组件"),'grid')}${contextButton('add-folder',t("新建文件夹"),'folder')}<hr>${contextButton('edit-desktop',editing?t("完成编辑"):t("编辑桌面"),'edit')}${contextButton('wallpaper',t("更换壁纸"),'wallpaper')}${contextButton('local-search',t("本地搜索"),'search')}<hr>${contextButton('export',t("立即备份"),'download')}${contextButton('settings',t("设置"),'settings')}`;
 menu.getAnimations().forEach(animation=>animation.cancel());
 if(item?.type==='widget')html=contextButton('widget-open',t('打开组件'),'grid')+pluginMenu(item.id).map(entry=>contextButton('widget-command',esc(entry.label),entry.icon,`data-command="${esc(entry.id)}"`)).join('')+contextButton('permissions',t('授权管理'),'shield')+'<hr>'+html;
 menu.innerHTML=html;menu.hidden=false;
 for(const button of menu.querySelectorAll('button')){button.setAttribute('role','menuitem');button.tabIndex=-1;}
 menu.querySelector('button')?.focus({preventScroll:true});
 const scale=dialog.open?(Number(getComputedStyle(dialog).zoom)||1):1;
 const host=dialog.open?dialog.getBoundingClientRect():{left:0,top:0,width:innerWidth,height:innerHeight};
 menu.style.maxWidth=Math.max(1,(host.width-16)/scale)+'px';
 menu.style.maxHeight=Math.max(1,(host.height-16)/scale)+'px';
 const r=menu.getBoundingClientRect();
 menu.style.position=dialog.open?'absolute':'fixed';
 menu.style.left=Math.max(8,Math.min(event.clientX-host.left,host.width-r.width-8))/scale+'px';
 menu.style.top=(Math.max(8,Math.min(event.clientY-host.top,host.height-r.height-8))/scale+(dialog.open?dialog.scrollTop:0))+'px';
 if(!state.settings.reducedEffects && !matchMedia('(prefers-reduced-motion: reduce)').matches)menu.animate([{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'scale(1.018)',offset:.72},{opacity:1,transform:'scale(1)'}],{duration:230,easing:'cubic-bezier(.2,.75,.2,1)'});
}
function confirmDeleteGroup(id) {
 const group=state.groups.find(g=>g.id===id);if(!group || state.groups.length<2)return;
 const target=state.groups.find(g=>g.id!==id);
 openDialog('confirm',{title:`${t("删除「{v0}」分组？", {v0: group.name})}`,message:`${t("其中的网站和组件会移到「{v0}」，内容会保留。", {v0: target.name})}`,label:t("删除分组"),callback:async()=>{
  const oldGroup=clone(group),oldIndex=state.groups.indexOf(group),movedIds=state.items.filter(i=>i.groupId===id).map(i=>i.id);
  state.groups=state.groups.filter(g=>g.id!==id);state.items.forEach(i=>{if(i.groupId===id)i.groupId=target.id;});state.activeGroupId=target.id;await commit();closeDialog();
  toast(t("分组已删除，内容已保留。"),async()=>{
   if(!state.groups.some(g=>g.id===id))state.groups.splice(Math.min(oldIndex,state.groups.length),0,oldGroup);
   const eligible=new Set(state.items.filter(i=>movedIds.includes(i.id)&&i.groupId===target.id).map(i=>i.id));
   state.items.forEach(i=>{if(eligible.has(i.id)&&(!i.folderId||eligible.has(i.folderId)))i.groupId=id;});
   state.activeGroupId=id;await commit();toast(t("已恢复分组。"));
  });
 }});
}

document.addEventListener('click', async event=>{
 if (!event.target.closest('.shortcuts-control')) { document.body.classList.remove('shortcuts-open'); $('#shortcuts-button').setAttribute('aria-expanded','false'); }
 if (!event.target.closest('.sidebar,#navigation-reveal') && document.body.classList.contains('navigation-open')) { document.body.classList.remove('navigation-open'); updateToolbar(); }
 const target=event.target.closest('button,a');
 if(!target) { if(!event.target.closest('.search-wrapper'))hideSearchMenus(); $('#context-menu').hidden=true; return; }
 try {
 if(target.matches('[data-close]'))return closeDialog();
 if(target.closest('.wallpaper-browser') && await wallpaperLibrary.handleClick(target))return;
 if(target.dataset.extractEngineIcon)return await extractEngineFavicon(target);
 if(target.dataset.group){state.activeGroupId=target.dataset.group;await commit();document.body.classList.remove('navigation-open');updateToolbar();return;}
 if(target.dataset.engine){state.settings.searchEngine=target.dataset.engine;await persist();renderEngine();hideSearchMenus();$('#search-input').focus();return;}
 if(target.dataset.searchHistory){$('#search-input').value=target.dataset.searchHistory;submitSearch();return;}
 if(target.dataset.suggestion){const item=state.items.find(i=>i.id===target.dataset.suggestion);if(item)navigate(item.url);hideSearchMenus();return;}
 if(target.dataset.openLink){if(editing){event.preventDefault();openDialog('edit-item',{id:target.dataset.openLink});}return;}
 if(target.dataset.openFolder)return openDialog('folder',{id:target.dataset.openFolder});
 if(target.dataset.editItem)return openDialog('edit-item',{id:target.dataset.editItem});
 if(target.dataset.deleteItem){await removeItem(target.dataset.deleteItem);return;}
 if(target.dataset.iconChoice)return chooseLinkIcon(target);
 if(target.dataset.addTab){const expanded=dialog.classList.contains('workspace-expanded');openDialog('add',{tab:target.dataset.addTab,groupId:$('#catalog-group')?.value||dialogData.groupId});dialog.classList.toggle('workspace-expanded',expanded);return;}
 if(target.dataset.catalogSize || target.dataset.catalogStep){changeCatalogSize(target,state);return;}
 if(target.dataset.catalogCategory){$$('[data-catalog-category]',dialog).forEach(button=>button.setAttribute('aria-pressed',String(button===target)));filterCatalog(dialog);return;}
 if(target.dataset.addSite){const source=DEFAULT_STATE.items.find(item=>item.id===target.dataset.addSite);if(source){const groupId=$('#catalog-group').value;await addCatalogItem({...clone(source),id:uid(),groupId,folderId:null},target,t('已添加到桌面。'));}return;}
 if(target.dataset.action==='workspace-expand'){dialog.classList.toggle('workspace-expanded');return;}
 if(target.dataset.addWidget)return await addWidget(target.dataset.addWidget,target);
 if(target.dataset.settingsTab)return openDialog('settings',{tab:target.dataset.settingsTab});
 if(target.dataset.color){const form=target.closest('form');$('input[name=color]',form).value=target.dataset.color;$$('[data-color]',form).forEach(b=>{b.classList.toggle('selected',b===target);b.innerHTML=b===target?icon('check'):'';});if(form.id==='link-form')updateLinkPreview(form);return;}
 if(target.dataset.groupIcon){$('input[name=icon]',dialog).value=target.dataset.groupIcon;$$('[data-group-icon]',dialog).forEach(b=>b.classList.toggle('selected',b===target));return;}
 if(target.dataset.theme){state.settings.theme=target.dataset.theme;applySettings();await persist();if(dialog.open&&dialogKind==='settings')openDialog('settings',{tab:'appearance'});return;}
 if(target.dataset.material){state.settings.surfaceStyle=target.dataset.material;applySettings();await persist();$$('[data-material]',dialog).forEach(button=>{const selected=button===target;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});return;}
 if(target.dataset.wallpaper){state.settings.wallpaper=target.dataset.wallpaper;state.settings.customWallpaper=null;state.settings.remoteWallpaper=null;state.settings.dailyWallpaper=false;await persist();applySettings();openDialog('wallpaper');return;}
 if(target.dataset.deleteEngine){state.settings.customEngines=state.settings.customEngines.filter(e=>e.id!==target.dataset.deleteEngine);if(state.settings.searchEngine===target.dataset.deleteEngine)state.settings.searchEngine=ENGINES[0].id;await persist();renderEngine();openDialog('settings',{tab:'search'});return;}
 if(target.dataset.scope)return await chooseLocalScope(target.dataset.scope);
 if(target.dataset.url)return navigate(target.dataset.url);
 if(target.dataset.unfolder){const item=state.items.find(i=>i.id===target.dataset.unfolder);if(!item)return;const id=item.folderId;item.folderId=null;await commit();openDialog('folder',{id});toast(t("已移回桌面。"));return;}
 if(target.dataset.deleteGroup)return confirmDeleteGroup(target.dataset.deleteGroup);
 if(target.dataset.context){
  const menu=$('#context-menu'),id=menu.dataset.item,groupId=menu.dataset.group,action=target.dataset.context;menu.hidden=true;
  if(action==='permissions')return openDialog('settings',{tab:'permissions'});
  if(action==='widget-open')return openDialog('widget-detail',{item:state.items.find(i=>i.id===id)});
  if(action==='widget-command'){const item=state.items.find(i=>i.id===id);if(item&&queuePluginCommand(id,target.dataset.command))openDialog('widget-detail',{item});return;}
  if(action==='edit')return openDialog('edit-item',{id});
  if(action==='move')return openDialog('move',{id});
  if(action==='delete')return await removeItem(id);
  if(action==='resize'){const item=state.items.find(i=>i.id===id);if(item&&item.type!=='link'){item.size=target.dataset.size;await commit();}return;}
  if(action==='duplicate'){const item=state.items.find(i=>i.id===id);if(item){const copy={...clone(item),id:uid(),title:item.title+t(" 副本")};state.items.push(copy);if(item.type==='folder')state.items.filter(i=>i.folderId===id).forEach(child=>state.items.push({...clone(child),id:uid(),folderId:copy.id}));await commit();toast(t("已复制到桌面。"));}return;}
  if(action==='edit-group')return openDialog('group',{id:groupId});
  if(action==='delete-group')return confirmDeleteGroup(groupId);
  if(action==='add-link')return openDialog('add',{tab:'link'});
  if(action==='add-widget')return openDialog('add',{tab:'widgets'});
  if(action==='add-folder')return openDialog('add',{tab:'folder'});
  if(action==='edit-desktop'){editing=!editing;renderDesktop();return;}
  if(action==='export')return exportBackup();
  return openDialog(action);
 }
 const action=target.dataset.action;
 if(action==='permissions')return openDialog('settings',{tab:'permissions'});
 if(action==='upload-avatar')return $('#avatar-file',dialog)?.click();
 if(action==='reset-avatar')return await resetAvatar();
 if(action==='clear-search-history'){clearSearchHistory();hideSearchMenus();toast(t("最近搜索已清除。"));return;}
 if(action==='reset-positions'){for(const key of ['clockOffsetX','clockOffsetY','searchOffsetX','searchOffsetY'])state.settings[key]=0;applySettings();await persist();openDialog('settings',{tab:'layout'});return;}
 if(action==='reset-preferences')return openDialog('confirm',{title:t("恢复默认设置？"),message:t("显示、搜索、头像和壁纸偏好将恢复默认。网站、分组、笔记与待办会保留。"),label:t("重置设置"),callback:async()=>{
  const previous=clone(state.settings);state.settings=clone(DEFAULT_STATE.settings);avatarRequestSequence++;
  await commit();openDialog('settings');toast(t("已恢复默认设置。"),async()=>{state.settings=previous;await commit();if(dialog.open)openDialog('settings');toast(t("已撤销重置设置。"));});
 }});
 if(action==='extract-favicon')return await extractLinkFavicon(target);
 if(action==='visit-favicon')return await visitLinkFavicon(target);
 if(action?.startsWith('webdav-'))return await syncController.handleAction(action);
 if(action==='open-sync')return openDialog('settings',{tab:'sync'});
 if(action==='open-backup')return openDialog('settings',{tab:'data'});
 if(action==='add-wallpaper-widget')return openDialog('add',{tab:'widgets'});
 if(action==='widget-sources')return openDialog('settings',{tab:'sources'});
 if(action==='settings')return openDialog('settings');
 if(action==='wallpaper')return openDialog('wallpaper');
 if(action==='local-search')return openDialog('local-search');
 if(action==='query-local'){if(localScope==='history')return await chooseLocalScope('history');renderLocalResults($('#local-query')?.value || '');return;}
 if(action==='search-settings')return openDialog('settings',{tab:'search'});
 if(action==='add')return openDialog('add');
 if(action==='add-group')return openDialog('group');
 if(action==='edit'){editing=!editing;renderDesktop();return;}
 if(action==='submit-search')return submitSearch();
 if(action==='export')return exportBackup();
 if(action==='import')return $('#backup-file').click();
 if(action==='import-bookmarks')return await importBookmarks(target);
 if(action==='upload-wallpaper')return $('#wallpaper-file').click();
 if(action==='confirm-restore'){const restored=dialogData.state,backup=clone(state);state=restored;blockedStorage=false;await persist({replace:true});renderDesktop();closeDialog();toast(t("备份已恢复。"),async()=>{backup.updatedAt=state.updatedAt;state=backup;await commit();toast(t("已回到恢复前的桌面。"));});return;}
 if(action==='reset')return openDialog('confirm',{title:t("恢复初始桌面？"),message:t("当前网址、笔记、待办和壁纸将被初始内容替换。已开启的 WebDAV 自动同步会继续同步这一变化，建议先在数据设置中导出备份。"),label:t("恢复初始桌面"),callback:async()=>{const backup=clone(state);state=createDefaultState();blockedStorage=false;await persist({replace:true});renderDesktop();closeDialog();toast(t("已恢复初始桌面。"),async()=>{backup.updatedAt=state.updatedAt;state=backup;await commit();toast(t("已撤销恢复。"));});}});
 if(action==='confirm-callback'){const callback=dialogData.callback;if(callback)await callback();return;}
 if(target.id==='engine-button'){const menu=$('#engine-menu');menu.hidden=!menu.hidden;$('#search-suggestions').hidden=true;target.setAttribute('aria-expanded',String(!menu.hidden));return;}
 if(target.id==='brand-button')return openDialog('settings');
 if(target.id==='toolbar-visibility'){state.settings.toolbarVisibility=state.settings.toolbarVisibility==='always'?'auto':'always';updateToolbar();await persist();return;}
 if(target.id==='shortcuts-button'){const open=document.body.classList.toggle('shortcuts-open');document.body.classList.toggle('shortcuts-dismissed',!open);target.setAttribute('aria-expanded',String(open));return;}
 if(target.id==='navigation-reveal'){document.body.classList.toggle('navigation-open');updateToolbar();return;}
 if(target.id==='done-editing'){editing=false;renderDesktop();return;}
 }catch(err){if(!err.notified)toast(err.message || t("操作没有完成，请重试。"));}
 if(!event.target.closest('.search-wrapper'))hideSearchMenus();
 if(!event.target.closest('.context-menu'))$('#context-menu').hidden=true;
});

dialog.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target;const data=new FormData(form);const value=name=>String(data.get(name) || '').trim();
 const submit=$('button[type=submit]',form);if(submit)submit.disabled=true;
 try {
  if(form.id==='webdav-form'){await syncController.saveFromForm(form);return;}
  if(form.id==='link-form'){
   const url=safeUrl(value('url'));if(!url)throw new Error(t("请输入有效的 http 或 https 网站地址。"));
   if(!value('title'))throw new Error(t("请填写网站名称。"));
   const old=state.items.find(i=>i.id===form.dataset.id),groupId=value('groupId');
   const item={...(old || {}),id:old?.id || uid(),type:'link',title:value('title'),url,icon:value('icon') || value('title').slice(0,2),iconMode:value('iconMode')==='text'?'text':'auto',iconUrl:normalizeIconSelection(value('iconUrl')),color:value('color') || COLORS[0],groupId,size:'1x1',folderId:old?.groupId===groupId?old.folderId:null};
   if(old)state.items[state.items.indexOf(old)]=item;else state.items.push(item);
   await commit();closeDialog();toast(old?t("网站已更新。"):t("已添加到桌面。"));
  }else if(form.id==='folder-form'){
   const old=state.items.find(i=>i.id===form.dataset.id),groupId=value('groupId');
   if(old){old.title=value('title');old.groupId=groupId;state.items.forEach(i=>{if(i.folderId===old.id)i.groupId=groupId;});}
   else state.items.push({id:uid(),groupId,type:'folder',title:value('title'),icon:'folder',color:'#719295',size:'2x2'});
   await commit();closeDialog();toast(t("文件夹已保存。"));
  }else if(form.id==='group-form'){
   const old=state.groups.find(g=>g.id===form.dataset.id);
   if(old){old.name=value('name');old.icon=value('icon');}else{const g={id:uid(),name:value('name'),icon:value('icon')};state.groups.push(g);state.activeGroupId=g.id;}
   await commit();closeDialog();toast(t("分组已保存。"));
  }else if(form.id==='engine-form'){
   if(state.settings.customEngines.length>=12)throw new Error(t("最多支持 12 个自定义引擎，请先删除不再使用的引擎。"));
   const template=value('url');if(!template.includes('{q}'))throw new Error(t("搜索地址需要包含 {q} 占位符。"));if(!safeUrl(template.replace(/\{q\}/g,'test')))throw new Error(t("搜索地址必须使用 http 或 https。"));
   state.settings.customEngines.push({id:uid(),name:value('name'),letter:value('name').slice(0,1),color:'#83cbb2',url:template});await persist();renderEngine();openDialog('settings',{tab:'search'});toast(t("搜索引擎已添加。"));
  }else if(form.id==='widget-form'){
   const item=state.items.find(i=>i.id===form.dataset.id);if(!item)throw new Error(t('组件已移除'));
   item.title=value('title');item.size=value('size');
   await commit();closeDialog();toast(t('组件设置已保存。'));
  }else if(form.id==='move-form'){
   const folder=state.items.find(i=>i.id===value('folderId')&&i.type==='folder');await moveItem(form.dataset.id,folder?.groupId || value('groupId'),folder?.id || null);closeDialog();toast(t("已移动。"));
  }else if(form.id==='bookmarks-form'){
   const selected=data.getAll('bookmark').map(Number);if(!selected.length)throw new Error(t("请至少选择一个网站。"));
   const groupId=value('groupId');let count=0;
   for(const index of selected){const b=dialogData.bookmarks[index];if(!b || state.items.some(i=>i.groupId===groupId&&i.url===b.url))continue;state.items.push({id:uid(),groupId,type:'link',title:b.title || new URL(b.url).hostname,url:b.url,icon:(b.title || new URL(b.url).hostname).slice(0,2),iconMode:'auto',color:COLORS[count%COLORS.length],size:'1x1',folderId:null});count++;}
   await commit();closeDialog();toast(`${t("已导入 {v0} 个网站，相同分组内的重复网址已跳过。", {v0: count})}`);
  }
 }catch(err){const area=$('#form-error',form);if(area){area.textContent=err.message || t("保存失败，请检查填写内容。");area.hidden=false;}else toast(err.message);}
 finally{if(submit?.isConnected)submit.disabled=false;}
});

document.addEventListener('input', event=>{
 const input=event.target;
 if(input.id==='search-input')suggestions();
 if(input.id==='widget-query')filterCatalog(dialog);
 if(input.id==='local-query')renderLocalResults(input.value);
 if(input.dataset.settingColor){state.settings[input.dataset.settingColor]=input.value;const output=$('#color-value-'+input.dataset.settingColor);if(output)output.textContent=input.value;applySettings();}
 if(input.dataset.range){state.settings[input.dataset.range]=Number(input.value);$(`#output-${input.dataset.range}`).textContent=input.value+(input.dataset.unit || '');applySettings();}
 if(input.closest('#link-form')){
  updateLinkPreview(input.form);
 }
});
document.addEventListener('change',async event=>{
 const input=event.target;
 try{
  if(input.id==='site-icon-upload'){await uploadSiteIcon(input);return;}
  if(input.id==='avatar-file'){const file=input.files?.[0],panel=input.closest('#avatar-panel');input.value='';if(file&&panel)await uploadAvatar(file,panel);return;}
  if(input.dataset.preference){state.settings[input.dataset.preference]=typeof state.settings[input.dataset.preference]==='number'?Number(input.value):input.value;document.body.classList.remove('navigation-open');applySettings();await persist();if(input.dataset.preference==='language'){lastDate='';renderDesktop();renderClock();openDialog('settings',{tab:'general'});return;}if(['navigationMode','sidebarVisibility'].includes(input.dataset.preference))renderGroups();updateHeaderPlacement();return;}
  if(input.dataset.settingColor){await persist();return;}
  if(input.name==='iconMode' && input.closest('#link-form')){updateLinkPreview(input.form);return;}
  if(input.dataset.setting){state.settings[input.dataset.setting]=input.checked;applySettings();await persist();if(['wallpaperApiEnabled','showAddTile'].includes(input.dataset.setting))renderDesktop();return;}
  if(input.dataset.range){await persist();if(['gridSize'].includes(input.dataset.range))bindFaviconImages(document,{force:true});return;}
  if(input.name==='searchEngine'&&dialogKind==='settings'){state.settings.searchEngine=input.value;await persist();renderEngine();return;}
  if(input.name==='cityPreset'&&input.value){const [name,lat,lon]=input.value.split('|');const f=input.form;f.elements.cityName.value=t(name);f.elements.latitude.value=lat;f.elements.longitude.value=lon;return;}
  if(input.id==='bookmark-select-all'){$$('input[name=bookmark]',dialog).forEach(c=>c.checked=input.checked);return;}
  if(input.id==='backup-file'){
   const file=input.files?.[0];input.value='';if(!file)return;if(file.size>6*1024*1024)throw new Error(t("备份文件过大，最大支持 6 MB。"));
   const restored=validateImport(await file.text());openDialog('restore-preview',{state:restored});return;
  }
  if(input.id==='wallpaper-file'){
   const file=input.files?.[0];input.value='';if(!file)return;
   const isCurrent=wallpaperRequest();
   if(!/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm))$/.test(file.type))throw new Error(t("请使用 PNG、JPEG、WebP、GIF、AVIF 图片或 MP4、WebM 视频。"));
   let blob=file, compressed=false;
   if(['image/png','image/jpeg','image/webp'].includes(file.type)){
     if(file.size>MAX_IMAGE_INPUT_BYTES)throw new Error(t("图片上传最多支持 32 MiB"));
     try{
       const optimized=await compressImage(file,{mode:'smart',quality:0.9,maxBytes:4*1024*1024});
       blob=optimized.blob;compressed=optimized.changed;
     }catch(error){
       if(file.size>4*1024*1024)throw error;
       // Original small wallpapers remain usable if the browser cannot encode
       // or the image is animated. Never flatten animation silently.
       blob=file;
     }
   }
   if(blob.size>4*1024*1024)throw new Error(t("图片压缩后仍超过 4 MiB；请使用图片压缩工具调整。"));
   if(!isCurrent())return;
   if(!await storeLocalWallpaper(blob,file.type.startsWith('video/')?'video':'image',isCurrent,file.name))return;
   wallpaperLibrary.showCustom();
   openDialog('wallpaper');
   toast(compressed?t('壁纸已自动压缩：{before} → {after}',{before:(file.size/1024/1024).toFixed(2)+' MiB',after:(blob.size/1024/1024).toFixed(2)+' MiB'}):t('本地壁纸已保存。'));
  }
 }catch(err){if(input.dataset.setting||input.dataset.range||input.dataset.preference||input.dataset.settingColor)renderDesktop();if(!err.notified)toast(err.message || t("操作没有完成。"));}
});

$('#search-input').addEventListener('focus',suggestions);
$('.shortcuts-control').addEventListener('pointerenter',()=>document.body.classList.remove('shortcuts-dismissed'));
$('#shortcuts-button').addEventListener('focus',()=>document.body.classList.remove('shortcuts-dismissed'));
$('#groups').addEventListener('wheel',event=>{
 if(event.ctrlKey || event.metaKey || dialog.open)return;
 const list=$('#groups'), horizontal=state.settings.navigationMode==='top';
 if(state.settings.sidebarWheelMode!=='switch' || editing || desktopDrag?.isDragging()){
  const delta=(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)*(event.deltaMode===1?20:event.deltaMode===2?list.clientHeight:1);
  event.preventDefault();
  if(horizontal)list.scrollLeft+=delta;else list.scrollTop+=delta;
  return;
 }
 const delta=Math.abs(event.deltaY)>Math.abs(event.deltaX)?event.deltaY:event.deltaX;
 if(Math.abs(delta)<3)return;
 event.preventDefault();
 const now=performance.now();if(now-lastGroupWheel<240)return;lastGroupWheel=now;
 const index=state.groups.findIndex(group=>group.id===currentGroup().id),next=Math.max(0,Math.min(state.groups.length-1,index+(delta>0?1:-1)));
 if(next!==index){state.activeGroupId=state.groups[next].id;commit().catch(error=>{if(!error.notified)toast(error.message);});}
},{passive:false});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();submitSearch();});
$('#search-input').addEventListener('keydown',async event=>{
 if(event.key==='Tab'){event.preventDefault();const list=allEngines(),index=list.findIndex(e=>e.id===currentEngine().id);state.settings.searchEngine=list[(index+(event.shiftKey?-1:1)+list.length)%list.length].id;await persist();renderEngine();if(event.target.value)suggestions();}
 if(event.key==='ArrowDown'&&!$('#search-suggestions').hidden){event.preventDefault();$('button',$('#search-suggestions'))?.focus();}
});
$('#search-suggestions').addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=$$('button',$('#search-suggestions')),index=buttons.indexOf(document.activeElement),next=(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}});
$('#clock').addEventListener('click',async()=>{state.settings.minimal=!state.settings.minimal;applySettings();await persist();});
document.addEventListener('keydown',event=>{
 const menu=$('#context-menu');
 if(!menu.hidden&&menu.contains(event.target)){
  const buttons=$$('button',menu),index=buttons.indexOf(event.target);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();return;}
  if(event.key==='Escape'||event.key==='Tab'){menu.hidden=true;const id=CSS.escape(menu.dataset.item);document.querySelector(`[data-folder-item="${id}"] .folder-link,[data-item="${id}"]`)?.focus();if(event.key==='Escape'){event.preventDefault();return;}}
 }
 if(event.key==='Tab'&&dialog.open&&dialogKind!=='widget-detail'&&menu.hidden&&!event.defaultPrevented){
  const controls=$$('button,input,select,textarea,a[href],summary,[tabindex]',dialog).filter(node=>node.tabIndex>=0&&!node.matches(':disabled')&&!node.closest('[inert]')&&node.getClientRects().length),first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||active.matches('#dialog-title,#workspace-title'))){event.preventDefault();last?.focus();return;}
  if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();return;}
 }
 if((event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')&&event.target.closest('[data-item],[data-folder-item]')){event.preventDefault();const tile=event.target.closest('[data-item],[data-folder-item]'),rect=tile.getBoundingClientRect();openContext({preventDefault(){},clientX:rect.left+16,clientY:rect.top+28},{itemId:tile.dataset.folderItem||tile.dataset.item});return;}
 if(event.key==='Enter' && event.target.matches('.tile-widget')){const item=state.items.find(i=>i.id===event.target.dataset.item);if(item){event.preventDefault();openDialog('widget-detail',{item});return;}}
 if(event.key==='Escape'){document.body.classList.remove('shortcuts-open','navigation-open');document.body.classList.add('shortcuts-dismissed');$('#shortcuts-button').setAttribute('aria-expanded','false');updateToolbar();hideSearchMenus();$('#context-menu').hidden=true;if(dialog.open)return; if(editing){editing=false;renderDesktop();}else if(state.settings.minimal){state.settings.minimal=false;applySettings();persist().catch(()=>{});}return;}
 if(event.key==='Enter'&&event.target.id==='local-query'){event.preventDefault();if(localScope==='history')chooseLocalScope('history').catch(err=>toast(err.message));else renderLocalResults(event.target.value);return;}
 const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
 if((event.ctrlKey||event.metaKey)&&['k','f'].includes(event.key.toLowerCase())){event.preventDefault();openDialog('local-search');return;}
 if(typing||dialog.open)return;
 if(['PageDown','PageUp','Home','End',' '].includes(event.key)&&!(event.key===' '&&event.target.closest?.('button,a,[role=button]'))&&!event.altKey&&!event.metaKey&&!event.ctrlKey){const sc=$('#content-scroll');event.preventDefault();sc.scrollTo({top:event.key==='Home'?0:event.key==='End'?sc.scrollHeight:sc.scrollTop+(event.key==='PageUp'||event.shiftKey?-1:1)*sc.clientHeight*.85,behavior:state.settings.reducedEffects?'instant':'smooth'});return;}
 if(event.key==='/'){event.preventDefault();if(state.settings.showSearch)$('#search-input').focus();else openDialog('local-search');}
 if(event.key.toLowerCase()==='e'){editing=!editing;renderDesktop();}
});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
// Native selects can match :focus-visible even after a pointer selection.
dialog.addEventListener('pointerdown',()=>dialog.classList.add('pointer-focus'),true);
dialog.addEventListener('keydown',()=>dialog.classList.remove('pointer-focus'),true);
dialog.addEventListener('cancel',event=>{if(dialogKind==='wallpaper'&&wallpaperLibrary.back()){event.preventDefault();return;}if(dialogKind==='widget-detail')event.preventDefault();void closeDialog();});
dialog.addEventListener('close',()=>{if(dialog.open)return;wallpaperUploadRevision++;dialog.classList.remove('pointer-focus');cancelLinkFaviconVisit();viewerCleanup();viewerCleanup=()=>{};wallpaperLibrary.close();avatarRequestSequence++;searchToken++;dialogKind='';$('#dialog-content').innerHTML='';});
document.addEventListener('contextmenu',event=>{
 const entry=event.target.closest('[data-folder-item]');
 if(dialog.open && dialogKind==='folder' && entry){openContext(event,{itemId:entry.dataset.folderItem});return;}
 if(dialog.open || /INPUT|TEXTAREA/.test(event.target.tagName))return;const tile=event.target.closest('[data-item]'),group=event.target.closest('[data-group]');openContext(event,{itemId:tile?.dataset.item,groupId:group?.dataset.group});});
async function applyDesktopDrop(intent) {
 if (intent.kind === 'group-reorder') {
  const ordered = reorderById(state.groups,intent.groupId,intent.targetId,intent.position);
  if (ordered === state.groups) return;
  state.groups = ordered; await commit(true,{preserveWidgets:true}); return;
 }
 const item = state.items.find(entry => entry.id === intent.itemId);
 if (!item) return;
 if (intent.kind === 'reorder') {
  const target = state.items.find(entry => entry.id === intent.targetId);
  if (!target || item.groupId !== target.groupId || item.folderId || target.folderId) return;
  const ordered = reorderById(state.items,item.id,target.id,intent.position);
  if (ordered === state.items) return;
  state.items = ordered; await commit(true,{preserveWidgets:true}); return;
 }
 if (!state.groups.some(group => group.id === intent.groupId)) return;
 if(intent.kind==='create-folder'){
  const target=state.items.find(entry=>entry.id===intent.targetId);
  if(!target||target.id===item.id||item.type!=='link'||target.type!=='link'||item.folderId||target.folderId||item.groupId!==target.groupId||target.groupId!==intent.groupId)return;
  const folder={id:uid(),groupId:target.groupId,type:'folder',title:t("新建文件夹"),icon:'folder',color:'#7b9aaf',size:'1x1'};
  const index=state.items.indexOf(target);
  // Both children and their new parent enter the SAME validated storage write.
  item.folderId=folder.id;target.folderId=folder.id;
  state.items=[...state.items.slice(0,index),folder,...state.items.slice(index)];
  await commit(true,{preserveWidgets:true});toast(t("已创建文件夹，右键可重命名或移动项目。"));return;
 }
 if (intent.kind === 'folder') {
  const folder = state.items.find(entry => entry.id === intent.folderId && entry.type === 'folder' && entry.groupId === intent.groupId);
  if (!folder || item.type !== 'link') return;
  await moveItem(item.id,folder.groupId,folder.id,{preserveWidgets:true}); toast(t("已收进文件夹。")); return;
 }
 if (intent.kind === 'group') {
  await moveItem(item.id,intent.groupId,null,{preserveWidgets:true}); toast(t("已移动到所选分组。")); return;
 }
 if (intent.kind === 'append') {
  item.groupId = intent.groupId;
  if (item.type === 'link') item.folderId = null;
  if (item.type === 'folder') state.items.forEach(child => { if (child.folderId === item.id) child.groupId = intent.groupId; });
  state.items = [...state.items.filter(entry => entry.id !== item.id),item];
  await commit(true,{preserveWidgets:true});
 }
}

async function init() {
 setLocale('auto');
 try{state=await loadState();persistedState=clone(state);if(!state.settings.rememberGroup)state.activeGroupId=state.groups[0].id;}catch(err){blockedStorage=true;toast(err.message);}
 if(state.settings.customWallpaper)void localWallpapers.remember(state.settings.customWallpaper,state.settings.customWallpaperType).catch(()=>{});
 syncController=createSyncController({
  getState:()=>clone(state), beforeSync:async()=>{await saveQueue;if(blockedStorage)throw new Error(t("请先恢复本机桌面数据，再进行同步。"));if(JSON.stringify(state)!==JSON.stringify(persistedState))await persist({fromSync:true});},
  applyRemote:applySyncedDesktop,toast,openDialog,closeDialog,exportBackup,
  isEditing:()=>dialog.open || desktopDrag?.isDragging() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || ''),
  refreshPanel:()=>{if(dialogKind==='settings'&&dialogData.tab==='sync')openDialog('settings',{tab:'sync'});}
 });
 await syncController.init();
 await faviconCacheReady;
 $$('[data-action=add-group]').forEach(e=>e.innerHTML=icon('plus'));
 $$('.sidebar-bottom [data-action=local-search]').forEach(e=>e.innerHTML=icon('search'));
 $$('.sidebar-bottom [data-action=settings]').forEach(e=>e.innerHTML=icon('settings'));
 $$('.top-tools [data-action=wallpaper]').forEach(e=>e.innerHTML=icon('wallpaper'));
 $$('.top-tools [data-action=edit]').forEach(e=>e.innerHTML=icon('edit'));
 $$('.top-tools [data-action=add]').forEach(e=>e.innerHTML=icon('plus'));
 $('#shortcuts-button').innerHTML=icon('keyboard');
 $('#navigation-reveal').innerHTML=icon('panel');
 $('#search-submit').innerHTML=icon('search');
 desktopDrag=createDesktopDragController({
  document, getState:()=>state, getActiveGroupId:()=>currentGroup().id,
  canDragGroups:()=>editing, isBlocked:()=>dialog.open || blockedStorage || state.settings.minimal,
  onStart:()=>{hideSearchMenus();$('#context-menu').hidden=true;},
  onDrop:applyDesktopDrop,
  onWidgetDrag:setPluginDragState,
  onError:err=>{renderDesktop();if(!err.notified)toast(err.message || t("移动未保存，请重试。"));}
 });
 renderDesktop();
 subscribeState(incoming=>{if(saving || !incoming || incoming.updatedAt===state.updatedAt)return;state=incoming;persistedState=clone(incoming);if(!dialog.open&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || ''))renderDesktop();});
 new ResizeObserver(updateGrid).observe($('.desktop-wrap'));
 new ResizeObserver(updateHeaderPlacement).observe($('#clock-block'));
 window.addEventListener('resize',()=>{updateHeaderPlacement();applyWindowSize(dialog,state.settings.windowSize);const metrics=gridMetrics(state.settings,window.innerWidth);for(const [key,value] of Object.entries({'--cell-size':metrics.cell,'--tile-size':metrics.cell,'--gap':metrics.gap}))document.documentElement.style.setProperty(key,`${value}px`);updateGrid();},{passive:true});
 document.fonts?.ready.then(updateHeaderPlacement);
 $('#content-scroll').addEventListener('scroll',hideSearchMenus,{passive:true});
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applySettings);
 setInterval(()=>{renderClock();if(!document.hidden)refreshLiveWidgets($('#desktop'),state);},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderClock();refreshLiveWidgets($('#desktop'),state);syncController.onVisible();}});
 document.addEventListener('focusout',()=>syncController.onIdle());
 setInterval(()=>{if(!document.hidden)syncController.onIdle();},60000);
 if(new URLSearchParams(location.search).get('search')==='local')openDialog('local-search');
 if(location.hash.startsWith('#import=')){try{openDialog('add',{tab:'sharing',url:decodeURIComponent(location.hash.slice(8))});}catch{toast(t('分享链接无效。'));}}
 if(blockedStorage)openDialog('settings',{tab:'data'});
}
init().catch(err=>{console.error('Qiye initialization failed',err);toast(t("桌面初始化失败，请刷新页面重试。"));});

document.addEventListener('change',async event=>{
 if(!event.target.matches('[data-header-mode]'))return;
 if(event.target.value==='mixed')return;
 state.settings.pinClock=state.settings.pinSearch=event.target.value==='fixed';
 try{applySettings();await persist();}catch(error){if(!error.notified)toast(error.message);}
});

function pluginHost() {
 return {getState:()=>state,saveData:saveWidgetData,saveSettings:saveWidgetSettings,savePlugin:savePluginEnvelope,openDialog,closeDialog,toast,
  refreshCards:()=>refreshLiveWidgets($('#desktop'),state),
  openWidgetContext:(id,point)=>{if(!dialog.open)openContext({...point,preventDefault(){}},{itemId:id});},
  widgetPointer:(id,event)=>desktopDrag?.forwardPointer(id,event),
  applyWallpaper:applyOnlineWallpaper,
  applyWallpaperBlob:blob=>storeLocalWallpaper(blob,'image'),
  openWallpaper:()=>openDialog('wallpaper')};
}
window.addEventListener(SOURCES_CHANGED,()=>{renderDesktop();if(dialogKind==='widget-detail')openDialog('widget-detail',dialogData);});
window.addEventListener('storage',event=>{if(event.key==='qiye.community.v1')window.dispatchEvent(new Event(SOURCES_CHANGED));});

async function savePluginEnvelope(id,value,expected,{plugin,title,size}) {
 await saveQueue;
 const current=state.items.find(item=>item.id===id);
 const revision=current?.widget==='community'?current.data.value:JSON.stringify({config:current?.config,data:current?.data});
 if(!current||revision!==expected)throw new Error(t('组件内容已在其他位置修改，请重新打开。'));
 const candidate=clone(state),item=candidate.items.find(item=>item.id===id);
 item.widget='community';item.config={manifest:plugin.manifest,source:plugin.source};item.data={value:JSON.stringify(value)};
 if(title!==undefined)item.title=title;if(size!==undefined)item.size=size;
 state=validateImport(candidate);await persist();
 if(item.title!==current.title||item.size!==current.size)setTimeout(()=>renderDesktop({preserveWidgets:true}),0);
 return state.items.find(item=>item.id===id);
}

installPermissionControls({toast,onRemoved:descriptor=>{
 if(descriptor.permissions?.includes(localScope)){searchToken++;localExtra=[];renderLocalResults('');}
 if(descriptor.permissions?.includes('bookmarks')&&dialogKind==='import-preview')void closeDialog();
 cancelLinkFaviconVisit();
}});
