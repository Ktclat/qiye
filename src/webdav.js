import { validateImport, exportState, MAX_BACKUP_BYTES, loadState } from './core.js';

/**
 * WebDAV stores one validated Qiye JSON file. Credentials and the synchronization
 * baseline live in a separate LOCAL record; neither enters a backup or PUT body.
 * Protocol: RFC 4918 section 8.6; RFC 9110 sections 13.1.1 / 13.1.2.
 * This module never replaces local state. Callers explicitly review and apply a
 * download using core.saveState's revision guard, then acknowledge it below.
 */
export const WEBDAV_LOCAL_KEY = 'qiye.webdav.local.v1';
export const DEFAULT_WEBDAV_CONFIG = Object.freeze({
  enabled: false, endpoint: '', path: 'qiye.json', username: '', password: '', autoSync: false
});

const REQUEST_TIMEOUT_MS = 15000;
const REVIEW_LIFETIME_MS = 10 * 60 * 1000;
const copy = value => JSON.parse(JSON.stringify(value));

export class WebDAVError extends Error {
  constructor(code, message) { super(message); this.name = 'WebDAVError'; this.code = code; }
}

function fail(code, message) { throw new WebDAVError(code, message); }

export function validateWebDAVConfig(input, { requireEndpoint = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_CONFIG', 'WebDAV 配置格式不正确。');
  const config = { ...DEFAULT_WEBDAV_CONFIG };
  for (const key of Object.keys(config)) if (input[key] !== undefined) config[key] = input[key];
  if (typeof config.enabled !== 'boolean' || typeof config.autoSync !== 'boolean') fail('INVALID_CONFIG', '同步开关格式不正确。');
  for (const key of ['endpoint', 'path', 'username', 'password']) {
    if (typeof config[key] !== 'string' || config[key].length > (key === 'endpoint' ? 4096 : 1024) || /[\u0000-\u001f\u007f]/.test(config[key])) {
      fail('INVALID_CONFIG', 'WebDAV 配置包含无效字符或过长的内容。');
    }
  }
  config.endpoint = config.endpoint.trim();
  config.path = config.path.trim() || 'qiye.json';
  if (config.username.includes(':')) fail('INVALID_CONFIG', 'WebDAV 用户名不能包含冒号。');
  if (!config.username && config.password) fail('INVALID_CONFIG', '填写密码时也需要填写 WebDAV 用户名。');
  if (!config.endpoint) {
    if (requireEndpoint || config.enabled) fail('NOT_CONFIGURED', '请先填写 WebDAV 目录地址。');
  } else {
    if (!/^https?:\/\//i.test(config.endpoint) || /[\s\\]/u.test(config.endpoint)) fail('UNSAFE_URL', '目录地址须为完整的 HTTPS 地址。');
    let endpoint;
    try { endpoint = new URL(config.endpoint); } catch { fail('UNSAFE_URL', 'WebDAV 目录地址无效。'); }
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail('UNSAFE_URL', '目录地址不能包含账号、密码、查询参数或片段；请将凭据填入独立字段。');
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) {
      fail('UNSAFE_URL', 'WebDAV 使用 HTTPS；只有本机 localhost 或 127.0.0.1 的服务可使用 HTTP。');
    }
    // Reject traversal before URL normalization can silently remove dot segments.
    const rawPath = config.endpoint.replace(/^https?:\/\/[^/]+/i, '');
    checkPathSegments(rawPath, true);
    endpoint.pathname = endpoint.pathname.endsWith('/') ? endpoint.pathname : `${endpoint.pathname}/`;
    config.endpoint = endpoint.href;
  }
  if (config.path.startsWith('/') || config.path.endsWith('/') || /[?#\\]/.test(config.path)) fail('UNSAFE_PATH', '同步文件请填写相对于目录的文件名，例如 qiye.json。');
  const segments = checkPathSegments(config.path, false);
  if (!segments.length || !segments.at(-1).toLowerCase().endsWith('.json')) fail('UNSAFE_PATH', '同步文件名须以 .json 结尾。');
  config.path = segments.map(segment => encodeURIComponent(segment)).join('/');
  return config;
}

function checkPathSegments(value, allowOuterSlashes) {
  let pieces = value.split('/');
  if (allowOuterSlashes) {
    if (pieces[0] === '') pieces.shift();
    if (pieces.at(-1) === '') pieces.pop();
  }
  return pieces.map(piece => {
    let decoded;
    try { decoded = decodeURIComponent(piece); } catch { fail('UNSAFE_PATH', 'WebDAV 路径包含无效的 URL 编码。'); }
    if (!decoded || decoded === '.' || decoded === '..' || /[\u0000-\u001f\u007f/\\?#]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) {
      fail('UNSAFE_PATH', 'WebDAV 路径不能包含空目录、跳转目录或编码后的路径分隔符。');
    }
    return decoded;
  });
}

export function webDAVTargetURL(config) {
  const checked = validateWebDAVConfig(config, { requireEndpoint: true });
  return new URL(checked.path, checked.endpoint).href;
}

export function webDAVOriginPattern(config) {
  return `${new URL(webDAVTargetURL(config)).origin}/*`;
}

function chromeAPI(owner, method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const result = owner[method](...args, value => {
        if (globalThis.chrome?.runtime?.lastError) reject(new WebDAVError('BROWSER_API', '浏览器未能完成 WebDAV 权限或存储操作。'));
        else resolve(value);
      });
      if (result && typeof result.then === 'function') result.then(resolve, reject);
    } catch { reject(new WebDAVError('BROWSER_API', '浏览器未能完成 WebDAV 权限或存储操作。')); }
  });
}

/** Call directly inside a click/submit handler, before awaiting storage/network. */
export function requestWebDAVPermission(config) {
  const origin = webDAVOriginPattern(config);
  if (!globalThis.chrome?.permissions?.request) return Promise.resolve(true); // Browser preview uses the server's own CORS policy.
  return chromeAPI(globalThis.chrome.permissions, 'request', { origins: [origin] }).then(granted => {
    if (!granted) fail('PERMISSION_DENIED', '未获得该 WebDAV 网站的访问权限，现有数据没有改变。');
    return true;
  });
}

async function checkPermission(config) {
  if (!globalThis.chrome?.permissions?.contains) return;
  const granted = await chromeAPI(globalThis.chrome.permissions, 'contains', { origins: [webDAVOriginPattern(config)] });
  if (!granted) fail('PERMISSION_REQUIRED', '请在 WebDAV 设置中点击连接或同步，授予所填网站的访问权限。');
}

const browserStore = {
  async get() {
    if (globalThis.chrome?.storage?.local) {
      const values = await chromeAPI(globalThis.chrome.storage.local, 'get', WEBDAV_LOCAL_KEY);
      return values?.[WEBDAV_LOCAL_KEY] ?? null;
    }
    if (!globalThis.localStorage) fail('STORAGE_UNAVAILABLE', '此环境无法保存 WebDAV 本机配置。');
    const raw = globalThis.localStorage.getItem(WEBDAV_LOCAL_KEY);
    try { return raw === null ? null : JSON.parse(raw); } catch { fail('INVALID_LOCAL_CONFIG', 'WebDAV 本机配置损坏；请清除同步配置后重新填写。'); }
  },
  async set(value) {
    if (globalThis.chrome?.storage?.local) return chromeAPI(globalThis.chrome.storage.local, 'set', { [WEBDAV_LOCAL_KEY]: value });
    if (!globalThis.localStorage) fail('STORAGE_UNAVAILABLE', '此环境无法保存 WebDAV 本机配置。');
    globalThis.localStorage.setItem(WEBDAV_LOCAL_KEY, JSON.stringify(value));
  },
  async remove() {
    if (globalThis.chrome?.storage?.local) return chromeAPI(globalThis.chrome.storage.local, 'remove', WEBDAV_LOCAL_KEY);
    if (globalThis.localStorage) globalThis.localStorage.removeItem(WEBDAV_LOCAL_KEY);
  }
};

function randomID() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fail('CRYPTO_UNAVAILABLE', '此环境不支持安全同步标识；请在 HTTPS 页面或扩展中打开栖页。');
}

