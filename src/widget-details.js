// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { parseDate, localDateKey, daysBetween, countWorkdays } from './calendar.js';
import { newMemo, listMemos, MEMO_LIMIT } from './memos.js';
import { searchCities, requestWeather } from './weather.js';
import { createWidgetDraft } from './widget-drafts.js';
import { calendarDetail, memoDetail, memoList, weatherDetail, escapeText } from './widget-detail-views.js';

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, '_');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createWidgetDetails(host) {
  const drafts = new Map();
  let active = null, closing = null;
  const currentItem = session => host.getState().items.find(item => item.id === session.item.id);
  const exportDraft = session => download(JSON.stringify({widget:session.item.widget, data:session.draft.data}, null, 2), 'Qiye-unsaved-widget.json', 'application/json');

  function updateStatus(session) {
    const {root, draft} = session;
    if (!root?.isConnected) return;
    root.querySelector('#memo-save-status')?.replaceChildren(t(draft.error ? '保存失败，请重试' : draft.dirty ? '保存中…' : '已保存在本机'));
    const feedback = root.querySelector('.widget-save-feedback');
    feedback.hidden = !draft.error;
    if (draft.error) {
      feedback.innerHTML = `<p>${t('保存失败。草稿仍保留在此窗口，可重试或导出。')}</p><small>${escapeText(draft.error.message)}</small><div class="detail-toolbar"><button type="button" data-detail-action="save-retry">${t('重试保存')}</button><button type="button" data-detail-action="draft-export">${t('导出未保存的数据')}</button></div>`;
    }
  }

  function renderBody(session) {
    const item = {...(currentItem(session) || session.item), data:session.draft.data};
    const body = item.widget === 'calendar' ? calendarDetail(item, session.view)
      : item.widget === 'memo' ? memoDetail(item, session.view) : weatherDetail(item);
    return `<div class="widget-save-feedback" role="alert" hidden></div>${body}`;
  }

  function redraw(session) {
    if (!session.root?.isConnected) return;
    session.root.innerHTML = renderBody(session);
    updateStatus(session);
  }

  async function flush(session) {
    const saved = await session.draft.flush();
    if (saved) host.refreshCards();
    return saved;
  }

  function newEntry(session) {
    const entries = session.draft.data.entries;
    if (entries.length >= MEMO_LIMIT) {
      host.toast(t('备忘录最多支持 {count} 条', {count:MEMO_LIMIT}));
      return;
    }
    const entry = newMemo(host.uid());
    entries.push(entry);
    session.view.active = entry.id;
    session.view.query = '';
    session.draft.changed();
    redraw(session);
    session.root.querySelector('#memo-title')?.focus();
  }

  async function action(session, event) {
    const target = event.target.closest('[data-detail-action],[data-calendar-date]');
    if (!target) return;
    event.preventDefault();
    const {view, draft} = session, data = draft.data, name = target.dataset.detailAction;
    if (target.dataset.calendarDate) {
      if (!parseDate(target.dataset.calendarDate)) return;
      view.date = target.dataset.calendarDate;
      view.month = view.date.slice(0, 7);
      redraw(session);
    } else if (name?.startsWith('month-')) {
      const date = parseDate(view.month + '-01');
      date.setMonth(date.getMonth() + (name === 'month-next' ? 1 : -1));
      if (date.getFullYear() < 1900 || date.getFullYear() > 2200) return;
      view.month = localDateKey(date).slice(0, 7);
      redraw(session);
    } else if (name === 'calendar-today') {
      view.date = localDateKey();
      view.month = view.date.slice(0, 7);
      redraw(session);
    } else if (name === 'event-delete') {
      data.events = data.events.filter(entry => entry.id !== target.dataset.id);
      draft.changed();
      redraw(session);
    } else if (name === 'memo-new') {
      newEntry(session);
    } else if (name === 'memo-select') {
      view.active = target.dataset.id;
      redraw(session);
    } else if (name === 'memo-undo' && view.deleted) {
      if (data.entries.length >= MEMO_LIMIT) return;
      data.entries.push(view.deleted);
      view.active = view.deleted.id;
      view.deleted = null;
      draft.changed();
      redraw(session);
      await flush(session);
    } else if (name === 'save-retry') {
      await flush(session);
    } else if (name === 'draft-export') {
      exportDraft(session);
    } else if (name === 'weather-refresh') {
      const job = requestWeather(currentItem(session).config.city, true);
      redraw(session);
      await job;
      redraw(session);
      host.refreshCards();
    } else {
      const entry = data.entries?.find(entry => entry.id === view.active);
      if (!entry) return;
      if (name === 'memo-pin') {
        entry.pinned = !entry.pinned;
        draft.changed();
        redraw(session);
      } else if (name === 'memo-export') {
        download(entry.title + '\n\n' + entry.text, (entry.title || 'Qiye-memo').slice(0, 80) + '.txt', 'text/plain;charset=utf-8');
      } else if (name === 'memo-delete') {
        data.entries = data.entries.filter(memo => memo.id !== entry.id);
        view.active = listMemos(data.entries)[0]?.id || '';
        view.deleted = entry;
        draft.changed();
        redraw(session);
        await flush(session);
      }
    }
  }

  function input(session, event) {
    const {root, draft, view} = session, target = event.target;
    if (target.id === 'memo-query') view.query = target.value;
    else if (target.id === 'memo-title' || target.id === 'memo-text') {
      const entry = draft.data.entries.find(entry => entry.id === view.active);
      if (!entry) return;
      entry[target.id === 'memo-title' ? 'title' : 'text'] = target.value;
      entry.updatedAt = Date.now();
      draft.changed();
      root.querySelector('#memo-count').textContent = t('{count} 字符', {count:entry.text.length});
    } else return;
    root.querySelector('#memo-list').innerHTML = memoList(listMemos(draft.data.entries, view.query, view.sort), view.active);
  }

  function change(session, event) {
    const target = event.target;
    if (target.id === 'calendar-month' && parseDate(target.value + '-01')) {
      session.view.month = target.value;
      redraw(session);
    }
    if (target.id === 'memo-sort') {
      session.view.sort = target.value;
      redraw(session);
    }
  }

  async function submit(session, event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target, data = new FormData(form);
    if (form.id === 'calendar-event-form') {
      const title = String(data.get('title')).trim();
      if (!title) return;
      if (session.draft.data.events.length >= 500) { host.toast(t('日程最多支持 500 条')); return; }
      session.draft.data.events.push({id:host.uid(), date:session.view.date, title});
      session.draft.changed();
      redraw(session);
      await flush(session);
    }
    if (form.id === 'date-tool-form') {
      const output = session.root.querySelector('#date-tool-result');
      try {
        const start = parseDate(data.get('start')), end = parseDate(data.get('end'));
        if (!start || !end) throw new Error(t('请选择有效日期'));
        output.textContent = t('相差 {days} 天；包含首尾日期共 {workdays} 个工作日。', {days:daysBetween(start,end), workdays:countWorkdays(start,end,currentItem(session).config.holidays)});
      } catch (error) { output.textContent = error.message; }
    }
  }

  function close() {
    const session = active;
    if (!session) return closing;
    active = null;
    session.controller?.abort();
    if (session.root) session.root.inert = true;
    session.root = null;
    const job = flush(session).then(saved => {
      if (saved && !session.root) drafts.delete(session.item.id);
      else if (!saved && !session.root) host.toast(t('内容尚未保存，重新打开组件可继续编辑。'), () => exportDraft(session), t('导出副本'));
      return saved;
    }).finally(() => { if (closing === job) closing = null; });
    closing = job;
    return job;
  }

  return {
    close,
    render(item, data = {}) {
      let session = drafts.get(item.id);
      if (!session) {
        const today = data.date || localDateKey();
        session = {item, view:{date:today, month:today.slice(0,7), query:'', sort:'updated', active:data.memoId || listMemos(item.data.entries || [])[0]?.id || ''}};
        session.draft = createWidgetDraft(item, host.saveData, () => {
          updateStatus(session);
          if (!session.draft.dirty) host.refreshCards();
        });
        drafts.set(item.id, session);
      }
      active = session;
      return renderBody(session);
    },
    mount(element, data = {}) {
      const session = active;
      session.root = element;
      session.controller = new AbortController();
      const options = {signal:session.controller.signal};
      element.addEventListener('click', event => { action(session,event).catch(error => host.toast(error.message)); }, options);
      element.addEventListener('input', event => input(session,event), options);
      element.addEventListener('change', event => change(session,event), options);
      element.addEventListener('submit', event => { submit(session,event).catch(error => host.toast(error.message)); }, options);
      globalThis.addEventListener('pagehide', () => { void flush(session); }, options);
      updateStatus(session);
      if (data.newMemo) newEntry(session);
      if (session.item.widget === 'weather' && currentItem(session).config.enabled) {
        const job = requestWeather(currentItem(session).config.city);
        redraw(session);
        job.then(() => redraw(session));
      }
    },
  };
}

