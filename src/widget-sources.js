// SPDX-License-Identifier: GPL-3.0-only
import { validateCommunitySource } from './community-format.js';
import { publicHttpsUrl } from './public-json.js';

export const SOURCE_STORAGE_KEY = 'qiye.community.v1';
export const OFFICIAL_WIDGET_SOURCE = 'https://ktclat.github.io/qiye-widgets/index.json';
export const SOURCES_CHANGED = 'qiye:widget-sources-changed';

export function readWidgetSources(storage = globalThis.localStorage) {
  const raw = JSON.parse(storage?.getItem(SOURCE_STORAGE_KEY) || '[]');
  if (!Array.isArray(raw) || raw.length > 21) throw new Error('Invalid widget source list');
  const sources = raw.map(source => ({
    url: publicHttpsUrl(source.url),
    enabled: source.enabled === true,
    catalog: source.catalog ? validateCommunitySource(source.catalog) : null,
  }));
  if (new Set(sources.map(source => source.url)).size !== sources.length) throw new Error('Duplicate widget source');
  if (sources.filter(source => source.url !== OFFICIAL_WIDGET_SOURCE).length > 20) throw new Error('Too many custom widget sources');
  if (!sources.some(source => source.url === OFFICIAL_WIDGET_SOURCE)) sources.unshift({ url: OFFICIAL_WIDGET_SOURCE, enabled: false, catalog: null });
  return sources;
}

export function saveWidgetSources(sources, storage = globalThis.localStorage) {
  // Validate before replacing the last known working source list.
  const encoded = JSON.stringify(sources);
  readWidgetSources({ getItem: () => encoded });
  storage.setItem(SOURCE_STORAGE_KEY, encoded);
  globalThis.dispatchEvent?.(new Event(SOURCES_CHANGED));
}

export function resolveWidgetSource(item, sources = readWidgetSources()) {
  if (item.widget === 'community') {
    const source = sources.find(source => source.url === item.config.source && source.enabled);
    // Installed manifests remain pinned until the user explicitly updates them.
    return source ? { source: source.url, manifest: item.config.manifest } : null;
  }
  const source = sources.find(source => source.url === OFFICIAL_WIDGET_SOURCE && source.enabled);
  const aliases = { focus: 'pomodoro', calculator: 'converter', 'base-converter': 'converter', hotlinks: 'hotsearch' };
  const manifest = source?.catalog?.widgets.find(manifest => manifest.id === 'qiye.' + (aliases[item.widget] || item.widget));
  return manifest ? { source: source.url, manifest } : null;
}
