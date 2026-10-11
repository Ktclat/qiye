import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STATE, ENGINES, STORAGE_KEY, MAX_BACKUP_BYTES, MAX_MEDIA_BYTES,
  safeUrl, uid, validateImport, exportState, loadState, saveState,
  subscribeState, appendLink, addCurrentTab, requestBookmarks, searchHistory
} from '../src/core.js';

const copy = value => JSON.parse(JSON.stringify(value));
const fresh = () => copy(DEFAULT_STATE);
const originalChrome = globalThis.chrome;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const cleanups = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else delete globalThis.localStorage;
});

function extensionFixture(initial) {
  const records = {};
  if (initial !== undefined) records[STORAGE_KEY] = copy(initial);
  const listeners = new Set();
  const control = { records, writes: 0, failRead: false, failWrite: false, permissions: new Set(), allowPermission: true, permissionRequests: [], bookmarkTree: [], historyResults: [], historyCalls: 0, tab: { url: 'https://example.org/article', title: '当前文章' } };
  const chrome = {
    runtime: {},
    storage: {
      local: {
        get(key, callback) {
          if (control.failRead) chrome.runtime.lastError = { message: 'Access denied' };
          callback(Object.hasOwn(records, key) ? { [key]: copy(records[key]) } : {});
          delete chrome.runtime.lastError;
        },
        set(values, callback) {
          control.writes += 1;
          if (control.failWrite) {
            chrome.runtime.lastError = { message: 'QUOTA_BYTES exceeded' };
            callback();
            delete chrome.runtime.lastError;
            return;
          }
          const previous = records[STORAGE_KEY];
          for (const [key, value] of Object.entries(values)) records[key] = copy(value);
          for (const listener of listeners) listener({ [STORAGE_KEY]: { oldValue: previous, newValue: copy(records[STORAGE_KEY]) } }, 'local');
          callback();
        }
      },
      onChanged: { addListener: handler => listeners.add(handler), removeListener: handler => listeners.delete(handler) }
    },
    permissions: {
      contains(request, callback) { callback(request.permissions.every(value => control.permissions.has(value))); },
      request(request, callback) {
        control.permissionRequests.push(...request.permissions);
        if (control.allowPermission) for (const permission of request.permissions) control.permissions.add(permission);
        callback(control.allowPermission);
      }
    },
    bookmarks: { getTree(callback) { callback(copy(control.bookmarkTree)); } },
    history: { search(_query, callback) { control.historyCalls += 1; callback(copy(control.historyResults)); } },
    tabs: { query(_filter, callback) { callback([copy(control.tab)]); } }
  };
  globalThis.chrome = chrome;
  control.dispatch = value => {
    for (const listener of listeners) listener({ [STORAGE_KEY]: { newValue: copy(value) } }, 'local');
  };
  return control;
}

test('default state is valid, rich, immutable, and exports a lossless backup', () => {
  const checked = validateImport(DEFAULT_STATE);
  assert.equal(checked.settings.gridSize, 74);
  assert.equal(checked.settings.weatherEnabled, false);
  assert.equal(checked.groups.length, 6);
  for (const groupId of ['home', 'code', 'design', 'work', 'ai', 'life']) {
    assert.ok(checked.groups.some(group => group.id === groupId));
    assert.ok(checked.items.some(item => item.groupId === groupId));
  }
  const homeWidgets = checked.items.filter(item => item.groupId === 'home' && item.type === 'widget');
  for (const kind of ['weather', 'calendar', 'wallpaper', 'notes', 'todo', 'countdown', 'focus', 'workday']) {
    assert.ok(homeWidgets.some(item => item.widget === kind), `${kind} has a default home card`);
  }
  assert.equal(homeWidgets.find(item => item.widget === 'wallpaper').size, '4x2');
  assert.deepEqual(validateImport(exportState(checked)), checked);
  checked.settings.theme = 'light';
  assert.equal(DEFAULT_STATE.settings.theme, 'dark');
  assert.ok(Object.isFrozen(DEFAULT_STATE.items));
  assert.ok(ENGINES.every(engine => safeUrl(engine.url.replace('{q}', 'test'))));
});

test('safeUrl normalizes safe domains but rejects scripts, credentials, controls, and ambiguous schemes', () => {
  assert.equal(safeUrl(' github.com/openai '), 'https://github.com/openai');
  assert.equal(safeUrl('HTTPS://EXAMPLE.COM'), 'https://example.com/');
  assert.equal(safeUrl('http://localhost:3000/'), 'http://localhost:3000/');
  for (const input of [
    'javascript:alert(1)', 'JaVaScRiPt://example.com', 'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd', 'chrome://settings', 'blob:https://example.com/a',
    'https://user:password@example.com/', 'https:\\evil.com', 'https:evil.com',
    'https://exa\nmple.com', 'http://exam\tple.com', 'https://example.com/\u0000',
    'https://example.com/a b', '/relative/path', '', null, 'https://example.com/' + 'x'.repeat(4097)
  ]) assert.equal(safeUrl(input), null, `blocked ${String(input).slice(0, 60)}`);
});

