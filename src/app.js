import { DEFAULT_STATE, ENGINES, uid, safeUrl, loadState, saveState, subscribeState, validateImport, exportState, requestBookmarks, searchHistory } from './core.js';
import { renderWidget, widgetCatalog, bindWidgets, refreshLiveWidgets, chineseLunarDate } from './widgets.js';
import { icon, iconNames } from './icons.js';
import { normalizeWallpaperPhoto } from './wallpapers.js';
import { webDAVStateFingerprint } from './webdav.js';
import { createSyncController } from './sync-ui.js';
import { getFaviconCandidates, discoverFavicon, faviconCacheReady } from './favicons.js';
import { bindFaviconImages } from './favicon-view.js';
import { normalizeAvatarFile } from './avatar.js';
import { readSearchHistory, rememberSearch, clearSearchHistory } from './search-history.js';
import { createDesktopDragController, reorderById } from './drag.js';

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
let state = clone(DEFAULT_STATE);
let persistedState = clone(DEFAULT_STATE), saveQueue = Promise.resolve(), saveGeneration = 0;
let editing = false, widgetsCleanup = () => {}, saving = 0, revision = 0, blockedStorage = false, syncController = null;
let dialogKind = '', dialogData = {}, lastDialogFocus = null, lastToastTimer, undoAction = null;
let desktopDrag = null, localScope = 'desktop', localExtra = [], searchToken = 0;
let currentMedia = null, lastDate = '', renderedGroup = '', currentGridColumns = 14;
const faviconFormStates = new WeakMap();
let faviconRequestSequence = 0;
let avatarRequestSequence = 0, renderedAvatar, renderedEngineKey = '', lastGroupWheel = 0;

