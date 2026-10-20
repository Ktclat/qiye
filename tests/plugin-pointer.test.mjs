import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginPointerMapper } from '../src/plugin-pointer.js';

function harness(){
 const rect={left:100,top:200,width:200,height:100};
 const mapper=createPluginPointerMapper({clientWidth:200,clientHeight:100,getBoundingClientRect:()=>rect});
 const message=(action,x=20,y=30,extra={})=>({action,x,y,pointerId:7,screenX:400+x,screenY:500+y,...extra});
 return {rect,mapper,message};
}
test('queued local coordinates cannot pull the moving frame backwards',()=>{
 const {rect,mapper,message:m}=harness();
 assert.deepEqual(mapper.point(m('pointerdown')),{clientX:120,clientY:230});mapper.setDragging(true);
 assert.deepEqual(mapper.point(m('pointermove',23,30)),{clientX:120,clientY:230},'calibrate before moving the frame');
 assert.deepEqual(mapper.point(m('pointermove',26,30)),{clientX:126,clientY:230});
 rect.left+=6;
 assert.deepEqual(mapper.point(m('pointermove',29,30)),{clientX:129,clientY:230},'message was captured before the frame moved');
 rect.left+=90;
 assert.deepEqual(mapper.point(m('pointermove',-70,30,{screenX:429})),{clientX:129,clientY:230},'stationary screen point remains stationary');
 assert.deepEqual(mapper.point(m('pointerup',-60,30,{screenX:439})),{clientX:139,clientY:230});
 assert.equal(mapper.point(m('pointermove')),null,'late messages after release are ignored');
});
test('viewport calibration respects zoom, scaling and negative screen origins',()=>{
 for(const zoom of [.8,1,1.25,1.5,2]){
  const {rect,mapper,message:m}=harness();
  mapper.point(m('pointerdown',20,30,{screenX:-100,screenY:-200}));mapper.setDragging(true);
  mapper.point(m('pointermove',28,34,{screenX:-100+8*zoom,screenY:-200+4*zoom}));
  rect.left+=80;rect.top-=40;
  const end=mapper.point(m('pointermove',0,0,{screenX:-100+160*zoom,screenY:-200-80*zoom}));
  assert.ok(Math.abs(end.clientX-280)<1e-8);assert.ok(Math.abs(end.clientY-150)<1e-8);
 }
});
test('short moves, legacy clients and context menus retain viewport coordinates',()=>{
 const {rect,mapper,message:m}=harness();
 mapper.point(m('pointerdown'));
 assert.deepEqual(mapper.point(m('pointermove',21,32)),{clientX:121,clientY:232});
 mapper.setDragging(false);
 const legacy={action:'pointerdown',pointerId:8,x:10,y:15};mapper.point(legacy);mapper.setDragging(true);
 rect.left=400;
 assert.deepEqual(mapper.point({...legacy,action:'pointermove'}),{clientX:410,clientY:215});
 assert.deepEqual(mapper.point({action:'contextmenu',x:5,y:6}),{clientX:405,clientY:206});
});
test('invalid coordinates, foreign pointers and cancelled sessions cannot move a card',()=>{
 const {mapper,message:m}=harness();mapper.point(m('pointerdown'));mapper.setDragging(true);
 for(const bad of [{x:NaN},{y:Infinity},{x:'20'},{x:30000},{pointerId:8}])assert.equal(mapper.point(m('pointermove',30,30,bad)),null);
 mapper.setDragging(false);assert.equal(mapper.point(m('pointermove')),null);
});

test('missing or zeroed screen coordinates keep touch input moving instead of freezing',()=>{
 const {mapper,message:m}=harness();mapper.point(m('pointerdown'));mapper.setDragging(true);
 assert.deepEqual(mapper.point(m('pointermove',30,40,{screenX:0,screenY:0})),{clientX:130,clientY:240});
 assert.deepEqual(mapper.point(m('pointerup',40,50,{screenX:0,screenY:0})),{clientX:140,clientY:250});
});
