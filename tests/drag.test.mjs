import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopDragController, edgeScrollDelta, reorderById, resolveDropIntent } from '../src/drag.js';

const bounds = (left, top, width = 100, height = 100) => ({left, top, width, height, right:left + width, bottom:top + height});
const initial = () => ({
 activeGroupId:'home', groups:[{id:'home',name:'主页'}, {id:'work',name:'工作'}],
 items:[
  {id:'a',groupId:'home',type:'link',title:'网站 A'},
  {id:'b',groupId:'home',type:'link',title:'网站 B'},
  {id:'folder',groupId:'home',type:'folder',title:'文件夹'},
  {id:'note',groupId:'home',type:'widget',title:'便签'},
  {id:'child',groupId:'home',folderId:'folder',type:'link',title:'文件夹内的网站'},
  {id:'other',groupId:'work',type:'link',title:'另一个分组'}
 ]
});
const intent = (source, target, point = {x:150,y:150}, state = initial()) => resolveDropIntent({state,source,target,point});

test('reordering respects both sides and keeps other groups, folder contents and item objects intact', () => {
 const items = initial().items;
 const moved = reorderById(items, 'a', 'folder', 'after');
 assert.deepEqual(moved.map(item => item.id), ['b','folder','a','note','child','other']);
 assert.deepEqual(items.map(item => item.id), ['a','b','folder','note','child','other']);
 assert.ok(moved.every(item => items.includes(item)), 'moving changes order, not persisted item data');
 assert.deepEqual(reorderById(moved, 'a', 'b').map(item => item.id), items.map(item => item.id));
 assert.equal(reorderById(items, 'a', 'b', 'before'), items, 'an existing adjacent placement is a no-op');
 assert.equal(reorderById(items, 'missing', 'b'), items);
 assert.equal(reorderById(items, 'a', 'a'), items);
 assert.throws(() => reorderById(items, 'a', 'b', 'inside'), TypeError);
});

test('only a website dropped in the center enters a folder; its edges still allow ordering', () => {
 const source = {kind:'item',id:'a'}, target = {kind:'item',id:'folder',rect:bounds(100,100)};
 assert.deepEqual(intent(source,target), {kind:'folder',itemId:'a',groupId:'home',folderId:'folder'});
 assert.deepEqual(intent(source,target,{x:108,y:150}), {kind:'reorder',itemId:'a',targetId:'folder',position:'before'});
 assert.deepEqual(intent(source,target,{x:192,y:150}), {kind:'reorder',itemId:'a',targetId:'folder',position:'after'});
 assert.equal(intent({kind:'item',id:'note'},target).kind,'reorder', 'a widget cannot enter a folder');
 assert.equal(intent({kind:'item',id:'folder'},target), null);
 assert.equal(intent(source,{kind:'item',id:'other',rect:bounds(100,100)}), null, 'stale cards in another group cannot be reordered');
 assert.equal(intent({kind:'item',id:'child'},target), null, 'folder contents are not treated as visible desktop cards');
});

test('group moves, group ordering, append and invalid targets are resolved from current state', () => {
 assert.deepEqual(intent({kind:'item',id:'a'},{kind:'group',id:'work'}), {kind:'group',itemId:'a',groupId:'work'});
 assert.equal(intent({kind:'item',id:'a'},{kind:'group',id:'home'}),null);
 assert.equal(intent({kind:'item',id:'a'},{kind:'group',id:'deleted'}),null);
 assert.deepEqual(intent({kind:'group',id:'home'},{kind:'group',id:'work',rect:bounds(0,100,52,60)},{x:25,y:150}), {kind:'group-reorder',groupId:'home',targetId:'work',position:'after'});
 assert.equal(intent({kind:'group',id:'home'},{kind:'item',id:'a'}),null);
 assert.deepEqual(intent({kind:'item',id:'a'},{kind:'desktop',id:'home'}),{kind:'append',itemId:'a',groupId:'home'});
 assert.equal(intent({kind:'item',id:'note'},{kind:'desktop',id:'home'}),null,'last visible item already is appended');
 const deleted = initial(); deleted.items = deleted.items.filter(item => item.id !== 'a');
 assert.equal(intent({kind:'item',id:'a'},{kind:'group',id:'work'},{x:150,y:150},deleted),null);
});

