import { normalizeWallpaperPhoto } from './wallpapers.js';

/**
 * Shared, dependency-free storage boundary for every Qiye extension surface.
 * User text remains text: callers must render it using textContent or escape it.
 * URL fields, imported object shape, size limits and references are checked here.
 */

export const STORAGE_KEY = 'qiye.state.v1';
export const MAX_BACKUP_BYTES = 6 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;

const LIMITS = Object.freeze({ groups: 30, items: 1200, todos: 500, habits: 100, dates: 3660, notes: 100000 });
const WIDGETS = new Set(['weather', 'calendar', 'notes', 'todo', 'countdown', 'focus', 'quote', 'hotlinks', 'workday', 'calculator', 'habit', 'clock', 'wallpaper']);
const SIZES = new Set(['1x1', '2x1', '2x2', '4x2']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const BASE_ENGINES = [
  { id: 'bing', name: '必应', letter: 'b', color: '#0EA5A6', url: 'https://www.bing.com/search?q={q}' },
  { id: 'baidu', name: '百度', letter: '百', color: '#3866F5', url: 'https://www.baidu.com/s?wd={q}' },
  { id: 'google', name: 'Google', letter: 'G', color: '#4285F4', url: 'https://www.google.com/search?q={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', letter: 'D', color: '#E66A39', url: 'https://duckduckgo.com/?q={q}' },
  { id: 'bilibili', name: '哔哩哔哩', letter: '哔', color: '#F58DB0', url: 'https://search.bilibili.com/all?keyword={q}' }
];

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const ENGINES = deepFreeze(BASE_ENGINES);

function link(id, groupId, title, url, icon, color, folderId = null, iconMode = 'auto') {
  return { id, groupId, type: 'link', title, url, icon, iconMode, color, size: '1x1', folderId };
}

function widget(id, widgetType, title, size = '2x2', config = {}, groupId = 'home') {
  return { id, groupId, type: 'widget', widget: widgetType, title, size, config };
}

export const DEFAULT_STATE = deepFreeze({
  schemaVersion: 1,
  updatedAt: 0,
  settings: {
    theme: 'dark', wallpaper: 'aurora', customWallpaper: null, customWallpaperType: 'image',
    blur: 0, dim: 14, showSeconds: false, hour12: false, pinClock: true, pinSearch: true, minimal: false, openNewTab: true,
    gridSize: 74, gap: 18, radius: 19, showLabels: true, clockSize: 78,
    searchEngine: 'bing', customEngines: [], weatherCity: { name: '香港', latitude: 22.32, longitude: 114.17 },
    weatherEnabled: false, dailyWallpaper: false, quote: true,
    wallpaperApiEnabled: false, remoteWallpaper: null
  },
  activeGroupId: 'home',
  groups: [
    { id: 'home', name: '主页', icon: 'home' },
    { id: 'code', name: '编程', icon: 'code' },
    { id: 'design', name: '设计', icon: 'palette' },
    { id: 'work', name: '产品', icon: 'briefcase' },
    { id: 'ai', name: 'AI', icon: 'sparkles' },
    { id: 'life', name: '生活', icon: 'coffee' }
  ],
  items: [
    widget('weather-home', 'weather', '天气'),
    widget('calendar-home', 'calendar', '日历'),
    link('site-google', 'home', 'Google', 'https://www.google.com/', 'G', '#FFFFFF'),
    link('site-bilibili', 'home', '哔哩哔哩', 'https://www.bilibili.com/', '哔', '#F18CAD'),
    link('site-github', 'home', 'GitHub', 'https://github.com/', 'github', '#24292F'),
    link('site-chatgpt', 'home', 'ChatGPT', 'https://chatgpt.com/', 'sparkles', '#10A37F'),
    widget('wallpaper-home', 'wallpaper', '发现壁纸', '4x2'),
    widget('notes-home', 'notes', '灵感便签', '2x2', { color: 'yellow' }),
    widget('todo-home', 'todo', '今日待办'),
    link('site-youtube', 'home', 'YouTube', 'https://www.youtube.com/', 'play', '#F44349'),
    link('site-zhihu', 'home', '知乎', 'https://www.zhihu.com/', '知', '#1677FF'),
    link('site-douban', 'home', '豆瓣', 'https://www.douban.com/', '豆', '#2DA854'),
    link('site-notion', 'home', 'Notion', 'https://www.notion.so/', 'N', '#F6F4F0'),
    widget('countdown-home', 'countdown', '下一份期待'),
    widget('focus-home', 'focus', '专注时刻'),
    widget('workday-home', 'workday', '下班倒计时'),
    { id: 'folder-tools', groupId: 'home', type: 'folder', title: '随手工具', icon: 'folder', color: '#A6B1E1', size: '2x2' },
    link('tool-deepl', 'home', 'DeepL', 'https://www.deepl.com/translator', '译', '#234D68', 'folder-tools'),
    link('tool-figma', 'home', 'Figma', 'https://www.figma.com/', 'F', '#A259FF', 'folder-tools'),
    link('tool-unsplash', 'home', 'Unsplash', 'https://unsplash.com/', 'U', '#25282E', 'folder-tools'),
    link('tool-excalidraw', 'home', 'Excalidraw', 'https://excalidraw.com/', 'pen', '#8D8AEF', 'folder-tools'),
    link('work-mail', 'work', 'Gmail', 'https://mail.google.com/', 'mail', '#E96759'),
    link('work-outlook', 'work', 'Outlook', 'https://outlook.live.com/', 'mail', '#2483C6'),
    link('work-calendar', 'work', 'Google 日历', 'https://calendar.google.com/', 'calendar', '#4385EF'),
    link('work-drive', 'work', 'Google 云端硬盘', 'https://drive.google.com/', 'triangle', '#2FAC75'),
    widget('todo-work', 'todo', '工作清单', '2x2', {}, 'work'),
    widget('focus-work', 'focus', '专注工作', '2x2', {}, 'work'),
    link('code-mdn', 'code', 'MDN', 'https://developer.mozilla.org/zh-CN/', 'M', '#242933'),
    link('code-github', 'code', 'GitHub', 'https://github.com/', 'github', '#24292F'),
    link('code-stack', 'code', 'Stack Overflow', 'https://stackoverflow.com/', 'code', '#EF8A38'),
    link('code-npm', 'code', 'npm', 'https://www.npmjs.com/', 'npm', '#CB3837'),
    widget('notes-code', 'notes', '开发随记', '2x2', { color: 'mint' }, 'code'),
    widget('clock-code', 'clock', '世界时钟', '2x2', { timeZone: 'America/Los_Angeles', label: '旧金山' }, 'code'),
    link('design-figma', 'design', 'Figma', 'https://www.figma.com/', 'F', '#A259FF'),
    link('design-dribbble', 'design', 'Dribbble', 'https://dribbble.com/', 'D', '#EA4C89'),
    link('design-behance', 'design', 'Behance', 'https://www.behance.net/', 'Bē', '#1769FF'),
    link('design-unsplash', 'design', 'Unsplash', 'https://unsplash.com/', 'U', '#25282E'),
    link('design-excalidraw', 'design', 'Excalidraw', 'https://excalidraw.com/', 'pen', '#8D8AEF'),
    widget('notes-design', 'notes', '创意手记', '2x2', { color: 'pink' }, 'design'),
    link('ai-chatgpt', 'ai', 'ChatGPT', 'https://chatgpt.com/', 'sparkles', '#10A37F'),
    link('ai-claude', 'ai', 'Claude', 'https://claude.ai/', 'C', '#D97757'),
    link('ai-perplexity', 'ai', 'Perplexity', 'https://www.perplexity.ai/', 'P', '#20808D'),
    link('ai-deepseek', 'ai', 'DeepSeek', 'https://chat.deepseek.com/', 'D', '#4D6BFE'),
    link('ai-huggingface', 'ai', 'Hugging Face', 'https://huggingface.co/', '🤗', '#FFD21E'),
    widget('notes-ai', 'notes', '提示词手记', '2x2', { color: 'mint' }, 'ai'),
    link('life-music', 'life', '网易云音乐', 'https://music.163.com/', 'music', '#EB5757'),
    link('life-spotify', 'life', 'Spotify', 'https://open.spotify.com/', 'music', '#1DB954'),
    link('life-map', 'life', '高德地图', 'https://www.amap.com/', 'map', '#4D90FE'),
    link('life-douban', 'life', '豆瓣', 'https://www.douban.com/', '豆', '#2DA854'),
    widget('habit-life', 'habit', '小习惯', '2x2', {}, 'life'),
    widget('quote-life', 'quote', '留一点空白', '2x2', {}, 'life'),
    widget('calculator-life', 'calculator', '随手算', '2x2', {}, 'life')
  ],
  notes: '把忽然想到的事，留在这一页。\n\n试试拖动卡片，让它成为你的日常。',
  todos: [
    { id: 'todo-explore', text: '换一张喜欢的壁纸', done: false },
    { id: 'todo-create', text: '添加一个常用网站', done: false },
    { id: 'todo-break', text: '给自己留一点休息时间', done: true }
  ],
  focus: { duration: 25, remaining: 1500, endAt: null, running: false },
  countdown: { title: '新年，新的期待', date: '2027-01-01' },
  workday: { endTime: '18:00', payday: 10, monthlySalary: 0 },
  habits: [
    { id: 'habit-water', name: '好好喝水', dates: [] },
    { id: 'habit-read', name: '读十分钟书', dates: [] }
  ]
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function uid() {
  if (globalThis.crypto?.randomUUID) return `qy_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
  return `qy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Accept complete HTTP(S) URLs or a bare domain. Credentials and controls are never allowed. */
export function safeUrl(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value || value.length > 4096 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
    if (value.startsWith('//')) value = `https:${value}`;
    else if (/^[^/?#]+\.[^/?#]+/.test(value)) value = `https://${value}`;
    else return null;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch { return null; }
}

function invalid(path, reason) { throw new Error(`数据校验失败：${path}${reason ? ` ${reason}` : ''}`); }
function plain(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, '必须是对象');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path, '不能包含特殊对象');
  return value;
}
function keys(value, allowed, path) {
  plain(value, path);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) invalid(path, '包含不安全字段');
    if (!allowed.includes(key)) invalid(`${path}.${key}`, '不是支持的字段');
  }
  return value;
}
function string(value, path, max = 120, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) invalid(path, `必须是${allowEmpty ? '' : '非空'}文本，最多 ${max} 个字符`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(path, '包含控制字符');
  return value;
}
function id(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) invalid(path, '标识格式不正确');
  return value;
}
function number(value, path, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(path, `必须是 ${min}–${max} 范围内的${integer ? '整数' : '数字'}`);
  return value;
}
function bool(value, path) { if (typeof value !== 'boolean') invalid(path, '必须是布尔值'); return value; }
function enumeration(value, values, path) { if (!values.includes(value)) invalid(path, '包含不支持的值'); return value; }
function array(value, path, max, min = 0) { if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, `必须是 ${min}–${max} 项的数组`); return value; }
function color(value, path) { if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) invalid(path, '必须是十六进制颜色'); return value; }
function url(value, path) { const result = safeUrl(value); if (!result) invalid(path, '只支持安全的 http / https 地址'); return result; }
function date(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(path, '日期格式须为 YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(`${value}T12:00:00Z`);
  if (year < 1900 || year > 2200 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) invalid(path, '不是有效日期');
  return value;
}
function time(value, path) { if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid(path, '时间格式须为 HH:MM'); return value; }
function unique(values, path) { if (new Set(values).size !== values.length) invalid(path, '存在重复标识'); }
function maybe(value, fallback) { return value === undefined ? fallback : value; }
function byteLength(value) { return new TextEncoder().encode(value).byteLength; }

function validateMedia(value, type) {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.startsWith('data:')) invalid('settings.customWallpaper', '本地媒体仅支持 data URL；在线壁纸请使用壁纸小组件');
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0 || match[2].length === 0) invalid('settings.customWallpaper', '仅支持 PNG、JPEG、WebP、GIF、AVIF、MP4 或 WebM 的 base64 数据');
  if ((type === 'video') !== match[1].startsWith('video/')) invalid('settings.customWallpaperType', '与媒体数据类型不一致');
  const decodedSize = (match[2].length / 4) * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (decodedSize > MAX_MEDIA_BYTES) invalid('settings.customWallpaper', '媒体文件不能超过 4 MiB');
  return value;
}

