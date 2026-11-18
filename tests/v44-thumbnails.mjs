import assert from 'node:assert/strict';
import {installSceneThumbnails} from '../dist/scene-thumbnails.js';
import {uiDomFixture} from './ui-dom-fixture.mjs';

function fixture(withObserver=true){
 const cards=Array.from({length:49},(_,i)=>`<button data-scene="scene-${i}"><div class="atlas-art"><span data-thumbnail-status>Preview…</span><img data-thumbnail="data:image/webp;base64,${i}" hidden></div></button>`).join('');
 const doc=uiDomFixture(`<dialog id="dialog"><div id="grid">${cards}</div></dialog>`),dialog=doc.getElementById('dialog'),grid=doc.getElementById('grid'),images=grid.querySelectorAll('img'),arts=grid.querySelectorAll('.atlas-art');
 let scroll=0,serial=0,requests=0,peak=0,inflight=0,observer=null;
 const timers=new Map(),resize=new Set();
 const clock={setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){if(type==='resize')resize.add(fn);},removeEventListener(type,fn){resize.delete(fn);}};
 if(withObserver)clock.IntersectionObserver=class{constructor(fn,options){observer=this;this.fn=fn;this.options=options;this.observed=new Set();}observe(art){this.observed.add(art);}unobserve(art){this.observed.delete(art);}disconnect(){this.observed.clear();}enter(art){this.fn([{target:art,isIntersecting:true}]);}};
 dialog.getBoundingClientRect=()=>({top:0,bottom:600,left:0,right:600,width:600,height:600});
 for(const [index,art]of arts.entries())art.getBoundingClientRect=()=>({top:Math.floor(index/2)*1200-scroll,bottom:Math.floor(index/2)*1200+400-scroll,left:0,right:600,width:600,height:400});
 for(const img of images){
  img.complete=false;img.naturalWidth=0;img.pending=false;
  Object.defineProperty(img,'src',{get(){return this._src;},set(value){this._src=value;this.pending=true;requests++;inflight++;peak=Math.max(peak,inflight);}});
 }
 const complete=(index,success=true)=>{const img=images[index];assert(img.pending,`Image ${index} is pending`);img.pending=false;inflight--;img.complete=true;img.naturalWidth=success?640:0;img.dispatch(success?'load':'error');};
 const flush=()=>{for(const [id,item]of [...timers])if(item.delay===0){timers.delete(id);item.fn();}};
 const ui=installSceneThumbnails(grid,dialog,clock);
 return {dialog,grid,images,arts,clock,ui,complete,flush,setScroll(value){scroll=value;},get observer(){return observer;},get requests(){return requests;},get peak(){return peak;},get inflight(){return inflight;},timers,resize};
}

for(const observer of [true,false]){
 const f=fixture(observer);assert.equal(f.requests,0,'Closed dialog starts no image work');
 f.dialog.showModal();f.ui.refresh();assert.equal(f.requests,2);assert.equal(f.inflight,2);
 if(observer){assert.equal(f.observer.options.root,f.dialog);assert.equal(f.observer.options.rootMargin,'400px');}
 f.complete(0);f.complete(1);assert.equal(f.images[0].hidden,false);assert(f.arts[0].querySelector('[data-thumbnail-status]').hidden);
 // Later cards are not tied to native lazy loading or the initial viewport.
 f.setScroll(20*600);f.dialog.dispatch('scroll');f.flush();assert(f.images[20].pending);assert(f.images[21].pending);
 f.complete(20,false);assert(f.images[20].pending,'One failed load gets a bounded retry');f.complete(20);assert.equal(f.images[20].hidden,false,'A recovered image is unhidden');
 f.complete(21,false);f.complete(21,false);assert.equal(f.inflight,0);assert.equal(f.arts[21].querySelector('[data-thumbnail-status]').textContent,'Preview unavailable');
 const failedRequests=f.requests;f.ui.refresh();f.ui.refresh();assert.equal(f.requests,failedRequests,'Scrolling cannot create an endless retry loop');
 f.dialog.close();f.dialog.showModal();f.ui.refresh();assert(f.images[21].pending,'Reopening allows recovery from a prior visit failure');f.complete(21);
 // Filters and scrolling must not launch unrelated far-away cards.
 f.setScroll(48*600);f.images[48].closest('[data-scene]').hidden=true;f.ui.refresh();assert(!f.images[48].pending);
 f.images[48].closest('[data-scene]').hidden=false;f.ui.refresh();assert(f.images[48].pending);f.complete(48);assert(!f.images[48].hidden);
 assert(f.peak<=2,'Image loading is bounded to two concurrent requests');
 f.ui.dispose();assert.equal(f.timers.size,0);assert.equal(f.resize.size,0);const requests=f.requests;f.ui.refresh();assert.equal(f.requests,requests);
}

// Browser decode failures cannot permanently hide an already loaded bitmap.
const f=fixture();f.images[0].decode=()=>Promise.reject(new Error('interrupted decode'));
f.dialog.showModal();f.ui.refresh();f.complete(0);assert(f.images[0].hidden);
await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
assert.equal(f.images[0].hidden,false);f.complete(1);f.ui.dispose();
console.log('PASS: bounded thumbnail loading, dialog/scroll/filter visibility, cards beyond index20, retry/reopen recovery, decode fallback, and disposal.');
