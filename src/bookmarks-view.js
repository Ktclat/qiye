// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as esc } from './html.js';
import { icon } from './icons.js';
import { windowControls } from './widget-app-controls.js';
import { bookmarkUrl, bookmarkIndex, bookmarkPath, bookmarkDescendants, listBookmarks, browserBookmarkClient } from './bookmarks.js';

const button = (action, label, glyph, id = '') => `<button type="button" data-bm-action="${action}" data-id="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}">${icon(glyph)}</button>`;
const sourceLabel = source => t(source === 'browser' ? '浏览器收藏' : '独立收藏');
export function bookmarkLocation(nodes, folderId) { return [t('全部收藏'), ...bookmarkPath(nodes, folderId).map(node => node.title)].join(' / '); }
export function bookmarkCounts(nodes) { return {links:nodes.filter(node => node.url !== null).length, folders:nodes.filter(node => node.url === null).length}; }
function address(url) { try { return new URL(url).hostname || new URL(url).protocol; } catch { return url; } }
function mark(node) { return node.url === null ? `<span class="bm-folder-icon">${icon('folder')}</span>` : `<span class="bm-site-icon" aria-hidden="true">${esc((address(node.url).replace(/^www\./, '') || '?').slice(0, 1).toUpperCase())}</span>`; }

export function bookmarkWorkspace(item) {
  return `<section class="bookmarks-app">
    <header class="bm-header"><h2 id="dialog-title" class="bm-visually-hidden">${esc(item.title)}</h2>
      <details class="bm-source-switch" data-bm-menu><summary aria-label="${t('切换收藏来源')}" title="${t('切换收藏来源')}"><span class="bm-source-glyph">${icon('bookmark')}</span><span class="bm-source-label">${t('独立收藏')}</span>${icon('chevron')}</summary><div class="bm-sources" role="group" aria-label="${t('收藏来源')}"><button type="button" data-bm-source="local" aria-pressed="true">${icon('bookmark')}<span>${t('独立收藏')}</span>${icon('check')}</button><button type="button" data-bm-source="browser" aria-pressed="false" title="${t('连接浏览器书签')}">${icon('globe')}<span>${t('浏览器收藏')}</span>${icon('check')}</button></div></details>
      <div class="bm-header-tools"><label class="bm-search">${icon('search')}<input type="search" data-bm-query placeholder="${t('搜索书签')}" aria-label="${t('搜索所有文件夹、标题或网址')}"></label><details class="bm-settings" data-bm-menu><summary title="${t('书签设置')}" aria-label="${t('书签设置')}">${icon('settings')}</summary><div class="bm-settings-panel" role="region" aria-label="${t('书签设置')}"><label><span>${t('书签排序')}</span><select data-bm-sort><option value="manual">${t('原始顺序')}</option><option value="title">${t('按名称排序')}</option><option value="recent">${t('最近添加')}</option></select></label><button type="button" data-bm-action="refresh">${icon('refresh')}${t('刷新收藏')}</button><p class="bm-source-note"></p></div></details>${windowControls()}</div>
    </header>
    <div class="bm-layout"><aside class="bm-navigation-pane" aria-label="${t('收藏文件夹')}"><nav class="bm-sidebar"></nav><footer class="bm-footer"></footer></aside><main class="bm-main"><div class="bm-breadcrumb" aria-label="${t('文件夹路径')}"></div><div class="bm-toolbar"><div class="bm-heading"></div><div class="bm-create"><button type="button" data-bm-action="new-folder">${icon('folder')}<span>${t('新建文件夹')}</span></button><button type="button" data-bm-action="new-bookmark" class="bm-primary">${icon('plus')}<span>${t('添加书签')}</span></button></div></div><div class="bm-list-tools"><span class="bm-result-count"></span><span class="bm-sort-label"></span></div><div class="bm-list" aria-label="${t('收藏列表')}"></div></main></div>
    <p class="bm-feedback" role="status" hidden></p><div class="bm-editor-overlay" hidden><section class="bm-editor" role="dialog" aria-modal="true" aria-labelledby="bm-editor-title" tabindex="-1"></section></div>
  </section>`;
}

