import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {apparentCaptureAngle} from '../dist/camera-framing.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';

const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=v=>v.map(x=>x/Math.hypot(...v));
const diff=(a,b)=>a.map((x,i)=>x-b[i]),angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
const near=(value,want,tol,label)=>assert(Math.abs(value-want)<tol,label+': '+value+' vs '+want);

for(const viewport of [{width:1440,height:800},{width:390,height:740}]){
 const r=new BlackHoleRenderer(fixture(viewport).canvas,{autoStart:false,bindControls:false});
 r.loadScene('radiant-descent');
 
 const at=t=>{r.time=t;r.fillObjects();r.updateCameraFrame();return r.cameraFrame;};
 const sample=t=>{
  const f=at(t),b=r.getFocusFrame(),eye=diff(f.observer,b.position),towardHole=unit(f.observer.map(v=>-v));
  // The avatar remains visible through the near and far parts of the new
  // orbit: lens outside the horizon, aimed at the subject, same physical framing.
  assert.equal(r.focusMode,'track');assert.equal(f.inspectIndex,b.index);assert.equal(f.hideIndex,-1);
  near(Math.hypot(...eye)/b.radius,9,1.5e-4,'distance in suit radii');
  assert(dot(unit(eye),f.forward)<-.9999999);assert(Math.hypot(...f.observer)>r.configCache.horizon[0]);
  assert(r.validateFrameGeometry());
  return {f,b,towardHole};
 };
 let previous=null;
 for(let i=0;i<=600;i++){
  const {f,towardHole}=sample(i/60);
  near(angle(towardHole,f.forward),apparentCaptureAngle(Math.hypot(...f.observer),r.massScale),3e-7,'apparent edge');
  assert(dot(towardHole,f.right)<0,'shadow on the left, aiming at its right edge');
  if(previous)assert(angle(previous,f.forward)<.032,'no cut or flip during the approach');
  previous=f.forward;
 }
 const stopped=[...r.getFocusFrame().position],atStop=at(10).forward;
 near((Math.hypot(...stopped)-r.configCache.horizon[0])*RG,15,.001,'nominal stop clearance in meters');
 assert(angle(atStop,at(10.05).forward)<.0001); // zero angular speed at the handoff
 let minCos=1,maxCos=-1;
 for(let t=10;t<110;t+=.25){
  const {f,b,towardHole}=sample(t),cos=dot(towardHole,f.forward);
  minCos=Math.min(minCos,cos);maxCos=Math.max(maxCos,cos);
  assert.deepEqual(b.position,stopped,'only the camera moves once the explorer stops');
 }
 assert(minCos<-.90&&maxCos>.90,'continuous full circles include outward sky and inward shadow');
 const phase=at(30).forward;near(dot(phase,at(62).forward),1,1e-10,'complete repeat after 32s');
 r.update({paused:true});const frozen=r.time;r.advanceSimulation(1e3);r.advanceSimulation(1500);r.updateCameraFrame();assert.equal(r.time,frozen);near(dot(r.cameraFrame.forward,phase),1,1e-10,'pause freezes orbit');
 const saved=snapshotRenderer(r),file=parseScene(serializeScene(r));assert.equal(file.cameraGuide,'blue-fire-edge');
 const before=[...r.cameraFrame.forward];r.rotate(.035,0);r.camera={...r.target};r.updateCameraFrame();
 near(angle(before,r.cameraFrame.forward),.035*Math.cos(r.camera.pitch),.001,'drag releases the current pose');assert.equal(r.cameraGuide,null);
 r.resetCamera();near(dot(r.cameraFrame.forward,before),1,1e-10,'reset at the current phase');
 restoreRenderer(r,saved);r.updateCameraFrame();near(dot(r.cameraFrame.forward,before),1,1e-10,'worker restoration');
 r.loadScene('horizon-watch');assert.equal(r.focusMode,'onboard');assert.equal(r.cameraGuide,null);
 r.dispose();
}
console.log('PASS: Blue Fire tracks a visible, centered astronaut through the right apparent limb; 15m exterior stop, smooth arrival, repeatable full camera orbits, pause, drag, reset and saved state on desktop and portrait.');
