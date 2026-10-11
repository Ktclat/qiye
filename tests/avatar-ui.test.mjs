import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_STATE, validateImport } from '../src/core.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const copy = value => structuredClone(value);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMI6LkDAALoAbn/7VoOAAAAAElFTkSuQmCC';
const WEBP = 'data:image/webp;base64,UklGRjYAAABXRUJQVlA4ICoAAADwAQCdASoBAAEAAUAmJaACdLoB+AAGXYAAm//PTNeYP8nP/lKvBY3N8AA=';

// Run the production handlers with controllable decoding and storage completion.
function extractFunction(name) {
  const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `missing production function ${name}`);
  for (let end = source.indexOf('}', match.index); end !== -1; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`Could not extract ${name}`);
}
function declaration(prefix) {
  const line = source.split('\n').find(value => value.startsWith(prefix));
  assert.ok(line, `missing declaration ${prefix}`);
  return line;
}
const productionCode = [
  ...['const clone =', 'const esc =', 'let state =', 'let persistedState =', 'let editing =',
    'let dialogKind =', 'let desktopDrag =', 'let avatarRequestSequence ='].map(declaration),
  ...['persist', 'renderAvatar', 'uploadAvatar', 'openDialog', 'closeDialog', 'resetAvatar'].map(extractFunction),
  declaration("dialog.addEventListener('close'"),
  `globalThis.app = {
    renderAvatar, uploadAvatar, openDialog, closeDialog, resetAvatar,
    get state() { return state; }, get stored() { return persistedState; },
    get saving() { return saving; },
    setBlocked(value) { blockedStorage = value; },
    replaceState(value) { state = clone(value); persistedState = clone(value); }
  };`
].join('\n\n');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function element() {
  return { isConnected: true, innerHTML: '', textContent: '', hidden: false,
    classList: { toggle() {}, remove() {} }, setAttribute() {}, focus() {} };
}
function editorPanel() {
  const panel = element(), status = element(), preview = element();
  panel.querySelector = selector => ({ '#avatar-status': status, '#avatar-preview': preview })[selector] || null;
  return { panel, status, preview };
}
function harness({ initialAvatar = null, writer } = {}) {
  const initial = copy(DEFAULT_STATE); initial.settings.avatar = initialAvatar;
  const decodes = [], writes = [], toasts = [], closeListeners = [];
  let currentPanel = editorPanel(), context;
  const brand = element(), shortcuts = element(), menu = element();
  const dialog = {
    open: true, classList: { toggle() {} },
    addEventListener(type, handler) { if (type === 'close') closeListeners.push(handler); },
    showModal() { this.open = true; },
    close() { this.open = false; for (const handler of closeListeners) handler(); },
    querySelector(selector) {
      if (selector === '#avatar-panel') return currentPanel.panel;
      return currentPanel.panel.querySelector(selector);
    }
  };
  const content = {
    querySelectorAll: () => [],
    set innerHTML(value) {
      this.markup = value;
      currentPanel.panel.isConnected = false;
      currentPanel = editorPanel();
    }
  };
  const document = {
    activeElement: element(), body: { append() {}, classList: { remove() {} } },
    querySelector(selector) {
      return ({ '#brand-button': brand, '#context-menu': menu, '#shortcuts-button': shortcuts,
        '#dialog-content': content, '#dialog': dialog, '#avatar-panel': currentPanel.panel,
        '#avatar-status': currentPanel.status, '#avatar-preview': currentPanel.preview })[selector] || null;
    }
  };
  context = vm.createContext({
    DEFAULT_STATE: initial, structuredClone, Promise, document, dialog, wallpaperLibrary: {close() {}},
    $: (selector, root = document) => root?.querySelector(selector),
    normalizeAvatarFile(file) {
      const request = deferred(); decodes.push({ file, ...request }); return request.promise;
    },
    async saveState(snapshot, options = {}) {
      const checked = validateImport(snapshot);
      writes.push({ state: copy(checked), options: copy(options) });
      if (writer) return writer(checked, options, writes.length);
      return { ...checked, updatedAt: writes.length };
    },
    toast: (message, undo, action) => toasts.push({ message, undo, action }),
    renderDesktop: () => context.app?.renderAvatar(),
    exportBackup() {}, hideSearchMenus() {}, bindFaviconImages() {},
    settingsDialog: () => '<section id="avatar-panel"></section>',
    updateLinkPreview() {}
  });
  new vm.Script(productionCode, { filename: 'avatar-ui-extracted-from-app.js' }).runInContext(context);
  context.app.renderAvatar();
  return { app: context.app, dialog, brand, decodes, writes, toasts, get editor() { return currentPanel; } };
}

