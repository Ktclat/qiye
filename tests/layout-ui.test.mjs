import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
function extract(name){const start=new RegExp('^function '+name+'\\(','m').exec(source).index;for(let end=source.indexOf('}',start);end!==-1;end=source.indexOf('}',end+1)){const s=source.slice(start,end+1);try{new vm.Script('('+s+')');return s;}catch{}}throw Error(name);}
function node(rect={left:50,width:950,top:0,height:250},padding=24){
 const props=new Map(),classes=new Set();
 const n={rect,padding,hidden:false,children:[],parentElement:null,style:{fontSize:'',setProperty:(k,v)=>props.set(k,String(v)),getPropertyValue:k=>props.get(k)||''},classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,v)=>v?classes.add(k):classes.delete(k)},classes,
 get clientWidth(){return this.rect.width;},get nextElementSibling(){const a=this.parentElement.children;return a[a.indexOf(this)+1]||null;},
 append(child){if(child.parentElement){const a=child.parentElement.children;a.splice(a.indexOf(child),1);}this.children.push(child);child.parentElement=this;},
 insertBefore(child,target){if(child.parentElement){const a=child.parentElement.children;a.splice(a.indexOf(child),1);}this.children.splice(this.children.indexOf(target),0,child);child.parentElement=this;},
 getBoundingClientRect(){const shift=parseFloat(this.style.getPropertyValue(this.key))||0;const r=this.rect;return {...r,left:r.left+shift,right:r.left+shift+r.width,bottom:r.top+r.height};}};return n;
}
function harness(settings={}){
 const flow=node(),dock=node(),clock=node({left:325,width:400,top:60,height:90}),search=node({left:225,width:600,top:180,height:46});
 clock.key='--clock-shift';search.key='--search-shift';flow.append(clock);flow.append(search);
 const text=node();text.closest=()=>clock.parentElement;Object.defineProperty(text,'scrollWidth',{get:()=>280*(parseFloat(text.style.fontSize)||70)/70});
 const state={settings:{pinClock:false,pinSearch:false,clockOffsetX:0,searchOffsetX:0,...settings}};
 const root=node(),window={innerWidth:1000};
 const $=(s,parent)=>{const all={'#header-dock':dock,'#flow-header':flow,'#main':flow,'#clock':text,'#clock-block':clock,'.search-wrapper':search};const n=all[s];return parent&&n.parentElement!==parent?null:n;};
 const context=vm.createContext({$,state,window,document:{body:root},getComputedStyle:n=>({fontSize:n.style.fontSize||'70px',paddingLeft:n.padding+'px',paddingRight:n.padding+'px'})});
 new vm.Script(['positionHeaderRegions','updatePinnedHeader','updateHeaderPlacement'].map(extract).join('\n')+'\nglobalThis.api={positionHeaderRegions,updateHeaderPlacement,updatePinnedHeader};').runInContext(context);
 return {api:context.api,flow,dock,clock,search,text,state,root,window};
}
test('default controls remain in normal flow and empty dock reserves no area',()=>{const h=harness();h.api.positionHeaderRegions();assert.equal(h.dock.hidden,true);assert.deepEqual(h.flow.children,[h.clock,h.search]);assert.equal(h.root.classes.has('has-pinned-header'),false);});
test('fixed controls are reparented outside the scrolling region in time/search order',()=>{const h=harness({pinClock:true,pinSearch:true});h.api.positionHeaderRegions();assert.deepEqual(h.dock.children,[h.clock,h.search]);assert.equal(h.flow.hidden,true);assert.equal(h.dock.hidden,false);h.api.positionHeaderRegions();assert.equal(h.dock.children.length,2);});
test('both mixed combinations preserve stable nodes and independent preferences',()=>{for(const pinClock of [true,false]){const h=harness({pinClock,pinSearch:!pinClock});h.api.positionHeaderRegions();assert.equal(h.clock.parentElement,pinClock?h.dock:h.flow);assert.equal(h.search.parentElement,pinClock?h.flow:h.dock);h.state.settings.pinClock=h.state.settings.pinSearch=false;h.api.positionHeaderRegions();assert.deepEqual(h.flow.children,[h.clock,h.search]);}});
test('hiding the only pinned control removes its dock without losing the node',()=>{const h=harness({pinClock:true});h.clock.hidden=true;h.api.positionHeaderRegions();assert.equal(h.dock.hidden,true);h.clock.hidden=false;h.api.positionHeaderRegions();assert.equal(h.dock.hidden,false);});
test('placement clamps horizontal offsets inside the parent without accumulating shifts',()=>{const h=harness({clockOffsetX:30,searchOffsetX:-30});h.api.updateHeaderPlacement();assert.equal(h.clock.getBoundingClientRect().right,976);assert.equal(h.search.getBoundingClientRect().left,74);const before=h.clock.getBoundingClientRect();h.api.updateHeaderPlacement();assert.deepEqual(h.clock.getBoundingClientRect(),before);});
test('clock fits narrow available space then regains its configured font size',()=>{const h=harness();h.flow.rect.width=200;h.api.updateHeaderPlacement();assert.ok(h.text.scrollWidth<=168.001);h.flow.rect.width=950;h.api.updateHeaderPlacement();assert.equal(h.text.style.fontSize,'');});
test('scroll updates never enable heavier or shrinking sticky header styles',()=>{const h=harness({pinClock:true,pinSearch:true});h.clock.classList.add('is-stuck');h.search.classList.add('is-stuck');h.api.updatePinnedHeader();assert.equal(h.clock.classes.has('is-stuck'),false);assert.equal(h.search.classes.has('is-stuck'),false);assert.equal(h.clock.style.fontSize,'');});
