import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId = 0;
const flush = () => new Promise(resolve => setImmediate(resolve));
const htmlResponse = html => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/manifest+json' } });
const runtime = { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path.replace(/^\//, '')}` };

async function setup(t, { fetchImpl, chrome, initialCache, waitForCache = true } = {}) {
  const records = new Map(initialCache ? [['qiye.favicons.local.v1', JSON.stringify(initialCache)]] : []);
  const written = [];
  const replacements = {
    fetch: fetchImpl || (async () => { throw new TypeError('network blocked'); }),
    chrome,
    localStorage: { getItem: key => records.get(key) ?? null, setItem: (key, value) => { records.set(key, value); written.push(key); } },
    DOMParser: class { constructor() { throw new Error('Remote HTML must never become DOM'); } },
  };
  const original = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(async () => {
    await flush();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const api = await import(`../src/favicons.js?test=${++moduleId}`);
  if (waitForCache) await api.faviconCacheReady;
  return { api, records, written };
}

test('candidates use site-owned HTTPS endpoints and reject local, credentialed, or executable URLs', async t => {
  const { api } = await setup(t);
  assert.deepEqual(api.getFaviconCandidates('http://example.com/app?token=secret#private'), [
    'https://example.com/favicon.svg', 'https://example.com/apple-touch-icon.png', 'https://example.com/favicon.ico',
  ]);
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'file:///tmp/a.html', 'https://user:password@example.com/', 'https://example.com:8443/', 'https://localhost/', 'https://foo.local/', 'https://router.home/', 'https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://169.254.169.254/', 'https://10.0.0.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://example.com\\@localhost/', 'https://example.com/\nprivate']) {
    assert.deepEqual(api.getFaviconCandidates(url), [], url);
    const result = await api.discoverFavicon(url);
    assert.equal(result.url, null, url);
    assert.match(result.warning, /公开网站/, url);
  }
});

test('actual HTML parsing handles relative base URLs, rel tokens, entities, sizes, and inert text', async t => {
  let request;
  const { api } = await setup(t, { fetchImpl: async (url, options) => {
    request = { url, options };
    return htmlResponse(`<!doctype html><html><head>
      <base href="/assets/"><base href="https://ignored.example.com/">
      <!-- <link rel="icon" sizes="any" href="https://comment.example.com/bad.svg"> -->
      <script>const x = '<link rel="icon" href="/script.svg">'; '</scriptx><link rel="icon" href="/still-script.svg">';</script>
      <template><link rel="icon" href="/template.svg"><template><link rel="icon" href="/nested.svg"></template></template>
      <style>/* <link rel="icon" href="/style.svg"> */</style>
      <link rel="shortcut ICON" sizes="16x16 32x32" href="/small.ico">
      <LINK REL='icon' SIZES='any' TYPE='image/svg+xml' HREF='logos/mark.svg?a=1&amp;b=2' href='/ignored-duplicate.svg'>
      <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example.com/large.png">
      <link rel="icon" href="javascript:alert(1)"><link rel="icon" href="https://user:secret@example.com/icon.png">
      </head><body><link rel="icon" href="/body.svg"></body></html>`);
  } });
  const result = await api.discoverFavicon('https://example.com/app/page?token=secret#private');
  assert.equal(request.url, 'https://example.com/app/page');
  assert.equal(result.url, 'https://example.com/assets/logos/mark.svg?a=1&b=2');
  assert.deepEqual(result.candidates.slice(0, 3), [result.url, 'https://cdn.example.com/large.png', 'https://example.com/small.ico']);
  assert.equal(result.source, 'html');
  assert.equal(result.warning, undefined);
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.redirect, 'manual');
  assert.equal(request.options.mode, 'cors');
  assert.equal(request.options.headers.Authorization, undefined);
});

test('small HTML icons are upgraded from a same-origin manifest with safe relative image URLs', async t => {
  const requested = [];
  const { api } = await setup(t, { fetchImpl: async url => {
    requested.push(url);
    if (requested.length === 1) return htmlResponse('<link rel="icon" sizes="16x16" href="/small.ico"><link rel="manifest" href="/app/site.webmanifest?token=ignored#part">');
    return jsonResponse({ icons: [
      { src: '../images/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'https://cdn.example.com/icon-64.png', sizes: '64x64' },
      { src: 'https://cdn.example.com/mono.svg', sizes: 'any', purpose: 'monochrome' },
      { src: 'https://192.168.1.1/private.svg', sizes: 'any' },
      { src: 'data:image/svg+xml,<svg/>', sizes: 'any' },
      { src: 'https://cdn.example.com/script', type: 'application/javascript', sizes: 'any' },
    ] });
  } });
  const result = await api.discoverFavicon('https://example.com/app/page', { targetSize: 64, pixelRatio: 2 });
  assert.deepEqual(requested, ['https://example.com/app/page', 'https://example.com/app/site.webmanifest']);
  assert.equal(result.url, 'https://example.com/images/icon-192.png');
  assert.equal(result.source, 'manifest');
  assert.ok(result.candidates.includes('https://cdn.example.com/icon-64.png'));
  assert.ok(!result.candidates.some(url => /private|mono|script|data:/.test(url)));
});

test('adequate HTML icons avoid extra manifest requests and cross-origin manifests are not fetched', async t => {
  const calls = [];
  const { api } = await setup(t, { fetchImpl: async url => {
    calls.push(url);
    return htmlResponse(url.includes('/adequate')
      ? '<link rel=icon sizes=192x192 href=/large.png><link rel=manifest href=/app.webmanifest>'
      : '<link rel=manifest href=https://other.example.com/app.webmanifest>');
  } });
  assert.equal((await api.discoverFavicon('https://example.com/adequate')).url, 'https://example.com/large.png');
  assert.match((await api.discoverFavicon('https://example.com/other')).warning, /未声明/);
  assert.deepEqual(calls, ['https://example.com/adequate', 'https://example.com/other']);
});

test('duplicate declarations remain unique and conventional paths plus Chrome stay available after many icons', async t => {
  const { api } = await setup(t, {
    chrome: { runtime, permissions: { contains: async () => true } },
    fetchImpl: async () => htmlResponse(Array.from({ length: 30 }, (_, i) => `<link rel=icon sizes=192x192 href=/icon-${i % 15}.png>`).join('')),
  });
  const result = await api.discoverFavicon('https://example.com/?secret=value');
  assert.equal(new Set(result.candidates).size, result.candidates.length);
  assert.ok(result.candidates.length <= 12);
  assert.deepEqual(result.candidates.slice(-4, -1), ['https://example.com/favicon.svg', 'https://example.com/apple-touch-icon.png', 'https://example.com/favicon.ico']);
  const chromeUrl = new URL(result.candidates.at(-1));
  assert.equal(chromeUrl.protocol, 'chrome-extension:');
  assert.equal(chromeUrl.searchParams.get('pageUrl'), 'https://example.com/');
  assert.equal(chromeUrl.searchParams.get('size'), '64');
  assert.equal(api.rememberFavicon('https://example.com/', chromeUrl.href), false);
  api.rememberFavicon('https://example.com/', 'https://cdn.example.com/legacy-working.png');
  const legacyPreferred = api.getFaviconCandidates('https://example.com/');
  assert.equal(legacyPreferred.length, 12);
  assert.equal(legacyPreferred[0], 'https://cdn.example.com/legacy-working.png');
  assert.equal(legacyPreferred.at(-1), chromeUrl.href, 'adding an older preferred image cannot evict the reserved Chrome fallback');
});

test('concurrent extraction coalesces; successful declarations have a seven-day TTL', async t => {
  let release;
  let calls = 0;
  let now = Date.now();
  const actualNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = actualNow; });
  const { api } = await setup(t, { fetchImpl: async () => {
    calls++;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return htmlResponse('<link rel=icon href=/logo.svg>');
  } });
  const a = api.discoverFavicon('https://example.com/');
  const b = api.discoverFavicon('https://example.com/', { force: true });
  assert.equal(a, b);
  await flush();
  assert.equal(calls, 1);
  release();
  await a;
  assert.equal((await api.discoverFavicon('https://example.com/')).source, 'cache');
  assert.equal(calls, 1);
  now += 7 * 24 * 60 * 60 * 1000 + 1;
  await api.discoverFavicon('https://example.com/');
  assert.equal(calls, 2);
});