export function bookmarkSidebar(nodes, view) {
  const {children} = bookmarkIndex(nodes), counts = bookmarkCounts(nodes);
  const rows = [], stack = (children.get('') || []).filter(node => node.url === null).reverse().map(node => ({node, depth:1}));
  while (stack.length) {
    const {node, depth} = stack.pop(), folders = (children.get(node.id) || []).filter(child => child.url === null);
    const open = view.expanded.has(node.id), selected = view.scope === 'folder' && view.folder === node.id;
    rows.push(`<div class="bm-tree-row" role="none" style="--depth:${depth}">${folders.length ? `<button type="button" class="bm-tree-toggle" data-bm-toggle="${esc(node.id)}" tabindex="-1" aria-label="${esc(t(open ? '收起文件夹' : '展开文件夹'))}">${icon(open ? 'chevron' : 'right')}</button>` : '<span class="bm-tree-spacer"></span>'}<button type="button" role="treeitem" data-bm-folder="${esc(node.id)}" aria-level="${depth + 1}" aria-selected="${selected}" ${folders.length ? `aria-expanded="${open}"` : ''} title="${esc(node.title)}">${icon('folder')}<span>${esc(node.title)}</span>${node.readonly ? icon('shield') : ''}<small>${(children.get(node.id) || []).length}</small></button></div>`);
    if (open) for (const child of [...folders].reverse()) stack.push({node:child, depth:depth + 1});
  }
  return `<div class="bm-sidebar-label">${t('收藏库')}</div><button type="button" class="bm-recent" data-bm-action="recent" aria-pressed="${view.scope === 'recent'}">${icon('history')}<span>${t('最近添加')}</span></button><div class="bm-sidebar-label">${t('文件夹')}<span>${counts.folders}</span></div><div class="bm-tree" role="tree" aria-label="${t('收藏文件夹')}"><div class="bm-tree-row bm-tree-root" role="none"><button type="button" role="treeitem" aria-level="1" data-bm-folder="" aria-selected="${view.scope === 'folder' && view.folder === ''}">${icon('bookmark')}<span>${t('全部收藏')}</span><small>${counts.links}</small></button></div>${rows.join('')}</div>`;
}

export function bookmarkRows(nodes, view, state) {
  const rows = listBookmarks(nodes, view), {children} = bookmarkIndex(nodes);
  if (view.loading) return `<div class="bm-empty">${icon('refresh')}<strong>${t('正在读取收藏…')}</strong></div>`;
  if (!rows.length) return `<div class="bm-empty">${icon(view.query ? 'search' : 'bookmark')}<strong>${t(view.query ? '没有找到匹配的收藏' : '这个文件夹还很安静')}</strong><p>${t(view.query ? '试试网站名称、网址或文件夹名' : '添加一个书签，或用文件夹整理你的收藏')}</p>${view.query ? `<button type="button" data-bm-action="clear-search">${t('清除搜索')}</button>` : ''}</div>`;
  return `<ul>${rows.slice(0, view.limit || 100).map(node => {
    const location = view.query || view.scope === 'recent' ? bookmarkLocation(nodes, node.parentId) : '';
    const url = node.url !== null && bookmarkUrl(node.url);
    const subtitle = node.url === null ? t('{count} 个项目', {count:(children.get(node.id) || []).length}) : node.url;
    const text = `${mark(node)}<span class="bm-row-copy"><strong>${esc(node.title)}</strong><small title="${esc(subtitle)}">${esc(subtitle)}</small>${location ? `<small class="bm-location">${esc(location)}</small>` : ''}</span>`;
    const link = node.url === null ? `<button type="button" class="bm-row-open" data-bm-folder="${esc(node.id)}">${text}</button>`
      : url ? `<a class="bm-row-open" href="${esc(url)}" ${state.settings?.openNewTab !== false ? 'target="_blank"' : ''} rel="noopener noreferrer" title="${esc(node.url)}">${text}</a>`
      : `<div class="bm-row-open" title="${t('此地址只能在浏览器收藏夹中打开')}">${text}<span class="bm-readonly">${t('特殊地址')}</span></div>`;
    return `<li data-bm-row="${esc(node.id)}">${link}<div class="bm-row-actions">${location ? button('locate',t('在文件夹中显示'),'folder',node.id) : ''}${node.protected || node.readonly ? `<span class="bm-readonly" title="${t('浏览器系统文件夹或只读收藏无法修改')}">${icon('shield')}</span>` : button('edit',t('编辑'),'edit',node.id) + button('move',t('移动到文件夹'),'move',node.id) + button('delete',t('删除'),'trash',node.id)}</div></li>`;
  }).join('')}</ul>${rows.length > (view.limit || 100) ? `<button type="button" class="bm-load-more" data-bm-action="more">${t('显示更多收藏')}</button>` : ''}`;
}

