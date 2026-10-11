import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DEFAULT_STATE, validateImport } from '../src/core.js';
import { reorderById } from '../src/drag.js';

const source = await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const copy = value => structuredClone(value);
function extractFunction(name) {
 const match = new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(source);
 assert.ok(match,`missing production function ${name}`);
 for(let end=source.indexOf('}',match.index);end!==-1;end=source.indexOf('}',end+1)) {
  const candidate=source.slice(match.index,end+1);
  try {new vm.Script(`(${candidate})`);return candidate;} catch(error) {if(!(error instanceof SyntaxError))throw error;}
 }
 throw new Error(`Unable to extract ${name}`);
}
const production = ['commit','moveItem','applyDesktopDrop'].map(extractFunction).join('\n\n');
function fresh() {
 const state=copy(DEFAULT_STATE);
 state.groups=state.groups.filter(group=>['home','work'].includes(group.id));state.activeGroupId='home';
 const link=copy(state.items.find(item=>item.type==='link'));
 const entry=(id,groupId='home',folderId=null)=>({...copy(link),id,title:id,groupId,folderId});
 const folder={...copy(state.items.find(item=>item.type==='folder')),id:'folder',groupId:'home'};
 state.items=[entry('a'),entry('child-a','home','folder'),entry('other','work'),folder,entry('b'),entry('child-b','home','folder')];
 return validateImport(state);
}
function harness({initial=fresh(),waitForStorage}={}) {
 const snapshots=[],events=[],messages=[];
 const context=vm.createContext({
  state:initial,reorderById,
  async persist(){
   snapshots.push(copy(validateImport(context.state)));events.push('persist');
   if(waitForStorage)await waitForStorage;
  },
  renderDesktop:()=>events.push('render'),toast:message=>messages.push(message)
 });
 new vm.Script(`${production}\nglobalThis.adapter=applyDesktopDrop;`).runInContext(context);
 return {apply:context.adapter,getState:()=>copy(context.state),snapshots,events,messages};
}

test('the real drop adapter saves one complete reordered state, preserves hidden children, and renders only after saving',async()=>{
 let release;const waitForStorage=new Promise(resolve=>{release=resolve;});
 const before=fresh(),h=harness({initial:copy(before),waitForStorage});
 let settled=false;
 const pending=h.apply({kind:'reorder',itemId:'a',targetId:'b',position:'after'}).then(()=>{settled=true;});
 assert.equal(h.snapshots.length,1);assert.deepEqual(h.events,['persist']);assert.equal(settled,false);
 assert.deepEqual(h.snapshots[0].items.filter(item=>item.groupId==='home'&&!item.folderId).map(item=>item.id),['folder','b','a']);
 assert.deepEqual(h.snapshots[0].items.filter(item=>item.folderId),before.items.filter(item=>item.folderId));
 assert.deepEqual(h.snapshots[0].items.find(item=>item.id==='other'),before.items.find(item=>item.id==='other'));
 assert.equal(h.snapshots[0].items.length,before.items.length);
 release();await pending;
 assert.deepEqual(h.events,['persist','render']);
 assert.deepEqual(validateImport(h.getState()),h.getState());
});

test('moving a folder through the real sidebar adapter saves the folder and all children in the new group together',async()=>{
 const before=fresh(),h=harness({initial:copy(before)});
 await h.apply({kind:'group',itemId:'folder',groupId:'work'});
 assert.equal(h.snapshots.length,1);
 const saved=h.snapshots[0],moved=saved.items.filter(item=>item.id==='folder'||item.folderId==='folder');
 assert.equal(moved.length,3);assert.ok(moved.every(item=>item.groupId==='work'));
 assert.deepEqual(moved.filter(item=>item.type==='link').map(item=>item.folderId),['folder','folder']);
 assert.deepEqual(saved.items.filter(item=>!moved.some(entry=>entry.id===item.id)),before.items.filter(item=>item.id!=='folder'&&item.folderId!=='folder'));
 assert.deepEqual(saved.items.map(item=>item.id),before.items.map(item=>item.id),'moving between groups does not discard or rebuild the global item list');
 assert.deepEqual(h.events,['persist','render']);assert.equal(h.messages.length,1);
});

test('append migrates a folder with its children and clears folder membership when a website is moved back out',async()=>{
 const h=harness();
 await h.apply({kind:'append',itemId:'folder',groupId:'work'});
 let saved=h.snapshots[0];
 assert.equal(saved.items.at(-1).id,'folder');
 assert.ok(saved.items.filter(item=>item.id==='folder'||item.folderId==='folder').every(item=>item.groupId==='work'));
 assert.deepEqual(saved.items.filter(item=>item.groupId==='work'&&!item.folderId).map(item=>item.id),['other','folder']);
 await h.apply({kind:'append',itemId:'child-a',groupId:'home'});
 saved=h.snapshots[1];
 assert.equal(saved.items.at(-1).id,'child-a');assert.equal(saved.items.at(-1).groupId,'home');assert.equal(saved.items.at(-1).folderId,null);
 assert.equal(saved.items.find(item=>item.id==='child-b').folderId,'folder');
 assert.equal(saved.items.find(item=>item.id==='child-b').groupId,'work');
 assert.equal(saved.items.length,fresh().items.length);
 assert.deepEqual(validateImport(saved),saved);
 assert.deepEqual(h.events,['persist','render','persist','render']);
});

test('stale or out-of-scope targets in the real adapter leave state unchanged and make no storage write',async()=>{
 const attempts=[
  {kind:'reorder',itemId:'a',targetId:'deleted',position:'before'},
  {kind:'reorder',itemId:'a',targetId:'other',position:'after'},
  {kind:'reorder',itemId:'child-a',targetId:'b',position:'before'},
  {kind:'reorder',itemId:'a',targetId:'child-b',position:'after'},
  {kind:'folder',itemId:'a',folderId:'b',groupId:'home'},
  {kind:'folder',itemId:'folder',folderId:'folder',groupId:'home'},
  {kind:'append',itemId:'a',groupId:'deleted'},
  {kind:'group',itemId:'deleted',groupId:'work'},
  {kind:'group-reorder',groupId:'home',targetId:'deleted',position:'before'}
 ];
 for(const attempt of attempts){
  const before=fresh(),h=harness({initial:copy(before)});
  await h.apply(attempt);
  assert.deepEqual(h.getState(),before,JSON.stringify(attempt));
  assert.deepEqual(h.events,[],JSON.stringify(attempt));
  assert.equal(h.snapshots.length,0,JSON.stringify(attempt));
 }
});
