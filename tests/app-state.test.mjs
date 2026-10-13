import { widgetData, withNote } from './state-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_STATE, validateImport } from '../src/core.js';
import { webDAVStateFingerprint } from '../src/webdav.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const copy = value => structuredClone(value);

// Execute the production functions themselves. Let V8 find the first complete
// function so braces inside strings/templates do not require a second JS parser.
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

function extractDeclaration(prefix) {
  const line = source.split('\n').find(value => value.startsWith(prefix));
  assert.ok(line, `src/app.js must contain declaration ${prefix}`);
  return line;
}

const productionCode = [
  extractDeclaration('const clone ='),
  extractDeclaration('let state ='),
  extractDeclaration('let persistedState ='),
  extractDeclaration('let editing ='),
  ...['currentGroup', 'persist', 'commit', 'moveItem', 'removeItem', 'confirmDeleteGroup', 'applySyncedDesktop', 'applyOnlineWallpaper'].map(extractFunction),
  `globalThis.appTest = {
    persist, commit, moveItem, removeItem, confirmDeleteGroup, applySyncedDesktop, applyOnlineWallpaper,
    get state() { return state; },
    get persistedState() { return persistedState; },
    get saving() { return saving; }
  };`
].join('\n\n');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(writer, extra = {}) {
  const writes = [], toasts = [], dialogs = [];
  let storedRevision = 0;
  const context = vm.createContext({
    DEFAULT_STATE: copy(DEFAULT_STATE),
    structuredClone,
    Promise,
    validateImport,
    webDAVStateFingerprint,
    // Storage transactions are tested in core.test.mjs. This boundary keeps
    // the real schema check and lets these app tests control completion order.
    saveState: async (snapshot, options = {}) => {
      const checked = validateImport(snapshot);
      writes.push({ state: copy(checked), options: copy(options) });
      if (writer) return writer(checked, options, writes.length);
      return { ...checked, updatedAt: ++storedRevision };
    },
    renderDesktop: () => {},
    toast: (message, undo, label) => toasts.push({ message, undo, label }),
    openDialog: (kind, data) => dialogs.push({ kind, data }),
    closeDialog: () => {},
    exportBackup: () => {},
    ...extra
  });
  new vm.Script(productionCode, { filename: 'app-state-extracted-from-src-app.js' }).runInContext(context);
  return { app: context.appTest, writes, toasts, dialogs };
}

test('an earlier save cannot replace a note typed during the pending debounce window', async () => {
  const entered = deferred(), finish = deferred();
  const h = harness(async (snapshot, options, call) => {
    if (call === 1) {
      entered.resolve();
      await finish.promise;
    }
    return { ...snapshot, updatedAt: 100 + call };
  });
  const oldNote = widgetData(h.app.state).notes;
  const first = h.app.persist();
  await entered.promise;

  // The widget writes memory immediately but calls persist after 400 ms.
  // No second persist has occurred when the earlier storage write completes.
  const newNote = '保存进行时刚输入的便签，防抖尚未提交。';
  widgetData(h.app.state).notes = newNote;
  finish.resolve();
  await first;

  assert.equal(widgetData(h.writes[0].state).notes, oldNote);
  assert.equal(widgetData(h.app.persistedState).notes, oldNote);
  assert.equal(widgetData(h.app.state).notes, newNote, 'the old response must not replace current mutable state');
  assert.equal(h.app.state.updatedAt, 101);

  await h.app.persist(); // The widget's eventual debounced save.
  assert.equal(widgetData(h.writes[1].state).notes, newNote);
  assert.equal(h.writes[1].state.updatedAt, 101);
  assert.equal(widgetData(h.app.persistedState).notes, newNote);
  assert.equal(h.app.saving, 0);
});