test('CORS failures produce a sanitized fallback and ten-minute negative cache, with explicit retry', async t => {
  let calls = 0;
  let now = Date.now();
  const actualNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = actualNow; });
  const { api } = await setup(t, { fetchImpl: async () => { calls++; throw new TypeError('secret endpoint authorization token=abc'); } });
  const result = await api.discoverFavicon('https://example.com/');
  assert.equal(result.url, 'https://example.com/favicon.svg');
  assert.ok(result.candidates.includes('https://example.com/favicon.ico'));
  assert.match(result.warning, /CORS/);
  assert.doesNotMatch(result.warning, /secret|abc/);
  await api.discoverFavicon('https://example.com/');
  assert.equal(calls, 1);
  await api.discoverFavicon('https://example.com/', { force: true });
  assert.equal(calls, 2);
  now += 10 * 60 * 1000 + 1;
  await api.discoverFavicon('https://example.com/');
  assert.equal(calls, 3);
});

test('successful image cache persists separately, strips page queries, and rejects unsafe stored entries', async t => {
  const now = Date.now();
  const { api, records, written } = await setup(t, { initialCache: { version: 1, entries: [
    { pageUrl: 'https://example.com/', preferred: 'https://cdn.example.com/cached.png', candidates: ['https://localhost/private.svg', 'chrome-extension://test-extension/_favicon/', 'https://example.com/good.png'], loadedAt: now, checkedAt: now },
    { pageUrl: 'https://localhost/', preferred: 'https://example.com/private.png', loadedAt: now },
    { pageUrl: 'https://future.example.com/', preferred: 'https://example.com/future.png', loadedAt: now + 99_999_999 },
  ] } });
  assert.equal(api.getFaviconCandidates('https://example.com/?secret=1')[0], 'https://cdn.example.com/cached.png');
  assert.deepEqual(api.getFaviconCandidates('https://future.example.com/'), ['https://future.example.com/favicon.svg', 'https://future.example.com/apple-touch-icon.png', 'https://future.example.com/favicon.ico']);
  assert.equal(api.rememberFavicon('https://example.com/?secret=2#fragment', 'https://cdn.example.com/new.png'), true);
  assert.equal(api.rememberFavicon('https://example.com/', 'https://user:secret@example.com/x.png'), false);
  await flush();
  const persisted = JSON.parse(records.get('qiye.favicons.local.v1'));
  assert.deepEqual([...new Set(written)], ['qiye.favicons.local.v1']);
  assert.equal(persisted.entries.length, 1);
  assert.equal(persisted.entries[0].pageUrl, 'https://example.com/');
  assert.equal(persisted.entries[0].preferred, 'https://cdn.example.com/new.png');
  assert.doesNotMatch(JSON.stringify(persisted), /secret|chrome-extension|localhost/);
});

