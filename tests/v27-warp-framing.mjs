import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {warpSideFraming} from '../dist/camera-framing.js';

const near=(a,b,message)=>assert(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`);
for(const Renderer of [BlackHoleRenderer,CpuRenderer])for(const [width,height]of [[1440,806],[360,520]]){
 const f=fixture({width,height}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 window.innerWidth=width;window.innerHeight=height;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('warp-lab');const id=r.focusId;
 r.setFreeDrive(id,true);r.focusTarget(id,'track',false,true);r.state.paused=true;
 const step=(count=180)=>{for(let i=0;i<count;i++){r.advanceSimulation((r.lastTime||1000)+16.667);r.fillObjects();r.updateCameraFrame();}};
 const fit=()=>warpSideFraming(width,height,r.state.warpFactor,{enabled:r.state.warp,driving:true,yaw:r.target.yaw,pitch:r.target.pitch,lookYaw:r.target.lookYaw,lookPitch:r.target.lookPitch});
 const fitted=()=>{step();near(r.camera.focusDistance,fit().distance,'Bubble/hull reaches its fitted size');assert(r.validateFrameGeometry());};

 // Previously a sideways look produced distance:null and left warp-zero at
 // the distant warp-nine zoom, even after using the actual throttle control.
 r.setFlightPower(9);fitted();const far=r.camera.focusDistance;
 r.look('tangent');assert.equal(r.cameraGuide,'warp-side');const yaw=r.target.yaw,pitch=r.target.pitch;
 r.setFlightPower(0);fitted();assert(r.camera.focusDistance<far*.4);
 near(r.camera.lookYaw,0,'Impossible pan recenters');near(r.camera.yaw,yaw,'Orbit angle retained');near(r.camera.pitch,pitch,'Orbit elevation retained');
 for(const [yawDelta,pitchDelta]of [[Math.PI/2,0],[Math.PI/2,0],[0,.8],[-Math.PI/2,0],[-Math.PI/2,-.8]]){
  r.rotate(yawDelta,pitchDelta);
  for(let i=0;i<120;i++){
   step(1);const actual=warpSideFraming(width,height,0,{driving:true,yaw:r.camera.yaw,pitch:r.camera.pitch});
   assert(r.camera.focusDistance>=actual.distance-1e-5,'Hull clears the HUD throughout the eased orbit, not only at its destination');
  }
 }
 r.camera.lookYaw=r.target.lookYaw=.015;r.camera.lookPitch=r.target.lookPitch=.01;
 r.update({warpFactor:5});fitted();near(r.camera.lookYaw,.015,'Viable pan retained');near(r.camera.lookPitch,.01,'Viable look elevation retained');

 // Manual zoom remains available while the field is unchanged. A changing
 // field, including automatic braking, always resumes its linked size fit.
 r.rotate(.25,.1);assert.equal(r.cameraGuide,'warp-side');r.setFlightPower(9);fitted();
 r.zoom(1.3);step();const manual=r.camera.focusDistance;assert.equal(r.cameraGuide,null);
 step();near(r.camera.focusDistance,manual,'Unchanged warp does not fight manual zoom');
 r.state.paused=false;r.brakeFlight('speed');step(1800);near(r.state.warpFactor,0,'Stop motion reaches zero');fitted();assert(r.camera.focusDistance<manual*.4);
 r.setFlightPower(8);fitted();r.zoom(1.3);step();r.resetFlight();fitted();near(r.state.warpFactor,0,'Reset fits the hull');
 r.state.paused=true;r.setFlightPower(5);fitted();r.zoom(1.3);step();r.setObjectWarp(id,false);fitted();
 assert(r.camera.focusDistance<manual*.4,'Disabling the intrinsic field fits the ship');r.setObjectWarp(id,true);fitted();

 // An intentional onboard view is not silently replaced by an external view.
 for(const mode of ['onboard','chase']){r.focusTarget(id,mode);r.setFlightPower(7);step();assert.equal(r.focusMode,mode);}
 r.dispose();
}
console.log('PASS: GPU/CPU desktop/mobile warp fitting after look, orbit, manual zoom, property/flight sliders, Stop motion, reset and intrinsic field toggles; onboard and Chase choices preserved.');