test('malicious imported URL and style values cannot enter persistent state', async () => {
  const fixture = extensionFixture(fresh());
  const original = copy(fixture.records[STORAGE_KEY]);
  for (const payload of ['javascript:alert(document.cookie)', 'data:image/svg+xml,<svg onload=alert(1)>', 'file:///tmp/secret']) {
    const state = fresh();
    state.items.find(item => item.type === 'link').url = payload;
    await assert.rejects(saveState(state), /http \/ https/);
  }
  const styleAttack = fresh();
  styleAttack.items.find(item => item.type === 'link').color = 'red; background:url(javascript:alert(1))';
  assert.throws(() => validateImport(styleAttack), /十六进制颜色/);
  assert.equal(fixture.writes, 0);
  assert.deepEqual(fixture.records[STORAGE_KEY], original);
});

test('prototype pollution, unsupported fields, and inherited state are rejected', () => {
  const state = fresh();
  const protoAttack = JSON.stringify(state).replace('"settings":{', '"settings":{"__proto__":{"polluted":true},');
  assert.throws(() => validateImport(protoAttack), /不安全字段/);
  assert.equal({}.polluted, undefined);
  const nested = fresh();
  nested.items.find(item => item.type === 'widget').config = JSON.parse('{"constructor":{"prototype":{"polluted":true}}}');
  assert.throws(() => validateImport(nested), /不安全字段/);
  assert.throws(() => validateImport(Object.create(state)), /特殊对象/);
  assert.throws(() => validateImport({ ...state, discardedSecret: 'must not disappear silently' }), /不是支持的字段/);
});

test('import limits prevent oversized backups, lists, notes, and malformed media', () => {
  assert.throws(() => validateImport(' '.repeat(MAX_BACKUP_BYTES + 1)), /6 MiB/);
  const state = fresh();
  state.notes = 'a'.repeat(100001);
  assert.throws(() => validateImport(state), /notes/);
  state.notes = '';
  state.todos = Array.from({ length: 501 }, (_, i) => ({ id: `test-${i}`, text: 'task', done: false }));
  assert.throws(() => validateImport(state), /todos/);
  const media = fresh();
  media.settings.customWallpaper = 'data:image/svg+xml;base64,PHN2Zy8+';
  assert.throws(() => validateImport(media), /PNG/);
  media.settings.customWallpaper = 'data:text/html;base64,PHNjcmlwdD4=';
  assert.throws(() => validateImport(media), /PNG/);
  media.settings.customWallpaper = 'data:image/png;base64,A!AA';
  assert.throws(() => validateImport(media), /base64/);
  media.settings.customWallpaper = `data:image/png;base64,${Buffer.alloc(MAX_MEDIA_BYTES + 1).toString('base64')}`;
  assert.throws(() => validateImport(media), /4 MiB/);
  media.settings.customWallpaper = 'data:image/png;base64,aGVsbG8=';
  assert.equal(validateImport(media).settings.customWallpaper, media.settings.customWallpaper);
  media.settings.customWallpaperType = 'video';
  assert.throws(() => validateImport(media), /类型不一致/);
});

test('arbitrary remote URLs cannot enter the local media field through restore or save', async () => {
  const fixture = extensionFixture(fresh());
  const original = copy(fixture.records[STORAGE_KEY]);
  for (const remoteUrl of [
    'https://example.com/tracking-wallpaper.png',
    'http://example.com/background.mp4',
    '//example.com/wallpaper.webp',
    'example.com/wallpaper.jpg',
    'blob:https://example.com/local-looking-id',
    'file:///tmp/wallpaper.png'
  ]) {
    const state = fresh();
    state.settings.customWallpaper = remoteUrl;
    assert.throws(() => validateImport(JSON.stringify(state)), /本地媒体仅支持 data URL/);
    await assert.rejects(saveState(state), /本地媒体仅支持 data URL/);
  }
  assert.equal(fixture.writes, 0);
  assert.deepEqual(fixture.records[STORAGE_KEY], original);
  const local = fresh();
  local.settings.customWallpaper = 'data:image/png;base64,aGVsbG8=';
  assert.equal(validateImport(exportState(local)).settings.customWallpaper, local.settings.customWallpaper);
  local.settings.customWallpaper = 'data:video/mp4;base64,aGVsbG8=';
  local.settings.customWallpaperType = 'video';
  assert.equal(validateImport(exportState(local)).settings.customWallpaperType, 'video');
});

