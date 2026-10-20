import test from 'node:test';
import assert from 'node:assert/strict';
import {localWallpaperBlob,localWallpaperId,createLocalWallpaperStore} from '../src/local-wallpapers.js';
import {createWallpaperLibrary} from '../src/wallpaper-library.js';

const PNG='data:image/png;base64,aGVsbG8=';
const click=(gallery,key,value='')=>gallery.handleClick({dataset:{[key]:value},hasAttribute:name=>name==='data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function gallery(local){return createWallpaperLibrary({local,getState:()=>({settings:{}}),wallpapers:[],renderCustom:()=>'<p>Upload</p>',renderParameters:()=>'',rerender(){},toast(){}});}

test('local media accepts only supported bounded data URLs and stable content ids',async()=>{
 const blob=localWallpaperBlob(PNG);assert.equal(blob.type,'image/png');assert.equal(await blob.text(),'hello');
 assert.equal(await localWallpaperId(blob),await localWallpaperId(localWallpaperBlob(PNG)));
 for(const value of ['https://example.com/image.png','data:image/svg+xml;base64,aGVsbG8=',PNG+'!', 'data:image/png;base64,'])assert.throws(()=>localWallpaperBlob(value));
 await assert.rejects(localWallpaperId(new Blob([new Uint8Array(4*1024*1024+1)],{type:'image/png'})));
});

test('unavailable archive storage reports a failure rather than claiming a save',async()=>{
 await assert.rejects(createLocalWallpaperStore({indexedDB:null}).put(localWallpaperBlob(PNG),'test.png'),/存储/);
});

test('uploaded previews leave selection untouched, apply is explicit, delete requires confirmation',async()=>{
 const row={id:'one',name:'<img onerror=alert(1)>.png',blob:localWallpaperBlob(PNG),type:'image'};let applied=0,removed=0;
 const view=gallery({load:async()=>({rows:[row],currentId:null}),apply:async()=>{applied++;},remove:async()=>{removed++;}});
 await click(view,'galleryTab','custom');assert.equal(view.getState().uploads.length,1);assert.match(view.render(),/&lt;img onerror=alert\(1\)&gt;/);
 await click(view,'galleryLocalPreview','one');assert.equal(applied,0);assert.equal(view.getState().preview.local,true);view.back();
 await click(view,'galleryLocalApply','one');assert.equal(applied,1);assert.equal(view.getState().currentLocalId,'one');
 await click(view,'galleryLocalRemove','one');assert.equal(removed,0);
 await click(view,'galleryLocalDelete','one');await click(view,'galleryLocalCancel');await click(view,'galleryLocalRemove','one');assert.equal(removed,0);
 await click(view,'galleryLocalDelete','one');await click(view,'galleryLocalRemove','one');assert.equal(removed,1);assert.equal(view.getState().uploads.length,0);view.close();
});

test('closing during a local load discards late rows; reopening re-reads storage',async()=>{
 const pending=deferred(),row={id:'one',name:'image.png',blob:localWallpaperBlob(PNG),type:'image'};
 const view=gallery({load:()=>pending.promise});
 const loading=click(view,'galleryTab','custom');view.close();pending.resolve({rows:[row],currentId:'one'});await loading;
 assert.equal(view.getState().uploads.length,0);await view.open();assert.equal(view.getState().uploads.length,1);
 const url=view.getState().uploads[0].url;assert.equal((await fetch(url)).status,200);view.close();await assert.rejects(fetch(url));
});

test('cancelled or failed application retains the selected local wallpaper',async()=>{
 const row={id:'one',name:'image.png',blob:localWallpaperBlob(PNG),type:'image'};
 const view=gallery({load:async()=>({rows:[row],currentId:null}),apply:async()=>false});
 await click(view,'galleryTab','custom');await click(view,'galleryLocalApply','one');assert.equal(view.getState().currentLocalId,null);view.close();
});

test('an archive error still exposes saved uploads for removal and retry',async()=>{
 const row={id:'one',name:'image.png',blob:localWallpaperBlob(PNG),type:'image'};let removed=false;
 const view=gallery({load:async()=>({rows:[row],currentId:null,error:'Storage is full'}),remove:async()=>{removed=true;}});
 await click(view,'galleryTab','custom');assert.match(view.render(),/Storage is full/);assert.match(view.render(),/data-gallery-local-delete/);
 await click(view,'galleryLocalDelete','one');await click(view,'galleryLocalRemove','one');assert.equal(removed,true);assert.equal(view.getState().uploads.length,0);view.close();
});