function allEngines() { return [...ENGINES, ...(state.settings.customEngines || [])]; }
async function applyOnlineWallpaper(value) {
 const photo = normalizeWallpaperPhoto(value);
 if (!photo) throw new Error('壁纸来源不受支持，请重新选择。');
 const wallpaperChoice=JSON.stringify([state.settings.wallpaper,state.settings.customWallpaper,state.settings.remoteWallpaper,state.settings.wallpaperApiEnabled,state.settings.dailyWallpaper]);
 await new Promise((resolve,reject) => {
  const preview = new Image();
  preview.referrerPolicy = 'no-referrer';
  let finished = false;
  const done = error => {if(finished)return;finished=true;clearTimeout(timer);preview.onload=null;preview.onerror=null;error?reject(error):resolve();};
  const timer=setTimeout(()=>done(new Error('完整壁纸加载超时，原背景已保留。')),15000);
  preview.onload=()=>done();preview.onerror=()=>done(new Error('完整壁纸暂时无法加载，请换一张或重试。'));
  preview.src=photo.url;
 });
 if(wallpaperChoice!==JSON.stringify([state.settings.wallpaper,state.settings.customWallpaper,state.settings.remoteWallpaper,state.settings.wallpaperApiEnabled,state.settings.dailyWallpaper])) throw new Error('加载期间壁纸设置已改变，请重新选择要应用的照片。');
 state.settings.remoteWallpaper=photo;state.settings.wallpaperApiEnabled=true;
 state.settings.customWallpaper=null;state.settings.customWallpaperType='image';state.settings.dailyWallpaper=false;
 await persist();applySettings();
 toast(`已应用壁纸 · ${photo.author}`);
}
async function applySyncedDesktop(remote, expectedFingerprint) {
 await saveQueue;
 const before=clone(state), localRevision=revision;
 if(await webDAVStateFingerprint(before)!==expectedFingerprint || revision!==localRevision || JSON.stringify(state)!==JSON.stringify(before)) throw new Error('确认期间本机桌面又有修改，请重新检查同步。');
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
 button.disabled = true; button.textContent = '正在提取…';
 try {
  const result = await pending;
  // A provider may have been deleted, or its settings dialog closed meanwhile.
  // Update matching provider images only; never rebuild a partially typed form.
  $$('.engine-mark').forEach(mark => {
   if ($('.site-visual',mark)?.dataset.faviconSite === url) bindFaviconImages(mark,{force:true,candidates:result.candidates?.length ? result.candidates : getFaviconCandidates(url)});
  });
  if (button.isConnected) toast(result.warning || '已更新引擎图标，加载成功后会保存在本机缓存。');
 } catch (err) {
  if (button.isConnected) toast(err.message || '图标暂时无法提取，已保留文字回退。');
 } finally {
  if (button.isConnected) { button.disabled = false; button.textContent = '提取图标'; }
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
 return `<span class="site-visual" data-favicon-site="${esc(url)}"><span class="site-fallback" aria-hidden="true">${fallback}</span><img class="site-favicon" alt="" referrerpolicy="no-referrer" decoding="async" draggable="false" hidden></span>`;
}

function linkPreviewIdentity(form) {
 return `${form.elements.url.value.trim()}\n${form.elements.iconMode.value === 'text' ? 'text' : 'auto'}`;
}
function updateLinkPreview(form, options = {}) {
 if (!form?.isConnected) return;
 const identity=linkPreviewIdentity(form), mode=form.elements.iconMode.value === 'text' ? 'text' : 'auto';
 let view=faviconFormStates.get(form);
 if (!view || view.identity !== identity) {
  view={identity,url:safeUrl(form.elements.url.value),mode,request:++faviconRequestSequence,busy:false,candidates:null,message:''};
  faviconFormStates.set(form,view);
 }
 const preview=$('#link-preview-icon',form), button=$('[data-action="extract-favicon"]',form), status=$('#favicon-status',form);
 const item={url:view.url,iconMode:mode,icon:form.elements.icon.value,title:form.elements.title.value};
 $('#link-preview-title',form).textContent=item.title || '一个常去的地方';
 $('#link-preview-url',form).textContent=form.elements.url.value || '把喜欢的网站，放在触手可及的地方';
 preview.style.background=form.elements.color.value;
 preview.style.setProperty('--tile-ink',tileInk(form.elements.color.value));
 const markup=siteGlyph(item);
 if(view.rendered!==markup || view.preview!==preview){preview.innerHTML=markup;view.rendered=markup;view.preview=preview;}
 bindFaviconImages(preview,{force:!!options.force,candidates:view.candidates});
 button.disabled=view.busy || mode === 'text' || !view.url;
 button.textContent=view.busy ? '正在提取…' : '智能提取';
 status.textContent=view.message || (mode === 'text' ? '使用下方的文字 / Emoji 与背景色。' : '自动尝试网站图标；提取时读取该网站的图标声明，失败保留文字。');
}
function isLinkPreviewCurrent(form, view, request) {
 return form.isConnected && dialog.open && faviconFormStates.get(form) === view && view.request === request && view.identity === linkPreviewIdentity(form);
}
async function extractLinkFavicon(button) {
 const form=button.closest('#link-form');
 if (!form || button.disabled || form.elements.iconMode.value === 'text') return;
 const url=safeUrl(form.elements.url.value);
 if (!url) return;
 // Invoke synchronously from the click handler so Chrome keeps the user gesture
 // needed by the per-site optional permission request inside discoverFavicon.
 const pending=discoverFavicon(url,{requestPermission:true,force:true,targetSize:64,pixelRatio:globalThis.devicePixelRatio || 1});
 updateLinkPreview(form);
 const view=faviconFormStates.get(form), request=++faviconRequestSequence;
 view.request=request;view.busy=true;view.message='正在读取网站图标声明…';
 updateLinkPreview(form);
 try {
  const result=await pending;
  if (!isLinkPreviewCurrent(form,view,request)) return;
  view.busy=false;
  view.candidates=result.candidates?.length ? result.candidates : getFaviconCandidates(url);
  view.message=result.warning || (view.candidates.length ? '已更新候选图标，加载成功后会保存在本机缓存。' : '暂时没有可用图标，已保留文字回退。');
  updateLinkPreview(form,{force:true});
 } catch(err) {
  if (!isLinkPreviewCurrent(form,view,request)) return;
  view.busy=false;view.message=err.message || '提取未完成，已保留文字图标，可稍后重试。';
  updateLinkPreview(form);
 }
}
function toast(message, undo, actionLabel='撤销') {
 clearTimeout(lastToastTimer); const el = $('#toast');
 $('span',el).textContent = message; $('button',el).hidden = !undo; $('button',el).textContent=actionLabel; undoAction = undo || null; el.hidden = false;
 lastToastTimer = setTimeout(() => { el.hidden = true; undoAction = null; }, undo ? 9500 : 5200);
}
$('#toast button').addEventListener('click', async () => { const action = undoAction; $('#toast').hidden = true; undoAction = null; if (action) await action(); });
async function persist(options = {}) {
 if (blockedStorage) throw new Error('原有数据需要恢复，请先导入有效备份。');
 const ticket = ++revision, snapshot = clone(state), previousPending = saving > 0, generation=saveGeneration; saving++;
 const job = saveQueue.then(async () => {
  if(generation!==saveGeneration){
   saving--;
   const cancelled=new Error('前一项修改未能保存，请在最新桌面上重新操作。');
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
    renderDesktop(); toast('另一个标签页已更新桌面。已载入最新内容，可导出本次未保存的改动。',()=>exportBackup(snapshot),'导出副本');
   } else { toast(`保存失败：${err.message || '请检查可用存储空间'}`); }
   err.notified=true;
   throw err;
  } finally { saving--; }
 });
 saveQueue = job.catch(() => {});
 return job;
}
async function commit(render = true) { await persist(); if (render) renderDesktop(); }
function navigate(url, forceNew = false, searchResult = false) {
 const target = safeUrl(url); if (!target) return toast('这个网址无效，请使用 http 或 https 网址。');
 if (forceNew || (searchResult ? state.settings.searchNewTab : state.settings.openNewTab)) window.open(target, '_blank', 'noopener,noreferrer');
 else window.location.assign(target);
}
function renderClock() {
 const now = new Date(), s = state.settings;
 let hour = now.getHours(); const period = hour >= 12 ? '下午' : '上午';
 if (s.hour12) hour = hour % 12 || 12;
 $('#clock-time').textContent = `${String(hour).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 $('#clock-seconds').textContent = s.showSeconds ? String(now.getSeconds()).padStart(2,'0') : '';
 $('#clock-period').textContent = s.hour12 ? period : '';
 const dateKey = `${now.toDateString()}|${s.showWeekday}|${s.showLunar}`;
 if (lastDate !== dateKey) {
  lastDate = dateKey;
  const parts = [`${now.getMonth()+1}月${now.getDate()}日`];
  if (s.showWeekday) parts.push(new Intl.DateTimeFormat('zh-CN',{weekday:'long'}).format(now));
  if (s.showLunar) { const lunar = chineseLunarDate(now); if(lunar) parts.push(lunar); }
  $('#date').textContent = parts.join('　');
 }
}
function updatePinnedHeader() {
 const clock = $('#clock-block'), search = $('.search-wrapper');
 const rect = clock.getBoundingClientRect();
 const clockHeight = state.settings.pinClock && !clock.hidden ? rect.height : 0;
 document.documentElement.style.setProperty('--pinned-clock-height', `${clockHeight}px`);
 const pinTop = parseFloat(getComputedStyle(clock).getPropertyValue('--header-pin-top')) || 16;
 clock.classList.toggle('is-stuck', state.settings.pinClock && !clock.hidden && window.scrollY > 8 && rect.top <= pinTop + 1);
 search.classList.toggle('is-stuck', state.settings.pinSearch && !search.hidden && window.scrollY > 8 && search.getBoundingClientRect().top <= pinTop + clockHeight + 13);
}
function updateHeaderPlacement() {
 const main = $('#main'), bounds = main.getBoundingClientRect(), css = getComputedStyle(main);
 const left = bounds.left + parseFloat(css.paddingLeft || 0), right = bounds.right - parseFloat(css.paddingRight || 0);
 const clockText = $('#clock');
 clockText.style.fontSize='';
 const available = Math.max(1,right-left-32);
 if (!clockText.hidden && clockText.scrollWidth > available) clockText.style.fontSize=(parseFloat(getComputedStyle(clockText).fontSize)*available/clockText.scrollWidth)+'px';
 for (const [selector,key] of [['#clock-block','clock'],['.search-wrapper','search']]) {
  const el = $(selector), property = `--${key}-shift`;
  const previous = parseFloat(el.style.getPropertyValue(property)) || 0;
  const rect = el.getBoundingClientRect();
  if (el.hidden || !rect.width) { el.style.setProperty(property,'0px'); continue; }
  const baseLeft = rect.left - previous, baseRight = rect.right - previous;
  const desired = state.settings[key+'OffsetX'] * window.innerWidth / 100;
  const offset = Math.max(left - baseLeft, Math.min(right - baseRight, desired));
  el.style.setProperty(property, `${Math.round(offset*100)/100}px`);
 }
 // Sticky controls reserve the toolbar row only if their horizontal regions
 // intersect; desktop-wide layouts keep the compact 16px pin position.
 const tools = $('.top-tools').getBoundingClientRect();
 const navSpace = state.settings.navigationMode==='top' && state.settings.sidebarVisibility==='always' ? 64 : 0;
 let pinTop = 16 + navSpace;
 if (!state.settings.minimal) {
  const toolbarLeft = tools.right - Math.max(tools.width,192), floor = tools.bottom + 12;
  const overlaps = el => {const rect=el.getBoundingClientRect();return rect.right>toolbarLeft && rect.left<tools.right;};
  const clock = $('#clock-block'), search = $('.search-wrapper');
  const clockHeight = state.settings.pinClock && !clock.hidden ? clock.getBoundingClientRect().height : 0;
  if (clockHeight && overlaps(clock)) pinTop = Math.max(pinTop,floor);
  if (state.settings.pinSearch && !search.hidden && overlaps(search)) pinTop = Math.max(pinTop,floor-(clockHeight ? clockHeight+12 : 0));
 }
 document.documentElement.style.setProperty('--header-pin-top',pinTop+'px');
 updatePinnedHeader();
}
function renderAvatar() {
 const avatar = state.settings.avatar;
 if (avatar !== renderedAvatar) {
  $('#brand-button').innerHTML = avatar ? `<img class="brand-avatar" src="${esc(avatar)}" alt="" draggable="false">` : '<span class="brand-mark">q</span>';
  renderedAvatar = avatar;
 }
 const preview = $('#avatar-preview',dialog);
 if (preview) preview.innerHTML = avatar ? `<img class="brand-avatar" src="${esc(avatar)}" alt="当前头像">` : '<span class="brand-mark">q</span>';
}
async function uploadAvatar(file,panel) {
 const request = ++avatarRequestSequence, previous = state.settings.avatar, originalState = state;
 const status = $('#avatar-status',panel);
 status.textContent = '正在裁切头像…';
 try {
  if (blockedStorage) throw new Error('请先恢复本机桌面数据，再修改头像。');
  const avatar = await normalizeAvatarFile(file);
  if (request !== avatarRequestSequence || !panel.isConnected || !dialog.open) return;
  if (state !== originalState || state.settings.avatar !== previous) { status.textContent = '桌面已更新，请重新选择头像。'; return; }
  state.settings.avatar = avatar;
  await persist();
  renderAvatar();
  if (request === avatarRequestSequence && panel.isConnected) status.textContent = '已保存头像。点击侧栏头像即可打开设置。';
 } catch (error) {
  if (request !== avatarRequestSequence || !panel.isConnected) return;
  renderAvatar();
  status.textContent = error.message || '头像未能保存，请重试。';
 }
}
async function resetAvatar() {
 if (blockedStorage) throw new Error('请先恢复本机桌面数据，再修改头像。');
 const request = ++avatarRequestSequence, panel = $('#avatar-panel',dialog);
 const current = () => request === avatarRequestSequence && panel?.isConnected && dialog.open;
 state.settings.avatar = null;
 try {
  await persist();
  if (current()) $('#avatar-status',panel).textContent = '已恢复栖页默认图标。';
 } catch (error) {
  if (current()) $('#avatar-status',panel).textContent = error.message || '重置头像未能保存，请重试。';
  throw error;
 } finally { renderAvatar(); }
}
function updateToolbar() {
 const auto = state.settings.toolbarVisibility === 'auto', button = $('#toolbar-visibility');
 $('.top-tools').classList.toggle('auto-hide', auto);
 button.innerHTML = icon(auto ? 'eyeOff' : 'eye');
 button.setAttribute('aria-pressed',String(auto));
 button.setAttribute('aria-label',auto ? '始终显示工具按钮' : '自动隐藏工具按钮');
 button.title = auto ? '工具自动隐藏 · 点击改为始终显示' : '工具始终显示 · 点击改为自动隐藏';
 $('.top-tools [data-action=wallpaper]').hidden = !state.settings.showWallpaperButton;
 const reveal = $('#navigation-reveal');
 reveal.hidden = state.settings.sidebarVisibility === 'always' || state.settings.minimal;
 reveal.setAttribute('aria-expanded',String(document.body.classList.contains('navigation-open')));
}
function applySettings() {
 const s = state.settings;
 const theme = s.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.theme;

 const root = document.documentElement;
 root.dataset.theme = theme;
 root.dataset.material = s.surfaceStyle;
 root.dataset.navigation = s.navigationMode;
 root.dataset.sidebarPosition = s.sidebarPosition;
 root.dataset.sidebarVisibility = s.sidebarVisibility;
 root.dataset.font = s.uiFont;
 const properties = {
  '--gap':s.gap+'px','--tile-size':s.gridSize+'px','--radius':s.radius+'px',
  '--clock-size':s.clockSize+'px','--clock-weight':s.clockWeight,
  '--clock-offset-y':s.clockOffsetY+'px','--search-offset-y':s.searchOffsetY+'px',
  '--search-width':s.searchWidth+'px','--search-height':s.searchHeight+'px','--search-radius':s.searchRadius+'px',
  '--search-opacity':s.searchOpacity/100,'--sidebar-width':s.sidebarWidth+'px','--sidebar-opacity':s.sidebarOpacity/100,
  '--surface-opacity':s.surfaceOpacity/100,'--surface-blur':s.surfaceBlur+'px','--ui-scale':s.uiScale/100,
  '--icon-opacity':s.iconOpacity/100,'--label-size':s.labelSize+'px','--label-color':s.labelColor,
  '--clock-color':s.clockColor,'--desktop-max-width':s.desktopMaxWidth+'px','--accent':s.themeColor,
  '--wallpaper-blur':s.blur+'px','--wallpaper-dim':s.dim/100
 };
 for (const [key,value] of Object.entries(properties)) root.style.setProperty(key,String(value));
 document.body.classList.toggle('minimal', !!s.minimal);
 document.body.classList.toggle('no-labels', !s.showLabels);
 document.body.classList.toggle('no-sidebar-labels', !s.sidebarLabels);
 document.body.classList.toggle('reduce-effects', !!s.reducedEffects);
 document.body.classList.toggle('clock-theme-color', !!s.clockFollowTheme);
 document.body.classList.toggle('pin-clock', s.pinClock && (s.showClock || s.showDate));
 document.body.classList.toggle('pin-search', s.pinSearch && s.showSearch);
 $('#clock-block').hidden = !s.showClock && !s.showDate;
 $('#clock').hidden = !s.showClock;
 $('#date').hidden = !s.showDate;
 $('.search-wrapper').hidden = !s.showSearch;
 if (!s.showSearch) hideSearchMenus();
 $('#daily-quote').hidden = !s.quote;
 renderAvatar(); updateToolbar();
 let wallpaper = WALLPAPERS.find(w=>w.id === s.wallpaper) || WALLPAPERS[0];
 const remote = s.wallpaperApiEnabled && normalizeWallpaperPhoto(s.remoteWallpaper);
 if (s.dailyWallpaper && !s.customWallpaper && !remote) wallpaper = WALLPAPERS[Math.floor(Date.now()/86400000) % WALLPAPERS.length];
 const credit = $('#wallpaper-credit');
 if (credit) {
  credit.hidden = !remote || !!s.customWallpaper;
  if (remote) {credit.href=remote.sourceUrl;credit.textContent=`摄影 ${remote.author} · Picsum`;credit.title='查看壁纸摄影师与照片来源';}
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
 currentGridColumns = Math.max(3,Math.min(16,Math.floor((width + state.settings.gap)/(state.settings.gridSize + state.settings.gap))));
 document.documentElement.style.setProperty('--columns', currentGridColumns);
 $$('.tile[data-size]').forEach(el => { const [w,h] = el.dataset.size.split('x').map(Number); el.style.gridColumn = `span ${Math.min(w,currentGridColumns)}`; el.style.gridRow = `span ${h}`; });
}
function renderGroups() {
 const groups = $('#groups'), oldScroll = [groups.scrollLeft,groups.scrollTop];
 $('#groups').innerHTML = state.groups.map(g=>`<button class="group-button ${g.id === currentGroup().id?'active':''}" data-group="${esc(g.id)}" aria-label="${esc(g.name)}分组" ${g.id===currentGroup().id?'aria-current="page"':''} title="${esc(g.name)} · 右键编辑" draggable="false">${icon(g.icon)}<span>${esc(g.name)}</span></button>`).join('');
 groups.scrollLeft=oldScroll[0];groups.scrollTop=oldScroll[1];
 $('.group-button.active',groups)?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function renderDesktop() {
 desktopDrag?.cancel();
 widgetsCleanup(); applySettings(); renderGroups();
 const group = currentGroup(), switched = renderedGroup && renderedGroup !== group.id;
 state.activeGroupId = group.id; renderedGroup = group.id;
 $('.desktop-wrap').setAttribute('aria-label', `${group.name}桌面`);
 $('.desktop-heading').hidden = !editing;
 document.body.classList.toggle('editing', editing);
 $('#edit-button').classList.toggle('active',editing); $('#edit-button').setAttribute('aria-pressed',String(editing));
 $('#done-editing').hidden = !editing; $('#edit-hint').hidden = !editing;
 const items = state.items.filter(i=>i.groupId === group.id && !i.folderId);

 const desktop = $('#desktop');
 desktop.classList.toggle('group-enter', !!switched && state.settings.animateGroups && !state.settings.reducedEffects);
 desktop.innerHTML = items.map((item,index)=>renderTile(item,index)).join('') +
  (state.settings.showAddTile ? `<div class="tile tile-add"><button class="tile-body" data-action="add" aria-label="添加网站或组件">${icon('plus')}</button><span class="tile-label">添加</span></div>` : '');
 if(!items.length && !state.settings.showAddTile) desktop.innerHTML = '<div class="desktop-empty"><span>给这一页留一些喜欢的内容</span><button class="text-button" data-action="add">添加网站或组件</button></div>';
 bindFaviconImages($('#desktop'));
 widgetsCleanup = bindWidgets($('#desktop'), { getState:()=>state, save:persist, openDialog, toast, rerender:renderDesktop, applyWallpaper:applyOnlineWallpaper, wallpaperEnabledChanged:applySettings });
 updateGrid(); refreshLiveWidgets($('#desktop'), state);
}
function renderTile(item,index=0) {
 const [width,height] = (item.size || '1x1').split('x').map(Number);
 let body = '';
 if (item.type === 'widget') body = `<div class="tile-body">${renderWidget(item,state)}</div>`;
 else if (item.type === 'folder') {
  const children = state.items.filter(i=>i.folderId === item.id).slice(0,4);
  body = `<button class="tile-body" draggable="false" data-open-folder="${esc(item.id)}" aria-label="打开文件夹：${esc(item.title)}"><div class="folder-preview ${children.length?'':'empty'}">${children.length ? children.map(c=>`<span class="mini-site" style="--tile-color:${esc(c.color || '#507ca6')};--tile-ink:${tileInk(c.color)}">${siteGlyph(c)}</span>`).join('') : icon('folder')}</div></button>`;
 } else body = `<a class="tile-body" draggable="false" href="${esc(safeUrl(item.url) || '#')}" data-open-link="${esc(item.id)}" style="--tile-color:${esc(item.color || '#486c91')};--tile-ink:${tileInk(item.color)}" aria-label="打开${esc(item.title)}" target="${state.settings.openNewTab?'_blank':'_self'}" rel="noopener noreferrer">${siteGlyph(item)}</a>`;
 return `<article class="tile tile-${esc(item.type)}" data-item="${esc(item.id)}" data-item-type="${esc(item.type)}" data-size="${width}x${height}" style="grid-column:span ${Math.min(width,currentGridColumns)};grid-row:span ${height};--enter-delay:${Math.min(index,10)*16}ms" draggable="false" aria-label="${esc(item.title)}"><button type="button" class="tile-drag-handle" data-drag-handle aria-label="拖动${esc(item.title)}" title="拖动以调整位置"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h0m6 0h0M5 8h0m6 0h0M5 13h0m6 0h0" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></button><div class="tile-actions"><button data-edit-item="${esc(item.id)}" aria-label="编辑${esc(item.title)}" title="编辑">${icon('edit')}</button><button data-delete-item="${esc(item.id)}" aria-label="移除${esc(item.title)}" title="移除">${icon('close')}</button></div>${body}<span class="tile-label">${esc(item.title)}</span></article>`;
}
function renderEngine() {
 const e = currentEngine(), key = JSON.stringify([e.id,allEngines()]);
 if (key === renderedEngineKey) return;
 renderedEngineKey = key;
 $('#engine-button').innerHTML = `${engineGlyph(e)}${icon('chevron')}`;
 $('#engine-button').title = `${e.name} · 点击切换搜索引擎`;
 $('#engine-button').setAttribute('aria-label',`切换搜索引擎，当前为${e.name}`);
 $('#engine-menu').innerHTML = allEngines().map(en=>`<button class="engine-option ${en.id===e.id?'active':''}" data-engine="${esc(en.id)}">${engineGlyph(en)}<span>${esc(en.name)}</span></button>`).join('') + '<button class="engine-manage" data-action="search-settings">管理搜索引擎 · 支持自定义</button>';
 bindFaviconImages($('#engine-button')); bindFaviconImages($('#engine-menu'));
}
function hideSearchMenus() { $('#engine-menu').hidden = true; $('#engine-button').setAttribute('aria-expanded','false'); $('#search-suggestions').hidden = true; }
function findItems(query) { const q = query.trim().toLocaleLowerCase(); return state.items.filter(i=>i.type==='link' && (!q || `${i.title} ${i.url}`.toLocaleLowerCase().includes(q))); }
function suggestions() {
 const q = $('#search-input').value.trim();
 $('#engine-menu').hidden = true;

 if (!q) {
  const history = readSearchHistory(state.settings.showSearchHistory).slice(0,6);
  $('#search-suggestions').innerHTML = history.length ? '<div class="suggestion-label">最近搜索</div>' + history.map(term=>`<button class="suggestion" data-search-history="${esc(term)}">${icon('history')}<span><strong>${esc(term)}</strong></span></button>`).join('') : '';
  $('#search-suggestions').hidden = !history.length;
  return;
 }

 const found = findItems(q).slice(0,4);
 $('#search-suggestions').innerHTML = `<div class="suggestion-label">${found.length?'我的收藏':'聚合搜索'}</div>` + found.map(i=>`<button class="suggestion" data-suggestion="${esc(i.id)}"><span class="suggestion-site" style="--tile-color:${esc(i.color || COLORS[0])};--tile-ink:${tileInk(i.color)}">${siteGlyph(i)}</span><span><strong>${esc(i.title)}</strong><small>${esc(i.url)}</small></span><span class="suggestion-arrow">↗</span></button>`).join('') + `<button class="suggestion" data-action="submit-search">${icon('search')}<span><strong>使用 ${esc(currentEngine().name)} 搜索「${esc(q.slice(0,48))}」</strong></span><span class="suggestion-arrow">↵</span></button>`;
 bindFaviconImages($('#search-suggestions'));
 $('#search-suggestions').hidden = false;
}
function submitSearch() {
 const q = $('#search-input').value.trim(); if (!q) return $('#search-input').focus();
 let url;
 if (/^https?:\/\//i.test(q) || /^(?:[\w-]+\.)+[\w-]{2,}(?:[\/:?#]|$)/.test(q)) url = safeUrl(q);
 else url = currentEngine().url.replace(/\{q\}/g,encodeURIComponent(q));
 if (!url) return toast('请输入有效的网址或搜索内容。');
 rememberSearch(q,state.settings.showSearchHistory);
 hideSearchMenus(); navigate(url,false,true);
}
function dialogHeader(title,subtitle='') { return `<header class="dialog-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="dialog-close" data-close aria-label="关闭">${icon('close')}</button></header>`; }
function field(name,label,value='',options={}) { return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${options.type || 'text'}" value="${esc(value)}" ${options.required?'required':''} ${options.type==='number'?'step="any"':''} ${options.min!==undefined?`min="${options.min}"`:''} ${options.max!==undefined?`max="${options.max}"`:''} ${options.maxlength?`maxlength="${options.maxlength}"`:''} ${options.placeholder?`placeholder="${esc(options.placeholder)}"`:''}>${options.help?`<small>${esc(options.help)}</small>`:''}</label>`; }
function selectField(name,label,value,options) { return `<label class="field"><span>${esc(label)}</span><select name="${name}">${options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`; }
function formActions(label='保存') { return `<div id="form-error" class="inline-error" hidden></div><div class="button-row"><button class="secondary-button" type="button" data-close>取消</button><button class="primary-button" type="submit">${icon('check')}${esc(label)}</button></div>`; }
function groupOptions() { return state.groups.map(g=>({value:g.id,label:g.name})); }
function colorsHtml(selected) { return `<div class="color-options">${COLORS.map(c=>`<button class="color-option ${c===selected?'selected':''}" style="background:${c}" data-color="${c}" type="button" aria-label="图标颜色 ${c}">${c===selected?icon('check'):''}</button>`).join('')}<input class="color-input" type="color" name="color" aria-label="自定义图标颜色" value="${esc(selected || COLORS[0])}"></div>`; }
function openDialog(kind,data={}) {
 desktopDrag?.cancel();
 hideSearchMenus(); $('#context-menu').hidden = true;
 if (!dialog.open) lastDialogFocus = document.activeElement;
 avatarRequestSequence++;
 dialogKind = kind; dialogData = data;
 dialog.classList.toggle('settings-dialog',kind === 'settings');
 document.body.classList.remove('shortcuts-open');
 $('#shortcuts-button').setAttribute('aria-expanded','false');
 let html = '';
 if (kind === 'add') html = addDialog(data.tab || 'link',data);
 else if (kind === 'edit-item') { const item = state.items.find(i=>i.id===data.id); if (!item) return; html = item.type==='widget'?widgetConfigDialog(item):addDialog(item.type==='folder'?'folder':'link',{item}); }
 else if (kind === 'widget-config') html = widgetConfigDialog(state.items.find(i=>i.id===data.item?.id) || data.item);
 else if (kind === 'weather') { const item = state.items.find(i=>i.widget==='weather') || {id:uid(),widget:'weather',title:'天气',config:{}}; html = widgetConfigDialog(item); }
 else if (kind === 'settings') html = settingsDialog(data.tab || 'general');
 else if (kind === 'sync-review') html = dialogHeader('确认同步桌面','选择要保留的版本，确认后再应用。') + syncController.renderReview(data.result);
 else if (kind === 'wallpaper') html = wallpaperDialog();
 else if (kind === 'group') html = groupDialog(data.id);
 else if (kind === 'local-search') { localScope = 'desktop'; localExtra=[]; html = localSearchDialog(); }
 else if (kind === 'folder') html = folderDialog(data.id);
 else if (kind === 'move') html = moveDialog(data.id);
 else if (kind === 'import-preview') html = importPreviewDialog(data.bookmarks);
 else if (kind === 'restore-preview') html = restorePreviewDialog(data.state);
 else if (kind === 'confirm') html = confirmDialog(data);
 else return;
 $('#dialog-content').innerHTML = html;
 if (!dialog.open) dialog.showModal();
 bindFaviconImages($('#dialog-content'));
 if (kind==='settings') renderAvatar();
 if ($('#link-form',dialog)) updateLinkPreview($('#link-form',dialog));
 if (kind==='local-search') { $('#local-query')?.focus(); renderLocalResults(''); }
 else $('input:not([type=checkbox]):not([type=color]):not([type=range]),select',dialog)?.focus();
}
function closeDialog() { avatarRequestSequence++; if(dialog.open) dialog.close(); dialogKind=''; dialogData={}; if(lastDialogFocus?.isConnected)lastDialogFocus.focus(); }
function addDialog(tab,data) {
 const item = data.item;
 let content = '';
 if (tab === 'widgets') content = `<div class="catalog">${widgetCatalog.map(w=>`<button class="catalog-card" data-add-widget="${esc(w.type)}"><span class="catalog-icon">${icon(iconNames.includes(w.icon)?w.icon:({weather:'sun',calendar:'clock',notes:'note',todo:'check',countdown:'heart',focus:'clock',hotlinks:'ai',workday:'coffee',calculator:'grid',habit:'check',quote:'note',clock:'globe'}[w.type]||'grid'))}</span><span><h3>${esc(w.title)}</h3><p>${esc(w.description)}</p><small>${esc(w.size || '2x2')} 卡片</small></span></button>`).join('')}</div>`;
 else if (tab === 'folder') content = `<form id="folder-form" data-id="${esc(item?.id || '')}">${field('title','文件夹名称',item?.title || '',{required:true,maxlength:24,placeholder:'例如：灵感收藏'})}${selectField('groupId','所在分组',item?.groupId || currentGroup().id,groupOptions())}<p class="help-text">把网站卡片拖到文件夹中央即可收纳。文件夹中可将网站移回桌面。</p>${formActions(item?'保存文件夹':'创建文件夹')}</form>`;
 else content = `<form id="link-form" data-id="${esc(item?.id || '')}"><div class="form-preview"><span class="preview-icon" id="link-preview-icon" style="background:${esc(item?.color || COLORS[0])};--tile-ink:${tileInk(item?.color || COLORS[0])}">${siteGlyph(item || {})}</span><div><strong id="link-preview-title">${esc(item?.title || '一个常去的地方')}</strong><p id="link-preview-url">${esc(item?.url || '把喜欢的网站，放在触手可及的地方')}</p></div></div>${field('url','网站地址',item?.url || '',{required:true,maxlength:2048,placeholder:'https://example.com'})}${field('title','网站名称',item?.title || '',{required:true,maxlength:40,placeholder:'给这个网站起个名字'})}<div class="two-columns">${selectField('iconMode','图标显示',item?.iconMode || 'auto',[{value:'auto',label:'自动获取网站图标'},{value:'text',label:'使用文字 / Emoji'}])}${selectField('groupId','所在分组',item?.groupId || currentGroup().id,groupOptions())}</div><div class="favicon-controls"><button class="secondary-button" type="button" data-action="extract-favicon" ${item?.iconMode==='text'||!safeUrl(item?.url)?'disabled':''}>智能提取</button><p id="favicon-status" class="help-text" role="status" aria-live="polite">自动尝试网站图标；提取时读取该网站的图标声明，失败保留文字。</p></div>${field('icon','文字 / Emoji 回退',item?.icon || '',{maxlength:8,placeholder:'例如：知、G、🌿',help:'网站图标无法加载时显示，也用于文字模式。'})}<div class="field"><span>文字图标背景色</span>${colorsHtml(item?.color || COLORS[0])}</div>${formActions(item?'保存修改':'添加到桌面')}</form>`;
 return dialogHeader(item?'编辑'+(item.type==='folder'?'文件夹':'网站'):'添加到栖页',item?'让你的桌面更合心意。':'网站、组件、文件夹，一起组成你的个人桌面。') + (item?'':`<div class="tab-bar">${[{id:'link',name:'网站',icon:'link'},{id:'widgets',name:'小组件',icon:'grid'},{id:'folder',name:'文件夹',icon:'folder'}].map(t=>`<button class="tab-button ${tab===t.id?'active':''}" data-add-tab="${t.id}">${icon(t.icon)}${t.name}</button>`).join('')}</div>`) + `<div class="dialog-body">${content}</div>`;
}
function groupDialog(id) {
 const g = state.groups.find(g=>g.id===id);
 return dialogHeader(g?'编辑分组':'添加分组','按照工作、兴趣或生活，整理你的常用网站。') + `<div class="dialog-body"><form id="group-form" data-id="${esc(g?.id || '')}">${field('name','分组名称',g?.name || '',{required:true,maxlength:16,placeholder:'例如：阅读'})}<div class="field"><span>分组图标</span><input type="hidden" name="icon" value="${esc(g?.icon || 'home')}"><div class="icon-picker">${['home','code','design','product','ai','game','bookmark','heart','globe','coffee','note','folder'].map(k=>`<button type="button" data-group-icon="${k}" class="${k===(g?.icon || 'home')?'selected':''}" aria-label="${k}">${icon(k)}</button>`).join('')}</div></div>${formActions(g?'保存分组':'创建分组')}</form>${g&&state.groups.length>1?`<div class="button-row"><button class="danger-button" data-delete-group="${esc(g.id)}">删除此分组</button></div>`:''}</div>`;
}
function settingSwitch(key,title,help='') { return `<label class="setting-row"><span class="setting-copy"><strong>${title}</strong>${help?`<small>${help}</small>`:''}</span><input type="checkbox" class="switch" data-setting="${key}" ${state.settings[key]?'checked':''} aria-label="${title}"></label>`; }
function settingRange(key,title,min,max,unit='px') { return `<div class="range-setting"><header><label for="range-${key}">${title}</label><output id="output-${key}">${state.settings[key]}${unit}</output></header><input id="range-${key}" type="range" min="${min}" max="${max}" value="${state.settings[key]}" data-range="${key}" data-unit="${unit}"></div>`; }

function preferenceSelect(key,title,options,help='') {
 return `<label class="setting-row"><span class="setting-copy"><strong>${title}</strong>${help?`<small>${help}</small>`:''}</span><select class="preference-select" data-preference="${key}" aria-label="${title}">${options.map(([value,label])=>`<option value="${value}" ${state.settings[key]===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
}
function settingColor(key,title) {
 return `<label class="setting-row"><span class="setting-copy"><strong>${title}</strong></span><span class="setting-color-value"><code id="color-value-${key}">${esc(state.settings[key])}</code><input type="color" class="color-input" data-setting-color="${key}" value="${esc(state.settings[key])}" aria-label="${title}"></span></label>`;
}
function settingsDialog(tab) {
 const s = state.settings;
 const tabs = [
  {id:'general',name:'打开方式',icon:'link'}, {id:'search',name:'搜索栏',icon:'search'},
  {id:'icons',name:'图标',icon:'grid'}, {id:'clock',name:'时间 / 日期',icon:'clock'},
  {id:'appearance',name:'主题与材质',icon:'sun'}, {id:'layout',name:'布局',icon:'move'},
  {id:'sidebar',name:'侧边栏',icon:'panel'}, {id:'sync',name:'WebDAV 同步',icon:'sync'},
  {id:'data',name:'备份与恢复',icon:'download'}, {id:'about',name:'关于栖页',icon:'info'}
 ];
 if (!tabs.some(item=>item.id===tab)) tab='general';
 let content = '';
 if (tab==='general') content = `
  <div class="section-label">打开方式</div>
  ${settingSwitch('openNewTab','新标签页打开网站','点击桌面图标时保留栖页。')}
  ${settingSwitch('searchNewTab','新标签页打开搜索结果','可独立于网站图标的打开方式设置。')}
  ${settingSwitch('rememberGroup','记住上次打开的分组','关闭后，每次打开栖页从第一个分组开始。')}
  <div class="section-label">桌面工具</div>
  ${preferenceSelect('toolbarVisibility','右上角工具按钮',[['always','始终显示'],['auto','自动隐藏']],'自动隐藏时，移入右上角或用键盘聚焦即可展开。')}
  ${settingSwitch('showWallpaperButton','显示更换壁纸按钮')}
  <div class="section-label">快捷键</div>
  <div class="keyboard-list"><span>聚焦搜索<kbd>/</kbd></span><span>切换引擎<kbd>Tab / Shift Tab</kbd></span><span>搜索桌面收藏<kbd>Ctrl / ⌘ K</kbd></span><span>搜索桌面收藏<kbd>Ctrl / ⌘ F</kbd></span><span>编辑桌面<kbd>E</kbd></span><span>关闭 / 取消拖动<kbd>Esc</kbd></span></div>
  <p class="help-text">Tab 切换仅在搜索框内生效。安装扩展后，Alt + C 可打开本地搜索；可在浏览器的扩展快捷键页面调整。</p>`;
 else if (tab==='search') content = `
  <div class="section-label">搜索栏</div>
  ${settingSwitch('showSearch','显示搜索框')}
  ${settingSwitch('pinSearch','滚动时固定搜索框','与时间分别设置，滚动桌面也能继续搜索。')}
  ${settingRange('searchWidth','宽度',360,960)}
  ${settingRange('searchHeight','高度',36,64)}
  ${settingRange('searchRadius','圆角',0,50)}
  ${settingRange('searchOpacity','透明度',20,100,'%')}
  <p class="help-text">100% 为完全不透明。位置可在“布局”中调整，材质可在“主题与材质”中选择。</p>
  ${settingSwitch('showSearchHistory','保存最近搜索','仅在本机记录最近 20 条。关闭后停止记录，也不再显示。')}
  <div class="button-row"><button class="secondary-button" data-action="clear-search-history">清除最近搜索</button></div>
  <div class="section-label">搜索引擎</div>
  ${selectField('searchEngine','默认搜索引擎',s.searchEngine,allEngines().map(e=>({value:e.id,label:e.name})))}
  <div>${allEngines().map(e=>`<div class="engine-list-row">${engineGlyph(e)}<div class="engine-list-copy"><strong>${esc(e.name)}</strong><small>${esc(e.url)}</small></div><button type="button" class="engine-extract-button" data-extract-engine-icon="${esc(e.id)}" aria-label="提取${esc(e.name)}图标">提取图标</button>${s.customEngines.some(x=>x.id===e.id)?`<button data-delete-engine="${esc(e.id)}" aria-label="删除${esc(e.name)}">${icon('trash')}</button>`:''}</div>`).join('')}</div>
  <div class="section-label">自定义引擎</div><form id="engine-form">
  ${field('name','引擎名称','',{required:true,maxlength:20,placeholder:'例如：我的搜索'})}
  ${field('url','搜索地址模板','',{required:true,maxlength:2048,placeholder:'https://example.com/search?q={q}',help:'用 {q} 代表关键词。支持 http 和 https 地址。'})}
  <div id="form-error" class="inline-error" hidden></div><div class="button-row"><button class="primary-button" type="submit">${icon('plus')}添加引擎</button></div></form>`;
 else if(tab==='icons') content = `
  <div class="section-label">网站图标与卡片</div>
  ${settingRange('gridSize','图标与网格尺寸',48,120)}
  ${settingRange('radius','卡片圆角',0,48)}
  ${settingRange('iconOpacity','网站图标透明度',20,100,'%')}
  ${settingRange('gap','图标间距',8,40)}
  ${settingSwitch('showLabels','显示图标名称')}
  ${settingRange('labelSize','名称字号',10,20)}
  ${settingColor('labelColor','名称颜色')}
  ${settingSwitch('showAddTile','在网格中显示添加按钮','也可以使用右上角 +，或在桌面空白处右键添加。')}
  <p class="help-text">图标优先使用对应网站的 SVG 或清晰位图，失败时保留文字。右键网站 → 编辑 → 智能提取，可以重新读取该网站公开的图标声明。</p>`;
 else if(tab==='clock') content = `
  <div class="section-label">时间</div>
  ${settingSwitch('showClock','显示时间')}
  ${settingSwitch('pinClock','滚动时固定时间','时间与日期共同固定，独立于搜索框设置。')}
  ${settingSwitch('showSeconds','显示秒数','秒与时分字号相同，以更细字重和较淡颜色区分。')}
  ${settingSwitch('hour12','使用 12 小时制')}
  ${settingRange('clockSize','时钟字号',30,160)}
  ${settingRange('clockWeight','时钟字重',200,700,'')}
  ${settingSwitch('clockFollowTheme','时间颜色跟随主题','关闭后使用下方的自定义颜色。')}
  ${settingColor('clockColor','时间颜色')}
  <div class="section-label">日期</div>
  ${settingSwitch('showDate','显示月日')}
  ${settingSwitch('showWeekday','显示星期')}
  ${settingSwitch('showLunar','显示农历')}
  <p class="help-text">点击时间可切换极简模式。字体在“主题与材质”中设置，位置在“布局”中设置。</p>`;
 else if(tab==='appearance') content = `
  <div class="section-label">主题</div>
  <div class="theme-options">${[{id:'light',title:'浅色',icon:'sun'},{id:'dark',title:'深色',icon:'moon'},{id:'auto',title:'跟随系统',icon:'globe'}].map(t=>`<button class="theme-option ${s.theme===t.id?'selected':''}" data-theme="${t.id}" aria-pressed="${s.theme===t.id}">${icon(t.icon)}${t.title}</button>`).join('')}</div>
  ${settingColor('themeColor','主题色')}
  <div class="section-label">界面材质</div>
  <div class="material-options">${[
   ['solid','纯色','清爽的色块表面'],['glass','毛玻璃','通透、柔和的背景模糊'],
   ['acrylic','亚克力','细微纹理与磨砂层次'],['mica','Mica 风格','柔和着色，无背景模糊']
  ].map(([value,name,description])=>`<button class="material-option ${s.surfaceStyle===value?'selected':''}" data-material="${value}" aria-pressed="${s.surfaceStyle===value}"><span class="material-swatch swatch-${value}"></span><strong>${name}</strong><small>${description}</small></button>`).join('')}</div>
  ${settingRange('surfaceOpacity','面板透明度',20,100,'%')}
  ${settingRange('surfaceBlur','模糊强度',0,24)}
  <p class="help-text">侧栏与搜索框可单独设置透明度。纯色和 Mica 风格不使用背景模糊；Mica 风格为网页中的柔和着色效果。</p>
  ${settingSwitch('reducedEffects','减少视觉效果','关闭面板模糊和过渡动画，使用更实的底色。')}
  <div class="section-label">字体</div>
  ${preferenceSelect('uiFont','界面字体',[['inter','Inter + 系统中文'],['system','系统字体']],'Inter 随扩展提供；中文使用设备上的系统字体。')}
  ${settingRange('uiScale','界面文字比例',85,120,'%')}
  <div class="button-row"><button class="secondary-button" data-action="wallpaper">${icon('wallpaper')}壁纸与背景</button></div>`;
 else if(tab==='layout') content = `
  <div class="section-label">桌面布局</div>
  ${settingSwitch('minimal','极简模式','只显示时间、搜索与壁纸；按 Esc 可恢复桌面。')}
  ${settingSwitch('quote','显示页底短句')}
  ${settingSwitch('animateGroups','分组切换动画','图标从下方向上轻滑入场。遵循系统的减少动态效果设置。')}
  ${settingRange('desktopMaxWidth','内容最大宽度',720,2000)}
  <div class="section-label">时间位置</div>
  ${settingRange('clockOffsetX','时间水平偏移',-30,30,'vw')}
  ${settingRange('clockOffsetY','时间垂直偏移',-60,160)}
  <div class="section-label">搜索框位置</div>
  ${settingRange('searchOffsetX','搜索水平偏移',-30,30,'vw')}
  ${settingRange('searchOffsetY','搜索垂直偏移',-40,160)}
  <p class="help-text">水平偏移以窗口宽度为基准，窄屏会自动限制在可见区域。垂直偏移调整排版间距，并保留最小间隔以避免重叠；滚动固定后使用顶部位置。</p>
  <div class="button-row"><button class="secondary-button" data-action="reset-positions">恢复默认位置</button></div>`;
 else if(tab==='sidebar') content = `
  <div class="section-label">头像与设置入口</div>
  <div class="avatar-panel" id="avatar-panel"><div class="avatar-row"><span id="avatar-preview" class="avatar-preview"></span><div><strong>用一张喜欢的图作头像</strong><p>PNG、JPEG、WebP，最大 4 MB。自动裁切成正方形。</p><div class="button-row"><button class="secondary-button" data-action="upload-avatar">${icon('upload')}选择图片</button><button class="text-button" data-action="reset-avatar">恢复默认图标</button></div></div></div><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p class="help-text" id="avatar-status" role="status">头像保存在本机，并随桌面备份与 WebDAV 同步。点击头像即可打开设置。</p></div>
  <div class="section-label">导航形式</div>
  ${preferenceSelect('navigationMode','导航布局',[['sidebar','侧边栏'],['top','顶部导航']])}
  ${preferenceSelect('sidebarPosition','侧边栏位置',[['left','左侧'],['right','右侧']],'左右位置仅用于侧边栏布局。')}
  ${preferenceSelect('sidebarVisibility','导航显示方式',[['always','始终显示'],['auto','自动隐藏'],['hidden','收起']],'收起后可点击边缘的展开按钮；自动隐藏支持鼠标移入与键盘聚焦。')}
  ${settingRange('sidebarWidth','侧边栏宽度',40,120)}
  ${settingRange('sidebarOpacity','导航透明度',0,100,'%')}
  ${settingSwitch('sidebarLabels','显示分组名称')}
  ${settingSwitch('scrollGroups','滚轮切换分组','鼠标在分组栏上滚动即可切换，编辑时用于滚动列表。')}
  <p class="help-text">分组支持右键重命名和编辑图标；编辑桌面时可拖动调整分组顺序。</p>`;
 else if(tab==='data') content = `
  <div class="data-card"><div><strong>导出完整备份</strong><p>包含网址、分组、布局、头像、组件数据和本地壁纸。</p></div><button class="secondary-button" data-action="export">${icon('download')}导出 JSON</button></div>
  <div class="data-card"><div><strong>恢复已有备份</strong><p>导入前可查看内容摘要，确认后替换当前桌面。</p></div><button class="secondary-button" data-action="import">${icon('upload')}导入备份</button></div>
  <div class="data-card"><div><strong>导入浏览器书签</strong><p>选择要复制到当前分组的网站，保留原有书签。</p></div><button class="secondary-button" data-action="import-bookmarks">${icon('bookmark')}选择书签</button></div>
  <p class="help-text">无需注册账号。跨设备可连接自己的 WebDAV；备份不包含 WebDAV 密码、最近搜索或网站图标缓存。</p>
  <div class="section-label">重置设置</div>
  <div class="data-card"><div><strong>恢复默认设置</strong><p>还原显示、搜索、头像与壁纸偏好，保留网站、分组和组件内容。</p></div><button class="secondary-button" data-action="reset-preferences">重置设置</button></div>
  <div class="button-row"><button class="danger-button" data-action="reset">恢复初始桌面</button></div>`;
 else if(tab==='sync') content = syncController.renderPanel();
 else content = `
  <div class="about-block"><span class="brand-mark">q</span><h3>栖页 <span style="font-weight:350">Qiye</span></h3><p>让每一次打开，都有一处喜欢的风景。</p><span class="version-badge">v0.2.3 · 无需账号</span></div>
  <div class="about-features"><div>${icon('grid')}自在的桌面</div><div>${icon('globe')}轻巧的入口</div><div>${icon('heart')}本地的陪伴</div></div>
  <p class="about-note">栖页使用独立代码与原创品牌，提供可自由编排的新标签页。桌面、搜索和日常小组件开箱即用；跨设备同步连接你自己的 WebDAV。</p>
  <p class="about-note">图标直接从对应网站加载；智能提取只在点击时读取页面图标声明。头像与数据默认保存在本机。启用在线壁纸或天气时，会连接相应服务；启用 WebDAV 后，将桌面同步到你填写的服务。</p>
  <p class="about-note">Inter 采用 SIL Open Font License 1.1，随项目本地提供；中文使用系统字体。Mica 风格为轻量网页材质。</p>
  <div class="button-row"><a class="secondary-button" href="https://github.com/Ktclat/qiye" target="_blank" rel="noopener noreferrer">${icon('github')}源代码</a><a class="secondary-button" href="https://github.com/Ktclat/qiye/blob/main/docs/THIRD_PARTY.md" target="_blank" rel="noopener noreferrer">字体与许可</a></div>`;
 const current = tabs.find(item=>item.id===tab);
 return dialogHeader('设置','把栖页调成你喜欢的样子。') + `
 <div class="settings-layout"><nav class="settings-nav" aria-label="设置分类">${tabs.map(t=>`<button class="settings-nav-button ${t.id===tab?'active':''}" data-settings-tab="${t.id}" ${t.id===tab?'aria-current="page"':''}>${icon(t.icon)}<span>${t.name}</span></button>`).join('')}<small>栖页 Qiye · 0.2.3</small></nav>
 <section class="settings-content" aria-label="${current.name}设置"><h3 class="settings-section-title">${current.name}</h3>${content}</section></div>`;
}
function wallpaperDialog() {
 return dialogHeader('换一片风景','公开摄影壁纸、六款渐变背景，或你自己的照片与视频。') + `<div class="dialog-body"><div class="data-card"><div><strong>发现摄影壁纸</strong><p>免密钥公开图片 API，在小组件中浏览、换一张并应用。</p></div><button class="secondary-button" data-action="add-wallpaper-widget">${icon('wallpaper')}打开小组件</button></div><div class="wallpaper-grid">${WALLPAPERS.map(w=>`<button class="wallpaper-option ${w.id===state.settings.wallpaper&&!state.settings.customWallpaper&&!(state.settings.wallpaperApiEnabled&&state.settings.remoteWallpaper)?'selected':''}" style="background:${w.background}" data-wallpaper="${w.id}" aria-label="${w.name}壁纸"><span>${w.name} · ${w.tag}</span>${w.id===state.settings.wallpaper&&!state.settings.customWallpaper&&!(state.settings.wallpaperApiEnabled&&state.settings.remoteWallpaper)?`<i class="selected-badge">${icon('check')}</i>`:''}</button>`).join('')}</div><button class="upload-zone" data-action="upload-wallpaper">${icon('upload')}<span><strong>上传本地壁纸</strong><small>图片或 MP4 / WebM 视频，最大 4 MB</small></span></button>${state.settings.customWallpaper?'<p class="help-text">正在使用你的本地壁纸。选择上方任一背景即可切换。</p>':''}${settingRange('blur','背景模糊',0,20)}${settingRange('dim','背景暗度',0,70,'%')}${settingSwitch('wallpaperApiEnabled','允许公开图片 API','启用后，小组件可获取 Picsum 摄影壁纸；暂停后将显示本地背景。')}${state.settings.remoteWallpaper?`<p class="help-text">已选择在线壁纸：${esc(state.settings.remoteWallpaper.author)}。完整图片由 Picsum 加载。</p>`:''}${settingSwitch('dailyWallpaper','每日轮换内置背景','每天切换一款渐变背景；手动选择的本地或在线壁纸优先显示。')}</div>`;
}
function widgetConfigDialog(item) {
 if(!item) return dialogHeader('组件不存在')+'<div class="dialog-body">请关闭后重试。</div>';
 const type = item.widget, c=item.config || {};
 let content = field('title','卡片名称',item.title,{required:true,maxlength:30});
 if(type==='weather') content += `<div class="two-columns">${selectField('cityPreset','选择城市','',[{value:'',label:'选择常用城市'},{value:'香港|22.32|114.17',label:'香港'},{value:'北京|39.9|116.4',label:'北京'},{value:'上海|31.23|121.47',label:'上海'},{value:'深圳|22.54|114.06',label:'深圳'},{value:'广州|23.13|113.26',label:'广州'},{value:'成都|30.67|104.07',label:'成都'},{value:'台北|25.03|121.56',label:'台北'},{value:'新加坡|1.35|103.82',label:'新加坡'},{value:'东京|35.68|139.69',label:'东京'}])}${field('cityName','城市名称',state.settings.weatherCity.name,{required:true,maxlength:60})}</div><div class="two-columns">${field('latitude','纬度',state.settings.weatherCity.latitude,{type:'number',min:-90,max:90,required:true})}${field('longitude','经度',state.settings.weatherCity.longitude,{type:'number',min:-180,max:180,required:true})}</div><label class="setting-row"><span class="setting-copy"><strong>启用天气服务</strong><small>将城市坐标发送至 Open-Meteo。每 30 分钟更新，离线时显示缓存或错误提示。</small></span><input class="switch" name="weatherEnabled" type="checkbox" ${state.settings.weatherEnabled?'checked':''}></label>`;
 else if(type==='countdown') content += field('eventTitle','纪念日 / 倒数日名称',c.title || state.countdown.title,{required:true,maxlength:40})+field('date','目标日期',c.date || state.countdown.date,{type:'date',required:true});
 else if(type==='focus') content += field('duration','每次专注时长（分钟）',state.focus.duration,{type:'number',min:1,max:180,required:true,help:'保存时会停止当前计时，并开始一轮新的时长。'});
 else if(type==='workday') content += `<div class="two-columns">${field('endTime','下班时间',c.endTime || state.workday.endTime,{type:'time',required:true})}${field('payday','每月发薪日',c.payday || state.workday.payday,{type:'number',min:1,max:31,required:true})}</div><div class="field"><span>工作日</span><div class="color-options">${['日','一','二','三','四','五','六'].map((d,i)=>`<label class="help-text"><input type="checkbox" name="workdays" value="${i}" ${(c.workdays || [1,2,3,4,5]).includes(i)?'checked':''}>周${d}</label>`).join('')}</div></div>`;
 else if(type==='clock') content += field('label','城市显示名称',c.label || '香港',{required:true,maxlength:30})+selectField('timeZone','时区',c.timeZone || 'Asia/Hong_Kong',[{value:'Asia/Hong_Kong',label:'香港 / 北京'},{value:'Asia/Tokyo',label:'东京'},{value:'Asia/Singapore',label:'新加坡'},{value:'Europe/London',label:'伦敦'},{value:'Europe/Paris',label:'巴黎'},{value:'America/New_York',label:'纽约'},{value:'America/Los_Angeles',label:'洛杉矶'},{value:'Australia/Sydney',label:'悉尼'},{value:'UTC',label:'UTC'}]);
 else if(type==='quote') content += `<label class="field"><span>自定义短句（可留空）</span><textarea name="text" maxlength="300" placeholder="写下一句想对自己说的话">${esc(c.text || '')}</textarea></label>${field('author','署名',c.author || '',{maxlength:40})}`;
 else if(type==='notes') content += selectField('color','便签颜色',c.color || 'yellow',[{value:'yellow',label:'奶油黄'},{value:'pink',label:'浅樱粉'},{value:'mint',label:'薄荷绿'}]);
 else content += '<p class="help-text">直接在卡片中使用这个组件。右键卡片可以调整尺寸或位置。</p>';
 content += selectField('size','卡片尺寸',item.size || '2x2',[{value:'2x2',label:'2 × 2 · 标准'},{value:'4x2',label:'4 × 2 · 宽卡片'}]);
 return dialogHeader(`设置${item.title}`,'修改后会保存到当前浏览器。') + `<div class="dialog-body"><form id="widget-form" data-id="${esc(item.id)}" data-type="${esc(type)}">${content}${formActions()}</form></div>`;
}
function localSearchDialog() { return dialogHeader('搜索我的桌面','快速找到收藏。搜索浏览历史时输入关键词，再按 Enter 或点击搜索。')+`<div class="dialog-body"><div class="local-search-input"><input id="local-query" class="text-input" placeholder="搜索名称或网址…" aria-label="本地搜索关键词" autocomplete="off"><button class="secondary-button" data-action="query-local">${icon('search')}搜索</button></div><div class="search-scope"><button class="scope-button active" data-scope="desktop">桌面收藏</button><button class="scope-button" data-scope="bookmarks">浏览器书签</button><button class="scope-button" data-scope="history">浏览历史</button></div><div id="local-results" class="local-results"></div></div>`; }
function renderLocalResults(query) {
 const target=$('#local-results'); if(!target) return;
 const q=query.trim().toLocaleLowerCase();
 const result = (localScope==='desktop'?findItems(q):localExtra.filter(i=>`${i.title} ${i.url}`.toLocaleLowerCase().includes(q))).slice(0,50);
 target.innerHTML = result.length ? result.map(i=>`<button class="suggestion" data-url="${esc(i.url)}"><span class="suggestion-site" style="--tile-color:${esc(i.color || COLORS[0])};--tile-ink:${tileInk(i.color)}">${siteGlyph(i)}</span><span><strong>${esc(i.title || i.url)}</strong><small>${esc(i.url)}</small></span><span class="suggestion-arrow">↗</span></button>`).join('') : `<div class="local-empty">${q?'没有找到匹配的网站。':'这里还没有可显示的内容。'}<br>试试另一个关键词，或切换搜索范围。</div>`;
 bindFaviconImages(target);
}
async function chooseLocalScope(scope) {
 localScope=scope; localExtra=[]; $$('.scope-button',dialog).forEach(b=>b.classList.toggle('active',b.dataset.scope===scope));
 const token=++searchToken, query=$('#local-query')?.value || '';
 if(scope==='desktop') return renderLocalResults(query);
 if(scope==='history' && !query.trim()) { $('#local-results').innerHTML='<div class="local-empty">输入关键词，再按 Enter 或点击搜索。<br>首次查询时，浏览器会询问是否允许读取历史记录。</div>'; $('#local-query').focus(); return; }
 $('#local-results').innerHTML = '<div class="local-empty">正在读取，请在浏览器提示中选择是否授权…</div>';
 try { const rows = scope==='bookmarks' ? await requestBookmarks() : await searchHistory(query); if(token!==searchToken || !$('#local-results'))return; localExtra=rows; renderLocalResults($('#local-query')?.value || ''); }
 catch(err) { if(token!==searchToken || !$('#local-results'))return; $('#local-results').innerHTML = `<div class="local-empty">${esc(err.message)}<br><button class="secondary-button" data-scope="${scope}">重新尝试</button></div>`; }
}
function folderDialog(id) {
 const folder=state.items.find(i=>i.id===id); if(!folder)return dialogHeader('文件夹已移除');
 const items=state.items.filter(i=>i.folderId===id);
 return dialogHeader(folder.title,`${items.length} 个网站 · 点击右上角箭头可移回桌面`) + `<div class="dialog-body"><div class="folder-grid">${items.map(i=>`<div class="folder-item"><a class="folder-site" data-open-link="${esc(i.id)}" href="${esc(i.url)}" target="${state.settings.openNewTab?'_blank':'_self'}" rel="noopener noreferrer" style="--tile-color:${esc(i.color)}" aria-label="打开${esc(i.title)}">${siteGlyph(i)}</a><span>${esc(i.title)}</span><button class="remove-folder-item" data-unfolder="${esc(i.id)}" title="移回桌面" aria-label="将${esc(i.title)}移回桌面">${icon('upload')}</button></div>`).join('')}</div>${!items.length?'<div class="local-empty">文件夹还是空的。<br>把网站拖到这个文件夹中央即可收纳。</div>':''}<div class="button-row"><button class="secondary-button" data-edit-item="${esc(id)}">${icon('edit')}编辑文件夹</button><button class="primary-button" data-close>完成</button></div></div>`;
}
function moveDialog(id) {
 const item=state.items.find(i=>i.id===id);if(!item)return '';
 const folders=state.items.filter(i=>i.type==='folder'&&i.id!==id);
 return dialogHeader('移动「'+item.title+'」')+`<div class="dialog-body"><form id="move-form" data-id="${esc(id)}">${selectField('groupId','目标分组',item.groupId,groupOptions())}${item.type==='link'?selectField('folderId','放入文件夹',item.folderId || '',[{value:'',label:'直接放在分组桌面'},...folders.map(i=>({value:i.id,label:`${state.groups.find(g=>g.id===i.groupId)?.name || ''} / ${i.title}`}))]):''}<p class="help-text">选择文件夹时，将使用该文件夹所在的分组。</p>${formActions('移动')}</form></div>`;
}
function importPreviewDialog(bookmarks) {
 return dialogHeader('导入浏览器书签',`找到 ${bookmarks.length} 个可导入网站。请选择需要的内容。`)+`<div class="dialog-body"><form id="bookmarks-form">${selectField('groupId','导入到分组',currentGroup().id,groupOptions())}<label class="help-text"><input type="checkbox" id="bookmark-select-all"> 全选 / 取消全选</label><div class="bookmark-list">${bookmarks.map((b,i)=>`<label class="bookmark-row"><input name="bookmark" type="checkbox" value="${i}"><span class="bookmark-copy">${esc(b.title || b.url)}<small>${esc(b.url)}</small></span></label>`).join('')}</div>${formActions('导入所选网站')}</form></div>`;
}
function restorePreviewDialog(restored) { return dialogHeader('恢复备份','请先确认备份内容。恢复后会替换当前桌面。')+`<div class="dialog-body"><div class="about-features"><div><strong>${restored.groups.length}</strong><p>个分组</p></div><div><strong>${restored.items.length}</strong><p>个桌面项目</p></div><div><strong>${restored.todos.length}</strong><p>条待办</p></div></div><p class="help-text">备份中的网址、便签、组件设置和壁纸将一并恢复。可以先导出当前桌面，保留一份副本。</p>${restored.settings.weatherEnabled?`<p class="help-text">此备份已开启天气。恢复后会将「${esc(restored.settings.weatherCity.name)}」的城市坐标发送至 Open-Meteo 获取预报。</p>`:''}<div class="button-row"><button class="secondary-button" data-action="export">先备份当前桌面</button><button class="primary-button" data-action="confirm-restore">确认恢复</button></div></div>`; }
function confirmDialog(data) { return dialogHeader(data.title)+`<div class="dialog-body"><p class="help-text">${esc(data.message)}</p><div class="button-row"><button class="secondary-button" data-close>取消</button><button class="danger-button" data-action="confirm-callback">${esc(data.label || '确认')}</button></div></div>`; }

async function addWidget(type) {
 const w=widgetCatalog.find(x=>x.type===type); if(!w)return;
 const item={id:uid(),groupId:currentGroup().id,type:'widget',widget:type,title:w.title,size:w.size || '2x2',config:{}};
 state.items.push(item);await commit();closeDialog();toast(`已添加${w.title}，右键可调整设置。`);
}
async function removeItem(id) {
 const item=state.items.find(i=>i.id===id); if(!item)return;
 const removed=clone(item), oldIndex=state.items.indexOf(item), childIds=state.items.filter(i=>i.folderId===id).map(i=>i.id);
 if(item.type==='folder')state.items.forEach(i=>{if(i.folderId===id)i.folderId=null;});
 state.items=state.items.filter(i=>i.id!==id); await commit();
 toast(item.type==='folder'?'文件夹已移除，里面的网站已移回桌面。':`已移除${item.title}`,async()=>{
  if(!state.groups.some(g=>g.id===removed.groupId))removed.groupId=currentGroup().id;
  if(removed.folderId&&!state.items.some(i=>i.id===removed.folderId))removed.folderId=null;
  if(!state.items.some(i=>i.id===removed.id))state.items.splice(Math.min(oldIndex,state.items.length),0,removed);
  if(removed.type==='folder')state.items.forEach(i=>{if(childIds.includes(i.id)&&!i.folderId&&i.groupId===removed.groupId)i.folderId=removed.id;});
  await commit();toast('已撤销移除。');
 });
}
async function moveItem(id,targetGroup,folderId=null) {
 const item=state.items.find(i=>i.id===id); if(!item)return;
 item.groupId=targetGroup;if(item.type==='link')item.folderId=folderId;
 if(item.type==='folder')state.items.forEach(i=>{if(i.folderId===id)i.groupId=targetGroup;});
 await commit();
}
function exportBackup(source=state) {
 const data=exportState(source);const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=`Qiye-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast('备份已导出。');
}
async function importBookmarks(button) {
 if(button)button.disabled=true;
 try { const bookmarks=await requestBookmarks(); if(!bookmarks.length)return toast('浏览器中没有可导入的 http / https 书签。'); openDialog('import-preview',{bookmarks}); }
 catch(err){toast(err.message);}
 finally{if(button?.isConnected)button.disabled=false;}
}
function contextButton(action,label,glyph='grid',extra='') { return `<button role="menuitem" data-context="${action}" ${extra}>${icon(glyph)}${label}</button>`; }
function openContext(event,{itemId,groupId}={}) {
 event.preventDefault(); hideSearchMenus();
 const menu=$('#context-menu');menu.dataset.item=itemId || '';menu.dataset.group=groupId || '';
 const item=state.items.find(i=>i.id===itemId),group=state.groups.find(g=>g.id===groupId);
 let html;
 if(item) html = `${contextButton('edit','编辑'+(item.type==='widget'?'组件':item.type==='folder'?'文件夹':'网站'),'edit')}${contextButton('move','移动到…','move')}${contextButton('duplicate','复制一份','copy')}<hr><div class="menu-label">卡片尺寸</div><div class="size-options">${(item.type==='widget'?['2x2','4x2']:['1x1','2x1','2x2','4x2']).map(s=>`<button data-context="resize" data-size="${s}" class="${item.size===s?'selected':''}">${s.replace('x',' × ')}</button>`).join('')}</div><hr>${contextButton('delete','移除','trash','class="danger"')}`;
 else if(group)html=`${contextButton('edit-group','编辑分组','edit')}${state.groups.length>1?contextButton('delete-group','删除分组','trash','class="danger"'):''}`;
 else html=`${contextButton('add-link','添加网站','link')}${contextButton('add-widget','添加组件','grid')}${contextButton('add-folder','新建文件夹','folder')}<hr>${contextButton('edit-desktop',editing?'完成编辑':'编辑桌面','edit')}${contextButton('wallpaper','更换壁纸','wallpaper')}${contextButton('local-search','本地搜索','search')}<hr>${contextButton('export','立即备份','download')}${contextButton('settings','设置','settings')}`;
 menu.innerHTML=html;menu.hidden=false;
 const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-r.height-8))+'px';
}
function confirmDeleteGroup(id) {
 const group=state.groups.find(g=>g.id===id);if(!group || state.groups.length<2)return;
 const target=state.groups.find(g=>g.id!==id);
 openDialog('confirm',{title:`删除「${group.name}」分组？`,message:`其中的网站和组件会移到「${target.name}」，内容会保留。`,label:'删除分组',callback:async()=>{
  const oldGroup=clone(group),oldIndex=state.groups.indexOf(group),movedIds=state.items.filter(i=>i.groupId===id).map(i=>i.id);
  state.groups=state.groups.filter(g=>g.id!==id);state.items.forEach(i=>{if(i.groupId===id)i.groupId=target.id;});state.activeGroupId=target.id;await commit();closeDialog();
  toast('分组已删除，内容已保留。',async()=>{
   if(!state.groups.some(g=>g.id===id))state.groups.splice(Math.min(oldIndex,state.groups.length),0,oldGroup);
   const eligible=new Set(state.items.filter(i=>movedIds.includes(i.id)&&i.groupId===target.id).map(i=>i.id));
   state.items.forEach(i=>{if(eligible.has(i.id)&&(!i.folderId||eligible.has(i.folderId)))i.groupId=id;});
   state.activeGroupId=id;await commit();toast('已恢复分组。');
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
 if(target.hasAttribute('data-drag-handle'))return;
 if(target.dataset.extractEngineIcon)return await extractEngineFavicon(target);
 if(target.dataset.group){state.activeGroupId=target.dataset.group;await commit();document.body.classList.remove('navigation-open');updateToolbar();return;}
 if(target.dataset.engine){state.settings.searchEngine=target.dataset.engine;await persist();renderEngine();hideSearchMenus();$('#search-input').focus();return;}
 if(target.dataset.searchHistory){$('#search-input').value=target.dataset.searchHistory;submitSearch();return;}
 if(target.dataset.suggestion){const item=state.items.find(i=>i.id===target.dataset.suggestion);if(item)navigate(item.url);hideSearchMenus();return;}
 if(target.dataset.openLink){if(editing){event.preventDefault();openDialog('edit-item',{id:target.dataset.openLink});}return;}
 if(target.dataset.openFolder)return openDialog('folder',{id:target.dataset.openFolder});
 if(target.dataset.editItem)return openDialog('edit-item',{id:target.dataset.editItem});
 if(target.dataset.deleteItem){await removeItem(target.dataset.deleteItem);return;}
 if(target.dataset.addTab)return openDialog('add',{tab:target.dataset.addTab});
 if(target.dataset.addWidget)return await addWidget(target.dataset.addWidget);
 if(target.dataset.settingsTab)return openDialog('settings',{tab:target.dataset.settingsTab});
 if(target.dataset.color){const form=target.closest('form');$('input[name=color]',form).value=target.dataset.color;$$('[data-color]',form).forEach(b=>{b.classList.toggle('selected',b===target);b.innerHTML=b===target?icon('check'):'';});if(form.id==='link-form')updateLinkPreview(form);return;}
 if(target.dataset.groupIcon){$('input[name=icon]',dialog).value=target.dataset.groupIcon;$$('[data-group-icon]',dialog).forEach(b=>b.classList.toggle('selected',b===target));return;}
 if(target.dataset.theme){state.settings.theme=target.dataset.theme;applySettings();await persist();openDialog('settings',{tab:'appearance'});return;}
 if(target.dataset.material){state.settings.surfaceStyle=target.dataset.material;applySettings();await persist();$$('[data-material]',dialog).forEach(button=>{const selected=button===target;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});return;}
 if(target.dataset.wallpaper){state.settings.wallpaper=target.dataset.wallpaper;state.settings.customWallpaper=null;state.settings.remoteWallpaper=null;state.settings.dailyWallpaper=false;await persist();applySettings();openDialog('wallpaper');return;}
 if(target.dataset.deleteEngine){state.settings.customEngines=state.settings.customEngines.filter(e=>e.id!==target.dataset.deleteEngine);if(state.settings.searchEngine===target.dataset.deleteEngine)state.settings.searchEngine=ENGINES[0].id;await persist();renderEngine();openDialog('settings',{tab:'search'});return;}
 if(target.dataset.scope)return await chooseLocalScope(target.dataset.scope);
 if(target.dataset.url)return navigate(target.dataset.url);
 if(target.dataset.unfolder){const item=state.items.find(i=>i.id===target.dataset.unfolder);if(!item)return;const id=item.folderId;item.folderId=null;await commit();openDialog('folder',{id});toast('已移回桌面。');return;}
 if(target.dataset.deleteGroup)return confirmDeleteGroup(target.dataset.deleteGroup);
 if(target.dataset.context){
  const menu=$('#context-menu'),id=menu.dataset.item,groupId=menu.dataset.group,action=target.dataset.context;menu.hidden=true;
  if(action==='edit')return openDialog('edit-item',{id});
  if(action==='move')return openDialog('move',{id});
  if(action==='delete')return await removeItem(id);
  if(action==='resize'){const item=state.items.find(i=>i.id===id);if(item){item.size=target.dataset.size;await commit();}return;}
  if(action==='duplicate'){const item=state.items.find(i=>i.id===id);if(item){const copy={...clone(item),id:uid(),title:item.title+' 副本'};state.items.push(copy);if(item.type==='folder')state.items.filter(i=>i.folderId===id).forEach(child=>state.items.push({...clone(child),id:uid(),folderId:copy.id}));await commit();toast('已复制到桌面。');}return;}
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
 if(action==='upload-avatar')return $('#avatar-file',dialog)?.click();
 if(action==='reset-avatar')return await resetAvatar();
 if(action==='clear-search-history'){clearSearchHistory();hideSearchMenus();toast('最近搜索已清除。');return;}
 if(action==='reset-positions'){for(const key of ['clockOffsetX','clockOffsetY','searchOffsetX','searchOffsetY'])state.settings[key]=0;applySettings();await persist();openDialog('settings',{tab:'layout'});return;}
 if(action==='reset-preferences')return openDialog('confirm',{title:'恢复默认设置？',message:'显示、搜索、头像和壁纸偏好将恢复默认。网站、分组、笔记与待办会保留。',label:'重置设置',callback:async()=>{
  const previous=clone(state.settings);state.settings=clone(DEFAULT_STATE.settings);avatarRequestSequence++;
  await commit();openDialog('settings');toast('已恢复默认设置。',async()=>{state.settings=previous;await commit();if(dialog.open)openDialog('settings');toast('已撤销重置设置。');});
 }});
 if(action==='extract-favicon')return await extractLinkFavicon(target);
 if(action?.startsWith('webdav-'))return await syncController.handleAction(action);
 if(action==='open-sync')return openDialog('settings',{tab:'sync'});
 if(action==='add-wallpaper-widget'){
  const existing=state.items.find(i=>i.type==='widget'&&i.widget==='wallpaper');
  if(existing){state.activeGroupId=existing.groupId;await commit();closeDialog();document.querySelector(`[data-item="${CSS.escape(existing.id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});toast('壁纸小组件在这里。');}
  else await addWidget('wallpaper');
  return;
 }
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
 if(action==='confirm-restore'){const restored=dialogData.state,backup=clone(state);state=restored;blockedStorage=false;await persist({replace:true});renderDesktop();closeDialog();toast('备份已恢复。',async()=>{backup.updatedAt=state.updatedAt;state=backup;await commit();toast('已回到恢复前的桌面。');});return;}
 if(action==='reset')return openDialog('confirm',{title:'恢复初始桌面？',message:'当前网址、笔记、待办和壁纸将被初始内容替换。已开启的 WebDAV 自动同步会继续同步这一变化，建议先在数据设置中导出备份。',label:'恢复初始桌面',callback:async()=>{const backup=clone(state);state=clone(DEFAULT_STATE);blockedStorage=false;await persist({replace:true});renderDesktop();closeDialog();toast('已恢复初始桌面。',async()=>{backup.updatedAt=state.updatedAt;state=backup;await commit();toast('已撤销恢复。');});}});
 if(action==='confirm-callback'){const callback=dialogData.callback;if(callback)await callback();return;}
 if(target.id==='engine-button'){const menu=$('#engine-menu');menu.hidden=!menu.hidden;$('#search-suggestions').hidden=true;target.setAttribute('aria-expanded',String(!menu.hidden));return;}
 if(target.id==='brand-button')return openDialog('settings');
 if(target.id==='toolbar-visibility'){state.settings.toolbarVisibility=state.settings.toolbarVisibility==='always'?'auto':'always';updateToolbar();await persist();return;}
 if(target.id==='shortcuts-button'){const open=document.body.classList.toggle('shortcuts-open');document.body.classList.toggle('shortcuts-dismissed',!open);target.setAttribute('aria-expanded',String(open));return;}
 if(target.id==='navigation-reveal'){document.body.classList.toggle('navigation-open');updateToolbar();return;}
 if(target.id==='done-editing'){editing=false;renderDesktop();return;}
 }catch(err){if(!err.notified)toast(err.message || '操作没有完成，请重试。');}
 if(!event.target.closest('.search-wrapper'))hideSearchMenus();
 if(!event.target.closest('.context-menu'))$('#context-menu').hidden=true;
});

dialog.addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target;const data=new FormData(form);const value=name=>String(data.get(name) || '').trim();
 const submit=$('button[type=submit]',form);if(submit)submit.disabled=true;
 try {
  if(form.id==='webdav-form'){await syncController.saveFromForm(form);return;}
  if(form.id==='link-form'){
   const url=safeUrl(value('url'));if(!url)throw new Error('请输入有效的 http 或 https 网站地址。');
   if(!value('title'))throw new Error('请填写网站名称。');
   const old=state.items.find(i=>i.id===form.dataset.id),groupId=value('groupId');
   const item={...(old || {}),id:old?.id || uid(),type:'link',title:value('title'),url,icon:value('icon') || value('title').slice(0,2),iconMode:value('iconMode')==='text'?'text':'auto',color:value('color') || COLORS[0],groupId,size:old?.size || '1x1',folderId:old?.groupId===groupId?old.folderId:null};
   if(old)state.items[state.items.indexOf(old)]=item;else state.items.push(item);
   await commit();closeDialog();toast(old?'网站已更新。':'已添加到桌面。');
  }else if(form.id==='folder-form'){
   const old=state.items.find(i=>i.id===form.dataset.id),groupId=value('groupId');
   if(old){old.title=value('title');old.groupId=groupId;state.items.forEach(i=>{if(i.folderId===old.id)i.groupId=groupId;});}
   else state.items.push({id:uid(),groupId,type:'folder',title:value('title'),icon:'folder',color:'#719295',size:'2x2'});
   await commit();closeDialog();toast('文件夹已保存。');
  }else if(form.id==='group-form'){
   const old=state.groups.find(g=>g.id===form.dataset.id);
   if(old){old.name=value('name');old.icon=value('icon');}else{const g={id:uid(),name:value('name'),icon:value('icon')};state.groups.push(g);state.activeGroupId=g.id;}
   await commit();closeDialog();toast('分组已保存。');
  }else if(form.id==='engine-form'){
   if(state.settings.customEngines.length>=12)throw new Error('最多支持 12 个自定义引擎，请先删除不再使用的引擎。');
   const template=value('url');if(!template.includes('{q}'))throw new Error('搜索地址需要包含 {q} 占位符。');if(!safeUrl(template.replace(/\{q\}/g,'test')))throw new Error('搜索地址必须使用 http 或 https。');
   state.settings.customEngines.push({id:uid(),name:value('name'),letter:value('name').slice(0,1),color:'#83cbb2',url:template});await persist();renderEngine();openDialog('settings',{tab:'search'});toast('搜索引擎已添加。');
  }else if(form.id==='widget-form'){
   const item=state.items.find(i=>i.id===form.dataset.id),type=form.dataset.type;if(!item)throw new Error('组件已被移除，请重新添加。');
   item.title=value('title');item.size=value('size');const c=item.config || (item.config={});
   if(type==='weather'){const latitude=Number(value('latitude')),longitude=Number(value('longitude'));if(!Number.isFinite(latitude)||latitude<-90||latitude>90||!Number.isFinite(longitude)||longitude<-180||longitude>180)throw new Error('请填写有效的经纬度。');state.settings.weatherCity={name:value('cityName'),latitude,longitude};state.settings.weatherEnabled=data.has('weatherEnabled');}
   if(type==='countdown'){c.title=value('eventTitle');c.date=value('date');}
   if(type==='focus'){const duration=Number(value('duration'));if(!Number.isInteger(duration)||duration<1||duration>180)throw new Error('专注时长需为 1–180 分钟。');state.focus={duration,remaining:duration*60,endAt:null,running:false};}
   if(type==='workday'){c.endTime=value('endTime');c.payday=Number(value('payday'));c.workdays=data.getAll('workdays').map(Number);}
   if(type==='clock'){c.timeZone=value('timeZone');c.label=value('label');}
   if(type==='quote'){c.text=value('text');c.author=value('author');}
   if(type==='notes')c.color=value('color');
   await commit();closeDialog();toast('组件设置已保存。');
  }else if(form.id==='move-form'){
   const folder=state.items.find(i=>i.id===value('folderId')&&i.type==='folder');await moveItem(form.dataset.id,folder?.groupId || value('groupId'),folder?.id || null);closeDialog();toast('已移动。');
  }else if(form.id==='bookmarks-form'){
   const selected=data.getAll('bookmark').map(Number);if(!selected.length)throw new Error('请至少选择一个网站。');
   const groupId=value('groupId');let count=0;
   for(const index of selected){const b=dialogData.bookmarks[index];if(!b || state.items.some(i=>i.groupId===groupId&&i.url===b.url))continue;state.items.push({id:uid(),groupId,type:'link',title:b.title || new URL(b.url).hostname,url:b.url,icon:(b.title || new URL(b.url).hostname).slice(0,2),iconMode:'auto',color:COLORS[count%COLORS.length],size:'1x1',folderId:null});count++;}
   await commit();closeDialog();toast(`已导入 ${count} 个网站，相同分组内的重复网址已跳过。`);
  }
 }catch(err){const area=$('#form-error',form);if(area){area.textContent=err.message || '保存失败，请检查填写内容。';area.hidden=false;}else toast(err.message);}
 finally{if(submit?.isConnected)submit.disabled=false;}
});