/** Ignore the local storage revision, which legitimately differs on each device. */
export async function webDAVStateFingerprint(state) {
  const checked = validateImport(state);
  checked.updatedAt = 0;
  if (!globalThis.crypto?.subtle) fail('CRYPTO_UNAVAILABLE', '此环境不支持安全同步校验；请在 HTTPS 页面或扩展中打开栖页。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(checked)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function summary(state) {
  return state ? {
    updatedAt: state.updatedAt, groups: state.groups.length,
    sites: state.items.filter(item => item.type === 'link').length,
    widgets: state.items.filter(item => item.type === 'widget').length,
    todos: state.todos.length, notesLength: state.notes.length
  } : null;
}

function strongETag(value) {
  return typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value) ? value : null;
}

function authHeader(config) {
  if (!config.username) return null;
  // RFC 7617: UTF-8 Basic credentials, sent only to the exact configured endpoint.
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function httpError(status) {
  const messages = {
    401: 'WebDAV 验证失败，请检查用户名和密码或应用专用密码。',
    403: 'WebDAV 拒绝访问，请检查目录与读写权限。',
    405: '该地址不支持所需的 WebDAV 读写方法，请填写实际的 WebDAV 目录。',
    409: '同步文件的父目录不存在或不接受此文件；请先在 WebDAV 服务中创建目录。',
    413: 'WebDAV 服务拒绝了过大的备份文件。',
    423: 'WebDAV 文件被锁定，请稍后重试。',
    507: 'WebDAV 存储空间不足。'
  };
  return new WebDAVError(`HTTP_${status}`, messages[status] || `WebDAV 返回 HTTP ${status}，本次操作尚未完成。`);
}

async function limitedText(response) {
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > MAX_BACKUP_BYTES) {
    try { await response.body?.cancel(); } catch { /* Already closed. */ }
    fail('REMOTE_TOO_LARGE', '远程备份超过 6 MiB，已停止读取。');
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) fail('REMOTE_TOO_LARGE', '远程备份超过 6 MiB，已停止读取。');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BACKUP_BYTES) { await reader.cancel(); fail('REMOTE_TOO_LARGE', '远程备份超过 6 MiB，已停止读取。'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

/** Injectable adapters make protocol tests exercise the production algorithm. */
export function createWebDAVSync({ fetchImpl = (...args) => fetch(...args), store = browserStore,
  currentState = loadState, permissionCheck = checkPermission, now = () => Date.now(), timeoutMs = REQUEST_TIMEOUT_MS,
  lock = operation => globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request(WEBDAV_LOCAL_KEY, operation) : operation()
} = {}) {
  let queue = Promise.resolve();
  const reviews = new Map();
  const downloads = new Map();

  function serial(operation) {
    const task = () => lock(operation);
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  }

  async function readRecord() {
    const raw = await store.get();
    if (!raw) return null;
    if (raw.version !== 1 || typeof raw.revision !== 'string') fail('INVALID_LOCAL_CONFIG', 'WebDAV 本机配置格式不正确；请清除同步配置后重新填写。');
    return { ...raw, config: validateWebDAVConfig(raw.config) };
  }

  async function loadConfig() { return copy((await readRecord())?.config || DEFAULT_WEBDAV_CONFIG); }

  async function saveConfig(input) {
    const config = validateWebDAVConfig(input);
    return serial(async () => {
      const record = await readRecord();
      const identityChanged = !record || ['endpoint', 'path', 'username', 'password'].some(key => record.config[key] !== config[key]);
      await store.set({
        version: 1, revision: identityChanged ? randomID() : record.revision, config,
        baseline: identityChanged ? null : record.baseline,
        lastError: null, lastErrorAt: null, lastAction: identityChanged ? null : record.lastAction
      });
      if (identityChanged) { reviews.clear(); downloads.clear(); }
      return copy(config);
    });
  }

  async function clearConfig() {
    return serial(async () => { await store.remove(); reviews.clear(); downloads.clear(); });
  }

  async function status() {
    const record = await readRecord();
    const config = record?.config || DEFAULT_WEBDAV_CONFIG;
    return {
      configured: Boolean(config.endpoint), enabled: config.enabled, autoSync: config.autoSync,
      hasBaseline: Boolean(record?.baseline), lastSyncedAt: record?.baseline?.at || null,
      lastAction: record?.lastAction || null, lastError: record?.lastError || null,
      lastErrorAt: record?.lastErrorAt || null,
      target: config.endpoint ? webDAVTargetURL(config) : null
    };
  }

  async function request(config, method, { body, etag, create = false } = {}) {
    const target = webDAVTargetURL(config);
    await permissionCheck(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: 'application/json' };
    const authorization = authHeader(config);
    if (authorization) headers.Authorization = authorization;
    if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (etag) headers['If-Match'] = etag;
    if (create) headers['If-None-Match'] = '*';
    try {
      const response = await fetchImpl(target, {
        method, headers, ...(body !== undefined ? { body } : {}),
        credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal
      });
      // redirect:error prevents sending credentials to a redirect target. Also
      // reject redirected/mismatched responses from adapters or browser anomalies.
      if (response.redirected || response.type === 'opaqueredirect' || (response.url && response.url !== target) || (response.status >= 300 && response.status < 400)) {
        try { await response.body?.cancel(); } catch { /* Nothing to consume. */ }
        fail('REDIRECT_REJECTED', 'WebDAV 地址发生了重定向。请直接填写最终目录地址；凭据不会转发到新地址。');
      }
      const result = { status: response.status, etag: strongETag(response.headers.get('ETag')), text: null };
      if (method === 'GET' && response.status === 200) result.text = await limitedText(response);
      else { try { await response.body?.cancel(); } catch { /* No response body needed. */ } }
      return result;
    } catch (error) {
      if (error instanceof WebDAVError) throw error;
      if (controller.signal.aborted) fail('TIMEOUT', method === 'PUT'
        ? 'WebDAV 上传超时，远程写入结果尚未确认；请重新同步以核对，本机数据已保留。'
        : 'WebDAV 请求超时，请检查服务地址和网络连接。');
      if (error instanceof TypeError && /encoded data/i.test(error.message)) fail('INVALID_REMOTE', '远程文件不是有效的 UTF-8 JSON 备份。');
      fail('NETWORK_ERROR', method === 'PUT'
        ? 'WebDAV 上传未能完成确认。请检查网络、证书、重定向和 CORS；网页预览还需服务端允许跨域。远程写入结果未知，请重新同步核对。'
        : '无法连接 WebDAV。请检查网络、证书和最终目录地址；网页预览还需要服务端允许 CORS，并暴露 ETag 响应头。');
    } finally { clearTimeout(timer); }
  }

  async function readRemote(config) {
    const response = await request(config, 'GET');
    if (response.status === 404) return { exists: false, state: null, fingerprint: null, etag: null };
    if (response.status !== 200) throw httpError(response.status);
    let state;
    try { state = validateImport(response.text); } catch { fail('INVALID_REMOTE', '远程文件不是兼容的栖页备份，或内容未通过校验；两端数据均未替换。'); }
    return { exists: true, state, fingerprint: await webDAVStateFingerprint(state), etag: response.etag };
  }

  async function testConnection(input) {
    const config = validateWebDAVConfig(input || await loadConfig(), { requireEndpoint: true });
    const remote = await readRemote(config);
    return {
      status: remote.exists ? 'readable' : 'empty', exists: remote.exists,
      hasStrongETag: Boolean(remote.etag), remote: summary(remote.state),
      message: remote.exists
        ? (remote.etag ? '远程备份可读取，并提供强 ETag。写入权限将在实际同步时验证。' : '远程备份可读取，但缺少可用的强 ETag；可以下载，暂不能安全覆盖上传。网页预览需暴露 ETag 响应头。')
        : '服务器返回 404，尚未找到同步文件。请确认目录已存在；首次手动同步会尝试创建文件。此测试未验证写入权限，也未创建文件。'
    };
  }

  async function matchesLocal(fingerprint) {
    return await webDAVStateFingerprint(await currentState()) === fingerprint;
  }

  function localChanged(localFingerprint) {
    return { status: 'local-changed', localFingerprint, message: '同步期间本机内容发生了变化，已停止应用旧版本。请保存后重新同步。' };
  }

  function rememberReview(record, local, localFingerprint, remote, reason) {
    const token = randomID();
    for (const [key, review] of reviews) if (now() - review.at > REVIEW_LIFETIME_MS) reviews.delete(key);
    if (reviews.size >= 20) reviews.delete(reviews.keys().next().value);
    reviews.set(token, { at: now(), revision: record.revision, localFingerprint,
      remoteFingerprint: remote.fingerprint, etag: remote.etag, exists: remote.exists });
    const messages = {
      'first-sync': '这是本机首次连接该备份，两端内容不同。请先比较并选择保留哪一端。',
      'both-changed': '本机和远程都在上次同步后发生了变化，请比较后选择，当前没有覆盖任何一端。',
      'remote-changed': '远程内容与本机不同，请确认要上传本机版本还是下载远程版本。',
      'remote-deleted': '上次同步的远程文件已不存在。请确认后再用本机内容重新创建。',
      'review-stale': '刚才比较的版本已经变化，请重新比较后选择。',
      'write-conflict': '上传前远程版本已被其他设备更新，条件写入已停止，请重新比较。',
      'after-write-changed': '上传后读回的远程版本与提交内容不同，可能已被其他设备更新。同步结果尚未确认，请比较。'
    };
    return { status: 'conflict', reason, message: messages[reason] || messages['both-changed'], review: token,
      local: summary(local), remote: summary(remote.state), remoteState: remote.state ? copy(remote.state) : null, localFingerprint };
  }

  async function recordResult(record, result) {
    await store.set({ ...record, lastAction: result.status, lastError: result.status === 'conflict' ? result.message : null,
      lastErrorAt: result.status === 'conflict' ? now() : null });
    return result;
  }

  async function baseline(record, localFingerprint, remote, action) {
    await store.set({ ...record, baseline: { localFingerprint, remoteFingerprint: remote.fingerprint,
      etag: remote.etag, at: now() }, lastAction: action, lastError: null, lastErrorAt: null });
  }

  function downloadReady(record, localFingerprint, remote) {
    const token = randomID();
    downloads.set(token, { revision: record.revision, localFingerprint, remote: copy(remote), at: now() });
    // The UI may recheck a review immediately before applying it. Bind download
    // reviews to both versions just like a conflict decision, so that recheck
    // returns a fresh download instead of spuriously reporting a stale review.
    reviews.set(token, { at: now(), revision: record.revision, localFingerprint,
      remoteFingerprint: remote.fingerprint, etag: remote.etag, exists: remote.exists });
    if (downloads.size > 20) downloads.delete(downloads.keys().next().value);
    if (reviews.size > 20) reviews.delete(reviews.keys().next().value);
    return { status: 'download-ready', message: '远程备份已读取并校验，请确认后应用到本机。',
      state: copy(remote.state), review: token, localFingerprint, remoteFingerprint: remote.fingerprint, remote: summary(remote.state) };
  }

  async function writeRemote(record, local, localFingerprint, remote) {
    if (remote.exists && !remote.etag) fail('NO_STRONG_ETAG', '服务端没有提供可用的强 ETag，无法安全覆盖远程文件。请启用 ETag；网页预览需通过 CORS 暴露 ETag 响应头。你仍可下载远程备份。');
    if (!await matchesLocal(localFingerprint)) return localChanged(localFingerprint);
    const body = exportState(local);
    const response = await request(record.config, 'PUT', { body, etag: remote.etag, create: !remote.exists });
    if (response.status === 412) {
      const latest = await readRemote(record.config);
      return recordResult(record, rememberReview(record, local, localFingerprint, latest, 'write-conflict'));
    }
    if (![200, 201, 204].includes(response.status)) throw httpError(response.status);
    let verified;
    try { verified = await readRemote(record.config); } catch {
      fail('WRITE_UNVERIFIED', '服务器已接受上传，但读回验证未完成。远程写入可能已成功；本机数据已保留，请重新同步核对。');
    }
    if (!verified.exists || verified.fingerprint !== localFingerprint) {
      return recordResult(record, rememberReview(record, local, localFingerprint, verified, 'after-write-changed'));
    }
    await baseline(record, localFingerprint, verified, 'uploaded');
    return { status: 'uploaded', localFingerprint, message: '本机版本已上传，并已读回验证。', hasStrongETag: Boolean(verified.etag) };
  }

  async function synchronize(input, { mode = 'sync', manual = false, review = null, expectedConfig = undefined } = {}) {
    const local = validateImport(input);
    const localFingerprint = await webDAVStateFingerprint(local);
    const expected = expectedConfig === undefined ? null : validateWebDAVConfig(expectedConfig);
    if (!['sync', 'upload', 'download'].includes(mode)) fail('INVALID_MODE', '不支持的同步操作。');
    return serial(async () => {
      const record = await readRecord();
      // Compare inside the same lock as network synchronization. A different tab
      // may replace the endpoint after the UI checks it but before this lock.
      // The old UI's permission prompt must never authorize a different target.
      if (expected && (!record || Object.keys(DEFAULT_WEBDAV_CONFIG).some(key => record.config[key] !== expected[key]))) {
        return { status: 'config-changed', localFingerprint, message: 'WebDAV 连接在另一标签已更改，请重新确认。' };
      }
      if (!record?.config?.enabled) return { status: 'disabled', localFingerprint, message: 'WebDAV 同步未启用。' };
      if (!manual && (!record.config.autoSync || !record.baseline)) return {
        status: 'needs-initial-sync', localFingerprint, message: '请先完成一次手动同步，再开启自动同步。'
      };
      try {
        if (!await matchesLocal(localFingerprint)) return localChanged(localFingerprint);
        const remote = await readRemote(record.config);
        if (!await matchesLocal(localFingerprint)) return localChanged(localFingerprint);
        const existingReview = review ? reviews.get(review) : null;
        if (review && (!existingReview || now() - existingReview.at > REVIEW_LIFETIME_MS || existingReview.revision !== record.revision
          || existingReview.localFingerprint !== localFingerprint || existingReview.remoteFingerprint !== remote.fingerprint
          || existingReview.etag !== remote.etag || existingReview.exists !== remote.exists)) {
          return recordResult(record, rememberReview(record, local, localFingerprint, remote, 'review-stale'));
        }
        if (review && !manual) fail('REVIEW_REQUIRED', '确认冲突需要手动操作。');
        if (remote.exists && remote.fingerprint === localFingerprint) {
          await baseline(record, localFingerprint, remote, 'unchanged');
          return { status: 'unchanged', localFingerprint, message: '本机与远程内容一致。', hasStrongETag: Boolean(remote.etag) };
        }
        if (!remote.exists) {
          if (mode === 'download') return { status: 'missing', localFingerprint, message: '远程尚无备份可下载，本机数据未改变。' };
          if (record.baseline && !existingReview) return recordResult(record, rememberReview(record, local, localFingerprint, remote, 'remote-deleted'));
          if (!manual) return { status: 'needs-initial-sync', localFingerprint, message: '远程文件尚未创建，请手动同步确认创建。' };
          return await writeRemote(record, local, localFingerprint, remote);
        }
        if (existingReview) {
          reviews.delete(review);
          downloads.delete(review);
          if (mode === 'upload') return await writeRemote(record, local, localFingerprint, remote);
          if (mode === 'download') return downloadReady(record, localFingerprint, remote);
          return recordResult(record, rememberReview(record, local, localFingerprint, remote, 'both-changed'));
        }
        if (!record.baseline) {
          // Explicit download still returns a reviewable snapshot; no local mutation.
          if (mode === 'download' && manual) return downloadReady(record, localFingerprint, remote);
          return recordResult(record, rememberReview(record, local, localFingerprint, remote, 'first-sync'));
        }
        const localChangedSinceSync = record.baseline.localFingerprint !== localFingerprint;
        const remoteChangedSinceSync = record.baseline.remoteFingerprint !== remote.fingerprint;
        if (localChangedSinceSync && remoteChangedSinceSync) return recordResult(record, rememberReview(record, local, localFingerprint, remote, 'both-changed'));
        if (mode === 'download') return downloadReady(record, localFingerprint, remote);
        if (mode === 'upload' && remoteChangedSinceSync) return recordResult(record, rememberReview(record, local, localFingerprint, remote, 'remote-changed'));
        if (remoteChangedSinceSync) return downloadReady(record, localFingerprint, remote);
        return await writeRemote(record, local, localFingerprint, remote);
      } catch (error) {
        // Store only controlled error text; never server bodies, URLs, or credentials.
        const safeError = error instanceof WebDAVError ? error : new WebDAVError('SYNC_FAILED', '同步未完成，请检查本机存储与服务连接；现有数据已保留。');
        try { await store.set({ ...record, lastError: safeError.message, lastErrorAt: now(), lastAction: 'error' }); } catch { /* Preserve the actionable original error. */ }
        throw safeError;
      }
    });
  }

  async function completeDownload(result, savedState) {
    return serial(async () => {
      const pending = result?.status === 'download-ready' && downloads.get(result.review);
      const record = await readRecord();
      if (!pending || !record || pending.revision !== record.revision || now() - pending.at > REVIEW_LIFETIME_MS) {
        fail('DOWNLOAD_EXPIRED', '下载确认已过期或同步配置已变更。本机已保存的内容保留，请重新同步核对。');
      }
      const fingerprint = await webDAVStateFingerprint(savedState);
      if (fingerprint !== pending.remote.fingerprint) fail('DOWNLOAD_NOT_APPLIED', '本机内容与下载版本不一致，尚未记录为同步完成。');
      if (!await matchesLocal(fingerprint)) fail('LOCAL_CHANGED', '下载后本机内容又有变化，尚未记录为同步完成；请重新同步。');
      await baseline(record, fingerprint, pending.remote, 'downloaded');
      downloads.delete(result.review);
      reviews.delete(result.review);
      return { status: 'downloaded', localFingerprint: fingerprint, message: '远程版本已保存到本机，同步基准已更新。' };
    });
  }

  return { loadConfig, saveConfig, clearConfig, status, testConnection, synchronize, completeDownload };
}

const defaultWebDAVSync = createWebDAVSync();
export function loadWebDAVConfig() { return defaultWebDAVSync.loadConfig(); }
export function saveWebDAVConfig(config) { return defaultWebDAVSync.saveConfig(config); }
export function clearWebDAVConfig() { return defaultWebDAVSync.clearConfig(); }
export function getWebDAVStatus() { return defaultWebDAVSync.status(); }
export function testWebDAVConnection(config) { return defaultWebDAVSync.testConnection(config); }
export function syncWebDAV(state, options) { return defaultWebDAVSync.synchronize(state, options); }
export function completeWebDAVDownload(result, savedState) { return defaultWebDAVSync.completeDownload(result, savedState); }