export function bookmarkBreadcrumb(nodes, view) {
  const path = bookmarkPath(nodes, view.folder);
  return `<nav>${[{id:'', title:sourceLabel(view.source)}, ...path].map((node, index) => `${index ? icon('right') : ''}<button type="button" data-bm-folder="${esc(node.id)}" title="${esc(node.title)}">${esc(node.title)}</button>`).join('')}</nav>`;
}

export function bookmarkHeading(nodes, view) {
  const node = nodes.find(node => node.id === view.folder);
  const title = view.query ? t('搜索结果') : view.scope === 'recent' ? t('最近添加') : node?.title || t('全部收藏');
  return `<h3 title="${esc(title)}">${esc(title)}</h3>${node && !node.protected && !node.readonly && !view.query && view.scope === 'folder' ? `<div class="bm-folder-actions">${button('edit',t('重命名文件夹'),'edit',node.id)}${button('move',t('移动到文件夹'),'move',node.id)}${button('delete',t('删除文件夹'),'trash',node.id)}</div>` : ''}`;
}

export function bookmarkEditor(nodes, view, editor) {
  const node = nodes.find(entry => entry.id === editor.id);
  const move = editor.type === 'move', remove = editor.type === 'delete', create = editor.type === 'create';
  const folder = create ? editor.folder : node?.url === null;
  const title = remove ? t('删除收藏') : move ? t('移动到文件夹') : create ? t(folder ? '新建文件夹' : '添加书签') : t(folder ? '重命名文件夹' : '编辑书签');
  const excluded = node ? bookmarkDescendants(nodes, node.id) : new Set();
  const folders = nodes.filter(entry => entry.url === null && !entry.readonly && !excluded.has(entry.id));
  const options = (view.source === 'local' ? [{id:'',title:t('全部收藏')}] : []).concat(folders.map(entry => ({id:entry.id,title:bookmarkLocation(nodes, entry.id)})));
  const selected = editor.parentId;
  const affected = remove ? nodes.filter(entry => excluded.has(entry.id)) : [];
  return `<header><h3 id="bm-editor-title">${title}</h3>${button('cancel',t('取消'),'close')}</header><form id="bm-editor-form"><fieldset>
    ${remove ? `<p>${esc(t('确定删除“{title}”？', {title:node?.title}))}</p>${folder ? `<p>${esc(t('包含 {links} 个书签和 {folders} 个文件夹，将一并删除。', {links:bookmarkCounts(affected).links, folders:Math.max(0,bookmarkCounts(affected).folders - 1)}))}</p>` : ''}<p class="bm-delete-note">${t(view.source === 'browser' ? '这会直接删除浏览器中的原始收藏，无法在此撤销。' : '删除后无法撤销，请确认已不再需要。')}</p>`
    : `${move ? `<p class="bm-moving-name">${icon(folder ? 'folder' : 'bookmark')}${esc(node?.title)}</p>` : `<label><span>${t('名称')}</span><input name="title" required maxlength="300" value="${esc(node?.title || '')}" autocomplete="off" placeholder="${t(folder ? '例如：设计灵感' : '例如：常用文档')}"></label>${folder ? '' : `<label><span>${t('网址')}</span><input name="url" required maxlength="4096" value="${esc(node?.url || '')}" placeholder="https://" inputmode="url" autocomplete="off" spellcheck="false"></label>`}`}
    ${create || move ? `<label><span>${t('保存到文件夹')}</span><select name="parentId">${options.map(entry => `<option value="${esc(entry.id)}" ${entry.id === selected ? 'selected' : ''}>${esc(entry.title)}</option>`).join('')}</select></label>` : ''}`}
    <p class="bm-editor-feedback" role="alert" hidden></p><footer><button type="button" data-bm-action="cancel">${t('取消')}</button><button type="submit" class="${remove ? 'bm-danger' : 'bm-primary'}" ${!remove && (create || move) && !options.length ? 'disabled' : ''}>${t(remove ? '确认删除' : move ? '移动' : '保存')}</button></footer></fieldset></form>`;
}

