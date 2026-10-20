// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';

const MEDIA_TYPE=/^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm))$/;
const MAX_FILE_BYTES=4*1024*1024,MAX_LIBRARY_BYTES=100*1024*1024,MAX_ENTRIES=50;

export function localWallpaperBlob(dataUrl) {
 const match=typeof dataUrl==='string'&&/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
 if(!match||!MEDIA_TYPE.test(match[1])||!match[2].length||match[2].length%4||match[2].length>Math.ceil(MAX_FILE_BYTES/3)*4)throw new Error(t('本地壁纸数据无效'));
 const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
 if(bytes.length>MAX_FILE_BYTES)throw new Error(t('壁纸不能超过 4 MiB'));
 return new Blob([bytes],{type:match[1]});
}

export async function localWallpaperId(blob) {
 if(!(blob instanceof Blob)||!MEDIA_TYPE.test(blob.type)||!blob.size||blob.size>MAX_FILE_BYTES)throw new Error(t('本地壁纸数据无效'));
 const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Uploaded originals stay outside the bounded desktop backup. Only the active
 * wallpaper remains in desktop settings and follows the existing sync rules. */
export function createLocalWallpaperStore({indexedDB=globalThis.indexedDB,name='qiye.wallpapers.v1'}={}) {
 let database=null;
 function open(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
   if(!indexedDB){reject(new Error(t('无法打开本机壁纸库，请检查浏览器存储设置。')));return;}
   const request=indexedDB.open(name,1);let failed=false;
   request.onupgradeneeded=()=>{request.result.createObjectStore('wallpapers',{keyPath:'id'});};
   request.onerror=()=>reject(new Error(t('无法打开本机壁纸库，请检查浏览器存储设置。')));
   request.onblocked=()=>{failed=true;reject(new Error(t('壁纸库正在其他标签页中使用，请关闭旧页面后重试。')));};
   request.onsuccess=()=>{const db=request.result;if(failed){db.close();return;}db.onversionchange=()=>{db.close();database=null;};resolve(db);};
  }).catch(error=>{database=null;throw error;});
  return database;
 }
 async function transaction(mode,run){
  const db=await open();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('wallpapers',mode),store=tx.objectStore('wallpapers');let result,error;
   const fail=value=>{error=value;tx.abort();};
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(error||new Error(t('壁纸库保存失败，请检查可用存储空间后重试。')));
   tx.onerror=()=>{}; // Abort reports the transaction, not an early request success.
   try{run(store,value=>{result=value;},fail);}catch(e){fail(e);}
  });
 }
 async function put(blob,name){
  const id=await localWallpaperId(blob),type=blob.type.startsWith('video/')?'video':'image';
  return transaction('readwrite',(store,done,fail)=>{
   const read=store.getAll();
   read.onsuccess=()=>{
    const rows=read.result,existing=rows.find(row=>row.id===id);
    if(existing){done(existing);return;}
    if(rows.length>=MAX_ENTRIES||rows.reduce((size,row)=>size+row.blob.size,0)+blob.size>MAX_LIBRARY_BYTES){fail(new Error(t('本机壁纸库最多保存 50 项或 100 MiB，请删除不需要的壁纸后重试。')));return;}
    const row={id,name:String(name||t('自定义背景')).slice(0,180),type,blob,createdAt:Date.now()};
    store.add(row);done(row);
   };
  });
 }
 async function list(){return transaction('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done(request.result.sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id)));});}
 async function remove(id){return transaction('readwrite',store=>store.delete(id));}
 async function remember(dataUrl,type){return dataUrl?put(localWallpaperBlob(dataUrl),t(type==='video'?'已保存的视频背景':'已保存的自定义背景')):null;}
 return {put,list,remove,remember};
}