test('invalid references and duplicate ids reject the entire backup without dropping records', () => {
  const duplicate = fresh();
  duplicate.items.push(copy(duplicate.items[0]));
  assert.throws(() => validateImport(duplicate), /重复标识/);
  const orphan = fresh();
  orphan.items.find(item => item.folderId).folderId = 'missing-folder';
  assert.throws(() => validateImport(orphan), /文件夹不存在/);
  const wrongGroup = fresh();
  wrongGroup.items.find(item => item.folderId).groupId = 'work';
  assert.throws(() => validateImport(wrongGroup), /同一分组/);
  const noGroup = fresh();
  noGroup.activeGroupId = 'deleted';
  assert.throws(() => validateImport(noGroup), /对应分组不存在/);
  const future = fresh(); future.schemaVersion = 2;
  assert.throws(() => validateImport(future), /仅支持栖页 v1/);
});

test('date, timer, location, and widget configuration values are validated', () => {
  const state = fresh();
  state.countdown.date = '2026-02-29';
  assert.throws(() => validateImport(state), /有效日期/);
  state.countdown.date = '2028-02-29';
  assert.equal(validateImport(state).countdown.date, '2028-02-29');
  state.focus.running = true;
  assert.throws(() => validateImport(state), /结束时间/);
  state.focus.running = false;
  state.settings.weatherCity.latitude = 91;
  assert.throws(() => validateImport(state), /latitude/);
  state.settings.weatherCity.latitude = 22;
  state.items.find(item => item.widget === 'clock').config.timeZone = 'Definitely/Not_A_Timezone';
  assert.throws(() => validateImport(state), /有效时区/);
});

test('custom search engines require a safe explicit search placeholder', () => {
  const state = fresh();
  state.settings.customEngines = [{ id: 'custom-docs', name: '文档', url: 'https://example.org/search?q={q}' }];
  state.settings.searchEngine = 'custom-docs';
  const checked = validateImport(state);
  assert.equal(checked.settings.customEngines[0].letter, '文');
  state.settings.customEngines[0].url = 'javascript:alert("{q}")';
  assert.throws(() => validateImport(state), /http \/ https/);
  state.settings.customEngines[0].url = 'https://example.org/search';
  assert.throws(() => validateImport(state), /占位符/);
  state.settings.customEngines[0].url = 'https://example.org/search?q={q}';
  state.settings.customEngines[0].id = 'bing';
  assert.throws(() => validateImport(state), /覆盖内置/);
});

test('fresh loads return separate defaults without creating storage records', async () => {
  const fixture = extensionFixture();
  const one = await loadState();
  const two = await loadState();
  one.notes = 'private edit';
  assert.notEqual(two.notes, one.notes);
  assert.equal(fixture.writes, 0);
  assert.equal(fixture.records[STORAGE_KEY], undefined);
});

test('corrupt or unreadable storage is preserved and never reset silently', async () => {
  const fixture = extensionFixture({ schemaVersion: 999, notes: 'must survive' });
  const original = copy(fixture.records[STORAGE_KEY]);
  await assert.rejects(loadState(), /原数据已保留/);
  assert.deepEqual(fixture.records[STORAGE_KEY], original);
  assert.equal(fixture.writes, 0);
  fixture.failRead = true;
  await assert.rejects(loadState(), /无法读取/);
  assert.deepEqual(fixture.records[STORAGE_KEY], original);
});

test('failed storage writes leave the old record and do not notify UI subscribers', async () => {
  const fixture = extensionFixture(fresh());
  const original = copy(fixture.records[STORAGE_KEY]);
  let notifications = 0;
  cleanups.push(subscribeState(() => { notifications += 1; }));
  fixture.failWrite = true;
  const changed = fresh(); changed.notes = 'new draft';
  await assert.rejects(saveState(changed), /保存失败/);
  assert.deepEqual(fixture.records[STORAGE_KEY], original);
  assert.equal(notifications, 0);
});

test('saving snapshots state immediately and subscribers receive isolated copies once', async () => {
  const fixture = extensionFixture(fresh());
  const notifications = [];
  cleanups.push(subscribeState(state => { state.notes = 'subscriber mutation'; }));
  cleanups.push(subscribeState(state => notifications.push(state)));
  const input = fresh(); input.notes = 'snapshot';
  const saving = saveState(input);
  input.notes = 'mutated after save called';
  const saved = await saving;
  assert.equal(saved.notes, 'snapshot');
  assert.equal(fixture.records[STORAGE_KEY].notes, 'snapshot');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].notes, 'snapshot');
  assert.ok(saved.updatedAt > 0);
  saved.notes = 'later return mutation';
  assert.equal(fixture.records[STORAGE_KEY].notes, 'snapshot');
});