function validateSettings(raw) {
  const defaults = DEFAULT_STATE.settings;
  keys(raw, Object.keys(defaults), 'settings');
  const v = { ...defaults, ...raw };
  const customEngines = array(v.customEngines, 'settings.customEngines', 12).map((engine, i) => {
    const path = `settings.customEngines[${i}]`;
    keys(engine, ['id', 'name', 'letter', 'color', 'url'], path);
    const engineId = id(engine.id, `${path}.id`);
    if (ENGINES.some(e => e.id === engineId)) invalid(`${path}.id`, '不能覆盖内置搜索引擎');
    const template = string(engine.url, `${path}.url`, 4096);
    if (!template.includes('{q}') || template.split('{q}').length > 3) invalid(`${path}.url`, '必须包含搜索词占位符 {q}');
    const checked = url(template.replaceAll('{q}', 'qiye-search-token'), `${path}.url`);
    if (!checked.includes('qiye-search-token')) invalid(`${path}.url`, '搜索词占位符无效');
    const name = string(engine.name, `${path}.name`, 40);
    return { id: engineId, name, letter: string(maybe(engine.letter, name.slice(0, 1)), `${path}.letter`, 4), color: color(maybe(engine.color, '#6BA39A'), `${path}.color`), url: template };
  });
  unique(customEngines.map(e => e.id), 'settings.customEngines');
  if (![...ENGINES, ...customEngines].some(e => e.id === v.searchEngine)) invalid('settings.searchEngine', '找不到对应搜索引擎');
  keys(v.weatherCity, ['name', 'latitude', 'longitude'], 'settings.weatherCity');
  const remoteWallpaper = v.remoteWallpaper === null ? null : normalizeWallpaperPhoto(v.remoteWallpaper);
  if (v.remoteWallpaper !== null && !remoteWallpaper) invalid('settings.remoteWallpaper', '在线壁纸来源不受支持，请从壁纸小组件重新选择');
  const customWallpaperType = enumeration(v.customWallpaperType, ['image', 'video'], 'settings.customWallpaperType');
  return {
    theme: enumeration(v.theme, ['dark', 'light', 'auto'], 'settings.theme'),
    wallpaper: enumeration(v.wallpaper, ['aurora', 'sunset', 'ocean', 'forest', 'lavender', 'midnight'], 'settings.wallpaper'),
    customWallpaper: validateMedia(v.customWallpaper, customWallpaperType), customWallpaperType,
    blur: number(v.blur, 'settings.blur', 0, 40), dim: number(v.dim, 'settings.dim', 0, 90),
    showSeconds: bool(v.showSeconds, 'settings.showSeconds'), hour12: bool(v.hour12, 'settings.hour12'),
    pinClock: bool(v.pinClock, 'settings.pinClock'), pinSearch: bool(v.pinSearch, 'settings.pinSearch'),
    minimal: bool(v.minimal, 'settings.minimal'), openNewTab: bool(v.openNewTab, 'settings.openNewTab'),
    gridSize: number(v.gridSize, 'settings.gridSize', 48, 120), gap: number(v.gap, 'settings.gap', 8, 40),
    radius: number(v.radius, 'settings.radius', 0, 48), showLabels: bool(v.showLabels, 'settings.showLabels'),
    clockSize: number(v.clockSize, 'settings.clockSize', 32, 160), searchEngine: v.searchEngine, customEngines,
    weatherCity: { name: string(v.weatherCity.name, 'settings.weatherCity.name', 60), latitude: number(v.weatherCity.latitude, 'settings.weatherCity.latitude', -90, 90), longitude: number(v.weatherCity.longitude, 'settings.weatherCity.longitude', -180, 180) },
    weatherEnabled: bool(v.weatherEnabled, 'settings.weatherEnabled'), dailyWallpaper: bool(v.dailyWallpaper, 'settings.dailyWallpaper'), quote: bool(v.quote, 'settings.quote'),
    wallpaperApiEnabled: bool(v.wallpaperApiEnabled, 'settings.wallpaperApiEnabled'),
    remoteWallpaper
  };
}