test('edge scrolling is bounded and leaves the center or outside the viewport still', () => {
 assert.equal(edgeScrollDelta(400,0,800),0);
 assert.equal(edgeScrollDelta(-1,0,800),0);
 assert.equal(edgeScrollDelta(801,0,800),0);
 assert.equal(edgeScrollDelta(NaN,0,800),0);
 assert.equal(edgeScrollDelta(0,0,800),-20);
 assert.equal(edgeScrollDelta(800,0,800),20);
 assert.ok(edgeScrollDelta(775,0,800) > edgeScrollDelta(740,0,800));
 assert.equal(edgeScrollDelta(15,0,30),0,'a short panel keeps a neutral center');
});

// Small DOM boundary: no production implementation is copied into this harness.
class Hub {
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==fn));}
 emit(type,fields={}){
  const event={type,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...fields};
  for(const fn of this.listeners.get(type)||[]){fn(event);if(event.stopped)break;}
  return event;
 }
}
class Node {
 constructor(tag='div',dataset={},rect=bounds(0,0)){
  this.tagName=tag.toUpperCase();this.dataset={...dataset};this.rect=rect;this.children=[];this.parentElement=null;this.nodeType=1;this.style={};this.attributes={};this.classes=new Set();this.hidden=false;
  this.classList={add:(...values)=>values.forEach(v=>this.classes.add(v)),remove:(...values)=>values.forEach(v=>this.classes.delete(v)),contains:value=>this.classes.has(value)};
  this.scrollTop=0;this.scrollHeight=100;this.clientHeight=100;this.overflowY='visible';this.capture=new Set();
 }
 get isConnected(){return !!this.rootConnected||!!this.parentElement?.isConnected;}
 set className(value){this.classes=new Set(value.split(/\s+/).filter(Boolean));}
 get className(){return [...this.classes].join(' ');}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 setAttribute(name,value){this.attributes[name]=value;}
 getBoundingClientRect(){return this.rect;}
 setPointerCapture(id){this.capture.add(id);}
 releasePointerCapture(id){this.capture.delete(id);}
 matches(selector){
  return selector.split(',').some(raw=>{
   const part=raw.trim();
   if(part.startsWith('.'))return this.classes.has(part.slice(1));
   if(part.startsWith('[data-')){const key=part.slice(6,-1).replace(/-([a-z])/g,(_,v)=>v.toUpperCase());return this.dataset[key]!==undefined;}
   if(part.startsWith('['))return this.attributes[part.slice(1,-1)]!==undefined;
   return this.tagName===part.toUpperCase();
  });
 }
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
}
function harness(){
 const state=initial(), doc=new Hub(), win=new Hub(), frames=new Map(), drops=[], errors=[];let seq=0,editing=false;
 win.innerWidth=1000;win.innerHeight=800;
 win.requestAnimationFrame=fn=>{frames.set(++seq,fn);return seq;};win.cancelAnimationFrame=id=>frames.delete(id);win.getComputedStyle=node=>({overflowY:node.overflowY});
 const page=new Node('html',{},bounds(0,0,1000,800));page.rootConnected=true;page.clientHeight=800;page.scrollHeight=1600;
 const body=new Node('body');page.append(body);
 const grid=new Node('div',{},bounds(100,200,750,400)), groups=new Node('nav',{},bounds(0,180,65,300));body.append(grid,groups);
 doc.body=body;doc.documentElement=page;doc.scrollingElement=page;doc.defaultView=win;doc.getElementById=id=>({desktop:grid,groups}[id]);doc.createElement=tag=>new Node(tag);doc.getSelection=()=>({removeAllRanges(){}});
 const nodes={};
 for(const [index,item] of state.items.filter(item=>item.groupId==='home'&&!item.folderId).entries()){
  const tile=new Node('article',{item:item.id,itemType:item.type},bounds(100+index*130,230));
  const handle=new Node('button',{dragHandle:''});
  const control=new Node(item.type==='link'?'a':item.type==='folder'?'button':'textarea',item.type==='link'?{openLink:item.id}:item.type==='folder'?{openFolder:item.id}:{});
  grid.append(tile);tile.append(control,handle);nodes[item.id]={tile,control,handle};
 }
 const add=new Node('div',{},bounds(620,230));add.className='tile-add';grid.append(add);
 for(const [index,group] of state.groups.entries()){const button=new Node('button',{group:group.id},bounds(6,200+index*70,52,58));groups.append(button);nodes[group.id]=button;}
 let hit=nodes.a.control;doc.elementFromPoint=()=>hit;
 const controller=createDesktopDragController({document:doc,getState:()=>state,getActiveGroupId:()=>state.activeGroupId,onDrop:value=>drops.push(value),onError:value=>errors.push(value),canDragGroups:()=>editing});
 const pointer=(type,target,x,y,extra={})=>doc.emit(type,{target,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,...extra});
 return {doc,win,state,nodes,grid,groups,add,page,frames,drops,errors,controller,pointer,hit:node=>{hit=node;},setEditing:value=>{editing=value;},flush:async()=>{await new Promise(resolve=>setImmediate(resolve));}};
}

