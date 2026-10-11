/**
 * Grid dragging for Qiye. Pointer events are the only drop authority: native
 * browser drags are suppressed for our cards, never interpreted as app data.
 *
 * Cards use [data-item] / [data-item-type], sidebar buttons use [data-group].
 * Every card may expose a button[data-drag-handle]. Widget contents and normal
 * touch scrolling remain interactive because only handles start their drags.
 * The handle needs CSS touch-action:none; group buttons need it while editable.
 */

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
  return { kind:'group-reorder', groupId:source.id, targetId:target.id, position:dropPosition(target.rect, point, true) };
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

/** Vertical edge speed, in pixels/frame; no movement outside the scroll area. */
export function edgeScrollDelta(position, start, end, edge = 64, maxSpeed = 20) {
 if (![position, start, end].every(Number.isFinite) || end <= start || position < start || position > end) return 0;
 const band = Math.min(edge, (end - start) / 3);
 if (band <= 0) return 0;
 if (position < start + band) return -maxSpeed * ((start + band - position) / band) ** 2;
 if (position > end - band) return maxSpeed * ((position - end + band) / band) ** 2;
 return 0;
}

/**
 * onDrop receives one of resolveDropIntent's intents and may return a Promise.
 * The caller owns state mutation/persistence and should handle it atomically.
 * cancel() is safe before any desktop rerender or modal opening. destroy()
 * removes the delegated listeners. All desktop nodes may be freely rerendered.
 */