function validateConfig(widgetType, raw, path) {
  const v = raw === undefined ? {} : raw;
  const fields = {
    countdown: ['title', 'date'], workday: ['endTime', 'payday', 'workdays'], clock: ['timeZone', 'label'],
    quote: ['text', 'author', 'quoteIndex'], notes: ['color']
  };
  keys(v, fields[widgetType] || [], path);
  const out = {};
  if (v.title !== undefined) out.title = string(v.title, `${path}.title`, 120);
  if (v.date !== undefined) out.date = date(v.date, `${path}.date`);
  if (v.endTime !== undefined) out.endTime = time(v.endTime, `${path}.endTime`);
  if (v.payday !== undefined) out.payday = number(v.payday, `${path}.payday`, 1, 31, true);
  if (v.workdays !== undefined) {
    out.workdays = array(v.workdays, `${path}.workdays`, 7).map(day => number(day, `${path}.workdays`, 0, 6, true));
    unique(out.workdays, `${path}.workdays`);
  }
  if (v.timeZone !== undefined) {
    out.timeZone = string(v.timeZone, `${path}.timeZone`, 80);
    try { new Intl.DateTimeFormat('en', { timeZone: out.timeZone }).format(); } catch { invalid(`${path}.timeZone`, '不是有效时区'); }
  }
  if (v.label !== undefined) out.label = string(v.label, `${path}.label`, 60);
  if (v.text !== undefined) out.text = string(v.text, `${path}.text`, 1000, true);
  if (v.author !== undefined) out.author = string(v.author, `${path}.author`, 120, true);
  if (v.quoteIndex !== undefined) out.quoteIndex = number(v.quoteIndex, `${path}.quoteIndex`, 0, 1000000, true);
  if (v.color !== undefined) out.color = enumeration(v.color, ['yellow', 'pink', 'mint'], `${path}.color`);
  return out;
}

