// SPDX-License-Identifier: GPL-3.0-only
import { keys, string, number, bool, enumeration, array, unique, date, time, invalid } from './validation.js';
import { widgetExtensions } from './widget-extensions.js';

const builtins = [
  { type: 'wallpaper', title: '在线壁纸', description: '浏览公开摄影图库，一键设为壁纸', size: '4x2', icon: 'image' },
  { type: 'weather', title: '天气', description: '启用后显示城市的实时天气', size: '2x2', icon: 'cloud' },
  { type: 'calendar', title: '日历', description: '公历月份与中国农历', size: '2x2', icon: 'calendar' },
  { type: 'notes', title: '便签', description: '随手记录，自动保存到本机', size: '2x2', icon: 'note' },
  { type: 'todo', title: '待办清单', description: '添加、勾选和删除日常任务', size: '2x2', icon: 'check' },
  { type: 'countdown', title: '倒数日', description: '记住值得期待的日子', size: '2x2', icon: 'flag' },
  { type: 'focus', title: '专注计时', description: '可暂停的番茄钟，关闭页面继续计时', size: '2x2', icon: 'timer' },
  { type: 'workday', title: '下班倒计时', description: '工作日下班与发薪日倒计时', size: '2x2', icon: 'briefcase' },
  { type: 'quote', title: '每日一句', description: '给日常留一点思考的空白', size: '4x2', icon: 'quote' },
  { type: 'hotlinks', title: '热搜入口', description: '直达各平台的热门内容页面', size: '4x2', icon: 'trending' },
  { type: 'calculator', title: '计算器', description: '加减乘除、括号和百分比计算', size: '2x2', icon: 'calculator' },
  { type: 'habit', title: '习惯打卡', description: '每日打卡和连续天数', size: '2x2', icon: 'sparkles' },
  { type: 'clock', title: '世界时钟', description: '查看城市时间与时差', size: '2x2', icon: 'globe' },
];

export const WIDGET_API_VERSION = 1;
const fieldTypes = ['text', 'number', 'select', 'checkbox'];
const builtinConfig = {
  countdown: { title: '新年，新的期待', date: '2027-01-01' },
  workday: { endTime: '18:00', payday: 10, workdays: [1, 2, 3, 4, 5] },
  clock: { timeZone: 'Asia/Hong_Kong', label: '香港' },
  quote: { text: '', author: '', quoteIndex: 0 },
  notes: { color: 'yellow' },
};

function fieldValue(field, value, path) {
  if (field.type === 'text') return string(value, path, field.maxLength ?? 1000, !field.required);
  if (field.type === 'number') return number(value, path, field.min ?? -1000000, field.max ?? 1000000, field.integer === true);
  if (field.type === 'checkbox') return bool(value, path);
  return enumeration(value, field.options.map(option => option.value), path);
}

