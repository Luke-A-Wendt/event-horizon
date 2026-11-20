import assert from 'node:assert/strict';
import {bridgeTrackLoadG} from '../dist/bridge-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import './fixtures/shuttle-bridge.mjs';
const near=(x,y,tol=1e-10)=>assert(Math.abs(x-y)<=tol*Math.max(1,Math.abs(y)),x+' ≠ '+y);
// A radial line in the static Ellis metric is a spatial geodesic at any radius;
// despite changing coordinate speed, coasting along it gives no felt g's.
// Its throat great circle is also a spatial geodesic despite its round chart path.
const b=200,T=[0,1,0],v=5e6;
for(const r of [15,100,600])near(bridgeTrackLoadG([r,0,0],[1,0,0],[0,0,0],b,1,v),0);
near(bridgeTrackLoadG([b/2,0,0],T,[-2/b,0,0],b,1,v),0);
near(bridgeTrackLoadG([b/2,0,0],T,[-2/b,0,0],b,1,v,1),1);
const c=299792458,radius=1e6;
near(bridgeTrackLoadG([radius,0,0],T,[-1/radius,0,0],0,1,v),v*v/(1-(v/c)**2)/radius/9.80665);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene('test-shuttle-bridge');const craft=r.objects.find(o=>o.type==='shuttle');r.stopFlightSequence(craft.id);
 const orbit=r.getBridgeParkingOrbit(craft.id);assert(orbit.requiredSupportG>.5&&orbit.requiredSupportG<1.5);
 assert(r.startTravel('bridge-far-world',{craftId:craft.id}));const t=r.transfer;
 assert.equal(t.sample.bridgeProperG,null);r.advanceTravel(t.wallSeconds*.5);
 assert.equal(t.commandedThrustG,0);assert.equal(t.sample.bridgeProperG,null,'engine off during a cinematic flip does not establish free fall');
 const instrument=r.getObjectClock(craft.id);assert.equal(instrument.accelerationMode,'unavailable');assert(!Number.isFinite(instrument.crewLoadG));
 r.loadScene('shuttle-sgra-direct');r.sceneLoad=null;r.state.paused=false;
 let burn=false,coast=false;
 for(let i=0;i<1200&&!(coast&&burn);i++){
  r.advanceChartStages(.05);const leg=r.transfer;if(!leg?.active||leg.radiusTransfer)continue;
  const q=r.getObjectClock(leg.craftId),cmd=leg.commandedThrustG;
  if(leg.phaseIndex===1&&cmd===1){near(q.crewLoadG,1);burn=true;}
  if(leg.phaseIndex===2&&cmd===0){near(q.crewLoadG,0);assert(leg.sample.speedMetersPerSecond>0);coast=true;}
 }
 assert(burn&&coast,'sample both physical phases of a flat-chart SR transfer');
}finally{r.dispose();}
console.log('PASS: Ellis geodesic/steering loads, unknown schematic bridge accelerometer, and real SR burn versus engine-off coast.');
