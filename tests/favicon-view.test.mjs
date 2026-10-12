import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/favicon-view.js', import.meta.url), 'utf8');
const executable = source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.bind = bindFaviconImages;';

// Run the production renderer with observable browser image and timer boundaries.
// Metadata ranking and persistence have their own integration tests.
function harness(overrides = {}) {
  const requests = [], remembered = [], candidateCalls = [], upgradeCalls = [], timers = new Map();
  let sequence = 0;
  class BrowserImage {
    constructor() {
      this.hidden = true; this.naturalWidth = 0; this.naturalHeight = 0;
      this.onload = null; this.onerror = null; this.className = 'site-favicon';
      this.styleValues = { width: '60%', height: '60%', maxWidth: '38px', maxHeight: '38px' };
    }
    set src(value) {
      assert.equal(typeof this.onload, 'function', 'load listener must precede the network request');
      assert.equal(typeof this.onerror, 'function', 'error listener must precede the network request');
      assert.equal(this.referrerPolicy, 'no-referrer');
      this.url = value;
      requests.push({ image: this, url: value, onload: this.onload, onerror: this.onerror });
    }
    get src() { return this.url; }
    get currentSrc() { return this.url; }
    removeAttribute(name) { if (name === 'src') { this.url = undefined; this.naturalWidth = 0; this.naturalHeight = 0; } }
    getBoundingClientRect() { return { width: 0, height: 0 }; }
    replaceWith(other) {
      assert.ok(this.visual, 'only a rendered image can be replaced');
      other.visual = this.visual;
      other.styleValues = this.styleValues;
      this.visual.image = other;
      this.visual = null;
    }
    load(width = 128, height = width) { this.naturalWidth = width; this.naturalHeight = height; this.onload?.(); }
    fail() { this.onerror?.(); }
  }
  const quality = (_site, url, options = {}) => {
    const size = Math.min(options.width || 0, options.height || 0);
    const requiredSize = (options.targetSize || 64) * (options.pixelRatio || 1);
    const scalable = url?.endsWith('.svg');
    return { size, requiredSize, scalable, score: scalable ? 10000 : size, adequate: scalable || size >= requiredSize };
  };
  const context = vm.createContext({
    Image: BrowserImage, document: {}, URL, Promise, Date, devicePixelRatio: 2,
    getComputedStyle: image => image.styleValues,
    setTimeout: callback => { timers.set(++sequence, callback); return sequence; },
    clearTimeout: id => timers.delete(id),
    getFaviconCandidates: (site, options) => { candidateCalls.push({ site, options }); return [`${site}favicon.ico`]; },
    getFaviconQuality: quality,
    rememberFavicon: (site, url, dimensions) => remembered.push({ site, url, dimensions }),
    takeFaviconUpgradeCandidates: (site, url, options) => { upgradeCalls.push({ site, url, options }); return []; },
    ...overrides,
  });
  new vm.Script(executable, { filename: 'production-favicon-view.js' }).runInContext(context);
  const visual = (site = 'https://example.com/', { engine = false, width = 64, height = 64, style = {} } = {}) => {
    const classes = new Set(), image = new BrowserImage();
    image.styleValues = { ...image.styleValues, ...style };
    const element = {
      isConnected: true, dataset: { faviconSite: site }, image,
      closest: selector => selector === '.engine-mark' && engine ? {} : null,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
      getBoundingClientRect: () => ({ width, height }),
      querySelector: () => element.image,
    };
    image.visual = element;
    return { element, get image() { return element.image; }, classes, root: { querySelectorAll: () => [element] } };
  };
  return { bind: context.bind, visual, requests, remembered, candidateCalls, upgradeCalls, timers };
}

test('failed image candidates advance once, a loaded image is measured, and repeated hydration is inert', () => {
  const first = 'https://example.com/missing.ico', second = 'https://example.com/real.png';
  const h = harness({ getFaviconCandidates: () => [first, first, second] });
  const v = h.visual(); h.bind(v.root);
  assert.deepEqual(h.requests.map(request => request.url), [first]);
  const stale = v.image.onload;
  v.image.fail();
  assert.deepEqual(h.requests.map(request => request.url), [first, second]);
  stale();
  assert.equal(h.remembered.length, 0);
  v.image.load(128);
  assert.equal(v.image.hidden, false);
  assert.equal(v.classes.has('is-loaded'), true);
  assert.equal(h.remembered[0].url, second);
  assert.equal(h.remembered[0].dimensions.width, 128);
  h.bind(v.root);
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 0);
  const rerendered = h.visual(); h.bind(rerendered.root);
  assert.equal(h.requests.at(-1).url, second, 'recent failed URLs are skipped after a desktop rerender');
  rerendered.image.load(128);
});

