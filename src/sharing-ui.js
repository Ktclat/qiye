// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { createLayout, validateLayout, layoutImportPlan, layoutShareLink, LAYOUT_MAX_BYTES } from './layout-sharing.js';
import { publicHttpsUrl, requestPublicOrigin, fetchPublicJson } from './public-json.js';

export function sharingView(state,url='') {
  return `<div class="sharing-view"><h3>${t('分享与导入')}</h3><p>${t('通过 JSON 文件或公开链接分享网站、分组和组件排布。')}</p>
  <section class="exchange-panel"><h4>${t('导入排布')}</h4><form data-layout-load><label class="field"><span>${t('分享链接或 JSON 地址')}</span><input name="url" type="url" value="${e(url)}" placeholder="https://…" required></label><button class="primary-button">${t('读取并预览')}</button></form><label class="file-import">${t('或选择 JSON 文件')}<input type="file" data-layout-file accept="application/json,.json"></label><div data-layout-preview></div></section>
  <section class="exchange-panel"><h4>${t('导出排布')}</h4><form data-layout-export><label class="field"><span>${t('分享名称')}</span><input name="title" value="${t('我的桌面分享')}" maxlength="80" required></label><fieldset><legend>${t('选择分组')}</legend>${state.groups.map(group=>`<label><input type="checkbox" name="groups" value="${e(group.id)}"${group.id===state.activeGroupId?' checked':''}>${e(group.name)}</label>`).join('')}</fieldset><label><input name="appearance" type="checkbox">${t('包含外观设置')}</label><p>${t('组件只分享尺寸和位置，便签、备忘录、待办及其他个人内容不会导出；组件设置恢复默认。')}</p><button class="primary-button">${t('下载分享文件')}</button></form><p>${t('把文件放到自己的仓库或网站，填入公开 JSON 地址，即可生成分享链接。')}</p><form data-layout-link><label class="field"><span>${t('公开 JSON 地址')}</span><input type="url" name="url" required placeholder="https://…"></label><button class="secondary-button">${t('生成分享链接')}</button><input data-share-link readonly hidden aria-label="${t('分享链接')}"></form></section><p class="exchange-status" data-exchange-status role="status"></p><button class="secondary-button" data-layout-undo hidden>${t('撤销本次导入')}</button></div>`;
}

export function sourceFromShareLink(value) {
  const url=new URL(value);
  if(url.hash.startsWith('#import='))return publicHttpsUrl(decodeURIComponent(url.hash.slice(8)));
  return publicHttpsUrl(value);
}

export function bindSharing(root,host) {
  const events=new AbortController(),options={signal:events.signal};let layout,loading=false,undo=null;
  const status=root.querySelector('[data-exchange-status]');
  const report=message=>{if(root.isConnected)status.textContent=message;};
  const preview=value=>{
    layout=validateLayout(value);
    const state=host.getState();
    root.querySelector('[data-layout-preview]').innerHTML=`<form data-layout-apply><h4>${e(layout.title)}</h4><p>${e(layout.description)}</p><fieldset><legend>${t('选择分组')}</legend>${layout.groups.map(group=>`<label><input type="checkbox" name="groups" value="${e(group.id)}" checked>${e(group.name)} (${layout.items.filter(item=>item.groupId===group.id).length})</label>`).join('')}</fieldset><details><summary>${t('查看将导入的内容')}</summary><ul class="import-item-list">${layout.items.map(item=>`<li><strong>${e(item.title)}</strong><small>${e(item.type==='link'?item.url:item.type==='widget'?item.widget+' · '+item.size:t('文件夹'))}</small></li>`).join('')}</ul></details><label class="field"><span>${t('导入方式')}</span><select name="mode"><option value="new">${t('创建新分组')}</option><option value="merge">${t('合并到现有分组')}</option></select></label><label class="field"><span>${t('目标分组')}</span><select name="targetGroupId">${state.groups.map(group=>`<option value="${e(group.id)}"${group.id===state.activeGroupId?' selected':''}>${e(group.name)}</option>`).join('')}</select></label><label><input type="checkbox" name="skipDuplicates" checked>${t('跳过相同网址')}</label>${layout.appearance?`<label><input type="checkbox" name="appearance">${t('应用分享中的外观')}</label>`:''}<p>${t('不会覆盖现有内容；联网组件需重新启用。')}</p><button class="primary-button">${t('确认导入')}</button></form>`;
    report(t('预览已就绪，请选择要导入的内容。'));
  };
  root.addEventListener('submit',async event=>{
    const form=event.target;event.preventDefault();event.stopPropagation();if(loading)return;
    const data=new FormData(form),button=form.querySelector('button');loading=true;button.disabled=true;
    try {
      if(form.hasAttribute('data-layout-load')){
        const url=await requestPublicOrigin(sourceFromShareLink(data.get('url')));
        report(t('正在读取…'));preview(await fetchPublicJson(url,{signal:events.signal,maxBytes:LAYOUT_MAX_BYTES}));
      } else if(form.hasAttribute('data-layout-export')){
        const value=createLayout(host.getState(),{title:data.get('title').trim(),groupIds:data.getAll('groups'),appearance:data.has('appearance')});
        const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
        const anchor=document.createElement('a');anchor.href=url;anchor.download='qiye-layout.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);report(t('分享文件已生成。'));
      } else if(form.hasAttribute('data-layout-link')){
        const input=form.querySelector('[data-share-link]');input.value=layoutShareLink(data.get('url'));input.hidden=false;input.focus();input.select();report(t('链接已生成，可复制给其他人。'));
      } else if(form.hasAttribute('data-layout-apply')){
        const before=structuredClone(host.getState()),plan=layoutImportPlan(before,layout,{groupIds:data.getAll('groups'),mode:data.get('mode'),targetGroupId:data.get('targetGroupId'),skipDuplicates:data.has('skipDuplicates'),appearance:data.has('appearance')});
        await host.apply(plan.state,JSON.stringify(before));undo={before,expected:JSON.stringify(host.getState())};
        root.querySelector('[data-layout-undo]').hidden=false;report(t('已导入 {added} 项，跳过 {skipped} 个重复网址。',{added:plan.added,skipped:plan.skipped}));
      }
    } catch(error){report(error.message);}finally{loading=false;if(button.isConnected)button.disabled=false;}
  },options);
  root.querySelector('[data-layout-file]').addEventListener('change',async event=>{
    if(loading)return;const file=event.target.files[0];if(!file)return;loading=true;
    try{if(file.size>LAYOUT_MAX_BYTES)throw new Error(t('文件超过大小限制。'));const text=await file.text();if(root.isConnected)preview(text);}catch(error){report(error.message);}finally{loading=false;event.target.value='';}
  },options);
  root.querySelector('[data-layout-undo]').addEventListener('click',async()=>{
    if(!undo||loading)return;loading=true;
    try{await host.apply(undo.before,undo.expected);undo=null;root.querySelector('[data-layout-undo]').hidden=true;report(t('已撤销本次导入。'));}catch(error){report(error.message);}finally{loading=false;}
  },options);
  return ()=>events.abort();
}
