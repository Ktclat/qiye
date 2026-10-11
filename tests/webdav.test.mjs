import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATE, exportState, MAX_BACKUP_BYTES } from '../src/core.js';
import {
  createWebDAVSync, validateWebDAVConfig, webDAVTargetURL, webDAVOriginPattern,
  webDAVStateFingerprint, DEFAULT_WEBDAV_CONFIG, requestWebDAVPermission
} from '../src/webdav.js';

const clone = value => JSON.parse(JSON.stringify(value));
const config = { enabled: true, endpoint: 'https://dav.example.test/storage/', path: 'qiye.json',
  username: 'test-user', password: 'test-only-password', autoSync: true };

function harness({ remote = null, etags = true, fetchOverride, timeoutMs = 100 } = {}) {
  let record = null, local = clone(DEFAULT_STATE), document = remote ? clone(remote) : null, version = 1;
  const calls = [];
  const hook = {};
  function headers() { return etags ? { ETag: `"v${version}"` } : {}; }
  const server = {
    replace(value) { document = value ? clone(value) : null; version++; },
    get state() { return document ? clone(document) : null; },
    get etag() { return `"v${version}"`; }
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    if (fetchOverride) return fetchOverride(url, options, server);
    if (options.method === 'GET') {
      await hook.beforeGet?.(server);
      return document ? new Response(exportState(document), { status: 200, headers: headers() }) : new Response(null, { status: 404 });
    }
    if (options.method === 'PUT') {
      await hook.beforePut?.(server, options);
      if ((options.headers['If-None-Match'] === '*' && document) ||
        (options.headers['If-Match'] && (document === null || options.headers['If-Match'] !== server.etag))) {
        return new Response(null, { status: 412 });
      }
      const existed = document !== null;
      server.replace(JSON.parse(options.body));
      await hook.afterPut?.(server);
      return new Response(null, { status: existed ? 204 : 201, headers: headers() });
    }
    throw new Error('Unexpected method');
  };
  const client = createWebDAVSync({
    fetchImpl, timeoutMs, permissionCheck: async () => {},
    currentState: async () => clone(local),
    store: { get: async () => record ? clone(record) : null,
      set: async value => { record = clone(value); }, remove: async () => { record = null; } },
    lock: operation => operation()
  });
  return { client, server, calls, hook, get local() { return clone(local); },
    setLocal(value) { local = clone(value); }, get record() { return record ? clone(record) : null; } };
}

async function established(options) {
  const h = harness(options);
  await h.client.saveConfig(config);
  const result = await h.client.synchronize(h.local, { manual: true });
  assert.equal(result.status, 'uploaded');
  return h;
}

test('WebDAV config rejects unsafe credentials-in-URL, HTTP, fragments and traversal', () => {
  for (const endpoint of ['http://dav.example.test/', 'https://u:p@dav.example.test/', 'https://dav.example.test/?token=secret',
    'https://dav.example.test/#x', 'ftp://dav.example.test/', 'https://dav.example.test/a/../b/',
    'https://dav.example.test/%2e%2e/', 'https://dav.example.test/a\\b/']) {
    assert.throws(() => validateWebDAVConfig({ ...config, endpoint }));
  }
  for (const path of ['../qiye.json', '/qiye.json', 'a//qiye.json', 'a/%2f/qiye.json', '%252e%252e/qiye.json',
    'qiye.json?token=x', 'qiye.html', 'https://other.example/qiye.json']) {
    assert.throws(() => validateWebDAVConfig({ ...config, path }));
  }
  assert.throws(() => validateWebDAVConfig({ ...config, username: 'bad:user' }));
});

test('only explicit localhost HTTP exceptions; encoded relative paths remain stable', () => {
  assert.equal(webDAVTargetURL({ ...config, endpoint: 'http://localhost:8080/dav', path: '栖页/备份.json' }),
    'http://localhost:8080/dav/%E6%A0%96%E9%A1%B5/%E5%A4%87%E4%BB%BD.json');
  assert.equal(webDAVOriginPattern({ ...config, endpoint: 'http://127.0.0.1:8080/' }), 'http://127.0.0.1:8080/*');
  assert.equal(webDAVOriginPattern({ ...config, endpoint: 'https://nas.example.test:5006/dav/' }), 'https://nas.example.test:5006/*');
  const checked = validateWebDAVConfig({ ...config, path: '我的备份.json' });
  assert.deepEqual(validateWebDAVConfig(checked), checked);
});

