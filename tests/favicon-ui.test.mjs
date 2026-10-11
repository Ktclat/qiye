import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { safeUrl } from '../src/core.js';
import { icon, iconNames } from '../src/icons.js';

const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');

// Execute production UI functions with controllable image/permission boundaries.
function extractFunction(name) {
 const match=new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(source);
 assert.ok(match,`missing production function ${name}`);
 for(let end=source.indexOf('}',match.index);end!==-1;end=source.indexOf('}',end+1)) {
  const candidate=source.slice(match.index,end+1);
  try {new vm.Script(`(${candidate})`);return candidate;} catch(error) {if(!(error instanceof SyntaxError))throw error;}
 }
 throw new Error(`Unable to extract ${name}`);
}
const declaration=prefix=>{
 const line=source.split('\n').find(value=>value.startsWith(prefix));
 assert.ok(line,`missing declaration ${prefix}`);return line;
};
const code=[
 declaration('const esc ='),declaration('const faviconBindings ='),declaration('let faviconRequestSequence ='),
 ...['tileInk','siteGlyph','bindFaviconImages','linkPreviewIdentity','updateLinkPreview','isLinkPreviewCurrent','extractLinkFavicon'].map(extractFunction),
 'globalThis.app={siteGlyph,bindFaviconImages,updateLinkPreview,extractLinkFavicon};'
].join('\n\n');
function deferred() {
 let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};
}
function harness(extra={}) {
 const remembered=[],timers=new Map(),dialog={open:true};let sequence=0;
 const context=vm.createContext({
  safeUrl,icon,iconNames,URL,Promise,Date,dialog,
  $:(selector,root)=>root.querySelector(selector),
  $$:(selector,root)=>[...root.querySelectorAll(selector)],
  getFaviconCandidates:()=>['https://example.com/favicon.ico'],
  rememberFavicon:(site,url)=>remembered.push({site,url}),
  discoverFavicon:async()=>({candidates:[]}),
  setTimeout:callback=>{timers.set(++sequence,callback);return sequence;},
  clearTimeout:id=>timers.delete(id),
  ...extra
 });
 new vm.Script(code,{filename:'favicon-ui-extracted-from-app.js'}).runInContext(context);
 return {app:context.app,remembered,timers,dialog};
}
function visual(site='https://example.com/page') {
 const requests=[],classes=new Set();
 const image={hidden:true,naturalWidth:32,onload:null,onerror:null,referrerPolicy:'',
  set src(value){requests.push(value);this.currentSource=value;},
  get src(){return this.currentSource;},
  removeAttribute(name){if(name==='src')this.currentSource=undefined;}
 };
 const element={isConnected:true,dataset:{faviconSite:site},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},
  querySelector:()=>image
 };
 return {element,image,requests,classes,root:{querySelectorAll:()=>[element]}};
}
function linkForm(url='https://example.com/') {
 const node=()=>({textContent:'',innerHTML:'',style:{setProperty(){}},querySelectorAll:()=>[]});
 const preview=node(),status=node(),title=node(),shownUrl=node();
 const form={isConnected:true,elements:{url:{value:url},iconMode:{value:'auto'},title:{value:'Example'},icon:{value:'例'},color:{value:'#4976df'}}};
 const button={disabled:false,textContent:'',closest:()=>form};
 const nodes={'#link-preview-icon':preview,'#link-preview-title':title,'#link-preview-url':shownUrl,'#favicon-status':status,'[data-action="extract-favicon"]':button};
 form.querySelector=selector=>nodes[selector];
 return {form,button,preview,status,title,shownUrl};
}

test('automatic icons use an inert image and escaped text; text mode and unsafe URLs make no image request',()=>{
 const {app}=harness();
 const markup=app.siteGlyph({url:'https://example.com/?q=%22',icon:'<svg>',title:'Example'});
 assert.match(markup,/data-favicon-site=/);
 assert.match(markup,/&lt;svg&gt;/);
 assert.match(markup,/<img [^>]*referrerpolicy="no-referrer"[^>]* hidden>/);
 assert.doesNotMatch(markup,/<img [^>]*\ssrc=/,'event handlers must be ready before any image request');
 assert.doesNotMatch(app.siteGlyph({url:'https://example.com',icon:'🌿',iconMode:'text'}),/<img/);
 assert.doesNotMatch(app.siteGlyph({url:'javascript:alert(1)',icon:'A'}),/<img/);
 assert.doesNotMatch(app.siteGlyph({url:'https://name:password@example.com',icon:'A'}),/<img/);
});

