import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEARCH_HISTORY_KEY, MAX_SEARCH_HISTORY_ITEMS, MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_HISTORY_BYTES,
  readSearchHistory, rememberSearch, clearSearchHistory
} from '../src/search-history.js';
import { DEFAULT_STATE, exportState } from '../src/core.js';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

function storageFixture(raw = null) {
  const values = new Map();
  if (raw !== null) values.set(SEARCH_HISTORY_KEY, raw);
  const fixture = { values, reads: [], writes: [], removals: [], failRead: false, failWrite: false, failRemove: false };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) {
      fixture.reads.push(key);
      if (fixture.failRead) throw new Error('SecurityError');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      fixture.writes.push([key, value]);
      if (fixture.failWrite) throw new Error('QuotaExceededError');
      values.set(key, value);
    },
    removeItem(key) {
      fixture.removals.push(key);
      if (fixture.failRemove) throw new Error('SecurityError');
      values.delete(key);
    }
  } });
  return fixture;
}

test('history remains completely untouched when recording is disabled', () => {
  let accesses = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { accesses += 1; throw new Error('blocked'); } });
  for (const enabled of [false, undefined, null, 0, 1, 'true']) {
    assert.deepEqual(readSearchHistory(enabled), []);
    assert.doesNotThrow(() => rememberSearch('private query', enabled));
  }
  assert.equal(accesses, 0);
  assert.equal(DEFAULT_STATE.settings.showSearchHistory, false);
});

test('recent searches are deduplicated, limited to twenty and ordered newest first', () => {
  const fixture = storageFixture();
  for (let index = 1; index <= 25; index += 1) rememberSearch(`query ${index}`, true);
  assert.deepEqual(readSearchHistory(true), Array.from({ length: 20 }, (_, i) => `query ${25 - i}`));
  rememberSearch('  query 10  ', true);
  const recent = readSearchHistory(true);
  assert.equal(recent.length, MAX_SEARCH_HISTORY_ITEMS);
  assert.equal(recent[0], 'query 10');
  assert.equal(recent.filter(value => value === 'query 10').length, 1);
  assert.equal(recent[1], 'query 25');
  assert.equal(recent.at(-1), 'query 6');
  assert.deepEqual(new Set(fixture.reads), new Set([SEARCH_HISTORY_KEY]));
  assert.deepEqual(new Set(fixture.writes.map(([key]) => key)), new Set([SEARCH_HISTORY_KEY]));
});

test('query validation preserves complete text without silently truncating searches', () => {
  const fixture = storageFixture();
  const longest = '查'.repeat(MAX_SEARCH_QUERY_LENGTH);
  const emoji = '🙂'.repeat(MAX_SEARCH_QUERY_LENGTH);
  for (const query of [longest, emoji, '<script>alert("only text")</script>', 'site:example.org "two  spaces"']) rememberSearch(query, true);
  assert.deepEqual(readSearchHistory(true), ['site:example.org "two  spaces"', '<script>alert("only text")</script>', emoji, longest]);
  const before = fixture.values.get(SEARCH_HISTORY_KEY);
  const writes = fixture.writes.length;
  for (const invalid of [null, undefined, {}, [], '', '   ', 'x'.repeat(241), '🙂'.repeat(241), 'secret\nquery', 'bad\u0000query']) {
    rememberSearch(invalid, true);
  }
  assert.equal(fixture.writes.length, writes);
  assert.equal(fixture.values.get(SEARCH_HISTORY_KEY), before);
});

test('malformed or oversized records read as empty without changing existing data', () => {
  for (const raw of ['not json', 'null', '{}', '1', '"query"', '["valid",false]', '["valid",""]',
    JSON.stringify(['x'.repeat(241)]), JSON.stringify(['control\nquery']),
    JSON.stringify(Array.from({ length: 21 }, (_, i) => `query ${i}`)),
    ' '.repeat(MAX_SEARCH_HISTORY_BYTES + 1), '查'.repeat(MAX_SEARCH_HISTORY_BYTES / 2)]) {
    const fixture = storageFixture(raw);
    assert.deepEqual(readSearchHistory(true), []);
    assert.equal(fixture.values.get(SEARCH_HISTORY_KEY), raw);
    assert.equal(fixture.writes.length, 0);
  }
  storageFixture(JSON.stringify(['query', ' query ', 'other']));
  assert.deepEqual(readSearchHistory(true), ['query', 'other']);
});

test('storage errors and absent storage never throw or interrupt a search', () => {
  let fixture = storageFixture('["old query"]');
  fixture.failRead = true;
  assert.deepEqual(readSearchHistory(true), []);
  assert.doesNotThrow(() => rememberSearch('new query', true));
  assert.equal(fixture.writes.length, 0);
  fixture = storageFixture('["old query"]');
  fixture.failWrite = true;
  assert.doesNotThrow(() => rememberSearch('new query', true));
  assert.equal(fixture.values.get(SEARCH_HISTORY_KEY), '["old query"]');
  fixture.failRemove = true;
  assert.doesNotThrow(clearSearchHistory);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('disabled'); } });
  assert.deepEqual(readSearchHistory(true), []);
  assert.doesNotThrow(() => rememberSearch('new query', true));
  assert.doesNotThrow(clearSearchHistory);
  delete globalThis.localStorage;
  assert.deepEqual(readSearchHistory(true), []);
  assert.doesNotThrow(() => rememberSearch('new query', true));
  assert.doesNotThrow(clearSearchHistory);
});

test('explicit clearing removes only local search history while desktop backups stay unchanged', () => {
  const fixture = storageFixture('["local-only secret"]');
  const desktopKey = 'qiye.state.v4';
  const desktop = exportState(DEFAULT_STATE);
  fixture.values.set(desktopKey, desktop);
  assert.deepEqual(readSearchHistory(false), []);
  assert.equal(fixture.values.get(SEARCH_HISTORY_KEY), '["local-only secret"]');
  assert.ok(!desktop.includes('local-only secret'));
  clearSearchHistory();
  assert.deepEqual(fixture.removals, [SEARCH_HISTORY_KEY]);
  assert.equal(fixture.values.get(SEARCH_HISTORY_KEY), undefined);
  assert.equal(fixture.values.get(desktopKey), desktop);
  assert.deepEqual(readSearchHistory(true), []);
});