test('normal website clicks remain intact; a real drag works without edit mode and suppresses its release click', async () => {
 const h=harness(), source=h.nodes.a.control;
 h.pointer('pointerdown',source,120,260);
 h.pointer('pointermove',source,123,260);
 h.pointer('pointerup',source,123,260);
 assert.equal(h.doc.emit('click',{target:source,clientX:123,clientY:260,pointerId:1,detail:1}).defaultPrevented,false);
 h.hit(h.nodes.b.control);h.pointer('pointerdown',source,120,260);
 h.pointer('pointermove',source,315,265);
 assert.equal(h.controller.isDragging(),true);
 assert.equal(h.nodes.b.tile.classList.contains('drop-after'),true);
 assert.ok(h.frames.size);
 h.pointer('pointerup',source,315,265);await h.flush();
 assert.deepEqual(h.drops,[{kind:'reorder',itemId:'a',targetId:'b',position:'after'}]);
 assert.equal(h.controller.isDragging(),false);assert.equal(h.frames.size,0);
 assert.equal(h.doc.body.querySelectorAll('.drag-preview').length,0);
 assert.equal(h.nodes.b.tile.classList.contains('drop-after'),false);
 assert.equal(h.doc.emit('click',{target:source,clientX:315,clientY:265,pointerId:1,detail:1}).defaultPrevented,true);
 h.pointer('pointerdown',source,120,260);h.pointer('pointerup',source,120,260);
 assert.equal(h.doc.emit('click',{target:source,clientX:120,clientY:260,pointerId:1,detail:1}).defaultPrevented,false,'a fresh click is allowed immediately');
 h.controller.destroy();
});

test('widget text and touch scrolling are protected, while an explicit handle supports touch dragging',async()=>{
 const h=harness();
 for(const [target,pointerType] of [[h.nodes.note.control,'mouse'],[h.nodes.a.control,'touch']]){
  h.hit(h.nodes.b.control);h.pointer('pointerdown',target,120,260,{pointerType});h.pointer('pointermove',target,290,270,{pointerType});
  assert.equal(h.controller.isDragging(),false);h.pointer('pointerup',target,290,270,{pointerType});
 }
 assert.deepEqual(h.drops,[]);
 h.hit(h.nodes.b.control);h.pointer('pointerdown',h.nodes.note.handle,510,265,{pointerType:'touch'});
 assert.equal(h.doc.emit('contextmenu',{target:h.nodes.note.handle}).stopped,true,'a handle long press does not interrupt dragging with a menu');
 h.pointer('pointermove',h.nodes.note.handle,245,265,{pointerType:'touch'});
 assert.equal(h.controller.isDragging(),true);
 h.pointer('pointerup',h.nodes.note.handle,245,265,{pointerType:'touch'});await h.flush();
 assert.deepEqual(h.drops,[{kind:'reorder',itemId:'note',targetId:'b',position:'before'}]);
 assert.equal(h.nodes.note.handle.capture.size,0);h.controller.destroy();
});

