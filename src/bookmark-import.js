// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { escapeText as e } from './html.js';
import { icon } from './icons.js';
import { permissionControl } from './permissions.js';

export function bookmarkImportView(bookmarks,groups,groupId) {
 return `<header class="bookmark-import-header"><span>${icon('bookmark')}</span><h2 id="dialog-title" tabindex="-1">${t('导入浏览器书签')}</h2><small>${bookmarks.length}</small><button type="button" class="icon-button" data-close aria-label="${t('关闭')}">${icon('close')}</button></header>
 <form id="bookmarks-form" class="bookmark-import-form">
 <div class="bookmark-import-toolbar"><label class="capsule-search">${icon('search')}<input type="search" data-bookmark-query placeholder="${t('搜索标题或网址')}" aria-label="${t('搜索标题或网址')}"></label><label class="bookmark-select-filter"><input type="checkbox" data-bookmark-select-all><span>${t('选择筛选结果')}</span></label></div>
 <div class="bookmark-import-browser"><nav data-bookmark-folders aria-label="${t('书签文件夹')}"></nav><section class="bookmark-import-results" aria-label="${t('可导入的网站')}"><div data-bookmark-results></div><button type="button" class="text-button" data-bookmark-more hidden>${t('显示更多')}</button></section></div>
 <footer class="bookmark-import-footer"><label class="bookmark-destination"><span>${t('导入到')}</span><select name="groupId" aria-label="${t('导入到分组')}">${groups.map(group=>`<option value="${e(group.id)}"${group.id===groupId?' selected':''}>${e(group.name)}</option>`).join('')}</select></label><output data-bookmark-count aria-live="polite"></output><div data-bookmark-selected hidden></div><button type="submit" class="primary-button" disabled>${icon('check')}${t('导入所选网站')}</button></footer>
 <div class="bookmark-import-note"><span>${t('复制所选网站；原书签保留，目标分组内重复网址自动跳过。')}</span>${permissionControl({permissions:['bookmarks']})}</div></form>`;
}
export function bindBookmarkImport(root,bookmarks,getState) {
 const controller=new AbortController(),selected=new Set(),options={signal:controller.signal};
 let folder='',query='',limit=100,filtered=[];
 const folders=[...new Set(bookmarks.map(item=>item.folder||t('未分类')))];
 const folderBar=root.querySelector('[data-bookmark-folders]'),results=root.querySelector('[data-bookmark-results]');
 const group=root.querySelector('[name=groupId]'),selectAll=root.querySelector('[data-bookmark-select-all]');
 const exists=()=>new Set(getState().items.filter(item=>item.groupId===group.value&&item.url).map(item=>item.url));
 const updateSelection=()=>{
  const duplicates=exists();for(const index of selected)if(duplicates.has(bookmarks[index].url))selected.delete(index);
  root.querySelector('[data-bookmark-selected]').innerHTML=[...selected].map(i=>`<input type="hidden" name="bookmark" value="${i}">`).join('');
  root.querySelector('[data-bookmark-count]').textContent=t('已选 {count} 个',{count:selected.size});
  root.querySelector('[type=submit]').disabled=!selected.size;
  const eligible=filtered.filter(i=>!duplicates.has(bookmarks[i].url)),count=eligible.filter(i=>selected.has(i)).length;
  selectAll.checked=!!eligible.length&&count===eligible.length;selectAll.indeterminate=count>0&&count<eligible.length;selectAll.disabled=!eligible.length;
 };
 const render=()=>{
  const duplicates=exists();
  filtered=bookmarks.flatMap((item,i)=>((!folder||(item.folder||t('未分类'))===folder)&&`${item.title} ${item.url}`.toLocaleLowerCase().includes(query))?[i]:[]);
  folderBar.innerHTML=[['',t('全部书签')],...folders.map(name=>[name,name])].map(([value,name])=>`<button type="button" data-bookmark-folder="${e(value)}" aria-pressed="${folder===value}" title="${e(name)}">${icon(value?'folder':'bookmark')}<span>${e(name)}</span><small>${value?bookmarks.filter(b=>(b.folder||t('未分类'))===value).length:bookmarks.length}</small></button>`).join('');
  results.innerHTML=filtered.slice(0,limit).map(i=>{const item=bookmarks[i],host=new URL(item.url).hostname,duplicate=duplicates.has(item.url);
   return `<label class="bookmark-import-row ${duplicate?'is-duplicate':''}"><input type="checkbox" data-bookmark-index="${i}" ${selected.has(i)?'checked':''} ${duplicate?'disabled':''}><span class="bookmark-host-mark" aria-hidden="true">${e(host.replace(/^www\./,'').slice(0,1).toUpperCase())}</span><span class="bookmark-import-copy"><strong title="${e(item.title)}">${e(item.title)}</strong><small title="${e(item.url)}">${e(item.url)}</small></span>${duplicate?`<small class="bookmark-duplicate">${t('已在分组中')}</small>`:''}</label>`;
  }).join('')||`<p class="local-empty">${t('没有找到匹配的网站。')}</p>`;
  root.querySelector('[data-bookmark-more]').hidden=filtered.length<=limit;updateSelection();
 };
 root.addEventListener('input',event=>{if(event.target.hasAttribute('data-bookmark-query')){query=event.target.value.trim().toLocaleLowerCase();limit=100;render();}},options);
 root.addEventListener('change',event=>{
  const input=event.target;
  if(input===group){render();return;}
  if(input.hasAttribute('data-bookmark-index')){const i=Number(input.dataset.bookmarkIndex);input.checked?selected.add(i):selected.delete(i);updateSelection();}
  if(input===selectAll){const duplicates=exists();for(const i of filtered)if(!duplicates.has(bookmarks[i].url))input.checked?selected.add(i):selected.delete(i);render();}
 },options);
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-bookmark-folder')){folder=button.dataset.bookmarkFolder;limit=100;render();root.querySelector(`[data-bookmark-folder="${CSS.escape(folder)}"]`)?.focus({preventScroll:true});}
  if(button.hasAttribute('data-bookmark-more')){limit+=100;render();}
 },options);
 render();return ()=>controller.abort();
}
