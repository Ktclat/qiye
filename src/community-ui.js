// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { validateCommunitySource } from './community-format.js';
import { publicHttpsUrl, requestPublicOrigin, fetchPublicJson } from './public-json.js';
import { uid } from './core.js';
import { sizeLabel, gridMetrics, widgetDimensions } from './widget-sizes.js';
import { mountPlugin } from './plugin-host.js';
import { readWidgetSources, saveWidgetSources, OFFICIAL_WIDGET_SOURCE, SOURCES_CHANGED } from './widget-sources.js';
import { permissionControl } from './permissions.js';

export const DEFAULT_COMMUNITY_SOURCE = OFFICIAL_WIDGET_SOURCE;
const sourceName = source => source.url === OFFICIAL_WIDGET_SOURCE ? t('官方源') : source.catalog?.name || new URL(source.url).hostname;
const entryKey = ({manifest, source}) => source.url + '|' + manifest.id;

export function communityToolbar(state, groupId) {
 return `<div class="catalog-toolbar community-toolbar"><input type="search" data-community-query placeholder="${t('搜索名称或用途')}" aria-label="${t('搜索名称或用途')}"><label><span>${t('添加到')}</span><select data-community-group aria-label="${t('添加到')}">${state.groups.map(g=>`<option value="${e(g.id)}"${g.id === groupId ? ' selected' : ''}>${e(g.name)}</option>`).join('')}</select></label></div><button class="community-manage" data-action="widget-sources" aria-label="${t('管理组件源')}" title="${t('管理组件源')}">${icon('settings')}</button>`;
}
export function communityView({catalogOnly=false}={}) {
 return `<div class="community-view ${catalogOnly?'community-gallery':'community-settings'}" data-source-view="${catalogOnly?'catalog':'settings'}"><div data-community-body></div><p data-community-status role="status" aria-live="polite"></p></div>`;
}