test('user-gesture permission request starts before cache initialization completes, and denial never fetches HTML', async t => {
  let finishCache;
  const requested = [];
  let fetches = 0;
  const { api } = await setup(t, {
    waitForCache: false,
    chrome: {
      runtime,
      storage: { local: { get: () => new Promise(resolve => { finishCache = resolve; }), set: async () => {} } },
      permissions: { request: options => { requested.push(options); return Promise.resolve(false); } },
    },
    fetchImpl: async () => { fetches++; return htmlResponse('<link rel=icon href=/icon.svg>'); },
  });
  const resultPromise = api.discoverFavicon('https://example.com/app?secret=1', { requestPermission: true, force: true });
  assert.deepEqual(requested, [{ origins: ['https://example.com/*'] }]);
  finishCache({});
  assert.match((await resultPromise).warning, /尚未允许/);
  assert.equal(fetches, 0);
});

test('granted origin permission permits extraction, while revoked permission blocks cached HTML fetches', async t => {
  const calls = [];
  let allowed = true;
  const { api } = await setup(t, {
    chrome: { runtime, permissions: { request: options => { calls.push(options); return Promise.resolve(allowed); }, contains: async () => allowed } },
    fetchImpl: async () => htmlResponse('<link rel=icon href=/icon.svg>'),
  });
  assert.equal((await api.discoverFavicon('https://example.com/', { requestPermission: true })).source, 'html');
  assert.deepEqual(calls, [{ origins: ['https://example.com/*'] }]);
  allowed = false;
  assert.match((await api.discoverFavicon('https://example.com/', { force: true })).warning, /尚未允许/);
});

