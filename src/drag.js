// SPDX-License-Identifier: GPL-3.0-only
// Real-time pointer sorting. No external drag library or per-card listeners.
const DRAG_THRESHOLD = 7;
const CLICK_GUARD_MS = 550;
const DROP_CLASSES = ['drop-before', 'drop-after', 'drop-inside'];

/** Return an ordered copy without changing item objects or unrelated entries. */
export function reorderById(entries, sourceId, targetId, position = 'before') {
 if (position !== 'before' && position !== 'after') throw new TypeError('Unknown drop position.');
 const from = entries.findIndex(entry => entry.id === sourceId);
 const target = entries.findIndex(entry => entry.id === targetId);
 if (from < 0 || target < 0 || from === target) return entries;
 const insertion = target - (from < target ? 1 : 0) + (position === 'after' ? 1 : 0);
 if (insertion === from) return entries;
 const ordered = [...entries], [source] = ordered.splice(from, 1);
 ordered.splice(insertion, 0, source);
 return ordered;
}

function dropPosition(rect, point, vertical = false) {
 if (!rect) return 'before';
 if (vertical) return point.y < rect.top + rect.height / 2 ? 'before' : 'after';
 if (point.y < rect.top) return 'before';
 if (point.y > rect.bottom) return 'after';
 return point.x < rect.left + rect.width / 2 ? 'before' : 'after';
}

/** Resolve valid moves from current state, rather than trusting dragged HTML. */
export function resolveDropIntent({ state, source, target, point }) {
 if (!source || !target || !state || !point) return null;
 const groups = state.groups || [], items = state.items || [];
 const groupExists = id => groups.some(group => group.id === id);
 if (source.kind === 'group') {
  if (target.kind !== 'group' || source.id === target.id || !groupExists(source.id) || !groupExists(target.id)) return null;
  return { kind:'group-reorder', groupId:source.id, targetId:target.id, position:dropPosition(target.rect, point, state.settings?.navigationMode !== 'top') };
 }
 const item = items.find(entry => entry.id === source.id);
 if (!item || !groupExists(item.groupId)) return null;
 if (target.kind === 'group') {
  if (!groupExists(target.id) || (item.groupId === target.id && !item.folderId)) return null;
  return { kind:'group', itemId:item.id, groupId:target.id };
 }
 if (target.kind === 'desktop') {
  if (!groupExists(target.id)) return null;
  const visible = items.filter(entry => entry.groupId === target.id && !entry.folderId);
  if (item.groupId === target.id && !item.folderId && visible.at(-1)?.id === item.id) return null;
  return { kind:'append', itemId:item.id, groupId:target.id };
 }
 if (target.kind !== 'item') return null;
 const destination = items.find(entry => entry.id === target.id);
 if (!destination || item.id === destination.id || item.groupId !== destination.groupId || item.folderId || destination.folderId) return null;
 const rect = target.rect;
 // The folder's center collects websites; its outer edges still permit order.
 if (item.type === 'link' && destination.type === 'folder' && rect &&
     point.x > rect.left + rect.width * .24 && point.x < rect.right - rect.width * .24 &&
     point.y > rect.top + rect.height * .2 && point.y < rect.bottom - rect.height * .2) {
  return { kind:'folder', itemId:item.id, groupId:destination.groupId, folderId:destination.id };
 }
 return { kind:'reorder', itemId:item.id, targetId:destination.id, position:dropPosition(rect, point) };
}

/** Edge speed on either axis, in pixels/frame; no movement outside the area. */
export function edgeScrollDelta(position, start, end, edge = 64, maxSpeed = 20) {
 if (![position, start, end].every(Number.isFinite) || end <= start || position < start || position > end) return 0;
 const band = Math.min(edge, (end - start) / 3);
 if (band <= 0) return 0;
 if (position < start + band) return -maxSpeed * ((start + band - position) / band) ** 2;
 if (position > end - band) return maxSpeed * ((position - end + band) / band) ** 2;
 return 0;
}

