import test from 'node:test';
import assert from 'node:assert/strict';
import { createWallpaperBrowser, fetchWallpaperPage, isAllowedWallpaperUrl, normalizeWallpaperPhoto, parsePicsumResponse } from '../src/wallpapers.js';
import { DEFAULT_STATE, exportState, validateImport } from '../src/core.js';

const rawPhoto = (id = '237', changes = {}) => ({ id, author: 'André Spieker', width: 3500, height: 2095, url: 'https://unsplash.com/photos/F561zI-9_0Q', download_url: `https://picsum.photos/id/${id}/3500/2095`, ...changes });
const photo = (id = '237', changes = {}) => normalizeWallpaperPhoto({ provider: 'picsum', id, author: 'André Spieker', sourceUrl: 'https://unsplash.com/photos/F561zI-9_0Q', width: 3500, height: 2095, ...changes });

test('wallpaper imports accept only bounded, fixed HTTPS provider image URLs', () => {
  for (const value of ['https://picsum.photos/id/237/1920/1080', 'https://picsum.photos/id/0/640/360.webp']) assert.equal(isAllowedWallpaperUrl(value), true, value);
  for (const value of [null, '', 'http://picsum.photos/id/237/1920/1080', 'https://picsum.photos.evil.example/id/237/1920/1080', 'https://picsum.photos@evil.example/id/237/1920/1080', 'https://name:secret@picsum.photos/id/237/1920/1080', 'https://picsum.photos:8443/id/237/1920/1080', 'https://picsum.photos/id/237/9999/9999', 'https://picsum.photos/id/237/1920/1080?redirect=https://evil.example', 'https://picsum.photos/id/237/1920/1080#x', 'https://picsum.photos/seed/name/1920/1080', 'data:image/svg+xml,<svg/>', 'javascript:alert(1)']) assert.equal(isAllowedWallpaperUrl(value), false, value);
});

test('wallpaper records canonicalize image size and preserve safe author/source attribution', () => {
  const value = photo('237', { url: 'https://picsum.photos/id/237/3840/2160.webp', thumbnail: 'https://picsum.photos/id/237/1280/720', password: 'never export', author: 'André\u0000 Spieker', licenseUrl: 'https://evil.example' });
  assert.equal(value.url, 'https://picsum.photos/id/237/1920/1080');
  assert.equal(value.thumbnail, 'https://picsum.photos/id/237/640/360');
  assert.equal(value.author, 'André Spieker');
  assert.equal(value.sourceUrl, 'https://unsplash.com/photos/F561zI-9_0Q');
  assert.equal(value.licenseUrl, 'https://unsplash.com/license');
  assert.equal('password' in value, false);
  assert.equal(value.title, '摄影壁纸 · #237');
});