test('metadata requests follow only bounded same-origin redirects without queries or fragments', async t => {
  const calls = [];
  const { api } = await setup(t, { fetchImpl: async url => {
    calls.push(url);
    if (url.endsWith('/start')) return new Response(null, { status: 302, headers: { location: '/final?session=secret#part' } });
    if (url.endsWith('/external')) return new Response(null, { status: 302, headers: { location: 'https://other.example.com/private' } });
    if (url.endsWith('/local')) return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } });
    if (url.endsWith('/opaque')) return { type: 'opaqueredirect', status: 0 };
    return htmlResponse('<link rel=icon href=relative.svg>');
  } });
  assert.equal((await api.discoverFavicon('https://example.com/start')).url, 'https://example.com/relative.svg');
  for (const path of ['external', 'local', 'opaque']) assert.match((await api.discoverFavicon(`https://example.com/${path}`)).warning, /跳转/);
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/final', 'https://example.com/external', 'https://example.com/local', 'https://example.com/opaque']);
});

test('response limits reject oversized or non-HTML data, including streamed bodies with no length header', async t => {
  let oversizedBodyRead = false;
  const { api } = await setup(t, { fetchImpl: async url => {
    if (url.endsWith('/header')) return { ok: true, headers: new Headers({ 'content-type': 'text/html', 'content-length': String(384 * 1024 + 1) }), text: async () => { oversizedBodyRead = true; return ''; } };
    if (url.endsWith('/stream')) return htmlResponse('a'.repeat(384 * 1024 + 1));
    return new Response('<link rel=icon href=/unsafe.svg>', { headers: { 'content-type': 'application/javascript' } });
  } });
  assert.match((await api.discoverFavicon('https://example.com/header')).warning, /过大/);
  assert.equal(oversizedBodyRead, false);
  assert.match((await api.discoverFavicon('https://example.com/stream')).warning, /过大/);
  assert.match((await api.discoverFavicon('https://example.com/javascript')).warning, /未返回/);
});

test('extraction deadline aborts an in-flight request and returns usable fallback candidates', async t => {
  const actualSetTimeout = globalThis.setTimeout;
  let signal;
  const { api } = await setup(t, { fetchImpl: (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  } });
  globalThis.setTimeout = (callback, milliseconds, ...args) => actualSetTimeout(callback, Math.min(milliseconds, 5), ...args);
  try {
    const result = await api.discoverFavicon('https://example.com/');
    assert.match(result.warning, /超时/);
    assert.equal(signal.aborted, true);
    assert.equal(result.url, 'https://example.com/favicon.svg');
    assert.ok(result.candidates.includes('https://example.com/favicon.ico'));
  } finally { globalThis.setTimeout = actualSetTimeout; }
});

test('Chrome favicon requests scale with the rendered target and DPR, are capped, and never fetch page HTML', async t => {
  let fetches = 0;
  const { api } = await setup(t, { chrome: { runtime }, fetchImpl: async () => { fetches++; return htmlResponse(''); } });
  const requested = options => new URL(api.getFaviconCandidates('https://example.com/?search=private', options).at(-1));
  assert.equal(requested({ targetSize: 24, pixelRatio: 2 }).searchParams.get('size'), '64');
  assert.equal(requested({ targetSize: 64, pixelRatio: 2 }).searchParams.get('size'), '128');
  assert.equal(requested({ targetSize: 96, pixelRatio: 3 }).searchParams.get('size'), '256');
  assert.equal(requested({ targetSize: 100000, pixelRatio: 100000 }).searchParams.get('size'), '256');
  assert.equal(requested({ targetSize: NaN, pixelRatio: -1 }).searchParams.get('size'), '64');
  assert.equal(requested({}).searchParams.get('pageUrl'), 'https://example.com/');
  assert.equal(fetches, 0);
});