/** Parse and validate before any storage mutation. Invalid records are never silently dropped. */
export function validateImport(raw) {
  let data;
  if (typeof raw === 'string') {
    if (raw.length > MAX_BACKUP_BYTES || byteLength(raw) > MAX_BACKUP_BYTES) invalid('备份', '文件不能超过 6 MiB');
    try { data = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { invalid('备份', '不是有效 JSON 文件'); }
  } else {
    // Object callers include the live application. Serialization also rejects cycles.
    try {
      const serialized = JSON.stringify(raw);
      if (serialized === undefined || serialized.length > MAX_BACKUP_BYTES || byteLength(serialized) > MAX_BACKUP_BYTES) invalid('备份', '内容为空或超过 6 MiB');
    } catch (error) {
      if (error?.message?.startsWith('数据校验失败')) throw error;
      invalid('备份', '不能包含循环引用或无法保存的数据');
    }
    data = raw;
  }
  keys(data, Object.keys(DEFAULT_STATE), 'state');
  if (data.schemaVersion !== 1) invalid('schemaVersion', '仅支持栖页 v1 备份');
  const settings = validateSettings(plain(data.settings, 'settings'));
  const groups = array(data.groups, 'groups', LIMITS.groups, 1).map((group, i) => {
    const path = `groups[${i}]`;
    keys(group, ['id', 'name', 'icon'], path);
    return { id: id(group.id, `${path}.id`), name: string(group.name, `${path}.name`, 40), icon: string(maybe(group.icon, 'folder'), `${path}.icon`, 40) };
  });
  unique(groups.map(g => g.id), 'groups');
  const groupIds = new Set(groups.map(g => g.id));
  const activeGroupId = id(data.activeGroupId, 'activeGroupId');
  if (!groupIds.has(activeGroupId)) invalid('activeGroupId', '对应分组不存在');
  const items = array(data.items, 'items', LIMITS.items).map((item, i) => {
    const path = `items[${i}]`;
    plain(item, path);
    const type = enumeration(item.type, ['link', 'folder', 'widget'], `${path}.type`);
    const allowed = type === 'link' ? ['id', 'groupId', 'type', 'title', 'url', 'icon', 'iconMode', 'color', 'size', 'folderId'] : type === 'folder' ? ['id', 'groupId', 'type', 'title', 'icon', 'color', 'size'] : ['id', 'groupId', 'type', 'widget', 'title', 'size', 'config'];
    keys(item, allowed, path);
    const groupId = id(item.groupId, `${path}.groupId`);
    if (!groupIds.has(groupId)) invalid(`${path}.groupId`, '对应分组不存在');
    const base = { id: id(item.id, `${path}.id`), groupId, type, title: string(item.title, `${path}.title`, 120) };
    const size = maybe(item.size, type === 'link' ? '1x1' : '2x2');
    if (!SIZES.has(size)) invalid(`${path}.size`, '卡片尺寸不受支持');
    if (type === 'widget') {
      if (!WIDGETS.has(item.widget)) invalid(`${path}.widget`, '组件类型不受支持');
      return { ...base, widget: item.widget, size, config: validateConfig(item.widget, item.config, `${path}.config`) };
    }
    const appearance = { icon: string(maybe(item.icon, type === 'folder' ? 'folder' : item.title.slice(0, 1)), `${path}.icon`, 80), color: color(maybe(item.color, '#6BA39A'), `${path}.color`), size };
    if (type === 'folder') return { ...base, ...appearance };
    // Old backups acquire automatic discovery without losing their text fallback.
    const iconMode = enumeration(maybe(item.iconMode, 'auto'), ['auto', 'text'], `${path}.iconMode`);
    return { ...base, url: url(item.url, `${path}.url`), ...appearance, iconMode, folderId: item.folderId === undefined || item.folderId === null ? null : id(item.folderId, `${path}.folderId`) };
  });
  unique(items.map(item => item.id), 'items');
  const folderMap = new Map(items.filter(item => item.type === 'folder').map(item => [item.id, item]));
  for (const item of items) if (item.folderId !== undefined && item.folderId !== null) {
    const folder = folderMap.get(item.folderId);
    if (!folder || folder.groupId !== item.groupId) invalid(`items.${item.id}.folderId`, '文件夹不存在或不属于同一分组');
  }
  const todos = array(maybe(data.todos, []), 'todos', LIMITS.todos).map((todo, i) => {
    const path = `todos[${i}]`; keys(todo, ['id', 'text', 'done'], path);
    return { id: id(todo.id, `${path}.id`), text: string(todo.text, `${path}.text`, 1000), done: bool(todo.done, `${path}.done`) };
  });
  unique(todos.map(todo => todo.id), 'todos');
  const f = maybe(data.focus, DEFAULT_STATE.focus);
  keys(f, ['duration', 'remaining', 'endAt', 'running'], 'focus');
  const focus = { duration: number(f.duration, 'focus.duration', 1, 180, true), remaining: number(f.remaining, 'focus.remaining', 0, 10800), endAt: f.endAt === null ? null : number(f.endAt, 'focus.endAt', 0, 8640000000000000), running: bool(f.running, 'focus.running') };
  if (focus.running && focus.endAt === null) invalid('focus.endAt', '运行中的番茄钟必须包含结束时间');
  const cd = maybe(data.countdown, DEFAULT_STATE.countdown);
  keys(cd, ['title', 'date'], 'countdown');
  const wd = maybe(data.workday, DEFAULT_STATE.workday);
  keys(wd, ['endTime', 'payday', 'monthlySalary'], 'workday');
  const habits = array(maybe(data.habits, []), 'habits', LIMITS.habits).map((habit, i) => {
    const path = `habits[${i}]`; keys(habit, ['id', 'name', 'dates'], path);
    const dates = array(habit.dates, `${path}.dates`, LIMITS.dates).map(v => date(v, `${path}.dates`));
    unique(dates, `${path}.dates`);
    return { id: id(habit.id, `${path}.id`), name: string(habit.name, `${path}.name`, 120), dates };
  });
  unique(habits.map(habit => habit.id), 'habits');
  return {
    schemaVersion: 1, updatedAt: number(maybe(data.updatedAt, 0), 'updatedAt', 0, 8640000000000000),
    settings, activeGroupId, groups, items, notes: string(maybe(data.notes, ''), 'notes', LIMITS.notes, true), todos, focus,
    countdown: { title: string(cd.title, 'countdown.title', 120), date: date(cd.date, 'countdown.date') },
    workday: { endTime: time(wd.endTime, 'workday.endTime'), payday: number(wd.payday, 'workday.payday', 1, 31, true), monthlySalary: number(wd.monthlySalary, 'workday.monthlySalary', 0, 1000000000) },
    habits
  };
}

export function exportState(state) {
  const data = validateImport(state);
  const output = JSON.stringify(data, null, 2);
  if (byteLength(output) > MAX_BACKUP_BYTES) throw new Error('导出的备份超过 6 MiB；请先移除自定义壁纸后再导出。');
  return output;
}

function hasExtensionStorage() { return !!globalThis.chrome?.storage?.local; }

function chromeCall(owner, method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const result = owner[method](...args, value => {
        const lastError = globalThis.chrome?.runtime?.lastError;
        if (lastError) reject(new Error(lastError.message || '浏览器扩展操作失败'));
        else resolve(value);
      });
      if (result && typeof result.then === 'function') result.then(resolve, reject);
    } catch (error) { reject(error); }
  });
}

