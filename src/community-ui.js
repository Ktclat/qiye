// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { validateCommunitySource } from './community-format.js';
import { publicHttpsUrl, requestPublicOrigin, fetchPublicJson } from './public-json.js';
import { uid } from './core.js';
import { sizeLabel } from './widget-sizes.js';

const KEY='qiye.community.v1';
export const DEFAULT_COMMUNITY_SOURCE='https://ktclat.github.io/qiye/community/index.json';
function readSources() {
  const raw=JSON.parse(localStorage.getItem(KEY)||'[]');
  if(!Array.isArray(raw)||raw.length>20)throw new Error(t('来源列表无效。'));
  return raw.map(source=>({url:publicHttpsUrl(source.url),catalog:source.catalog?validateCommunitySource(source.catalog):null}));
}
export function communityView() {
  return `<div class="community-view"><h3>${t('社区小组件')}</h3><p>${t('作者托管组件网页，你可以订阅公开索引或单个组件清单。打开此页会加载作者预览，点击运行才会加载组件网页。')}</p><form data-community-source><label class="field"><span>${t('组件来源地址')}</span><input name="url" type="url" value="${DEFAULT_COMMUNITY_SOURCE}" required maxlength="2048"></label><button class="primary-button">${t('读取并订阅')}</button></form><div class="community-sources" data-community-sources></div><div class="catalog-toolbar"><input type="search" data-community-query placeholder="${t('搜索名称或用途')}" aria-label="${t('搜索社区组件')}"><label>${t('添加到')}<select data-community-group></select></label></div><div data-community-cards class="community-cards"></div><p data-community-status role="status"></p><a href="https://github.com/Ktclat/qiye/blob/main/docs/COMMUNITY.md" target="_blank" rel="noopener noreferrer">${t('发布你的小组件')}</a></div>`;
}

