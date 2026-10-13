// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as esc } from './html.js';
import { TILE_SIZES, sizeLabel } from './widget-sizes.js';
import { listWidgetDefinitions, newWidgetConfig } from './widget-registry.js';
import { newWidgetData } from './widget-data.js';
import { renderWidget } from './widgets.js';

const categories = ['全部','日常','效率','工具'];
const daily = new Set(['calendar','weather','memo','notes','quote','wallpaper','clock']);
const productivity = new Set(['todo','focus','habit','countdown','workday']);
const categoryOf = type => daily.has(type)?'日常':productivity.has(type)?'效率':'工具';

export function renderCatalog({state, groupId, sites = [], renderSite, siteMode = false}) {
  const groups=state.groups.map(group=>`<option value="${esc(group.id)}"${group.id===groupId?' selected':''}>${esc(group.name)}</option>`).join('');
  const toolbar=`<div class="catalog-toolbar"><input id="widget-query" type="search" placeholder="${t('输入并搜索')}" aria-label="${t('搜索名称或用途')}"><label>${t('添加到')}<select id="catalog-group" aria-label="${t('添加到')}">${groups}</select></label>${siteMode?'':`<select name="widgetSize" aria-label="${t('添加尺寸')}"><option value="default">${t('组件推荐')}</option>${TILE_SIZES.map(size=>`<option value="${size}">${sizeLabel(size)}</option>`).join('')}</select>`}</div>`;
  const filters=siteMode?'':`<div class="catalog-categories" role="group" aria-label="${t('组件分类')}">${categories.map((category,index)=>`<button data-catalog-category="${category}" aria-pressed="${index===0}">${t(category)}</button>`).join('')}</div>`;
  const cards=siteMode?sites.map(site=>`<article class="catalog-showcase catalog-site" data-catalog-card data-search="${esc((site.title+' '+site.url).toLocaleLowerCase())}"><div class="catalog-site-art">${renderSite(site)}</div><h3>${esc(site.title)}</h3><p>${esc(new URL(site.url).hostname)}</p><button class="catalog-add" data-add-site="${esc(site.id)}">${t('添加')}</button></article>`).join('')
    :listWidgetDefinitions().map(definition=>{
      const item={id:'catalog-'+definition.type,type:'widget',widget:definition.type,title:t(definition.title),size:definition.size,config:newWidgetConfig(definition.type),data:newWidgetData(definition.type)};
      return `<article class="catalog-showcase" data-catalog-card data-sizes="${definition.sizes.join(',')}" data-category="${categoryOf(definition.type)}" data-search="${esc((t(definition.title)+' '+t(definition.description)).toLocaleLowerCase())}"><h3>${esc(t(definition.title))}</h3><p>${esc(t(definition.description))}</p><div class="catalog-stage" inert aria-hidden="true"><div class="catalog-preview tile-widget" data-size="${item.size}" style="--preview-width:${item.size==='4x2'?408:192}px">${renderWidget(item,{...state,settings:{...state.settings,wallpaperApiEnabled:false}})}</div></div><footer><span>${definition.sizes.map(sizeLabel).join(' · ')}</span><button class="catalog-add" data-add-widget="${esc(definition.type)}">${t('添加')}</button></footer></article>`;
    }).join('');
  return toolbar+filters+`<h3 class="catalog-section-title">${siteMode?t('网址导航'):t('发现小组件')}</h3><p id="widget-catalog-empty" role="status" hidden>${t('没有找到匹配的内容')}</p><div class="catalog-showcases${siteMode?' catalog-sites':''}">${cards}</div>`;
}

export function filterCatalog(root) {
  const query=root.querySelector('#widget-query')?.value.trim().toLocaleLowerCase()||'';
  const category=root.querySelector('[data-catalog-category][aria-pressed=true]')?.dataset.catalogCategory||'全部';
  let count=0;
  for(const card of root.querySelectorAll('[data-catalog-card]')) {
    card.hidden=!(card.dataset.search.includes(query) && (category==='全部'||card.dataset.category===category));
    if(!card.hidden)count++;
  }
  const empty=root.querySelector('#widget-catalog-empty');if(empty)empty.hidden=count>0;
}

export function updateCatalogSize(root) {
  const size=root.querySelector('[name=widgetSize]')?.value;
  for(const card of root.querySelectorAll('[data-catalog-card][data-sizes]')) {
    const button=card.querySelector('[data-add-widget]');
    button.disabled=size!=='default' && !card.dataset.sizes.split(',').includes(size);
    button.title=button.disabled?t('此组件不支持所选尺寸'):'';
  }
}
