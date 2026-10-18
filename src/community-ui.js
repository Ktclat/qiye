// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { validateCommunitySource } from './community-format.js';
import { publicHttpsUrl, requestPublicOrigin, fetchPublicJson } from './public-json.js';
import { uid } from './core.js';
import { sizeLabel } from './widget-sizes.js';
import { readWidgetSources, saveWidgetSources, OFFICIAL_WIDGET_SOURCE } from './widget-sources.js';

export const DEFAULT_COMMUNITY_SOURCE = OFFICIAL_WIDGET_SOURCE;
export function communityView({catalogOnly=false}={}) {
 return `<div class="community-view" data-source-view="${catalogOnly?'catalog':'settings'}">${catalogOnly?`<p>${t('从已启用的来源添加组件。')} <button data-action="widget-sources">${t('管理小组件源')}</button></p>`:`<p>${t('主程序不附带小组件。启用来源后读取目录，再选择需要的组件。停用会停止运行并保留数据。')}</p><div data-community-sources></div><form data-community-source><label class="field"><span>${t('组件来源地址')}</span><input name="url" type="url" placeholder="https://example.com/index.json" required maxlength="2048"></label><button class="primary-button">${t('添加并启用')}</button></form>`}<div class="catalog-toolbar"><input type="search" data-community-query placeholder="${t('搜索名称或用途')}" aria-label="${t('搜索社区组件')}"><label>${t('添加到')}<select data-community-group></select></label></div><div data-community-cards class="community-cards"></div><p data-community-status role="status"></p><a href="https://github.com/Ktclat/qiye-widgets" target="_blank" rel="noopener noreferrer">${t('小组件源码与发布')}</a></div>`;
}

