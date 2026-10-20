import { readFileSync } from 'node:fs';
export const INSTALLED_STATE = JSON.parse(readFileSync(new URL('./fixtures/installed-desktop.json',import.meta.url),'utf8'));
INSTALLED_STATE.settings.dragHoldMs=200;
import assert from 'node:assert/strict';

export function widgetData(state, type = 'notes') {
  let item = state.items.find(item => item.type === 'widget' && item.widget === type);
  if(!item){item=structuredClone(INSTALLED_STATE.items.find(item=>item.widget===type));state.items.push(item);}
  assert.ok(item, `fixture must contain a ${type} widget`);
  return item.data;
}

export function withNote(state, text, updatedAt = state.updatedAt) {
  const result = structuredClone(state);
  result.updatedAt = updatedAt;
  widgetData(result).notes = text;
  return result;
}
