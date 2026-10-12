import { normalizeIconSelection } from '../src/icon-selection.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ENGINES, safeUrl } from '../src/core.js';
import { icon, iconNames } from '../src/icons.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

// Run the production helpers without initializing the desktop or providing a DOM.
function extractFunction(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `src/app.js must declare ${name}`);
  for (let end = source.indexOf('}', match.index); end !== -1; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(match.index, end + 1);
    try {
      new vm.Script(`(${candidate})`);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error(`Could not extract the complete ${name} function`);
}

const escaping = source.split('\n').find(line => line.startsWith('const esc ='));
assert.ok(escaping, 'src/app.js must declare the markup escaping helper');
const helpers = ['engineSiteUrl', 'engineGlyph'].map(extractFunction).join('\n\n');

function harness({ actualGlyph = false, ...extra } = {}) {
  const glyphCalls = [];
  const context = vm.createContext({
    normalizeIconSelection,
    safeUrl, URL, icon, iconNames,
    siteGlyph: item => {
      glyphCalls.push(structuredClone(item));
      return '<span class="glyph-stub"></span>';
    },
    ...extra
  });
  const code = [
    escaping,
    ...(actualGlyph ? [extractFunction('siteGlyph')] : []),
    helpers,
    'globalThis.header = { engineSiteUrl, engineGlyph };'
  ].join('\n\n');
  new vm.Script(code, { filename: 'header-extracted-from-src-app.js' }).runInContext(context);
  return { header: context.header, glyphCalls };
}

test('built-in providers use their origins or an explicitly known main site for icons', () => {
  const { header } = harness();
  const expected = new Map([
    ['bing', 'https://www.bing.com/'],
    ['baidu', 'https://www.baidu.com/'],
    ['google', 'https://www.google.com/'],
    ['duckduckgo', 'https://duckduckgo.com/'],
    ['bilibili', 'https://www.bilibili.com/']
  ]);
  for (const engine of ENGINES) {
    assert.equal(header.engineSiteUrl(engine), expected.get(engine.id), engine.id);
  }
  assert.equal(header.engineSiteUrl({ url: 'https://tenant.search.bilibili.com/find?q={q}' }), 'https://tenant.search.bilibili.com/', 'the known mapping must not strip arbitrary tenant subdomains');
});

test('custom provider icon URLs omit template paths, queries, fragments, and search text', () => {
  const { header } = harness();
  const templates = [
    'https://search.example.org/results/{q}?query={q}&token=stored-secret#private-fragment',
    'https://search.example.org/previous-private-query?query=older-search&next={q}#search-history',
    'https://search.example.org/{q}/again/{q}?q={q}',
    'https://search.example.org/find/%7Bq%7D?q=%E7%A7%81%E5%AF%86#%7Bq%7D'
  ];
  for (const url of templates) {
    const engine = { name: '自定义搜索', url };
    assert.equal(header.engineSiteUrl(engine), 'https://search.example.org/');
    assert.equal(engine.url, url, 'icon lookup must not modify the saved search template');
  }
});

test('provider origin normalization retains safe HTTP(S) ports and removes default ports', () => {
  const { header } = harness();
  for (const [url, expected] of [
    ['HTTPS://SEARCH.EXAMPLE.ORG:443/find?q={q}', 'https://search.example.org/'],
    ['http://search.example.org:80/find?q={q}', 'http://search.example.org/'],
    ['https://search.example.org:8443/find?q={q}', 'https://search.example.org:8443/'],
    ['http://localhost:8080/find?q={q}', 'http://localhost:8080/'],
    ['search.example.org/find?q={q}', 'https://search.example.org/']
  ]) assert.equal(header.engineSiteUrl({ url }), expected);
  // The favicon module applies its stricter public-HTTPS policy afterwards.
});

test('unsafe protocols, credentials, controls, and malformed ports cannot bypass URL validation', () => {
  const { header } = harness();
  for (const url of [
    'javascript:alert("{q}")',
    'data:text/html,{q}',
    'file:///tmp/search?q={q}',
    'chrome://settings/?q={q}',
    'ftp://search.example.org/find?q={q}',
    'https://name:password@search.example.org/find?q={q}',
    'https://name%40secret@search.example.org/find?q={q}',
    'https://search.example.org:65536/find?q={q}',
    'https://search.example.org:-1/find?q={q}',
    'https://search.example.org:abc/find?q={q}',
    'https://search.example.org/find?q=private\nquery&next={q}',
    'https://search.example.org/find?q=private\u0000query&next={q}',
    'https:\\search.example.org/find?q={q}',
    'https:search.example.org/find?q={q}',
    '/relative/search?q={q}',
    ''
  ]) assert.equal(header.engineSiteUrl({ url }), null, `blocked ${JSON.stringify(url)}`);
});

test('missing or non-string templates and URL construction failures return no icon origin', () => {
  const { header } = harness();
  for (const engine of [null, undefined, {}, { url: null }, { url: 1 }, { url: [] }, { url: {} }]) {
    assert.equal(header.engineSiteUrl(engine), null);
  }
  const rejectedUrl = harness({ URL: class { constructor() { throw new TypeError('invalid URL'); } } });
  assert.equal(rejectedUrl.header.engineSiteUrl({ url: 'https://search.example.org/?q={q}' }), null);
});

test('engine glyphs delegate automatic icons by origin and retain provider text fallbacks', () => {
  const { header, glyphCalls } = harness();
  const engine = { name: '自定义搜索', letter: '搜', color: '#237fa4', url: 'https://search.example.org/private?q={q}' };
  const markup = header.engineGlyph(engine);
  assert.deepEqual(glyphCalls[0], {
    url: 'https://search.example.org/', title: '自定义搜索', icon: '搜', iconMode: 'auto'
  });
  assert.match(markup, /class="engine-mark"/);
  assert.match(markup, /class="glyph-stub"/);
  header.engineGlyph({ name: '文档搜索', url: 'https://docs.example.org/find/{q}' });
  assert.equal(glyphCalls[1].icon, '文');
  assert.equal(glyphCalls[1].iconMode, 'auto');
  header.engineGlyph({ name: '离线回退', letter: '离', url: 'javascript:alert(1)' });
  assert.equal(glyphCalls[2].url, null);
  assert.equal(glyphCalls[2].icon, '离');
});

test('real engine markup escapes fallback text and attributes while leaving images inert', () => {
  const { header } = harness({ actualGlyph: true });
  const markup = header.engineGlyph({
    name: '自定义搜索', letter: '"><svg>', color: '#fff" data-x="<bad>',
    url: 'https://search.example.org/find?q={q}&token=secret'
  });
  assert.match(markup, /style="--engine-color:#fff&quot; data-x=&quot;&lt;bad&gt;"/);
  assert.match(markup, /&quot;&gt;&lt;svg&gt;/);
  assert.match(markup, /data-favicon-site="https:\/\/search\.example\.org\/"/);
  assert.doesNotMatch(markup, /<svg>|\stoken=|\ssrc=/);
  assert.match(markup, /<img [^>]*referrerpolicy="no-referrer"[^>]* hidden>/);
  const fallback = header.engineGlyph({ name: '无有效网址', letter: '搜', url: 'data:text/plain,search' });
  assert.match(fallback, />搜<\/span>/);
  assert.doesNotMatch(fallback, /<img|data-favicon-site=/);
});