export function bindCommunity(root,host) {
 const events=new AbortController(),options={signal:events.signal};let sources=[],busy=false;
 const status=root.querySelector('[data-community-status]'),cards=root.querySelector('[data-community-cards]'),group=root.querySelector('[data-community-group]');
 const report=message=>{if(root.isConnected)status.textContent=message;};
 try{sources=readWidgetSources();}catch(error){report(error.message);}
 group.innerHTML=host.getState().groups.map(g=>`<option value="${e(g.id)}"${g.id===host.getState().activeGroupId?' selected':''}>${e(g.name)}</option>`).join('');
 const entries=()=>sources.filter(source=>source.enabled).flatMap(source=>(source.catalog?.widgets||[]).map(manifest=>({manifest,source})));
 const persist=next=>{saveWidgetSources(next);sources=next;};
 const render=()=>{
  const panel=root.querySelector('[data-community-sources]');
  if(panel)panel.innerHTML=sources.map((source,index)=>`<article class="widget-source"><span><strong>${e(source.url===OFFICIAL_WIDGET_SOURCE?t('栖页官方小组件'):source.catalog?.name||t('组件来源'))}</strong><small>${e(source.url)}</small><small>${t(source.enabled?'已启用':'未启用')}${source.catalog?' · '+source.catalog.widgets.length:''}</small></span><button type="button" role="switch" aria-checked="${source.enabled}" data-source-toggle="${index}">${t(source.enabled?'停用':'启用')}</button><button type="button" data-source-refresh="${index}" ${!source.enabled?'disabled':''}>${t('检查更新')}</button>${source.url===OFFICIAL_WIDGET_SOURCE?'':`<button type="button" data-source-remove="${index}">${t('移除')}</button>`}</article>`).join('');
  const query=root.querySelector('[data-community-query]').value.trim().toLocaleLowerCase();
  cards.innerHTML=entries().map(({manifest:m,source},index)=>{
   if(!(m.id+' '+m.name+' '+t(m.name)+' '+m.description+' '+t(m.description)+' '+m.author).toLocaleLowerCase().includes(query))return '';
   const changed=host.getState().items.some(i=>i.widget==='community'&&i.config.source===source.url&&i.config.manifest.id===m.id&&JSON.stringify(i.config.manifest)!==JSON.stringify(m));
   return `<article class="community-card" data-community-card="${index}"><h4>${e(t(m.name))}</h4><p>${e(t(m.description))}</p><label>${t('卡片尺寸')}<select data-community-size>${m.sizes.map(size=>`<option value="${size}"${size==='2x2'?' selected':''}>${sizeLabel(size)}</option>`).join('')}</select></label><small>${e(m.author)} · ${e(m.release)}</small><details><summary>${t('来源与权限')}</summary><p>${e(new URL(m.entry).origin)}</p><p>${t('独立网页，可联网，仅能保存自己的数据。')}</p><p>${e((m.capabilities||[]).join(', '))}</p><a href="${e(m.repository)}" target="_blank" rel="noopener noreferrer">${t('查看源码')}</a></details><footer><button data-community-add>${t('添加')}</button>${changed?`<button data-community-update>${t('更新已添加的组件')}</button>`:''}</footer></article>`;
  }).join('')||`<p>${t(sources.some(s=>s.enabled)?'没有找到匹配的内容':'尚未启用小组件源。请在设置中启用官方源或添加自己的源。')}</p>`;
 };
 const load=async url=>{
  if(busy)return;busy=true;report(t('正在读取…'));
  try{
   // GitHub Pages serves this public catalogue with CORS; it needs no privileged host access.
   const checked=publicHttpsUrl(url),value=checked.startsWith('https://ktclat.github.io/qiye-widgets/')?checked:await requestPublicOrigin(checked);
   const catalog=validateCommunitySource(await fetchPublicJson(value,{signal:events.signal,maxBytes:512*1024}));
   if(events.signal.aborted)return;
   if(!sources.some(s=>s.url===value)&&sources.filter(s=>s.url!==OFFICIAL_WIDGET_SOURCE).length>=20)throw new Error(t('最多订阅 20 个来源。'));
   persist([...sources.filter(s=>s.url!==value),{url:value,enabled:true,catalog}]);render();report(t('来源已更新，已安装的组件需手动更新。'));
  }catch(error){if(!events.signal.aborted)report(error.message);}finally{busy=false;}
 };
 root.addEventListener('submit',event=>{if(!event.target.matches('[data-community-source]'))return;event.preventDefault();event.stopPropagation();void load(new FormData(event.target).get('url'));},options);
 root.addEventListener('input',event=>{if(event.target.hasAttribute('data-community-query'))render();},options);
 root.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  try{
   if(button.hasAttribute('data-source-toggle')){const source=sources[Number(button.dataset.sourceToggle)];if(source.enabled){persist(sources.map(s=>s===source?{...s,enabled:false}:s));render();}else await load(source.url);return;}
   if(button.hasAttribute('data-source-refresh')){await load(sources[Number(button.dataset.sourceRefresh)].url);return;}
   if(button.hasAttribute('data-source-remove')){persist(sources.filter((_,index)=>index!==Number(button.dataset.sourceRemove)));render();return;}
   if(!button.hasAttribute('data-community-add')&&!button.hasAttribute('data-community-update'))return;
   const card=button.closest('[data-community-card]'),entry=entries()[Number(card.dataset.communityCard)],manifest=entry.manifest,source=entry.source.url;
   const before=host.getState(),next=structuredClone(before);busy=true;button.disabled=true;
   if(button.hasAttribute('data-community-add'))next.items.push({id:uid(),groupId:group.value,type:'widget',widget:'community',title:t(manifest.name).slice(0,120),size:card.querySelector('[data-community-size]').value,config:{manifest,source},data:{value:'null'}});
   else for(const item of next.items.filter(i=>i.widget==='community'&&i.config.source===source&&i.config.manifest.id===manifest.id)){item.config={manifest,source};if(!manifest.sizes.includes(item.size))item.size='2x2';}
   await host.apply(next,JSON.stringify(before));if(root.isConnected){render();report(t('组件已添加到桌面。'));}
  }catch(error){report(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
 },options);
 render();return ()=>events.abort();
}
