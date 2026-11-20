import assert from 'node:assert/strict';
import {meridionalClockMotion,compactTrackLoadG} from '../dist/crew-load.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';
const c=299792458,g0=9.80665,rg=5e9;
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
 const start=read();near(start.speedMetersPerSecond,0);near(start.crewLoadG,0);
 assert.equal(start.lagSeconds,0);assert(start.rateFactor>1,'Gravity affects the clock even at release from rest');
 let previous=start,half;
 const arrivalTicks=Math.round(100/r.simulationTimeScale());
 for(let i=1;i<=arrivalTicks;i++){
  r.advanceSimulation(100+i*100);const q=read();
  assert(q.speedMetersPerSecond>previous.speedMetersPerSecond&&q.speedMetersPerSecond<c,'Local speed grows continuously during free fall');
  assert(q.rateFactor>=previous.rateFactor&&Number.isFinite(q.rateFactor));
  near(q.crewLoadG,0);near(q.feltParallel,0);near(q.feltPerp,0);assert.equal(q.highGExposureSeconds,0);
  // For zero axial angular momentum the conserved energy per rest mass is αγ,
  // where 1/α is the gravitational clock factor relative to infinity.
  near(q.kinematicFactor/q.gravityFactor,1/start.gravityFactor,2e-6);
  near(q.rateFactor,q.kinematicFactor*q.gravityFactor,2e-6);
  assert(q.properSeconds>=previous.properSeconds&&q.lagSeconds>=previous.lagSeconds);
  near(q.properSeconds+q.lagSeconds,q.coordinateSeconds,1e-8);
  const distant=q.coordinateSeconds-previous.coordinateSeconds,proper=q.properSeconds-previous.properSeconds;
  // Differences near the cutoff are a fraction of a nanosecond on a clock already hours old.
  const ulp=4*Number.EPSILON*Math.max(1,q.properSeconds,q.coordinateSeconds/previous.rateFactor);
  assert(proper>=distant/q.rateFactor-ulp&&proper<=distant/previous.rateFactor+ulp,'Integrated clocks have the same rates as the instrument');
  if(i*2===arrivalTicks)half={time:r.time,clock:q};
  previous=q;
 }
 assert(read().approachHeld&&read().speedMetersPerSecond>.99*c);near(read().requiredSupportG,0);
 const held=read();near(held.horizonGapMeters,15,.0001);assert.equal(held.properSecondsPerWallSecond,0);
 const pose=()=>{r.updateCameraFrame();return [...r.cameraFrame.forward];},initialPose=pose();
 for(let i=arrivalTicks+1;i<=arrivalTicks+420;i++){r.advanceSimulation(100+i*100);if(i%30===0)assert.deepEqual(read(),held);}
 assert.equal(r.time,10);assert(r.gapOrbitTime>40);assert.notDeepEqual(pose(),initialPose);
 const frozenPose=pose(),phase=r.gapOrbitTime;r.state.paused=true;r.advanceSimulation(200+(arrivalTicks+420)*100);assert.equal(r.gapOrbitTime,phase);assert.deepEqual(pose(),frozenPose);
 restoreRenderer(copy,parseScene(serializeScene(r)));assert.deepEqual(copy.getObjectClock(id),held);near(copy.gapOrbitTime,phase);
 // A faster presentation reaches the same events and onboard timestamps earlier.
 copy.loadScene('radiant-descent');copy.sceneLoad=null;copy.state.speed=2;copy.state.paused=false;copy.lastTime=100;
 const copyClock=()=>copy.getObjectClock(copy.focusId);
 for(let i=1;i<=arrivalTicks/2;i++){
  copy.advanceSimulation(100+i*100);
  if(i*4===arrivalTicks){near(copy.time,half.time);near(copyClock().properSeconds,half.clock.properSeconds);near(copyClock().coordinateSeconds,half.clock.coordinateSeconds);}
 }
 near(copyClock().properSeconds,held.properSeconds);near(copyClock().coordinateSeconds,held.coordinateSeconds);assert(copyClock().approachHeld);
 r.focusTarget('primary','track');r.focusTarget(obj.id,'track');assert.deepEqual(read(),held);
 for(const spin of [0,.75]){
  r.loadScene('horizon-watch');r.update({spin});r.time=0;r.fillHoles();r.fillObjects();
  const watchId=r.focusId,watch=r.getObjectClock(watchId),p=r.getFocusFrame(watchId).position.slice();
  assert(watch.crewLoadG>8);near(watch.speedMetersPerSecond,0);near(watch.kinematicFactor,1);near(watch.rateFactor,watch.gravityFactor);
  if(spin)assert(watch.accelerationG>0);else near(watch.accelerationG,0);
  const dScene=1e-4,distant=dScene*18*RG/c,angle=Math.abs(watch.coordinateAngularSpeed)*distant;
  r.time=dScene;r.fillObjects();r.advanceClocks(dScene,dScene);
  const q=r.getObjectClock(watchId),p1=r.getFocusFrame(watchId).position;
  const dist=Math.hypot(...p1.map((x,k)=>x-p[k])),radius=Math.hypot(...p);
  near(dist,2*radius*Math.sin(angle/2),5e-7); // corotation despite zero local speed
  near(q.coordinateSeconds-watch.coordinateSeconds,distant);
  near(q.properSeconds-watch.properSeconds,distant/watch.rateFactor);
 }
 // The same release applies to custom drops with different hull dimensions.
 r.loadScene('disk');const custom=['astronaut','iss','shuttle'].map(type=>r.addObject(type,30,1));
 for(const actor of custom){assert(r.updateObject(actor.id,{motion:'infall',height:0}));}
 r.time=0;r.fillObjects();
 for(const actor of custom){const q=r.getObjectClock(actor.id);assert(q.freeFalling);near(q.speedMetersPerSecond,0);near(q.crewLoadG,0);}
 r.time=37.5;r.fillObjects();r.advanceClocks(1,37.5);
 for(const actor of custom){const q=r.getObjectClock(actor.id);assert(q.speedMetersPerSecond>0&&q.speedMetersPerSecond<c);near(q.crewLoadG,0);assert(q.properSeconds>1&&q.coordinateSeconds>q.properSeconds);}
 r.time=75;r.fillObjects();r.advanceClocks(1,37.5);const arrivals=custom.map(a=>r.getObjectClock(a.id));
 r.time=76;r.fillObjects();r.advanceClocks(1,1);for(let i=0;i<custom.length;i++){
  const q=r.getObjectClock(custom[i].id);assert(q.approachHeld);near(q.crewLoadG,0);near(q.properSeconds,arrivals[i].properSeconds);near(q.coordinateSeconds,arrivals[i].coordinateSeconds);
 }
 // A fallback animation in a binary is not an exact geodesic of a single Kerr hole.
 r.loadScene('binary');const pair=r.addObject('astronaut',20,0);r.updateObject(pair.id,{motion:'infall'});
 r.time=4;r.fillObjects();assert(!r.getObjectClock(pair.id).freeFalling);
 r.loadScene('bridge');r.setBridgeTraveler('astronaut');r.update({bridgeTravel:true});r.time=4;r.fillObjects();const bridgeId=r.bridgeObjectId;
 const moving=r.getObjectClock(bridgeId);assert(moving.bridgeObserverClock&&moving.speedMetersPerSecond>0&&moving.accelerationG>0);
 r.update({bridgeTravel:false});near(r.getObjectClock(bridgeId).speedMetersPerSecond,0);
 console.log('PASS: timelike astronaut speed, exact Schwarzschild free fall vs supported Kerr hover, evolving Blue Fire trajectory, frozen arrival telemetry and independent camera orbit, pause, saved exposure and camera changes.');
}finally{r.dispose();copy.dispose();}
