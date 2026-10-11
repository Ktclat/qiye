// SPDX-License-Identifier: GPL-3.0-only
/** Opt-in search history for this browser only; never part of desktop backups. */
export const SEARCH_HISTORY_KEY = 'qiye.search-history.v1';
export const MAX_SEARCH_HISTORY_ITEMS = 20;
export const MAX_SEARCH_QUERY_LENGTH = 240;
export const MAX_SEARCH_HISTORY_BYTES = 24 * 1024;

function historyQuery(value) {
  if (typeof value !== 'string') return null;
  const query = value.trim();
  // Never truncate a query: choosing a saved entry must repeat what was searched.
  if (!query || query.length > MAX_SEARCH_QUERY_LENGTH * 2 ||
    Array.from(query).length > MAX_SEARCH_QUERY_LENGTH || /[\u0000-\u001f\u007f]/u.test(query)) return null;
  return query;
}

function parseSearchHistory(raw) {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== 'string' || raw.length > MAX_SEARCH_HISTORY_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_SEARCH_HISTORY_BYTES) return [];
  let values;
  try { values = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(values) || values.length > MAX_SEARCH_HISTORY_ITEMS) return [];
  const recent = [];
  for (const value of values) {
    const query = historyQuery(value);
    if (!query) return [];
    if (!recent.includes(query)) recent.push(query);
  }
  return recent;
}

/** Disabled means no storage access, including no localStorage getter access. */
export function readSearchHistory(enabled) {
  if (enabled !== true) return [];
  try { return parseSearchHistory(globalThis.localStorage?.getItem(SEARCH_HISTORY_KEY)); }
  catch { return []; }
}

/** Best-effort local persistence must never prevent the actual search. */
export function rememberSearch(query, enabled) {
  if (enabled !== true) return;
  const normalized = historyQuery(query);
  if (!normalized) return;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const previous = parseSearchHistory(storage.getItem(SEARCH_HISTORY_KEY));
    const next = [normalized, ...previous.filter(entry => entry !== normalized)].slice(0, MAX_SEARCH_HISTORY_ITEMS);
    const serialized = JSON.stringify(next);
    if (serialized.length > MAX_SEARCH_HISTORY_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_SEARCH_HISTORY_BYTES) return;
    storage.setItem(SEARCH_HISTORY_KEY, serialized);
  } catch { /* Private browsing, quota and disabled storage cannot block search. */ }
}

/** An explicit clear action is allowed even while recording is disabled. */
export function clearSearchHistory() {
  try { globalThis.localStorage?.removeItem(SEARCH_HISTORY_KEY); }
  catch { /* Keep the rest of the desktop usable when storage is unavailable. */ }
}
