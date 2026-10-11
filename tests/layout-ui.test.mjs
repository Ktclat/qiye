import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function extractFunction(name) {
  const match = new RegExp(`^function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `missing production function ${name}`);
  for (let end = source.indexOf('}', match.index); end !== -1; end = source.indexOf('}', end + 1)) {
    const candidate = source.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`Could not extract ${name}`);
}
const code = [
  extractFunction('updatePinnedHeader'), extractFunction('updateHeaderPlacement'),
  'globalThis.app = {updatePinnedHeader,updateHeaderPlacement};'
].join('\n\n');

function style() {
  const values = new Map();
  return { fontSize: '', setProperty(key, value) { values.set(key, String(value)); },
    getPropertyValue: key => values.get(key) || '' };
}
function box({ left, top = 16, width, height = 94 }, shiftProperty) {
  const inlineStyle = style(), classes = new Set();
  return {
    hidden: false, style: inlineStyle, classes,
    rect: { left, top, width, height },
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
    getBoundingClientRect() {
      if (this.hidden) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
      // The browser's rectangle includes the CSS translateX already applied.
      const shift = parseFloat(inlineStyle.getPropertyValue(shiftProperty)) || 0;
      const { left, top, width, height } = this.rect;
      return { left: left + shift, right: left + shift + width, top, bottom: top + height, width, height };
    }
  };
}
function harness({ viewport = 1440, mainLeft = 50, mainRight = viewport, padding = 38,
  fontSize = 70, textWidth = 280, settings = {}, clockRect, searchRect, toolsRect } = {}) {
  const rootStyle = style(); rootStyle.setProperty('--header-pin-top', '16px');
  const clock = box(clockRect || { left: 600, width: 280 }, '--clock-shift');
  const search = box(searchRect || { left: 426, top: 122, width: 600, height: 46 }, '--search-shift');
  const tools = box(toolsRect || { left: 1220, top: 16, width: 192, height: 42 });
  const main = box({ left: mainLeft, top: -400, width: mainRight - mainLeft, height: 1500 });
  const text = { hidden: false, style: style(), get scrollWidth() {
    const displayedSize = parseFloat(this.style.fontSize) || fontSize;
    return textWidth * displayedSize / fontSize;
  } };
  const state = { settings: {
    clockOffsetX: 0, searchOffsetX: 0, pinClock: true, pinSearch: true,
    navigationMode: 'sidebar', sidebarVisibility: 'always', minimal: false, ...settings
  } };
  const document = { documentElement: { style: rootStyle } };
  const window = { innerWidth: viewport, scrollY: 500 };
  const elements = { '#main': main, '#clock': text, '#clock-block': clock, '.search-wrapper': search, '.top-tools': tools };
  const context = vm.createContext({ document, window, state, $: selector => elements[selector],
    getComputedStyle(element) {
      if (element === main) return { paddingLeft: `${padding}px`, paddingRight: `${padding}px` };
      if (element === text) return { fontSize: text.style.fontSize || `${fontSize}px` };
      return { getPropertyValue: key => rootStyle.getPropertyValue(key) };
    }
  });
  new vm.Script(code, { filename: 'layout-ui-extracted-from-app.js' }).runInContext(context);
  return { app: context.app, rootStyle, state, clock, search, tools, text, main, window,
    value: name => parseFloat(rootStyle.getPropertyValue(name)) };
}

test('a large clock fits a narrow main area and restores its configured size after widening', () => {
  const h = harness({ viewport: 600, mainLeft: 120, padding: 24, fontSize: 160, textWidth: 640,
    clockRect: { left: 144, width: 432 }, searchRect: { left: 144, width: 432, height: 46 },
    toolsRect: { left: 380, top: 16, width: 192, height: 42 } });
  h.app.updateHeaderPlacement();
  assert.equal(parseFloat(h.text.style.fontSize), 100);
  assert.ok(h.text.scrollWidth <= 400, 'clock text fits the 432 px content area with 32 px breathing room');
  h.main.rect.width = 1280;
  h.window.innerWidth = 1400;
  h.app.updateHeaderPlacement();
  assert.equal(h.text.style.fontSize, '', 'a previous automatic reduction must not become the permanent setting');
  assert.equal(h.text.scrollWidth, 640);
});

test('horizontal offsets keep both controls inside main padding without accumulating on repeated layout', () => {
  const h = harness({ viewport: 1000, padding: 24,
    settings: { clockOffsetX: 30, searchOffsetX: -30 },
    clockRect: { left: 325, width: 400 }, searchRect: { left: 225, width: 600, height: 46 },
    toolsRect: { left: 780, top: 16, width: 192, height: 42 } });
  h.app.updateHeaderPlacement();
  const clockRect = h.clock.getBoundingClientRect(), searchRect = h.search.getBoundingClientRect();
  assert.equal(clockRect.right, 976);
  assert.equal(searchRect.left, 74);
  assert.ok(clockRect.left >= 74 && searchRect.right <= 976);
  h.app.updateHeaderPlacement();
  assert.deepEqual(h.clock.getBoundingClientRect(), clockRect);
  assert.deepEqual(h.search.getBoundingClientRect(), searchRect);
});

test('hidden headers clear old shifts and fixed height then regain their offsets when shown', () => {
  const h = harness({ viewport: 1000, padding: 24,
    settings: { clockOffsetX: 30, searchOffsetX: -30 },
    clockRect: { left: 325, width: 400 }, searchRect: { left: 225, width: 600, height: 46 } });
  h.app.updateHeaderPlacement();
  const clockShift = h.clock.style.getPropertyValue('--clock-shift');
  const searchShift = h.search.style.getPropertyValue('--search-shift');
  h.clock.hidden = h.text.hidden = h.search.hidden = true;
  h.app.updateHeaderPlacement();
  assert.equal(h.clock.style.getPropertyValue('--clock-shift'), '0px');
  assert.equal(h.search.style.getPropertyValue('--search-shift'), '0px');
  assert.equal(h.value('--pinned-clock-height'), 0);
  assert.equal(h.clock.classes.has('is-stuck'), false);
  assert.equal(h.search.classes.has('is-stuck'), false);
  h.clock.hidden = h.text.hidden = h.search.hidden = false;
  h.app.updateHeaderPlacement();
  assert.equal(h.clock.style.getPropertyValue('--clock-shift'), clockShift);
  assert.equal(h.search.style.getPropertyValue('--search-shift'), searchShift);
  assert.equal(h.value('--pinned-clock-height'), 94);
});

test('an 800 px search-only sticky header stays twelve pixels below an overlapping toolbar', () => {
  const h = harness({ viewport: 800, padding: 24, settings: { pinClock: false },
    clockRect: { left: 300, width: 200 }, searchRect: { left: 125, top: 70, width: 600, height: 46 },
    toolsRect: { left: 588, top: 16, width: 192, height: 42 } });
  h.app.updateHeaderPlacement();
  assert.equal(h.value('--header-pin-top'), 70);
  assert.equal(h.value('--header-pin-top') - h.tools.getBoundingClientRect().bottom, 12);
  assert.equal(h.value('--pinned-clock-height'), 0);
  assert.equal(h.clock.classes.has('is-stuck'), false);
  assert.equal(h.search.classes.has('is-stuck'), true);

  h.tools.rect.left = 748; h.tools.rect.width = 32;
  h.app.updateHeaderPlacement();
  assert.equal(h.value('--header-pin-top'), 70, 'auto-hidden toolbar actions retain space to expand without covering search');
});

test('wide nonintersecting controls retain the compact sixteen pixel pin position', () => {
  const h = harness({ settings: { pinClock: false }, searchRect: { left: 426, top: 16, width: 600, height: 46 } });
  h.app.updateHeaderPlacement();
  assert.equal(h.value('--header-pin-top'), 16);
  assert.equal(h.value('--pinned-clock-height'), 0);
  assert.ok(h.search.getBoundingClientRect().right < h.tools.getBoundingClientRect().left);
});

test('a pinned clock reserves its own height and gap so the pinned search clears the toolbar', () => {
  const h = harness({ viewport: 800, padding: 24,
    clockRect: { left: 300, top: 16, width: 200, height: 94 },
    searchRect: { left: 125, top: 122, width: 600, height: 46 },
    toolsRect: { left: 588, top: 16, width: 192, height: 42 } });
  h.app.updateHeaderPlacement();
  assert.equal(h.value('--header-pin-top'), 16);
  assert.equal(h.value('--pinned-clock-height'), 94);
  const searchTop = h.value('--header-pin-top') + h.value('--pinned-clock-height') + 12;
  assert.equal(searchTop, 122);
  assert.equal(searchTop - h.clock.getBoundingClientRect().bottom, 12);
  assert.ok(searchTop >= h.tools.getBoundingClientRect().bottom + 12);
  assert.equal(h.clock.classes.has('is-stuck'), true);
  assert.equal(h.search.classes.has('is-stuck'), true);
});

test('an always-visible top navigation adds sixty-four pixels of pin space', () => {
  const h = harness({ mainLeft: 0, settings: { navigationMode: 'top' },
    clockRect: { left: 580, top: 80, width: 280, height: 94 },
    searchRect: { left: 420, top: 186, width: 600, height: 46 },
    toolsRect: { left: 1220, top: 80, width: 192, height: 42 } });
  h.app.updateHeaderPlacement();
  assert.equal(h.value('--header-pin-top'), 80);
  assert.equal(h.value('--header-pin-top') - 16, 64);
  assert.equal(h.value('--pinned-clock-height'), 94);
  h.state.settings.sidebarVisibility = 'auto';
  h.tools.rect.top = 16;
  h.app.updateHeaderPlacement();
  assert.equal(h.value('--header-pin-top'), 16);
});
