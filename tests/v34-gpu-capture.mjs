import assert from 'node:assert/strict';
import {waitForLiveFrame} from '../dist/photo-renderer.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {XRViewController} from '../dist/xr-view.js';
{
 const f=fixture({webgl2:false,completionQuery:true}),r=new BlackHoleRenderer(f.canvas,{autoStart:false});f.step(r,1000);assert(r.gpuFence.query);await waitForLiveFrame(r,null,performance.now()+100);assert.equal(r.gpuFence,null);assert.equal(f.calls.deleteQuery,1);assert.equal(f.calls.wait,0);assert.equal(f.calls.finish,0);r.dispose();
}
{
 const f=fixture({webgl2:false,completionQuery:true,gpuComplete:false}),r=new BlackHoleRenderer(f.canvas,{autoStart:false});f.step(r,1000);const fence=r.gpuFence,controller=new AbortController();setTimeout(()=>controller.abort(),12);await assert.rejects(waitForLiveFrame(r,controller.signal,performance.now()+100),{name:'AbortError'});assert.equal(r.gpuFence,fence,'Cancelled capture retains the unfinished query');assert.equal(f.calls.deleteQuery||0,0);r.dispose();
}
{
 const f=fixture({webgl2:false,completionQuery:true,gpuComplete:false}),r=new BlackHoleRenderer(f.canvas,{autoStart:false});f.step(r,1000);await assert.rejects(waitForLiveFrame(r,null,performance.now()+10),{name:'PhotoBudgetError'});assert(r.gpuFence.query);r.dispose();
}
// Quick stills also preserve query ownership; they encode the fresh buffer
// without accidentally calling WebGL2's fence API on a WebGL1 context.
{
 const f=fixture({webgl2:false,completionQuery:true}),r=new BlackHoleRenderer(f.canvas,{autoStart:false});f.step(r,1000);const blob=await r.captureImage();assert(blob.size);assert.equal(f.calls.fence,0);assert(r.gpuFence.query);r.dispose();
}
// A stereo submission is wrapped in a single completion query, and emergency
// pixel scaling changes its layer key rather than getting stuck at old Low.
{
 const f=fixture({webgl2:false,completionQuery:true}),r=new BlackHoleRenderer(f.canvas,{autoStart:false}),xr=new XRViewController(r);
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],layer={framebuffer:{},getViewport:()=>({x:0,y:0,width:100,height:100})};
 xr.active=true;xr.session={requestAnimationFrame(){},renderState:{baseLayer:layer}};xr.reference={};xr.updateLayer=()=>{};
 xr.renderFrame(1000,{getViewerPose:()=>({transform:{matrix:identity},views:[{transform:{matrix:identity},projectionMatrix:identity}]})});
 assert(r.gpuFence.query);assert.equal(f.calls.fence,0);assert.equal(f.control.activeQuery,null);r.dispose();
}
console.log('PASS: live query ownership survives photo cancellation/deadline; fresh Quick capture and XR use WebGL1 completion queries without WebGL2 fences.');
