// SPDX-License-Identifier: GPL-3.0-only
// Keep loaded images, focus and widget DOM when only a sibling's position changes.
const keyedRoots = new WeakMap();

export function reconcileKeyedChildren(root, entries) {
 const previous = keyedRoots.get(root) || new Map();
 const next = new Map(), created = [], removed = [];
 const keys = new Set();
 for (const entry of entries) {
  if (keys.has(entry.key)) throw new Error('Duplicate view key');
  keys.add(entry.key);
 }
 // Build only new/changed nodes, before mutating the live tree.
 for (const entry of entries) {
  const old = previous.get(entry.key);
  let record = old;
  if (!old || old.signature !== entry.signature || old.node.parentElement !== root) {
   const template = root.ownerDocument.createElement('template');
   template.innerHTML = entry.render();
   const node = template.content.firstElementChild;
   if (!node || template.content.childElementCount !== 1) throw new Error('A keyed view must have one root');
   record = {node, signature: entry.signature};
   created.push(node);
  }
  next.set(entry.key, record);
 }
 const wanted = new Set([...next.values()].map(entry => entry.node));
 for (const child of [...root.children]) {
  if (!wanted.has(child)) { removed.push(child); child.remove(); }
 }
 // A pointer drag has already put nodes in this order, so the common drop path
 // makes NO DOM moves and never rewrites an img.src or loaded CSS class.
 let cursor = root.firstElementChild;
 for (const {node} of next.values()) {
  if (node !== cursor) {
   if (typeof root.moveBefore === 'function' && node.isConnected && root.isConnected) root.moveBefore(node, cursor);
   else root.insertBefore(node, cursor);
  }
  cursor = node.nextElementSibling;
 }
 keyedRoots.set(root, next);
 return {created, removed};
}