test('config save and connection tests never create a file or a sync baseline', async () => {
  const h = harness();
  await h.client.saveConfig(config);
  assert.equal(h.calls.length, 0);
  const result = await h.client.testConnection(config);
  assert.equal(result.status, 'empty');
  assert.match(result.message, /404/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'GET');
  assert.equal((await h.client.status()).hasBaseline, false);
  assert.equal(h.server.state, null);
});

test('testing an unsaved config does not store credentials', async () => {
  const h = harness();
  await h.client.testConnection(config);
  assert.equal(h.record, null);
  assert.deepEqual(await h.client.loadConfig(), DEFAULT_WEBDAV_CONFIG);
});

test('automatic sync never initializes or creates the remote file', async () => {
  const h = harness();
  await h.client.saveConfig(config);
  assert.equal((await h.client.synchronize(h.local)).status, 'needs-initial-sync');
  assert.equal(h.calls.length, 0);
});

test('manual first sync creates with If-None-Match and verifies the written data', async () => {
  const h = await established();
  assert.deepEqual(h.calls.map(call => call.method), ['GET', 'PUT', 'GET']);
  const request = h.calls[1];
  assert.equal(request.headers['If-None-Match'], '*');
  assert.equal(request.headers['If-Match'], undefined);
  assert.equal(request.redirect, 'error');
  assert.equal(request.credentials, 'omit');
  assert.equal(request.referrerPolicy, 'no-referrer');
  assert.equal((await h.client.status()).hasBaseline, true);
});

test('credentials remain local and are excluded from remote body, backups and status', async () => {
  const h = await established();
  assert.equal(h.record.config.password, config.password);
  const sent = h.calls.find(call => call.method === 'PUT');
  assert.equal(sent.headers.Authorization, `Basic ${Buffer.from('test-user:test-only-password').toString('base64')}`);
  for (const serialized of [sent.body, exportState(h.local), JSON.stringify(await h.client.status())]) {
    assert.equal(serialized.includes('test-only-password'), false);
    assert.equal(serialized.includes('test-user'), false);
    assert.equal(serialized.includes('Authorization'), false);
  }
});

test('first sync with differing existing remote is a review, without a PUT', async () => {
  const remote = { ...clone(DEFAULT_STATE), notes: 'other device' };
  const h = harness({ remote });
  await h.client.saveConfig(config);
  const result = await h.client.synchronize(h.local, { manual: true });
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'first-sync');
  assert.equal(result.remoteState.notes, 'other device');
  assert.ok(result.review);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0);
  assert.equal((await h.client.status()).hasBaseline, false);
});

test('same content on different local updatedAt revisions does not upload repeatedly', async () => {
  const h = await established();
  h.setLocal({ ...h.local, updatedAt: 123456 });
  const result = await h.client.synchronize(h.local);
  assert.equal(result.status, 'unchanged');
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
});

test('local-only change auto uploads using a strong If-Match precondition', async () => {
  const h = await established();
  const previousETag = h.server.etag;
  h.setLocal({ ...h.local, notes: 'saved new note', updatedAt: 88 });
  const result = await h.client.synchronize(h.local);
  assert.equal(result.status, 'uploaded');
  const lastPut = h.calls.filter(call => call.method === 'PUT').at(-1);
  assert.equal(lastPut.headers['If-Match'], previousETag);
  assert.equal(lastPut.headers['If-None-Match'], undefined);
  assert.equal(h.server.state.notes, 'saved new note');
});