test('cross-context storage updates notify subscribers while invalid records are ignored', () => {
  const fixture = extensionFixture(fresh());
  const notifications = [];
  const unsubscribe = subscribeState(value => notifications.push(value));
  cleanups.push(unsubscribe);
  const change = fresh(); change.notes = 'changed by another tab'; change.updatedAt = 12345678;
  fixture.dispatch(change);
  fixture.dispatch({ ...change, schemaVersion: 9 });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].notes, change.notes);
  unsubscribe();
  fixture.dispatch({ ...change, updatedAt: 12345679 });
  assert.equal(notifications.length, 1);
});

test('stale whole-state saves cannot erase links appended by another extension surface', async () => {
  const fixture = extensionFixture(fresh());
  const stale = await loadState();
  stale.notes = 'unsaved local draft';
  const appended = await appendLink({ title: '来自右键菜单', url: 'https://example.org/new-from-menu' });
  const latest = copy(fixture.records[STORAGE_KEY]);
  const writes = fixture.writes;
  let conflict;
  try { await saveState(stale); } catch (error) { conflict = error; }
  assert.equal(conflict?.code, 'STATE_CONFLICT');
  assert.deepEqual(conflict.currentState, latest);
  assert.ok(conflict.currentState.items.some(item => item.id === appended.item.id));
  conflict.currentState.notes = 'mutating error data must not mutate stored data';
  assert.deepEqual(fixture.records[STORAGE_KEY], latest);
  assert.equal(fixture.writes, writes);
});

test('concurrent snapshots with one base revision allow one commit and reject a stale overwrite', async () => {
  const fixture = extensionFixture(fresh());
  const first = await loadState();
  const second = copy(first);
  first.notes = 'first draft';
  second.notes = 'second draft';
  const outcomes = await Promise.allSettled([saveState(first), saveState(second)]);
  assert.equal(outcomes[0].status, 'fulfilled');
  assert.equal(outcomes[1].status, 'rejected');
  assert.equal(outcomes[1].reason.code, 'STATE_CONFLICT');
  assert.equal(fixture.records[STORAGE_KEY].notes, 'first draft');
  assert.equal(fixture.writes, 1);
  const retry = copy(outcomes[1].reason.currentState);
  retry.notes = 'second draft';
  const saved = await saveState(retry);
  assert.equal(saved.notes, 'second draft');
  assert.ok(saved.updatedAt > outcomes[0].value.updatedAt);
});

test('explicit restore and reset may replace an old revision or damaged storage after validation', async () => {
  const fixture = extensionFixture(fresh());
  await appendLink({ title: 'Temporary', url: 'https://example.org/temporary' });
  const restored = fresh();
  restored.notes = 'explicitly restored backup';
  const result = await saveState(restored, { replace: true });
  assert.equal(result.notes, 'explicitly restored backup');
  assert.equal(result.items.length, DEFAULT_STATE.items.length);
  fixture.records[STORAGE_KEY] = { schemaVersion: 999, notes: 'damaged record' };
  await assert.rejects(saveState(fresh()), /原数据已保留/);
  const reset = await saveState(fresh(), { replace: true });
  assert.deepEqual(await loadState(), reset);
  const original = copy(fixture.records[STORAGE_KEY]);
  await assert.rejects(saveState({ ...fresh(), schemaVersion: 99 }, { replace: true }), /仅支持栖页 v1/);
  assert.deepEqual(fixture.records[STORAGE_KEY], original);
});

test('rapid explicit resets never reuse an earlier snapshot revision', async () => {
  extensionFixture(fresh());
  const originalNow = Date.now;
  try {
    Date.now = () => 1000;
    const first = await saveState(fresh());
    const second = await saveState({ ...first, notes: 'second commit' });
    const reset = await saveState(fresh(), { replace: true });
    assert.ok(reset.updatedAt > second.updatedAt);
    await assert.rejects(saveState({ ...first, notes: 'stale first commit' }), error => error.code === 'STATE_CONFLICT');
    const importedFuture = { ...fresh(), updatedAt: 8640000000000000 };
    const restored = await saveState(importedFuture, { replace: true });
    assert.equal(restored.updatedAt, reset.updatedAt + 1);
    assert.deepEqual(await loadState(), restored);
  } finally { Date.now = originalNow; }
});