test('rapid avatar choices commit only the latest decoded selection', async () => {
  const h = harness();
  const first = h.app.uploadAvatar({ name: 'first.png' }, h.editor.panel);
  const second = h.app.uploadAvatar({ name: 'second.webp' }, h.editor.panel);
  h.decodes[1].resolve(WEBP);
  await second;
  assert.equal(h.app.state.settings.avatar, WEBP);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].state.settings.avatar, WEBP);
  const status = h.editor.status.textContent, preview = h.brand.innerHTML;
  h.decodes[0].resolve(PNG);
  await first;
  assert.equal(h.writes.length, 1);
  assert.equal(h.brand.innerHTML, preview);
  assert.equal(h.editor.status.textContent, status);
});

test('a late decode failure cannot overwrite a newer successful avatar status', async () => {
  const h = harness();
  const first = h.app.uploadAvatar({ name: 'broken.png' }, h.editor.panel);
  const second = h.app.uploadAvatar({ name: 'valid.png' }, h.editor.panel);
  h.decodes[1].resolve(PNG);
  await second;
  const status = h.editor.status.textContent;
  h.decodes[0].reject(new Error('obsolete failure'));
  await first;
  assert.equal(h.editor.status.textContent, status);
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.writes.length, 1);
});

test('button close, native close and replacement dialogs invalidate pending avatar results', async () => {
  for (const closing of ['button', 'native', 'replacement']) {
    for (const outcome of ['success', 'failure']) {
      const h = harness(), oldPanel = h.editor;
      const pending = h.app.uploadAvatar({ name: 'pending.png' }, oldPanel.panel);
      const status = oldPanel.status.textContent;
      if (closing === 'button') h.app.closeDialog();
      else if (closing === 'native') h.dialog.close();
      else h.app.openDialog('settings', { tab: 'sidebar' });
      if (outcome === 'success') h.decodes[0].resolve(PNG);
      else h.decodes[0].reject(new Error('obsolete failure'));
      await pending;
      assert.equal(h.writes.length, 0, `${closing}/${outcome}`);
      assert.equal(h.app.state.settings.avatar, null);
      assert.equal(oldPanel.status.textContent, status, `${closing}/${outcome}`);
    }
  }
});

test('reopening avatar settings cannot adopt a decode from the previous dialog', async () => {
  const h = harness(), firstPanel = h.editor;
  const pending = h.app.uploadAvatar({ name: 'old-dialog.png' }, firstPanel.panel);
  h.app.closeDialog();
  h.app.openDialog('settings', { tab: 'sidebar' });
  assert.notEqual(h.editor.panel, firstPanel.panel);
  const currentStatus = h.editor.status.textContent;
  h.decodes[0].resolve(PNG);
  await pending;
  assert.equal(h.editor.status.textContent, currentStatus);
  assert.equal(h.app.state.settings.avatar, null);
  assert.equal(h.writes.length, 0);
});

test('resetting the avatar cancels an in-flight choice and preserves the reset after completion', async () => {
  const h = harness({ initialAvatar: PNG });
  const pending = h.app.uploadAvatar({ name: 'pending.webp' }, h.editor.panel);
  await h.app.resetAvatar();
  assert.equal(h.app.state.settings.avatar, null);
  assert.equal(h.app.stored.settings.avatar, null);
  assert.equal(h.writes.length, 1);
  const status = h.editor.status.textContent;
  h.decodes[0].resolve(WEBP);
  await pending;
  assert.equal(h.writes.length, 1);
  assert.equal(h.app.state.settings.avatar, null);
  assert.equal(h.editor.status.textContent, status);
  assert.doesNotMatch(h.brand.innerHTML, /<img/);
});

test('an earlier reset cannot replace the status of a newer avatar upload', async () => {
  const entered = deferred(), finish = deferred();
  const h = harness({ initialAvatar: PNG, writer: async (snapshot, options, call) => {
    if (call === 1) { entered.resolve(); await finish.promise; }
    return { ...snapshot, updatedAt: call };
  } });
  const resetting = h.app.resetAvatar();
  await entered.promise;
  const uploading = h.app.uploadAvatar({ name: 'chosen-after-reset.webp' }, h.editor.panel);
  const currentStatus = h.editor.status.textContent;
  finish.resolve();
  await resetting;
  assert.equal(h.editor.status.textContent, currentStatus);
  h.decodes[0].resolve(WEBP);
  await uploading;
  assert.equal(h.app.stored.settings.avatar, WEBP);
});

test('a reset completed after reopening settings cannot write into the new editor panel', async () => {
  const entered = deferred(), finish = deferred();
  const h = harness({ initialAvatar: PNG, writer: async snapshot => {
    entered.resolve(); await finish.promise; return { ...snapshot, updatedAt: 1 };
  } });
  const resetting = h.app.resetAvatar();
  await entered.promise;
  h.app.closeDialog();
  h.app.openDialog('settings', { tab: 'sidebar' });
  const currentStatus = h.editor.status.textContent;
  finish.resolve();
  await resetting;
  assert.equal(h.editor.status.textContent, currentStatus);
  assert.equal(h.app.stored.settings.avatar, null);
});

