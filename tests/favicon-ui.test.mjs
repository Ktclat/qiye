import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { safeUrl } from '../src/core.js';
import { icon, iconNames } from '../src/icons.js';
import { bindFaviconImages } from '../src/favicon-view.js';

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
 declaration('const esc ='),declaration('const faviconFormStates ='),declaration('let faviconRequestSequence ='),
 ...['tileInk','siteGlyph','linkPreviewIdentity','updateLinkPreview','isLinkPreviewCurrent','extractLinkFavicon'].map(extractFunction),
 'globalThis.app={siteGlyph,updateLinkPreview,extractLinkFavicon};'
].join('\n\n');
function deferred() {
 let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};
}
function harness(extra={}) {
 const dialog={open:true};
 const context=vm.createContext({
  safeUrl,icon,iconNames,URL,Promise,Date,dialog,bindFaviconImages,state:{settings:{gridSize:74}},
  $:(selector,root)=>root.querySelector(selector),
  $$:(selector,root)=>[...root.querySelectorAll(selector)],
  getFaviconCandidates:()=>['https://example.com/favicon.ico'],
  discoverFavicon:async()=>({candidates:[]}),
  ...extra
 });
 new vm.Script(code,{filename:'favicon-ui-extracted-from-app.js'}).runInContext(context);
 return {app:context.app,dialog};
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