test('remote-only change returns a download without overwriting local storage', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'remote change', updatedAt: 50 });
  const result = await h.client.synchronize(h.local);
  assert.equal(result.status, 'download-ready');
  assert.equal(result.state.notes, 'remote change');
  assert.notEqual(h.local.notes, 'remote change');
  assert.equal((await h.client.status()).lastAction, 'uploaded');
  h.setLocal({ ...result.state, updatedAt: 70 });
  assert.equal((await h.client.completeDownload(result, h.local)).status, 'downloaded');
  assert.equal((await h.client.synchronize(h.local)).status, 'unchanged');
});

test('download cannot be marked complete before it is applied to actual local storage', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'remote' });
  const result = await h.client.synchronize(h.local);
  await assert.rejects(h.client.completeDownload(result, h.local), { code: 'DOWNLOAD_NOT_APPLIED' });
  await assert.rejects(h.client.completeDownload(result, result.state), { code: 'LOCAL_CHANGED' });
  assert.equal((await h.client.status()).lastAction, 'uploaded');
});

test('a reviewed download rechecks both versions then applies and acknowledges without a false conflict', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'review this download', updatedAt: 101 });
  const first = await h.client.synchronize(h.local);
  assert.equal(first.status, 'download-ready');
  const checked = await h.client.synchronize(h.local, { manual: true, mode: 'download', review: first.review });
  assert.equal(checked.status, 'download-ready');
  assert.notEqual(checked.review, first.review);
  h.setLocal({ ...checked.state, updatedAt: 102 });
  assert.equal((await h.client.completeDownload(checked, h.local)).status, 'downloaded');
  assert.equal((await h.client.synchronize(h.local)).status, 'unchanged');
});

test('both-device changes require review and keep both originals', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'server edit' });
  h.setLocal({ ...h.local, notes: 'local edit' });
  const result = await h.client.synchronize(h.local);
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'both-changed');
  assert.equal(h.local.notes, 'local edit');
  assert.equal(h.server.state.notes, 'server edit');
});

test('reviewed upload binds the remote ETag and explicit local snapshot', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'server edit' });
  h.setLocal({ ...h.local, notes: 'local choice' });
  const conflict = await h.client.synchronize(h.local, { manual: true });
  const reviewedETag = h.server.etag;
  const result = await h.client.synchronize(h.local, { manual: true, mode: 'upload', review: conflict.review });
  assert.equal(result.status, 'uploaded');
  assert.equal(h.calls.filter(call => call.method === 'PUT').at(-1).headers['If-Match'], reviewedETag);
  assert.equal(h.server.state.notes, 'local choice');
});

test('a stale remote review never overwrites the changed remote', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'server first' });
  h.setLocal({ ...h.local, notes: 'local choice' });
  const conflict = await h.client.synchronize(h.local, { manual: true });
  h.server.replace({ ...h.local, notes: 'server newer' });
  const result = await h.client.synchronize(h.local, { manual: true, mode: 'upload', review: conflict.review });
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'review-stale');
  assert.equal(h.server.state.notes, 'server newer');
});

test('a changed local review requires comparing again', async () => {
  const h = await established();
  h.server.replace({ ...h.local, notes: 'server' });
  h.setLocal({ ...h.local, notes: 'local first' });
  const conflict = await h.client.synchronize(h.local, { manual: true });
  h.setLocal({ ...h.local, notes: 'local newer' });
  const result = await h.client.synchronize(h.local, { manual: true, mode: 'download', review: conflict.review });
  assert.equal(result.reason, 'review-stale');
  assert.equal(h.local.notes, 'local newer');
});

test('ETag race between GET and PUT gives 412 and a fresh conflict', async () => {
  const h = await established();
  h.setLocal({ ...h.local, notes: 'local upload' });
  h.hook.beforePut = server => server.replace({ ...h.local, notes: 'concurrent device' });
  const result = await h.client.synchronize(h.local, { manual: true });
  assert.equal(result.status, 'conflict');
  assert.equal(result.reason, 'write-conflict');
  assert.equal(result.remoteState.notes, 'concurrent device');
  assert.equal(h.server.state.notes, 'concurrent device');
});

