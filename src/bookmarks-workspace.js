// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { bookmarkPath, bookmarkDescendants, changeLocalBookmarks, listBookmarks, browserBookmarkClient } from './bookmarks.js';
import { bookmarkSidebar, bookmarkRows, bookmarkBreadcrumb, bookmarkHeading, bookmarkEditor, bookmarkCounts, bookmarkCard } from './bookmarks-view.js';

export function bindBookmarkWorkspace(root, initial, host, client = browserBookmarkClient) {
  const controller = new AbortController(), options = {signal:controller.signal};
  const find = selector => root.querySelector(selector);
  const current = () => host.getState().items.find(item => item.id === initial.id);
  const alive = () => !controller.signal.aborted && root.isConnected && !!current();
  const view = {source:'local', folder:'', scope:'folder', query:'', sort:'manual', expanded:new Set(), loading:false, limit:100};
  let granted = false, browserNodes = [], editor = null, saving = false, switching = false, sequence = 0, timer, expanded = false;
  const nodes = () => view.source === 'browser' ? browserNodes : current()?.data.nodes || [];
  const feedback = message => { if (alive()) { find('.bm-feedback').textContent = message; find('.bm-feedback').hidden = !message; } };

  function render() {
    if (!alive()) return;
    const entries = nodes();
    if (view.folder && !entries.some(node => node.id === view.folder && node.url === null)) view.folder = '';
    const sidebar = find('.bm-sidebar'), scroll = sidebar.scrollTop;
    sidebar.innerHTML = bookmarkSidebar(entries, view); sidebar.scrollTop = scroll;
    find('.bm-breadcrumb').innerHTML = bookmarkBreadcrumb(entries, view);
    find('.bm-heading').innerHTML = bookmarkHeading(entries, view);
    find('.bm-list').innerHTML = bookmarkRows(entries, view, host.getState());
    find('.bm-result-count').textContent = t('{count} 个项目', {count:listBookmarks(entries,view).length});
    const counts = bookmarkCounts(entries);
    find('.bm-footer').textContent = t('{links} 个书签 · {folders} 个文件夹', counts);
    find('.bm-source-note').textContent = t(view.source === 'browser' ? '正在管理浏览器原始收藏，修改会直接生效。' : client.supported() ? '独立收藏随此组件保存；连接浏览器后可直接管理原始收藏，两者各自保留。' : '独立收藏随此组件保存。安装栖页扩展后可连接浏览器书签。');
    find('.bm-source-note').classList.toggle('is-browser', view.source === 'browser');
    for (const source of root.querySelectorAll('[data-bm-source]')) {
      source.setAttribute('aria-pressed', String(source.dataset.bmSource === view.source));
      source.disabled = switching || saving || source.dataset.bmSource === 'browser' && !client.supported();
      if (source.dataset.bmSource === 'browser') source.querySelector('span').textContent = t(granted ? '浏览器书签' : '连接浏览器书签');
    }
    const writable = view.source === 'local' || entries.some(node => node.url === null && !node.readonly);
    for (const action of ['new-folder','new-bookmark']) find(`[data-bm-action=${action}]`).disabled = !writable || view.loading || switching;
    find('[data-bm-action=refresh]').disabled = view.loading;
  }

  function navigate(folder) {
    view.folder = folder; view.scope = 'folder'; view.query = ''; view.limit = 100; find('[data-bm-query]').value = '';
    for (const node of bookmarkPath(nodes(), folder)) view.expanded.add(node.id);
    render(); find('.bm-list').scrollTop = 0;
  }

  function closeEditor(force = false) {
    if (saving && !force) return;
    editor = null; find('.bm-editor-overlay').hidden = true;
    for (const selector of ['.bm-header','.bm-topbar','.bm-layout']) find(selector).inert = false;
    find('[data-bm-action=new-bookmark]').focus({preventScroll:true});
  }

  function openEditor(type, id = '', folder = false) {
    if (saving || switching || view.loading) return;
    const entries = nodes(), node = entries.find(entry => entry.id === id);
    if (type !== 'create' && (!node || node.readonly || node.protected)) return;
    let parentId = type === 'move' ? node.parentId : view.folder;
    if (view.source === 'browser' && (!parentId || entries.find(entry => entry.id === parentId)?.readonly)) parentId = entries.find(entry => entry.url === null && !entry.readonly)?.id;
    editor = {type,id,folder,parentId,source:view.source,baseline:JSON.stringify(current().data)};
    if (node) editor.expectedNode = JSON.stringify({title:node.title,url:node.url,parentId:node.parentId});
    if (type === 'delete' && node.url === null) {
      const ids = bookmarkDescendants(entries,id);
      editor.expectedSubtree = JSON.stringify(entries.filter(entry => ids.has(entry.id)));
    }
    find('.bm-editor').innerHTML = bookmarkEditor(entries,view,editor);
    find('.bm-editor-overlay').hidden = false;
    for (const selector of ['.bm-header','.bm-topbar','.bm-layout']) find(selector).inert = true;
    (find('.bm-editor input') || find('.bm-editor select') || find('.bm-editor [data-bm-action=cancel]'))?.focus();
  }

  async function reload({initialLoad = false, showLoading = false} = {}) {
    const ticket = ++sequence;
    if (showLoading) { view.loading = true; render(); }
    try {
      const snapshot = await client.load();
      if (!alive() || ticket !== sequence) return;
      granted = snapshot.granted; browserNodes = snapshot.nodes;
      if (initialLoad && initial.config.source === 'browser' && granted) view.source = 'browser';
      if (!granted && view.source === 'browser') {
        view.source = 'local'; view.folder = ''; view.expanded.clear(); closeEditor(true);
        feedback(t('书签授权已失效，已返回独立收藏'));
      }
    } catch (error) { if (alive() && ticket === sequence) feedback(error.message || t('读取收藏失败，请重试')); }
    finally { if (alive() && ticket === sequence) { view.loading = false; render(); } }
  }

  async function selectSource(source) {
    if (switching || saving || source === view.source) return;
    // The permission request is deliberately the first asynchronous operation.
    const permission = source === 'browser' && !granted ? client.request() : Promise.resolve(true);
    switching = true; feedback(''); render();
    try {
      if (!await permission) { feedback(t('未授予书签权限，继续使用独立收藏')); return; }
      if (!alive()) return;
      if (source === 'browser') {
        await reload();
        if (!alive() || !granted) return;
      }
      const item = current();
      await host.saveSettings(item.id, {title:item.title, config:{...item.config,source}}, JSON.stringify([item.title,item.config]));
      if (!alive()) return;
      if (source === 'browser' && !granted) return;
      view.source = source; view.folder = ''; view.scope = 'folder'; view.expanded.clear(); view.query = ''; find('[data-bm-query]').value = '';
    } catch (error) { feedback(error.message || t('保存失败，请重试')); }
    finally { switching = false; render(); }
  }

  async function submit(event) {
    if (event.target.id !== 'bm-editor-form') return;
    event.preventDefault(); event.stopPropagation();
    if (!editor || saving || switching) return;
    const session = editor, form = event.target, values = new FormData(form);
    const entries = nodes(), node = entries.find(entry => entry.id === session.id);
    const change = {type:session.type,id:session.id,expectedSubtree:session.expectedSubtree,expectedNode:session.expectedNode};
    if (session.type === 'create') { change.id = host.uid(); change.dateAdded = Date.now(); }
    if (session.type === 'create' || session.type === 'update') {
      change.title = String(values.get('title') || '').trim();
      change.url = (session.type === 'create' ? session.folder : node?.url === null) ? null : String(values.get('url') || '').trim();
    }
    if (session.type === 'create' || session.type === 'move') change.parentId = String(values.get('parentId') ?? '');
    saving = true; form.querySelector('fieldset').disabled = true;
    const errorNode = form.querySelector('.bm-editor-feedback'); errorNode.hidden = true;
    try {
      if (session.source === 'browser') {
        await client.mutate(change);
        await reload();
      } else {
        const next = changeLocalBookmarks(JSON.parse(session.baseline), change);
        await host.saveData(initial.id,next,session.baseline);
      }
      host.refreshCards?.();
      if (!alive()) return;
      closeEditor(true); feedback(t('收藏已保存'));
      if (session.type === 'create' || session.type === 'move') navigate(change.parentId);
      else render();
    } catch (error) {
      if (!alive()) return;
      errorNode.textContent = error.message || t('保存失败，请重试'); errorNode.hidden = false;
      if (session.source === 'browser') await reload();
    } finally {
      saving = false;
      if (alive()) {
        form.querySelector('fieldset').disabled = false; render();
        if (editor === session) form.querySelector('input,select,button[type=submit]')?.focus();
      }
    }
  }

  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target || target.hasAttribute('data-close')) return;
    if (target.dataset.detailAction === 'window-expand') {
      expanded = !expanded; root.closest('dialog').classList.toggle('widget-app-expanded',expanded);
      target.innerHTML = icon(expanded ? 'minimize' : 'maximize'); target.setAttribute('aria-pressed',String(expanded));
      target.title = t(expanded ? '还原窗口' : '最大化窗口'); target.setAttribute('aria-label',target.title); return;
    }
    if (target.hasAttribute('data-bm-source')) { void selectSource(target.dataset.bmSource); return; }
    if (target.hasAttribute('data-bm-folder')) { navigate(target.dataset.bmFolder); focusFolder(target.dataset.bmFolder); return; }
    if (target.hasAttribute('data-bm-toggle')) {
      const id = target.dataset.bmToggle;
      if (view.expanded.has(id)) view.expanded.delete(id); else view.expanded.add(id);
      render(); focusFolder(id); return;
    }
    const action = target.dataset.bmAction, id = target.dataset.id;
    if (action === 'new-folder' || action === 'new-bookmark') openEditor('create','',action === 'new-folder');
    if (action === 'edit') openEditor('update',id);
    if (action === 'move' || action === 'delete') openEditor(action,id);
    if (action === 'cancel') closeEditor();
    if (action === 'locate') navigate(nodes().find(node => node.id === id)?.parentId || '');
    if (action === 'recent') { view.scope = 'recent'; view.query = ''; find('[data-bm-query]').value = ''; render(); }
    if (action === 'clear-search') { view.query = ''; find('[data-bm-query]').value = ''; render(); find('[data-bm-query]').focus(); }
    if (action === 'more') { view.limit += 100; const scroll = find('.bm-list').scrollTop; render(); find('.bm-list').scrollTop = scroll; }
    if (action === 'refresh') { feedback(''); void reload({showLoading:true}); }
  }, options);
  root.addEventListener('input', event => { if (event.target.matches('[data-bm-query]')) { view.query = event.target.value.trim(); view.limit = 100; render(); } }, options);
  root.addEventListener('change', event => { if (event.target.matches('[data-bm-sort]')) { view.sort = event.target.value; render(); } }, options);
  root.addEventListener('submit', event => { void submit(event); }, options);
  root.closest('dialog').addEventListener('cancel', event => {
    if (!editor) return;
    event.preventDefault(); event.stopImmediatePropagation(); closeEditor();
  }, {capture:true, signal:controller.signal});

  function focusFolder(id) { [...root.querySelectorAll('[role=treeitem]')].find(button => button.dataset.bmFolder === id)?.focus({preventScroll:true}); }
  root.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['f','k'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation();
      if (!editor) find('[data-bm-query]').focus();
      return;
    }
    if (editor) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor(); }
      if (event.key === 'Tab') {
        const fields = [...find('.bm-editor').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node => !node.closest('fieldset:disabled'));
        const first = fields[0], last = fields.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    if (!event.target.matches('[role=treeitem]')) return;
    const buttons = [...root.querySelectorAll('[role=treeitem]')], at = buttons.indexOf(event.target), id = event.target.dataset.bmFolder;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') {
      if (view.expanded.has(id)) { view.expanded.delete(id); render(); focusFolder(id); }
      else focusFolder(nodes().find(node => node.id === id)?.parentId || '');
    } else if (event.key === 'ArrowRight') {
      if (!view.expanded.has(id)) { view.expanded.add(id); render(); focusFolder(id); }
      else buttons[at + 1]?.focus();
    } else buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0,Math.min(buttons.length - 1,at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }, options);
  const unsubscribe = client.subscribe(reason => {
    if (!alive()) return;
    if (reason === 'revoked') {
      sequence++; granted = false; browserNodes = []; view.loading = false;
      if (view.source === 'browser') { view.source = 'local'; view.folder = ''; view.expanded.clear(); closeEditor(true); feedback(t('书签授权已失效，已返回独立收藏')); }
      render();
    } else { clearTimeout(timer); timer = setTimeout(() => { void reload(); },80); }
  });
  render(); void reload({initialLoad:true});
  return () => { controller.abort(); sequence++; clearTimeout(timer); unsubscribe(); };
}