test('timeouts, empty decoded images, and stale events retain text fallback and allow an explicit retry', () => {
  const h = harness(), v = h.visual(); h.bind(v.root);
  const stale = v.image.onload;
  [...h.timers.values()][0]();
  assert.equal(v.image.hidden, true);
  assert.equal(v.image.src, undefined);
  stale();
  assert.equal(h.remembered.length, 0);
  h.bind(v.root, { force: true });
  v.image.load(32, 0);
  assert.equal(v.image.hidden, true);
  assert.equal(h.remembered.length, 0);
  h.bind(v.root, { force: true });
  v.image.load(128);
  assert.equal(v.image.hidden, false);
  assert.equal(h.requests.length, 3);
});

test('all icon requests share four slots and detached group requests are cancelled before the next group loads', () => {
  const h = harness(), firstGroup = Array.from({ length: 7 }, (_, index) => h.visual(`https://site-${index}.example.com/`));
  h.bind({ querySelectorAll: () => firstGroup.map(view => view.element) });
  assert.equal(h.requests.length, 4);
  assert.equal(h.timers.size, 4);
  const late = h.requests.map(request => request.onload);
  firstGroup.forEach(view => { view.element.isConnected = false; });
  const secondGroup = [h.visual('https://new-a.example.com/'), h.visual('https://new-b.example.com/')];
  h.bind({ querySelectorAll: () => secondGroup.map(view => view.element) });
  assert.equal(h.requests.length, 6, 'the old group’s three queued images never start');
  assert.equal(h.timers.size, 2);
  late.forEach(onload => onload());
  assert.equal(h.remembered.length, 0);
  secondGroup.forEach(view => view.image.load(128));
  assert.equal(h.remembered.length, 2);
  assert.equal(h.timers.size, 0);
});

test('a low-resolution icon remains visible while at most three upgrades are tried and only a better result replaces it', () => {
  const upgrades = ['https://example.com/better-64.png', 'https://example.com/worse-16.png', 'https://example.com/missing.png', 'https://example.com/never.png'];
  const h = harness({ takeFaviconUpgradeCandidates: () => upgrades });
  const v = h.visual(); h.bind(v.root, { targetSize: 64, pixelRatio: 2 });
  const initialImage = v.image;
  initialImage.load(32);
  assert.equal(v.image, initialImage);
  assert.equal(v.image.hidden, false);
  assert.equal(h.requests.length, 2);
  const better = h.requests.at(-1).image;
  better.load(64);
  assert.equal(v.image, better, 'the already loaded image itself is reused');
  assert.equal(v.image.naturalWidth, 64);
  const worse = h.requests.at(-1).image;
  worse.load(16);
  assert.equal(v.image, better, 'a later small source cannot displace the sharper result');
  h.requests.at(-1).image.fail();
  assert.equal(v.image, better);
  assert.equal(v.image.hidden, false);
  assert.equal(h.requests.length, 4, 'one initial image plus three bounded upgrades');
  assert.equal(h.timers.size, 0);
});

test('a sufficient upgrade stops probing immediately and preserves successful measurements for cache ranking', () => {
  const h = harness({ takeFaviconUpgradeCandidates: () => ['https://example.com/fail.png', 'https://example.com/sharp.png', 'https://example.com/unneeded.svg'] });
  const v = h.visual(); h.bind(v.root, { targetSize: 64, pixelRatio: 2 });
  v.image.load(16);
  const initialImage = v.image;
  h.requests.at(-1).image.fail();
  assert.equal(v.image, initialImage);
  const sharp = h.requests.at(-1).image; sharp.load(192);
  assert.equal(v.image, sharp);
  assert.equal(h.requests.length, 3);
  assert.equal(h.remembered.length, 2);
  assert.equal(h.remembered.at(-1).dimensions.width, 192);
  assert.equal(h.remembered.at(-1).dimensions.height, 192);
  assert.equal(h.timers.size, 0);
});

