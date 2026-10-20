import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATE,validateImport} from '../src/core.js';
import {widgetCacheKey} from '../src/plugin-cache.js';
import {fetchPluginHotboard} from '../src/plugin-hotboard.js';

test('old backups migrate to 200ms and configurable delays round trip strictly',()=>{
 const state=structuredClone(DEFAULT_STATE);delete state.settings.dragHoldMs;
 assert.equal(validateImport(state).settings.dragHoldMs,200);
 for(const value of [100,200,250,600,2000,3000]){state.settings.dragHoldMs=value;assert.equal(validateImport(state).settings.dragHoldMs,value);}
 for(const value of [0,99,200.5,3001,'200',null,NaN]){state.settings.dragHoldMs=value;assert.throws(()=>validateImport(state));}
});
test('official variants share a release cache, while releases and third party queries stay separate',()=>{
 const source='https://ktclat.github.io/qiye-widgets/index.json';
 const plugin=(entry,release='1.0.0',origin=source)=>({source:origin,manifest:{entry,release}});
 const a=plugin('https://ktclat.github.io/qiye-widgets/widget.html?widget=notes');
 const b=plugin('https://ktclat.github.io/qiye-widgets/widget.html?widget=clock');
 assert.equal(widgetCacheKey(a),widgetCacheKey(b));
 assert.notEqual(widgetCacheKey(a),widgetCacheKey({...a,manifest:{...a.manifest,release:'1.0.1'}}));
 a.source=b.source='https://example.org/index.json';assert.notEqual(widgetCacheKey(a),widgetCacheKey(b));
});
test('cached and in-flight hotboard results cannot bypass a revoked permission',async()=>{
 let allowed=true,reads=0,finish;
 const options={permission:async()=>{if(!allowed)throw Error('revoked');},now:()=>999999,fetcher:async()=>{reads++;return {items:[]};}};
 await fetchPluginHotboard('zhihu',options);allowed=false;
 await assert.rejects(fetchPluginHotboard('zhihu',options),/revoked/);assert.equal(reads,1);
 allowed=true;const job=fetchPluginHotboard('weibo',{...options,fetcher:()=>new Promise(resolve=>finish=resolve)});
 await Promise.resolve();allowed=false;finish({items:[]});await assert.rejects(job,/revoked/);
});