test('invalid providers, mismatched photo IDs, and phishing attribution URLs are rejected', () => {
  for (const changes of [{ provider: 'other' }, { id: '../../x' }, { url: 'https://evil.example/image.jpg' }, { url: 'https://picsum.photos/id/238/1920/1080' }, { sourceUrl: 'https://unsplash.com.evil.example/photos/F561zI-9_0Q' }, { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://unsplash.com/login' }, { sourceUrl: 'https://user:secret@unsplash.com/photos/F561zI-9_0Q' }]) assert.equal(photo('237', changes), null, JSON.stringify(changes));
  assert.equal(normalizeWallpaperPhoto(null), null);
  assert.equal(normalizeWallpaperPhoto([]), null);
});

test('wallpaper settings are complete in new desktops and required on import', () => {
  assert.equal(DEFAULT_STATE.settings.wallpaperApiEnabled, false);
  assert.equal(DEFAULT_STATE.settings.remoteWallpaper, null);
  for (const key of ['wallpaperApiEnabled', 'remoteWallpaper']) {
    const state = structuredClone(DEFAULT_STATE);
    delete state.settings[key];
    assert.throws(() => validateImport(state));
  }
});

test('actual core validation rejects arbitrary remote backgrounds and deceptive source links', () => {
  const state = structuredClone(DEFAULT_STATE);
  state.settings.wallpaperApiEnabled = true;
  for (const changes of [{ url: 'https://evil.example/tracker.jpg' }, { provider: 'evil' }, { sourceUrl: 'https://unsplash.com.evil.example/photos/x' }, { url: 'https://picsum.photos/id/999/1920/1080' }]) {
    state.settings.remoteWallpaper = { ...photo(), ...changes };
    assert.throws(() => validateImport(state), /在线壁纸来源不受支持/);
  }
});

test('actual backup export keeps only the canonical provider photo and attribution', () => {
  const state = structuredClone(DEFAULT_STATE);
  state.settings.wallpaperApiEnabled = true;
  state.settings.remoteWallpaper = { ...photo(), providerPassword: 'must not survive', licenseUrl: 'https://evil.example/license' };
  const roundTrip = validateImport(JSON.parse(exportState(state)));
  assert.deepEqual(roundTrip.settings.remoteWallpaper, photo());
  assert.equal(roundTrip.settings.wallpaperApiEnabled, true);
});

test('API parsing selects usable landscape photos, deduplicates IDs, and discards untrusted download URLs', () => {
  const parsed = parsePicsumResponse([rawPhoto(), rawPhoto(), rawPhoto('238', { width: 900, height: 1500 }), rawPhoto('239', { width: 2000, height: 600 }), rawPhoto('240', { url: 'https://evil.example/photo' }), rawPhoto('241', { download_url: 'https://evil.example/tracker', author: '摄影师' })]);
  assert.deepEqual(parsed.map((entry) => entry.id), ['237', '241']);
  assert.equal(parsed[1].url, 'https://picsum.photos/id/241/1920/1080');
  assert.equal(parsed[1].author, '摄影师');
  assert.deepEqual(parsePicsumResponse([]), []);
  for (const malformed of [null, {}, 'images', Array(101).fill(rawPhoto())]) assert.throws(() => parsePicsumResponse(malformed), /数据格式/);
});

test('wallpaper API uses the documented paginated endpoint without credentials or referrers', async () => {
  let request;
  const result = await fetchWallpaperPage({ page: 4, limit: 30, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => [rawPhoto()] };
  } });
  assert.equal(request.url, 'https://picsum.photos/v2/list?page=4&limit=30');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(result[0].id, '237');
});

test('wallpaper API reports rate limits, invalid responses, and transport failures honestly', async () => {
  await assert.rejects(fetchWallpaperPage({ fetchImpl: async () => ({ ok: false, status: 429 }) }), /请求较多/);
  await assert.rejects(fetchWallpaperPage({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(fetchWallpaperPage({ fetchImpl: async () => ({ ok: true, headers: new Headers({ 'content-type': 'text/html' }) }) }), /不是图片清单/);
  await assert.rejects(fetchWallpaperPage({ fetchImpl: async () => { throw new TypeError('network'); } }), /无法连接壁纸服务/);
  await assert.rejects(fetchWallpaperPage({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }) }), /无法读取/);
  let requested = false;
  await assert.rejects(fetchWallpaperPage({ page: -1, fetchImpl: () => { requested = true; } }), /分页参数/);
  assert.equal(requested, false);
});

test('wallpaper request timeouts abort the underlying fetch and distinguish cancellation', async () => {
  const blocked = (_url, { signal }) => new Promise((_resolve, reject) => {
    const fail = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) fail(); else signal.addEventListener('abort', fail, { once: true });
  });
  await assert.rejects(fetchWallpaperPage({ fetchImpl: blocked, timeoutMs: 2 }), /加载超时/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchWallpaperPage({ fetchImpl: blocked, signal: controller.signal }), /请求已取消/);
});

test('wallpaper browser is lazy, coalesces concurrent loads, and advances within a loaded batch', async () => {
  const requested = [];
  const browser = createWallpaperBrowser({ fetchPage: async ({ page }) => { requested.push(page); return [photo('237'), photo('238')]; } });
  assert.equal(requested.length, 0);
  assert.equal(browser.getState().status, 'idle');
  await Promise.all([browser.load(), browser.load()]);
  assert.deepEqual(requested, [1]);
  assert.equal(browser.getState().photo.id, '237');
  await browser.next();
  assert.equal(browser.getState().photo.id, '238');
  assert.deepEqual(requested, [1]);
  await browser.next();
  assert.deepEqual(requested, [1, 2]);
});

test('an unavailable next page keeps the last usable photo and can be retried', async () => {
  let fail = true;
  const requested = [];
  const browser = createWallpaperBrowser({ initialPhoto: photo(), fetchPage: async ({ page }) => { requested.push(page); if (fail) throw new Error('服务暂不可用'); return [photo('238')]; } });
  browser.markImageReady('237');
  assert.equal(await browser.nextPage(), null);
  assert.equal(browser.getState().status, 'error');
  assert.equal(browser.getState().photo.id, '237');
  assert.equal(browser.getState().imageStatus, 'ready');
  assert.equal(browser.getState().error, '服务暂不可用');
  fail = false;
  await browser.retry();
  assert.deepEqual(requested, [2, 2]);
  assert.equal(browser.getState().photo.id, '238');
});

test('an empty final page wraps once to the first page without retry loops', async () => {
  const requested = [];
  const browser = createWallpaperBrowser({ startPage: 30, fetchPage: async ({ page }) => { requested.push(page); return page === 1 ? [photo()] : []; } });
  await browser.load();
  assert.deepEqual(requested, [30, 1]);
  assert.equal(browser.getState().page, 1);
  const empty = createWallpaperBrowser({ fetchPage: async () => [] });
  await empty.load();
  assert.equal(empty.getState().status, 'error');
  assert.match(empty.getState().error, /暂无适合桌面/);
});

test('image failures block applying, stale events are ignored, and successful application uses the actual callback', async () => {
  const browser = createWallpaperBrowser({ initialPhoto: photo() });
  const applied = [];
  const apply = async (value) => { applied.push(value); };
  assert.equal(await browser.apply(apply), false);
  browser.markImageReady('wrong-id');
  assert.equal(browser.getState().imageStatus, 'loading');
  browser.markImageError('237');
  assert.equal(browser.getState().imageStatus, 'error');
  assert.equal(await browser.apply(apply), false);
  browser.markImageReady('237');
  assert.equal(await browser.apply(apply), true);
  assert.deepEqual(applied, [photo()]);
  await assert.rejects(browser.apply(async () => { throw new Error('磁盘写入失败'); }), /磁盘写入失败/);
  assert.equal(browser.getState().applying, false);
});