document.addEventListener('input', event=>{
 const input=event.target;
 if(input.id==='search-input')suggestions();
 if(input.id==='local-query')renderLocalResults(input.value);
 if(input.dataset.settingColor){state.settings[input.dataset.settingColor]=input.value;const output=$('#color-value-'+input.dataset.settingColor);if(output)output.textContent=input.value;applySettings();}
 if(input.dataset.range){state.settings[input.dataset.range]=Number(input.value);$(`#output-${input.dataset.range}`).textContent=input.value+(input.dataset.unit || '');applySettings();}
 if(input.closest('#link-form'))updateLinkPreview(input.form);
});
document.addEventListener('change',async event=>{
 const input=event.target;
 try{
  if(input.id==='avatar-file'){const file=input.files?.[0],panel=input.closest('#avatar-panel');input.value='';if(file&&panel)await uploadAvatar(file,panel);return;}
  if(input.dataset.preference){state.settings[input.dataset.preference]=input.value;document.body.classList.remove('navigation-open');applySettings();await persist();if(['navigationMode','sidebarVisibility'].includes(input.dataset.preference))renderGroups();updateHeaderPlacement();return;}
  if(input.dataset.settingColor){await persist();return;}
  if(input.name==='iconMode' && input.closest('#link-form')){updateLinkPreview(input.form);return;}
  if(input.dataset.setting){state.settings[input.dataset.setting]=input.checked;applySettings();await persist();if(['wallpaperApiEnabled','showAddTile'].includes(input.dataset.setting))renderDesktop();return;}
  if(input.dataset.range){await persist();return;}
  if(input.name==='searchEngine'&&dialogKind==='settings'){state.settings.searchEngine=input.value;await persist();renderEngine();return;}
  if(input.name==='cityPreset'&&input.value){const [name,lat,lon]=input.value.split('|');const f=input.form;f.elements.cityName.value=name;f.elements.latitude.value=lat;f.elements.longitude.value=lon;return;}
  if(input.id==='bookmark-select-all'){$$('input[name=bookmark]',dialog).forEach(c=>c.checked=input.checked);return;}
  if(input.id==='backup-file'){
   const file=input.files?.[0];input.value='';if(!file)return;if(file.size>6*1024*1024)throw new Error('备份文件过大，最大支持 6 MB。');
   const restored=validateImport(await file.text());openDialog('restore-preview',{state:restored});return;
  }
  if(input.id==='wallpaper-file'){
   const file=input.files?.[0];input.value='';if(!file)return;if(file.size>4*1024*1024)throw new Error('壁纸最大支持 4 MB，请先压缩图片或视频。');
   if(!/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm))$/.test(file.type))throw new Error('请使用 PNG、JPEG、WebP、GIF、AVIF 图片或 MP4、WebM 视频。');
   const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('文件读取失败'));reader.readAsDataURL(file);});
   const old=clone(state.settings);state.settings.customWallpaper=url;state.settings.customWallpaperType=file.type.startsWith('video/')?'video':'image';state.settings.remoteWallpaper=null;
   try{await persist();}catch(err){state.settings=old;throw err;}
   applySettings();openDialog('wallpaper');toast('本地壁纸已保存。');
  }
 }catch(err){if(input.dataset.setting||input.dataset.range||input.dataset.preference||input.dataset.settingColor)renderDesktop();if(!err.notified)toast(err.message || '操作没有完成。');}
});

