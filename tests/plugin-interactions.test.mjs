import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPluginHotboard } from '../src/plugin-hotboard.js';
import { validatePluginMenu, performPluginCall } from '../src/plugin-host.js';

test('hotboard bridge accepts only fixed platforms and never a supplied URL',async()=>{
 for(const type of ['https://example.com/private','zhihu&key=secret','../admin','github','__proto__',null])
  await assert.rejects(fetchPluginHotboard(type),/Unsupported/);
 let requested;
 const result=await fetchPluginHotboard('zhihu',{permission:async url=>{requested=url;},fetcher:async(url,options)=>{assert.equal(url,requested);assert.equal(options.maxBytes,1024*1024);return {list:[{title:'Public news'}]};},now:()=>10000});
 assert.equal(requested,'https://uapis.cn/api/v1/misc/hotboard?type=zhihu');
 assert.equal(result.list[0].title,'Public news');
});
test('duplicate hotboard calls coalesce and a failed request may be retried',async()=>{
 let count=0,release;const response=new Promise(resolve=>{release=resolve;});
 const options={permission:async()=>{},fetcher:()=>{count++;return response;},now:()=>20000};
 const a=fetchPluginHotboard('weibo',options),b=fetchPluginHotboard('weibo',options);
 await Promise.resolve();release({list:[]});assert.deepEqual(await a,await b);assert.equal(count,1);
 await assert.rejects(fetchPluginHotboard('baidu',{...options,fetcher:async()=>{throw new Error('Offline');}}),/Offline/);
 await fetchPluginHotboard('baidu',{...options,fetcher:async()=>({list:[]})});
});
test('preview and revoked sessions cannot request host network access',async()=>{
 for(const scope of [{active:()=>false},{active:()=>true,preview:true}])await assert.rejects(performPluginCall('hotboard',{platform:'zhihu'},scope));
});

test('MV3 hotboard access requires the API host permission without prompting on load',async()=>{
 const previous=globalThis.chrome;let requested=false,allowed=false;
 globalThis.chrome={runtime:{id:'test-extension'},permissions:{contains:async query=>{assert.deepEqual(query,{origins:['https://uapis.cn/*']});return allowed;}}};
 try{
  const options={fetcher:async()=>{requested=true;return {list:[]};},now:()=>40000};
  await assert.rejects(fetchPluginHotboard('hupu',options),/授权热榜访问/);
  assert.equal(requested,false);allowed=true;
  await fetchPluginHotboard('hupu',options);assert.equal(requested,true);
 }finally{if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;}
});
test('plugin menu descriptors are bounded and unique with known icons only',()=>{
 assert.deepEqual(validatePluginMenu(null),[]);
 const menu=validatePluginMenu([{id:'settings',label:'Settings',icon:'settings'},{id:'settings',label:'Duplicate'},{id:'x" onclick="alert(1)',label:'Bad'},{id:'export',label:'X'.repeat(100),icon:'<script>'}]);
 assert.equal(menu.length,2);assert.equal(menu[1].label.length,60);assert.equal(menu[1].icon,'grid');
});
