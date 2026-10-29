// Readiness comes only from a completed scene frame. The small UI timer is
// independent of the render worker: this percentage measures the wait limit,
// not fabricated shader/asset completion. Old scene timers cannot hide a new one.
export function createLoadingIndicator(element, reasonElement, clock = globalThis) {
 let wanted=false, visible=false, revision=0, timer=null, ticker=null, shownAt=0;
 let elapsedBase=0, elapsedAt=0, suspended=false, loadRevision=null;
 const now=()=>clock.performance?.now?.()??Date.now();
 const percentage=element.querySelector?.('#loadingPercent');
 const clear=()=>{if(timer!==null)clock.clearTimeout(timer);timer=null;};
 const stopTicker=()=>{if(ticker!==null)clock.clearTimeout(ticker);ticker=null;};
 const elapsed=()=>elapsedBase+(suspended?0:Math.max(0,now()-elapsedAt));
 const paint=()=>{
  if(!percentage)return;
  const seconds=Math.min(60,elapsed()/1000),value=Math.min(100,Math.floor(seconds*100/60)),text=`${value}%`;
  if(percentage.textContent!==text)percentage.textContent=text;
  percentage.setAttribute?.('aria-label',`${value}% of the 60 second loading time limit elapsed`);
 };
 const tick=()=>{ticker=null;if(!wanted)return;paint();ticker=clock.setTimeout(tick,250);};
 function update(busy, scene='Edge of infinity', immediate=false, timeline=null) {
  if(reasonElement.textContent!==scene)reasonElement.textContent=scene;
  const changedLoad=timeline&&timeline.revision!==undefined&&timeline.revision!==loadRevision;
  if(busy&&(!wanted||immediate||changedLoad)){elapsedBase=0;elapsedAt=now();suspended=false;loadRevision=timeline?.revision??null;}
  if(busy&&timeline){
   // Same-revision stats can arrive between monitor ticks. Never let their
   // slightly older elapsed sample make the displayed percentage move backward.
   elapsedBase=changedLoad?Math.max(0,timeline.elapsedMs||0):Math.max(elapsed(),timeline.elapsedMs||0);
   elapsedAt=now();suspended=!!timeline.suspended;loadRevision=timeline.revision??loadRevision;
  }
  if(busy){paint();if(ticker===null)ticker=clock.setTimeout(tick,250);}else stopTicker();
  if(busy===wanted){
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
 return {update,dispose(){++revision;clear();stopTicker();wanted=visible=false;element.hidden=true;}};
}