async function readStored() {
  if (hasExtensionStorage()) {
    const result = await chromeCall(globalThis.chrome.storage.local, 'get', STORAGE_KEY);
    return result?.[STORAGE_KEY];
  }
  if (!globalThis.localStorage) throw new Error('此环境无法访问本地存储。请在扩展或浏览器页面中打开栖页。');
  const raw = globalThis.localStorage.getItem(STORAGE_KEY);
  return raw === null ? undefined : raw;
}

export async function loadState() {
  let stored;
  try { stored = await readStored(); } catch (error) { throw new Error(`无法读取栖页数据：${error.message}`); }
  if (stored === undefined) return clone(DEFAULT_STATE);
  try { return validateImport(stored); } catch (error) { throw new Error(`本地数据异常，原数据已保留。${error.message}`); }
}

const subscribers = new Set();
let attachedListener = null;
let localQueue = Promise.resolve();
let lastEmitted = '';

function emitState(state) {
  const fingerprint = JSON.stringify(state);
  if (lastEmitted === fingerprint) return;
  lastEmitted = fingerprint;
  for (const subscriber of subscribers) {
    try { subscriber(clone(state)); } catch { /* One UI subscriber must not interrupt another. */ }
  }
}

function attachStorageListener() {
  if (attachedListener) return;
  if (globalThis.chrome?.storage?.onChanged) {
    const handler = (changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
      try { emitState(validateImport(changes[STORAGE_KEY].newValue)); } catch { /* Keep the last validated state. */ }
    };
    globalThis.chrome.storage.onChanged.addListener(handler);
    attachedListener = () => globalThis.chrome?.storage?.onChanged?.removeListener(handler);
  } else if (globalThis.addEventListener) {
    const handler = event => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { emitState(validateImport(event.newValue)); } catch { /* Keep the last validated state. */ }
    };
    globalThis.addEventListener('storage', handler);
    attachedListener = () => globalThis.removeEventListener('storage', handler);
  }
}

