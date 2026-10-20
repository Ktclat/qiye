// SPDX-License-Identifier: GPL-3.0-only
import { pluginCard, mountPlugin, updatePluginFrames } from './plugin-host.js';
export const widgetCatalog = [];
const bindings=new WeakMap();
export function renderWidget(item) { return pluginCard(item); }
export function bindWidgets(container, host) {
 const mounted=bindings.get(container)||new Map();bindings.set(container,mounted);
 // Keep sibling frames (and their editor drafts) when a different card changes.
 for(const [root,dispose] of mounted)if(!root.isConnected){dispose();mounted.delete(root);}
 for(const root of container.querySelectorAll('[data-plugin-slot]')){
  if(mounted.has(root))continue;
  const item=host.getState().items.find(item=>item.id===root.dataset.widgetId);
  if(item)mounted.set(root,mountPlugin(root,item,host,'card'));
 }
 return ()=>{for(const dispose of mounted.values())dispose();mounted.clear();};
}
export function refreshLiveWidgets(container,state) { updatePluginFrames(container,state); }
