import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {RenderHost} from '../dist/render-host.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {advanceAutopilot} from '../dist/autopilot.js';
import {fixture} from './render-fixture.mjs';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
for(const [width,height] of [[1280,776],[390,676],[320,504],[740,260]]){
 const r=new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');r.updateCameraFrame();
 const craft=r.getFocusFrame(r.focusId),parent=r.getFocusFrame(r.objects.find(o=>o.id===craft.id).parentId),view=r.cameraFrame,delta=sub(craft.position,view.observer),depth=dot(delta,view.forward),fov=.83*Math.max(1,1.35*height/width),aspect=width/height;
 const x=dot(delta,view.right)/depth/fov/aspect,y=dot(delta,view.up)/depth/fov;
 assert(Math.abs(x)<.2&&Math.abs(y)<.08,'Craft stays near center, with horizontal margins');
 assert(depth>craft.radius*1.15&&depth<craft.radius*16,'Craft fits compact and wide views');
 assert(r.parkedCamera&&!r.parkedCamera.released,'Authored reset does not masquerade as a user gesture');
 const parentDirection=sub(parent.position,view.observer),parentDepth=dot(parentDirection,view.forward),miss=Math.hypot(...parentDirection.map((v,i)=>v-parentDepth*view.forward[i]));assert(parentDepth>0&&Math.abs(miss/parent.radius-1)<1e-5&&dot(parentDirection,view.right)<0,'Planet limb centered, planet left');
 assert(dot(craft.frame[1],view.up)>.95,'Vehicle and screen-up share the orbital plane normal, without a sideways roll');
 r.camera.yaw=r.target.yaw+=.2;r.updateCameraFrame();assert(r.parkedCamera.released,'Manual orbit releases automatic composition');const yaw=r.target.yaw;r.updateCameraFrame();assert.equal(r.target.yaw,yaw);
 r.dispose();
}
// Exercise the actual host's compact packet path while the global time is fixed.
// A full-orbit dwell changes only the controlled craft's phase/epoch.
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('shuttle-earth-moon-loop');r.state.paused=false;
const craft=r.objects.find(o=>o.type==='shuttle'),worker=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});restoreRenderer(worker,snapshotRenderer(r));const catalog=worker.objects;
const packets=[];Object.assign(r,{workerReady:true,workerAssetsSent:true,mailbox:{inflight:false,push:p=>packets.push(p)},hostViewport:{width:900,height:650,dpr:1},controlRevision:1});
RenderHost.prototype.queueSnapshot.call(r);packets.length=0;
advanceAutopilot(r,.1);RenderHost.prototype.queueSnapshot.call(r);assert.equal(packets.length,1,'Orbit-only motion schedules a new render packet');
const packet=packets[0];assert(!packet.snapshot.objects,'Dwell never recopies the entire planetary catalog');assert.deepEqual(packet.snapshot.objectUpdates.map(o=>o.id),[craft.id]);restoreRenderer(worker,packet.snapshot);assert.strictEqual(worker.objects,catalog);
assert.equal(worker.objects.find(o=>o.id===craft.id).phase,craft.phase);r.fillObjects();assert(Math.hypot(...sub(worker.getFocusFrame(craft.id).position,r.getFocusFrame(craft.id).position))<1e-10,'Worker and host render the same orbit phase');
worker.dispose();r.dispose();
console.log('PASS: initial orbit composition, parent-directed framing and level orbital attitude, portrait/landscape framing, manual camera override, and compact worker transport of full-orbit phase changes.');