test('failed image candidates advance once, a successful image is cached, and repeated hydration is inert',()=>{
 const first='https://example.com/missing.ico',second='https://example.com/real.png';
 const h=harness({getFaviconCandidates:()=>[first,first,second]});
 const v=visual();h.app.bindFaviconImages(v.root);
 assert.deepEqual(v.requests,[first]);assert.equal(v.image.hidden,true);
 const staleLoad=v.image.onload;
 v.image.onerror();
 assert.deepEqual(v.requests,[first,second]);
 staleLoad();
 assert.equal(h.remembered.length,0,'a late event from the failed candidate cannot cache the current candidate');
 v.image.onload();
 assert.equal(v.image.hidden,false);assert.equal(v.classes.has('is-loaded'),true);
 assert.deepEqual(h.remembered,[{site:'https://example.com/page',url:second}]);
 h.app.bindFaviconImages(v.root);
 assert.deepEqual(v.requests,[first,second]);
 assert.equal(h.timers.size,0);
 const rerendered=visual();h.app.bindFaviconImages(rerendered.root);
 assert.deepEqual(rerendered.requests,[second],'known failed URL is skipped across a repeated desktop render');
 rerendered.image.onload();
});

test('exhaustion, timeouts, and stale events leave the text fallback visible without a broken image',()=>{
 const h=harness();const v=visual();h.app.bindFaviconImages(v.root);
 const staleLoad=v.image.onload;const timeout=[...h.timers.values()][0];timeout();
 assert.equal(v.image.hidden,true);assert.equal(v.image.src,undefined);
 assert.equal(v.classes.has('is-loaded'),false);assert.equal(h.remembered.length,0);
 staleLoad();
 assert.equal(h.remembered.length,0);assert.equal(v.image.hidden,true);
 h.app.bindFaviconImages(v.root,{force:true});
 assert.equal(v.requests.length,2,'an explicit extraction may retry a previous failure');
 v.image.onload();assert.equal(h.remembered.length,1);
});

test('detached images cannot commit a success or advance to another request',()=>{
 const h=harness({getFaviconCandidates:()=>['https://example.com/a.png','https://example.com/b.png']});
 const v=visual();h.app.bindFaviconImages(v.root);v.element.isConnected=false;
 v.image.onerror();
 assert.equal(v.requests.length,1);assert.equal(h.remembered.length,0);
 v.image.onload();assert.equal(h.remembered.length,0);
});

test('smart extraction starts the optional permission operation synchronously and renders safe status text',async()=>{
 const done=deferred(),calls=[];
 const h=harness({discoverFavicon:(url,options)=>{calls.push({url,options});return done.promise;}});
 const f=linkForm();h.app.updateLinkPreview(f.form);
 const pending=h.app.extractLinkFavicon(f.button);
 assert.equal(calls.length,1,'request must start before the click handler returns its promise');
 assert.equal(calls[0].options.requestPermission,true);assert.equal(calls[0].options.force,true);
 assert.equal(f.button.disabled,true);assert.match(f.status.textContent,/正在读取/);
 done.resolve({candidates:['https://example.com/apple-touch-icon.png'],warning:'<img src=x> 图标声明不可读取'});
 await pending;
 assert.equal(f.button.disabled,false);
 assert.equal(f.status.textContent,'<img src=x> 图标声明不可读取');
 assert.equal(f.status.innerHTML,'','remote messages must be text only');
});

test('edits to the URL or icon mode invalidate a pending extraction result',async()=>{
 for(const change of ['url','iconMode']) {
  const done=deferred();const h=harness({discoverFavicon:()=>done.promise});
  const f=linkForm();h.app.updateLinkPreview(f.form);const pending=h.app.extractLinkFavicon(f.button);
  f.form.elements[change].value=change==='url'?'https://different.example.org/':'text';
  h.app.updateLinkPreview(f.form);
  const currentStatus=f.status.textContent,currentPreview=f.preview.innerHTML;
  done.resolve({candidates:['https://example.com/outdated.png'],warning:'STALE'});await pending;
  assert.equal(f.status.textContent,currentStatus);assert.equal(f.preview.innerHTML,currentPreview);
  assert.equal(f.button.disabled,change==='iconMode');
 }
});

test('closing a dialog or replacing its form prevents late extraction writes',async()=>{
 for(const close of ['dialog','form']) {
  const done=deferred();const h=harness({discoverFavicon:()=>done.promise});
  const f=linkForm();h.app.updateLinkPreview(f.form);const pending=h.app.extractLinkFavicon(f.button);
  if(close==='dialog')h.dialog.open=false;else f.form.isConnected=false;
  const status=f.status.textContent;
  done.resolve({candidates:['https://example.com/late.png'],warning:'STALE'});await pending;
  assert.equal(f.status.textContent,status);
 }
});

test('text mode blocks discovery, while a failed active discovery allows a deliberate retry',async()=>{
 const done=deferred(),calls=[];const h=harness({discoverFavicon:(...args)=>{calls.push(args);return done.promise;}});
 const f=linkForm();f.form.elements.iconMode.value='text';h.app.updateLinkPreview(f.form);
 await h.app.extractLinkFavicon(f.button);assert.equal(calls.length,0);
 f.form.elements.iconMode.value='auto';h.app.updateLinkPreview(f.form);
 const pending=h.app.extractLinkFavicon(f.button);done.reject(new Error('网站没有开放跨域读取。'));await pending;
 assert.equal(f.button.disabled,false);assert.equal(f.status.textContent,'网站没有开放跨域读取。');
 assert.match(f.preview.innerHTML,/site-fallback/);
});