export function bindCommunity(root, host, initial={}) {
 const events = new AbortController(), options = {signal:events.signal};
 const view = root.querySelector('[data-source-view]'), body = view.querySelector('[data-community-body]'), status = view.querySelector('[data-community-status]');
 const gallery = view.dataset.sourceView === 'catalog', sizes = new Map(), previews = new Map();
 let sources = [], busy = false, writingSources = false, observer, entries = [], selectedSource = gallery ? null : initial.source;
 let category = gallery && initial.source ? initial.source : 'all', query = initial.query || '';
 let reportTimer;
 const report = (message, temporary=true) => { clearTimeout(reportTimer);if(root.isConnected)status.textContent=message;if(temporary)reportTimer=setTimeout(()=>{status.textContent='';},3000); };
 const sourceEntries = source => (source.catalog?.widgets || []).map(manifest=>({manifest, source}));
 const installed = entry => host.getState().items.filter(i=>i.widget==='community' && i.config.source===entry.source.url && i.config.manifest.id===entry.manifest.id);
 const changed = entry => installed(entry).some(i=>JSON.stringify(i.config.manifest)!==JSON.stringify(entry.manifest));
 const persist = next => {writingSources=true;try{saveWidgetSources(next);sources=next;}finally{writingSources=false;}};
 const stopPreviews = () => {observer?.disconnect();for(const dispose of previews.values())dispose();previews.clear();};
 const label = source => source.url===OFFICIAL_WIDGET_SOURCE ? t('栖页官方小组件') : sourceName(source);
 const buttons = (source,index,details=false) => `<button type="button" role="switch" aria-checked="${source.enabled}" data-source-toggle="${index}">${t(source.enabled?'停用':'启用')}</button>${details?`<button data-source-refresh="${index}" ${!source.enabled?'disabled':''}>${t('检查更新')}</button>`:`<button data-source-details="${index}">${t('查看组件详情')}</button>`}${source.url===OFFICIAL_WIDGET_SOURCE?'':`<button data-source-remove="${index}">${t('移除')}</button>${permissionControl({origins:[new URL(source.url).origin+'/*']})}`}`;
 const access = manifest => `<details class="source-widget-access"><summary>${t('来源与权限')}</summary><dl><dt>${t('运行地址')}</dt><dd>${e(new URL(manifest.entry).origin)}</dd><dt>${t('权限')}</dt><dd>${e((manifest.capabilities||[]).map(c=>t({bookmarks:'浏览器书签',wallpaper:'壁纸',geolocation:'定位'}[c])).join('、') || t('仅组件自己的数据'))}</dd><dt>${t('许可证')}</dt><dd>${e(manifest.license)}</dd></dl><a href="${e(manifest.repository)}" target="_blank" rel="noopener noreferrer">${t('查看源码')}</a></details>`;

 function renderSettings() {
  const source = sources.find(s=>s.url===selectedSource);
  if(!source) {
   selectedSource=null;entries=[];
   body.innerHTML=`<p class="source-intro">${t('管理订阅的组件源，在来源详情中查看组件和更新。停用来源会保留桌面数据。')}</p><div data-community-sources>${sources.map((s,index)=>`<article class="widget-source"><div class="source-identity"><span class="source-emblem">${icon(s.url===OFFICIAL_WIDGET_SOURCE?'grid':'globe')}</span><div><strong>${e(label(s))}</strong><small>${e(s.url)}</small><span class="source-state ${s.enabled?'is-enabled':''}">${t(s.enabled?'已启用':'未启用')}${s.catalog?' · '+s.catalog.widgets.length+' '+t('个组件'):''}</span></div></div><div class="source-actions">${buttons(s,index)}</div></article>`).join('')}</div><form data-community-source><label class="field"><span>${t('订阅新的组件源')}</span><input name="url" type="url" placeholder="https://example.com/index.json" required maxlength="2048" aria-label="${t('组件来源地址')}"></label><button class="primary-button">${t('添加并启用')}</button></form>`;
   return;
  }
  entries=sourceEntries(source);
  const index=sources.indexOf(source);
  body.innerHTML=`<header class="source-detail-header"><button data-source-back aria-label="${t('返回组件源')}">${icon('chevronLeft')}</button><div><h3 tabindex="-1" data-source-title>${e(label(source))}</h3><small>${entries.length} ${t('个组件')}</small></div></header><p class="source-address">${e(source.url)}</p><div class="source-actions">${buttons(source,index,true)}<button data-source-browse ${!source.enabled?'disabled':''}>${t('预览与添加')}</button></div>${!source.enabled?`<p class="source-notice">${t('此来源未启用。启用后可预览和添加组件。')}</p>`:''}<div class="source-detail-search"><input type="search" data-community-query value="${e(query)}" placeholder="${t('搜索名称或用途')}" aria-label="${t('搜索名称或用途')}"></div><div class="source-widget-list">${entries.map((entry,i)=>`<article data-source-widget="${i}" class="source-widget"><header><h4>${e(t(entry.manifest.name))}</h4><span>v${e(entry.manifest.release)}</span></header><p>${e(t(entry.manifest.description))}</p><small>${e(entry.manifest.author)} · ${t('已添加')} ${installed(entry).length}</small>${access(entry.manifest)}${changed(entry)?`<button data-community-update="${i}" ${!source.enabled?'disabled':''}>${t('更新已添加的组件')}</button>`:''}</article>`).join('')}</div><p data-community-empty>${t(entries.length?'没有找到匹配的内容':'此来源还没有组件')}</p>`;
 }

 function renderGallery() {
  entries=sources.filter(s=>s.enabled).flatMap(sourceEntries);
  const filters=[['all',t('全部')],['official',t('官方源')],['community',t('社区源')],...sources.filter(s=>s.enabled&&s.url!==OFFICIAL_WIDGET_SOURCE).map(s=>[s.url,sourceName(s)])];
  if(!filters.some(([key])=>key===category))category=initial.source===OFFICIAL_WIDGET_SOURCE?'official':'all';
  body.innerHTML=`<div class="catalog-categories community-categories" role="group" aria-label="${t('按组件源筛选')}">${filters.map(([key,name])=>`<button data-community-category="${e(key)}" aria-pressed="${key===category}">${e(name)}</button>`).join('')}</div><div class="community-catalog-scroll"><div class="community-cards">${entries.map((entry,index)=>{
   const m=entry.manifest, size=sizes.get(entryKey(entry))||'2x2';
   sizes.set(entryKey(entry),size);
   return `<article class="community-card" data-community-card="${index}" data-preview-size="${size}"><h3>${e(t(m.name))}</h3><p title="${e(t(m.description))}">${e(t(m.description))}</p><div class="community-carousel"><button class="catalog-arrow" data-community-step="-1" aria-label="${t('上一个尺寸')}">‹</button><div class="community-stage" inert aria-hidden="true"><div class="community-preview"><span class="preview-idle">${icon('grid')}</span></div></div><button class="catalog-arrow" data-community-step="1" aria-label="${t('下一个尺寸')}">›</button></div><div class="community-sizes" role="group" aria-label="${t('预览尺寸')}">${m.sizes.map(s=>`<button data-community-size="${s}" aria-pressed="${s===size}" aria-label="${sizeLabel(s)}">${sizeLabel(s)}</button>`).join('')}</div><footer><button class="community-source-link" data-gallery-source="${index}" title="${e(label(entry.source))}">${e(sourceName(entry.source))}</button><button class="catalog-add" data-community-add>${t('添加')}</button></footer></article>`;
  }).join('')}</div><p data-community-empty>${t(sources.some(s=>s.enabled)?'没有找到匹配的内容':'尚未启用组件源。请在设置中启用官方源或添加自己的源。')} ${!sources.some(s=>s.enabled)?`<button data-action="widget-sources">${t('管理组件源')}</button>`:''}</p></div>`;
  const input=root.querySelector('[data-community-query]');if(input)input.value=query;
  observer=new IntersectionObserver(changes=>{for(const entry of changes){const card=entry.target;if(entry.isIntersecting&&!card.hidden)startPreview(card);else stopPreview(card);}},{root:body.querySelector('.community-catalog-scroll'),rootMargin:'60px'});
  for(const card of body.querySelectorAll('[data-community-card]'))observer.observe(card);
 }

 function stopPreview(card) {previews.get(card)?.();previews.delete(card);}
 function startPreview(card) {
  if(previews.has(card)||events.signal.aborted||card.hidden)return;
  const entry=entries[Number(card.dataset.communityCard)], m=entry.manifest, size=card.dataset.previewSize;
  const canvas=card.querySelector('.community-preview'), stage=card.querySelector('.community-stage');
  const previewEvents=new AbortController();
  const resize=()=>{const dimensions=widgetDimensions(size,gridMetrics(host.getState().settings,globalThis.innerWidth));canvas.style.width=dimensions.width+'px';canvas.style.height=dimensions.height+'px';canvas.style.transform=`scale(${Math.max(0,Math.min(1,(stage.clientWidth-16)/dimensions.width,(stage.clientHeight-8)/dimensions.height))})`;};
  window.addEventListener('resize',resize,{signal:previewEvents.signal});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);resize();
  const item={id:'preview-'+card.dataset.communityCard,type:'widget',widget:'community',title:t(m.name),size,config:{manifest:m,source:entry.source.url},data:{value:'null'}};
  const previewHost={getState:()=>({...host.getState(),items:[item]})};
  let dispose=()=>{};
  const live=()=>{canvas.replaceChildren();dispose=mountPlugin(canvas,item,previewHost,'card',{preview:true});};
  const picture=m.previews.find(p=>p.size===size);
  if(picture){const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.src=picture.url;img.addEventListener('error',live,{once:true,signal:previewEvents.signal});canvas.replaceChildren(img);}else live();
  previews.set(card,()=>{previewEvents.abort();resizeObserver.disconnect();dispose();canvas.replaceChildren();});
 }

 function filter() {
  const search=query.trim().toLocaleLowerCase();let count=0;
  for(const card of body.querySelectorAll(gallery?'[data-community-card]':'[data-source-widget]')){
   const entry=entries[Number(gallery?card.dataset.communityCard:card.dataset.sourceWidget)],m=entry.manifest;
   const matches=(m.name+' '+t(m.name)+' '+m.description+' '+t(m.description)+' '+m.author+' '+sourceName(entry.source)).toLocaleLowerCase().includes(search);
   const inCategory=!gallery||category==='all'||(category==='official'?entry.source.url===OFFICIAL_WIDGET_SOURCE:category==='community'?entry.source.url!==OFFICIAL_WIDGET_SOURCE:entry.source.url===category);
   card.hidden=!(matches&&inCategory);if(card.hidden)stopPreview(card);else count++;
  }
  const empty=body.querySelector('[data-community-empty]');if(empty)empty.hidden=count>0;
  for(const button of body.querySelectorAll('[data-community-category]'))button.setAttribute('aria-pressed',String(button.dataset.communityCategory===category));
 }
 function render(){report('');stopPreviews();if(gallery)renderGallery();else renderSettings();filter();}

 async function load(url) {
  if(busy)return;busy=true;report(t('正在读取…'));
  try{
   const checked=publicHttpsUrl(url),value=checked.startsWith('https://ktclat.github.io/qiye-widgets/')?checked:await requestPublicOrigin(checked);
   const catalog=validateCommunitySource(await fetchPublicJson(value,{signal:events.signal,maxBytes:512*1024}));
   if(events.signal.aborted)return;
   if(!sources.some(s=>s.url===value)&&sources.filter(s=>s.url!==OFFICIAL_WIDGET_SOURCE).length>=20)throw new Error(t('最多订阅 20 个来源。'));
   const existing=sources.find(s=>s.url===value),updated={url:value,enabled:true,catalog};
   persist(existing?sources.map(s=>s===existing?updated:s):[...sources,updated]);render();report(t('来源已更新，已安装的组件需手动更新。'));
  }catch(error){if(!events.signal.aborted)report(error.message);}finally{busy=false;}
 }

 root.addEventListener('submit',event=>{if(!event.target.matches('[data-community-source]'))return;event.preventDefault();event.stopPropagation();void load(new FormData(event.target).get('url'));},options);
 root.addEventListener('input',event=>{if(event.target.hasAttribute('data-community-query')){query=event.target.value;filter();}},options);
 root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  try{
   if(button.hasAttribute('data-source-details')){selectedSource=sources[Number(button.dataset.sourceDetails)].url;query='';render();body.querySelector('[data-source-title]')?.focus({preventScroll:true});return;}
   if(button.hasAttribute('data-source-back')){const url=selectedSource;selectedSource=null;query='';render();body.querySelector(`[data-source-details="${sources.findIndex(s=>s.url===url)}"]`)?.focus();return;}
   if(button.hasAttribute('data-source-browse')){host.openCatalog?.(selectedSource);return;}
   if(button.hasAttribute('data-gallery-source')){host.openSources?.(entries[Number(button.dataset.gallerySource)].source.url);return;}
   if(button.hasAttribute('data-source-toggle')){const source=sources[Number(button.dataset.sourceToggle)];if(source.enabled){persist(sources.map(s=>s===source?{...s,enabled:false}:s));render();}else if(source.catalog){if(source.url!==OFFICIAL_WIDGET_SOURCE)await requestPublicOrigin(source.url);persist(sources.map(s=>s===source?{...s,enabled:true}:s));render();}else await load(source.url);return;}
   if(button.hasAttribute('data-source-refresh')){await load(sources[Number(button.dataset.sourceRefresh)].url);return;}
   if(button.hasAttribute('data-source-remove')){persist(sources.filter((_,index)=>index!==Number(button.dataset.sourceRemove)));render();return;}
   if(button.hasAttribute('data-community-category')){category=button.dataset.communityCategory;filter();return;}
   if(button.hasAttribute('data-community-size')||button.hasAttribute('data-community-step')){
    const card=button.closest('[data-community-card]'),entry=entries[Number(card.dataset.communityCard)],available=entry.manifest.sizes;
    const size=button.dataset.communitySize||available[(available.indexOf(card.dataset.previewSize)+Number(button.dataset.communityStep)+available.length)%available.length];
    if(!available.includes(size))return;stopPreview(card);card.dataset.previewSize=size;sizes.set(entryKey(entry),size);
    for(const chip of card.querySelectorAll('[data-community-size]'))chip.setAttribute('aria-pressed',String(chip.dataset.communitySize===size));
    startPreview(card);return;
   }
   if(!button.hasAttribute('data-community-add')&&!button.hasAttribute('data-community-update'))return;
   const adding=button.hasAttribute('data-community-add'),card=button.closest('[data-community-card]');
   const entry=entries[Number(adding?card.dataset.communityCard:button.dataset.communityUpdate)],manifest=entry.manifest,source=entry.source.url;
   const before=host.getState(),next=structuredClone(before);busy=true;button.disabled=true;
   if(adding)next.items.push({id:uid(),groupId:root.querySelector('[data-community-group]').value,type:'widget',widget:'community',title:t(manifest.name).slice(0,120),size:card.dataset.previewSize,config:{manifest,source},data:{value:'null'}});
   else for(const item of next.items.filter(i=>i.widget==='community'&&i.config.source===source&&i.config.manifest.id===manifest.id)){item.config={manifest,source};if(!manifest.sizes.includes(item.size))item.size='2x2';}
   await host.apply(next,JSON.stringify(before));if(!events.signal.aborted){if(!adding)render();report(t(adding?'组件已添加到桌面。':'已更新组件，原有数据已保留。'),true);}
  }catch(error){report(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
 },options);
 window.addEventListener(SOURCES_CHANGED,()=>{if(writingSources)return;try{sources=readWidgetSources();render();}catch(error){report(error.message);}},options);
 try{sources=readWidgetSources();}catch(error){report(error.message);}
 render();return ()=>{clearTimeout(reportTimer);events.abort();stopPreviews();};
}
