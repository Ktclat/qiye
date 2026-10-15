// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { icon } from './icons.js';
import { fetchPublicJson } from './public-json.js';

const CACHE_KEY = 'qiye.daily-quote.v1';
const API_URL = 'https://v1.hitokoto.cn/';
const LOCAL_QUOTES = [
  '把今天过得慢一点，认真看一朵云，认真完成一件小事。',
  '让注意力回到手边，下一步就会慢慢清楚。',
  '生活留一点空白，好让新的风景走进来。',
];
const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
function normalizeQuote(value) {
  if (!value || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 140) return null;
  return {text: value.text.trim(), author: clean(value.author, 120), from: clean(value.from, 120),
    uuid: typeof value.uuid === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value.uuid) ? value.uuid : ''};
}
function localStorageOrNull() {
  try { return globalThis.localStorage; } catch { return null; }
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
  });
}

export function createDailyQuoteClient({fetcher = globalThis.fetch, storage = localStorageOrNull()} = {}) {
  let lastText = '', recent = [], lastAttempt = 0;
  function readCache() {
    try {
      const raw = storage?.getItem(CACHE_KEY);
      if (!raw || raw.length > 20000) return;
      const cached = JSON.parse(raw);
      lastText = clean(cached.lastText, 140);
      recent = Array.isArray(cached.quotes) ? cached.quotes.slice(0, 12).map(normalizeQuote).filter(Boolean) : [];
    } catch { /* Storage is optional; live quotes still work in private mode. */ }
  }
  function remember(quote, live) {
    lastText = quote.text;
    if (live) recent = [quote, ...recent.filter(entry => entry.text !== quote.text)].slice(0, 12);
    try { storage?.setItem(CACHE_KEY, JSON.stringify({lastText, quotes: recent})); } catch { /* Keep the in-memory copy. */ }
  }
  async function next({signal} = {}) {
    // Read again so sequential new tabs also avoid the last displayed sentence.
    const previousText = lastText;
    readCache();
    const excluded = new Set([previousText, lastText]);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 8000);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        // The public endpoint permits two requests per second.
        await pause(Math.max(0, 650 - (Date.now() - lastAttempt)), controller.signal);
        lastAttempt = Date.now();
        const url = new URL(API_URL);
        url.search = new URLSearchParams({encode: 'json', min_length: '8', max_length: '45', _: `${Date.now()}-${Math.random().toString(36).slice(2)}`});
        const data = await fetchPublicJson(url.href, {fetcher, signal: controller.signal, maxBytes: 16384, cache: 'no-store'});
        const quote = normalizeQuote({text: data?.hitokoto, author: data?.from_who, from: data?.from, uuid: data?.uuid});
        if (!quote) throw new Error('Invalid Hitokoto response');
        if (excluded.has(quote.text)) continue;
        remember(quote, true);
        return {quote, status: 'live'};
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (signal?.aborted) throw signal.reason;
    const cached = recent.filter(quote => !excluded.has(quote.text));
    const candidates = cached.length ? cached : LOCAL_QUOTES.filter(text => !excluded.has(text)).map(text => ({text, author: '', from: '', uuid: ''}));
    const quote = candidates[Math.floor(Math.random() * candidates.length)];
    remember(quote, false);
    return {quote, status: cached.length ? 'cached' : 'local'};
  }
  return {next};
}

export function createDailyQuote(root, {onSearch = () => {}, onNotify = () => {}, ...options} = {}) {
  const client = createDailyQuoteClient(options);
  const refreshButton = root.querySelector('[data-quote-refresh]');
  const copyButtons = root.querySelectorAll('[data-quote-copy]');
  const copyIcon = root.querySelector('.daily-quote-actions [data-quote-copy]');
  const searchButton = root.querySelector('[data-quote-search]');
  const text = root.querySelector('[data-quote-text]');
  const source = root.querySelector('[data-quote-source]');
  let enabled = false, result = null, request = null, copiedText = '', copiedTimer;
  refreshButton.innerHTML = icon('refresh');
  searchButton.innerHTML = icon('search');
  source.innerHTML = icon('quote');
  function label(element, value) {
    element.title = value;
    element.setAttribute('aria-label', value);
  }
  function render() {
    const quote = result?.quote;
    text.textContent = quote ? (result.status === 'local' ? t(quote.text) : quote.text) : t('正在获取一言…');
    root.dataset.quoteStatus = request ? 'loading' : result?.status || 'idle';
    root.setAttribute('aria-busy', String(!!request));
    refreshButton.disabled = !!request;
    searchButton.disabled = !quote;
    const copied = !!quote && copiedText === text.textContent;
    copyIcon.innerHTML = icon(copied ? 'check' : 'copy');
    copyIcon.classList.toggle('is-copied', copied);
    copyButtons.forEach(button => {
      button.disabled = !quote;
      label(button, copied ? t('已复制短句') : t('复制短句'));
    });
    text.parentElement.title = copied ? t('已复制短句') : t('点击复制');
    text.parentElement.setAttribute('aria-label', t('复制短句：{text}', {text: text.textContent}));
    root.querySelector('.daily-quote-actions').setAttribute('aria-label', t('短句操作'));
    label(searchButton, t('搜索这句话'));
    const hint = request ? t('正在获取一言…') : result?.status === 'local' ? t('一言暂时无法连接，显示本地短句，点击重试。') : result?.status === 'cached' ? t('当前为缓存的一言，点击重试。') : t('点击换一句');
    label(refreshButton, hint);
    label(source, t('打开一言'));
    source.href = quote?.uuid && result.status !== 'local' ? `https://hitokoto.cn/?uuid=${quote.uuid}` : 'https://hitokoto.cn/';
  }
  async function copy() {
    if (!enabled || !result) return;
    const value = text.textContent;
    try {
      await navigator.clipboard.writeText(value);
      if (!enabled) return;
      copiedText = value;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => { copiedText = ''; render(); }, 1800);
      render();
      onNotify(t('已复制短句'));
    } catch {
      onNotify(t('复制失败，请检查浏览器的剪贴板权限。'));
    }
  }
  function refresh() {
    if (!enabled || request) return;
    const current = new AbortController();
    request = current;
    render();
    client.next({signal: current.signal}).then(value => {
      if (!current.signal.aborted) result = value;
    }).catch(() => { /* Disabling the footer cancels its outstanding request. */ }).finally(() => {
      if (request !== current) return;
      request = null;
      render();
    });
  }
  refreshButton.addEventListener('click', refresh);
  copyButtons.forEach(button => button.addEventListener('click', copy));
  searchButton.addEventListener('click', () => { if (enabled && result) onSearch(text.textContent); });
  return {
    update(visible) {
      root.hidden = !visible;
      const start = visible && !enabled;
      enabled = visible;
      if (!visible) { request?.abort(); request = null; clearTimeout(copiedTimer); copiedText = ''; }
      render();
      if (start) refresh();
    },
  };
}