/**
 * Reorders live DOM, animating neighbours with FLIP; data is committed once on
 * release. Escape/cancel restores the exact original order. Only transform and
 * opacity animate. Widgets' inputs, links and buttons retain native behaviour.
 */
export function createDesktopDragController({
 document:doc=globalThis.document, getState, getActiveGroupId=()=>getState().activeGroupId,
 onDrop, canDragGroups=()=>false, isBlocked=()=>false, onError=()=>{}, onStart=()=>{}
}) {
 if(!doc || typeof getState!=='function' || typeof onDrop!=='function') throw new TypeError('Dragging requires a document, state reader and drop callback.');
 const win=doc.defaultView || globalThis, listeners=[], animations=new Map();
 let session=null, frame=null, holdTimer=null, ghost=null, suppression=null, busy=false, destroyed=false;
 const listen=(node,type,fn,options=true)=>{node.addEventListener(type,fn,options);listeners.push(()=>node.removeEventListener(type,fn,options));};
 const element=t=>t?.nodeType===3?t.parentElement:t;
 const grid=()=>doc.getElementById('desktop'), groups=()=>doc.getElementById('groups');
 const reduced=()=>getState().settings?.reducedEffects || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const nodes=root=>[...root.querySelectorAll(root===groups()?'[data-group]':'[data-item]')];
 const id=node=>node.dataset.item || node.dataset.group;
 const boxes=list=>new Map(list.map(n=>[n,n.getBoundingClientRect()]));
 const cancelAnimations=()=>{for(const a of animations.values())a.cancel?.();animations.clear();};
 function animate(before,list){
  for(const node of list){
   const old=before.get(node),next=node.getBoundingClientRect();
   if(!old || reduced() || !node.animate || node===session?.source.element)continue;
   const x=old.left-next.left,y=old.top-next.top;
   if(Math.abs(x)+Math.abs(y)<.5)continue;
   const a=node.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:190,easing:'cubic-bezier(.2,.75,.2,1)'});
   animations.set(node,a);a.onfinish=()=>{if(animations.get(node)===a)animations.delete(node);};
  }
 }
 function sourceAt(event){
  const t=element(event.target);if(!t?.closest)return null;
  const tile=t.closest('[data-item]'),g=t.closest('[data-group]');
  if(tile && grid()?.contains(tile)){
   const item=getState().items.find(i=>i.id===tile.dataset.item);
   if(!item || item.folderId || item.groupId!==getActiveGroupId())return null;
   if(t.closest('input,textarea,select,[contenteditable],[data-no-drag]'))return null;
   const control=t.closest('button,a');
   if(control && control.dataset.openLink!==item.id && control.dataset.openFolder!==item.id && !(item.widget==='wallpaper' && control.dataset.action==='wallpaper'))return null;
   return {kind:'item',id:item.id,type:item.type,element:tile,root:grid(),title:item.title};
  }
  if(g && groups()?.contains(g) && canDragGroups())return {kind:'group',id:g.dataset.group,type:'group',element:g,root:groups()};
  return null;
 }
 function valid(){
  if(!session?.source.element.isConnected || isBlocked())return false;
  const s=session.source;
  return s.kind==='group'?canDragGroups() && getState().groups.some(g=>g.id===s.id):getState().items.some(i=>i.id===s.id && !i.folderId && i.groupId===getActiveGroupId());
 }
 function unmark(){doc.querySelectorAll('.drop-inside').forEach(n=>n.classList.remove('drop-inside'));}
 function restore(s){
  if(!s?.original || !s.source.root.isConnected)return;
  const list=nodes(s.source.root),before=boxes(list);cancelAnimations();
  // Only restore surviving original nodes, never resurrect a deleted card.
  for(const node of s.original)if(node.isConnected && node.parentElement===s.source.root)s.source.root.append(node);
  animate(before,list);
 }
 function clean({revert=true,guard=true,landing=false,waitForRelease=false}={}){
  const s=session;session=null;clearTimeout(holdTimer);holdTimer=null;
  if(frame!==null)win.cancelAnimationFrame(frame);frame=null;
  if(s?.active && guard)suppression={x:s.x,y:s.y,pointerId:s.pointerId,until:Date.now()+CLICK_GUARD_MS,waitForRelease};
  if(revert)restore(s);
  const image=ghost;ghost=null;
  s?.source.element.classList.remove('dragging');doc.body.classList.remove('is-dragging');unmark();
  if(image){
   const end=s?.source.element.getBoundingClientRect();
   if(landing && end && !reduced() && image.animate){
    const begin=image.getBoundingClientRect();
    const a=image.animate([{transform:`translate3d(${begin.left}px,${begin.top}px,0) scale(1.015)`,opacity:.92},{transform:`translate3d(${end.left}px,${end.top}px,0) scale(1)`,opacity:0}],{duration:150,easing:'ease-out',fill:'forwards'});
    a.onfinish=()=>image.remove();setTimeout(()=>image.remove(),200);
   }else image.remove();
  }
  if(s?.capture){try{s.capture.releasePointerCapture(s.pointerId);}catch{}}
 }
 const cancel=()=>clean({waitForRelease:true});
 function moveGhost(){if(ghost && session)ghost.style.transform=`translate3d(${session.x-session.offsetX}px,${session.y-session.offsetY}px,0) scale(1.015)`;}
 function begin(){
  if(!valid())return clean();
  const s=session,rect=s.source.element.getBoundingClientRect();s.active=true;
  s.original=[...s.source.root.children];s.offsetX=s.startX-rect.left;s.offsetY=s.startY-rect.top;s.lastSwap=0;
  cancelAnimations();s.source.root.classList.remove('group-enter');
  ghost=s.source.element.cloneNode(true);ghost.classList.remove('dragging');ghost.classList.add('drag-ghost');
  for(const n of [ghost,...ghost.querySelectorAll('*')]){n.removeAttribute('id');n.removeAttribute('data-item');n.removeAttribute('data-group');n.removeAttribute('tabindex');}
  ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  ghost.style.cssText=`position:fixed;left:0;top:0;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:1000;pointer-events:none;`;
  doc.body.append(ghost);s.source.element.classList.add('dragging');doc.body.classList.add('is-dragging');
  try{s.capture=s.source.root;s.capture.setPointerCapture(s.pointerId);}catch{s.capture=null;}
  doc.getSelection?.()?.removeAllRanges();
  moveGhost();try{onStart();}catch(e){onError(e);}
  if(session===s)frame=win.requestAnimationFrame(tick);
 }
 function swap(target,position){
  const s=session,root=s.source.root,source=s.source.element;
  const next=position==='before'?target:target.nextElementSibling;
  if(next===source || source.nextElementSibling===next)return;
  const list=nodes(root),before=boxes(list);cancelAnimations();root.insertBefore(source,next);
  // Capture final layout before FLIP transforms affect hit testing.
  s.layout=boxes(nodes(root));s.lastSwap=Date.now();
  animate(before,list);s.changed=true;
 }
 function updateTarget(force=false){
  if(!session?.active)return;
  if(!valid())return cancel();
  const s=session,point={x:s.x,y:s.y},hit=doc.elementFromPoint(s.x,s.y);unmark();
  s.special=null;s.inside=false;
  if(!hit?.closest)return;
  const g=hit.closest('[data-group]');
  if(g && groups()?.contains(g) && s.source.kind==='item'){
   const intent=resolveDropIntent({state:getState(),source:s.source,target:{kind:'group',id:g.dataset.group,rect:g.getBoundingClientRect()},point});
   if(intent){s.special=intent;g.classList.add('drop-inside');}return;
  }
  const root=s.source.root;
  if(!root.contains(hit))return;
  s.inside=true;
  // Use untransformed current layout for stable FLIP hit testing. Compensate
  // for document/nav scrolling without repeatedly forcing full grid layout.
  const scrollY=root===groups()?root.scrollTop:(doc.scrollingElement?.scrollTop||0);
  const scrollX=root===groups()?root.scrollLeft:0;
  if(!s.layout || scrollY!==s.scrollY || scrollX!==s.scrollX){
   const dy=(s.scrollY??scrollY)-scrollY,dx=(s.scrollX??scrollX)-scrollX;
   if(s.layout)s.layout=new Map([...s.layout].map(([n,r])=>[n,{...r,left:r.left+dx,right:r.right+dx,top:r.top+dy,bottom:r.bottom+dy,width:r.width,height:r.height}]));
   else s.layout=boxes(nodes(root));s.scrollY=scrollY;s.scrollX=scrollX;
  }
  const own=s.layout.get(s.source.element);
  if(own && s.x>=own.left && s.x<=own.right && s.y>=own.top && s.y<=own.bottom)return;
  let dest=null,rect=null,best=Infinity;
  for(const [node,r] of s.layout){
   if(node===s.source.element)continue;
   const dx=Math.max(r.left-s.x,0,s.x-r.right),dy=Math.max(r.top-s.y,0,s.y-r.bottom);
   const d=dx*dx+dy*dy;
   if(d<best){best=d;dest=node;rect=r;}
  }
  if(!dest)return;
  const intent=resolveDropIntent({state:getState(),source:s.source,target:{kind:s.source.kind==='group'?'group':'item',id:id(dest),rect},point});
  if(intent?.kind==='folder'){s.special=intent;dest.classList.add('drop-inside');return;}
  if(!intent)return;
  if(!force && Date.now()-s.lastSwap<110){s.dirty=true;return;}
  swap(dest,intent.position);
 }
 function scroll(){
  if(!session?.active)return false;
  const s=session,hit=doc.elementFromPoint(s.x,s.y),nav=groups(),page=doc.scrollingElement||doc.documentElement;
  let el=nav?.contains(hit)?nav:page;
  const horizontal=el===nav && getState().settings?.navigationMode==='top';
  const r=el===page?{left:0,right:win.innerWidth,top:0,bottom:win.innerHeight}:el.getBoundingClientRect();
  const property=horizontal?'scrollLeft':'scrollTop',before=el[property];
  const delta=edgeScrollDelta(horizontal?s.x:s.y,horizontal?r.left:Math.max(0,r.top),horizontal?r.right:Math.min(win.innerHeight,r.bottom));
  const limit=Math.max(0,horizontal?el.scrollWidth-el.clientWidth:el.scrollHeight-el.clientHeight);
  if(delta && limit)el[property]=Math.max(0,Math.min(limit,before+delta));
  return el[property]!==before;
 }
 function tick(){
  frame=null;if(!session?.active)return;if(!valid())return cancel();
  const scrolled=scroll();
  if(scrolled || session.dirty){session.dirty=false;updateTarget();moveGhost();}
  if(session?.active)frame=win.requestAnimationFrame(tick);
 }
 function down(e){
  if(e.isPrimary===false || e.button!==undefined && e.button!==0)return;
  suppression=null;if(session)clean();if(destroyed || busy || isBlocked())return;
  const source=sourceAt(e);if(!source)return;
  session={source,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,dirty:false};
  if(e.pointerType==='touch'){
   session.touch=true;holdTimer=setTimeout(()=>{holdTimer=null;if(session)begin();},330);
  }
 }
 function move(e){
  if(!session || e.pointerId!==session.pointerId)return;
  if(e.pointerType==='mouse' && e.buttons===0)return cancel();
  session.x=e.clientX;session.y=e.clientY;
  if(!session.active && Math.hypot(session.x-session.startX,session.y-session.startY)>=DRAG_THRESHOLD){
   if(session.touch && holdTimer!==null)return clean({guard:false});begin();
  }
  if(session?.active){e.preventDefault();session.dirty=true;}
 }
 function finalIntent(s){
  if(s.special)return s.special;
  if(!s.inside || !s.changed)return null;
  const list=nodes(s.source.root),index=list.indexOf(s.source.element),next=list[index+1],previous=list[index-1];
  const same=list.map(id).join('\0')===s.original.filter(n=>n.matches?.('[data-item],[data-group]')).map(id).join('\0');
  if(same)return null;
  const target=next||previous;if(!target)return null;
  return s.source.kind==='group'?{kind:'group-reorder',groupId:s.source.id,targetId:id(target),position:next?'before':'after'}:{kind:'reorder',itemId:s.source.id,targetId:id(target),position:next?'before':'after'};
 }
 function up(e){
  if(suppression?.waitForRelease && e.pointerId===suppression.pointerId){Object.assign(suppression,{x:e.clientX,y:e.clientY,waitForRelease:false,until:Date.now()+CLICK_GUARD_MS});}
  if(!session || e.pointerId!==session.pointerId)return;
  if(!session.active)return clean({guard:false});
  e.preventDefault();const moved=session.x!==e.clientX||session.y!==e.clientY;session.x=e.clientX;session.y=e.clientY;if(moved||session.dirty)updateTarget(true);
  if(!session)return;
  const intent=finalIntent(session);clean({revert:!intent,landing:!!intent});
  if(!intent)return;
  busy=true;Promise.resolve().then(()=>onDrop(intent)).catch(onError).finally(()=>{busy=false;});
 }
 listen(doc,'pointerdown',down);
 listen(doc,'pointermove',move,{capture:true,passive:false});listen(doc,'pointerup',up);
 listen(doc,'pointercancel',e=>{if(session?.pointerId===e.pointerId)clean();});
 listen(doc,'lostpointercapture',e=>{if(session?.active && e.pointerId===session.pointerId && e.target===session.capture)cancel();});
 listen(doc,'touchmove',e=>{if(session?.active)e.preventDefault();},{capture:true,passive:false});
 listen(doc,'click',e=>{
  if(!suppression || e.detail===0)return;
  if(!suppression.waitForRelease && Date.now()>suppression.until){suppression=null;return;}
  if(e.pointerId!==undefined && e.pointerId!==suppression.pointerId)return;
  if(Math.hypot(e.clientX-suppression.x,e.clientY-suppression.y)>28)return;
  e.preventDefault();e.stopImmediatePropagation();suppression=null;
 });
 listen(doc,'keydown',e=>{
  if(e.key==='Escape' && session){const active=session.active;cancel();if(active){e.preventDefault();e.stopImmediatePropagation();}return;}
  if(!e.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) || busy || isBlocked())return;
  const source=sourceAt({target:e.target});if(!source)return;
  const list=nodes(source.root),i=list.indexOf(source.element),forward=['ArrowRight','ArrowDown'].includes(e.key),target=list[i+(forward?1:-1)];
  if(!target)return;e.preventDefault();
  const intent={kind:source.kind==='group'?'group-reorder':'reorder',[source.kind==='group'?'groupId':'itemId']:source.id,targetId:id(target),position:forward?'after':'before'};
  busy=true;Promise.resolve(onDrop(intent)).then(()=>doc.querySelector(`[${source.kind==='group'?'data-group':'data-item'}="${source.id}"]`)?.focus()).catch(onError).finally(()=>{busy=false;});
 });
 listen(doc,'dragstart',e=>{if(sourceAt({target:e.target}))e.preventDefault();});
 listen(doc,'contextmenu',e=>{if(session?.active){e.preventDefault();e.stopImmediatePropagation();}});
 listen(doc,'selectstart',e=>{if(session)e.preventDefault();});
 listen(doc,'visibilitychange',()=>{if(doc.hidden)cancel();});listen(win,'blur',e=>{if(e.target===win)cancel();});
 return {cancel,isDragging:()=>!!session?.active,destroy:()=>{if(destroyed)return;destroyed=true;clean({guard:false});cancelAnimations();listeners.splice(0).forEach(off=>off());}};
}
