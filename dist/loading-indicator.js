// Render readiness comes from a completed frame. Delayed appearance avoids a
// flash for fast edits; revision checks prevent old timers hiding a newer load.
export function createLoadingIndicator(element, reasonElement, clock = globalThis) {
 let wanted=false, visible=false, revision=0, timer=null, shownAt=0;
 const now=()=>clock.performance?.now?.()??Date.now();
 const clear=()=>{if(timer!==null)clock.clearTimeout(timer);timer=null;};
 function update(busy, reason='Preparing your universe…', immediate=false) {
  if(reasonElement.textContent!==reason)reasonElement.textContent=reason;
  if(busy===wanted){
   // A deliberate scene tap must promote an already scheduled loader now.
   if(busy&&immediate&&!visible){++revision;clear();visible=true;shownAt=now();element.classList.remove('is-leaving');element.hidden=false;}
   return;
  }
  wanted=busy;const current=++revision;clear();
  if(busy){
   element.classList.remove('is-leaving');
   const show=()=>{if(current!==revision||!wanted)return;visible=true;shownAt=now();element.hidden=false;};
   if(immediate)show();else timer=clock.setTimeout(show,160);
  }else if(visible){
   timer=clock.setTimeout(()=>{if(current!==revision||wanted)return;element.classList.add('is-leaving');timer=clock.setTimeout(()=>{if(current!==revision||wanted)return;element.hidden=true;visible=false;element.classList.remove('is-leaving');},160);},Math.max(0,280-(now()-shownAt)));
  }else element.hidden=true;
 }
 return {update,dispose(){++revision;clear();wanted=visible=false;element.hidden=true;}};
}
