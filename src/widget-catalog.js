// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as esc } from './html.js';
import { sizeLabel, gridMetrics, widgetDimensions } from './widget-sizes.js';
import { listWidgetDefinitions, getWidgetDefinition, newWidgetConfig } from './widget-registry.js';
import { newWidgetData } from './widget-data.js';
import { renderWidget } from './widgets.js';

const categories = ['全部', '日常', '效率', '工具'];
const daily = new Set(['map', 'calendar', 'weather', 'memo', 'notes', 'quote', 'wallpaper', 'clock', 'hotsearch']);
const productivity = new Set(['todo', 'pomodoro', 'habit', 'countdown', 'workday', 'bookmarks']);
const categoryOf = type => daily.has(type) ? '日常' : productivity.has(type) ? '效率' : '工具';

function preview(definition, size, state) {
  const item = { id: 'catalog-' + definition.type, type: 'widget', widget: definition.type,
    title: t(definition.title), size, config: newWidgetConfig(definition.type), data: newWidgetData(definition.type) };
  const dimensions = widgetDimensions(size, gridMetrics(state.settings, globalThis.innerWidth));
  return `<div class="catalog-preview tile-widget" data-size="${size}" style="--preview-width:${dimensions.width}px;--preview-height:${dimensions.height}px">${renderWidget(item, { ...state, settings: { ...state.settings, wallpaperApiEnabled: false } })}</div>`;
}

function widgetCard(definition, state) {
  const size = definition.size;
  return `<article class="catalog-showcase" data-catalog-card data-catalog-widget="${esc(definition.type)}" data-preview-size="${size}" data-category="${categoryOf(definition.type)}" data-search="${esc((t(definition.title) + ' ' + t(definition.description)).toLocaleLowerCase())}">
    <h3>${esc(t(definition.title))}</h3><p>${esc(t(definition.description))}</p>
    <div class="catalog-carousel"><button class="catalog-arrow" data-catalog-step="-1" aria-label="${t('上一个尺寸')}">‹</button><div class="catalog-stage" inert aria-hidden="true">${preview(definition, size, state)}</div><button class="catalog-arrow" data-catalog-step="1" aria-label="${t('下一个尺寸')}">›</button></div>
    <div class="catalog-size-dots" role="group" aria-label="${t('预览尺寸')}">${definition.sizes.map(value => `<button data-catalog-size="${value}" aria-pressed="${value === size}" aria-label="${sizeLabel(value)}" title="${sizeLabel(value)}"><span></span></button>`).join('')}</div>
    <footer><span class="catalog-size-label" aria-live="polite">${sizeLabel(size)}</span><button class="catalog-add" data-add-widget="${esc(definition.type)}">${t('添加')}</button></footer></article>`;
}

export function renderCatalog({ state, groupId, sites = [], renderSite, siteMode = false }) {
  const groups = state.groups.map(group => `<option value="${esc(group.id)}"${group.id === groupId ? ' selected' : ''}>${esc(group.name)}</option>`).join('');
  const toolbar = `<div class="catalog-toolbar"><input id="widget-query" type="search" placeholder="${t('输入并搜索')}" aria-label="${t('搜索名称或用途')}"><label>${t('添加到')}<select id="catalog-group" aria-label="${t('添加到')}">${groups}</select></label></div>`;
  const filters = siteMode ? '' : `<div class="catalog-categories" role="group" aria-label="${t('组件分类')}">${categories.map((category, index) => `<button data-catalog-category="${category}" aria-pressed="${index === 0}">${t(category)}</button>`).join('')}</div>`;
  const cards = siteMode ? sites.map(site => `<article class="catalog-showcase catalog-site" data-catalog-card data-search="${esc((site.title + ' ' + site.url).toLocaleLowerCase())}"><div class="catalog-site-art">${renderSite(site)}</div><h3>${esc(site.title)}</h3><p>${esc(new URL(site.url).hostname)}</p><button class="catalog-add" data-add-site="${esc(site.id)}">${t('添加')}</button></article>`).join('')
    : listWidgetDefinitions().map(definition => widgetCard(definition, state)).join('');
  return toolbar + filters + `<h3 class="catalog-section-title">${siteMode ? t('网址导航') : t('发现小组件')}</h3><p id="widget-catalog-empty" role="status" hidden>${t('没有找到匹配的内容')}</p><div class="catalog-showcases${siteMode ? ' catalog-sites' : ''}">${cards}</div>`;
}

export function filterCatalog(root) {
  const query = root.querySelector('#widget-query')?.value.trim().toLocaleLowerCase() || '';
  const category = root.querySelector('[data-catalog-category][aria-pressed=true]')?.dataset.catalogCategory || '全部';
  let count = 0;
  for (const card of root.querySelectorAll('[data-catalog-card]')) {
    card.hidden = !(card.dataset.search.includes(query) && (category === '全部' || card.dataset.category === category));
    if (!card.hidden) count++;
  }
  const empty = root.querySelector('#widget-catalog-empty');
  if (empty) empty.hidden = count > 0;
}

export function changeCatalogSize(button, state) {
  const card = button.closest('[data-catalog-widget]');
  const definition = getWidgetDefinition(card?.dataset.catalogWidget);
  if (!definition) return;
  const sizes = definition.sizes, index = sizes.indexOf(card.dataset.previewSize);
  const size = button.dataset.catalogSize || sizes[(index + Number(button.dataset.catalogStep) + sizes.length) % sizes.length];
  if (!sizes.includes(size)) return;
  card.dataset.previewSize = size;
  card.querySelector('.catalog-stage').innerHTML = preview(definition, size, state);
  card.querySelector('.catalog-size-label').textContent = sizeLabel(size);
  for (const dot of card.querySelectorAll('[data-catalog-size]')) dot.setAttribute('aria-pressed', String(dot.dataset.catalogSize === size));
}