$('#search-input').addEventListener('focus',suggestions);
$('.shortcuts-control').addEventListener('pointerenter',()=>document.body.classList.remove('shortcuts-dismissed'));
$('#shortcuts-button').addEventListener('focus',()=>document.body.classList.remove('shortcuts-dismissed'));
$('#groups').addEventListener('wheel',event=>{
 if(!state.settings.scrollGroups || editing || dialog.open || desktopDrag?.isDragging() || event.ctrlKey || event.metaKey)return;
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
 if(event.key==='Escape'){document.body.classList.remove('shortcuts-open','navigation-open');document.body.classList.add('shortcuts-dismissed');$('#shortcuts-button').setAttribute('aria-expanded','false');updateToolbar();hideSearchMenus();$('#context-menu').hidden=true;if(dialog.open)return; if(editing){editing=false;renderDesktop();}else if(state.settings.minimal){state.settings.minimal=false;applySettings();persist().catch(()=>{});}return;}
 if(event.key==='Enter'&&event.target.id==='local-query'){event.preventDefault();if(localScope==='history')chooseLocalScope('history').catch(err=>toast(err.message));else renderLocalResults(event.target.value);return;}
 const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
 if((event.ctrlKey||event.metaKey)&&['k','f'].includes(event.key.toLowerCase())){event.preventDefault();openDialog('local-search');return;}
 if(typing||dialog.open)return;
 if(event.key==='/'){event.preventDefault();if(state.settings.showSearch)$('#search-input').focus();else openDialog('local-search');}
 if(event.key.toLowerCase()==='e'){editing=!editing;renderDesktop();}
});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
dialog.addEventListener('close',()=>{avatarRequestSequence++;searchToken++;dialogKind='';});
document.addEventListener('contextmenu',event=>{if(dialog.open || /INPUT|TEXTAREA/.test(event.target.tagName))return;const tile=event.target.closest('[data-item]'),group=event.target.closest('[data-group]');openContext(event,{itemId:tile?.dataset.item,groupId:group?.dataset.group});});
async function applyDesktopDrop(intent) {
 if (intent.kind === 'group-reorder') {
  const ordered = reorderById(state.groups,intent.groupId,intent.targetId,intent.position);
  if (ordered === state.groups) return;
  state.groups = ordered; await commit(); return;
 }
 const item = state.items.find(entry => entry.id === intent.itemId);
 if (!item) return;
 if (intent.kind === 'reorder') {
  const target = state.items.find(entry => entry.id === intent.targetId);
  if (!target || item.groupId !== target.groupId || item.folderId || target.folderId) return;
  const ordered = reorderById(state.items,item.id,target.id,intent.position);
  if (ordered === state.items) return;
  state.items = ordered; await commit(); return;
 }
 if (!state.groups.some(group => group.id === intent.groupId)) return;
 if (intent.kind === 'folder') {
  const folder = state.items.find(entry => entry.id === intent.folderId && entry.type === 'folder' && entry.groupId === intent.groupId);
  if (!folder || item.type !== 'link') return;
  await moveItem(item.id,folder.groupId,folder.id); toast('已收进文件夹。'); return;
 }
 if (intent.kind === 'group') {
  await moveItem(item.id,intent.groupId); toast('已移动到所选分组。'); return;
 }
 if (intent.kind === 'append') {
  item.groupId = intent.groupId;
  if (item.type === 'link') item.folderId = null;
  if (item.type === 'folder') state.items.forEach(child => { if (child.folderId === item.id) child.groupId = intent.groupId; });
  state.items = [...state.items.filter(entry => entry.id !== item.id),item];
  await commit();
 }
}