test('reviewed WebDAV download uses the current local revision and suppresses an upload echo', async () => {
  const h=harness();
  widgetData(h.app.state).notes='本机已保存';
  await h.app.persist();
  const fingerprint=await webDAVStateFingerprint(h.app.state);
  const localRevision=h.app.state.updatedAt;
  const remote=copy(DEFAULT_STATE);widgetData(remote).notes='远端经确认的内容';remote.updatedAt=98765;
  const saved=await h.app.applySyncedDesktop(remote,fingerprint);
  assert.equal(h.writes[1].state.updatedAt,localRevision);
  assert.equal(h.writes[1].options.fromSync,true);
  assert.equal(widgetData(h.app.state).notes,widgetData(remote).notes);
  assert.equal(saved.updatedAt,h.app.persistedState.updatedAt);
  assert.notEqual(saved.updatedAt,remote.updatedAt);
});

test('typing while a reviewed download fingerprint is pending prevents the remote replacement', async () => {
  const started=deferred(), finish=deferred();
  const h=harness(null,{webDAVStateFingerprint:async()=>{started.resolve();await finish.promise;return 'reviewed';}});
  const remote=copy(DEFAULT_STATE);widgetData(remote).notes='不能覆盖刚输入的文字';
  const applying=h.app.applySyncedDesktop(remote,'reviewed');
  await started.promise;
  widgetData(h.app.state).notes='确认期间继续输入的本机草稿';
  finish.resolve();
  await assert.rejects(applying,/本机桌面又有修改/);
  assert.equal(h.writes.length,0);
  assert.equal(widgetData(h.app.state).notes,'确认期间继续输入的本机草稿');
});

test('a full wallpaper image request cannot replace a newer background choice', async () => {
  let image;
  const photo={provider:'picsum',id:'10',url:'https://picsum.photos/id/10/1920/1080',author:'Test Photographer'};
  class FakeImage {constructor(){image=this;}set src(value){this.requested=value;}}
  const h=harness(null,{
   normalizeWallpaperPhoto:value=>value,
   Image:FakeImage,setTimeout,clearTimeout,
   applySettings:()=>{}
  });
  const applying=h.app.applyOnlineWallpaper(photo);
  assert.equal(image.requested,photo.url);
  h.app.state.settings.wallpaper='forest';
  image.onload();
  await assert.rejects(applying,/壁纸设置已改变/);
  assert.equal(h.writes.length,0);
  assert.equal(h.app.state.settings.wallpaper,'forest');
  assert.equal(h.app.state.settings.remoteWallpaper,null);
});

test('a conflict invalidates an already queued snapshot instead of rebasing it over external data', async () => {
  const entered = deferred(), firstWrite = deferred();
  const latest = copy(DEFAULT_STATE);
  latest.updatedAt = 700;
  widgetData(latest).notes = '另一个标签页已经保存的内容';
  const externalLink = {
    ...copy(latest.items.find(item => item.type === 'link')),
    id: 'external-new-link', title: '右键菜单新增', url: 'https://example.org/from-menu', folderId: null
  };
  latest.items.push(externalLink);
  const h = harness(async (snapshot, options, call) => {
    if (call === 1) {
      entered.resolve();
      return firstWrite.promise;
    }
    return { ...snapshot, updatedAt: latest.updatedAt + call };
  });

  widgetData(h.app.state).notes = '等待保存的本页 A';
  const first = h.app.persist();
  await entered.promise;
  widgetData(h.app.state).notes = '已排队的本页 B';
  const second = h.app.persist();
  const outcomesPromise = Promise.allSettled([first, second]);
  const conflict = Object.assign(new Error('模拟真实 core 的版本冲突'), {
    code: 'STATE_CONFLICT', currentState: copy(latest)
  });
  firstWrite.reject(conflict);
  const outcomes = await outcomesPromise;

  assert.equal(outcomes[0].status, 'rejected');
  assert.equal(outcomes[0].reason.code, 'STATE_CONFLICT');
  assert.equal(outcomes[1].status, 'rejected');
  assert.match(outcomes[1].reason.message, /前一项修改未能保存/);
  assert.equal(h.writes.length, 1, 'queued B must never reach the storage boundary');
  assert.deepEqual(copy(h.app.state), latest);
  assert.deepEqual(copy(h.app.persistedState), latest);
  assert.equal(h.app.saving, 0);

  // A deliberate edit after the conflict is allowed, using the latest base.
  widgetData(h.app.state).notes = '基于最新桌面重新输入';
  await h.app.persist();
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].state.updatedAt, latest.updatedAt);
  assert.ok(h.app.persistedState.items.some(item => item.id === externalLink.id));
  assert.equal(widgetData(h.app.persistedState).notes, '基于最新桌面重新输入');
});

