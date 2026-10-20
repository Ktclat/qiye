import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_STATE, validateImport } from '../src/core.js';
import { readWidgetSources, saveWidgetSources, resolveWidgetSource, OFFICIAL_WIDGET_SOURCE } from '../src/widget-sources.js';
import { validatePluginData, PLUGIN_DATA_LIMIT } from '../src/plugin-data.js';
import { validateCommunitySource, validateCommunityManifest } from '../src/community-format.js';
import { performPluginCall } from '../src/plugin-host.js';

const manifest={format:'qiye-widget',version:2,apiVersion:2,id:'qiye.notes',name:'Notes',description:'Independent notes',author:'Qiye',release:'1.0.0',entry:'https://ktclat.github.io/qiye-widgets/releases/1.0.0/widget.html?widget=notes',repository:'https://github.com/Ktclat/qiye-widgets',license:'GPL-3.0-only',sizes:['1x1','2x2'],previews:[],capabilities:[]};
const catalog={format:'qiye-widget-source',version:1,name:'Widgets',widgets:[manifest]};
const storage=initial=>{let value=JSON.stringify(initial);return {getItem:()=>value,setItem:(key,next)=>{value=next;}};};
test('fresh shell has no widgets and never enables its preset source implicitly',()=>{
 assert.equal(DEFAULT_STATE.items.filter(item=>item.type==='widget').length,0);
 assert.deepEqual(readWidgetSources(storage([])),[{url:OFFICIAL_WIDGET_SOURCE,enabled:false,catalog:null}]);
 const sources=readWidgetSources(storage([{url:OFFICIAL_WIDGET_SOURCE,catalog}]));
 assert.equal(sources[0].enabled,false);
 assert.equal(resolveWidgetSource({widget:'notes'},sources),null);
 assert.equal(readWidgetSources(storage([{url:'https://widgets.example.com/index.json',catalog}]))[1].enabled,false);
});
test('source consent is persistent, disabling preserves cached metadata and installed content',()=>{
 const local=storage([]),enabled=[{url:OFFICIAL_WIDGET_SOURCE,enabled:true,catalog}];
 saveWidgetSources(enabled,local);assert.equal(readWidgetSources(local)[0].enabled,true);
 assert.equal(resolveWidgetSource({widget:'notes'},enabled).manifest.id,'qiye.notes');
 saveWidgetSources([{...enabled[0],enabled:false}],local);
 assert.deepEqual(readWidgetSources(local)[0].catalog,catalog);
 assert.equal(resolveWidgetSource({widget:'notes'},readWidgetSources(local)),null);
});
test('installed manifest stays pinned when the subscribed catalogue changes',()=>{
 const item={widget:'community',config:{source:OFFICIAL_WIDGET_SOURCE,manifest},data:{value:'{"private":true}'}};
 const sources=[{url:OFFICIAL_WIDGET_SOURCE,enabled:true,catalog:{...catalog,widgets:[{...manifest,release:'2.0.0'}]}}];
 assert.equal(resolveWidgetSource(item,sources).manifest.release,'1.0.0');
 assert.equal(item.data.value,'{"private":true}');
});
test('host rejects unsupported API versions, capabilities and unsafe source URLs',()=>{
 for(const patch of [{apiVersion:3},{capabilities:['tabs']},{entry:'javascript:alert(1)'}])assert.throws(()=>validateCommunityManifest({...manifest,...patch}));
 assert.throws(()=>readWidgetSources(storage([{url:'http://localhost/source.json'}])));
 assert.throws(()=>readWidgetSources(storage([{url:OFFICIAL_WIDGET_SOURCE},{url:OFFICIAL_WIDGET_SOURCE}])));
});
test('catalogue supports hundreds of widgets with unique identifiers and bounded bytes',()=>{
 assert.equal(validateCommunitySource({...catalog,widgets:Array.from({length:300},(_,i)=>({...manifest,id:'qiye.widget-'+i}))}).widgets.length,300);
 assert.throws(()=>validateCommunitySource({...catalog,widgets:[manifest,manifest]}));
});
test('opaque widget data round trips without fetching or discarding an unavailable implementation',()=>{
 const state=structuredClone(DEFAULT_STATE);state.items.push({id:'external',type:'widget',widget:'unknown-plugin',title:'Keep me',size:'2x2',groupId:'home',config:{future:{value:true}},data:{notes:'private data'}});
 assert.deepEqual(validateImport(state),state);
});
test('opaque storage rejects pollution, cycles, non-JSON and unbounded data',()=>{
 for(const value of [JSON.parse('{"__proto__":{}}'),{n:Infinity},{fn:()=>{}},{notes:'x'.repeat(PLUGIN_DATA_LIMIT)}])assert.throws(()=>validatePluginData(value));
 const circular={};circular.self=circular;assert.throws(()=>validatePluginData(circular));
});
test('a stopped session cannot write or call a privileged host capability',async()=>{
 let writes=0;
 await assert.rejects(performPluginCall('save',{value:{}},{active:()=>false,host:{savePlugin:()=>writes++}}));
 assert.equal(writes,0);
});

test('a gallery preview cannot persist, open windows or invoke host capabilities',async()=>{
 let calls=0;
 const host=new Proxy({}, {get(){calls++;throw new Error('Host accessed');}});
 for(const method of ['save','storage','open','settings','close','expand','toast','openUrl','wallpaper','bookmarks','geolocation']){
  await assert.rejects(performPluginCall(method,{}, {active:()=>true,preview:true,host}),/预览/);
 }
 assert.equal(calls,0);
});
test('stale plugin writes are refused before persistence and cannot change a sibling',async()=>{
 const item={id:'a',widget:'community',config:{source:OFFICIAL_WIDGET_SOURCE,manifest},data:{value:'{"data":1}'}};
 let writes=0;const host={getState:()=>({items:[item,{id:'b',data:{secret:true}}]}),savePlugin:()=>writes++};
 await assert.rejects(performPluginCall('save',{value:{data:2},expected:'old'},{item,plugin:{manifest},host,active:()=>true}));
 assert.equal(writes,0);
 await assert.rejects(performPluginCall('bookmarks',{action:'getTree'},{item,plugin:{manifest},host,active:()=>true}),/Capability/);
 await assert.rejects(performPluginCall('geolocation',{}, {item,plugin:{manifest},host,active:()=>true}),/Capability/);
 await assert.rejects(performPluginCall('close',{}, {item,plugin:{manifest},host,active:()=>true}),/No widget window/);
});
test('shell source and standalone bundle do not contain widget implementations',()=>{
 const files=readdirSync(new URL('../src',import.meta.url));
 for(const name of ['weather.js','converter.js','widgets.css','map-workspace.js','lunar-engine.js','widget-extensions.js'])assert.ok(!files.includes(name),name);
 const preview=readFileSync(new URL('../Qiye-preview.html',import.meta.url),'utf8');
 assert.doesNotMatch(preview,/const __weather\s*=|const __converter\s*=|const __lunar_engine\s*=/);
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
 assert.doesNotMatch(manifest.content_security_policy.extension_pages,/unsafe-eval|unsafe-inline/);
 assert.deepEqual(manifest.sandbox.pages,['widget-sandbox.html']);
 assert.doesNotMatch(manifest.content_security_policy.sandbox,/allow-same-origin|unsafe-eval/);
});
