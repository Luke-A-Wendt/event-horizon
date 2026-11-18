import assert from 'node:assert/strict';
import {meridionalClockMotion,compactTrackLoadG} from '../dist/crew-load.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';
const c=299792458,g0=9.80665,rg=5e9,T=18*REFERENCE_RG_METERS/c;
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),a+' vs '+b);
for(const a of [0,.75]){
 const src={spinParameter:a,horizonMeters:rg*(1+Math.sqrt(1-a*a)),positionMeters:[0,0,0],spinAxis:[0,1,0]};
 for(const x of [2.1,6,100]){
  const r=rg*x,C=.3,S=Math.sqrt(1-C*C),hover=meridionalClockMotion(src,r*S,r*C);
  near(hover.speedMetersPerSecond,0);near(hover.accelerationG,0);
  near(hover.requiredSupportG,compactTrackLoadG(src,[r*S,r*C,0],0));
  if(a===0){
   const v=-c*Math.sqrt(2/x),acc=-c*c/(rg*x*x),drop=meridionalClockMotion(src,r*S,r*C,v*S,v*C,acc*S,acc*C);
   // Schwarzschild radial geodesic, energy 1: weightless all the way in.
   near(drop.crewLoadG,0,1e-6);near(drop.speedMetersPerSecond,Math.abs(v));near(drop.kinematicFactor,1/Math.sqrt(1-2/x));
  }
 }
}
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true}),r=make(),copy=make();
try{
 r.loadScene('radiant-descent');const id=r.focusId,obj=r.objects.find(o=>o.id===id),read=()=>r.getObjectClock(id);
 r.sceneLoad=null;r.state.speed=1;r.state.paused=false;r.lastTime=100;
 const start=read();assert(start.speedMetersPerSecond>.1*c&&start.speedMetersPerSecond<c&&start.accelerationG>0&&start.crewLoadG>0);
 const states=[start];for(let i=1;i<=100;i++){
  r.advanceSimulation(100+i*100);if(i%10===0)states.push(read());
 }
 assert(states.every(s=>s.speedMetersPerSecond>=0&&s.speedMetersPerSecond<c&&Number.isFinite(s.crewLoadG)&&Number.isFinite(s.rateFactor)));
 assert(states[3].speedMetersPerSecond>states[6].speedMetersPerSecond);assert(read().approachHeld&&read().speedMetersPerSecond>0&&read().accelerationG>0);
 assert(read().requiredSupportG>8&&read().rateFactor>1);near(read().properSeconds,10*T);
 const held=read();near(held.horizonGapMeters,15,.0001);assert.equal(held.properSecondsPerWallSecond,0);
 const pose=()=>{r.updateCameraFrame();return [...r.cameraFrame.forward];},initialPose=pose();
 for(let i=101;i<=520;i++){r.advanceSimulation(100+i*100);if(i%30===0)assert.deepEqual(read(),held);}
 assert.equal(r.time,10);assert(r.gapOrbitTime>40);assert.notDeepEqual(pose(),initialPose);
 const frozenPose=pose(),phase=r.gapOrbitTime;r.state.paused=true;r.advanceSimulation(52200);assert.equal(r.gapOrbitTime,phase);assert.deepEqual(pose(),frozenPose);
 restoreRenderer(copy,parseScene(serializeScene(r)));assert.deepEqual(copy.getObjectClock(id),held);near(copy.gapOrbitTime,phase);
 r.focusTarget('primary','track');r.focusTarget(obj.id,'track');assert.deepEqual(read(),held);
 r.loadScene('horizon-watch');const watch=r.getObjectClock(r.focusId);near(watch.speedMetersPerSecond,0);near(watch.accelerationG,0);assert(watch.crewLoadG>8);
 r.loadScene('bridge');r.setBridgeTraveler('astronaut');r.update({bridgeTravel:true});r.time=4;r.fillObjects();const bridgeId=r.bridgeObjectId;
 const moving=r.getObjectClock(bridgeId);assert(moving.bridgeObserverClock&&moving.speedMetersPerSecond>0&&moving.accelerationG>0);
 r.update({bridgeTravel:false});near(r.getObjectClock(bridgeId).speedMetersPerSecond,0);
 console.log('PASS: timelike astronaut speed, exact Schwarzschild free fall vs supported Kerr hover, evolving Blue Fire trajectory, frozen arrival telemetry and independent camera orbit, pause, saved exposure and camera changes.');
}finally{r.dispose();copy.dispose();}
