import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileKeyedChildren} from '../src/keyed-view.js';
import {DEFAULT_STATE,validateImport,exportState} from '../src/core.js';

function root(useAtomic=true) {
 const changes=[];
 const parent={children:[],isConnected:true,changes};
 const makeNode=html=>({html,parentElement:null,
  get isConnected(){return !!this.parentElement?.isConnected;},
  get nextElementSibling(){const list=this.parentElement?.children||[];return list[list.indexOf(this)+1]||null;},
  remove(){const p=this.parentElement;if(p){p.children.splice(p.children.indexOf(this),1);this.parentElement=null;changes.push(['remove',this]);}}
 });
 parent.ownerDocument={createElement(tag){assert.equal(tag,'template');return {content:{},set innerHTML(html){this.content.firstElementChild=makeNode(html);this.content.childElementCount=1;changes.push(['render',html]);}};}};
 Object.defineProperty(parent,'firstElementChild',{get:()=>parent.children[0]||null});
 const move=(node,target,kind)=>{if(node.parentElement){const a=node.parentElement.children;a.splice(a.indexOf(node),1);}parent.children.splice(target?parent.children.indexOf(target):parent.children.length,0,node);node.parentElement=parent;changes.push([kind,node]);};
 parent.insertBefore=(node,target)=>move(node,target,'insert');
 if(useAtomic)parent.moveBefore=(node,target)=>move(node,target,'move');
 return parent;
}
const entry=(key,signature=key)=>({key,signature,render:()=>`<article>${key}:${signature}</article>`});
test('an unchanged ordered view performs no parsing, removals or image resets',()=>{
 const r=root();reconcileKeyedChildren(r,[entry('a'),entry('b')]);const [a,b]=r.children;
 a.loadedImage={url:'https://example.com/icon.svg'};r.changes.length=0;
 const change=reconcileKeyedChildren(r,[entry('a'),entry('b')]);
 assert.deepEqual(r.children,[a,b]);assert.equal(a.loadedImage.url,'https://example.com/icon.svg');assert.deepEqual(r.changes,[]);assert.deepEqual(change,{created:[],removed:[]});
});
test('pointer-reordered DOM is accepted without doing another move after persistence',()=>{
 const r=root();reconcileKeyedChildren(r,['a','b','c'].map(x=>entry(x)));const [a,b,c]=r.children;
 r.insertBefore(a,null);r.changes.length=0;
 reconcileKeyedChildren(r,['b','c','a'].map(x=>entry(x)));
 assert.deepEqual(r.children,[b,c,a]);assert.deepEqual(r.changes,[]);
});
test('keyboard ordering reuses exact nodes with atomic move and an older-browser fallback',()=>{
 for(const atomic of [true,false]){const r=root(atomic);reconcileKeyedChildren(r,[entry('a'),entry('b')]);const [a,b]=r.children;r.changes.length=0;reconcileKeyedChildren(r,[entry('b'),entry('a')]);assert.deepEqual(r.children,[b,a]);assert.deepEqual(r.changes.map(x=>x[0]),[atomic?'move':'insert']);}
});
test('only a changed folder or website is replaced while all unrelated nodes remain',()=>{
 const r=root();reconcileKeyedChildren(r,[entry('a'),entry('folder','before'),entry('b')]);const [a,f,b]=r.children;
 const change=reconcileKeyedChildren(r,[entry('a'),entry('folder','after'),entry('b')]);assert.equal(r.children[0],a);assert.equal(r.children[2],b);assert.equal(change.removed[0],f);assert.equal(change.created.length,1);
});
test('moves out of a group remove only that item and do not recreate survivors',()=>{
 const r=root();reconcileKeyedChildren(r,[entry('a'),entry('b')]);const [a,b]=r.children;r.changes.length=0;
 reconcileKeyedChildren(r,[entry('b')]);assert.deepEqual(r.children,[b]);assert.deepEqual(r.changes,[['remove',a]]);
});
test('duplicate keys fail before changing the previous rendered view',()=>{
 const r=root();reconcileKeyedChildren(r,[entry('a')]);const before=[...r.children];r.changes.length=0;
 assert.throws(()=>reconcileKeyedChildren(r,[entry('b'),entry('b')]));assert.deepEqual(r.children,before);assert.deepEqual(r.changes,[]);
});
test('editor scrollbar preference migrates independently and round-trips in backups',()=>{
 const old=structuredClone(DEFAULT_STATE);delete old.settings.hideEditorScrollbar;old.settings.hideScrollbar=true;
 const migrated=validateImport(old);assert.equal(migrated.settings.hideEditorScrollbar,false);assert.equal(migrated.settings.hideScrollbar,true);
 migrated.settings.hideEditorScrollbar=true;const restored=validateImport(exportState(migrated));assert.equal(restored.settings.hideEditorScrollbar,true);
});
test('invalid editor scrollbar choices are rejected, not coerced',()=>{
 for(const value of ['true',1,null,{},[]]){const input=structuredClone(DEFAULT_STATE);input.settings.hideEditorScrollbar=value;assert.throws(()=>validateImport(input));}
});
