// SPDX-License-Identifier: GPL-3.0-only
// MessagePort delivery can lag behind a moving iframe. During a drag, anchor
// screen deltas once instead of adding old local coordinates to its new rect.
export function createPluginPointerMapper(frame) {
 let pointer=null,dragging=false;
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const screen=message=>finite(message.screenX)&&finite(message.screenY)&&(message.screenX!==0||message.screenY!==0)&&Math.abs(message.screenX)<1e7&&Math.abs(message.screenY)<1e7;
 function point(message){
  if(!finite(message.x)||!finite(message.y)||Math.abs(message.x)>20000||Math.abs(message.y)>20000)return null;
  const localPoint=()=>{const rect=frame.getBoundingClientRect();return {clientX:rect.left+message.x*rect.width/(frame.clientWidth||1),clientY:rect.top+message.y*rect.height/(frame.clientHeight||1)};};
  if(message.action==='contextmenu')return localPoint();
  if(!Number.isInteger(message.pointerId))return null;
  if(message.action==='pointerdown'){
   const point=localPoint();pointer={id:message.pointerId,point,screen:screen(message)?{x:message.screenX,y:message.screenY}:null,scale:null};dragging=false;return point;
  }
  if(!pointer||pointer.id!==message.pointerId)return null;
  let result;
  // Some touch emulators/privacy modes omit screen positions. Keep the legacy
  // viewport path for the whole gesture instead of freezing at the anchor.
  if(pointer.screen&&!screen(message))pointer.screen=null;
  if(pointer.screen&&screen(message)){
   const dx=message.screenX-pointer.screen.x,dy=message.screenY-pointer.screen.y,distance=dx*dx+dy*dy;
   // Calibrate while the frame is stationary. Screen pixels and viewport CSS
   // pixels differ at browser/pinch zoom; do not assume devicePixelRatio is zoom.
   // Four pixels avoid magnifying subpixel noise. Until then a held card stays
   // at its anchor; pre-hold input/selection continues to use native positions.
   if(pointer.scale===null&&distance>=16){
    const local=localPoint();
    const scale=((local.clientX-pointer.point.clientX)*dx+(local.clientY-pointer.point.clientY)*dy)/distance;
    if(scale>=.1&&scale<=10)pointer.scale=scale;
    else{pointer.screen=null;result=local;}
   }
   if(pointer.scale!==null)result={clientX:pointer.point.clientX+dx*pointer.scale,clientY:pointer.point.clientY+dy*pointer.scale};
   else if(dragging&&pointer.screen)result=pointer.point;
  }
  result??=localPoint();
  if(message.action==='pointerup'||message.action==='pointercancel'){pointer=null;dragging=false;}
  return result;
 }
 return {point,setDragging(active){dragging=active;if(!active)pointer=null;}};
}
