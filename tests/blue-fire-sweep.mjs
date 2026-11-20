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
  assert.equal(r.focusMode,'onboard');assert.equal(f.hideIndex,b.index);
  assert(Math.hypot(...eye)<b.radius);
  assert(r.validateFrameGeometry());
  return {f,b,towardHole};
 };
 let previous=null,previousStep=0;
 const sceneScale=r.simulationTimeScale();
 for(let i=0;i<=Math.round(600/sceneScale);i++){
  const {f,b,towardHole}=sample(i/60*sceneScale);
  // Test the physical suit, not just helmet pitch. Throughout the emitting
  // annulus its path clears even the shader's five-scale-height cutoff.
  const m=r.massScale,disc=r.configCache.primaryDiscAxis,alt=dot(b.position,disc)/m;
  const R=Math.hypot(...b.position)/m,cyl=Math.sqrt(Math.max(0,R*R-alt*alt));
  if(R>=r.configCache.isco[0]){
   assert(alt/R>.10,'the upper face remains visible all the way through the inner disc edge');
   if(cyl<=r.configCache.diskOuter[0]/m&&cyl>=r.configCache.isco[0]){
    assert(alt>5*.075*r.state.diskThickness*(1+.06*cyl),'descent stays above the gas');
   }
  }
  if(i<=390)near(angle(towardHole,f.forward),apparentCaptureAngle(Math.hypot(...f.observer),r.massScale),3e-7,'apparent edge');
  if(i<=390)assert(dot(towardHole,f.right)<0,'shadow on the left, aiming at its right edge');
  if(previous){
   // The physical infall follows Kerr frame dragging. Limit each playback step
   // as well as the change between steps; the incoming shot must ease into hold.
   const step=angle(previous,f.forward);
   assert(step<.15,'continuous helmet orientation at 60 Hz');
   previousStep=step;
  }
  previous=f.forward;
 }
 const final=sample(9.99);
 assert(dot(final.f.forward,final.towardHole)<-.7,'outward view before reset');
 assert(Math.hypot(...final.f.observer)>r.configCache.horizon[0]);
 r.sceneLoad=null;r.state.paused=false;r.time=0;r.lastTime=1000;
 for(let tick=1;tick<=301;tick++)r.advanceSimulation(1000+tick*1000/30);
 near(r.time,1/30,1e-7,'replay duration');
 r.time=9.99;r.fillObjects();r.updateCameraFrame();
 const saved=snapshotRenderer(r),file=parseScene(serializeScene(r));assert.equal(file.cameraGuide,'blue-fire-edge');
 const before=[...r.cameraFrame.forward];r.rotate(.035,0);r.camera={...r.target};r.updateCameraFrame();
 assert(angle(before,r.cameraFrame.forward)>.001);assert.equal(r.cameraGuide,null);
 r.resetCamera();near(dot(r.cameraFrame.forward,before),1,1e-10,'reset at the current phase');
 restoreRenderer(r,saved);r.updateCameraFrame();near(dot(r.cameraFrame.forward,before),1,1e-10,'worker restoration');
 r.loadScene('horizon-watch');assert.equal(r.focusMode,'onboard');assert.equal(r.cameraGuide,null);
 r.dispose();
}
console.log('PASS: Blue Fire helmet view, approach, outward look and ten-second loop, look controls and reset.');