export function bindCitySearch(form) {
  if (!form?.querySelector('#city-query')) return () => {};
  const events = new AbortController();
  let search = null, results = [];
  const options = {signal:events.signal};
  form.querySelector('#city-query').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      form.querySelector('[data-city-search]').click();
    }
  }, options);
  form.addEventListener('click', async event => {
    const button = event.target.closest('[data-city-search],[data-city-result]');
    if (!button) return;
    event.preventDefault();
    const output = form.querySelector('#city-results');
    if (button.hasAttribute('data-city-result')) {
      const city = results[Number(button.dataset.cityResult)];
      if (city) {
        form.elements.cityName.value = city.name;
        form.elements.latitude.value = city.latitude;
        form.elements.longitude.value = city.longitude;
        output.replaceChildren();
      }
      return;
    }
    search?.abort();
    search = new AbortController();
    const request = search, timer = setTimeout(() => request.abort(), 8000);
    output.textContent = t('正在搜索…');
    try {
      const found = await searchCities(form.querySelector('#city-query').value, request.signal);
      if (request !== search || !form.isConnected) return;
      results = found;
      output.innerHTML = results.map((city,index) => `<button type="button" data-city-result="${index}"><strong>${escapeText(city.name)}</strong><span>${escapeText(city.region)}</span></button>`).join('') || t('没有找到城市，请使用英文名称或填写坐标。');
    } catch {
      if (request === search && form.isConnected) output.textContent = t('城市搜索失败，请重试或填写坐标。');
    } finally { clearTimeout(timer); }
  }, options);
  return () => { events.abort(); search?.abort(); };
}
