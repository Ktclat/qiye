import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_STATE,validateImport} from '../src/core.js';
import {createLayout,validateLayout,layoutImportPlan,APPEARANCE_KEYS} from '../src/layout-sharing.js';
import {validateCommunityManifest,validateCommunitySource,validateCommunityData} from '../src/community-format.js';
import {publicHttpsUrl,fetchPublicJson} from '../src/public-json.js';
import {sourceFromShareLink} from '../src/sharing-ui.js';
import {layoutShareLink} from '../src/layout-sharing.js';
const manifest=JSON.parse(readFileSync(new URL('../community/widgets/qiye.counter.json',import.meta.url)));
const state=()=>structuredClone(DEFAULT_STATE);
test('sharing strips widget content and personal configuration',()=>{
 const s=state();s.items.find(i=>i.widget==='notes').data.notes='secret note';s.items.find(i=>i.widget==='countdown').config.title='secret event';
 const shared=createLayout(s);assert.ok(!JSON.stringify(shared).includes('secret'));assert.ok(shared.items.filter(i=>i.type==='widget').every(i=>!('data'in i)));assert.ok(!('settings'in shared));
});
test('optional appearance uses only real current settings and cannot carry custom wallpaper or account data',()=>{
 const s=state();s.settings.customWallpaper='https://example.org/private.jpg';const shared=createLayout(s,{appearance:true});assert.deepEqual(Object.keys(shared.appearance),APPEARANCE_KEYS);assert.ok(APPEARANCE_KEYS.every(k=>k in s.settings));assert.ok(!JSON.stringify(shared).includes('private.jpg'));
});
test('folder and item identifiers are remapped together without mutating current desktop',()=>{
 const s=state(),shared=createLayout(s),before=JSON.stringify(s),plan=layoutImportPlan(s,shared,{skipDuplicates:false});assert.equal(JSON.stringify(s),before);assert.equal(new Set(plan.state.items.map(i=>i.id)).size,plan.state.items.length);for(const i of plan.state.items.slice(s.items.length).filter(i=>i.folderId))assert.ok(plan.state.items.some(f=>f.id===i.folderId&&f.type==='folder'&&f.groupId===i.groupId));assert.equal(plan.groups,1);
});
test('merge respects chosen target and reports duplicate URLs',()=>{
 const s=state(),plan=layoutImportPlan(s,createLayout(s),{mode:'merge',targetGroupId:'code'});assert.ok(plan.skipped>0);assert.equal(plan.state.groups.length,s.groups.length);assert.ok(plan.state.items.slice(s.items.length).every(i=>i.groupId==='code'));assert.equal(plan.state.activeGroupId,'code');
});
test('import resets network consent and never accepts embedded widget data',()=>{
 const value=createLayout(state());const weather=value.items.find(i=>i.widget==='weather');weather.config.enabled=true;assert.equal(validateLayout(value).items.find(i=>i.widget==='weather').config.enabled,false);weather.data={secret:'bad'};assert.throws(()=>validateLayout(value));
});
test('sharing rejects unsupported format, oversized data, unknown fields and empty selection',()=>{
 const value=createLayout(state());assert.throws(()=>validateLayout({...value,version:99}));assert.throws(()=>validateLayout({...value,data:{}}));assert.throws(()=>validateLayout(' '.repeat(2*1024*1024+1)));assert.throws(()=>createLayout(state(),{groupIds:[]}));assert.throws(()=>layoutImportPlan(state(),value,{groupIds:[]}));assert.throws(()=>validateLayout({...value,appearance:{language:'zh-CN'}}));
});
test('sharing rejects credentials and unsafe links',()=>{
 for(const url of ['https://user:password@example.com','javascript:alert(1)']){const value=createLayout(state());value.items.find(i=>i.type==='link').url=url;assert.throws(()=>validateLayout(value));}
});
test('share URL round trip does not fetch source',()=>assert.equal(sourceFromShareLink(layoutShareLink('https://example.com/layout.json')),'https://example.com/layout.json'));
test('public source URLs reject credentials, raw IPs and non HTTPS',()=>{
 for(const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://0x7f000001','https://[::1]','https://localhost','https://device.local','https://localhost.','https://device.local.','https://example.com:8443'])assert.throws(()=>publicHttpsUrl(url));assert.equal(publicHttpsUrl('https://example.com/a.json'),'https://example.com/a.json');
});
test('public JSON requests omit cookies and referrals and refuse redirects',async()=>{
 const value=await fetchPublicJson('https://example.org/a.json',{fetcher:async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');return new Response('{"ok":true}');}});assert.equal(value.ok,true);
});
test('streamed JSON byte cap applies even without content-length',async()=>{
 await assert.rejects(fetchPublicJson('https://example.org/a.json',{maxBytes:4,fetcher:async()=>new Response('123456789')}));await assert.rejects(fetchPublicJson('https://example.org/a.json',{fetcher:async()=>new Response('<html>')}));
});
test('public JSON cancellation and HTTP errors surface without parsing',async()=>{
 const abort=new AbortController();abort.abort();await assert.rejects(fetchPublicJson('https://example.org/a.json',{signal:abort.signal,fetcher:async()=>new Response('{}')}));await assert.rejects(fetchPublicJson('https://example.org/a.json',{fetcher:async()=>new Response('{}',{status:404})}));
});
test('community manifest requires version and mandatory sizes, rejects host code and local URLs',()=>{
 assert.deepEqual(validateCommunityManifest(manifest),manifest);
 for(const value of [{...manifest,version:3},{...manifest,sizes:['1x1']},{...manifest,entry:'http://localhost/'},{...manifest,code:'alert(1)'},{...manifest,previews:[{size:'8x8',url:'https://example.org/a.png'}]}])assert.throws(()=>validateCommunityManifest(value));
});
test('community source accepts one author manifest or a bounded directory, no duplicate ids',()=>{
 assert.equal(validateCommunitySource(manifest).widgets.length,1);assert.throws(()=>validateCommunitySource({format:'qiye-widget-source',version:1,name:'Test',widgets:[manifest,manifest]}));
});
test('community state is JSON with a UTF-8 byte limit',()=>{
 assert.deepEqual(validateCommunityData({value:'{"count":2}'}),{value:'{"count":2}'});for(const value of ['not json','"'+'文'.repeat(22000)+'"'])assert.throws(()=>validateCommunityData({value}));assert.throws(()=>validateCommunityData({value:'null',notes:'secret'}));
});
test('community instances validate in desktop and export without instance data',()=>{
 const s=state();s.items.push({id:'test-community',groupId:'home',type:'widget',widget:'community',title:'Counter',size:'2x2',config:{manifest,source:'https://example.org/index.json'},data:{value:'{"secret":1}'}});assert.equal(validateImport(s).items.at(-1).widget,'community');const imported=layoutImportPlan(s,createLayout(s));assert.equal(imported.state.items.at(-1).data.value,'null');
});
test('community instance rejects undeclared dimensions',()=>{
 const s=state();s.items.push({id:'test-community',groupId:'home',type:'widget',widget:'community',title:'Counter',size:'4x2',config:{manifest:{...manifest,sizes:['1x1','2x2']},source:'https://example.org/index.json'},data:{value:'null'}});assert.throws(()=>validateImport(s));
});