export function bindCommunity(root,host) {
  const events=new AbortController(),options={signal:events.signal},selectedSizes=new Map();let sources=[],busy=false;
  const status=root.querySelector('[data-community-status]'),cards=root.querySelector('[data-community-cards]'),group=root.querySelector('[data-community-group]');
  const report=message=>{if(root.isConnected)status.textContent=message;};
  try{sources=readSources();}catch(error){report(error.message);}
  group.innerHTML=host.getState().groups.map(g=>`<option value="${e(g.id)}"${g.id===host.getState().activeGroupId?' selected':''}>${e(g.name)}</option>`).join('');
  const persist=next=>{localStorage.setItem(KEY,JSON.stringify(next));sources=next;};
  const entries=()=>sources.flatMap((source,sourceIndex)=>(source.catalog?.widgets||[]).map(manifest=>({manifest,sourceIndex})));
  const render=()=>{
    root.querySelector('[data-community-sources]').innerHTML=sources.map((source,index)=>`<article><span><strong>${e(source.catalog?.name||t('未读取'))}</strong><small>${e(source.url)}</small></span><button type="button" data-source-refresh="${index}">${t('刷新')}</button><button type="button" data-source-remove="${index}">${t('移除')}</button></article>`).join('');
    const query=root.querySelector('[data-community-query]').value.trim().toLocaleLowerCase();
    cards.innerHTML=entries().map(({manifest:m,sourceIndex},index)=>{
      if(!(m.name+' '+m.description+' '+m.author).toLocaleLowerCase().includes(query))return '';
      const changed=host.getState().items.some(i=>i.widget==='community'&&i.config.source===sources[sourceIndex].url&&i.config.manifest.id===m.id&&JSON.stringify(i.config.manifest)!==JSON.stringify(m));
      const previous=selectedSizes.get(sources[sourceIndex].url+'|'+m.id),selected=m.sizes.includes(previous)?previous:'2x2';
      return `<article class="community-card" data-community-card="${index}"><h4>${e(m.name)}</h4><p>${e(m.description)}</p><div class="community-preview"><span>◈</span></div><label>${t('预览尺寸')}<select data-community-size>${m.sizes.map(size=>`<option value="${size}"${size===selected?' selected':''}>${sizeLabel(size)}</option>`).join('')}</select></label><p>${e(m.author)} · ${e(m.release)}</p><details><summary>${t('来源与权限')}</summary><p>${e(new URL(m.entry).origin)}</p><p>${e(m.license)} · ${e(sources[sourceIndex].catalog.name)}</p><p>${t('独立网页，可联网，仅能保存自己的数据。')}</p><a href="${e(m.repository)}" target="_blank" rel="noopener noreferrer">${t('查看源码')}</a></details><footer><button class="catalog-add" data-community-add>${t('添加')}</button>${changed?`<button class="secondary-button" data-community-update>${t('更新已添加的组件')}</button>`:''}</footer></article>`;
    }).join('')||`<p>${t('还没有匹配的组件，请读取一个来源。')}</p>`;
    for(const card of cards.querySelectorAll('[data-community-card]'))updatePreview(card);
  };
  const updatePreview=card=>{
    const entry=entries()[Number(card.dataset.communityCard)],m=entry?.manifest;if(!m)return;
    const size=card.querySelector('[data-community-size]').value,p=m.previews.find(p=>p.size===size),panel=card.querySelector('.community-preview');
    selectedSizes.set(sources[entry.sourceIndex].url+'|'+m.id,size);
    const [w,h]=size.split('x').map(Number);panel.style.setProperty('--community-ratio',w+'/'+h);panel.innerHTML=p?`<img src="${e(p.url)}" alt="${e(m.name+' '+sizeLabel(size))}" loading="lazy" referrerpolicy="no-referrer">`:`<span>◈</span><small>${sizeLabel(size)} · ${t('作者未提供预览')}</small>`;
  };
  const load=async url=>{
    if(busy)return;busy=true;report(t('正在读取…'));
    try{
      const value=await requestPublicOrigin(url),catalog=validateCommunitySource(await fetchPublicJson(value,{signal:events.signal,maxBytes:512*1024}));
      if(!root.isConnected)return;
      if(!sources.some(s=>s.url===value)&&sources.length>=20)throw new Error(t('最多订阅 20 个来源。'));
      persist([...sources.filter(s=>s.url!==value),{url:value,catalog}]);render();report(t('来源已更新，已安装的组件需手动更新。'));
    }catch(error){report(error.message);}finally{busy=false;}
  };
  root.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();void load(new FormData(event.target).get('url'));},options);
  root.addEventListener('input',event=>{if(event.target.hasAttribute('data-community-query'))render();},options);
  root.addEventListener('change',event=>{if(event.target.hasAttribute('data-community-size'))updatePreview(event.target.closest('[data-community-card]'));},options);
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-source-refresh')){void load(sources[Number(button.dataset.sourceRefresh)].url);return;}
    if(button.hasAttribute('data-source-remove')){try{persist(sources.filter((_,index)=>index!==Number(button.dataset.sourceRemove)));render();}catch(error){report(error.message);}return;}
    if(!button.hasAttribute('data-community-add')&&!button.hasAttribute('data-community-update'))return;
    const card=button.closest('[data-community-card]'),entry=entries()[Number(card.dataset.communityCard)],manifest=entry.manifest,source=sources[entry.sourceIndex].url;
    const before=host.getState(),next=structuredClone(before);busy=true;button.disabled=true;
    try{
      if(button.hasAttribute('data-community-add'))next.items.push({id:uid(),groupId:group.value,type:'widget',widget:'community',title:manifest.name.slice(0,30),size:card.querySelector('[data-community-size]').value,config:{manifest,source},data:{value:'null'}});
      else for(const item of next.items.filter(i=>i.widget==='community'&&i.config.source===source&&i.config.manifest.id===manifest.id)){item.config={manifest,source};if(!manifest.sizes.includes(item.size))item.size='2x2';}
      await host.apply(next,JSON.stringify(before));if(root.isConnected){render();report(t('组件已保存到桌面，打开后点击运行。'));}
    }catch(error){report(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
  },options);
  render();return ()=>events.abort();
}