export function createDesktopDragController({
 document: doc = globalThis.document,
 getState,
 getActiveGroupId = () => getState().activeGroupId,
 onDrop,
 canDragGroups = () => false,
 isBlocked = () => false,
 onError = () => {},
 onStart = () => {}
}) {
 if (!doc || typeof getState !== 'function' || typeof onDrop !== 'function') throw new TypeError('Dragging requires a document, state reader and drop callback.');
 const win = doc.defaultView || globalThis;
 let session = null, frame = null, indicator = null, preview = null, marked = null;
 let suppression = null, busy = false, destroyed = false;
 const listeners = [];
 const listen = (node, type, callback, options = true) => {
  node.addEventListener(type, callback, options);
  listeners.push(() => node.removeEventListener(type, callback, options));
 };
 const element = target => target?.nodeType === 3 ? target.parentElement : target;
 const desktop = () => doc.getElementById('desktop');
 const groupList = () => doc.getElementById('groups');
 const now = () => Date.now();

 function sourceAt(event) {
  const target = element(event.target);
  if (!target?.closest) return null;
  const tile = target.closest('[data-item]'), handle = target.closest('[data-drag-handle]');
  if (tile && desktop()?.contains(tile)) {
   const item = getState().items.find(entry => entry.id === tile.dataset.item);
   if (!item || item.folderId || item.groupId !== getActiveGroupId()) return null;
   const ownHandle = handle && tile.contains(handle);
   if (!ownHandle) {
    if (item.type === 'widget' || (event.pointerType && event.pointerType !== 'mouse')) return null;
    if (target.closest('input,textarea,select,[contenteditable],[data-no-drag]')) return null;
    const control = target.closest('button,a');
    if (control && !(item.type === 'link' && control.dataset.openLink === item.id) &&
        !(item.type === 'folder' && control.dataset.openFolder === item.id)) return null;
   }
   if (ownHandle && handle.disabled) return null;
   return { kind:'item', id:item.id, element:tile, handle:ownHandle ? handle : null, title:item.title, type:item.type };
  }
  const group = target.closest('[data-group]');
  if (group && groupList()?.contains(group) && canDragGroups()) {
   const item = getState().groups.find(entry => entry.id === group.dataset.group);
   if (item) return { kind:'group', id:item.id, element:group, handle:group, title:item.name, type:'group' };
  }
  return null;
 }

 function clearMark() {
  marked?.classList.remove(...DROP_CLASSES);
  marked = null;
  if (indicator) indicator.hidden = true;
 }

 function armClickGuard(drag, waitForRelease) {
  suppression = { pointerId:drag.pointerId, x:drag.x, y:drag.y, until:now() + CLICK_GUARD_MS, waitForRelease };
 }

 function clean(waitForRelease = false, guard = true) {
  const previous = session;
  session = null;
  if (frame !== null) win.cancelAnimationFrame(frame);
  frame = null;
  if (previous?.active && guard) armClickGuard(previous, waitForRelease);
  previous?.source.element.classList.remove('dragging');
  doc.body.classList.remove('is-dragging');
  clearMark();
  indicator?.remove(); preview?.remove(); indicator = null; preview = null;
  if (previous?.capture) {
   try { previous.capture.releasePointerCapture(previous.pointerId); } catch { /* Pointer may already have ended. */ }
  }
 }

 function cancel() { clean(true); }

 function sourceStillValid() {
  if (!session?.source.element.isConnected || isBlocked()) return false;
  const source = session.source, state = getState();
  if (source.kind === 'group') return canDragGroups() && state.groups.some(group => group.id === source.id);
  return state.items.some(item => item.id === source.id && item.groupId === getActiveGroupId() && !item.folderId);
 }

 function movePreview() {
  if (!preview || !session) return;
  const width = preview.offsetWidth || 190, height = preview.offsetHeight || 62;
  const left = Math.max(8, Math.min(session.x + 16, win.innerWidth - width - 8));
  const top = Math.max(8, Math.min(session.y + 16, win.innerHeight - height - 8));
  preview.style.transform = `translate3d(${left}px,${top}px,0)`;
 }

 function begin() {
  const drag = session;
  if (!drag || !sourceStillValid()) return clean();
  drag.active = true;
  drag.source.element.classList.add('dragging');
  doc.body.classList.add('is-dragging');
  try {
   drag.capture = drag.source.handle || drag.source.element;
   drag.capture.setPointerCapture(drag.pointerId);
  } catch { drag.capture = null; }
  doc.getSelection?.()?.removeAllRanges();
  preview = doc.createElement('div'); preview.className = 'drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.style.position = 'fixed'; preview.style.left = '0'; preview.style.top = '0'; preview.style.pointerEvents = 'none';
  const hint = doc.createElement('small'), title = doc.createElement('strong');
  hint.textContent = ({link:'移动网站',folder:'移动文件夹',widget:'移动组件',group:'移动分组'})[drag.source.type] || '移动项目';
  title.textContent = drag.source.title || '未命名';
  preview.append(hint, title); doc.body.append(preview);
  indicator = doc.createElement('div'); indicator.className = 'drag-indicator'; indicator.hidden = true;
  indicator.setAttribute('aria-hidden', 'true'); indicator.style.position = 'fixed'; indicator.style.pointerEvents = 'none';
  doc.body.append(indicator);
  movePreview();
  try { onStart(); } catch (error) { onError(error); }
  if (session === drag && drag.active) frame = win.requestAnimationFrame(tick);
 }

 function targetAt(point) {
  const grid = desktop(), hit = doc.elementFromPoint(point.x, point.y);
  if (!hit?.closest || point.x < 0 || point.y < 0 || point.x > win.innerWidth || point.y > win.innerHeight) return null;
  const group = hit.closest('[data-group]');
  if (group && groupList()?.contains(group)) return { kind:'group', id:group.dataset.group, element:group, rect:group.getBoundingClientRect() };
  if (session.source.kind === 'group' || !grid) return null;
  const tile = hit.closest('[data-item]');
  if (tile && grid.contains(tile)) return { kind:'item', id:tile.dataset.item, element:tile, rect:tile.getBoundingClientRect() };
  const rect = grid.getBoundingClientRect();
  if (!grid.contains(hit) || point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return null;
  const tiles = [...grid.querySelectorAll('[data-item]')].filter(node => node.dataset.item !== session.source.id);
  const add = hit.closest('.tile-add');
  const last = tiles.at(-1);
  const belowAll = tiles.length && point.y > Math.max(...tiles.map(node => node.getBoundingClientRect().bottom)) + 6;
  if (add || !tiles.length || belowAll) {
   const marker = add || last || grid;
   return { kind:'desktop', id:getActiveGroupId(), element:marker, rect:marker.getBoundingClientRect(), appendBefore:!!add };
  }
  let nearest = null, distance = Infinity;
  for (const node of tiles) {
   const bounds = node.getBoundingClientRect();
   const dx = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
   const dy = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
   const value = dx * dx + dy * dy;
   if (value < distance) { nearest = { kind:'item', id:node.dataset.item, element:node, rect:bounds }; distance = value; }
  }
  return nearest;
 }

 function drawTarget(target, intent) {
  clearMark();
  if (!target || !intent) return;
  marked = target.element;
  if (intent.kind === 'folder' || intent.kind === 'group') {
   marked.classList.add('drop-inside');
   return;
  }
  const position = intent.kind === 'append' ? (target.appendBefore ? 'before' : 'after') : intent.position;
  marked.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
  const rect = target.rect, vertical = intent.kind === 'group-reorder';
  indicator.dataset.axis = vertical ? 'y' : 'x';
  indicator.hidden = false;
  indicator.style.left = `${vertical ? rect.left + 3 : (position === 'before' ? rect.left : rect.right) - 2}px`;
  indicator.style.top = `${vertical ? (position === 'before' ? rect.top : rect.bottom) - 2 : rect.top + 3}px`;
  indicator.style.width = `${vertical ? Math.max(16, rect.width - 6) : 4}px`;
  indicator.style.height = `${vertical ? 4 : Math.max(18, rect.height - 6)}px`;
 }

 function updateTarget() {
  if (!session?.active) return;
  if (!sourceStillValid()) return cancel();
  const point = { x:session.x, y:session.y }, target = targetAt(point);
  const intent = resolveDropIntent({ state:getState(), source:session.source, target, point });
  session.intent = intent;
  drawTarget(target, intent);
  movePreview();
 }

 function scrollElement(node, bounds) {
  if (!session || session.x < bounds.left || session.x > bounds.right) return false;
  const delta = edgeScrollDelta(session.y, bounds.top, bounds.bottom);
  const before = node.scrollTop, limit = Math.max(0, node.scrollHeight - node.clientHeight);
  if (!delta || limit <= 0) return false;
  node.scrollTop = Math.max(0, Math.min(limit, before + delta));
  return node.scrollTop !== before;
 }

 function autoScroll() {
  let node = doc.elementFromPoint(session.x, session.y);
  const page = doc.scrollingElement || doc.documentElement;
  while (node && node !== doc.body && node !== page) {
   if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(win.getComputedStyle(node).overflowY)) {
    const rect = node.getBoundingClientRect();
    const bounds = {left:rect.left,right:rect.right,top:Math.max(0,rect.top),bottom:Math.min(win.innerHeight,rect.bottom)};
    if (scrollElement(node, bounds)) return true;
   }
   node = node.parentElement;
  }
  return scrollElement(page, {left:0,right:win.innerWidth,top:0,bottom:win.innerHeight});
 }

 function tick() {
  frame = null;
  if (!session?.active) return;
  if (!sourceStillValid()) return cancel();
  if (autoScroll()) updateTarget();
  if (session?.active) frame = win.requestAnimationFrame(tick);
 }

 function pointerDown(event) {
  if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
  // A fresh gesture is intentional; only a previous drag's synthetic click is blocked.
  suppression = null;
  if (session) clean();
  if (destroyed || busy || isBlocked()) return;
  const source = sourceAt(event);
  if (!source) return;
  session = { source, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, x:event.clientX, y:event.clientY, active:false, intent:null, capture:null };
  if (source.handle) event.preventDefault();
 }

 function pointerMove(event) {
  if (!session || event.pointerId !== session.pointerId) return;
  if (event.buttons === 0 && event.pointerType === 'mouse') return cancel();
  session.x = event.clientX; session.y = event.clientY;
  if (!session.active && Math.hypot(session.x - session.startX, session.y - session.startY) >= DRAG_THRESHOLD) begin();
  if (!session?.active) return;
  event.preventDefault();
  updateTarget();
 }

 function pointerUp(event) {
  if (suppression?.waitForRelease && event.pointerId === suppression.pointerId) {
   suppression.x = event.clientX; suppression.y = event.clientY;
   suppression.waitForRelease = false; suppression.until = now() + CLICK_GUARD_MS;
  }
  if (!session || event.pointerId !== session.pointerId) return;
  if (!session.active) return clean(false, false);
  event.preventDefault();
  session.x = event.clientX; session.y = event.clientY;
  updateTarget();
  const intent = session?.intent;
  clean(false);
  if (!intent) return;
  busy = true;
  Promise.resolve().then(() => onDrop(intent)).catch(error => onError(error)).finally(() => { busy = false; });
 }

 function guardClick(event) {
  if (!suppression || event.detail === 0) return;
  if (!suppression.waitForRelease && now() > suppression.until) { suppression = null; return; }
  if (Math.hypot(event.clientX - suppression.x, event.clientY - suppression.y) > 28) return;
  if (event.pointerId !== undefined && event.pointerId !== suppression.pointerId) return;
  event.preventDefault(); event.stopImmediatePropagation(); suppression = null;
 }

 listen(doc, 'pointerdown', pointerDown);
 listen(doc, 'pointermove', pointerMove, { capture:true, passive:false });
 listen(doc, 'pointerup', pointerUp);
 listen(doc, 'pointercancel', event => { if (session?.pointerId === event.pointerId) clean(false); });
 listen(doc, 'lostpointercapture', event => {
  // Capture may transfer from the pressed child (an anchor, for example) to
  // its card. Losing that previous target is not losing our current capture.
  if (session?.active && session.pointerId === event.pointerId && event.target === session.capture) clean(false);
 });
 listen(doc, 'click', guardClick);
 listen(doc, 'contextmenu', event => {
  // A touch handle can produce a long-press menu while a drag is pending.
  // Other right clicks and long presses keep the app's normal context menu.
  if (!session || (!session.active && !session.source.handle)) return;
  event.preventDefault(); event.stopImmediatePropagation();
 });
 listen(doc, 'keydown', event => {
  if (event.key !== 'Escape' || !session) return;
  const active = session.active;
  cancel();
  if (active) { event.preventDefault(); event.stopImmediatePropagation(); }
 });
 listen(doc, 'selectstart', event => { if (session) event.preventDefault(); });
 listen(doc, 'dragstart', event => { if (sourceAt({ target:event.target, pointerType:'mouse' })) event.preventDefault(); });
 listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
 listen(win, 'blur', cancel);
 return {
  cancel,
  isDragging:() => !!session?.active,
  destroy:() => { if (destroyed) return; destroyed = true; clean(false, false); suppression = null; listeners.splice(0).forEach(remove => remove()); }
 };
}
