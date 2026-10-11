/* 栖页 Qiye — independent, local-first new-tab widgets. */

import { createWallpaperBrowser, normalizeWallpaperPhoto } from './wallpapers.js';

const DAY = 86_400_000;
const WEATHER_TTL = 30 * 60_000;
const WEATHER_CACHE_KEY = 'qiye.weather.cache.v1';
const bindings = new WeakMap();
const weatherRequests = new Map();
const weatherStates = new Map();
const wallpaperBindings = new Set();
const WALLPAPER_CACHE_KEY = 'qiye.wallpaper.cache.v1';
let wallpaperBrowser = null;
const quotes = [
  '把今天过得慢一点，认真看一朵云，认真完成一件小事。',
  '让注意力回到手边，下一步就会慢慢清楚。',
  '生活留一点空白，好让新的风景走进来。',
  '不必等到准备完美，小小的开始也有自己的力量。',
  '把喜欢的事放进日常，普通的一天也会发光。',
  '给思绪一个停靠的地方，再轻轻出发。',
  '今天的进步，可以只比昨天多一点点。',
  '世界很大，眼前这杯茶和这段时光也很珍贵。',
  '偶尔抬头看看天，答案未必都藏在屏幕里。',
  '专心走好脚下的一小段路，远方也就近了一些。',
];

export const widgetCatalog = [
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

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

const icons = {
  settings: '<path d="m9.5 4 .5-2h4l.5 2 2 .9 1.8-.6 2 3.4-1.3 1.5v2.4l1.3 1.5-2 3.4-1.8-.6-2 .9-.5 2h-4l-.5-2-2-.9-1.8.6-2-3.4L4 11.6V9.2L2.7 7.7l2-3.4 1.8.6Z"/><circle cx="12" cy="10.5" r="3"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevronLeft: '<path d="m14 6-6 6 6 6"/>',
  chevronRight: '<path d="m10 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  pin: '<path d="M18 9c0 5-6 11-6 11S6 14 6 9a6 6 0 1 1 12 0Z"/><circle cx="12" cy="9" r="2"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-9 6 6 0 0 1 11 2 3.5 3.5 0 1 1 0 7Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>',
  note: '<path d="M18 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l6-6V5a2 2 0 0 0-2-2Z"/><path d="M14 21v-6h6M8 8h8M8 12h6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2m6 4 2-2m-8 9V8"/>',
  briefcase: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M8 6V3h8v3M3 11a20 20 0 0 0 18 0m-9 1v3"/>',
  quote: '<path d="M10 6H4v7h4c0 3-2 5-4 5m16-12h-6v7h4c0 3-2 5-4 5"/>',
  trending: '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 10h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
  sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7ZM19 2v4m-2-2h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  flag: '<path d="M5 21V3m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
};

function icon(name, className = '') {
  return `<svg class="widget-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkles}</svg>`;
}

function configButton(label = '设置组件') {
  return `<button type="button" class="widget-icon-button widget-config" data-action="widget-config" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon('more')}</button>`;
}

function header(label, iconName, action = configButton()) {
  return `<div class="widget-heading"><span>${iconName ? icon(iconName) : ''}${escapeHtml(label)}</span>${action}</div>`;
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayStamp(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function validDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2] ? parts : null;
}

export function daysUntil(value, now = new Date()) {
  const parts = validDateParts(value);
  if (!parts) return null;
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(0, 0, 0, 0);
  return Math.round((date.getTime() - dayStamp(now)) / DAY);
}

const chineseDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
let lunarFormatter;
try { lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }); } catch { /* Older browser: hide unsupported lunar text. */ }

export function chineseLunarDate(date = new Date()) {
  if (!lunarFormatter) return '';
  try {
    const parts = lunarFormatter.formatToParts(date);
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    return `${month}${chineseDays[day - 1] || ''}`;
  } catch { return ''; }
}

function renderCalendar(monthDate = new Date(), today = new Date()) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const count = Math.ceil((leading + days) / 7) * 7;
  let cells = '';
  for (let index = 0; index < count; index += 1) {
    const date = new Date(year, month, index - leading + 1);
    const isToday = localDateKey(date) === localDateKey(today);
    cells += `<span class="w-calendar-day${date.getMonth() !== month ? ' is-outside' : ''}${index % 7 >= 5 ? ' is-weekend' : ''}${isToday ? ' is-today' : ''}"${isToday ? ' aria-current="date"' : ''} title="${escapeHtml(localDateKey(date))} ${escapeHtml(chineseLunarDate(date))}">${date.getDate()}</span>`;
  }
  return `<div class="w-calendar-top"><span><strong>${month + 1}<small>月</small></strong><em>${year}</em></span><div><button type="button" class="widget-icon-button" data-action="widget-calendar-prev" aria-label="上个月">${icon('chevronLeft')}</button><button type="button" class="widget-icon-button w-calendar-today-button" data-action="widget-calendar-today" aria-label="回到本月" title="回到本月">今</button><button type="button" class="widget-icon-button" data-action="widget-calendar-next" aria-label="下个月">${icon('chevronRight')}</button></div></div><div class="w-calendar-weekdays">${['一', '二', '三', '四', '五', '六', '日'].map((value) => `<span>${value}</span>`).join('')}</div><div class="w-calendar-grid" style="--calendar-rows:${count / 7}">${cells}</div><div class="w-calendar-lunar">${escapeHtml(chineseLunarDate(today) ? `农历 ${chineseLunarDate(today)}` : '每一天，都值得期待')}</div>`;
}

function renderNotes(item, state) {
  return `${header('随手记', 'note')}<textarea class="w-notes-input" data-widget-input="notes" aria-label="便签内容" placeholder="写下一点灵感，\n或今天想做的小事…" maxlength="100000" spellcheck="false">${escapeHtml(state.notes || '')}</textarea><div class="w-notes-footer"><span data-live="notes-status">已保存在本机</span><span class="w-notes-fold" aria-hidden="true"></span></div>`;
}

function todoList(state) {
  const todos = Array.isArray(state.todos) ? state.todos : [];
  return todos.length ? todos.map((todo) => `<li class="w-todo-row${todo.done ? ' is-done' : ''}"><label><input type="checkbox" data-action="widget-todo-toggle" data-todo-id="${escapeHtml(todo.id)}"${todo.done ? ' checked' : ''} aria-label="${escapeHtml(`${todo.done ? '取消完成' : '完成'}：${todo.text}`)}"><span title="${escapeHtml(todo.text)}">${escapeHtml(todo.text)}</span></label><button type="button" class="widget-icon-button w-row-delete" data-action="widget-todo-delete" data-todo-id="${escapeHtml(todo.id)}" aria-label="${escapeHtml(`删除：${todo.text}`)}">${icon('close')}</button></li>`).join('') : '<li class="w-empty-list">给今天安排一件小事</li>';
}

