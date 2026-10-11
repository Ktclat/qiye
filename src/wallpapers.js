/* Public wallpaper provider. No account, API key, or application server. */

export const wallpaperProviders = Object.freeze([
  Object.freeze({ id: 'picsum', name: 'Lorem Picsum', url: 'https://picsum.photos/', description: '公开摄影图库，保留摄影师与照片来源' }),
]);

const PHOTO_ID = /^\d{1,10}$/;
const REQUEST_LIMIT = 30;

function cleanWallpaperText(value, fallback, length = 120) {
  return (typeof value === 'string' ? value : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, length) || fallback;
}

/** Stored image URLs are fixed HTTPS Picsum photos, never arbitrary imported URLs. */
export function isAllowedWallpaperUrl(value) {
  if (typeof value !== 'string' || value.length > 250) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'picsum.photos' || url.username || url.password || url.port || url.search || url.hash) return false;
    const match = /^\/id\/(\d{1,10})\/(\d{2,4})\/(\d{2,4})(?:\.(?:jpg|webp))?$/.exec(url.pathname);
    return Boolean(match && Number(match[2]) >= 64 && Number(match[2]) <= 3840 && Number(match[3]) >= 64 && Number(match[3]) <= 2160);
  } catch { return false; }
}

function wallpaperSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    if (url.hostname === 'unsplash.com' && /^\/photos\/[^/\s]+\/?$/.test(url.pathname)) {
      url.search = '';
      return url.href;
    }
    return url.href === 'https://picsum.photos/images' ? url.href : null;
  } catch { return null; }
}

/** Safe, canonical data shared by the widget, background settings, and backups. */
export function normalizeWallpaperPhoto(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.provider !== 'picsum') return null;
  const id = String(value.id ?? '');
  if (!PHOTO_ID.test(id)) return null;
  for (const key of ['url', 'thumbnail']) {
    if (value[key] !== undefined && (!isAllowedWallpaperUrl(value[key]) || new URL(value[key]).pathname.split('/')[2] !== id)) return null;
  }
  const sourceUrl = value.sourceUrl === undefined ? 'https://picsum.photos/images' : wallpaperSourceUrl(value.sourceUrl);
  if (!sourceUrl) return null;
  const dimension = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 100_000 ? Math.round(n) : null;
  return {
    provider: 'picsum', id,
    url: `https://picsum.photos/id/${id}/1920/1080`,
    thumbnail: `https://picsum.photos/id/${id}/640/360`,
    sourceUrl,
    title: cleanWallpaperText(value.title, `摄影壁纸 · #${id}`),
    author: cleanWallpaperText(value.author, '摄影师未署名', 100),
    license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license',
    width: dimension(value.width), height: dimension(value.height),
  };
}

/** The API includes portrait photos too; desktop browsing keeps landscape originals. */
export function parsePicsumResponse(raw) {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('壁纸服务返回的数据格式不正确');
  const seen = new Set();
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !Number.isFinite(entry.width) || !Number.isFinite(entry.height) || entry.width < 1280 || entry.height < 720 || entry.width < entry.height) return [];
    const photo = normalizeWallpaperPhoto({ provider: 'picsum', id: entry.id, sourceUrl: entry.url, author: entry.author, width: entry.width, height: entry.height });
    if (!photo || seen.has(photo.id)) return [];
    seen.add(photo.id);
    return [photo];
  });
}

/** Fetch only documented provider endpoints. A caller must first receive user intent. */
export async function fetchWallpaperPage({ page = 1, limit = REQUEST_LIMIT, signal, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('壁纸分页参数不正确');
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法连接壁纸服务');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, Math.max(1, Math.min(30_000, Number(timeoutMs) || 10_000)));
  try {
    const response = await fetchImpl(`https://picsum.photos/v2/list?page=${page}&limit=${limit}`, {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(response.status === 429 ? '壁纸服务请求较多，请稍后重试' : `壁纸服务暂不可用（${response.status}）`);
    const contentType = response.headers?.get?.('content-type');
    if (contentType && !/\bjson\b/i.test(contentType)) throw new Error('壁纸服务返回的不是图片清单');
    return parsePicsumResponse(await response.json());
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') throw new Error(signal?.aborted ? '壁纸请求已取消' : '壁纸加载超时，请稍后重试');
    if (error instanceof TypeError) throw new Error('无法连接壁纸服务，请检查网络后重试');
    if (error instanceof SyntaxError) throw new Error('壁纸服务返回的数据无法读取');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

/** Small state machine: a failed next page preserves the last working photograph. */
export function createWallpaperBrowser({ fetchPage = fetchWallpaperPage, initialPhoto = null, startPage = 1, onChange = () => {} } = {}) {
  const initial = normalizeWallpaperPhoto(initialPhoto);
  const state = { status: initial ? 'ready' : 'idle', imageStatus: initial ? 'loading' : 'idle', photo: initial, photos: initial ? [initial] : [], index: initial ? 0 : -1, page: Number.isInteger(startPage) && startPage >= 1 && startPage <= 1000 ? startPage : 1, error: '', applying: false };
  let pending = null;
  let attemptedPage = state.page;
  const emit = (reason = 'render') => onChange(reason);
  const select = (index) => { state.index = index; state.photo = state.photos[index]; state.status = 'ready'; state.imageStatus = 'loading'; state.error = ''; emit(); };
  const readPage = (page) => {
    if (pending) return pending;
    attemptedPage = page;
    state.status = 'loading'; state.error = ''; emit();
    const job = Promise.resolve().then(async () => {
      try {
        let photos = await fetchPage({ page });
        if (!Array.isArray(photos)) throw new Error('壁纸服务返回的数据格式不正确');
        let actualPage = page;
        if (!photos.length && page > 1) { photos = await fetchPage({ page: 1 }); actualPage = 1; }
        const safe = Array.isArray(photos) ? photos.map(normalizeWallpaperPhoto).filter(Boolean) : [];
        if (!safe.length) throw new Error('这一组暂无适合桌面的照片，请稍后重试');
        state.photos = safe; state.page = actualPage;
        select(0);
        return state.photo;
      } catch (error) {
        state.status = 'error'; state.error = String(error?.message || '暂时无法获取壁纸'); emit();
        return null;
      } finally { pending = null; }
    });
    pending = job;
    return job;
  };
  return {
    getState: () => ({ ...state, photos: [...state.photos] }),
    load: () => state.photo ? Promise.resolve(state.photo) : readPage(state.page),
    next: () => {
      if (pending || state.applying) return pending || Promise.resolve(null);
      if (state.index + 1 < state.photos.length) { select(state.index + 1); return Promise.resolve(state.photo); }
      return readPage(state.photo ? (state.page % 1000) + 1 : state.page);
    },
    nextPage: () => state.applying ? Promise.resolve(null) : readPage(state.photo ? (state.page % 1000) + 1 : state.page),
    retry: () => readPage(attemptedPage),
    markImageReady: (id) => { if (state.photo?.id === id && state.imageStatus !== 'ready') { state.imageStatus = 'ready'; emit('image'); } },
    markImageError: (id) => { if (state.photo?.id === id) { state.imageStatus = 'error'; emit('image'); } },
    apply: async (onApply) => {
      if (!state.photo || state.imageStatus !== 'ready' || state.applying || typeof onApply !== 'function') return false;
      state.applying = true; emit('image');
      try { await onApply({ ...state.photo }); return true; }
      finally { state.applying = false; emit('image'); }
    },
  };
}