test('parallel append transactions retain every new link and duplicates do not write', async () => {
  const fixture = extensionFixture(fresh());
  const originalCount = DEFAULT_STATE.items.length;
  await Promise.all(Array.from({ length: 12 }, (_, i) => appendLink({ title: `收藏 ${i}`, url: `https://example.org/item-${i}` })));
  const state = await loadState();
  assert.equal(state.items.length, originalCount + 12);
  assert.equal(new Set(state.items.map(item => item.id)).size, state.items.length);
  const writes = fixture.writes;
  const duplicate = await appendLink({ title: '已有网页', url: 'https://example.org/item-1' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(fixture.writes, writes);
  await assert.rejects(appendLink({ title: 'bad', url: 'javascript:alert(1)' }), /http 或 https/);
  await assert.rejects(appendLink({ title: 'good', url: 'https://example.org/' }, 'missing'), /分组已不存在/);
  assert.equal(fixture.writes, writes);
});

test('current-tab action honors chosen group and rejects privileged browser URLs', async () => {
  const fixture = extensionFixture(fresh());
  const added = await addCurrentTab({ title: '手动命名', groupId: 'work' });
  assert.equal(added.item.title, '手动命名');
  assert.equal(added.item.groupId, 'work');
  assert.equal(added.item.url, fixture.tab.url);
  fixture.tab.url = 'chrome://settings/';
  const writes = fixture.writes;
  await assert.rejects(addCurrentTab(), /http 或 https/);
  assert.equal(fixture.writes, writes);
});

test('bookmarks request only optional permission and filter unsafe URLs and duplicates', async () => {
  const fixture = extensionFixture();
  fixture.bookmarkTree = [{ title: 'root', children: [
    { title: '目录', children: [{ title: 'A', url: 'https://example.org/' }, { title: 'A again', url: 'https://example.org/' }] },
    { title: 'Script', url: 'javascript:alert(1)' }, { title: 'Local', url: 'file:///secret' },
    { title: 'B', url: 'https://example.net/' }
  ] }];
  assert.equal(fixture.permissionRequests.length, 0);
  const results = await requestBookmarks();
  assert.deepEqual(fixture.permissionRequests, ['bookmarks']);
  assert.equal(results.length, 2);
  assert.ok(results.every(entry => safeUrl(entry.url)));
  await requestBookmarks();
  assert.equal(fixture.permissionRequests.length, 1);
  assert.equal(fixture.writes, 0);
});

test('denied optional permissions perform no history query and never change storage', async () => {
  const fixture = extensionFixture(fresh());
  fixture.allowPermission = false;
  assert.deepEqual(await searchHistory('  '), []);
  assert.equal(fixture.permissionRequests.length, 0);
  await assert.rejects(searchHistory('query'), /未授予浏览记录权限/);
  assert.equal(fixture.historyCalls, 0);
  assert.equal(fixture.writes, 0);
  await assert.rejects(requestBookmarks(), /未授予书签权限/);
});

test('history search returns only safe URLs after explicit permission', async () => {
  const fixture = extensionFixture();
  fixture.historyResults = [{ id: '1', title: 'One', url: 'https://example.com/', lastVisitTime: 1000, visitCount: 3 }, { id: '2', title: 'Unsafe', url: 'javascript:alert(1)' }];
  const results = await searchHistory('one');
  assert.equal(results.length, 1);
  assert.equal(results[0].visitCount, 3);
  assert.deepEqual(fixture.permissionRequests, ['history']);
  assert.equal(fixture.writes, 0);
});

test('HTTP preview uses the identical key and surfaces quota errors without clearing old data', async () => {
  delete globalThis.chrome;
  const records = new Map();
  let failWrite = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => records.has(key) ? records.get(key) : null,
    setItem: (key, value) => { if (failWrite) throw new Error('QuotaExceededError'); records.set(key, value); }
  } });
  const saved = await saveState(fresh());
  assert.deepEqual(await loadState(), saved);
  assert.ok(records.has(STORAGE_KEY));
  const original = records.get(STORAGE_KEY);
  failWrite = true;
  await assert.rejects(saveState({ ...saved, notes: 'not persisted' }), /保存失败/);
  assert.equal(records.get(STORAGE_KEY), original);
  records.set(STORAGE_KEY, 'broken-json');
  await assert.rejects(loadState(), /原数据已保留/);
  assert.equal(records.get(STORAGE_KEY), 'broken-json');
});

test('generated ids are compatible with imported identifiers', () => {
  const values = Array.from({ length: 100 }, uid);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every(value => /^[a-zA-Z0-9_-]{1,80}$/.test(value)));
});