test('forcing a new extraction cancels an old upgrade and keeps the currently visible icon if new candidates fail', () => {
  const h = harness({ takeFaviconUpgradeCandidates: () => ['https://example.com/old-upgrade.png'] });
  const v = h.visual(); h.bind(v.root);
  v.image.load(16);
  const initialImage = v.image, stale = h.requests.at(-1).onload;
  h.bind(v.root, { force: true, candidates: ['https://example.com/new-missing.png'] });
  assert.equal(v.image, initialImage);
  assert.equal(v.image.hidden, false);
  stale();
  assert.equal(h.remembered.length, 1);
  h.requests.at(-1).image.fail();
  assert.equal(v.image, initialImage);
  assert.equal(v.image.hidden, false);
  assert.equal(h.timers.size, 0);
});

test('search icons request 24 CSS pixels while desktop icons use their actual CSS size and device density', () => {
  const h = harness();
  const engine = h.visual('https://engine.example.com/', { engine: true });
  const normal = h.visual('https://normal.example.com/', { width: 80, height: 80 });
  const large = h.visual('https://large.example.com/', { width: 160, height: 160, style: { maxWidth: '60px', maxHeight: '60px' } });
  h.bind({ querySelectorAll: () => [engine.element, normal.element, large.element] });
  assert.deepEqual(h.candidateCalls.map(call => call.options.targetSize), [24, 38, 60]);
  assert.ok(h.candidateCalls.every(call => call.options.pixelRatio === 2));
  [engine, normal, large].forEach(view => view.image.load(192));
  assert.equal(h.timers.size, 0);
});

test('upgrade claims receive attempted URLs and measured dimensions, and detached successes cannot update the cache', () => {
  const h = harness(), v = h.visual(); h.bind(v.root, { targetSize: 64, pixelRatio: 2 });
  v.image.load(16);
  assert.equal(h.upgradeCalls.length, 1);
  assert.equal(h.upgradeCalls[0].options.width, 16);
  assert.equal(h.upgradeCalls[0].options.height, 16);
  assert.equal(h.upgradeCalls[0].options.targetSize, 64);
  assert.equal(h.upgradeCalls[0].options.pixelRatio, 2);
  assert.equal(h.upgradeCalls[0].options.attempted[0], 'https://example.com/favicon.ico');
  const detached = h.visual('https://detached.example.com/'); h.bind(detached.root);
  detached.element.isConnected = false;
  detached.image.load(192);
  assert.equal(h.remembered.length, 1);
  assert.equal(h.timers.size, 0);
});

test('automatic metadata enhancement upgrades a small source without permission prompts or hiding it',async()=>{
 let discoveries=0;const h=harness({recoverIcoArtwork:async()=>null,discoverFavicon:async(site,o)=>{discoveries++;assert.equal(o.requestPermission,false);return {candidates:['https://example.com/declared.svg']};}});
 const v=h.visual();h.bind(v.root,{autoDiscover:true,targetSize:74,pixelRatio:2});v.image.load(16);
 const initial=v.image;await new Promise(setImmediate);
 assert.equal(discoveries,1);assert.equal(v.image,initial);assert.equal(v.image.hidden,false);
 assert.equal(h.requests.at(-1).url,'https://example.com/declared.svg');h.requests.at(-1).image.load(74);
 assert.notEqual(v.image,initial);assert.equal(v.element.dataset.iconQuality,'sharp');
});
test('disabled automatic extraction retains the original source without any metadata requests',async()=>{
 let calls=0;const h=harness({discoverFavicon:async()=>{calls++;}}),v=h.visual();h.bind(v.root,{autoDiscover:false});v.image.load(16);await new Promise(setImmediate);assert.equal(calls,0);assert.equal(v.image.hidden,false);assert.equal(v.element.dataset.iconQuality,'low');
});
test('late metadata cannot hydrate a detached group or replace a subsequent manual binding',async()=>{
 let done;const h=harness({recoverIcoArtwork:async()=>null,discoverFavicon:()=>new Promise(r=>done=r)}),v=h.visual();h.bind(v.root,{autoDiscover:true});v.image.load(16);await new Promise(setImmediate);v.element.isConnected=false;done({candidates:['https://example.com/late.svg']});await new Promise(setImmediate);assert.equal(h.requests.length,1);
});