test('Escape cancels the move and catches a later release click; pointer cancellation also cleans up',async()=>{
 const h=harness();h.hit(h.nodes.b.control);
 h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,270,270);
 const escape=h.doc.emit('keydown',{key:'Escape'});
 assert.equal(escape.defaultPrevented,true);assert.equal(escape.stopped,true);
 assert.equal(h.controller.isDragging(),false);assert.equal(h.frames.size,0);
 h.pointer('pointerup',h.nodes.a.control,270,270);await h.flush();
 assert.deepEqual(h.drops,[]);
 assert.equal(h.doc.emit('click',{target:h.nodes.a.control,clientX:270,clientY:270,pointerId:1,detail:1}).defaultPrevented,true);
 assert.equal(h.doc.emit('keydown',{key:'Escape'}).stopped,false,'unrelated Escape remains available to the app');
 h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,270,270);
 h.pointer('pointercancel',h.nodes.a.control,270,270);await h.flush();
 assert.equal(h.doc.body.classList.contains('is-dragging'),false);
 assert.equal(h.doc.body.querySelectorAll('.drag-indicator').length,0);assert.deepEqual(h.drops,[]);h.controller.destroy();
});

test('stale DOM/state cancels a drag, and only the owning pointer may finish it',async()=>{
 const h=harness();h.hit(h.nodes.b.control);
 h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,270,270);
 h.pointer('pointerup',h.nodes.a.control,270,270,{pointerId:2});assert.equal(h.controller.isDragging(),true);
 h.state.items=h.state.items.filter(item=>item.id!=='b');h.pointer('pointerup',h.nodes.a.control,270,270);await h.flush();
 assert.deepEqual(h.drops,[],'a removed destination is never committed');
 h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,270,270);
 h.nodes.a.tile.remove();h.pointer('pointermove',h.nodes.a.control,300,270);
 assert.equal(h.controller.isDragging(),false);assert.equal(h.frames.size,0);h.controller.destroy();
});

test('capture transfer from an anchor to its card does not cancel the drag, but losing the current capture does',async()=>{
 const h=harness();h.hit(h.nodes.b.control);
 h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,270,270);
 assert.equal(h.nodes.a.tile.capture.has(1),true);
 h.doc.emit('lostpointercapture',{target:h.nodes.a.control,pointerId:1});
 assert.equal(h.controller.isDragging(),true,'losing the previously pressed anchor is a capture transfer');
 assert.ok(h.frames.size);
 h.doc.emit('lostpointercapture',{target:h.nodes.a.tile,pointerId:1});
 assert.equal(h.controller.isDragging(),false,'losing the actual captured card aborts the gesture');
 assert.equal(h.frames.size,0);assert.equal(h.doc.body.querySelectorAll('.drag-preview').length,0);
 h.pointer('pointerup',h.nodes.a.control,270,270);await h.flush();
 assert.deepEqual(h.drops,[]);h.controller.destroy();
});

test('native app dragging cannot compete, sidebar group moves work, and drag listeners are removable',async()=>{
 const h=harness();
 assert.equal(h.doc.emit('dragstart',{target:h.nodes.a.control}).defaultPrevented,true);
 assert.equal(h.doc.emit('dragstart',{target:h.nodes.note.control}).defaultPrevented,false,'selected text in a widget retains its native behavior');
 h.hit(h.nodes.work);h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,30,300);
 assert.equal(h.nodes.work.classList.contains('drop-inside'),true);
 h.pointer('pointerup',h.nodes.a.control,30,300);await h.flush();
 assert.deepEqual(h.drops,[{kind:'group',itemId:'a',groupId:'work'}]);
 h.controller.destroy();
 assert.ok([...h.doc.listeners.values()].every(list=>list.length===0));
 assert.ok([...h.win.listeners.values()].every(list=>list.length===0));
});

test('dragging at the page edge scrolls continuously and cancellation stops the animation loop',()=>{
 const h=harness();h.hit(h.grid);
 h.pointer('pointerdown',h.nodes.a.control,120,260);h.pointer('pointermove',h.nodes.a.control,280,792);
 assert.equal(h.controller.isDragging(),true);
 const [id,frame]=[...h.frames.entries()][0];h.frames.delete(id);frame();
 assert.ok(h.page.scrollTop>0);
 h.controller.cancel();assert.equal(h.frames.size,0);h.controller.destroy();
});
