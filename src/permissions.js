// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { readWidgetSources, saveWidgetSources } from './widget-sources.js';

export const PERMISSIONS_CHANGED='qiye:permissions-changed';
export const HOTBOARD_PERMISSION={origins:['https://uapis.cn/*']};
export const HOTBOARD_EXPLANATION='热榜仅通过 GET 读取 uapis.cn 的公开榜单，不携带 Cookie，不读取其他网页或修改平台内容。浏览器按站点统一显示“读取和更改”，无法只授予单个接口的只读权限。';
let epoch=0,installed=false;
export function permissionEpoch(){return epoch;}
export function permissionControl(descriptor,label=t('撤销授权')) {
 return `<button type="button" class="permission-revoke text-button" data-revoke-permission="${e(JSON.stringify(descriptor))}">${e(label)}</button>`;
}
function localLocationGranted() {
 return Object.keys(localStorage).some(key=>key.startsWith('qiye.plugin.grant.')&&key.endsWith('|geolocation')&&localStorage.getItem(key)==='true');
}
export async function hasPermission(descriptor) {
 if(!globalThis.chrome?.runtime?.id)return descriptor.permissions?.includes('geolocation')&&localLocationGranted();
 return chrome.permissions.contains(descriptor);
}
function removed(descriptor) {
 epoch++;
 for(const key of Object.keys(localStorage)){
  if(!key.startsWith('qiye.plugin.grant.'))continue;
  if(descriptor.permissions?.includes(key.endsWith('|geolocation')?'geolocation':'bookmarks'))localStorage.removeItem(key);
 }
 if(descriptor.origins?.length){
  try{
  const sources=readWidgetSources();
  const next=sources.map(source=>descriptor.origins.some(pattern=>pattern==='https://*/*'||pattern===new URL(source.url).origin+'/*')?{...source,enabled:false}:source);
  if(next.some((source,i)=>source.enabled!==sources[i].enabled))saveWidgetSources(next);
  }catch{/* A damaged catalogue must not prevent revocation of live sessions. */}
 }
 globalThis.dispatchEvent(new CustomEvent(PERMISSIONS_CHANGED,{detail:descriptor}));
}
export async function revokePermission(descriptor) {
 if(!descriptor||Object.keys(descriptor).some(k=>!['permissions','origins'].includes(k)))throw new Error('Invalid permission');
 const before=epoch;
 if(globalThis.chrome?.runtime?.id){
  const granted=await chrome.permissions.contains(descriptor);
  if(granted&&!await chrome.permissions.remove(descriptor))throw new Error(t('浏览器未撤销此权限，请到扩展管理页面检查。'));
 }
 // Chrome also broadcasts removals to other open tabs. Avoid duplicate resets.
 if(epoch===before)removed(descriptor);
}
export function permissionAffects(plugin,descriptor) {
 return !!plugin&&(descriptor.permissions?.some(name=>plugin.manifest.capabilities?.includes(name))
  ||descriptor.origins?.some(origin=>origin==='https://*/*'||origin===new URL(plugin.source).origin+'/*'||origin==='https://uapis.cn/*'&&plugin.manifest.id==='qiye.hotsearch'));
}
export async function refreshPermissionControls(root=document) {
 await Promise.all([...root.querySelectorAll('[data-revoke-permission]')].map(async button=>{
  try{const descriptor=JSON.parse(button.dataset.revokePermission),allowed=await hasPermission(descriptor);
   if(!button.isConnected)return;
   button.disabled=!allowed;button.dataset.granted=String(allowed);
   const label=allowed?t('撤销授权'):t('未授权');if(button.textContent!==label)button.textContent=label;
  }catch{button.disabled=true;}
 }));
}
export function permissionsPanel() {
 return `<p class="help-text">${t('授权只在使用相应功能时申请；撤销后停止后续访问，已导入到桌面的内容保留。')}</p>
 <div class="permission-list">
 ${[['bookmarks','浏览器书签','用于选择导入或书签组件；浏览器授权包含书签编辑能力。'],['history','浏览历史','仅在手动搜索时查询匹配的浏览记录。'],['geolocation','定位','用于明确允许定位的组件。网页版还可在浏览器站点设置中撤销定位权限。']].map(([name,title,help])=>`<div class="permission-row"><div><strong>${t(title)}</strong><p>${t(help)}</p></div>${permissionControl({permissions:[name]})}</div>`).join('')}
 <div class="permission-row"><div><strong>${t('热榜访问')} · uapis.cn</strong><p>${t(HOTBOARD_EXPLANATION)}</p></div>${permissionControl(HOTBOARD_PERMISSION)}</div>
 <div data-permission-origins></div></div>
 <p class="help-text">${t('组件源和公开图片 API 可在各自设置中停用。扩展安装时的必要权限需通过浏览器停用或卸载扩展来取消。')}</p>
 <div class="button-row"><button class="secondary-button" data-action="widget-sources">${t('组件源')}</button><button class="secondary-button" data-action="wallpaper">${t('壁纸')}</button></div>`;
}
export async function populatePermissionOrigins(root) {
 const container=root.querySelector('[data-permission-origins]');if(!container)return;
 const api=globalThis.chrome;if(!api?.runtime?.id)return;
 const all=await api.permissions.getAll(),required=api.runtime.getManifest().host_permissions||[];
 if(!container.isConnected)return;
 container.innerHTML=(all.origins||[]).filter(origin=>origin!=='https://uapis.cn/*'&&!required.includes(origin)).map(origin=>`<div class="permission-row"><div><strong>${e(origin)}</strong><p>${t('网站图标、WebDAV 或自定义组件源的站点访问权限。撤销会影响共享此站点权限的功能。')}</p></div>${permissionControl({origins:[origin]})}</div>`).join('');
 await refreshPermissionControls(root);
}
export function installPermissionControls({toast,onRemoved=()=>{}}) {
 if(installed)return;installed=true;
 chromeApi()?.onRemoved?.addListener(removed);
 chromeApi()?.onAdded?.addListener(()=>refreshPermissionControls());
 window.addEventListener(PERMISSIONS_CHANGED,event=>{onRemoved(event.detail);void refreshPermissionControls();void populatePermissionOrigins(document);});
 window.addEventListener('storage',event=>{if(event.key?.startsWith('qiye.plugin.grant.')&&event.newValue===null)removed({permissions:[event.key.endsWith('|geolocation')?'geolocation':'bookmarks']});});
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-revoke-permission]');if(!button||button.disabled)return;
  button.disabled=true;
  try{await revokePermission(JSON.parse(button.dataset.revokePermission));toast(t('授权已撤销。'));}
  catch(error){toast(error.message);}
  finally{void refreshPermissionControls();}
 });
 const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.('[data-revoke-permission]')||node.querySelector?.('[data-revoke-permission]')))))void refreshPermissionControls();});
 observer.observe(document.body,{childList:true,subtree:true});
}
function chromeApi(){return globalThis.chrome?.permissions;}