export function createWidgetRegistry(extensions = []) {
  const definitions = new Map(builtins.map(entry => [entry.type, Object.freeze({ ...entry, builtin: true, sizes: Object.freeze(['2x2', '4x2']) })]));
  for (const source of extensions) {
    const entry = { ...source };
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(entry.type) || ['constructor', 'prototype'].includes(entry.type)) throw new Error('组件 type 必须是小写字母、数字或连字符');
    if (definitions.has(entry.type)) throw new Error(`组件重复注册：${entry.type}`);
    if (entry.apiVersion !== WIDGET_API_VERSION) throw new Error(`组件 ${entry.type} 的 API 版本不受支持`);
    for (const key of ['title', 'description']) string(entry[key], `widget.${key}`, 160);
    if (typeof entry.render !== 'function') throw new Error(`组件 ${entry.type} 缺少 render`);
    for (const hook of ['mount', 'update']) if (entry[hook] !== undefined && typeof entry[hook] !== 'function') throw new Error(`组件 ${entry.type} 的 ${hook} 必须是函数`);
    entry.sizes = Object.freeze([...(entry.sizes || ['2x2', '4x2'])]);
    if (!entry.sizes.length || entry.sizes.some(size => !['2x2', '4x2'].includes(size))) throw new Error('组件尺寸只支持 2x2 / 4x2');
    entry.size ||= entry.sizes[0];
    if (!entry.sizes.includes(entry.size)) throw new Error('组件默认尺寸不在 sizes 中');
    entry.fields = Object.freeze((entry.fields || []).map(field => {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(field.key) || ['constructor', 'prototype', '__proto__'].includes(field.key)) throw new Error('组件配置字段无效');
      enumeration(field.type, fieldTypes, `${entry.type}.${field.key}.type`);
      string(field.label, `${entry.type}.${field.key}.label`, 80);
      const copy = { ...field };
      if (field.type === 'select') {
        copy.options = Object.freeze(array(field.options, 'field.options', 40, 1).map(option => Object.freeze({ value: string(option.value, 'option.value', 80, true), label: string(option.label, 'option.label', 80) })));
        unique(copy.options.map(option => option.value), 'field.options');
      }
      if (field.type === 'text' && field.maxLength !== undefined) number(field.maxLength, 'field.maxLength', 1, 100000, true);
      if (field.type === 'number') {
        number(field.min ?? -1000000, 'field.min', -1e12, 1e12);
        number(field.max ?? 1000000, 'field.max', field.min ?? -1000000, 1e12);
      }
      fieldValue(copy, field.default, `${entry.type}.${field.key}.default`);
      return Object.freeze(copy);
    }));
    unique(entry.fields.map(field => field.key), `${entry.type}.fields`);
    entry.builtin = false;
    definitions.set(entry.type, Object.freeze(entry));
  }
  const list = Object.freeze([...definitions.values()]);
  return Object.freeze({
    get: type => definitions.get(type),
    list: () => list,
    newConfig(type) {
      const definition = definitions.get(type);
      if (!definition) invalid('widget', `未知组件 ${type}`);
      return structuredClone(definition.builtin ? builtinConfig[type] || {} : Object.fromEntries(definition.fields.map(field => [field.key, field.default])));
    },
    validateConfig(type, raw, path = 'config') {
      const definition = definitions.get(type);
      if (!definition) invalid(path, `未知组件 ${type}`);
      if (definition.builtin) return validateBuiltinConfig(type, raw, path);
      keys(raw, definition.fields.map(field => field.key), path);
      return Object.fromEntries(definition.fields.map(field => [field.key, fieldValue(field, raw[field.key], `${path}.${field.key}`)]));
    },
  });
}

const registry = createWidgetRegistry(widgetExtensions);
export function getWidgetDefinition(type) { return registry.get(type); }
export function listWidgetDefinitions() { return registry.list(); }
export function newWidgetConfig(type) { return registry.newConfig(type); }
export function validateWidgetConfig(type, raw, path) { return registry.validateConfig(type, raw, path); }

function validateBuiltinConfig(widgetType, raw, path) {
  const v = keys(raw, Object.keys(builtinConfig[widgetType] || {}), path);
  const out = {};
  if (widgetType === 'countdown') {
    out.title = string(v.title, `${path}.title`, 120);
    out.date = date(v.date, `${path}.date`);
  }
  if (widgetType === 'workday') {
    out.endTime = time(v.endTime, `${path}.endTime`);
    out.payday = number(v.payday, `${path}.payday`, 1, 31, true);
    out.workdays = array(v.workdays, `${path}.workdays`, 7).map(day => number(day, `${path}.workdays`, 0, 6, true));
    unique(out.workdays, `${path}.workdays`);
  }
  if (widgetType === 'clock') {
    out.timeZone = string(v.timeZone, `${path}.timeZone`, 80);
    try { new Intl.DateTimeFormat('en', { timeZone: out.timeZone }).format(); } catch { invalid(`${path}.timeZone`, '不是有效时区'); }
    out.label = string(v.label, `${path}.label`, 60);
  }
  if (widgetType === 'quote') {
    out.text = string(v.text, `${path}.text`, 1000, true);
    out.author = string(v.author, `${path}.author`, 120, true);
    out.quoteIndex = number(v.quoteIndex, `${path}.quoteIndex`, 0, 1000000, true);
  }
  if (widgetType === 'notes') out.color = enumeration(v.color, ['yellow', 'pink', 'mint'], `${path}.color`);
  return out;
}

