import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canVisitForFavicon, readCachedTabIcon, visitForFavicon } from '../src/tab-favicon.js';

const png = await readFile(new URL('../icons/icon32.png', import.meta.url));
const runtime = { id: 'a'.repeat(32), getURL: path => `chrome-extension://${'a'.repeat(32)}${path}` };
function event() {
  const listeners = new Set();
  return { listeners, addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn), emit: value => [...listeners].forEach(fn => fn(value)) };
}
function fixture(extra = {}) {
  const opened = [], reads = [], onActivated = event(), onRemoved = event();
  const browser = { runtime, tabs: { onActivated, onRemoved,
    getCurrent: async () => ({ id: 1 }),
    create: async options => { opened.push(options); return { id: 2 }; },
    get: async id => id === 1 ? { id, active: false } : { id, active: true },
  } };
  let ready;
  const waiting = new Promise(resolve => { ready = resolve; });
  const readIcon = async url => {
    reads.push(url);
    return { dataUrl: url.includes('.invalid') ? 'default' : 'site-image', width: 32, height: 32 };
  };
  const options = { browser, readIcon, retryMs: 1, timeoutMs: 1000, onWaiting: phase => { if (phase === 'visit') ready(); }, ...extra };
  const clean = () => { assert.equal(onActivated.listeners.size, 0); assert.equal(onRemoved.listeners.size, 0); };
  return { browser, opened, reads, waiting, options, clean, onActivated, onRemoved };
}

test('web capability detection requires a real extension runtime and tab APIs', () => {
  assert.equal(canVisitForFavicon(), false);
  assert.equal(canVisitForFavicon({ runtime, tabs: {} }), false);
  assert.equal(canVisitForFavicon(fixture().browser), true);
});

test('a visit opens the full user URL, waits for return, then reads only local favicon cache', async () => {
  const f = fixture(), url = 'http://localhost:8123/account?view=home#card';
  const pending = visitForFavicon(url, f.options);
  await f.waiting;
  assert.deepEqual(f.opened, [{ url, active: true, openerTabId: 1 }]);
  assert.deepEqual(f.reads, [], 'do not capture a login/challenge icon before the user returns');
  f.onActivated.emit({ tabId: 99 });
  assert.deepEqual(f.reads, [], 'unrelated tabs are ignored');
  f.onActivated.emit({ tabId: 1 });
  const result = await pending;
  assert.equal(result.dataUrl, 'site-image'); assert.equal(result.pageUrl, url);
  assert.deepEqual(f.reads, ['https://qiye-no-favicon.invalid/', url]); f.clean();
});

test('a permitted redirect uses the visited tab final URL without querying all tabs', async () => {
  const f = fixture();
  f.browser.tabs.get = async id => id === 1 ? { active: false } : { url: 'https://destination.example/new' };
  const pending = visitForFavicon('https://start.example/', f.options); await f.waiting;
  f.onActivated.emit({ tabId: 1 });
  await pending; assert.equal(f.reads[1], 'https://destination.example/new'); f.clean();
});

test('closing the visit can still capture its cached icon', async () => {
  const f = fixture();
  const pending = visitForFavicon('https://example.com/', f.options); await f.waiting;
  f.browser.tabs.get = async () => { throw new Error('No tab'); };
  f.onRemoved.emit(2); assert.equal((await pending).dataUrl, 'site-image'); f.clean();
});

test('generic browser fallback is never offered as a captured site icon', async () => {
  let reads = 0;
  const f = fixture({ readIcon: async () => { reads++; return { dataUrl: 'generic' }; } });
  const pending = visitForFavicon('https://example.com/', f.options); await f.waiting;
  f.onActivated.emit({ tabId: 1 });
  await assert.rejects(pending, /还没有这个网站的图标/); assert.equal(reads, 12); f.clean();
});

test('favicon database updates after return are retried with a fixed bound', async () => {
  let attempts = 0;
  const f = fixture({ readIcon: async url => ({ dataUrl: url.includes('.invalid') || ++attempts < 3 ? 'generic' : 'actual' }) });
  const pending = visitForFavicon('https://example.com/', f.options); await f.waiting;
  f.onActivated.emit({ tabId: 1 }); assert.equal((await pending).dataUrl, 'actual'); assert.equal(attempts, 3); f.clean();
});

test('cancel and source-tab closure stop listeners without closing the visited website', async () => {
  for (const source of ['signal', 'tab']) {
    const controller = new AbortController(), f = fixture({ signal: controller.signal });
    const pending = visitForFavicon('https://example.com/', f.options); await f.waiting;
    if (source === 'signal') controller.abort(); else f.onRemoved.emit(1);
    await assert.rejects(pending, { name: 'AbortError' }); assert.deepEqual(f.reads, []); f.clean();
  }
});

test('cancellation during a read rejects and discards a late successful response', async () => {
  let complete, started;
  const reading = new Promise(resolve => { started = resolve; });
  const controller = new AbortController();
  const f = fixture({ signal: controller.signal, readIcon: async url => {
    if (url.includes('.invalid')) return { dataUrl: 'generic' };
    started(); return new Promise(resolve => { complete = resolve; });
  } });
  const pending = visitForFavicon('https://example.com/', f.options); await f.waiting;
  f.onActivated.emit({ tabId: 1 }); await reading; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); complete({ dataUrl: 'late' }); f.clean();
});

test('timeout releases listeners and leaves no long-lived background capture', async () => {
  const f = fixture({ timeoutMs: 15 });
  await assert.rejects(visitForFavicon('https://example.com/', f.options), /超时/); f.clean();
});

test('invalid URLs, web callers and pre-canceled requests never open a tab', async () => {
  const f = fixture();
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com/', 'https://example.com/\nunsafe']) {
    await assert.rejects(visitForFavicon(url, f.options), /有效/);
  }
  await assert.rejects(visitForFavicon('https://example.com/', { browser: {} }), /扩展版/);
  await assert.rejects(visitForFavicon('https://example.com/', { ...f.options, signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(f.opened.length, 0); f.clean();
});

test('tab-creation failure is reported without registering watchers', async () => {
  const f = fixture(); f.browser.tabs.create = async () => { throw new Error('Tab creation failed'); };
  await assert.rejects(visitForFavicon('https://example.com/', f.options), /Tab creation failed/); f.clean();
});

test('cache reader uses only its own extension service and preserves PNG resolution', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response(png); };
  try {
    const image = await readCachedTabIcon('https://example.com/private?view=1', { runtime });
    assert.equal(image.dataUrl, `data:image/png;base64,${png.toString('base64')}`);
    assert.equal(image.width, 32); assert.equal(image.height, 32);
    const url = new URL(calls[0].url);
    assert.equal(url.protocol, 'chrome-extension:'); assert.equal(url.hostname, runtime.id);
    assert.equal(url.searchParams.get('pageUrl'), 'https://example.com/private?view=1');
    assert.equal(calls[0].options.cache, 'no-store');
    await assert.rejects(readCachedTabIcon('https://example.com/', { runtime: { ...runtime, getURL: () => 'https://example.com/icon' } }), /无法读取/);
    assert.equal(calls.length, 1, 'never fetch an arbitrary remote fallback');
  } finally { globalThis.fetch = original; }
});

test('cache reader rejects oversized, malformed and failed image responses', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('not png'), new Response(new Uint8Array(300_000)), new Response('', { status: 404 })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(readCachedTabIcon('https://example.com/', { runtime }));
    }
  } finally { globalThis.fetch = original; }
});
