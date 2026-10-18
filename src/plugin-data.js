// SPDX-License-Identifier: GPL-3.0-only
// The host validates an opaque JSON envelope; widget schemas belong to their source.
import { plain, byteLength, invalid } from './validation.js';

export const PLUGIN_DATA_LIMIT = 4 * 1024 * 1024;
export function validatePluginData(value, path = 'plugin') {
  plain(value, path);
  let nodes = 0;
  function visit(entry, depth) {
    if (++nodes > 50000 || depth > 30) invalid(path, 'JSON nesting limit exceeded');
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number' && Number.isFinite(entry)) return;
    if (typeof entry !== 'object') invalid(path, 'JSON required');
    if (!Array.isArray(entry)) plain(entry, path);
    for (const [key, child] of Object.entries(entry)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) invalid(path, '不安全字段 / Unsafe JSON key');
      visit(child, depth + 1);
    }
  }
  visit(value, 0);
  const encoded = JSON.stringify(value);
  if (byteLength(encoded) > PLUGIN_DATA_LIMIT) invalid(path, '4 MiB maximum');
  return JSON.parse(encoded);
}
