// Renderer stages are real events; elapsed time is never presented as percent
// completion. Only a stalled transition expands the small acknowledgement.
// Its CSS animation belongs to the compositor, independent of render frames.
export const LOADING_STALL_DELAY_MS=650;
export function createLoadingIndicator(element,{now=()=>globalThis.performance?.now?.()??Date.now(),schedule=setTimeout,cancel=clearTimeout}={}) {
 let disposed=false,busy=false,timer=null,scene='Edge of infinity',phase='preparing',revision=null,anchor=0,elapsed=0,suspended=false;
 const stages={starting:'Starting local graphics',preparing:'Preparing scene objects',compiling:'Compiling graphics on this device',drawing:'Waiting for the first complete frame',presenting:'Presenting the completed frame',ready:'Waiting for the updated view','waiting-choice':'Choose graphics mode'};
 if(element)element.innerHTML='<span class="loading-visual" aria-hidden="true"><span class="loading-orbit"></span></span><span class="loading-copy"><strong class="loading-scene"></strong><span class="loading-phase"></span><span class="loading-elapsed"></span></span>';
 const nodes={scene:element?.querySelector?.('.loading-scene'),phase:element?.querySelector?.('.loading-phase'),elapsed:element?.querySelector?.('.loading-elapsed')};
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 const paint=()=>{
  clear();if(disposed||!element)return;
  element.hidden=!busy||suspended;if(!busy||suspended)return;
  const age=Math.max(0,elapsed+now()-anchor),stalled=age>=LOADING_STALL_DELAY_MS,text=stages[phase]||stages.preparing,seconds=Math.floor(age/1000);
  element.classList?.toggle('is-stalled',stalled);element.classList?.toggle('is-pending',!stalled);element.setAttribute?.('data-phase',phase);
  if(nodes.scene){nodes.scene.textContent=scene;nodes.phase.textContent=text;nodes.elapsed.textContent=stalled?`${seconds} s elapsed`:'';}else element.textContent=scene+' · '+text+(stalled?` · ${seconds} s elapsed`:'');
  const label=scene+' · '+text+(stalled?` · ${seconds} seconds elapsed`:'');element.setAttribute?.('aria-label',label);element.title=label;
  timer=schedule(paint,250);
 };
 return {
  update(nextBusy,nextScene='Edge of infinity',immediate=false,timeline=null){
   if(disposed||!element)return;
   const time=now(),newRevision=timeline?.revision!=null&&revision!=null&&timeline.revision!==revision;
   if(nextBusy&&(!busy||immediate||newRevision)){anchor=time;elapsed=0;}
   else if(busy&&!suspended){elapsed+=Math.max(0,time-anchor);anchor=time;}
   busy=!!nextBusy;scene=nextScene;phase=timeline?.phase||'preparing';suspended=!!timeline?.suspended;
   if(timeline?.revision!=null)revision=timeline.revision;
   if(Number.isFinite(timeline?.elapsedMs))elapsed=Math.max(0,timeline.elapsedMs);
   anchor=time;paint();
  },
  dispose(){disposed=true;busy=false;clear();if(element)element.hidden=true;}
 };
}
