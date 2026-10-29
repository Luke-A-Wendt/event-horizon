// Gesture recognition is separate from camera controls. Single taps only prime
// the double-tap window, except an explicitly enabled travel-label action.
export function installScenePicking(scene,pick,{onSelect=()=>{},onTrack=()=>{},onLabelTap=()=>false,getFocusId=()=>null,setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
 const pointers=new Map(),listeners=[],now=e=>Number.isFinite(e.timeStamp)?e.timeStamp:performance.now(),doubleDelay=340;let lastTap=null,lastDouble=-Infinity,lastRejected=-Infinity,pending=null;
 const cancel=()=>{if(pending)clearTimer(pending.timer);pending=null;lastTap=null;};
 const activateDouble=(hit,at)=>{cancel();lastDouble=at;if(getFocusId()===hit.id)onSelect(hit.id,hit);else onTrack(hit.id,hit);};
 const listen=(name,fn)=>{scene.addEventListener?.(name,fn,true);listeners.push(()=>scene.removeEventListener?.(name,fn,true));};
 const allowed=e=>{if(e.button!==undefined&&e.button!==0)return false;const target=e.target;if(target?.closest?.('button,input,select,textarea,a,[role="dialog"],[data-scene-control]'))return false;return !target||target===scene||target.tagName?.toLowerCase()==='canvas'||!!target.closest?.('.scene-annotations');};
 listen('pointerdown',e=>{if(!allowed(e))return;const item={x:e.clientX,y:e.clientY,time:now(e),cancelled:pointers.size>0,type:e.pointerType,hit:pick(e.clientX,e.clientY)};if(pointers.size){cancel();lastRejected=now(e);for(const p of pointers.values())p.cancelled=true;}else if(pending&&lastTap?.id===item.hit?.id&&now(e)-lastTap.time<=doubleDelay){clearTimer(pending.timer);pending=null;}pointers.set(e.pointerId,item);});
 listen('pointermove',e=>{const p=pointers.get(e.pointerId);if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>(p.type==='touch'?10:6)){p.cancelled=true;lastRejected=now(e);cancel();}});
 listen('pointerup',e=>{const p=pointers.get(e.pointerId);pointers.delete(e.pointerId);if(!p)return;if(p.cancelled||now(e)-p.time>650||Math.hypot(e.clientX-p.x,e.clientY-p.y)>(p.type==='touch'?10:6)){lastRejected=now(e);cancel();return;}
  const hit=p.hit;if(!hit){cancel();return;}if(hit.hit==='label'&&onLabelTap(hit.id,hit)){cancel();lastDouble=now(e);return;}const at=now(e),double=lastTap&&lastTap.id===hit.id&&at-lastTap.time<=doubleDelay&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24;
  cancel();if(double){activateDouble(hit,at);}else{lastTap={id:hit.id,x:e.clientX,y:e.clientY,time:at};pending={hit,timer:setTimer(()=>{pending=null;lastTap=null;},doubleDelay)};}
 });
 for(const name of ['pointercancel','lostpointercapture'])listen(name,e=>{if(pointers.delete(e.pointerId)){lastRejected=now(e);cancel();}});
 // Browsers also emit dblclick after the two pointer taps. Suppress that
 // duplicate for both outcomes, including when tracking changes immediately.
 listen('dblclick',e=>{if(!allowed(e)||now(e)-lastDouble<400||now(e)-lastRejected<400)return;const hit=pick(e.clientX,e.clientY);if(hit)activateDouble(hit,now(e));});
 return {cancel(){cancel();pointers.clear();},dispose(){cancel();for(const remove of listeners)remove();pointers.clear();}};
}