test('bitmap declarations choose the nearest adequate size for each target while SVG remains scalable', async t => {
  let fetches = 0;
  const { api } = await setup(t, { fetchImpl: async () => {
    fetches++;
    return htmlResponse([32, 64, 128, 192, 512].map(size => `<link rel=icon type=image/png sizes=${size}x${size} href=/icon-${size}.png>`).join(''));
  } });
  const result = await api.discoverFavicon('https://example.com/', { targetSize: 64, pixelRatio: 2 });
  assert.equal(result.url, 'https://example.com/icon-128.png');
  assert.equal(api.getFaviconCandidates('https://example.com/', { targetSize: 24, pixelRatio: 1 })[0], 'https://example.com/icon-32.png');
  assert.equal(api.getFaviconCandidates('https://example.com/', { targetSize: 96, pixelRatio: 2 })[0], 'https://example.com/icon-192.png');
  assert.equal(fetches, 1, 'candidate reranking cannot trigger metadata requests');
  assert.equal(api.getFaviconQuality('https://example.com/', 'https://example.com/mark.svg', { width: 16, height: 16, targetSize: 128, pixelRatio: 2 }).adequate, true);
  const bitmap = api.getFaviconQuality('https://example.com/', 'https://example.com/icon-32.png', { width: 32, height: 32, targetSize: 32, pixelRatio: 2 });
  assert.equal(bitmap.requiredSize, 64);
  assert.equal(bitmap.size, 32);
  assert.equal(bitmap.adequate, false);
});

test('successful measurements survive reload and a smaller fallback cannot replace a sharper cached icon', async t => {
  const { api, records } = await setup(t);
  const site = 'https://example.com/', sharp = `${site}large.png`, small = `${site}favicon.ico`;
  api.rememberFavicon(site, sharp, { width: 192, height: 192 });
  api.rememberFavicon(site, small, { width: 16, height: 16 });
  assert.equal(api.getFaviconCandidates(site, { targetSize: 64, pixelRatio: 2 })[0], sharp);
  await flush();
  const stored = JSON.parse(records.get('qiye.favicons.local.v1'));
  assert.equal(stored.version, 2);
  assert.equal(stored.entries[0].preferred, sharp);
  assert.equal(stored.entries[0].details.find(detail => detail.url === small).actualWidth, 16);
  const restored = await import(`../src/favicons.js?test=${++moduleId}`);
  await restored.faviconCacheReady;
  assert.equal(restored.getFaviconCandidates(site)[0], sharp);
  assert.equal(restored.getFaviconQuality(site, small).measured, true);
  assert.equal(restored.getFaviconQuality(site, small).adequate, false);
  assert.equal(restored.getFaviconQuality(site, sharp, { targetSize: 64, pixelRatio: 2 }).adequate, true);
});

test('a measured small bitmap overrides an overstated declaration and permits a better manifest source', async t => {
  const requests = [];
  const { api } = await setup(t, { fetchImpl: async url => {
    requests.push(url);
    return url.endsWith('.webmanifest')
      ? jsonResponse({ icons: [{ src: '/real-192.png', sizes: '192x192' }] })
      : htmlResponse('<link rel=icon type=image/png sizes=512x512 href=/actually-small.png><link rel=manifest href=/site.webmanifest>');
  } });
  const site = 'https://example.com/', small = `${site}actually-small.png`;
  assert.equal((await api.discoverFavicon(site, { targetSize: 64, pixelRatio: 2 })).url, small);
  assert.equal(requests.length, 1);
  api.rememberFavicon(site, small, { width: 32, height: 32 });
  assert.equal(api.getFaviconQuality(site, small, { targetSize: 64, pixelRatio: 2 }).adequate, false);
  const result = await api.discoverFavicon(site, { force: true, targetSize: 64, pixelRatio: 2 });
  assert.equal(result.url, `${site}real-192.png`);
  assert.deepEqual(requests, [site, site, `${site}site.webmanifest`]);
});