export function bookmarkCard(item, state, folder = '') {
  const snapshot = browserBookmarkClient.snapshot();
  const browser = item.config.source === 'browser' && snapshot.granted;
  const nodes = browser ? snapshot.nodes : item.data.nodes, counts = bookmarkCounts(nodes);
  const source = sourceLabel(browser ? 'browser' : 'local');
  if (['1x1','1x2','2x1'].includes(item.size)) return `<button type="button" class="bm-mini" data-action="widget-open" aria-label="${esc(item.title)}">${icon('bookmark')}<strong>${counts.links}</strong><span>${t('书签')}</span><small>${source}</small></button>`;
  const {children,byId} = bookmarkIndex(nodes);
  if (!byId.has(folder)) folder = '';
  const folders = (children.get(folder) || []).filter(node => node.url === null);
  const links = (children.get(folder) || []).filter(node => node.url !== null);
  return `<header class="bm-card-header"><button type="button" data-action="widget-open">${icon('bookmark')}<strong>${t('书签')}</strong><small>${counts.links}</small></button><button type="button" data-action="widget-open" title="${t('打开书签管理')}" aria-label="${t('打开书签管理')}">${icon('right')}</button></header><div class="bm-card-layout"><div class="bm-card-folders">${folder ? `<button type="button" data-bm-card-folder="${esc(byId.get(folder)?.parentId || '')}" title="${t('上一级文件夹')}">${icon('chevronLeft')}<span>${t('上一级')}</span></button>` : `<span class="bm-card-root">${icon('folder')}${t('文件夹')}</span>`}${folders.slice(0, 12).map(node => `<button type="button" data-bm-card-folder="${esc(node.id)}" title="${esc(node.title)}">${icon('folder')}<span>${esc(node.title)}</span></button>`).join('')}${!folders.length ? `<span class="bm-card-muted">${t('暂无子文件夹')}</span>` : ''}</div><div class="bm-card-links">${links.slice(0,8).map(node => bookmarkUrl(node.url) ? `<a href="${esc(bookmarkUrl(node.url))}" ${state.settings?.openNewTab !== false ? 'target="_blank"' : ''} rel="noopener noreferrer" title="${esc(node.title + ' · ' + node.url)}">${mark(node)}<span>${esc(node.title)}</span></a>` : '').join('')}${!links.length ? `<button type="button" class="bm-card-empty" data-action="widget-open">${icon('bookmark')}<span>${t(folders.length ? '选择文件夹浏览收藏' : '收藏下一个灵感')}</span></button>` : ''}</div></div><footer class="bm-card-footer"><span>${esc(byId.get(folder)?.title || source)}</span><button type="button" data-action="widget-open">${t('管理收藏')}</button></footer>`;
}
