import test from 'node:test';
import assert from 'node:assert/strict';
import { createDailyQuoteClient } from '../src/daily-quote.js';

const KEY = 'qiye.daily-quote.v1';
const UUID = 'b25ebe3d-d031-493c-a129-61ba3b7c0a23';
const sentence = text => ({hitokoto: text, from: '作品名称', from_who: '作者', uuid: UUID});
const response = text => new Response(JSON.stringify(sentence(text)));
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value)};
}

test('every new page requests a real quote without cookies, referrer or HTTP cache', async () => {
  const storage = memoryStorage(), requests = [];
  const fetcher = async (url, options) => { requests.push({url, options}); return response(`服务返回第${requests.length}句`); };
  const first = await createDailyQuoteClient({storage, fetcher}).next();
  const second = await createDailyQuoteClient({storage, fetcher}).next();
  assert.equal(first.status, 'live');
  assert.equal(first.quote.text, '服务返回第1句');
  assert.equal(second.quote.text, '服务返回第2句');
  assert.equal(second.quote.author, '作者');
  assert.equal(second.quote.from, '作品名称');
  assert.equal(second.quote.uuid, UUID);
  assert.notEqual(requests[0].url, requests[1].url);
  for (const {url, options} of requests) {
    assert.equal(new URL(url).origin, 'https://v1.hitokoto.cn');
    assert.equal(new URL(url).searchParams.get('encode'), 'json');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
  }
  assert.equal(JSON.parse(storage.getItem(KEY)).lastText, second.quote.text);
});

test('a repeated sentence across reloads is retried instead of displayed again', async () => {
  const storage = memoryStorage();
  await createDailyQuoteClient({storage, fetcher: async () => response('上一页的一言')}).next();
  let calls = 0;
  const result = await createDailyQuoteClient({storage, fetcher: async () => response(++calls === 1 ? '上一页的一言' : '这次的新一言')}).next();
  assert.equal(calls, 2);
  assert.equal(result.status, 'live');
  assert.equal(result.quote.text, '这次的新一言');
});

test('persistent duplicate responses have bounded retries and never repeat the last text', async () => {
  const storage = memoryStorage({[KEY]: JSON.stringify({lastText: '相同的一言', quotes: []})});
  let calls = 0;
  const client = createDailyQuoteClient({storage, fetcher: async () => { calls++; return response('相同的一言'); }});
  const result = await client.next();
  assert.equal(calls, 3);
  assert.equal(result.status, 'local');
  assert.notEqual(result.quote.text, '相同的一言');
});

test('offline refreshes rotate previously fetched quotes and label them as cached', async () => {
  const quotes = ['已看过的句子', '另一条真实缓存'].map(text => ({text, author: '作者', from: '作品', uuid: UUID}));
  const storage = memoryStorage({[KEY]: JSON.stringify({lastText: quotes[0].text, quotes})});
  const fetcher = async () => { throw new TypeError('offline'); };
  const first = await createDailyQuoteClient({storage, fetcher}).next();
  const second = await createDailyQuoteClient({storage, fetcher}).next();
  assert.equal(first.status, 'cached');
  assert.equal(first.quote.text, quotes[1].text);
  assert.equal(second.quote.text, quotes[0].text);
});

test('HTTP errors, invalid JSON, missing text and oversized responses fall back safely', async () => {
  for (const makeResponse of [
    () => new Response('Busy', {status: 429}),
    () => new Response('not json'),
    () => new Response(JSON.stringify({hitokoto: ' '})),
    () => response('超'.repeat(200)),
    () => new Response(JSON.stringify({extra: 'x'.repeat(17000)})),
  ]) {
    const storage = memoryStorage({[KEY]: '{corrupted'});
    const first = await createDailyQuoteClient({storage, fetcher: async () => makeResponse()}).next();
    const second = await createDailyQuoteClient({storage, fetcher: async () => makeResponse()}).next();
    assert.equal(first.status, 'local');
    assert.notEqual(first.quote.text, second.quote.text, 'offline reloads also change the local fallback');
  }
});

test('blocked storage does not break live quotes or allow arbitrary source URLs', async () => {
  const storage = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  const result = await createDailyQuoteClient({storage, fetcher: async () => new Response(JSON.stringify({...sentence('<img src=x onerror=alert(1)>'), uuid: 'javascript:alert(1)'}))}).next();
  assert.equal(result.status, 'live');
  assert.equal(result.quote.text, '<img src=x onerror=alert(1)>', 'the view must render this as text');
  assert.equal(result.quote.uuid, '');
});

test('disabling the footer aborts the request without updating its cache', async () => {
  const controller = new AbortController(), storage = memoryStorage();
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const fetcher = async (url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
    started();
  });
  const pending = createDailyQuoteClient({storage, fetcher}).next({signal: controller.signal});
  const rejected = assert.rejects(pending);
  await ready;
  controller.abort();
  await rejected;
  assert.equal(storage.getItem(KEY), null);
});

test('a stalled service times out and leaves a usable local quote', async context => {
  context.mock.timers.enable({apis: ['setTimeout']});
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const fetcher = async (url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true});
    started();
  });
  const pending = createDailyQuoteClient({storage: memoryStorage(), fetcher}).next();
  context.mock.timers.tick(0);
  await ready;
  context.mock.timers.tick(8000);
  assert.equal((await pending).status, 'local');
});