test('concurrent first creators cannot overwrite each other after a 404', async () => {
  const h = harness();
  await h.client.saveConfig(config);
  h.hook.beforePut = server => server.replace({ ...h.local, notes: 'other creator' });
  const result = await h.client.synchronize(h.local, { manual: true });
  assert.equal(result.reason, 'write-conflict');
  assert.equal(h.server.state.notes, 'other creator');
  assert.equal((await h.client.status()).hasBaseline, false);
});

test('missing strong ETag permits reads but rejects existing-file overwrite', async () => {
  const h = await established({ etags: false });
  h.setLocal({ ...h.local, notes: 'local changes' });
  await assert.rejects(h.client.synchronize(h.local, { manual: true }), { code: 'NO_STRONG_ETAG' });
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal((await h.client.testConnection(config)).hasStrongETag, false);
});

test('weak ETags are not accepted as write preconditions', async () => {
  const remote = { ...clone(DEFAULT_STATE), notes: 'existing' };
  const h = harness({ fetchOverride: async () => new Response(exportState(remote), { headers: { ETag: 'W/"weak"' } }) });
  await h.client.saveConfig(config);
  const conflict = await h.client.synchronize(h.local, { manual: true });
  await assert.rejects(h.client.synchronize(h.local, { manual: true, mode: 'upload', review: conflict.review }), { code: 'NO_STRONG_ETAG' });
  assert.equal(h.calls.every(call => call.method === 'GET'), true);
});

test('deleted remote needs explicit review before recreation', async () => {
  const h = await established();
  h.server.replace(null);
  const result = await h.client.synchronize(h.local);
  assert.equal(result.reason, 'remote-deleted');
  assert.equal(h.server.state, null);
  const recreated = await h.client.synchronize(h.local, { manual: true, mode: 'upload', review: result.review });
  assert.equal(recreated.status, 'uploaded');
  assert.equal(h.calls.filter(call => call.method === 'PUT').at(-1).headers['If-None-Match'], '*');
});

test('redirect responses and changed response URLs are rejected without following', async () => {
  for (const makeResponse of [
    () => new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }),
    () => { const response = new Response(exportState(DEFAULT_STATE)); Object.defineProperty(response, 'url', { value: 'https://other.example/qiye.json' }); return response; }
  ]) {
    const h = harness({ fetchOverride: async () => makeResponse() });
    await assert.rejects(h.client.testConnection(config), { code: 'REDIRECT_REJECTED' });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].redirect, 'error');
  }
});

test('remote JSON validation and size limits prevent incompatible data from being applied', async () => {
  const invalid = harness({ fetchOverride: async () => new Response('{"password":"server-secret","schemaVersion":999}') });
  await assert.rejects(invalid.client.testConnection(config), error => error.code === 'INVALID_REMOTE' && !error.message.includes('server-secret'));
  const oversized = harness({ fetchOverride: async () => new Response('{}', { headers: { 'Content-Length': String(MAX_BACKUP_BYTES + 1) } }) });
  await assert.rejects(oversized.client.testConnection(config), { code: 'REMOTE_TOO_LARGE' });
  const partial = harness({ fetchOverride: async () => new Response('{}', { status: 206 }) });
  await assert.rejects(partial.client.testConnection(config), { code: 'HTTP_206' });
});

test('an HTTP error never exposes the response body and never marks sync completed', async () => {
  const h = harness({ fetchOverride: async () => new Response('do not echo server-secret', { status: 403 }) });
  await h.client.saveConfig(config);
  await assert.rejects(h.client.synchronize(h.local, { manual: true }), error => error.code === 'HTTP_403' && !error.message.includes('server-secret'));
  const status = await h.client.status();
  assert.equal(status.hasBaseline, false);
  assert.equal(status.lastAction, 'error');
  assert.match(status.lastError, /拒绝访问/);
});

test('PUT acceptance without a matching read-back is not reported as successful sync', async () => {
  const h = harness();
  await h.client.saveConfig(config);
  h.hook.afterPut = server => server.replace({ ...h.local, notes: 'later writer' });
  const result = await h.client.synchronize(h.local, { manual: true });
  assert.equal(result.reason, 'after-write-changed');
  assert.equal((await h.client.status()).hasBaseline, false);
  assert.equal(h.local.notes, DEFAULT_STATE.notes);
});

