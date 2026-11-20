// Decode only nearby scene cards, with two requests in flight. In particular,
// do not depend on native lazy loading noticing a formerly hidden dialog.
// The release builder substitutes its embedded image map here. Keep only
// short scene IDs in the gallery markup, including during startup.
const thumbnailUrl=id=>`assets/atlas-${id}.webp`;
export function installSceneThumbnails(grid,dialog,clock=globalThis){
 const entries=[...grid.querySelectorAll('img[data-thumbnail]')].map(img=>({img,art:img.parentNode,status:img.parentNode.querySelector('[data-thumbnail-status]'),state:'idle',attempts:0,visit:0,serial:0,cleanup:null}));
 const byArt=new Map(entries.map(entry=>[entry.art,entry]));
 let disposed=false,active=0,visit=0,wasOpen=false,scheduled=null,observer=null;
 const queue=[];
 function nearby(entry){
  if(!dialog.open||entry.art.closest('[hidden]'))return false;
  const card=entry.art.closest('[data-scene]');if(card?.hidden)return false;
  const box=entry.art.getBoundingClientRect(),view=dialog.getBoundingClientRect();
  return box.width>0&&box.height>0&&box.bottom>=view.top-400&&box.top<=view.bottom+400&&box.right>=view.left&&box.left<=view.right;
 }
 function message(entry,text){if(entry.status){entry.status.textContent=text;entry.status.hidden=!text;}entry.art.dataset.thumbnailState=entry.state;}
 function enqueue(entry){if(entry.state!=='idle'||!nearby(entry))return;entry.state='queued';queue.push(entry);}
 function pump(){
  if(disposed||!dialog.open)return;
  while(active<2&&queue.length){
   const entry=queue.shift();if(entry.state!=='queued')continue;
   if(!nearby(entry)){entry.state='idle';continue;}
   const {img}=entry,serial=++entry.serial;entry.state='loading';entry.attempts++;entry.visit=visit;active++;img.hidden=true;message(entry,'Preview…');
   let decoding=false,finished=false,timer=null;
   const cleanup=()=>{clock.clearTimeout(timer);img.removeEventListener('load',loaded);img.removeEventListener('error',failed);entry.cleanup=null;};
   const finish=success=>{
    if(disposed||finished||entry.serial!==serial)return;finished=true;cleanup();active--;
    if(success){entry.state='ready';img.hidden=false;message(entry,'');observer?.unobserve(entry.art);}
    else if(entry.attempts<2){entry.state='idle';enqueue(entry);}
    else{entry.state='error';message(entry,'Preview unavailable');}
    pump();
   };
   const failed=()=>finish(false);
   const loaded=()=>{
    if(decoding||finished)return;decoding=true;
    if(!img.naturalWidth){failed();return;}
    // decode() keeps large batches of images off the paint path. A browser may
    // reject decode after load even though it already has a usable image.
    if(typeof img.decode==='function')Promise.resolve().then(()=>img.decode()).then(()=>finish(img.naturalWidth>0),()=>finish(img.naturalWidth>0));
    else finish(true);
   };
   entry.cleanup=cleanup;img.addEventListener('load',loaded);img.addEventListener('error',failed);
   timer=clock.setTimeout(failed,8000);img.loading='eager';img.decoding='async';
   img.removeAttribute('src');img.src=thumbnailUrl(img.dataset.thumbnail);
   if(img.complete&&img.naturalWidth>0)loaded();
  }
 }
 function refresh(){
  if(disposed)return;
  if(!dialog.open){wasOpen=false;return;}
  if(!wasOpen){wasOpen=true;visit++;}
  for(const entry of entries){
   if(entry.state==='error'&&entry.visit!==visit){entry.state='idle';entry.attempts=0;}
   enqueue(entry);
  }
  pump();
 }
 function schedule(){if(disposed||scheduled!==null)return;scheduled=clock.setTimeout(()=>{scheduled=null;refresh();},0);}
 const closed=()=>{wasOpen=false;};
 for(const entry of entries){entry.img.hidden=true;entry.art.dataset.thumbnailState='idle';}
 if(typeof clock.IntersectionObserver==='function'){
  observer=new clock.IntersectionObserver(changes=>{for(const change of changes)if(change.isIntersecting){const entry=byArt.get(change.target);if(entry)enqueue(entry);}pump();},{root:dialog,rootMargin:'400px'});
  for(const entry of entries)observer.observe(entry.art);
 }
 // Capturing scroll also catches the dialog's nested scrolling content. This
 // geometry fallback works even when IntersectionObserver is unavailable.
 dialog.addEventListener('scroll',schedule,true);dialog.addEventListener('close',closed);clock.addEventListener?.('resize',schedule);refresh();
 return {refresh,dispose(){if(disposed)return;disposed=true;observer?.disconnect();clock.clearTimeout(scheduled);dialog.removeEventListener('scroll',schedule,true);dialog.removeEventListener('close',closed);clock.removeEventListener?.('resize',schedule);for(const entry of entries)entry.cleanup?.();queue.length=0;}};
}
