import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopDragController, edgeScrollDelta, reorderById, resolveDropIntent, DRAG_HOLD_MS } from '../src/drag.js';

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

test('top navigation reorders groups around their horizontal midpoint; either sidebar keeps vertical ordering', () => {
 const state=initial(), source={kind:'group',id:'home'}, target={kind:'group',id:'work',rect:bounds(200,10,100,60)};
 state.settings={navigationMode:'top'};
 assert.equal(intent(source,target,{x:205,y:65},state).position,'before','the lower left is still before a top navigation group');
 assert.equal(intent(source,target,{x:295,y:15},state).position,'after','the upper right is after a top navigation group');
 for(const sidebarPosition of ['left','right']) {
  state.settings={navigationMode:'sidebar',sidebarPosition};
  assert.equal(intent(source,target,{x:295,y:15},state).position,'before');
  assert.equal(intent(source,target,{x:205,y:65},state).position,'after');
 }
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


// Boundary fake: real reparenting, layout slot changes, event routing and rAF.
// Real Chromium coverage of animated bounds and pointer input: tests/browser-e2e.py.
class Hub {
 constructor(){this.listeners=new Map();}
 addEventListener(t,f){this.listeners.set(t,[...(this.listeners.get(t)||[]),f]);}
 removeEventListener(t,f){this.listeners.set(t,(this.listeners.get(t)||[]).filter(v=>v!==f));}
 emit(type,fields={}){const e={type,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...fields};for(const f of this.listeners.get(type)||[]){f(e);if(e.stopped)break;}return e;}
}
class Node {
 constructor(tag='div',dataset={},rect=bounds(0,0)){
  this.tagName=tag.toUpperCase();this.dataset={...dataset};this.rect=rect;this.children=[];this.parentElement=null;this.nodeType=1;this.style={};this.attributes={};this.classes=new Set();this.capture=new Set();
  this.classList={add:(...vs)=>vs.forEach(v=>this.classes.add(v)),remove:(...vs)=>vs.forEach(v=>this.classes.delete(v)),contains:v=>this.classes.has(v)};
  this.scrollTop=0;this.scrollLeft=0;this.scrollHeight=100;this.clientHeight=100;this.scrollWidth=100;this.clientWidth=100;
 }
 get isConnected(){return !!this.rootConnected||!!this.parentElement?.isConnected;}
 get nextElementSibling(){const p=this.parentElement;return p?.children[p.children.indexOf(this)+1]||null;}
 append(...ns){for(const n of ns){n.remove();n.parentElement=this;this.children.push(n);}}
 insertBefore(n,next){n.remove();n.parentElement=this;const i=this.children.indexOf(next);this.children.splice(i<0?this.children.length:i,0,n);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
 contains(n){return n===this||this.children.some(c=>c.contains(n));}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
 getBoundingClientRect(){return this.parentElement?.layout?this.parentElement.layout(this):this.rect;}
 setPointerCapture(id){this.capture.add(id);}
 releasePointerCapture(id){this.capture.delete(id);}
 matches(selector){return selector.split(',').some(raw=>{const p=raw.trim();if(p==='*')return true;if(p.startsWith('.'))return this.classes.has(p.slice(1));if(p.startsWith('[data-'))return this.dataset[p.slice(6,-1).replace(/-([a-z])/g,(_,v)=>v.toUpperCase())]!==undefined;if(p.startsWith('['))return this.attributes[p.slice(1,-1)]!==undefined;return this.tagName===p.toUpperCase();});}
 closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
 querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
 cloneNode(deep){const n=new Node(this.tagName,this.dataset,this.rect);n.classes=new Set(this.classes);if(deep)n.append(...this.children.map(c=>c.cloneNode(true)));return n;}
 animate(keys,options){this.lastAnimation={keys,options};return {cancel(){}};}
 focus(){this.focused=true;}
}
function harness(){
 const state=initial(),doc=new Hub(),win=new Hub(),frames=new Map(),drops=[],errors=[];let seq=0,editing=false;
 win.innerWidth=1000;win.innerHeight=800;win.requestAnimationFrame=f=>{frames.set(++seq,f);return seq;};win.cancelAnimationFrame=i=>frames.delete(i);win.matchMedia=()=>({matches:false});
 const page=new Node('html',{},bounds(0,0,1000,800));page.rootConnected=true;page.clientHeight=800;page.scrollHeight=1600;
 const body=new Node('body');page.append(body);const grid=new Node('div',{},bounds(100,200,750,400)),groups=new Node('nav',{},bounds(0,180,65,300));body.append(grid,groups);
 grid.layout=n=>bounds(100+grid.children.indexOf(n)*130,230,100,100);
 groups.layout=n=>state.settings?.navigationMode==='top'?bounds(110+groups.children.indexOf(n)*110,20,90,48):bounds(6,200+groups.children.indexOf(n)*70,52,58);
 doc.body=body;doc.documentElement=page;doc.scrollingElement=page;doc.defaultView=win;doc.getElementById=id=>({desktop:grid,groups}[id]);doc.querySelectorAll=s=>body.querySelectorAll(s);doc.querySelector=s=>doc.querySelectorAll(s)[0];doc.getSelection=()=>({removeAllRanges(){}});
 const nodes={};
 for(const item of state.items.filter(i=>i.groupId==='home'&&!i.folderId)){
  const tile=new Node('article',{item:item.id,itemType:item.type}),control=new Node(item.type==='link'?'a':item.type==='folder'?'button':'textarea',item.type==='link'?{openLink:item.id}:item.type==='folder'?{openFolder:item.id}:{});
  grid.append(tile);tile.append(control);nodes[item.id]={tile,control};
 }
 for(const g of state.groups){const b=new Node('button',{group:g.id});groups.append(b);nodes[g.id]=b;}
 let hit=nodes.a.control;doc.elementFromPoint=()=>hit;
 const controller=createDesktopDragController({document:doc,getState:()=>state,onDrop:v=>drops.push(v),onError:e=>errors.push(e),canDragGroups:()=>editing});
 const pointer=(type,target,x,y,extra={})=>doc.emit(type,{target,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,...extra});
 const tick=()=>{const entry=[...frames.entries()][0];if(entry){frames.delete(entry[0]);entry[1]();}};
 return {doc,win,state,nodes,grid,groups,page,frames,drops,errors,controller,pointer,tick,hit:n=>{hit=n;},setEditing:v=>{editing=v;},order:()=>grid.children.map(n=>n.dataset.item),flush:()=>new Promise(r=>setImmediate(r))};
}
function start(h,{source='a',x=315,y=265,hit=h.nodes.b.control}={}){h.hit(hit);const n=h.nodes[source].tile,r=n.getBoundingClientRect();h.pointer('pointerdown',n,r.left+20,r.top+20);h.pointer('pointermove',n,x,y);h.tick();}

test('click threshold preserves website taps; live DOM reflow happens before the only commit',async()=>{
 const h=harness(),n=h.nodes.a.control;h.pointer('pointerdown',n,120,250);h.pointer('pointermove',n,123,250);h.pointer('pointerup',n,123,250);
 assert.equal(h.drops.length,0);assert.equal(h.controller.isDragging(),false);
 start(h);assert.deepEqual(h.order(),['b','a','folder','note']);assert.equal(h.drops.length,0);assert.deepEqual(h.state.items.slice(0,2).map(i=>i.id),['a','b']);
 assert.equal(h.doc.body.querySelectorAll('.drag-ghost').length,1);assert.ok(h.nodes.b.tile.lastAnimation);
 h.pointer('pointerup',n,315,265);await h.flush();assert.deepEqual(h.drops,[{kind:'reorder',itemId:'a',targetId:'folder',position:'before'}]);
 assert.equal(h.doc.emit('click',{target:n,clientX:315,clientY:265,pointerId:1,detail:1}).defaultPrevented,true);
 h.pointer('pointerdown',n,315,265);h.pointer('pointerup',n,315,265);assert.equal(h.doc.emit('click',{target:n,clientX:315,clientY:265,pointerId:1,detail:1}).defaultPrevented,false);h.controller.destroy();
});
test('widget inputs remain interactive; noninteractive widget surfaces drag without a handle',async()=>{
 const h=harness();h.pointer('pointerdown',h.nodes.note.control,510,250);h.pointer('pointermove',h.nodes.note.control,240,265);assert.equal(h.controller.isDragging(),false);
 start(h,{source:'note',x:240});assert.equal(h.controller.isDragging(),true);assert.deepEqual(h.order(),['a','note','b','folder']);h.pointer('pointerup',h.nodes.note.tile,240,265);await h.flush();assert.equal(h.drops.length,1);h.controller.destroy();
});
test('touch swipe scrolls; holding the surface arms touch sorting',async()=>{
 const h=harness(),n=h.nodes.a.tile;h.pointer('pointerdown',n,120,250,{pointerType:'touch'});h.pointer('pointermove',n,150,260,{pointerType:'touch'});assert.equal(h.controller.isDragging(),false);
 h.pointer('pointerup',n,150,260,{pointerType:'touch'});h.pointer('pointerdown',n,120,250,{pointerType:'touch'});await new Promise(r=>setTimeout(r,350));
 assert.equal(h.controller.isDragging(),true);assert.equal(h.doc.emit('touchmove',{}).defaultPrevented,true);h.controller.destroy();
});

test('mouse hold starts once without movement; cancellation suppresses the release click',async()=>{
 const h=harness(),n=h.nodes.a.control;
 h.pointer('pointerdown',n,120,250);
 await new Promise(r=>setTimeout(r,DRAG_HOLD_MS+25));
 assert.equal(h.controller.isDragging(),true);
 assert.equal(h.doc.querySelectorAll('.drag-ghost').length,1);
 h.controller.cancel();h.pointer('pointerup',n,120,250);
 assert.equal(h.doc.emit('click',{clientX:120,clientY:250,pointerId:1,detail:1}).defaultPrevented,true);
 assert.equal(h.doc.querySelectorAll('.drag-ghost').length,0);h.controller.destroy();
});

test('moving before hold does not start a second session when the timer would expire',async()=>{
 const h=harness();start(h);
 await new Promise(r=>setTimeout(r,DRAG_HOLD_MS+25));
 assert.equal(h.doc.querySelectorAll('.drag-ghost').length,1);
 h.controller.cancel();assert.equal(h.doc.querySelectorAll('.drag-ghost').length,0);h.controller.destroy();
});
test('Escape restores original DOM and suppresses only the later release click',async()=>{
 const h=harness();start(h);assert.notEqual(h.order()[0],'a');const e=h.doc.emit('keydown',{key:'Escape'});assert.equal(e.defaultPrevented,true);assert.deepEqual(h.order(),['a','b','folder','note']);
 h.pointer('pointerup',h.nodes.a.tile,315,265);await h.flush();assert.equal(h.drops.length,0);assert.equal(h.frames.size,0);assert.equal(h.doc.emit('click',{clientX:315,clientY:265,pointerId:1,detail:1}).defaultPrevented,true);h.controller.destroy();
});
test('pointercancel restores order and leaves no ghost',()=>{const h=harness();start(h);h.pointer('pointercancel',h.nodes.a.tile,315,265);assert.deepEqual(h.order(),['a','b','folder','note']);assert.equal(h.doc.querySelectorAll('.drag-ghost').length,0);h.controller.destroy();});
test('only the owning pointer may release; stale source cancels next frame',()=>{
 const h=harness();start(h);h.pointer('pointerup',h.nodes.a.tile,315,265,{pointerId:2});assert.equal(h.controller.isDragging(),true);h.nodes.a.tile.remove();h.tick();assert.equal(h.controller.isDragging(),false);assert.equal(h.frames.size,0);h.controller.destroy();
});
test('capture transfer is allowed; losing current capture cancels',()=>{
 const h=harness();start(h);h.doc.emit('lostpointercapture',{target:h.nodes.a.control,pointerId:1});assert.equal(h.controller.isDragging(),true);h.doc.emit('lostpointercapture',{target:h.grid,pointerId:1});assert.equal(h.controller.isDragging(),false);h.controller.destroy();
});
test('drop into a folder or another group commits exactly once',async()=>{
 for(const [hit,x,y,kind] of [['folder',410,270,'folder'],['work',30,300,'group']]){
  const h=harness();start(h,{x,y,hit:h.nodes[hit].control||h.nodes[hit]});h.pointer('pointerup',h.nodes.a.tile,x,y);await h.flush();assert.equal(h.drops.length,1);assert.equal(h.drops[0].kind,kind);h.controller.destroy();
 }
});
test('native image dragging cannot compete and destroy removes document/window listeners',()=>{
 const h=harness();assert.equal(h.doc.emit('dragstart',{target:h.nodes.a.control}).defaultPrevented,true);assert.equal(h.doc.emit('dragstart',{target:h.nodes.note.control}).defaultPrevented,true);start(h);h.controller.destroy();assert.ok([...h.doc.listeners.values(),...h.win.listeners.values()].every(a=>!a.length));assert.equal(h.frames.size,0);
});
test('page edge scroll continues until cancellation',()=>{const h=harness();start(h,{y:792,hit:h.grid});assert.ok(h.page.scrollTop>0);h.tick();assert.ok(h.page.scrollTop>0);h.controller.cancel();assert.equal(h.frames.size,0);h.controller.destroy();});
test('top navigation reorders actual group nodes horizontally',async()=>{
 const h=harness();h.state.settings={navigationMode:'top'};h.setEditing(true);h.hit(h.nodes.work);h.pointer('pointerdown',h.nodes.home,130,32);h.pointer('pointermove',h.nodes.home,300,42);h.tick();assert.equal(h.groups.children[1],h.nodes.home);h.pointer('pointerup',h.nodes.home,300,42);await h.flush();assert.equal(h.drops[0].kind,'group-reorder');h.controller.destroy();
});
test('top group edge scroll never leaks into page scrolling',()=>{
 const h=harness();h.state.settings={navigationMode:'top'};h.setEditing(true);h.groups.rect=bounds(100,12,400,64);h.groups.clientWidth=400;h.groups.scrollWidth=1200;h.page.scrollTop=160;h.hit(h.groups);
 h.pointer('pointerdown',h.nodes.home,130,32);h.pointer('pointermove',h.nodes.home,493,44);h.tick();assert.ok(h.groups.scrollLeft>0);assert.equal(h.page.scrollTop,160);h.pointer('pointermove',h.nodes.home,102,44);h.tick();assert.equal(h.groups.scrollLeft,0);h.tick();assert.equal(h.page.scrollTop,160);h.controller.destroy();
});
test('right navigation scrolls overflow vertically without a visible scrollbar',()=>{
 const h=harness();h.state.settings={sidebarPosition:'right'};h.setEditing(true);h.groups.rect=bounds(935,180,65,300);h.groups.clientHeight=300;h.groups.scrollHeight=600;h.hit(h.groups);h.pointer('pointerdown',h.nodes.home,961,220);h.pointer('pointermove',h.nodes.home,961,475);h.tick();assert.ok(h.groups.scrollTop>0);assert.equal(h.groups.scrollLeft,0);h.controller.destroy();
});
test('reduced-effects mode disables neighbour animations but keeps reordering',()=>{const h=harness();h.state.settings={reducedEffects:true};start(h);assert.equal(h.order()[0],'b');assert.equal(h.nodes.b.tile.lastAnimation,undefined);h.controller.destroy();});

test('pointer capture lives on stable grid; child blur never cancels live reflow',()=>{
 const h=harness();start(h);assert.equal(h.grid.capture.has(1),true);h.win.emit('blur',{target:h.nodes.a.control});assert.equal(h.controller.isDragging(),true);h.win.emit('blur',{target:h.win});assert.equal(h.controller.isDragging(),false);h.controller.destroy();
});

test('only two distinct top-level websites can form a new folder, while edges still reorder',()=>{
 const source={kind:'item',id:'a'},target={kind:'item',id:'b',rect:bounds(100,100)};
 assert.deepEqual(intent(source,target),{kind:'create-folder',itemId:'a',targetId:'b',groupId:'home'});
 assert.equal(intent(source,target,{x:105,y:150}).kind,'reorder');
 assert.equal(intent(source,{kind:'item',id:'note',rect:bounds(100,100)}).kind,'reorder');
 assert.equal(intent({kind:'item',id:'child'},target),null);
 assert.equal(intent(source,{kind:'item',id:'other',rect:bounds(100,100)}),null);
});