test('a failed reset cancels prior decoding without leaving a busy message or losing the saved avatar', async () => {
  const h = harness({ initialAvatar: PNG, writer: async () => { throw new Error('Reset storage failure'); } });
  const uploading = h.app.uploadAvatar({ name: 'cancelled.webp' }, h.editor.panel);
  await assert.rejects(h.app.resetAvatar(), /Reset storage failure/);
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.app.stored.settings.avatar, PNG);
  assert.doesNotMatch(h.editor.status.textContent, /正在裁切|正在恢复/);
  h.decodes[0].resolve(WEBP);
  await uploading;
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.writes.length, 1);
});

test('replaced desktop state invalidates old decoding even when the avatar value stays equal', async () => {
  for (const avatar of [null, PNG]) {
    const h = harness({ initialAvatar: avatar });
    const pending = h.app.uploadAvatar({ name: 'old-desktop.webp' }, h.editor.panel);
    const incoming = copy(h.app.state);
    incoming.notes = 'A newly restored desktop'; incoming.updatedAt = 500;
    h.app.replaceState(incoming);
    h.decodes[0].resolve(WEBP);
    await pending;
    assert.equal(h.writes.length, 0);
    assert.deepEqual(copy(h.app.state), incoming);
    assert.doesNotMatch(h.editor.status.textContent, /正在裁切/);
  }
});

test('current unrelated edits survive a valid avatar upload without retaining changed-avatar work', async () => {
  const h = harness();
  const pending = h.app.uploadAvatar({ name: 'current.png' }, h.editor.panel);
  h.app.state.settings.sidebarWidth = 90;
  h.app.state.notes = 'A note edited while the local image decoded';
  h.decodes[0].resolve(PNG);
  await pending;
  assert.equal(h.writes[0].state.settings.sidebarWidth, 90);
  assert.equal(h.writes[0].state.notes, h.app.state.notes);
  assert.equal(h.writes[0].state.settings.avatar, PNG);

  const next = h.app.uploadAvatar({ name: 'superseded.png' }, h.editor.panel);
  h.app.state.settings.avatar = null;
  h.decodes[1].resolve(WEBP);
  await next;
  assert.equal(h.writes.length, 1);
  assert.equal(h.app.state.settings.avatar, null);
  assert.doesNotMatch(h.editor.status.textContent, /正在裁切/);
});

test('failed avatar persistence restores the saved image and reports failure in the active panel', async () => {
  const h = harness({ initialAvatar: PNG, writer: async () => { throw new Error('Quota exceeded'); } });
  const originalBrand = h.brand.innerHTML;
  const pending = h.app.uploadAvatar({ name: 'unsaved.webp' }, h.editor.panel);
  h.decodes[0].resolve(WEBP);
  await pending;
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.app.stored.settings.avatar, PNG);
  assert.equal(h.brand.innerHTML, originalBrand);
  assert.match(h.editor.status.textContent, /Quota exceeded/);
  assert.equal(h.app.saving, 0);
  assert.equal(h.toasts.length, 1);
});

test('failure of an earlier save prevents a still-decoding choice from reviving its discarded state', async () => {
  const entered = deferred(), saving = deferred();
  const h = harness({ initialAvatar: PNG, writer: async () => { entered.resolve(); return saving.promise; } });
  const first = h.app.uploadAvatar({ name: 'first.webp' }, h.editor.panel);
  h.decodes[0].resolve(WEBP);
  await entered.promise;
  const second = h.app.uploadAvatar({ name: 'second.png' }, h.editor.panel);
  saving.reject(new Error('Storage unavailable'));
  await first;
  h.decodes[1].resolve(PNG);
  await second;
  assert.equal(h.writes.length, 1);
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.app.saving, 0);
  assert.doesNotMatch(h.editor.status.textContent, /正在裁切/);
});

test('protected storage rejects upload and reset without leaving an unsaved avatar in memory', async () => {
  const h = harness({ initialAvatar: PNG });
  h.app.setBlocked(true);
  const originalBrand = h.brand.innerHTML;
  const pending = h.app.uploadAvatar({ name: 'blocked.webp' }, h.editor.panel);
  if (h.decodes[0]) h.decodes[0].resolve(WEBP);
  await pending;
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.brand.innerHTML, originalBrand);
  assert.equal(h.writes.length, 0);
  try { await h.app.resetAvatar(); } catch (error) { assert.match(error.message, /数据|恢复|导入|存储/); }
  assert.equal(h.app.state.settings.avatar, PNG);
  assert.equal(h.brand.innerHTML, originalBrand);
  assert.equal(h.writes.length, 0);
});
