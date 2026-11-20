import {isDriveCraft} from './objects.js';

// The flight-line override is intentionally resolved against the live scene:
// a delayed tap from another scene cannot acquire an unrelated vehicle.
export function lineupPicking(getRenderer,inspect,helm){
 const eligible=id=>{const r=getRenderer();return r?.sceneId==='shuttle-space'&&isDriveCraft(r.objects?.find(o=>o.id===id));};
 return {onObjectTap(id){if(!eligible(id))return false;inspect(id);return true;},
  onObjectDoubleTap(id){if(!eligible(id))return false;helm(id);return true;}};
}
// Both pointer types share one delayed single/double arbiter, so opening a
// properties panel cannot swallow the second press of a helm gesture.
export function installScenePicking(scene,pick,{onSelect=()=>{},onTrack=()=>{},onObjectTap=()=>false,onObjectDoubleTap=()=>false,onLabelTap=()=>false,onLabelDoubleTap=()=>false,getFocusId=()=>null,getInteractionRevision=()=>null,setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}={}){
 const pointers=new Map(),listeners=[],now=e=>Number.isFinite(e.timeStamp)?e.timeStamp:performance.now(),doubleDelay=340;let lastTap=null,lastDouble=-Infinity,lastRejected=-Infinity,lastUp=-Infinity,pending=null;
 const cancel=()=>{if(pending)clearTimer(pending.timer);pending=null;lastTap=null;};
 const activateDouble=(hit,at)=>{cancel();lastDouble=at;if(onObjectDoubleTap(hit.id,hit))return;if(hit.hit==='label'&&onLabelDoubleTap(hit.id,hit))return;if(getFocusId()===hit.id)onSelect(hit.id,hit);else onTrack(hit.id,hit);};
 const listen=(name,fn)=>{scene.addEventListener?.(name,fn,true);listeners.push(()=>scene.removeEventListener?.(name,fn,true));};
 const allowed=e=>{if(e.button!==undefined&&e.button!==0)return false;const target=e.target;if(target?.closest?.('button,input,select,textarea,a,[role="dialog"],[data-scene-control]'))return false;return !target||target===scene||target.tagName?.toLowerCase()==='canvas'||!!target.closest?.('.scene-annotations');};
 listen('pointerdown',e=>{if(!allowed(e))return;const item={x:e.clientX,y:e.clientY,time:now(e),cancelled:pointers.size>0,type:e.pointerType,revision:getInteractionRevision(),hit:pick(e.clientX,e.clientY)};if(pointers.size){cancel();lastRejected=now(e);for(const p of pointers.values())p.cancelled=true;}else if(pending&&lastTap?.id===item.hit?.id&&now(e)-lastTap.time<=doubleDelay){clearTimer(pending.timer);pending=null;}pointers.set(e.pointerId,item);});
 listen('pointermove',e=>{const p=pointers.get(e.pointerId);if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>(p.type==='touch'?10:6)){p.cancelled=true;lastRejected=now(e);cancel();}});
 listen('pointerup',e=>{const p=pointers.get(e.pointerId);pointers.delete(e.pointerId);if(!p)return;lastUp=now(e);if(p.revision!==getInteractionRevision()){cancel();return;}if(p.cancelled||now(e)-p.time>650||Math.hypot(e.clientX-p.x,e.clientY-p.y)>(p.type==='touch'?10:6)){lastRejected=now(e);cancel();return;}
  const hit=p.hit;if(!hit){cancel();return;}const at=now(e),double=lastTap&&lastTap.revision===p.revision&&lastTap.id===hit.id&&at-lastTap.time<=doubleDelay&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24;
  cancel();if(double){activateDouble(hit,at);}else{lastTap={id:hit.id,x:e.clientX,y:e.clientY,time:at,revision:p.revision};pending={hit,timer:setTimer(()=>{pending=null;lastTap=null;if(p.revision!==getInteractionRevision())return;if(!onObjectTap(hit.id,hit)&&hit.hit==='label')onLabelTap(hit.id,hit);},doubleDelay)};}
 });
 for(const name of ['pointercancel','lostpointercapture'])listen(name,e=>{if(pointers.delete(e.pointerId)){lastRejected=now(e);cancel();}});
 // Browsers also emit dblclick after the two pointer taps. Suppress that
 // duplicate for both outcomes, including when tracking changes immediately.
 listen('dblclick',e=>{if(!allowed(e)||now(e)-lastDouble<400||now(e)-lastRejected<400||now(e)-lastUp<400)return;const hit=pick(e.clientX,e.clientY);if(hit)activateDouble(hit,now(e));});
 return {cancel(){cancel();pointers.clear();},dispose(){cancel();for(const remove of listeners)remove();pointers.clear();}};
}