function todoSummary(state) {
  const todos = Array.isArray(state.todos) ? state.todos : [];
  return `${todos.filter((todo) => todo.done).length}/${todos.length}`;
}

function renderTodo(state) {
  return `${header('今日待办', 'check', '<span class="w-todo-summary" data-live="todo-summary">' + todoSummary(state) + '</span>')}<ul class="w-todo-list" data-live="todo-list">${todoList(state)}</ul><form class="w-inline-form" data-widget-form="todo"><input type="text" name="text" autocomplete="off" maxlength="240" placeholder="添加一项待办" aria-label="新待办"><button type="submit" class="widget-icon-button" aria-label="添加待办">${icon('plus')}</button></form>`;
}

function countdownConfig(item, state) {
  return { title: item.config?.title || state.countdown?.title || '下一个小期待', date: item.config?.date || state.countdown?.date || '' };
}

function countdownView(item, state, now = new Date()) {
  const config = countdownConfig(item, state);
  const days = daysUntil(config.date, now);
  return { title: config.title, number: days === null ? '—' : Math.abs(days).toString(), caption: days === null ? '设置一个期待的日子' : days < 0 ? '已经过去' : days === 0 ? '就是今天' : '还有', unit: days === 0 ? '♥' : '天', date: validDateParts(config.date) ? config.date.replaceAll('-', '.') : '点击右上角设置' };
}

function renderCountdown(item, state) {
  const view = countdownView(item, state);
  return `${header('倒数日', 'flag')}<div class="w-countdown-title" data-live="countdown-title" title="${escapeHtml(view.title)}">${escapeHtml(view.title)}</div><div class="w-countdown-caption" data-live="countdown-caption">${view.caption}</div><div class="w-countdown-number"><strong data-live="countdown-number">${view.number}</strong><span data-live="countdown-unit">${view.unit}</span></div><div class="w-countdown-date" data-live="countdown-date">${view.date}</div><span class="w-countdown-orbit" aria-hidden="true"></span>`;
}

function focusState(state) {
  const focus = state.focus || {};
  const duration = Number.isFinite(Number(focus.duration)) ? Math.max(1, Math.min(180, Number(focus.duration))) : 25;
  return { duration, remaining: Number.isFinite(Number(focus.remaining)) ? Math.max(0, Number(focus.remaining)) : duration * 60, running: focus.running === true && Number.isFinite(Number(focus.endAt)) && Number(focus.endAt) > 0, endAt: Number(focus.endAt) || null };
}

export function focusRemaining(focus, now = Date.now()) {
  return focus.running && Number.isFinite(Number(focus.endAt)) && Number(focus.endAt) > 0 ? Math.max(0, Math.ceil((Number(focus.endAt) - now) / 1000)) : Math.max(0, Math.ceil(Number(focus.remaining) || 0));
}

function timerText(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function renderFocus(state) {
  const focus = focusState(state);
  const remaining = focusRemaining(focus);
  const progress = Math.max(0, Math.min(1, remaining / (focus.duration * 60)));
  return `${header('专注时刻', 'timer')}<div class="w-focus-ring" data-live="focus-ring" style="--focus-progress:${progress}"><div><strong data-live="focus-time">${timerText(remaining)}</strong><span data-live="focus-label">${focus.running ? '专心做好一件事' : remaining === 0 ? '这一轮，完成了' : `${focus.duration} 分钟，留给自己`}</span></div></div><div class="w-focus-controls"><button type="button" class="w-focus-start" data-action="widget-focus-toggle"><span data-live="focus-button-icon">${icon(focus.running ? 'pause' : 'play')}</span><span data-live="focus-button">${focus.running ? '暂停' : remaining === 0 ? '再来一轮' : remaining < focus.duration * 60 ? '继续' : '开始'}</span></button><button type="button" class="widget-icon-button" data-action="widget-focus-reset" title="重置计时" aria-label="重置计时">${icon('reset')}</button></div>`;
}

function getWorkConfig(item, state) {
  const merged = { endTime: '18:00', payday: 10, workdays: [1, 2, 3, 4, 5], ...state.workday, ...item.config };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(merged.endTime)) merged.endTime = '18:00';
  merged.payday = Math.max(1, Math.min(31, Number(merged.payday) || 10));
  merged.workdays = Array.isArray(merged.workdays) ? merged.workdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : [1, 2, 3, 4, 5];
  return merged;
}