export function subscribeState(callback) {
  if (typeof callback !== 'function') throw new TypeError('订阅者必须是函数');
  subscribers.add(callback);
  attachStorageListener();
  return () => {
    subscribers.delete(callback);
    if (!subscribers.size && attachedListener) { attachedListener(); attachedListener = null; }
  };
}

function withWriteLock(operation) {
  // Web Locks coordinates the new tab, popup and worker in supported browsers.
  const task = () => globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request(STORAGE_KEY, operation)
    : operation();
  const result = localQueue.then(task, task);
  localQueue = result.catch(() => {});
  return result;
}

async function persistValidated(state, previousRevision = state.updatedAt) {
  const updatedAt = Math.max(Date.now(), previousRevision + 1);
  if (updatedAt > 8640000000000000) throw new Error('本地数据版本超出可保存范围，请导出备份后明确重置或恢复。');
  const next = { ...state, updatedAt };
  try {
    if (hasExtensionStorage()) await chromeCall(globalThis.chrome.storage.local, 'set', { [STORAGE_KEY]: next });
    else {
      if (!globalThis.localStorage) throw new Error('本地存储不可用');
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch (error) { throw new Error(`保存失败，原数据未主动清除。可能空间不足或存储被禁用：${error.message}`); }
  emitState(next);
  return clone(next);
}

export async function saveState(state, options = {}) {
  // Validate and snapshot now: later UI mutations cannot alter an enqueued write.
  const next = validateImport(state);
  return withWriteLock(async () => {
    // A lock serializes writes, but an old complete snapshot could still erase a
    // link added by another surface. Reject it instead of guessing at deletions.
    // Explicit restore/reset can replace even a damaged old record.
    let current;
    if (options.replace !== true) {
      current = await loadState();
      if (current.updatedAt !== next.updatedAt) {
        const error = new Error('另一个标签页已更新栖页，此次改动尚未保存。已保留最新数据，请在刷新后的内容上重试。');
        error.code = 'STATE_CONFLICT';
        error.currentState = clone(current);
        throw error;
      }
    } else {
      // A restore gets a new local revision, not the historical backup revision.
      // This also prevents a rapid reset from reusing an old snapshot's version.
      try { current = await loadState(); } catch { /* Explicit replacement may repair damaged storage. */ }
    }
    return persistValidated(next, current?.updatedAt || 0);
  });
}

/** Transactional read/append used by the popup and context menu. */
export async function appendLink(linkData, groupId) {
  const checkedUrl = safeUrl(linkData?.url);
  if (!checkedUrl) throw new Error('只能添加 http 或 https 网页。浏览器内部页面无法收藏到栖页。');
  const iconMode = enumeration(maybe(linkData.iconMode, 'auto'), ['auto', 'text'], 'link.iconMode');
  const title = typeof linkData.title === 'string' && linkData.title.trim() ? linkData.title.trim().slice(0, 120) : new URL(checkedUrl).hostname;
  return withWriteLock(async () => {
    const state = await loadState();
    const targetGroup = groupId || state.activeGroupId;
    if (!state.groups.some(group => group.id === targetGroup)) throw new Error('目标分组已不存在，请重新选择。');
    const existing = state.items.find(item => item.type === 'link' && item.groupId === targetGroup && item.url === checkedUrl && !item.folderId);
    if (existing) return { state, item: clone(existing), duplicate: true };
    const item = link(uid(), targetGroup, title, checkedUrl, title.slice(0, 1), '#6BA39A', null, iconMode);
    state.items.push(item);
    const saved = await persistValidated(validateImport(state));
    return { state: saved, item: clone(item), duplicate: false };
  });
}

async function requireOptionalPermission(permission) {
  if (!globalThis.chrome?.permissions) throw new Error('此功能需要先在 Chrome 或 Edge 中安装栖页扩展。');
  const descriptor = { permissions: [permission] };
  const granted = await chromeCall(globalThis.chrome.permissions, 'contains', descriptor);
  if (granted) return;
  const accepted = await chromeCall(globalThis.chrome.permissions, 'request', descriptor);
  if (!accepted) throw new Error(`未授予${permission === 'bookmarks' ? '书签' : '浏览记录'}权限，现有数据未改变。`);
}

export async function requestBookmarks() {
  await requireOptionalPermission('bookmarks');
  if (!globalThis.chrome?.bookmarks) throw new Error('当前浏览器未提供书签接口。');
  const tree = await chromeCall(globalThis.chrome.bookmarks, 'getTree');
  const out = [];
  const queue = [...(tree || [])];
  const seen = new Set();
  while (queue.length && out.length < 5000) {
    const node = queue.shift();
    const checkedUrl = safeUrl(node?.url);
    if (checkedUrl && !seen.has(checkedUrl)) {
      seen.add(checkedUrl);
      out.push({ title: typeof node.title === 'string' && node.title.trim() ? node.title.slice(0, 120) : new URL(checkedUrl).hostname, url: checkedUrl });
    }
    if (Array.isArray(node?.children)) queue.push(...node.children);
  }
  return out;
}

export async function searchHistory(query) {
  const text = string(query, '搜索词', 200, true).trim();
  if (!text) return [];
  await requireOptionalPermission('history');
  if (!globalThis.chrome?.history) throw new Error('当前浏览器未提供历史记录接口。');
  const results = await chromeCall(globalThis.chrome.history, 'search', { text, startTime: 0, maxResults: 50 });
  return (results || []).flatMap(entry => {
    const checkedUrl = safeUrl(entry.url);
    return checkedUrl ? [{ id: String(entry.id || ''), title: String(entry.title || new URL(checkedUrl).hostname).slice(0, 200), url: checkedUrl, lastVisitTime: Number(entry.lastVisitTime) || 0, visitCount: Number(entry.visitCount) || 0 }] : [];
  });
}

export async function addCurrentTab(options = {}) {
  if (!globalThis.chrome?.tabs) throw new Error('请在安装后的栖页扩展弹窗中添加当前页面。');
  const tabs = await chromeCall(globalThis.chrome.tabs, 'query', { active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.url) throw new Error('无法读取当前页面。请在普通网页上点击栖页扩展图标重试。');
  return appendLink({ url: tab.url, title: options.title || tab.title }, options.groupId);
}
