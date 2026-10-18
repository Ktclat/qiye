// SPDX-License-Identifier: GPL-3.0-only
import { TILE_SIZES } from './widget-sizes.js';
import { validateCommunityManifest } from './community-format.js';
import { publicHttpsUrl } from './public-json.js';
import { keys, string } from './validation.js';
import { validatePluginData } from './plugin-data.js';
export const WIDGET_API_VERSION = 2;
export function getWidgetDefinition(type) {
 if(typeof type!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(type)||['constructor','prototype'].includes(type))return undefined;
 return {type,title:type,sizes:TILE_SIZES,builtin:false};
}
export function listWidgetDefinitions() { return []; }
export function newWidgetConfig() { return {}; }
export function validateWidgetConfig(type,raw,path='config') {
 if(type==='community'){
  keys(raw,['manifest','source'],path);
  return {manifest:validateCommunityManifest(raw.manifest),source:publicHttpsUrl(string(raw.source,path+'.source',2048))};
 }
 return validatePluginData(raw,path);
}
