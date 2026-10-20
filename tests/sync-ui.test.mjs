import { INSTALLED_STATE as DEFAULT_STATE } from './state-fixtures.mjs';
import { t, getLocale } from '../src/i18n.js';
import { widgetData, withNote } from './state-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateImport, exportState } from '../src/core.js';
import { createWebDAVSync, webDAVStateFingerprint } from '../src/webdav.js';

const source = (await readFile(new URL('../src/sync-ui.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const productionCode = `${source}\nglobalThis.controllerFactory = createSyncController;`;
const copy = value => structuredClone(value);
const config = { enabled:true, endpoint:'https://dav.example.test/backups/', path:'qiye.json',
  username:'test-user', password:'test-only-password', autoSync:false };

/** Production controller + production protocol client; only DOM, storage and HTTP are adapters. */
async function harness({ baseline = false, automatic = false, applyFailure = false } = {}) {
  let record = null, local = copy(DEFAULT_STATE), remote = null, etag = 1;
  let form = null, editing = false, clock = 1000000, timerID = 0;
  const timers = new Map(), requests = [], events = [], dialogs = [], toasts = [], exports = [];
  const elements = { '#webdav-status':{textContent:'',dataset:{}}, '#webdav-last-sync':{textContent:''} };
  const client = createWebDAVSync({
    store:{get:async()=>record?copy(record):null,set:async value=>{record=copy(value);},remove:async()=>{record=null;}},
    currentState:async()=>copy(local), permissionCheck:async()=>{}, lock:operation=>operation(),
    fetchImpl:async(url,options)=>{
      requests.push({url,...options});
      if(options.method==='GET')return remote?new Response(exportState(remote),{headers:{ETag:`"e${etag}"`}}):new Response(null,{status:404});
      if((options.headers['If-None-Match']==='*'&&remote)||(options.headers['If-Match']&&options.headers['If-Match']!==`"e${etag}"`))return new Response(null,{status:412});
      remote=validateImport(options.body);etag++;return new Response(null,{status:204});
    }
  });
  await client.saveConfig({...config,autoSync:automatic});
  if(baseline)await client.synchronize(local,{manual:true});
  requests.length=0;
  const sandbox = vm.createContext({t, getLocale, permissionEpoch:()=>0, PERMISSIONS_CHANGED:"qiye:permissions-changed",
    Promise,Intl,console,
    Date:class extends Date {static now(){return clock;}},
    document:{hidden:false,querySelector:selector=>selector==='#webdav-form'?form:elements[selector]||null,querySelectorAll:()=>[]},
    FormData:class {constructor(value){this.fields=value.fields;}get(key){return this.fields[key]??null;}has(key){return Object.hasOwn(this.fields,key);}},
    setTimeout:(callback,delay)=>{const id=++timerID;timers.set(id,{callback,delay});return id;},
    clearTimeout:id=>timers.delete(id),
    icon:()=>'<svg></svg>',
    loadWebDAVConfig:()=>client.loadConfig(),saveWebDAVConfig:value=>{events.push('save-config');return client.saveConfig(value);},
    clearWebDAVConfig:()=>client.clearConfig(),getWebDAVStatus:()=>client.status(),
    requestWebDAVPermission:value=>{events.push({permission:value.endpoint});return Promise.resolve(true);},
    testWebDAVConnection:value=>client.testConnection(value),
    syncWebDAV:(state,options)=>{events.push({sync:copy(options)});return client.synchronize(state,options);},
    completeWebDAVDownload:(result,state)=>client.completeDownload(result,state)
  });
  new vm.Script(productionCode,{filename:'sync-ui-production-integration.js'}).runInContext(sandbox);
  const controller = sandbox.controllerFactory({
    getState:()=>copy(local),beforeSync:async()=>{events.push('before-sync');},
    applyRemote:async(state,expected)=>{
      events.push('apply-remote');
      if(applyFailure)throw new Error('本机保存失败，请重试。');
      assert.equal(await webDAVStateFingerprint(local),expected);
      local={...validateImport(state),updatedAt:local.updatedAt+1};return copy(local);
    },
    toast:(message,callback,label)=>toasts.push({message,callback,label}),
    openDialog:(kind,data)=>{form=null;dialogs.push({kind,data});},closeDialog:()=>events.push('close-dialog'),
    exportBackup:state=>exports.push(copy(state)),refreshPanel:()=>events.push('refresh-panel'),isEditing:()=>editing
  });
  await controller.init();
  return {controller,client,requests,events,dialogs,toasts,exports,
    get local(){return copy(local);},get remote(){return remote?copy(remote):null;},
    setLocal:value=>{local=copy(value);},setRemote:value=>{remote=copy(value);etag++;},
    setEditing:value=>{editing=value;},setForm:fields=>{form={fields};return form;},
    async fireTimer(){assert.ok(timers.size,'a check must be scheduled');const [id,timer]=timers.entries().next().value;timers.delete(id);clock+=Math.max(timer.delay,60001);await timer.callback();},
    get timerCount(){return timers.size;},get message(){return elements['#webdav-status'].textContent;}
  };
}

test('manual sync requests permission before local persistence and remote requests',async()=>{
  const h=await harness();
  await h.controller.handleAction('webdav-sync');
  assert.equal(typeof h.events[0],'object');
  assert.equal(h.events[0].permission,config.endpoint);
  assert.equal(h.events[1],'before-sync');
  assert.equal(h.requests.filter(request=>request.method==='PUT').length,1);
  assert.equal((await h.client.status()).lastAction,'uploaded');
  assert.equal(h.dialogs.length,0);
  h.controller.dispose();
});

test('remote download is reviewed, rechecked and applied only after the user chooses it',async()=>{
  const h=await harness({baseline:true});
  h.setRemote(withNote(h.local, '来自另一台设备'));
  await h.controller.handleAction('webdav-sync');
  assert.equal(h.dialogs.at(-1).kind,'sync-review');
  assert.notEqual(widgetData(h.local).notes,'来自另一台设备');
  assert.equal(h.events.includes('apply-remote'),false);
  await h.controller.handleAction('webdav-use-remote');
  assert.equal(widgetData(h.local).notes,'来自另一台设备');
  assert.equal((await h.client.status()).lastAction,'downloaded');
  assert.equal(h.events.filter(event=>event==='apply-remote').length,1);
  assert.equal(h.dialogs.length,1,'rechecking a valid download must not show a false conflict');
  assert.equal(h.requests.every(request=>request.method==='GET'),true);
  h.controller.dispose();
});

test('changing remote after a review shows a new review rather than replacing local content',async()=>{
  const h=await harness({baseline:true});
  h.setRemote(withNote(h.local, 'remote first'));
  await h.controller.handleAction('webdav-sync');
  h.setRemote(withNote(h.local, 'remote newer'));
  await h.controller.handleAction('webdav-use-remote');
  assert.equal(h.events.includes('apply-remote'),false);
  assert.equal(h.dialogs.length,2);
  assert.equal(h.dialogs.at(-1).data.result.reason,'review-stale');
  assert.notEqual(widgetData(h.local).notes,'remote newer');
  h.controller.dispose();
});

test('failed local save is never acknowledged as a completed download',async()=>{
  const h=await harness({baseline:true,applyFailure:true});
  h.setRemote(withNote(h.local, 'remote replacement'));
  await h.controller.handleAction('webdav-sync');
  await h.controller.handleAction('webdav-use-remote');
  assert.match(h.message,/本机保存失败/);
  assert.equal((await h.client.status()).lastAction,'uploaded');
  assert.notEqual(widgetData(h.local).notes,'remote replacement');
  h.controller.dispose();
});

test('automatic remote changes prompt a review and never apply over the desktop',async()=>{
  const h=await harness({baseline:true,automatic:true});
  h.setRemote(withNote(h.local, 'automatic remote update'));
  await h.fireTimer();
  assert.equal(h.dialogs.length,0,'automatic checks should offer a toast, not force-open a modal');
  assert.equal(h.events.includes('apply-remote'),false);
  const notice=h.toasts.find(item=>item.label==='查看');
  assert.ok(notice);
  notice.callback();
  assert.equal(h.dialogs.at(-1).kind,'sync-review');
  assert.notEqual(widgetData(h.local).notes,'automatic remote update');
  h.controller.dispose();
});

test('automatic initialization waits for a baseline and skips active editing',async()=>{
  const fresh=await harness({automatic:true});
  assert.equal(fresh.timerCount,0);
  assert.equal(fresh.requests.length,0);
  fresh.controller.dispose();
  const h=await harness({baseline:true,automatic:true});
  h.setEditing(true);
  await h.fireTimer();
  assert.equal(h.requests.length,0);
  h.controller.dispose();
});

test('saved passwords stay out of panel HTML and blank password preserves it without a sync',async()=>{
  const h=await harness();
  assert.equal(h.controller.renderPanel().includes('test-only-password'),false);
  const form=h.setForm({davEndpoint:config.endpoint,davPath:config.path,davUsername:config.username,davPassword:''});
  await h.controller.saveFromForm(form);
  assert.equal((await h.client.loadConfig()).password,config.password);
  assert.equal(h.requests.length,0);
  assert.equal((await h.client.status()).hasBaseline,false);
  h.controller.dispose();
});

test('another tab changing the WebDAV connection stops this controller before syncing a different server',async()=>{
  const h=await harness();
  await h.client.saveConfig({...config,endpoint:'https://new-server.example.test/dav/'});
  await h.controller.handleAction('webdav-sync');
  assert.equal(h.requests.length,0);
  assert.match(h.message,/另一标签|更改|变化|确认/);
  h.controller.dispose();
});