async function init() {
 try{state=await loadState();persistedState=clone(state);if(!state.settings.rememberGroup)state.activeGroupId=state.groups[0].id;}catch(err){blockedStorage=true;toast(err.message);}
 syncController=createSyncController({
  getState:()=>clone(state), beforeSync:async()=>{await saveQueue;if(blockedStorage)throw new Error('请先恢复本机桌面数据，再进行同步。');if(JSON.stringify(state)!==JSON.stringify(persistedState))await persist({fromSync:true});},
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
  onError:err=>{renderDesktop();if(!err.notified)toast(err.message || '移动未保存，请重试。');}
 });
 renderDesktop();
 subscribeState(incoming=>{if(saving || !incoming || incoming.updatedAt===state.updatedAt)return;state=incoming;persistedState=clone(incoming);if(!dialog.open&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || ''))renderDesktop();});
 new ResizeObserver(updateGrid).observe($('.desktop-wrap'));
 new ResizeObserver(updateHeaderPlacement).observe($('#clock-block'));
 window.addEventListener('resize',updateHeaderPlacement,{passive:true});
 document.fonts?.ready.then(updateHeaderPlacement);
 window.addEventListener('scroll',updatePinnedHeader,{passive:true});
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applySettings);
 setInterval(()=>{renderClock();if(!document.hidden)refreshLiveWidgets($('#desktop'),state);},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderClock();refreshLiveWidgets($('#desktop'),state);syncController.onVisible();}});
 document.addEventListener('focusout',()=>syncController.onIdle());
 setInterval(()=>{if(!document.hidden)syncController.onIdle();},60000);
 if(new URLSearchParams(location.search).get('search')==='local')openDialog('local-search');
 if(blockedStorage)openDialog('settings',{tab:'data'});
}
init().catch(err=>{console.error('Qiye initialization failed',err);toast('桌面初始化失败，请刷新页面重试。');});
