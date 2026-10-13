// SPDX-License-Identifier: GPL-3.0-only
import { safeUrl } from './core.js';
import { validateAvatarDataUrl, MAX_AVATAR_BYTES } from './avatar.js';
import { t } from './i18n.js';

export function canVisitForFavicon(browser = globalThis.chrome) {
  return Boolean(browser?.runtime?.id && browser.runtime.getURL && browser.tabs?.create
    && browser.tabs.getCurrent && browser.tabs.get && browser.tabs.onActivated && browser.tabs.onRemoved);
}

/** Read the browser's local favicon service, never the site's image URL. The
 * returned PNG is portable: it does not retain an extension ID or need cookies. */
export async function readCachedTabIcon(pageUrl, { runtime = globalThis.chrome?.runtime, signal } = {}) {
  if (!safeUrl(pageUrl) || !runtime?.id) throw new Error(t('无法读取浏览器图标缓存。'));
  const url = new URL(runtime.getURL('/_favicon/'));
  if (url.protocol !== 'chrome-extension:' || url.hostname !== runtime.id) throw new Error(t('无法读取浏览器图标缓存。'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '64');
  const response = await fetch(url.href, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(t('无法读取浏览器图标缓存。'));
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_AVATAR_BYTES || bytes.length < 45) throw new Error(t('无法读取浏览器图标缓存。'));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const dataUrl = validateAvatarDataUrl(`data:image/png;base64,${btoa(binary)}`);
  const dimensions = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dimensions.getUint32(16), height = dimensions.getUint32(20);
  if (width > 256 || height > 256) throw new Error(t('无法读取浏览器图标缓存。'));
  return { dataUrl, width, height };
}

/** Track only the tab explicitly opened by this operation. No tabs/history
 * permission, page scraping, script injection or long-lived background watcher. */
export async function visitForFavicon(value, {
  signal, browser = globalThis.chrome, readIcon = readCachedTabIcon,
  timeoutMs = 120_000, retryMs = 600, onWaiting = () => {},
} = {}) {
  const pageUrl = safeUrl(value);
  if (!pageUrl) throw new Error(t('请先填写有效的网站网址。'));
  if (!canVisitForFavicon(browser)) throw new Error(t('读取标签页图标需要 Chrome / Edge 扩展版。'));
  signal?.throwIfAborted();
  const source = await browser.tabs.getCurrent();
  if (!Number.isInteger(source?.id)) throw new Error(t('无法打开网站，请稍后重试。'));
  signal?.throwIfAborted();
  const visited = await browser.tabs.create({ url: pageUrl, active: true, openerTabId: source.id });
  signal?.throwIfAborted();
  if (!Number.isInteger(visited?.id)) throw new Error(t('无法打开网站，请稍后重试。'));

  return new Promise((resolve, reject) => {
    const lifetime = new AbortController();
    let settled = false, reading = false, returned = false, attempts = 0, retry, timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(retry);
      lifetime.abort();
      signal?.removeEventListener('abort', abort);
      browser.tabs.onActivated.removeListener(activated);
      browser.tabs.onRemoved.removeListener(removed);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Aborted', 'AbortError'));
    const missing = () => new Error(t('浏览器还没有这个网站的图标，请确认标签页已显示图标后重试，或上传本机图片。'));
    const probe = async () => {
      if (settled || reading || !returned) return;
      reading = true;
      attempts++;
      try {
        // Chromium can update its favicon database just after tab activation.
        // Reject its generic fallback instead of reporting it as a site icon.
        const options = { runtime: browser.runtime, signal: lifetime.signal };
        const fallback = await readIcon('https://qiye-no-favicon.invalid/', options);
        let tab;
        try { tab = await browser.tabs.get(visited.id); } catch { /* A closed visit still leaves its cached icon. */ }
        const finalUrl = safeUrl(tab?.url);
        const pages = [...new Set([finalUrl, pageUrl].filter(Boolean))];
        for (const url of pages) {
          const image = await readIcon(url, options);
          if (image.dataUrl !== fallback.dataUrl) {
            finish(null, { ...image, pageUrl });
            return;
          }
        }
      } catch (error) {
        if (settled) return;
        if (attempts >= 6) { finish(new Error(t('无法读取浏览器图标缓存。'))); return; }
      } finally { reading = false; }
      if (settled) return;
      if (attempts >= 6) finish(missing());
      else retry = setTimeout(probe, retryMs);
    };
    const activated = info => {
      if (settled || info.tabId !== source.id) return;
      returned = true;
      onWaiting('reading');
      void probe();
    };
    const removed = tabId => {
      if (tabId === source.id) abort();
      else if (tabId === visited.id) { returned = true; void probe(); }
    };
    browser.tabs.onActivated.addListener(activated);
    browser.tabs.onRemoved.addListener(removed);
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(new Error(t('等待访问已超时，可以再次访问网站获取图标。'))), timeoutMs);
    if (signal?.aborted) { abort(); return; }
    onWaiting('visit');
    // Covers a fast return between tabs.create resolving and listener setup.
    browser.tabs.get(source.id).then(tab => { if (tab.active) activated({ tabId: source.id }); }).catch(abort);
  });
}
