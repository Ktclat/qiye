import { getFaviconCandidates, getFaviconQuality, rememberFavicon, takeFaviconUpgradeCandidates } from './favicons.js';

const faviconImageBindings = new WeakMap();
const faviconImageFailures = new Map();
const faviconImageWork = new Set();
const faviconImageQueue = [];
const FAVICON_IMAGE_TIMEOUT = 8_000;
const FAVICON_IMAGE_FAILURE_TTL = 5 * 60 * 1000;
const MAX_FAVICON_IMAGE_REQUESTS = 4;
let activeFaviconImageRequests = 0;

function pumpFaviconImageQueue() {
  while (activeFaviconImageRequests < MAX_FAVICON_IMAGE_REQUESTS && faviconImageQueue.length) {
    const job = faviconImageQueue.shift();
    if (!job.binding.current()) { job.binding.cancel(); continue; }
    activeFaviconImageRequests++;
    let released = false;
    job.start(() => {
      if (released) return;
      released = true;
      activeFaviconImageRequests--;
      pumpFaviconImageQueue();
    });
  }
}

function faviconTargetSize(visual, image, options) {
  if (Number.isFinite(options.targetSize) && options.targetSize > 0) return Math.min(256, options.targetSize);
  if (visual.closest?.('.engine-mark')) return 24;
  const bounds = visual.getBoundingClientRect?.() || {};
  const imageBounds = image.getBoundingClientRect?.() || {};
  let style;
  try { style = globalThis.getComputedStyle?.(image); } catch { /* Detached test or transient DOM. */ }
  const pixels = (value, available) => {
    if (typeof value !== 'string' || !value.trim() || /^(?:auto|none|normal)$/.test(value)) return 0;
    const number = parseFloat(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return value.endsWith('%') ? available > 0 ? available * number / 100 : 0 : number;
  };
  const constrained = (axis, limit, available, rendered) => {
    const size = pixels(style?.[axis], available) || rendered || 0;
    const maximum = pixels(style?.[limit], available);
    return maximum ? Math.min(size || maximum, maximum) : size;
  };
  const width = constrained('width', 'maxWidth', bounds.width, imageBounds.width);
  const height = constrained('height', 'maxHeight', bounds.height, imageBounds.height);
  return Math.min(256, Math.max(16, Math.ceil(Math.max(width, height) || 64)));
}

function markFaviconImageFailure(url) {
  faviconImageFailures.set(url, Date.now() + FAVICON_IMAGE_FAILURE_TTL);
  if (faviconImageFailures.size > 500) faviconImageFailures.delete(faviconImageFailures.keys().next().value);
}

/** Hydrate inert favicon markup. Image requests share a four-slot queue, and
 * quality upgrades use a separate image so a usable icon never flashes away. */
export function bindFaviconImages(root = document, options = {}) {
  // Switching groups can detach a whole grid while its requests are queued.
  // Release those slots immediately instead of waiting for their timeouts.
  for (const binding of [...faviconImageWork]) if (!binding.current()) binding.cancel();
  for (const visual of root.querySelectorAll('.site-visual[data-favicon-site]')) {
    const previous = faviconImageBindings.get(visual);
    if (previous && !options.force) continue;
    previous?.cancel();
    let image = visual.querySelector('.site-favicon');
    const siteUrl = visual.dataset.faviconSite;
    if (!image || !siteUrl) continue;
    const sizeOptions = {
      targetSize: faviconTargetSize(visual, image, options),
      pixelRatio: Number.isFinite(options.pixelRatio) && options.pixelRatio > 0 ? options.pixelRatio : globalThis.devicePixelRatio || 1,
    };
    const provided = Array.isArray(options.candidates) ? options.candidates : getFaviconCandidates(siteUrl, sizeOptions);
    const candidates = [...new Set(provided)].filter(url => typeof url === 'string' && url).slice(0, 12);
    const tried = new Set();
    let candidateIndex = 0, upgradeIndex = 0, upgrades = null, stopped = false, requestTicket = 0;
    let best = null;
    if (previous?.siteUrl === siteUrl && !image.hidden && image.naturalWidth && image.naturalHeight) {
      const url = image.currentSrc || image.src;
      best = { url, width: image.naturalWidth, height: image.naturalHeight, quality: getFaviconQuality(siteUrl, url, { ...sizeOptions, width: image.naturalWidth, height: image.naturalHeight }) };
    }
    const binding = {
      siteUrl,
      current: () => !stopped && visual.isConnected && faviconImageBindings.get(visual) === binding,
      abort: null,
      cancel: () => {
        if (stopped) return;
        stopped = true;
        requestTicket++;
        for (let index = faviconImageQueue.length - 1; index >= 0; index--) if (faviconImageQueue[index].binding === binding) faviconImageQueue.splice(index, 1);
        binding.abort?.();
        faviconImageWork.delete(binding);
      },
    };
    faviconImageBindings.set(visual, binding);
    faviconImageWork.add(binding);
    const complete = () => {
      faviconImageWork.delete(binding);
      if (!best) { image.hidden = true; image.removeAttribute('src'); visual.classList.remove('is-loaded'); }
    };
    const nextUsable = (values, start) => {
      for (let index = start; index < values.length; index++) {
        const url = values[index];
        if (tried.has(url) || !options.force && (faviconImageFailures.get(url) || 0) > Date.now()) continue;
        return { url, index: index + 1 };
      }
      return null;
    };
    const load = (url, background, done) => {
      faviconImageQueue.push({ binding, start: release => {
        const ticket = ++requestTicket;
        let target;
        try { target = background ? new globalThis.Image() : image; }
        catch { release(); complete(); return; }
        let settled = false, timer = null;
        const active = () => !settled && ticket === requestTicket && binding.current();
        const cleanup = abort => {
          if (settled) return false;
          settled = true;
          clearTimeout(timer);
          target.onload = null;
          target.onerror = null;
          if (abort) target.removeAttribute('src');
          binding.abort = null;
          release();
          return true;
        };
        binding.abort = () => cleanup(true);
        const failed = () => {
          if (!active()) { if (!binding.current()) binding.cancel(); else cleanup(true); return; }
          markFaviconImageFailure(url);
          cleanup(true);
          done(false);
        };
        target.onload = () => {
          if (!active()) { if (!binding.current()) binding.cancel(); else cleanup(true); return; }
          const width = target.naturalWidth, height = target.naturalHeight;
          if (!width || !height) { failed(); return; }
          const quality = getFaviconQuality(siteUrl, url, { ...sizeOptions, width, height });
          cleanup(false);
          faviconImageFailures.delete(url);
          try { Promise.resolve(rememberFavicon(siteUrl, url, { width, height })).catch(() => {}); }
          catch { /* Cache quotas do not hide a successfully loaded image. */ }
          if (!best || quality.score > best.quality.score) {
            if (background) {
              // Reuse the already loaded image instead of assigning its URL a
              // second time; this also keeps the concurrency bound meaningful.
              target.className = image.className || 'site-favicon';
              target.alt = '';
              target.draggable = false;
              image.replaceWith(target);
              image = target;
            }
            best = { url, width, height, quality };
            image.hidden = false;
            visual.classList.add('is-loaded');
          }
          done(true);
        };
        target.onerror = failed;
        timer = setTimeout(failed, FAVICON_IMAGE_TIMEOUT);
        target.referrerPolicy = 'no-referrer';
        target.decoding = 'async';
        target.draggable = false;
        if (!background) { target.hidden = true; visual.classList.remove('is-loaded'); }
        tried.add(url);
        try { target.src = url; } catch { failed(); }
      } });
      pumpFaviconImageQueue();
    };
    const advanceUpgrade = () => {
      if (!binding.current()) { binding.cancel(); return; }
      if (best?.quality.adequate) { complete(); return; }
      if (!upgrades) {
        upgrades = takeFaviconUpgradeCandidates(siteUrl, best.url, {
          ...sizeOptions, width: best.width, height: best.height, attempted: [...tried], force: !!options.force,
        }).slice(0, 3);
      }
      const next = nextUsable(upgrades, upgradeIndex);
      if (!next) { complete(); return; }
      upgradeIndex = next.index;
      load(next.url, true, advanceUpgrade);
    };
    const advanceInitial = () => {
      if (!binding.current()) { binding.cancel(); return; }
      const next = nextUsable(candidates, candidateIndex);
      if (!next) { complete(); return; }
      candidateIndex = next.index;
      load(next.url, !!best, loaded => loaded ? advanceUpgrade() : advanceInitial());
    };
    advanceInitial();
  }
}
