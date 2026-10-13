import test from 'node:test';
import assert from 'node:assert/strict';
import {createWallpaperLibrary, WALLPAPER_SOURCES} from '../src/wallpaper-library.js';
import {normalizeWallpaperPhoto, normalizeCommonsPhoto, parseCommonsResponse, fetchCommonsWallpaperPage, resolveCommonsWallpaper} from '../src/wallpapers.js';
import {DEFAULT_STATE,validateImport,exportState} from '../src/core.js';
const raw=()=>({query:{pages:[{title:'File:Landscape.jpg',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Landscape.jpg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Landscape.jpg/640px-Landscape.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:Landscape.jpg',width:2560,height:1440,mime:'image/jpeg',extmetadata:{Artist:{value:'<a>Photographer</a>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}}]}]}});
const pic=()=>normalizeWallpaperPhoto({provider:'picsum',id:'10',author:'Test',sourceUrl:'https://unsplash.com/photos/abc',width:2500,height:1600});
const photo=()=>parseCommonsResponse(raw()).photos[0];
const button=(key,value='')=>({dataset:{[key]:value},hasAttribute:name=>name==='data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(options={}){
 const data={settings:{wallpaperApiEnabled:false}},requests=[],applied=[],errors=[];
 const gallery=createWallpaperLibrary({getState:()=>data,wallpapers:[],renderCustom:()=>'<input>',renderParameters:()=>'<p>parameters</p>',rerender(){},enable:async()=>{data.settings.wallpaperApiEnabled=true;},apply:async v=>applied.push(v),toast:e=>errors.push(e),fetchers:{picsum:async o=>{requests.push(o);return [pic()];},commons:async o=>{requests.push(o);return [photo()];}},...options});
 return {data,requests,applied,errors,gallery,click:(k,v)=>gallery.handleClick(button(k,v))};
}
test('Commons metadata preserves explicit licensed author and correct file source',()=>{const p=photo();assert.equal(p.author,'Photographer');assert.equal(p.license,'CC BY-SA 4.0');assert.deepEqual(normalizeWallpaperPhoto(p),p);const s=structuredClone(DEFAULT_STATE);s.settings.remoteWallpaper=p;assert.deepEqual(validateImport(exportState(s)).settings.remoteWallpaper,p);});
test('Commons rejects external/credential/SVG URLs, deceptive licenses and mismatched sources',()=>{
 for(const change of [{url:'https://evil.test/a.jpg'},{url:'https://user:pass@upload.wikimedia.org/wikipedia/commons/a.jpg'},{url:'https://upload.wikimedia.org/wikipedia/commons/a.svg'},{licenseUrl:'https://creativecommons.org.evil.test/licenses/by/4.0/'},{sourceUrl:'https://commons.wikimedia.org/wiki/File:Other.jpg'},{width:30001},{id:'../bad'}])assert.equal(normalizeCommonsPhoto({...photo(),...change}),null);
});
test('Commons filters unlicensed, portrait, small, or unsafe metadata instead of fabricating permission',()=>{
 for(const change of [{mime:'image/svg+xml'},{width:800},{height:2900},{extmetadata:{Artist:{value:'Anonymous'}}}]){const r=raw();Object.assign(r.query.pages[0].imageinfo[0],change);assert.deepEqual(parseCommonsResponse(r).photos,[]);}
});
test('Commons uses documented, bounded requests without credentials',async()=>{
 let request;const photos=await fetchCommonsWallpaperPage({page:2,fetchImpl:async(url,o)=>{request={url:new URL(url),o};return {ok:true,text:async()=>JSON.stringify(raw())};}});
 assert.equal(request.url.searchParams.get('iiurlwidth'),'640');assert.equal(request.url.searchParams.get('gsroffset'),'18');assert.equal(request.o.credentials,'omit');assert.equal(request.o.headers.Authorization,undefined);assert.equal(photos.length,1);
 await assert.rejects(fetchCommonsWallpaperPage({page:0}),/页码/);
});
test('Commons uses actual returned HD thumbnail URL rather than constructing one',async()=>{
 const r=raw();r.query.pages[0].imageinfo[0].thumburl='https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Landscape.jpg/2048px-Landscape.jpg';
 const p=await resolveCommonsWallpaper(photo(),{fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify(r)})});assert.match(p.url,/2048px/);assert.match(p.thumbnail,/640px/);
});
test('Commons reports transport/API/oversize errors',async()=>{
 await assert.rejects(fetchCommonsWallpaperPage({fetchImpl:async()=>({ok:false,status:429})}),/429/);
 await assert.rejects(fetchCommonsWallpaperPage({fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({error:{code:'bad'}})})}),/失败/);
 await assert.rejects(fetchCommonsWallpaperPage({fetchImpl:async()=>({ok:true,headers:new Headers({'Content-Length':3e6}),text:async()=>''})}),/过大/);
});
test('gallery construction/rendering/disabled source selection do not fetch',async()=>{const h=harness();h.gallery.render();await h.click('galleryTab','picsum');assert.equal(h.requests.length,0);assert.match(h.gallery.render(),/启用并加载/);});
test('gallery waits for successful consent persistence',async()=>{const wait=deferred();const h=harness({enable:async()=>{await wait.promise;h.data.settings.wallpaperApiEnabled=true;}});await h.click('galleryTab','picsum');const p=h.click('galleryEnable');assert.equal(h.requests.length,0);wait.resolve();await p;assert.equal(h.requests.length,1);});
test('failed consent makes no request',async()=>{const h=harness({enable:async()=>{throw Error('storage full');}});await h.click('galleryTab','picsum');await assert.rejects(h.click('galleryEnable'),/storage full/);assert.equal(h.requests.length,0);});
test('source changes cancel in-flight loads and ignore late results',async()=>{const d=deferred();let sig;const h=harness({fetchers:{picsum:({signal})=>{sig=signal;return d.promise;}}});h.data.settings.wallpaperApiEnabled=true;const p=h.click('galleryTab','picsum');await h.click('galleryTab','official');assert.equal(sig.aborted,true);d.resolve([pic()]);await p;assert.equal(h.gallery.getState().tab,'official');assert.deepEqual(h.gallery.getState().photos,[]);});
test('gallery cache is per source/page; changing page resets content',async()=>{const h=harness();h.data.settings.wallpaperApiEnabled=true;await h.click('galleryTab','picsum');await h.click('galleryPage','1');assert.equal(h.requests.length,2);await h.click('galleryPage','-1');assert.equal(h.requests.length,2);await h.click('galleryTab','commons');assert.equal(h.requests.length,3);});
test('only direct wallpaper sources remain; source labels and external-only entries are absent',async()=>{
 const h=harness();assert.deepEqual(WALLPAPER_SOURCES.filter(s=>s.endpoint).map(s=>s.id),['deepin','wallhaven','picsum','commons']);
 assert.doesNotMatch(h.gallery.render(),/data-gallery-tab="(?:unsplash|pexels)"|更多灵感|<small>在线图库/);
 const before=h.gallery.getState().tab;await h.click('galleryTab','unsplash');assert.equal(h.gallery.getState().tab,before);
});
test('apply guards against a late result after dialog close',async()=>{const d=deferred();let guard;const h=harness({apply:async(v,o)=>{guard=o.isCurrent;await d.promise;}});h.data.settings.wallpaperApiEnabled=true;await h.click('galleryTab','picsum');const p=h.click('galleryApply','0');assert.equal(guard(),true);h.gallery.close();assert.equal(guard(),false);d.resolve();await p;assert.equal(h.gallery.getState().applying,false);});
test('load error is actionable and retry does not silently change wallpaper',async()=>{let fail=true;const h=harness({fetchers:{picsum:async()=>{if(fail)throw Error('unavailable');return [pic()];}}});h.data.settings.wallpaperApiEnabled=true;await h.click('galleryTab','picsum');assert.match(h.gallery.render(),/重新加载/);assert.deepEqual(h.applied,[]);fail=false;await h.click('galleryRetry');await h.click('galleryApply','0');assert.equal(h.applied.length,1);});
test('scrollbar and wheel preferences require explicit valid values', () => {
  for (const key of ['sidebarWheelMode', 'hideScrollbar']) {
    const state = structuredClone(DEFAULT_STATE);
    delete state.settings[key];
    assert.throws(() => validateImport(state));
  }
  for (const invalid of [{ sidebarWheelMode: 'execute' }, { hideScrollbar: 'true' }]) {
    const state = structuredClone(DEFAULT_STATE);
    Object.assign(state.settings, invalid);
    assert.throws(() => validateImport(state));
  }
});

test('direct snapshots validate original URLs, preserve licenses, and reject forged origins',async()=>{
 const {fetchCatalogWallpaperPage}=await import('../src/wallpapers.js');
 for(const provider of ['deepin','wallhaven']){const rows=await fetchCatalogWallpaperPage(provider);assert.ok(rows.length);for(const row of rows){assert.deepEqual(normalizeWallpaperPhoto(row),row);assert.equal(normalizeWallpaperPhoto({...row,url:'https://evil.example/a.jpg'}),null);assert.equal(normalizeWallpaperPhoto({...row,sourceUrl:'https://evil.example/'}),null);}const s=structuredClone(DEFAULT_STATE);s.settings.remoteWallpaper=rows[0];assert.deepEqual(validateImport(exportState(s)).settings.remoteWallpaper,rows[0]);}
});