export function bindBookmarkCards(container, host, client = browserBookmarkClient) {
  const roots = [...container.querySelectorAll('[data-widget=bookmarks]')];
  if (!roots.length) return () => {};
  const controller = new AbortController(), folders = new Map();
  let timer;
  const render = () => {
    if (controller.signal.aborted) return;
    for (const root of roots) {
      const item = host.getState().items.find(item => item.id === root.dataset.widgetId);
      if (item && root.isConnected) root.innerHTML = bookmarkCard(item,host.getState(),folders.get(item.id) || '');
    }
  };
  const load = () => client.load().then(render).catch(() => {});
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-bm-card-folder]');
    if (!button) return;
    const root = button.closest('[data-widget=bookmarks]');
    if (!root) return;
    event.preventDefault(); event.stopPropagation(); folders.set(root.dataset.widgetId,button.dataset.bmCardFolder); render();
  }, {signal:controller.signal});
  const unsubscribe = client.subscribe(reason => {
    if (reason === 'revoked') { folders.clear(); render(); }
    else { clearTimeout(timer); timer = setTimeout(load,100); }
  });
  if (roots.some(root => host.getState().items.find(item => item.id === root.dataset.widgetId)?.config.source === 'browser')) void load();
  return () => { controller.abort(); clearTimeout(timer); unsubscribe(); };
}
