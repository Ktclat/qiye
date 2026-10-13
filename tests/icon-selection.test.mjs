import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIconSelection, iconSelectionLabel } from '../src/icon-selection.js';
import { DEFAULT_STATE, validateImport, exportState } from '../src/core.js';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMI6LkDAALoAbn/7VoOAAAAAElFTkSuQmCC';
test('chosen native assets accept bounded HTTPS URLs or validated static uploads only',()=>{
 assert.equal(normalizeIconSelection('https://cdn.example.com/icons/a.svg?v=2#view'),'https://cdn.example.com/icons/a.svg?v=2');
 assert.equal(normalizeIconSelection(PNG),PNG);
 for(const u of ['http://example.com/icon.png','javascript:alert(1)','https://user:pass@example.com/icon','https://example.com:8000/a','https://localhost/a','https://10.0.0.1/a','https://test.local/a','https://0x7f000001/a','data:image/svg+xml,<svg/>','data:image/png;base64,invalid',{},'https://example.com/\nsecret'])assert.equal(normalizeIconSelection(u),null,JSON.stringify(u));
});
test('chosen native image is retained exactly by storage, export, restore and duplication',()=>{
 for(const url of ['https://cdn.example.com/icon-180.png',PNG]){
  const data=structuredClone(DEFAULT_STATE),link=data.items.find(i=>i.type==='link');
  link.iconUrl=url;data.items.push({...link,id:'duplicate-safe-icon'});
  const copy=validateImport(exportState(data));assert.equal(copy.items.find(i=>i.id===link.id).iconUrl,url);assert.equal(copy.items.at(-1).iconUrl,url);
 }
});
test('automatic icons need no explicit image and invalid selection rejects the whole import',()=>{
 const data=structuredClone(DEFAULT_STATE);assert.equal(validateImport(data).items.find(i=>i.type==='link').iconUrl,undefined);
 data.items.find(i=>i.type==='link').iconUrl='javascript:alert(1)';assert.throws(()=>validateImport(data));
});
test('sidebar accent defaults to neutral and only explicit valid choices are restored',()=>{
 const data=structuredClone(DEFAULT_STATE);delete data.settings.useThemeColor;
 assert.throws(()=>validateImport(data));
 data.settings.useThemeColor=true;assert.equal(validateImport(exportState(data)).settings.useThemeColor,true);
 data.settings.useThemeColor='true';assert.throws(()=>validateImport(data));
});
test('icon labels report actual supplied dimensions without claiming synthesized HD',()=>{
 assert.equal(iconSelectionLabel('https://example.com/a.png',16,16),'16 × 16');
 assert.equal(iconSelectionLabel('https://example.com/a.png'),'等待图片');
 assert.equal(iconSelectionLabel('https://example.com/a.svg'),'SVG · 矢量');
 assert.equal(iconSelectionLabel(PNG),'本机上传');
});