test('quality upgrades are bounded, skip attempted URLs, and persist a size-aware cooldown', async t => {
  let now = Date.now(), fetches = 0;
  const actualNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = actualNow; });
  const site = 'https://example.com/', small = `${site}small.ico`;
  const { api, records } = await setup(t, {
    initialCache: { version: 1, entries: [{ pageUrl: site, preferred: small, loadedAt: now, checkedAt: now, candidates: ['/first.png', '/second.png', '/third.png', '/fourth.png'].map(path => new URL(path, site).href) }] },
    fetchImpl: async () => { fetches++; return htmlResponse('<link rel=icon href=/fresh.svg>'); },
  });
  assert.equal(api.getFaviconCandidates(site)[0], small, 'legacy loaded icons remain visible until their dimensions can be measured');
  api.rememberFavicon(site, small, { width: 16, height: 16 });
  const options = { width: 16, height: 16, targetSize: 64, pixelRatio: 2, attempted: [`${site}first.png`] };
  const upgrades = api.takeFaviconUpgradeCandidates(site, small, options);
  assert.equal(upgrades.length, 3);
  assert.ok(!upgrades.includes(small));
  assert.ok(!upgrades.includes(`${site}first.png`));
  assert.deepEqual(api.takeFaviconUpgradeCandidates(site, small, options), []);
  assert.equal(api.getFaviconCandidates(site, options)[0], small, 'a new render uses the known working image during the cooldown');
  await flush();
  assert.equal(JSON.parse(records.get('qiye.favicons.local.v1')).entries[0].upgradeSize, 128);
  const restored = await import(`../src/favicons.js?test=${++moduleId}`);
  await restored.faviconCacheReady;
  assert.deepEqual(restored.takeFaviconUpgradeCandidates(site, small, options), []);
  assert.ok(restored.takeFaviconUpgradeCandidates(site, small, { ...options, targetSize: 128 }).length > 0, 'a larger surface may probe once more');
  assert.equal(fetches, 0, 'neither the cache nor quality probes fetch webpage metadata');
  now += 24 * 60 * 60 * 1000 + 1;
  assert.ok(restored.takeFaviconUpgradeCandidates(site, small, options).length > 0);
  await restored.discoverFavicon(site, { force: true });
  assert.equal(fetches, 1);
  assert.ok(restored.takeFaviconUpgradeCandidates(site, small, options).includes(`${site}fresh.svg`), 'explicit extraction resets the quality probe cooldown');
});

test('low-resolution-only icons keep a usable fallback and do not restart a completed probe sequence', async t => {
  const { api } = await setup(t);
  const site = 'https://example.com/', low = `${site}favicon.ico`;
  api.rememberFavicon(site, low, { width: 16, height: 16 });
  const candidates = api.getFaviconCandidates(site);
  assert.ok(candidates.includes(low));
  assert.deepEqual(api.takeFaviconUpgradeCandidates(site, low, { width: 16, height: 16, attempted: candidates }), []);
  assert.deepEqual(api.takeFaviconUpgradeCandidates(site, low), []);
  assert.equal(api.getFaviconCandidates(site)[0], low);
  assert.equal(api.getFaviconQuality(site, low).adequate, false, 'a low-resolution source is never relabeled as high resolution');
});

test('regular artwork is preferred to maskable padding, and sizes=any alone cannot turn a bitmap into a vector', async t => {
  const { api } = await setup(t, { fetchImpl: async url => url.endsWith('.webmanifest')
    ? jsonResponse({ icons: [
      { src: '/padded.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
      { src: '/full.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
    ] })
    : htmlResponse('<link rel=icon type=image/png sizes=any href=/unknown.png><link rel=manifest href=/site.webmanifest>') });
  const result = await api.discoverFavicon('https://example.com/', { targetSize: 64, pixelRatio: 2 });
  assert.equal(result.url, 'https://example.com/full.png');
  assert.ok(result.candidates.includes('https://example.com/padded.png'));
  assert.equal(api.getFaviconQuality('https://example.com/', 'https://example.com/unknown.png', { width: 16, height: 16 }).scalable, false);
});

test('malformed quality-cache dimensions, future measurements, and non-public icon records are discarded', async t => {
  const now = Date.now(), site = 'https://example.com/';
  const { api, records } = await setup(t, { initialCache: { version: 2, entries: [{
    pageUrl: site, preferred: `${site}unknown.png`, loadedAt: now, checkedAt: now,
    candidates: [`${site}unknown.png`], upgradeAt: now + 100000, upgradeSize: 100000,
    details: [
      { url: `${site}unknown.png`, actualWidth: 1e9, actualHeight: 1e9, measuredAt: now },
      { url: `${site}future.png`, actualWidth: 512, actualHeight: 512, measuredAt: now + 100000 },
      { url: 'https://localhost/private.svg', scalable: true, actualWidth: 512, actualHeight: 512, measuredAt: now },
    ],
  }] } });
  assert.equal(api.getFaviconQuality(site, `${site}unknown.png`).measured, false);
  assert.equal(api.getFaviconQuality(site, `${site}future.png`).measured, false);
  api.rememberFavicon(site, `${site}unknown.png`, { width: 16, height: 16 });
  assert.ok(api.takeFaviconUpgradeCandidates(site, `${site}unknown.png`).length > 0);
  await flush();
  assert.doesNotMatch(records.get('qiye.favicons.local.v1'), /localhost|1000000000/);
});
