// SPDX-License-Identifier: GPL-3.0-only
import { validatePluginData } from './plugin-data.js';
export function newWidgetData(type) { return type==='community'?{value:'null'}:{}; }
export function validateWidgetData(type,raw,path='data') { return validatePluginData(raw,path); }
export function widgetContentSummary(items) {
 return items.reduce((summary,item)=>{
  if(item.type!=='widget')return summary;
  let data=item.data;
  if(item.widget==='community')try{data=JSON.parse(data.value)?.data||{};}catch{data={};}
  summary.todos+=Array.isArray(data.todos)?data.todos.length:0;
  summary.notesLength+=typeof data.notes==='string'?data.notes.length:0;
  summary.notesLength+=Array.isArray(data.entries)?data.entries.reduce((sum,entry)=>sum+(typeof entry.text==='string'?entry.text.length:0),0):0;
  return summary;
 },{todos:0,notesLength:0});
}
