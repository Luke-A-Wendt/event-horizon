import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {warpSideFraming,warpViewObstacles} from '../dist/camera-framing.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),near=(a,b,t=1e-6)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
for(const [width,height,cssWidth,cssHeight] of [[1440,806,1460,1000],[960,632,980,800],[390,740,390,900],[360,520,360,680],[558,190,568,320],[600,410,620,550]]){
 const f=fixture({width,height});window.innerWidth=cssWidth;window.innerHeight=cssHeight;
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('warp-lab');const id=r.focusId;
 r.setFreeDrive(id,true);r.focusTarget(id,'track',false,true);r.state.paused=true;
 const settle=()=>{for(let i=0;i<180;i++){r.advanceSimulation((r.lastTime||1000)+16.667);r.fillObjects();r.updateCameraFrame();}};
 for(const power of [4,5,9.9999,0,.1,0]){
  r.setFlightPower(power);settle();const fit=warpSideFraming(width,height,r.state.warpFactor,{enabled:true,driving:true,cssWidth,cssHeight});
  near(r.camera.focusDistance,fit.distance);near(r.camera.yaw,-Math.PI/2);assert.equal(r.focusMode,'track');
  const body=r.getFocusFrame(),cam=r.cameraFrame;assert(dot(body.frame[2],cam.right)>.99999,'Bow points right');
  const q=body.position.map((v,i)=>v-cam.observer[i]),depth=dot(q,cam.forward);near(dot(q,cam.right)/depth,0,1e-5);near(dot(q,cam.up)/depth,0,1e-5);
  if(power>0){const R=fit.radius*body.radius,pixels=height/fit.fov*R/Math.sqrt(depth*depth-R*R);near(pixels,fit.pixels,2e-3);for(const [x0,y0,x1,y1] of fit.obstacles){const gap=Math.hypot(Math.max(x0-width/2,0,width/2-x1),Math.max(y0-height/2,0,height/2-y1));assert(gap-pixels>=fit.margin-1e-3,'Bubble clears closed HUD controls');}}
  else{
   const points=[];for(const x of [-.416,.416])for(const y of [-.264,.194])for(const z of [-.921,.921]){const p=[x,y,z].map((_,i)=>q[i]+body.radius*(body.frame[0][i]*x+body.frame[1][i]*y+body.frame[2][i]*z)),d=dot(p,cam.forward);points.push([width/2+height/fit.fov*dot(p,cam.right)/d,height/2-height/fit.fov*dot(p,cam.up)/d]);}
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),box=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
   assert(box[0]>=11.99&&box[1]>=11.99&&box[2]<=width-11.99&&box[3]<=height-11.99);
   for(const [a,b,c,d]of fit.obstacles)assert(!(box[2]+11.99>a&&box[0]-11.99<c&&box[3]+11.99>b&&box[1]-11.99<d),'Hull clears closed HUD controls');
   assert(box[2]-box[0]>width*.3,'Zero warp actually inspects the hull rather than preserving bubble distance');
  }
 }
 r.setFlightPower(9);settle();const far=r.camera.focusDistance;r.setFlightPower(0);assert(r.target.focusDistance<r.camera.focusDistance);assert.equal(r.camera.focusDistance,far,'Zoom in is eased, not snapped');settle();
 r.rotate(.22,.08);r.zoom(1.2);assert.equal(r.cameraGuide,null);r.camera={...r.target};r.setFlightPower(4);assert.equal(r.cameraGuide,'warp-side');near(r.camera.yaw,r.target.yaw);near(r.camera.pitch,r.target.pitch);
 const yaw=r.camera.yaw,pitch=r.camera.pitch;r.update({warpFactor:5});assert.equal(r.cameraGuide,'warp-side');near(r.camera.yaw,yaw);near(r.camera.pitch,pitch);
 r.camera.lookYaw=r.target.lookYaw=.05;r.camera.lookPitch=r.target.lookPitch=.02;r.setFlightPower(6);near(r.camera.lookYaw,.05);near(r.camera.lookPitch,.02);assert(Number.isFinite(r.camera.focusDistance));
 const saved=snapshotRenderer(r);restoreRenderer(r,saved);near(r.target.focusDistance,saved.target.focusDistance);assert.equal(r.cameraGuide,'warp-side');
 r.focusTarget(id,'track',false,true);r.rotate(.1,0);assert.equal(r.cameraGuide,'warp-side');r.zoom(1.2);r.state.paused=false;r.setFlightInput({speed:1});r.advanceSimulation((r.lastTime||1000)+16.667);assert.equal(r.cameraGuide,'warp-side','Keyboard warp adjustment resumes fitting too');r.setFlightInput({});
 r.focusTarget(id,'onboard');r.setFlightPower(5);assert.equal(r.focusMode,'onboard');r.focusTarget(id,'chase');r.setFlightPower(4);assert.equal(r.focusMode,'chase');
 r.dispose();
}
const small=warpViewObstacles(558,190,true,568,320);assert(small.some(([x0,y0,x1,y1])=>x0<=340&&x1>=545&&y0<=17&&y1>=49),'Reserve the full right-side performance pill plus fullscreen, not fullscreen alone');assert(!small.some(([a,b,c,d])=>279>=a&&279<=c&&95>=b&&95<=d),'Short-landscape center stays clear');
assert.notDeepEqual(warpViewObstacles(600,410,true,620,550),warpViewObstacles(600,410,true,600,410),'Browser CSS size, not canvas size, selects HUD breakpoint');
console.log('PASS: dynamic bubble/hull fit at warp0/0.1/4/5/max, exact right-facing defaults/Drive, smooth shrink and safe growth, manual angle/mode preservation, slider/keyboard-ready guide, snapshot stability, and short/browser-breakpoint HUD bounds.');
