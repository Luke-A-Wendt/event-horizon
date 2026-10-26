import assert from 'node:assert/strict';
import {DiagnosticFramePresenter} from '../dist/frame-presentation.js';

// Exercise asynchronous browser contracts, including callbacks that never fire.
const originals=Object.fromEntries(['document','Image','XMLSerializer','URL'].map(key=>[key,globalThis[key]]));
function fixture({overlayMode='success',encodeMode='success'}={}){
 const calls={draws:[],revoked:[],images:[],canvases:[],blobs:0};
 globalThis.document={createElement(){
  const canvas={width:0,height:0,getContext:()=>({drawImage:(...args)=>calls.draws.push(args)}),toBlob(callback){calls.blobs++;if(encodeMode==='throw')throw Error('Encoder exception');if(encodeMode!=='never')queueMicrotask(()=>callback(encodeMode==='empty'?null:new Blob(['png bytes'],{type:'image/png'})));}};
  calls.canvases.push(canvas);return canvas;
 }};
 globalThis.Image=class{constructor(){calls.images.push(this);}set src(value){this.source=value;if(value&&overlayMode!=='never')queueMicrotask(()=>overlayMode==='success'?this.onload?.():this.onerror?.());}};
 globalThis.XMLSerializer=class{serializeToString(){return '<svg xmlns="http://www.w3.org/2000/svg"/>';}};
 globalThis.URL={createObjectURL:()=>`blob:overlay-${calls.images.length}`,revokeObjectURL:url=>calls.revoked.push(url)};
 const presenter=new DiagnosticFramePresenter({}),surface={width:900,height:600,toBlob(){}};presenter.surface=surface;presenter.active=true;
 const overlay={style:{},cloneNode:()=>({setAttribute(){},removeAttribute(){}})};
 return {presenter,overlay,calls,surface};
}
try{
 {
  const f=fixture(),progress=[],pending=f.presenter.capture(f.overlay,{onProgress:p=>progress.push(p)});
  assert.equal(f.calls.draws.length,1,'Copy the displayed image before the first await');assert.equal(f.calls.draws[0][0],f.surface);
  const result=await pending;assert(result.size>0);assert.equal(f.calls.draws.length,2);assert.equal(f.calls.blobs,1);
  assert(progress.every(p=>p.indeterminate&&p.elapsedMs>=0));assert.match(progress.at(-1).phase,/Encoding/);
  assert.equal(f.calls.revoked.length,1);assert.equal(f.calls.images[0].onload,null);assert.equal(f.calls.images[0].source,'');assert.equal(f.calls.canvases[0].width,1);
 }
 for(const mode of ['never','error']){
  const f=fixture({overlayMode:mode}),progress=[],result=await f.presenter.capture(f.overlay,{timeoutMs:80,onProgress:p=>progress.push(p)});
  assert(result.size>0,'An optional SVG decoder failure preserves the complete scene');assert.equal(f.calls.draws.length,1,'Do not substitute an unready or blank overlay');
  assert(progress.some(p=>/without labels/.test(p.phase)));assert.match(progress.at(-1).warning,/Labels could not be included/);
  assert.equal(f.calls.blobs,1);assert.equal(f.calls.revoked.length,1);assert.equal(f.calls.images[0].onerror,null);assert.equal(f.calls.canvases[0].height,1);
 }
 for(const [mode,message] of [['never',/timed out encoding/],['empty',/empty picture/],['throw',/Encoder exception/]]){
  const f=fixture({encodeMode:mode});await assert.rejects(f.presenter.capture(null,{timeoutMs:15}),message);assert.equal(f.calls.canvases[0].width,1);
 }
 {
  const f=fixture({overlayMode:'never'}),controller=new AbortController(),pending=f.presenter.capture(f.overlay,{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.revoked.length,1);assert.equal(f.calls.canvases[0].width,1);
 }
 {
  const f=fixture({encodeMode:'never'}),controller=new AbortController(),pending=f.presenter.capture(null,{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(f.calls.canvases[0].width,1);
 }
 {
  const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(f.presenter.capture(null,{signal:controller.signal}),{name:'AbortError'});assert.equal(f.calls.canvases.length,0);
  f.surface.width=0;await assert.rejects(f.presenter.capture(),/No presented diagnostic/);
 }
}finally{for(const [key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
console.log('PASS: synchronous frame snapshot, bounded optional SVG fallback, PNG deadlines, phase/warning updates, cancellation, explicit empty/error rejection, and deterministic resource cleanup.');
