// SPDX-License-Identifier: GPL-3.0-only
import { keys, string, array, id, bool, number, date, unique, invalid } from './validation.js';

const dataKeys = Object.freeze({ notes: 'notes', todo: 'todos', habit: 'habits', focus: 'focus' });
const defaults = { notes: '', todos: [], habits: [], focus: { duration: 25, remaining: 1500, running: false, endAt: null } };

export function newWidgetData(type) {
  const key = dataKeys[type];
  return key ? structuredClone({ [key]: defaults[key] }) : {};
}

export function widgetContentSummary(items) {
  return items.reduce((summary, item) => {
    if (item.type === 'widget' && item.widget === 'todo') summary.todos += item.data.todos.length;
    if (item.type === 'widget' && item.widget === 'notes') summary.notesLength += item.data.notes.length;
    return summary;
  }, { todos: 0, notesLength: 0 });
}

export function validateWidgetData(type, raw, path) {
  const key = dataKeys[type];
  keys(raw, key ? [key] : [], path);
  if (!key) return {};
  const value = raw[key];
  const at = `${path}.${key}`;
  if (key === 'notes') return { notes: string(value, at, 100000, true) };
  if (key === 'focus') {
    keys(value, ['duration', 'remaining', 'running', 'endAt'], at);
    const focus = {
      duration: number(value.duration, `${at}.duration`, 1, 180, true),
      remaining: number(value.remaining, `${at}.remaining`, 0, 10800),
      running: bool(value.running, `${at}.running`),
      endAt: value.endAt === null ? null : number(value.endAt, `${at}.endAt`, 0, 8640000000000000),
    };
    if (focus.running && focus.endAt === null) invalid(at, '运行中的番茄钟必须包含结束时间');
    return { focus };
  }
  const entries = array(value, at, key === 'todos' ? 500 : 100).map((entry, index) => {
    const p = `${at}[${index}]`;
    keys(entry, key === 'todos' ? ['id', 'text', 'done'] : ['id', 'name', 'dates'], p);
    const entryId = id(entry.id, `${p}.id`);
    if (key === 'todos') return { id: entryId, text: string(entry.text, `${p}.text`, 1000), done: bool(entry.done, `${p}.done`) };
    const dates = array(entry.dates, `${p}.dates`, 3660).map(value => date(value, `${p}.dates`));
    unique(dates, `${p}.dates`);
    return { id: entryId, name: string(entry.name, `${p}.name`, 120), dates };
  });
  unique(entries.map(entry => entry.id), at);
  return { [key]: entries };
}
