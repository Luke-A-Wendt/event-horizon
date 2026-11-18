import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {combinedWarpEnvelope,shieldDemand,effectiveWarpRadius,warpDisplayStrength} from '../dist/warp-physics.js';
import {fixture} from './render-fixture.mjs';
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
for(const size of [{width:980,height:590},{width:340,height:680}]){
 const f=fixture(size),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 r.loadScene('warp-excursion');r.sceneLoad=null;r.state.paused=false;
 const craft=r.objects.find(o=>o.type==='enterprise'),distance=r.camera.focusDistance;
 let samples=0,starts=0,stops=0,furthest,closest;
 function pose(){
  r.fillHoles();r.fillObjects();r.updateCameraFrame();r.render(1000+samples);
  const field=r.annotationOptics.warp,body=r.getFocusFrame(craft.id),rad=field.radius/body.radius;
  const expected=combinedWarpEnvelope(r.state.warpFactor,shieldDemand(body.position,r.holeData,r.configCache.horizon));assert(Math.abs(rad-expected.radius)<1e-8);
  assert(field.enabled&&field.strength>0);
  assert(Math.abs(dot(r.cameraFrame.forward,body.frame[2]))<1e-6);
  assert(dot(r.cameraFrame.forward,body.frame[0])<-.999999,'camera stays on the same side of the hull on the return');
  assert.equal(r.camera.focusDistance,distance);
  const {width:w,height:h}=size,fov=.83*Math.max(1,1.35*h/w),wall=1.16*rad,diameter=2*h/fov*wall/Math.sqrt(distance**2-wall**2);
  assert(diameter<=Math.min(.85*w,.70*h),'entire visible wall fits in landscape or narrow portrait');
  assert(Math.hypot(...body.position)-field.radius*1.2>r.configCache.horizon[0]);
  assert.equal(field.radius,f.uniforms.get('uWarpRadius').args[0]);
  const patch=CpuRenderer.prototype.localWarpPatch.call(r,body);assert.equal(patch.radius,field.radius);assert.equal(patch.strength,field.strength);
  assert(Math.abs(rad-r.state.warpRadius)<1e-8);
  return {radius:rad,diameter,range:Math.hypot(...body.position)};
 }
 furthest=pose();
 for(let n=1;n<1000&&stops<2;n++){
  const before=!!r.transfer;r.advanceChartStages(.05);
  if(!before&&r.transfer)starts++;
  if(!r.transfer&&before){stops++;const p=pose();assert.equal(r.state.warpFactor,0);assert(r.state.warp);if(stops===1)closest=p;else assert(Math.abs(p.radius-furthest.radius)<1e-9);}
  if(r.transfer&&n%20===0){samples++;const p=pose();assert(p.radius>effectiveWarpRadius(r.state.warpFactor),'Drive and shielding both contribute during the flight');assert(r.annotationOptics.warp.strength>warpDisplayStrength(r.state.warpFactor));}
 }
 assert.equal(starts,2);assert.equal(stops,2);assert(closest.radius>furthest.radius);assert(closest.diameter>furthest.diameter);
 r.zoom(1.4);const chosen=r.target.focusDistance;for(let i=0;i<100;i++)r.advanceChartStages(.05);assert(Math.abs(chosen-r.target.focusDistance)<1e-8,'zoom survives the next leg');
 r.dispose();
}
console.log('PASS: full side-on Enterprise field, curvature shielding plus cruise propulsion, both zero-speed stops, portrait clearance and zoom override.');

// The two zero-velocity endpoints still have a hull attitude. Check the camera
// against that actual attitude, with orbit/look/zoom offsets applied, across
// deceleration, the parked 180° turn, and acceleration on the following leg.
const f=fixture({width:800,height:600}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 let clock=1000;r.now=()=>clock;r.loadScene('warp-excursion');r.sceneLoad=null;r.state.paused=true;
 const id=r.objects.find(o=>o.type==='enterprise').id,q=r.flightSequences[id],frame=()=>r.getFocusFrame(id);
 const sub=(a,b)=>a.map((v,i)=>v-b[i]),size=v=>Math.hypot(...v),angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
 const localView=()=>{const ship=frame(),cam=r.cameraFrame;return [sub(cam.observer,ship.position).map(x=>x/ship.radius),cam.forward,cam.right,cam.up].map(v=>ship.frame.map(axis=>dot(axis,v)));};
 const step=()=>{clock+=1000/30;r.advanceSimulation(clock);r.fillObjects();r.updateCameraFrame();};
 r.rotate(.37,.21);r.zoom(1.13);r.target.lookYaw=.12;r.target.lookPitch=-.07;for(let i=0;i<110;i++)step();
 const mount=localView(),initialCamera=[...r.cameraFrame.forward],turns=[];
 assert(Math.abs(mount[0][1])>1,'the adjusted elevation is visible');
 r.state.paused=false;let lastNose=[...frame().frame[2]],angleSteps=[],total=0,paused=false,anchor=null;
 for(let i=0;i<1500&&turns.length<2;i++){
  step();
  const view=localView(),ship=frame(),nose=[...ship.frame[2]],delta=angle(nose,lastNose);
  for(let j=0;j<view.length;j++)assert(size(sub(view[j],mount[j]))<3e-7,'locked camera offsets through the turn and flight handoffs: '+[i,j,size(sub(view[j],mount[j])),r.camera.focusDistance,r.target.focusDistance,r.camera.yaw,r.camera.lookYaw,r.cameraGuide]);
  assert(delta<.069,'no single-frame heading jump at 30 fps');
  if(q.pointTurn){
   anchor??=[...ship.position];assert(size(sub(ship.position,anchor))<1e-12,'yaw only after reaching the stop');
   assert.equal(r.state.warpFactor,0);angleSteps.push(delta);total+=delta;
   if(!paused&&angleSteps.length===40){
    const eye=[...r.cameraFrame.observer];r.state.paused=true;for(let n=0;n<6;n++)step();
    assert(size(sub(frame().frame[2],nose))<1e-12&&size(sub(r.cameraFrame.observer,eye))<1e-12,'pause freezes the ship and tracking camera');
    r.state.paused=false;paused=true;
   }
  }else if(angleSteps.length){
   total+=delta;const peak=Math.max(...angleSteps);
   assert(Math.abs(total-Math.PI)<1e-5,'one complete half-turn per endpoint');assert(angleSteps.length>=89&&angleSteps[1]<peak*.04&&angleSteps.at(-2)<peak*.04,'yaw eases in and out');
   turns.push([...r.cameraFrame.forward]);angleSteps=[];anchor=null;total=0;
  }
  lastNose=nose;
 }
 assert.equal(turns.length,2);assert(paused);
 assert(dot(initialCamera,turns[0])<-.80&&dot(initialCamera,turns[1])>.999999,'camera follows the first turn around the hull and returns after the second');
}finally{r.dispose();}
console.log('PASS: Beyond the Horizon eases through both stationary reversals; the tracking camera keeps orbit, look, and zoom relative to the hull.');
