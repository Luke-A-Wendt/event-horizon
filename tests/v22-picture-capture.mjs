import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {installRenderWorker} from '../dist/render-worker.js';

const make=(options={})=>{const f=fixture(options),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('disk');r.render();r.setPresentationPaused(true);return {f,r};};
// The fixture never dispatches RAF callbacks: capture must own its own frozen
// draw rather than hoping a covered live canvas receives an animation frame.
{
 const {f,r}=make(),time=r.time,draws=f.draws,progress=[];
 const blob=await r.captureImage({timeoutMs:500,onProgress:p=>progress.push(p)});
 assert(blob.size>0);assert.equal(f.draws,draws+1);assert.equal(r.time,time);assert.equal(r.presentationPaused,true);
 assert(progress.some(p=>/Capturing/.test(p.phase)));assert(progress.some(p=>/Encoding/.test(p.phase)));assert(progress.every(p=>p.indeterminate));
 assert.equal(r.captureRequest,null);r.dispose();
}
{
 const {f,r}=make();delete f.canvas.toBlob;let encoded=0;
 f.canvas.convertToBlob=async({type})=>{encoded++;assert.equal(type,'image/png');return new Blob(['offscreen PNG'],{type});};
 assert((await r.captureImage({timeoutMs:500})).size>0);assert.equal(encoded,1);r.dispose();
}
for(const mode of ['never','reject','empty']){
 const {f,r}=make();delete f.canvas.toBlob;
 f.canvas.convertToBlob=()=>mode==='never'?new Promise(()=>{}):mode==='reject'?Promise.reject(new Error('Recorded encoder failure')):Promise.resolve(new Blob([]));
 await assert.rejects(r.captureImage({timeoutMs:60}),mode==='never'?/encoding timed out/:mode==='reject'?/Recorded encoder failure/:/empty PNG/);
 assert.equal(r.captureRequest,null,'Encoding remains owned until it succeeds, fails, or times out');assert.equal(r.presentationPaused,true);r.dispose();
}
{
 const {f,r}=make(),controller=new AbortController();let finish;
 f.canvas.toBlob=callback=>{finish=callback;queueMicrotask(()=>controller.abort());};
 await assert.rejects(r.captureImage({signal:controller.signal,timeoutMs:500}),{name:'AbortError'});
 assert.equal(r.captureRequest,null);finish(new Blob(['late image']));await Promise.resolve();assert.equal(r.captureRequest,null);r.dispose();
}
{
 const {f,r}=make({parallelCompile:true});f.control.compileComplete=false;r.setQuality('ultra');
 assert((await r.captureImage({allowPreview:true,timeoutMs:500})).size>0,'Quick captures the live compatible image while the optional Ultra shader prepares');
 assert.equal(f.control.lastCapture.steps,256,'The baseline uses the complete live High preview, not an unfinished Ultra program');
 assert.equal(r.quality,'ultra');assert.equal(r.activeProgram.features.ultra,false);r.dispose();
}
{
 const {f,r}=make({parallelCompile:true}),progress=[];f.control.compileComplete=false;r.setQuality('ultra');
 await assert.rejects(r.captureImage({timeoutMs:60,onProgress:p=>progress.push(p)}),/waiting for the GPU/);
 assert(progress.some(p=>/Preparing/.test(p.phase)));assert.equal(r.captureRequest,null);r.dispose();
}
{
 const {f,r}=make();f.control.gpuComplete=false;const draws=f.draws;
 await assert.rejects(r.captureImage({timeoutMs:60}),/waiting for the GPU/);
 assert.equal(f.draws,draws,'Never enqueue another draw behind a stalled GPU fence');assert.equal(f.calls.finish,0);r.dispose();
}

// Exercise the worker transaction separately from GPU contracts. Cancellation
// applies during baseline capture, and a new state is restored only afterwards.
{
 const messages=[];
 class RecordingRenderer{
  constructor(canvas){this.canvas=canvas;this.gl={};this.ready=true;this.objects=[];this.state={};this.quality='high';this.budget={};}
  getState(){return {fps:30,effectiveQuality:'high'};}resize(){}setQuality(q){this.quality=q;}refreshConfiguration(){}fillHoles(){}fillObjects(){}updateCameraFrame(){}
  setPresentationPaused(v){this.presentationPaused=v;}cancelCapture(){}dispose(){}now(){return 0;}
  captureImage({signal,onProgress}){onProgress({phase:'Encoding current frame…',indeterminate:true});return new Promise((resolve,reject)=>{this.finish=resolve;signal.addEventListener('abort',()=>reject(Object.assign(Error('Cancelled'),{name:'AbortError'})),{once:true});});}
 }
 const scope={postMessage:m=>messages.push(m),addEventListener(){},close(){}};
 const c=installRenderWorker(scope,{GpuRenderer:RecordingRenderer});
 await c.handle({type:'init',canvas:{width:640,height:480,toBlob(){}},viewport:{width:640,height:480,dpr:1},signature:'first'});
 await c.handle({type:'state',serial:1,signature:'first',presentationPaused:true,snapshot:{state:{mass:4}}});
 const capture=c.handle({type:'capture',id:10});assert(messages.some(m=>m.type==='progress'&&m.id===10));
 await c.handle({type:'cancel-photo',id:10});await capture;
 assert(messages.some(m=>m.type==='error'&&m.id===10&&m.name==='AbortError'));assert.equal(c.renderer.presentationPaused,true);
 const next=c.handle({type:'capture',id:11});
 await c.handle({type:'state',serial:2,signature:'second',presentationPaused:true,snapshot:{state:{mass:9}}});
 await next;assert.equal(c.renderer.state.mass,9);assert(messages.some(m=>m.type==='ack'&&m.serial===2));assert(messages.some(m=>m.type==='error'&&m.id===11&&m.name==='AbortError'));
 await c.handle({type:'dispose'});
}
console.log('PASS: RAF-independent frozen capture, covered-view capture, native OffscreenCanvas encoding, encoder timeout/cancellation, honest live-preview baseline, bounded compiler/fence waits, and worker capture ownership.');
