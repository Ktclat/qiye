// SPDX-License-Identifier: GPL-3.0-only
import { t, getLocale } from './i18n.js';
import { loadWebDAVConfig, saveWebDAVConfig, clearWebDAVConfig, requestWebDAVPermission, testWebDAVConnection, syncWebDAV, completeWebDAVDownload, getWebDAVStatus } from './webdav.js';
import { icon } from './icons.js';
import { PERMISSIONS_CHANGED, permissionControl, permissionEpoch } from './permissions.js';

const syncEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMPTY_CONFIG = {enabled:false,endpoint:'',path:'qiye.json',username:'',password:'',autoSync:false};

/** The UI never inserts a saved password into HTML, exports, or status messages. */
export function createSyncController(context) {
 let config = {...EMPTY_CONFIG}, status = {}, ready = false, busy = false;
 let autoTimer = null, lastAutoAttempt = 0, autoPaused = false, pendingReview = null, configBroken = false;
 let message = t("连接自己的 WebDAV，把桌面带到另一台设备。"), messageKind = 'idle';
 const panel = () => document.querySelector('#webdav-form');
 const formatDate = timestamp => Number.isFinite(Number(timestamp)) && Number(timestamp)>0 ? new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(Number(timestamp))) : t("尚未同步");
 const isExtension = () => Boolean(globalThis.chrome?.runtime?.id);
 const cloneConfig = value => ({...EMPTY_CONFIG,...value});
 const accessRemoved=async event=>{
  if(!config.endpoint||!event.detail.origins?.some(origin=>origin==='https://*/*'||origin===new URL(config.endpoint).origin+'/*'))return;
  clearTimeout(autoTimer);autoPaused=true;
  try{config=cloneConfig(await saveWebDAVConfig({...config,enabled:false}));setMessage(t('站点授权已撤销，自动同步已暂停。'));context.refreshPanel();}
  catch(error){context.toast(error.message);}
 };
 globalThis.addEventListener?.(PERMISSIONS_CHANGED,accessRemoved);
 function setMessage(text, kind='idle') {
  message = String(text || ''); messageKind = kind;
  const element = document.querySelector('#webdav-status');
  if (element) {element.textContent = message; element.dataset.kind = kind;}
  document.querySelectorAll('[data-webdav-busy]').forEach(button => {button.disabled = busy || (button.hasAttribute('data-webdav-needs-config') && !config.enabled);});
 }
 async function refresh() {
  status = await getWebDAVStatus();
  const last = document.querySelector('#webdav-last-sync');
  if (last) last.textContent = formatDate(status.lastSyncedAt);
 }
 function readForm(form) {
  if (!form) return {...config};
  const data = new FormData(form);
  const rawPassword = String(data.get('davPassword') ?? '');
  return {
   enabled:true, endpoint:String(data.get('davEndpoint') || '').trim(),
   path:String(data.get('davPath') || '').trim(), username:String(data.get('davUsername') || '').trim(),
   password:rawPassword || config.password, autoSync:data.has('davAutoSync')
  };
 }
 function assertSavedForm() {
  const current = readForm(panel());
  if (['endpoint','path','username','password','autoSync'].some(key => current[key] !== config[key])) throw new Error(t("WebDAV 配置已修改，请先点击“保存并启用”，再同步。"));
 }
 async function run(operation, text) {
  if (busy) return;
  busy = true; setMessage(text,'busy');
  try {return await operation();}
  catch (error) {
   setMessage(error.message || t("同步没有完成，请重试。"),'error');
   context.toast(error.message || t("同步没有完成，请重试。"));
   return null;
  } finally {busy = false; setMessage(message,messageKind);}
 }
 function showReview(result) {
  pendingReview = result; autoPaused = true;
  context.openDialog('sync-review',{result});
 }
 async function consume(result, {manual=false, decision=null} = {}) {
  if (!result) return;
  if(result.status==='config-changed'){
   config=cloneConfig(await loadWebDAVConfig());pendingReview=null;autoPaused=true;await refresh();
   setMessage(t("WebDAV 连接在另一标签页中更改了，请检查配置后重新同步。"),'review');context.refreshPanel();if(manual)context.toast(message);return result;
  }
  await refresh();
  if (result.status === 'conflict' || (result.status === 'download-ready' && decision !== 'download')) {
   pendingReview = result; autoPaused = true;
   setMessage(result.status === 'conflict' ? t("本机与远端需要确认，请选择要保留的桌面。") : t("远端有新桌面，确认后可更新本机。"),'review');
   if (manual) showReview(result);
   else context.toast(message,()=>showReview(result),t("查看"));
   return result;
  }
  if (result.status === 'download-ready') {
   // applyRemote checks live memory and pending local writes again before saving.
   const saved = await context.applyRemote(result.state, result.localFingerprint);
   await completeWebDAVDownload(result,saved);
   pendingReview = null; autoPaused = false; await refresh();
   setMessage(t("远端桌面已应用到本机。"),'success');
   context.closeDialog(); context.toast(message); return result;
  }
  if (result.status === 'uploaded' || result.status === 'unchanged') {
   pendingReview = null; autoPaused = false;
   setMessage(result.message || (result.status==='uploaded'?t("本机桌面已上传。"):t("本机与远端已一致。")),'success');
   if (decision) context.closeDialog();
   if (manual) context.toast(message);
   return result;
  }
  setMessage(result.message || t("请先手动同步一次。"),result.status==='local-changed'?'review':'idle');
  if (manual) context.toast(message);
  return result;
 }
 async function performSync({manual=false, mode='sync', review=null} = {}) {
  if (!config.enabled || !config.endpoint) {context.toast(t("请先保存并启用 WebDAV 配置。"));return;}
  if (busy) return;
  if (manual) assertSavedForm();
  // On manual clicks, request permission before awaiting any storage operation.
  const permission = manual ? requestWebDAVPermission(config) : Promise.resolve(true);
  return run(async () => {
   await permission;
   const latest=cloneConfig(await loadWebDAVConfig());
   if(Object.keys(EMPTY_CONFIG).some(key=>latest[key]!==config[key])){
    config=latest;pendingReview=null;autoPaused=true;await refresh();
    setMessage(t("WebDAV 连接在另一标签页中更改了，请检查配置后重新同步。"),'review');context.refreshPanel();if(manual)context.toast(message);return;
   }
   await context.beforeSync();
   const accessEpoch=permissionEpoch();
   const result = await syncWebDAV(context.getState(),{mode,manual,expectedConfig:{...config}, ...(review?{review}:{})});
   if(accessEpoch!==permissionEpoch()){autoPaused=true;return;}
   return consume(result,{manual,decision:review?mode:null});
  },t("正在比较本机与远端桌面…"));
 }
 function scheduleLocal(delay=5000) {
  if (!ready || !config.enabled || !config.autoSync || !status.hasBaseline || autoPaused) return;
  clearTimeout(autoTimer);
  const wait = Math.max(delay,60000-(Date.now()-lastAutoAttempt));
  autoTimer = setTimeout(async () => {
   autoTimer = null;
   if (document.hidden || busy || !config.enabled || !config.autoSync || autoPaused || context.isEditing?.()) return;
   lastAutoAttempt = Date.now();
   await performSync();
  },wait);
 }
 function renderPanel() {
  if (!ready) return `<p class="help-text">${t("正在读取本机同步配置…")}</p>`;
  return `<section class="sync-intro"><span class="sync-symbol">${icon('cloud')}</span><div><h3>${t("你的桌面，你的 WebDAV")}</h3><p>${t("无需栖页账号，直接连接你自己的存储服务。")}</p></div></section>
   <div class="sync-overview"><span>${config.enabled?t("已启用"):t("未启用")} · WebDAV</span><span id="webdav-last-sync">${syncEscape(formatDate(status.lastSyncedAt))}</span></div>
   <form id="webdav-form" autocomplete="off">
    <label class="field"><span>${t("WebDAV 目录地址")}</span><input name="davEndpoint" type="url" value="${syncEscape(config.endpoint)}" placeholder="https://dav.example.com/your-folder/" required autocomplete="url" spellcheck="false"><small>${t("填写已存在的目录地址；栖页会在这个目录中读写下方的 JSON 文件。")}</small></label>
    <div class="two-columns"><label class="field"><span>${t("用户名")}</span><input name="davUsername" value="${syncEscape(config.username)}" autocomplete="off" spellcheck="false" maxlength="300" placeholder="${t("WebDAV 用户名")}"></label><label class="field"><span>${t("密码 / 应用密码")}</span><input name="davPassword" type="password" autocomplete="new-password" maxlength="4096" placeholder="${config.password?t("已保存，留空保持原密码"):t("服务提供的密码或应用密码")}"></label></div>
    <label class="field"><span>${t("同步文件")}</span><input name="davPath" value="${syncEscape(config.path)}" placeholder="qiye.json" required maxlength="600" spellcheck="false"><small>${t("例如 qiye.json。多台设备填写同一目录和文件；文件不存在时，首次手动同步会创建。")}</small></label>
    <label class="setting-row"><span class="setting-copy"><strong>${t("自动检查同步")}</strong><small>${t("手动同步成功后，在栖页打开期间检查。远端更新或冲突会先提示确认。")}</small></span><input name="davAutoSync" type="checkbox" class="switch" ${config.autoSync?'checked':''} aria-label="${t("自动检查同步")}"></label>
    <div class="button-row sync-form-actions"><button type="button" class="secondary-button" data-action="webdav-test" data-webdav-busy ${busy?'disabled':''}>${t("{v0}测试连接", {v0: icon('check')})}</button><button type="submit" class="primary-button" data-webdav-busy ${busy?'disabled':''}>${t("{v0}保存并启用", {v0: icon('check')})}</button></div>
   </form>
   <div id="webdav-status" class="sync-status" role="status" aria-live="polite" data-kind="${messageKind}">${syncEscape(message)}</div>
   <div class="sync-actions"><button class="primary-button" data-action="webdav-sync" data-webdav-busy data-webdav-needs-config ${busy||!config.enabled?'disabled':''}>${t("{v0}立即同步", {v0: icon('sync')})}</button>${pendingReview?`<button class="secondary-button" data-action="webdav-review">${t("查看待确认内容")}</button>`:''}${config.enabled?`<button class="text-button" data-action="webdav-disable" data-webdav-busy>${t("暂停同步")}</button>`:''}${config.endpoint||configBroken?`<button class="text-button" data-action="webdav-clear" data-webdav-busy>${t("清除本机连接")}</button>`:''}</div>
   ${config.endpoint&&isExtension()?permissionControl({origins:[new URL(config.endpoint).origin+'/*']}):''}<div class="sync-details"><p>${t("同步网址、分组、布局、便签、待办和壁纸设置。WebDAV 密码仅保存在本机，不进入 JSON 备份或同步文件。远端文件是普通 JSON，请使用你信任的私有目录。")}</p><p>${t("{v0}连接测试只读取；写入权限会在实际同步时检查。", {v0: isExtension()?t("安装版会在首次连接时请求对应站点的访问权限。"):t("网页版需要 WebDAV 服务允许此网站跨域访问（CORS）；若服务不支持，请使用扩展安装版。")})}</p></div>`;
 }
 function renderReview(result=pendingReview) {
  if (!result) return `<div class="dialog-body"><p class="help-text">${t("没有待确认的同步。请重新检查。")}</p></div>`;
  const remote = result.remoteState || result.state;
  const local = context.getState();
  const summary = (data,title) => `<div class="sync-review-card"><strong>${title}</strong><div>${data?.items?.length ?? 0}<small>${t("个桌面项目")}</small></div><p>${t("{v0} 个分组 · {v1} 条待办", {v0: data?.groups?.length ?? 0, v1: data?.todos?.length ?? 0})}<br>${t("便签 {v0} 字", {v0: (data?.notes || '').length})}<br>${syncEscape(formatDate(data?.updatedAt))}</p></div>`;
  return `<div class="dialog-body"><p class="help-text">${syncEscape(result.message || t("请选择要保留的桌面。确认前可以分别导出一份副本。"))}</p><div class="sync-review-grid">${summary(local,t("本机桌面"))}${remote?summary(remote,t("WebDAV 远端")):`<div class="sync-review-card"><strong>${t("WebDAV 远端")}</strong><p>${t("同步文件不存在。")}</p></div>`}</div><div class="sync-review-backups"><button class="secondary-button" data-action="webdav-export-local">${t("{v0}导出本机副本", {v0: icon('download')})}</button>${remote?`<button class="secondary-button" data-action="webdav-export-remote">${t("导出远端副本")}</button>`:''}</div><p class="help-text">${t("{v0}确认时会再次检查版本；若期间发生变化，会请你重新选择。", {v0: remote?t("“使用远端”会替换本机桌面；“保留本机”会更新远端文件。"):t("确认保留本机后，会在 WebDAV 中创建同步文件。")})}</p><div class="button-row"><button class="secondary-button" data-close>${t("稍后处理")}</button>${remote?`<button class="secondary-button" data-action="webdav-use-remote" data-webdav-busy>${t("使用远端")}</button>`:''}<button class="primary-button" data-action="webdav-use-local" data-webdav-busy>${t("保留本机")}</button></div></div>`;
 }
 async function saveFromForm(form) {
  if(busy)return;
  const draft = readForm(form);
  const permission = requestWebDAVPermission(draft);
  return run(async () => {
   await permission; config = cloneConfig(await saveWebDAVConfig(draft)); await refresh();
   autoPaused=false; pendingReview=null; clearTimeout(autoTimer);
   setMessage(t("配置已保存在本机。点击“立即同步”开始。"),'success');
   context.refreshPanel(); context.toast(t("WebDAV 已启用。现在可以点击立即同步。"));
  },t("正在保存 WebDAV 配置…"));
 }
 function handleAction(action) {
  if (!action?.startsWith('webdav-')) return false;
  if(busy)return true;
  if (action==='webdav-test') {
   const draft=readForm(panel()), permission=requestWebDAVPermission(draft);
   return run(async()=>{await permission;const result=await testWebDAVConnection(draft);setMessage(result.message || t("读取连接成功。保存配置后可开始同步。"),'success');},t("正在测试读取连接…"));
  }
  if (action==='webdav-sync') return performSync({manual:true});
  if (action==='webdav-review') return pendingReview && showReview(pendingReview);
  if (action==='webdav-use-local'||action==='webdav-use-remote') {
   if(!pendingReview){context.toast(t("待确认内容已过期，请重新同步。"));return true;}
   return performSync({manual:true,mode:action==='webdav-use-local'?'upload':'download',review:pendingReview.review});
  }
  if(action==='webdav-export-local'){context.exportBackup(context.getState());return true;}
  if(action==='webdav-export-remote'){const remote=pendingReview?.remoteState||pendingReview?.state;if(remote)context.exportBackup(remote);return true;}
  if(action==='webdav-disable')return run(async()=>{config=cloneConfig(await saveWebDAVConfig({...config,enabled:false}));clearTimeout(autoTimer);await refresh();setMessage(t("同步已暂停。本机和远端桌面均已保留。"));context.refreshPanel();},t("正在暂停同步…"));
  if(action==='webdav-clear') {
   context.openDialog('confirm',{title:t("清除本机 WebDAV 连接？"),message:t("移除当前浏览器中的 WebDAV 地址、密码和同步记录。桌面内容与远端文件都会保留。"),label:t("清除连接"),callback:()=>run(async()=>{await clearWebDAVConfig();config={...EMPTY_CONFIG};configBroken=false;pendingReview=null;autoPaused=false;clearTimeout(autoTimer);await refresh();setMessage(t("本机 WebDAV 连接已清除。"));context.openDialog('settings',{tab:'sync'});},t("正在清除本机连接…"))});
   return true;
  }
  return true;
 }
 return {
  init:async()=>{try{config=cloneConfig(await loadWebDAVConfig());await refresh();ready=true;if(status.lastError)setMessage(status.lastError,'error');else if(config.enabled)setMessage(status.hasBaseline?t("WebDAV 已连接，可随时检查更新。"):t("WebDAV 已配置，请先手动同步一次。"));scheduleLocal(3000);}catch(error){ready=true;configBroken=true;setMessage(error.message||t("同步配置无法读取，请清除本机连接后重新填写。"),'error');}},
  renderPanel,renderReview,saveFromForm,handleAction,scheduleLocal,
  onVisible:()=>scheduleLocal(2000),
  onIdle:()=>{if(!autoTimer)scheduleLocal(5000);},
  dispose:()=>{clearTimeout(autoTimer);globalThis.removeEventListener?.(PERMISSIONS_CHANGED,accessRemoved);}
 };
}