export function workdayStatus(config, now = new Date()) {
  const [hour, minute] = String(config.endTime || '18:00').split(':').map(Number);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
  const workdays = Array.isArray(config.workdays) ? config.workdays : [1, 2, 3, 4, 5];
  const isWorkday = workdays.includes(now.getDay());
  const remaining = Math.max(0, Math.ceil((end - now) / 1000));
  const payday = Math.max(1, Math.min(31, Math.trunc(Number(config.payday) || 10)));
  let payDate = new Date(now.getFullYear(), now.getMonth(), Math.min(payday, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
  if (dayStamp(payDate) < dayStamp(now)) payDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(payday, new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()));
  return { remaining, isWorkday, text: !isWorkday ? '休息日' : remaining === 0 ? '已下班' : `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`, caption: !isWorkday ? '今天，把时间留给生活' : remaining === 0 ? '今天辛苦了，好好休息' : '距离下班还有', paydays: Math.round((dayStamp(payDate) - dayStamp(now)) / DAY) };
}

function renderWorkday(item, state) {
  const config = getWorkConfig(item, state);
  const status = workdayStatus(config);
  return `${header('下班倒计时', 'briefcase')}<div class="w-workday-caption" data-live="workday-caption">${status.caption}</div><strong class="w-workday-time" data-live="workday-time">${status.text}</strong><div class="w-workday-finish">每天 ${escapeHtml(config.endTime)} 准时收工</div><div class="w-workday-pay"><span>距发薪日</span><strong data-live="workday-pay">${status.paydays === 0 ? '就是今天' : `${status.paydays} 天`}</strong></div>`;
}

function getQuote(item, now = new Date()) {
  return item.config?.text ? { text: item.config.text, author: item.config.author || '我的摘录' } : { text: quotes[((Math.floor(dayStamp(now) / DAY) + (Number(item.config?.quoteIndex) || 0)) % quotes.length + quotes.length) % quotes.length], author: '栖页随笔' };
}

function renderQuote(item) {
  const quote = getQuote(item);
  return `${header('给今天的一句话', 'quote', `<div class="widget-heading-actions">${item.config?.text ? '' : `<button type="button" class="widget-icon-button" data-action="widget-quote-next" title="换一句" aria-label="换一句">${icon('reset')}</button>`}${configButton()}</div>`)}<blockquote class="w-quote-text" data-live="quote-text" title="${escapeHtml(quote.text)}">${escapeHtml(quote.text)}</blockquote><div class="w-quote-author" data-live="quote-author">— ${escapeHtml(quote.author)}</div><span class="w-quote-decoration" aria-hidden="true">“</span>`;
}

const hotlinks = [
  { name: '微博热搜', letter: '微', color: '#ff714c', url: 'https://s.weibo.com/top/summary?cate=realtimehot' },
  { name: '知乎热榜', letter: '知', color: '#2684ff', url: 'https://www.zhihu.com/hot' },
  { name: '百度热搜', letter: '百', color: '#4e64fa', url: 'https://top.baidu.com/board?tab=realtime' },
  { name: 'B站热门', letter: '哔', color: '#ec6a9b', url: 'https://www.bilibili.com/v/popular/rank/all' },
  { name: '抖音热点', letter: '抖', color: '#2d3040', url: 'https://www.douyin.com/hot' },
  { name: 'GitHub 趋势', letter: 'G', color: '#35394a', url: 'https://github.com/trending' },
];

function renderHotlinks(state) {
  return `${header('热门 · 快捷入口', 'trending', '<span class="w-hotlinks-tag">直达平台</span>')}<div class="w-hotlinks-grid">${hotlinks.map((link) => `<a href="${link.url}"${state.settings?.openNewTab !== false ? ' target="_blank"' : ''} rel="noopener noreferrer" class="w-hotlink"><span class="w-hotlink-logo" style="--platform-color:${link.color}">${link.letter}</span><span>${link.name}</span>${icon('arrow')}</a>`).join('')}</div><div class="w-hotlinks-footer">打开平台，查看实时榜单</div>`;
}

/** A deliberately small arithmetic parser: no eval, Function, or executable input. */
export function calculateExpression(source) {
  const text = String(source).replace(/[×x]/g, '*').replace(/[÷]/g, '/').replace(/[−]/g, '-').replace(/\s+/g, '');
  if (!text || text.length > 256 || /[^\d.+\-*/()%]/.test(text)) throw new Error('请输入有效算式');
  let position = 0;
  let depth = 0;
  function number() {
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(text.slice(position));
    if (!match) throw new Error('算式还没有写完整');
    position += match[0].length;
    return Number(match[0]);
  }
  function primary() {
    if (++depth > 48) throw new Error('括号层数过多');
    let value;
    if (text[position] === '(') {
      position += 1;
      value = expression();
      if (text[position] !== ')') throw new Error('请检查括号');
      position += 1;
    } else value = number();
    depth -= 1;
    while (text[position] === '%') { value /= 100; position += 1; }
    return value;
  }
  function unary() {
    let sign = 1;
    while (text[position] === '+' || text[position] === '-') { if (text[position] === '-') sign *= -1; position += 1; }
    return sign * primary();
  }
  function term() {
    let value = unary();
    while (text[position] === '*' || text[position] === '/') {
      const operator = text[position++];
      const right = unary();
      if (operator === '/' && right === 0) throw new Error('不能除以 0');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }
  function expression() {
    let value = term();
    while (text[position] === '+' || text[position] === '-') {
      const operator = text[position++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }
  const value = expression();
  if (position !== text.length) throw new Error('请检查算式');
  if (!Number.isFinite(value)) throw new Error('结果超出计算范围');
  return Number(value.toPrecision(12));
}

function renderCalculator() {
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
  return `<div class="w-calculator-screen"><input class="w-calculator-input" data-widget-input="calculator" inputmode="decimal" maxlength="256" autocomplete="off" aria-label="计算算式" placeholder="0"><span class="w-calculator-error" data-live="calculator-error" role="status"></span></div><div class="w-calculator-keys">${keys.map((key) => `<button type="button" data-action="widget-calc" data-value="${key}" class="w-calculator-key${key === '=' ? ' is-equal' : ['÷', '×', '−', '+', 'C'].includes(key) ? ' is-operator' : ''}" aria-label="${({ C: '清空', '⌫': '删除一位', '=': '计算结果', '÷': '除以', '×': '乘以', '−': '减去', '+': '加上' })[key] || key}">${key}</button>`).join('')}</div>`;
}

export function habitStreak(dates, now = new Date()) {
  const records = new Set(Array.isArray(dates) ? dates : []);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!records.has(localDateKey(date))) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (records.has(localDateKey(date)) && streak <= 36600) { streak += 1; date.setDate(date.getDate() - 1); }
  return streak;
}

function habitList(state, now = new Date()) {
  const habits = Array.isArray(state.habits) ? state.habits : [];
  return habits.length ? habits.map((habit) => {
    const done = Array.isArray(habit.dates) && habit.dates.includes(localDateKey(now));
    const streak = habitStreak(habit.dates, now);
    return `<li class="w-habit-row"><button type="button" class="w-habit-check${done ? ' is-done' : ''}" data-action="widget-habit-toggle" data-habit-id="${escapeHtml(habit.id)}" aria-pressed="${done}" aria-label="${escapeHtml(`${done ? '取消今日打卡' : '今日打卡'}：${habit.name}`)}">${icon('check')}</button><span class="w-habit-name" title="${escapeHtml(habit.name)}">${escapeHtml(habit.name)}<small>${streak ? `连续 ${streak} 天` : '从今天开始'}</small></span><button type="button" class="widget-icon-button w-row-delete" data-action="widget-habit-delete" data-habit-id="${escapeHtml(habit.id)}" aria-label="${escapeHtml(`删除习惯：${habit.name}`)}">${icon('close')}</button></li>`;
  }).join('') : '<li class="w-empty-list">让一个好习惯，从今天开始</li>';
}

function renderHabit(state) {
  return `${header('习惯打卡', 'sparkles', '<span class="w-habit-today">TODAY</span>')}<ul class="w-habit-list" data-live="habit-list">${habitList(state)}</ul><form class="w-inline-form" data-widget-form="habit"><input type="text" name="text" maxlength="60" autocomplete="off" placeholder="添加一个好习惯" aria-label="新习惯"><button type="submit" class="widget-icon-button" aria-label="添加习惯">${icon('plus')}</button></form>`;
}

function timeInZone(zone, now, seconds = false) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(now); } catch { return '—'; }
}

function zoneDate(zone, now) {
  try { return new Intl.DateTimeFormat('zh-CN', { timeZone: zone, month: 'long', day: 'numeric', weekday: 'short' }).format(now); } catch { return '请设置有效时区'; }
}

function renderClock(item, now = new Date()) {
  const zone = item.config?.timeZone || 'Asia/Hong_Kong';
  const label = item.config?.label || (zone === 'Asia/Hong_Kong' ? '香港' : zone.split('/').pop()?.replaceAll('_', ' '));
  return `${header(label || '世界时钟', 'globe')}<strong class="w-clock-time" data-live="world-time">${timeInZone(zone, now, true)}</strong><div class="w-clock-date" data-live="world-date">${escapeHtml(zoneDate(zone, now))}</div><div class="w-clock-world"><span>伦敦<strong data-live="world-london">${timeInZone('Europe/London', now)}</strong></span><span>纽约<strong data-live="world-newyork">${timeInZone('America/New_York', now)}</strong></span></div>`;
}

function weatherCity(state) {
  const city = state.settings?.weatherCity || {};
  return { name: String(city.name || '香港'), latitude: Number.isFinite(Number(city.latitude)) && Math.abs(Number(city.latitude)) <= 90 ? Number(city.latitude) : 22.32, longitude: Number.isFinite(Number(city.longitude)) && Math.abs(Number(city.longitude)) <= 180 ? Number(city.longitude) : 114.17 };
}

function cityKey(city) { return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`; }

function weatherDescription(code) {
  if (code === 0) return '晴';
  if (code === 1) return '晴间多云';
  if (code === 2) return '多云';
  if (code === 3) return '阴';
  if ([45, 48].includes(code)) return '雾';
  if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
  if ([95, 96, 99].includes(code)) return '雷雨';
  return '天气数据';
}

function weatherArt(code = 2, isDay = true) {
  const cloud = '<path d="M21 54c-9 0-15-6-15-13s6-13 13-13c3-11 12-17 22-15 10 2 16 9 16 18 9-1 17 4 17 12s-6 13-15 13H21Z" fill="rgba(255,255,255,.96)"/>';
  const sun = '<circle cx="56" cy="23" r="15" fill="#ffd982"/><g stroke="#ffe6a9" stroke-width="2.5" stroke-linecap="round"><path d="M56 2v-2m0 44v3M35 23h-3m45 0h3M41 8l-2-2m34 34 2 2M41 38l-2 2M71 8l2-2"/></g>';
  const moon = '<path d="M64 8a18 18 0 1 0 14 28A18 18 0 0 1 64 8Z" fill="#fff0bd"/>';
  const precipitation = code >= 51 && code < 95;
  const snow = [71, 73, 75, 77, 85, 86].includes(code);
  return `<svg class="w-weather-art" viewBox="0 0 84 78" aria-hidden="true">${code <= 2 ? (isDay ? sun : moon) : ''}${code === 0 ? '' : cloud}${precipitation ? `<g stroke="${snow ? '#fff' : '#bfe9ff'}" stroke-width="3" stroke-linecap="round"><path d="m24 64-3 6m20-6-3 6m20-6-3 6"/>${snow ? '<path d="m19 65 7 4m10-4 7 4m10-4 7 4"/>' : ''}</g>` : ''}${code >= 95 ? '<path d="m44 58-9 12h7l-3 9 16-17h-9l4-4Z" fill="#ffda79"/>' : ''}</svg>`;
}

export function parseWeatherResponse(raw, now = Date.now()) {
  const current = raw?.current;
  if (!current || typeof current.temperature_2m !== 'number' || !Number.isFinite(current.temperature_2m) || typeof current.weather_code !== 'number' || !Number.isFinite(current.weather_code)) throw new Error('天气服务返回的数据不完整');
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return { fetchedAt: now, temperature: current.temperature_2m, feelsLike: number(current.apparent_temperature), humidity: number(current.relative_humidity_2m), code: current.weather_code, isDay: current.is_day !== 0, max: number(raw.daily?.temperature_2m_max?.[0]), min: number(raw.daily?.temperature_2m_min?.[0]), observedAt: typeof current.time === 'string' ? current.time : '' };
}

function readWeatherCache(key) {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(WEATHER_CACHE_KEY) || '{}')[key];
    return value && Number.isFinite(value.temperature) && Number.isFinite(value.code) && Number.isFinite(value.fetchedAt) && value.fetchedAt <= Date.now() + 60_000 ? value : null;
  } catch { return null; }
}

function writeWeatherCache(key, data) {
  try {
    let cache;
    try { cache = JSON.parse(globalThis.localStorage?.getItem(WEATHER_CACHE_KEY) || '{}'); } catch { cache = {}; }
    const entries = Object.entries(cache && typeof cache === 'object' ? cache : {}).filter(([other, value]) => other !== key && value && Number.isFinite(value.fetchedAt)).sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, 7);
    globalThis.localStorage?.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ...Object.fromEntries(entries), [key]: data }));
  } catch { /* The weather still works when browser storage is unavailable. */ }
}

function weatherState(city) {
  const key = cityKey(city);
  if (!weatherStates.has(key)) weatherStates.set(key, { status: 'idle', data: readWeatherCache(key), error: '', lastAttempt: 0 });
  return weatherStates.get(key);
}

function renderWeather(item, state) {
  const city = weatherCity(state);
  const top = header(city.name, 'pin', configButton('设置天气城市'));
  if (!state.settings?.weatherEnabled) return `${top}<div class="w-weather-off">${weatherArt(2)}<span>把天气带进新标签页</span><button type="button" class="w-weather-enable" data-action="widget-weather-enable">启用天气</button></div><div class="w-weather-source">发送城市坐标至 Open-Meteo</div>`;
  const current = weatherState(city);
  if (!current.data) return `${top}<div class="w-weather-unavailable">${icon('cloud')}<strong>${current.status === 'error' ? '暂时无法获取天气' : '正在获取天气'}</strong><span>${current.status === 'error' ? escapeHtml(current.error) : '等待 Open-Meteo 返回数据'}</span>${current.status === 'error' ? '<button type="button" class="w-weather-enable" data-action="widget-weather-retry">重新加载</button>' : '<span class="w-weather-loading" aria-label="正在加载"></span>'}</div><div class="w-weather-source">Open-Meteo</div>`;
  const weather = current.data;
  const updated = new Date(weather.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const stale = Date.now() - weather.fetchedAt >= WEATHER_TTL;
  const detail = [weatherDescription(weather.code), weather.min !== null && weather.max !== null ? `${Math.round(weather.min)}° / ${Math.round(weather.max)}°` : ''].filter(Boolean).join(' · ');
  return `${top}<div class="w-weather-current"><strong>${Math.round(weather.temperature)}<sup>°</sup></strong>${weatherArt(weather.code, weather.isDay)}</div><div class="w-weather-description">${escapeHtml(detail)}</div><div class="w-weather-details">${weather.feelsLike !== null ? `<span>体感 ${Math.round(weather.feelsLike)}°</span>` : ''}${weather.humidity !== null ? `<span>湿度 ${Math.round(weather.humidity)}%</span>` : ''}</div><button type="button" class="w-weather-update${current.status === 'error' ? ' is-error' : ''}" data-action="widget-weather-retry" title="${escapeHtml(current.status === 'error' ? current.error : '重新获取天气')}"${current.status === 'loading' ? ' disabled' : ''}>${current.status === 'loading' ? '正在更新…' : current.status === 'error' ? `缓存 ${updated} · 更新失败 ↻` : `${stale ? '缓存' : '更新'} ${updated} · Open-Meteo ↻`}</button>`;
}

function cachedWallpaper() {
  try {
    const stored = globalThis.localStorage?.getItem(WALLPAPER_CACHE_KEY) || '';
    if (stored.length > 5000) return null;
    const cache = JSON.parse(stored || '{}');
    if (!Number.isFinite(cache.at) || Date.now() - cache.at > 86_400_000 || cache.at > Date.now() + 60_000) return null;
    const photo = normalizeWallpaperPhoto(cache.photo);
    return photo ? { photo, page: Number.isInteger(cache.page) && cache.page >= 1 && cache.page <= 1000 ? cache.page : 1 } : null;
  } catch { return null; }
}

function currentWallpaperBrowser(state) {
  if (!wallpaperBrowser) {
    const cached = cachedWallpaper();
    wallpaperBrowser = createWallpaperBrowser({
      initialPhoto: cached?.photo || normalizeWallpaperPhoto(state.settings?.remoteWallpaper),
      startPage: cached?.page || 1 + Math.floor(Math.random() * 20),
      onChange: (reason) => {
        const current = wallpaperBrowser.getState();
        if (current.status === 'ready' && current.photo) {
          try { globalThis.localStorage?.setItem(WALLPAPER_CACHE_KEY, JSON.stringify({ at: Date.now(), page: current.page, photo: current.photo })); } catch { /* Browsing still works without local cache. */ }
        }
        for (const binding of wallpaperBindings) {
          if (reason === 'image') syncWallpaperImages(binding);
          else updateWallpaperCards(binding);
        }
      },
    });
  }
  return wallpaperBrowser;
}

function wallpaperStatus(current) {
  if (current.applying) return '正在应用壁纸…';
  if (current.status === 'loading') return '正在寻找下一处风景…';
  if (current.status === 'error') return current.error;
  if (current.imageStatus === 'error') return '照片暂时无法加载，可以换一张';
  if (current.imageStatus === 'loading') return '照片加载中…';
  return '';
}

function renderWallpaper(item, state) {
  const enabled = state.settings?.wallpaperApiEnabled === true;
  const current = enabled ? currentWallpaperBrowser(state).getState() : null;
  const photo = current?.photo;
  const disableButton = enabled ? `<button type="button" class="widget-icon-button" data-action="widget-wallpaper-disable" title="暂停在线壁纸" aria-label="暂停在线壁纸">${icon('pause')}</button>` : '';
  const top = header('在线壁纸', 'image', `<div class="widget-heading-actions">${enabled ? `<button type="button" class="widget-icon-button" data-action="widget-wallpaper-refresh" title="换一组照片" aria-label="换一组照片"${current.status === 'loading' || current.applying ? ' disabled' : ''}>${icon('reset')}</button>` : '<span class="w-wallpaper-provider-tag">PICSUM</span>'}${disableButton}</div>`);
  const landscape = '<svg class="w-wallpaper-landscape" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="309" cy="40" r="27" fill="#f5dca8"/><path d="M0 105 67 38 144 129 236 75 344 164 400 111V180H0Z" fill="#4d807b"/><path d="m0 152 103-70 97 79 84-43 116 38v24H0Z" fill="#285a57"/><path d="m0 172 140-45 125 53H0Z" fill="#1e4847"/></svg>';
  if (!enabled) return `${landscape}<div class="w-wallpaper-content">${top}<div class="w-wallpaper-invite"><strong>给桌面换一处风景</strong><span>来自公开摄影图库 · 无需账号</span><button type="button" class="w-wallpaper-primary" data-action="widget-wallpaper-enable">浏览在线壁纸 ${icon('arrow')}</button></div><div class="w-wallpaper-disclosure">启用后向 Picsum 及其图片服务请求照片</div></div>`;
  const status = wallpaperStatus(current);
  if (!photo) return `${landscape}<div class="w-wallpaper-content">${top}<div class="w-wallpaper-empty" role="status">${current.status === 'error' ? icon('image') : '<span class="w-wallpaper-spinner" aria-hidden="true"></span>'}<strong>${current.status === 'error' ? '风景暂时没有到达' : '正在寻找下一处风景'}</strong><span>${escapeHtml(status || '等待公开图库返回照片')}</span>${current.status === 'error' ? '<button type="button" class="w-wallpaper-primary" data-action="widget-wallpaper-retry">重新加载</button>' : ''}</div><div class="w-wallpaper-disclosure"><a href="https://picsum.photos/" target="_blank" rel="noopener noreferrer">Lorem Picsum</a> · 公开摄影图库</div></div>`;
  const applied = normalizeWallpaperPhoto(state.settings?.remoteWallpaper)?.id === photo.id;
  return `${landscape}<img class="w-wallpaper-photo" src="${escapeHtml(photo.thumbnail)}" alt="${escapeHtml(photo.title)}" data-widget-image="wallpaper" data-photo-id="${escapeHtml(photo.id)}" referrerpolicy="no-referrer" draggable="false" decoding="async"><div class="w-wallpaper-shade"></div><div class="w-wallpaper-content">${top}<div class="w-wallpaper-status" role="status" data-live="wallpaper-status">${escapeHtml(status)}</div><div class="w-wallpaper-footer"><div class="w-wallpaper-credit"><a href="${escapeHtml(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(`查看 ${photo.author} 的原始照片`)}">摄影 / ${escapeHtml(photo.author)}</a><span><a href="https://picsum.photos/" target="_blank" rel="noopener noreferrer">Picsum</a><span> · </span><a href="${photo.licenseUrl}" target="_blank" rel="noopener noreferrer">使用条款</a></span></div><div class="w-wallpaper-actions"><button type="button" class="w-wallpaper-next" data-action="widget-wallpaper-next"${current.status === 'loading' || current.applying ? ' disabled' : ''}>${icon('reset')}换一张</button><button type="button" class="w-wallpaper-primary" data-action="widget-wallpaper-apply"${current.imageStatus !== 'ready' || current.applying ? ' disabled' : ''}>${current.applying ? '应用中…' : applied ? '已设为壁纸' : '设为壁纸'}</button></div></div></div>`;
}

function updateWallpaperCards(binding) {
  if (!binding.alive) return;
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'wallpaper')) {
    const item = findItem(root, state);
    if (item) root.innerHTML = renderWallpaper(item, state);
  }
  syncWallpaperImages(binding);
}

function syncWallpaperImages(binding) {
  if (!binding.alive || !wallpaperBrowser) return;
  const state = binding.context.getState();
  const current = wallpaperBrowser.getState();
  for (const root of widgetRoots(binding.container, 'wallpaper')) {
    const image = root.querySelector('[data-widget-image="wallpaper"]');
    if (!image || image.dataset.photoId !== current.photo?.id || state.settings?.wallpaperApiEnabled !== true) continue;
    root.classList.toggle('has-wallpaper-image', current.imageStatus === 'ready');
    root.classList.toggle('has-wallpaper-error', current.imageStatus === 'error');
    const apply = root.querySelector('[data-action="widget-wallpaper-apply"]');
    if (apply) {
      apply.disabled = current.imageStatus !== 'ready' || current.applying;
      apply.textContent = current.applying ? '应用中…' : normalizeWallpaperPhoto(state.settings?.remoteWallpaper)?.id === current.photo.id ? '已设为壁纸' : '设为壁纸';
    }
    setText(root, 'wallpaper-status', wallpaperStatus(current));
  }
}

function ensureWallpapers(binding) {
  if (!binding.alive || binding.wallpaperConsentPending || binding.context.getState().settings?.wallpaperApiEnabled !== true || !binding.container.querySelector('[data-widget="wallpaper"]')) return;
  const browser = currentWallpaperBrowser(binding.context.getState());
  if (browser.getState().status === 'idle') void browser.load();
  for (const root of widgetRoots(binding.container, 'wallpaper')) {
    const image = root.querySelector('[data-widget-image="wallpaper"]');
    if (image?.complete === true && browser.getState().imageStatus === 'loading') {
      if (image.naturalWidth > 0) browser.markImageReady(image.dataset.photoId);
      else browser.markImageError(image.dataset.photoId);
    }
  }
  syncWallpaperImages(binding);
}

export function renderWidget(item, state) {
  const type = widgetCatalog.some((entry) => entry.type === item.widget) ? item.widget : 'quote';
  const now = new Date();
  const renderers = { wallpaper: () => renderWallpaper(item, state), weather: () => renderWeather(item, state), calendar: () => renderCalendar(now, now), notes: () => renderNotes(item, state), todo: () => renderTodo(state), countdown: () => renderCountdown(item, state), focus: () => renderFocus(state), workday: () => renderWorkday(item, state), quote: () => renderQuote(item), hotlinks: () => renderHotlinks(state), calculator: () => renderCalculator(), habit: () => renderHabit(state), clock: () => renderClock(item, now) };
  const color = type === 'notes' && ['yellow', 'pink', 'mint'].includes(item.config?.color) ? ` w-notes-${item.config.color}` : '';
  return `<div class="widget-inner w-${type}${color}" data-widget="${type}" data-widget-id="${escapeHtml(item.id)}"${type === 'calendar' ? ` data-calendar-month="${now.getFullYear()}-${now.getMonth()}" data-calendar-today="${localDateKey(now)}"` : ''}${type === 'habit' || type === 'quote' ? ` data-widget-day="${localDateKey(now)}"` : ''}>${renderers[type]()}</div>`;
}

function findItem(root, state) { return state.items?.find((item) => item.id === root?.dataset.widgetId); }
function widgetRoots(container, type) { return container.querySelectorAll(`[data-widget="${type}"]`); }
function setText(root, selector, value) { const element = root.querySelector(`[data-live="${selector}"]`); if (element && element.textContent !== String(value)) element.textContent = String(value); }

function updateWeatherCards(binding) {
  if (!binding.alive) return;
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'weather')) {
    const item = findItem(root, state);
    if (item) root.innerHTML = renderWeather(item, state);
  }
}

async function requestWeather(city, force = false) {
  const key = cityKey(city);
  const status = weatherState(city);
  if (weatherRequests.has(key)) return weatherRequests.get(key);
  if (!force && ((status.data && Date.now() - status.data.fetchedAt < WEATHER_TTL) || Date.now() - status.lastAttempt < 60_000)) return;
  status.status = 'loading';
  status.lastAttempt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const job = (async () => {
    try {
      const parameters = new URLSearchParams({ latitude: city.latitude.toString(), longitude: city.longitude.toString(), current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code', daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '1' });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`天气服务暂不可用（${response.status}）`);
      status.data = parseWeatherResponse(await response.json());
      status.status = 'success';
      status.error = '';
      writeWeatherCache(key, status.data);
    } catch (error) {
      status.status = 'error';
      status.error = error?.name === 'AbortError' ? '请求超时，请稍后重试' : error instanceof TypeError ? '网络连接失败，请稍后重试' : String(error?.message || '请求失败，请稍后重试');
    } finally { clearTimeout(timeout); weatherRequests.delete(key); }
  })();
  weatherRequests.set(key, job);
  return job;
}

function ensureWeather(binding, force = false) {
  if (!binding.alive || !binding.context.getState().settings?.weatherEnabled || !binding.container.querySelector('[data-widget="weather"]')) return;
  const state = binding.context.getState();
  const city = weatherCity(state);
  const current = weatherState(city);
  if (!force && current.status !== 'loading' && current.data && Date.now() - current.data.fetchedAt < WEATHER_TTL) return;
  if (binding.weatherPending === cityKey(city)) return;
  if (!force && current.status === 'error' && Date.now() - current.lastAttempt < 60_000) return;
  binding.weatherPending = cityKey(city);
  const request = requestWeather(city, force);
  updateWeatherCards(binding);
  Promise.resolve(request).then(() => {
    if (!binding.alive) return;
    binding.weatherPending = null;
    updateWeatherCards(binding);
  });
}

function updateTodoCards(binding) {
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'todo')) {
    const list = root.querySelector('[data-live="todo-list"]');
    if (list) list.innerHTML = todoList(state);
    setText(root, 'todo-summary', todoSummary(state));
  }
}

function updateHabitCards(binding) {
  const state = binding.context.getState();
  for (const root of widgetRoots(binding.container, 'habit')) {
    const list = root.querySelector('[data-live="habit-list"]');
    if (list) list.innerHTML = habitList(state);
    root.dataset.widgetDay = localDateKey();
  }
}

function calculatorAction(root, key) {
  const input = root.querySelector('[data-widget-input="calculator"]');
  if (!input) return;
  setText(root, 'calculator-error', '');
  if (key === 'C') { input.value = ''; input.dataset.result = ''; }
  else if (key === '⌫') { input.value = input.value.slice(0, -1); input.dataset.result = ''; }
  else if (key === '=') {
    try { input.value = String(calculateExpression(input.value)); input.dataset.result = 'true'; }
    catch (error) { setText(root, 'calculator-error', error.message); }
  } else if (input.value.length < 256) {
    if (input.dataset.result === 'true' && /[\d.(]/.test(key)) input.value = '';
    if (input.dataset.result === 'true' && /[eE]/.test(input.value)) {
      const expanded = Number(input.value).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
      input.value = expanded;
    }
    input.value += key;
    input.dataset.result = '';
  }
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

export function bindWidgets(container, context) {
  bindings.get(container)?.cleanup();
  const binding = { container, context, alive: true, noteTimer: null, notePending: false, weatherPending: null, wallpaperConsentPending: false, focusFinishing: false, cleanup: null };
  const persist = async () => {
    try { await context.save(); return true; }
    catch (error) { if (binding.alive && !error?.notified) context.toast?.(error?.message || '保存失败，请重试'); return false; }
  };
  binding.persist = persist;

  async function click(event) {
    const target = event.target.closest?.('[data-action^="widget-"]');
    if (!target || !container.contains(target)) return;
    const root = target.closest('[data-widget]');
    if (!root) return;
    const state = context.getState();
    const item = findItem(root, state);
    if (!item) return;
    const action = target.dataset.action;
    event.stopPropagation();
    if (target.tagName !== 'INPUT') event.preventDefault();
    if (action === 'widget-config') { context.openDialog('widget-config', { item }); return; }
    if (action === 'widget-wallpaper-enable' || action === 'widget-wallpaper-disable') {
      const enabled = action === 'widget-wallpaper-enable';
      binding.wallpaperConsentPending = true;
      state.settings.wallpaperApiEnabled = enabled;
      target.disabled = true;
      const saved = await persist();
      binding.wallpaperConsentPending = false;
      if (!saved) {
        if (context.getState() === state) state.settings.wallpaperApiEnabled = !enabled;
        if (binding.alive) updateWallpaperCards(binding);
        return;
      }
      if (binding.alive) {
        context.wallpaperEnabledChanged?.(enabled);
        updateWallpaperCards(binding);
        if (enabled) ensureWallpapers(binding);
      }
      return;
    }
    if (action.startsWith('widget-wallpaper-')) {
      if (state.settings?.wallpaperApiEnabled !== true) return;
      const browser = currentWallpaperBrowser(state);
      if (action === 'widget-wallpaper-next') await browser.next();
      if (action === 'widget-wallpaper-refresh') await browser.nextPage();
      if (action === 'widget-wallpaper-retry') await browser.retry();
      if (action === 'widget-wallpaper-apply') {
        if (typeof context.applyWallpaper !== 'function') { context.toast?.('当前页面还不能应用壁纸，请重新打开栖页'); return; }
        try {
          const applied = await browser.apply(context.applyWallpaper);
          if (applied && binding.alive) syncWallpaperImages(binding);
        } catch (error) {
          if (binding.alive && !error?.notified) context.toast?.(error?.message || '壁纸应用失败，请重试');
        }
      }
      return;
    }
    if (action.startsWith('widget-calendar-')) {
      const [year, month] = root.dataset.calendarMonth.split('-').map(Number);
      const date = action === 'widget-calendar-today' ? new Date() : new Date(year, month + (action === 'widget-calendar-next' ? 1 : -1), 1);
      root.dataset.calendarMonth = `${date.getFullYear()}-${date.getMonth()}`;
      root.innerHTML = renderCalendar(date);
      return;
    }
    if (action === 'widget-weather-enable') {
      state.settings.weatherEnabled = true;
      target.disabled = true;
      if (!await persist()) { state.settings.weatherEnabled = false; if (binding.alive) updateWeatherCards(binding); return; }
      if (binding.alive) ensureWeather(binding, true);
      return;
    }
    if (action === 'widget-weather-retry') { ensureWeather(binding, true); return; }
    if (action === 'widget-todo-toggle') {
      const todo = state.todos?.find((entry) => entry.id === target.dataset.todoId);
      if (todo) todo.done = target.checked;
      updateTodoCards(binding);
      await persist();
      return;
    }
    if (action === 'widget-todo-delete') {
      state.todos = (state.todos || []).filter((entry) => entry.id !== target.dataset.todoId);
      updateTodoCards(binding);
      await persist();
      return;
    }
    if (action === 'widget-focus-toggle' || action === 'widget-focus-reset') {
      const focus = focusState(state);
      const remaining = focusRemaining(focus);
      state.focus = action === 'widget-focus-reset' ? { duration: focus.duration, remaining: focus.duration * 60, running: false, endAt: null } : focus.running ? { duration: focus.duration, remaining, running: false, endAt: null } : { duration: focus.duration, remaining: remaining || focus.duration * 60, running: true, endAt: Date.now() + (remaining || focus.duration * 60) * 1000 };
      refreshLiveWidgets(container, state);
      await persist();
      return;
    }
    if (action === 'widget-quote-next') {
      item.config ||= {};
      item.config.quoteIndex = (Number(item.config.quoteIndex) || 0) + 1;
      const quote = getQuote(item);
      setText(root, 'quote-text', quote.text);
      root.querySelector('[data-live="quote-text"]').title = quote.text;
      setText(root, 'quote-author', `— ${quote.author}`);
      await persist();
      return;
    }
    if (action === 'widget-calc') { calculatorAction(root, target.dataset.value); return; }
    if (action === 'widget-habit-toggle') {
      const habit = state.habits?.find((entry) => entry.id === target.dataset.habitId);
      if (habit) {
        const today = localDateKey();
        habit.dates = Array.isArray(habit.dates) ? habit.dates : [];
        habit.dates = habit.dates.includes(today) ? habit.dates.filter((date) => date !== today) : [...habit.dates, today];
      }
      updateHabitCards(binding);
      await persist();
      return;
    }
    if (action === 'widget-habit-delete') {
      state.habits = (state.habits || []).filter((entry) => entry.id !== target.dataset.habitId);
      updateHabitCards(binding);
      await persist();
    }
  }

  function input(event) {
    const target = event.target;
    if (target.dataset.widgetInput === 'notes') {
      context.getState().notes = target.value.slice(0, 100_000);
      for (const root of widgetRoots(container, 'notes')) {
        const other = root.querySelector('[data-widget-input="notes"]');
        if (other !== target && other) other.value = context.getState().notes;
        setText(root, 'notes-status', '保存中…');
      }
      binding.notePending = true;
      clearTimeout(binding.noteTimer);
      binding.noteTimer = setTimeout(async () => {
        binding.notePending = false;
        const saved = await persist();
        if (binding.alive) for (const root of widgetRoots(container, 'notes')) setText(root, 'notes-status', saved ? '已保存在本机' : '保存失败，请重试');
      }, 400);
    }
    if (target.dataset.widgetInput === 'calculator') { target.dataset.result = ''; setText(target.closest('[data-widget]'), 'calculator-error', ''); }
  }

  async function submit(event) {
    const form = event.target.closest?.('[data-widget-form]');
    if (!form || !container.contains(form)) return;
    event.preventDefault();
    event.stopPropagation();
    const input = form.querySelector('input[name="text"]');
    const value = input?.value.trim();
    if (!value) { input?.focus(); return; }
    const state = context.getState();
    if (form.dataset.widgetForm === 'todo') {
      state.todos ||= [];
      if (state.todos.length >= 500) { context.toast?.('待办最多支持 500 项，请先整理已有任务'); return; }
      state.todos.push({ id: uid(), text: value.slice(0, 240), done: false });
      updateTodoCards(binding);
    } else {
      state.habits ||= [];
      if (state.habits.length >= 100) { context.toast?.('习惯最多支持 100 项'); return; }
      state.habits.push({ id: uid(), name: value.slice(0, 60), dates: [] });
      updateHabitCards(binding);
    }
    input.value = '';
    input.focus();
    await persist();
  }

  function keydown(event) {
    if (event.target.dataset.widgetInput === 'calculator') {
      event.stopPropagation();
      if (event.key === 'Enter' || event.key === '=') { event.preventDefault(); calculatorAction(event.target.closest('[data-widget]'), '='); }
      if (event.key === 'Escape') { event.preventDefault(); calculatorAction(event.target.closest('[data-widget]'), 'C'); }
    }
  }

  function wallpaperImage(event) {
    const image = event.target;
    if (image?.dataset?.widgetImage !== 'wallpaper' || !container.contains(image) || !wallpaperBrowser) return;
    if (event.type === 'load') wallpaperBrowser.markImageReady(image.dataset.photoId);
    else wallpaperBrowser.markImageError(image.dataset.photoId);
  }

  function flushNotes() {
    if (!binding.notePending) return;
    clearTimeout(binding.noteTimer);
    binding.notePending = false;
    void persist();
  }

  container.addEventListener('click', click);
  container.addEventListener('input', input);
  container.addEventListener('submit', submit);
  container.addEventListener('keydown', keydown);
  container.addEventListener('load', wallpaperImage, true);
  container.addEventListener('error', wallpaperImage, true);
  wallpaperBindings.add(binding);
  globalThis.addEventListener?.('pagehide', flushNotes);
  const cleanup = () => {
    if (!binding.alive) return;
    flushNotes();
    binding.alive = false;
    clearTimeout(binding.noteTimer);
    container.removeEventListener('click', click);
    container.removeEventListener('input', input);
    container.removeEventListener('submit', submit);
    container.removeEventListener('keydown', keydown);
    container.removeEventListener('load', wallpaperImage, true);
    container.removeEventListener('error', wallpaperImage, true);
    wallpaperBindings.delete(binding);
    globalThis.removeEventListener?.('pagehide', flushNotes);
    if (bindings.get(container) === binding) bindings.delete(container);
  };
  binding.cleanup = cleanup;
  bindings.set(container, binding);
  refreshLiveWidgets(container, context.getState());
  ensureWeather(binding);
  ensureWallpapers(binding);
  return cleanup;
}

export function refreshLiveWidgets(container, state) {
  const now = new Date();
  const binding = bindings.get(container);
  const focus = focusState(state);
  const remaining = focusRemaining(focus, now.getTime());
  if (focus.running && remaining === 0 && binding?.alive && !binding.focusFinishing) {
    binding.focusFinishing = true;
    state.focus = { duration: focus.duration, remaining: 0, endAt: null, running: false };
    binding.context.toast?.('这一轮专注完成了，休息一下吧。');
    Promise.resolve(binding.persist()).finally(() => { binding.focusFinishing = false; });
  }
  const running = focus.running && remaining > 0;
  for (const root of widgetRoots(container, 'focus')) {
    setText(root, 'focus-time', timerText(remaining));
    setText(root, 'focus-label', running ? '专心做好一件事' : remaining === 0 ? '这一轮，完成了' : `${focus.duration} 分钟，留给自己`);
    setText(root, 'focus-button', running ? '暂停' : remaining === 0 ? '再来一轮' : remaining < focus.duration * 60 ? '继续' : '开始');
    const ring = root.querySelector('[data-live="focus-ring"]');
    ring?.style.setProperty('--focus-progress', String(Math.max(0, Math.min(1, remaining / (focus.duration * 60)))));
    const buttonIcon = root.querySelector('[data-live="focus-button-icon"]');
    if (buttonIcon && buttonIcon.dataset.running !== String(running)) { buttonIcon.innerHTML = icon(running ? 'pause' : 'play'); buttonIcon.dataset.running = String(running); }
  }
  for (const root of widgetRoots(container, 'workday')) {
    const item = findItem(root, state);
    if (!item) continue;
    const status = workdayStatus(getWorkConfig(item, state), now);
    setText(root, 'workday-caption', status.caption);
    setText(root, 'workday-time', status.text);
    setText(root, 'workday-pay', status.paydays === 0 ? '就是今天' : `${status.paydays} 天`);
  }
  for (const root of widgetRoots(container, 'countdown')) {
    const item = findItem(root, state);
    if (!item) continue;
    const view = countdownView(item, state, now);
    for (const key of ['title', 'caption', 'number', 'unit', 'date']) setText(root, `countdown-${key}`, view[key]);
  }
  for (const root of widgetRoots(container, 'clock')) {
    const item = findItem(root, state);
    if (!item) continue;
    const zone = item.config?.timeZone || 'Asia/Hong_Kong';
    setText(root, 'world-time', timeInZone(zone, now, true));
    setText(root, 'world-date', zoneDate(zone, now));
    setText(root, 'world-london', timeInZone('Europe/London', now));
    setText(root, 'world-newyork', timeInZone('America/New_York', now));
  }
  for (const root of widgetRoots(container, 'calendar')) {
    if (root.dataset.calendarToday !== localDateKey(now)) {
      const [year, month] = root.dataset.calendarMonth.split('-').map(Number);
      root.innerHTML = renderCalendar(new Date(year, month, 1), now);
      root.dataset.calendarToday = localDateKey(now);
    }
  }
  for (const root of widgetRoots(container, 'quote')) {
    if (root.dataset.widgetDay !== localDateKey(now)) {
      const item = findItem(root, state);
      if (!item) continue;
      const quote = getQuote(item, now);
      setText(root, 'quote-text', quote.text);
      root.querySelector('[data-live="quote-text"]').title = quote.text;
      setText(root, 'quote-author', `— ${quote.author}`);
      root.dataset.widgetDay = localDateKey(now);
    }
  }
  if (binding?.alive) {
    if ([...widgetRoots(container, 'habit')].some((root) => root.dataset.widgetDay !== localDateKey(now))) updateHabitCards(binding);
    ensureWeather(binding);
    ensureWallpapers(binding);
  }
}
