import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {beginRoute,advanceRoute,cancelRoute} from '../dist/travel-routes.js';
import {advanceAutopilot,advanceBridgeAutopilot} from '../dist/autopilot.js';
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),unit=a=>a.map(v=>v/Math.hypot(...a));
const close=(a,b,e=1e-7)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`);
for(const [width,height]of [[1280,840],[390,740]])for(const scene of ['shuttle-earth-moon-loop','test-shuttle-bridge']){
 const r=new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false});r.loadScene(scene);r.state.paused=false;
 const craft=r.objects.find(o=>o.type==='shuttle');r.selectedId=craft.id;
 if(r.state.bridge){for(let i=0;i<120;i++)advanceAutopilot(r,.1);}else assert(beginRoute(r,r.objects.find(o=>o.name==='Moon').id));
 let previous;
 const projection=(point,frame)=>{const d=sub(point,frame.observer),z=dot(d,frame.forward),fov=.83*Math.max(1,1.35*height/width);return {x:dot(d,frame.right)/z/fov/(width/height),y:dot(d,frame.up)/z/fov,z,fov};};
 const dt=r.transfer.wallSeconds/600;for(let i=0;i<599;i++){
  if(r.state.bridge)advanceBridgeAutopilot(r,dt);else advanceRoute(r,dt);r.fillObjects();r.updateCameraFrame();
  const frame=r.cameraFrame,body=r.getFocusFrame(craft.id),p=projection(body.position,frame);
  assert(p.z>body.radius&&Math.abs(p.x)+body.radius/p.z/p.fov/(width/height)<.48&&Math.abs(p.y)+body.radius/p.z/p.fov<.48,`${scene} craft stays inside ${width}×${height} at ${i/10}s`);
  if(i>50){const point=body.position.map((v,j)=>v+r.transfer.cameraAimOffset[j]),ahead=projection(point,frame);assert(Math.abs(ahead.x)<.16&&ahead.y>-.02&&ahead.y<.18,`Lookahead stays upper-middle: ${scene} ${i/10}s ${width}×${height}: ${ahead.x}, ${ahead.y}`);}
  if(previous&&i>240&&i<360)assert(Math.acos(Math.max(-1,Math.min(1,dot(previous,frame.forward))))<.09,'Midpoint camera cannot spin with the reversing nose');
  previous=[...frame.forward];assert(r.validateFrameGeometry());
 }
 assert.equal(r.focusMode,'track');assert.equal(r.state.viewMode,'orbit');
 const before=structuredClone(r.cameraFrame),body=r.getFocusFrame(craft.id);r.camera.yaw=r.target.yaw+=.3;r.updateCameraFrame();assert(Math.hypot(...sub(before.observer,r.cameraFrame.observer))>body.radius*.1,'Manual orbit still moves around shuttle');
 const direction=[...r.cameraFrame.forward];r.camera.lookYaw=r.target.lookYaw+=.2;r.updateCameraFrame();assert(dot(direction,r.cameraFrame.forward)<.99,'Manual look still responds');
 const zoomDistance=Math.hypot(...sub(r.cameraFrame.observer,body.position));r.camera.focusDistance=r.target.focusDistance*=1.2;r.updateCameraFrame();assert(Math.hypot(...sub(r.cameraFrame.observer,body.position))>zoomDistance*1.19,'Manual zoom remains available');
 const cancel=structuredClone(r.cameraFrame);cancelRoute(r);r.updateCameraFrame();for(const key of ['forward','right','up'])close(dot(cancel[key],r.cameraFrame[key]),1);close(Math.hypot(...sub(cancel.observer,r.cameraFrame.observer)),0);r.dispose();
}
console.log('PASS: local trailing/elevated transfer camera, desktop/portrait craft bounds, upper-middle path framing, bounded midpoint turn, live orbit/look/zoom, and full-pose cancel continuity for ordinary and bridge flights.');