test('moving widgets and folders across groups preserves the real core schema', async () => {
  const h = harness();
  const widget = h.app.state.items.find(item => item.type === 'widget');
  const folder = h.app.state.items.find(item => item.type === 'folder');
  const childIds = h.app.state.items.filter(item => item.folderId === folder.id).map(item => item.id);

  await h.app.moveItem(widget.id, 'work');
  const movedWidget = h.app.state.items.find(item => item.id === widget.id);
  assert.equal(movedWidget.groupId, 'work');
  assert.equal(Object.hasOwn(movedWidget, 'folderId'), false);

  await h.app.moveItem(folder.id, 'code');
  const movedFolder = h.app.state.items.find(item => item.id === folder.id);
  assert.equal(movedFolder.groupId, 'code');
  assert.equal(Object.hasOwn(movedFolder, 'folderId'), false);
  for (const id of childIds) {
    const child = h.app.state.items.find(item => item.id === id);
    assert.equal(child.groupId, 'code');
    assert.equal(child.folderId, folder.id);
  }
  assert.equal(h.writes.length, 2);
  assert.doesNotThrow(() => validateImport(h.app.state));
});

test('undoing folder or group deletion preserves unrelated edits made afterward', async () => {
  for (const kind of ['folder', 'group']) {
    const h = harness();
    const folder = h.app.state.items.find(item => item.type === 'folder');
    const groupId = 'code';
    const affectedIds = kind === 'folder'
      ? h.app.state.items.filter(item => item.folderId === folder.id).map(item => item.id)
      : h.app.state.items.filter(item => item.groupId === groupId).map(item => item.id);

    if (kind === 'folder') {
      await h.app.removeItem(folder.id);
      assert.equal(h.app.state.items.some(item => item.id === folder.id), false);
    } else {
      h.app.confirmDeleteGroup(groupId);
      const confirmation = h.dialogs.at(-1);
      assert.equal(confirmation.kind, 'confirm');
      await confirmation.data.callback();
      assert.equal(h.app.state.groups.some(group => group.id === groupId), false);
    }
    const undo = h.toasts.findLast(entry => typeof entry.undo === 'function')?.undo;
    assert.equal(typeof undo, 'function');

    const addedLater = {
      ...copy(h.app.state.items.find(item => item.type === 'link')),
      id: `after-${kind}-deletion`, groupId: 'home', folderId: null,
      title: '删除后另加的网站', url: `https://example.org/after-${kind}`
    };
    h.app.state.items.push(addedLater);
    widgetData(h.app.state).notes = `删除 ${kind} 后继续输入的便签`;
    h.app.state.settings.theme = 'light';
    await h.app.persist();
    const latestRevision = h.app.state.updatedAt;
    await undo();

    assert.equal(widgetData(h.app.state).notes, `删除 ${kind} 后继续输入的便签`);
    assert.equal(h.app.state.settings.theme, 'light');
    assert.ok(h.app.state.items.some(item => item.id === addedLater.id));
    assert.ok(h.app.state.updatedAt > latestRevision);
    for (const id of affectedIds) {
      const item = h.app.state.items.find(entry => entry.id === id);
      assert.ok(item, 'undo must preserve each original item');
      if (kind === 'folder') assert.equal(item.folderId, folder.id);
      else assert.equal(item.groupId, groupId);
    }
    if (kind === 'folder') assert.ok(h.app.state.items.some(item => item.id === folder.id));
    else assert.ok(h.app.state.groups.some(group => group.id === groupId));
    assert.doesNotThrow(() => validateImport(h.app.state));
  }
});