test('stale caller snapshot and changes during GET both stop before PUT', async () => {
  const h = await established();
  const stale = h.local;
  h.setLocal({ ...h.local, notes: 'latest local' });
  const before = h.calls.length;
  assert.equal((await h.client.synchronize(stale, { manual: true })).status, 'local-changed');
  assert.equal(h.calls.length, before);
  h.hook.beforeGet = () => { h.setLocal({ ...h.local, notes: 'typed while waiting' }); };
  assert.equal((await h.client.synchronize(h.local, { manual: true })).status, 'local-changed');
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
});

test('a new local edit during PUT remains unsynced and uploads on the next sync', async () => {
  const h = await established();
  h.setLocal({ ...h.local, notes: 'first saved note' });
  h.hook.beforePut = () => { h.setLocal({ ...h.local, notes: 'newer local note' }); };
  const result = await h.client.synchronize(h.local);
  assert.equal(result.status, 'uploaded');
  assert.equal(h.local.notes, 'newer local note');
  assert.equal(h.server.state.notes, 'first saved note');
  delete h.hook.beforePut;
  assert.equal((await h.client.synchronize(h.local)).status, 'uploaded');
  assert.equal(h.server.state.notes, 'newer local note');
});

test('config identity changes clear baseline; toggle changes preserve it; clear deletes credentials', async () => {
  const h = await established();
  await h.client.saveConfig({ ...config, autoSync: false });
  assert.equal((await h.client.status()).hasBaseline, true);
  await h.client.saveConfig({ ...config, path: 'another.json' });
  assert.equal((await h.client.status()).hasBaseline, false);
  await h.client.clearConfig();
  assert.equal(h.record, null);
  assert.deepEqual(await h.client.loadConfig(), DEFAULT_WEBDAV_CONFIG);
});

test('an expected config from another tab cannot authorize syncing a changed endpoint', async () => {
  const h = harness();
  await h.client.saveConfig(config);
  await h.client.saveConfig({ ...config, endpoint: 'https://new-server.example.test/dav/' });
  const changed = await h.client.synchronize(h.local, { manual: true, expectedConfig: config });
  assert.equal(changed.status, 'config-changed');
  assert.equal(h.calls.length, 0);
  await h.client.clearConfig();
  const cleared = await h.client.synchronize(h.local, { manual: true, expectedConfig: config });
  assert.equal(cleared.status, 'config-changed');
  assert.equal(h.calls.length, 0);
});

test('network errors distinguish browser CORS/endpoint problems without leaking fetch internals', async () => {
  const h = harness({ fetchOverride: async () => { throw new TypeError('secret-token from failed URL'); } });
  await assert.rejects(h.client.testConnection(config), error => error.code === 'NETWORK_ERROR' && /CORS/.test(error.message) && !error.message.includes('secret-token'));
});

test('request timeout is finite and does not create a baseline', async () => {
  const h = harness({ timeoutMs: 10, fetchOverride: async (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }) });
  await h.client.saveConfig(config);
  await assert.rejects(h.client.synchronize(h.local, { manual: true }), { code: 'TIMEOUT' });
  assert.equal((await h.client.status()).hasBaseline, false);
});

test('permission request is made synchronously in the current user gesture for only the configured origin', async () => {
  const previous = globalThis.chrome;
  const seen = [];
  globalThis.chrome = { permissions: { request(descriptor, callback) { seen.push(descriptor); callback(true); } } };
  try {
    const granted = requestWebDAVPermission(config);
    assert.deepEqual(seen, [{ origins: ['https://dav.example.test/*'] }]);
    assert.equal(await granted, true);
  } finally { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; }
});

test('fingerprint compares validated content and rejects credentials added to a backup', async () => {
  const a = clone(DEFAULT_STATE), b = { ...a, updatedAt: 123 };
  assert.equal(await webDAVStateFingerprint(a), await webDAVStateFingerprint(b));
  await assert.rejects(webDAVStateFingerprint({ ...a, webdav: { password: 'secret' } }));
});
