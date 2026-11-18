import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {estimateTransfer,minimumTransferDistance,sampleTransfer,sampleTransferAtDistance} from '../dist/travel-math.js';
import {advanceRoute} from '../dist/travel-routes.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {speedForWarp} from '../dist/flight-dynamics.js';
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
// Moving-start estimates preserve velocities and integrate a real 1 g profile.
for(const [initialSpeed,finalSpeed,distance] of [[30000,1700,4e8],[2e6,30000,2e11],[0,8000,1e9],[1e8,1e4,2e16]]){
 const p=estimateTransfer(distance,'shuttle',1,{initialSpeed,finalSpeed});
 near(sampleTransfer(p,0).speedMetersPerSecond,initialSpeed);near(sampleTransfer(p,1).speedMetersPerSecond,finalSpeed);
 assert(p.distanceMeters>=minimumTransferDistance(initialSpeed,finalSpeed));
 let time=-1,lag=-1;
 for(let i=0;i<=100;i++){const s=sampleTransferAtDistance(p,i/100);assert(s.properSeconds>=time);assert(s.dilationSeconds>=lag);time=s.properSeconds;lag=s.dilationSeconds;near(s.distanceFraction,i/100);}
 near(time,p.properSeconds);near(lag,p.dilationSeconds);near(p.coordinateSeconds-p.properSeconds,p.dilationSeconds,3e-6);
}
const make=()=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');return r;};
for(const elapsed of [2,5,8]){
 const r=make(),ship=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon'),mars=r.objects.find(o=>o.name==='Mars');r.selectedId=ship.id;r.focusTarget(ship.id,'track');
 assert.equal(r.getNavigationState(ship.id).mode,'auto');assert(r.startTravel(moon.id,{craftId:ship.id}));
 r.state.paused=false;for(let i=0;i<10;i++)r.advanceChartStages(.5);
 assert(r.transfer);assert.equal(r.transfer.wallSeconds,10);
 for(let t=0;t<elapsed;t+=.5)advanceRoute(r,.5);
 assert.equal(r.transfer.phaseName,elapsed===2?'Accelerating':elapsed===5?'Flip and burn':'Decelerating');
 if(elapsed===8)assert(dot(unit(ship.flight.velocity),ship.flight.basis[2])<-.98,'Braking test has nose opposite velocity');
 const before=structuredClone(ship.flight),clock=structuredClone(ship.clock);r.fillObjects();r.updateCameraFrame();const view=structuredClone(r.cameraFrame);
 assert(r.setNavigationMode(ship.id,'manual'));assert.equal(r.transfer,null);assert.equal(r.getNavigationState().mode,'manual');
 assert.deepEqual(ship.flight.position,before.position);assert.deepEqual(ship.flight.velocity,before.velocity);assert.deepEqual(ship.flight.basis,before.basis);assert.equal(ship.flight.speed,before.speed);assert.equal(ship.flight.thrust,0);assert.deepEqual(ship.clock,clock);
 for(const axis of ['observer','forward','up'])view[axis].forEach((v,i)=>near(r.cameraFrame[axis][i],v,2e-7));
 r.advanceClocks(1);near(ship.clock.properSeconds-clock.properSeconds,1);
 // Remain in Drive for this explicit reroute. Automatic playlist recovery
 // on switching back to Auto is exercised in navigation-rejoin.mjs.
 const v=[...ship.flight.velocity],p=[...ship.flight.position];r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;r.advanceSimulation(1100);for(let i=0;i<3;i++){near(ship.flight.velocity[i],v[i]);near(ship.flight.position[i]-p[i],v[i]*.1,1e-5);}
 const current=structuredClone(ship.flight),preview=r.previewTravel(mars.id,{craftId:ship.id});if(preview.error&&elapsed===8){
  // In this ephemeris the handoff is past the safe braking contact with
  // the Moon. Refuse this specific obstructed line without resetting flight.
  assert.match(preview.error,/braking.*intersect Moon/i);assert.equal(r.startTravel(mars.id,{craftId:ship.id}),false);
  assert.deepEqual(ship.flight,current);r.dispose();continue;
 }assert(!preview.error,preview.error);assert(r.startTravel(mars.id,{craftId:ship.id}));
 assert.deepEqual(ship.flight.position,current.position);assert.deepEqual(ship.flight.velocity,current.velocity);assert.deepEqual(ship.flight.basis,current.basis);
 const acq=r.transfer.capture;assert(acq,'Off-axis live reroute must acquire the new course');
 const path=r.getTravelState().pathPoints;assert(dot(unit(path[1].map((v,i)=>v-path[0][i])),unit(current.velocity))>1-1e-10);
 r.advanceTravel(.25);const displacement=ship.flight.position.map((v,i)=>v-current.position[i]);assert(dot(unit(displacement),unit(current.velocity))>.999999,'First displacement follows the live velocity, including retrograde attitudes');
 r.advanceTravel((acq.turnSeconds+1.5+acq.viewSeconds)/2-r.transfer.elapsed);assert.equal(ship.flight.speed,0);assert.equal(ship.flight.thrust,0);assert.equal(r.getTravelState().phase,'Aligning at rest');
 for(let i=0;i<3;i++)near(ship.flight.position[i],acq.stop[i],1e-12);
 const priorTime=r.transfer.properElapsedSeconds;r.advanceTravel(acq.viewSeconds-r.transfer.elapsed+.5);assert(r.transfer.properElapsedSeconds>=priorTime);assert(ship.flight.speed>0);
 assert(dot(unit(ship.flight.velocity),r.transfer.tangent)>.999999);
 const active=r.transfer;assert.equal(r.startTravel('missing-destination',{craftId:ship.id}),false);assert.equal(r.transfer,active,'An invalid reroute leaves the running flight untouched');r.advanceTravel(10);assert.equal(ship.parentId,mars.id);
 r.dispose();
}
// Taking over the acquisition arc preserves the actually visible analytic orbit.
{
 const r=make(),c=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');
 r.startTravel(moon.id,{craftId:c.id});r.state.paused=false;for(let i=0;i<4;i++)r.advanceChartStages(.5);r.fillObjects();
 assert(!r.transfer);near(r.getFlightSequence(c.id).orbitWait.elapsed,2);const p=r.getFocusFrame(c.id).position.slice(),b=r.getFocusFrame(c.id).frame.map(v=>[...v]);
 r.setNavigationMode(c.id,'manual');assert(!c.flight.orbitHold);assert(!r.getFlightSequence(c.id).active);assert.deepEqual(c.drivePosition,p);b.forEach((v,j)=>v.forEach((x,i)=>near(c.flight.basis[j][i],x)));r.dispose();
}
// A natural orbit can be taken over immediately; no completed-flight gate.
{
 const r=make(),ship=r.objects.find(o=>o.type==='shuttle');r.selectedId=ship.id;assert(r.getManualDriveEligibility(ship.id).allowed);r.fillObjects();const frame=r.getFocusFrame(ship.id),position=[...frame.position],basis=frame.frame.map(v=>[...v]);assert(r.setNavigationMode(ship.id,'manual'));assert(ship.flight.speed>0);assert(!ship.flight.orbitHold);for(let j=0;j<3;j++)near(ship.drivePosition[j],position[j]);basis.forEach((v,j)=>v.forEach((n,k)=>near(ship.flight.basis[j][k],n)));r.dispose();
}
// The fictional Enterprise keeps power and speed through authority changes.
{
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('warp-lab');const ship=r.objects.find(o=>o.type==='enterprise');r.selectedId=ship.id;assert(r.setNavigationMode(ship.id,'manual'));r.setFlightPower(5);const before=structuredClone(ship.flight);r.state.annotations=false;assert(r.setNavigationMode(ship.id,'auto'));assert(!r.state.annotations,'Auto leaves label visibility under user control');near(ship.flight.speed,speedForWarp(5));assert.deepEqual(ship.flight.position,before.position);assert.deepEqual(ship.flight.basis,before.basis);assert(r.setNavigationMode(ship.id,'manual'));near(ship.flight.speed,before.speed);assert(!ship.clock);
 r.setNavigationMode(ship.id,'auto');const vel=ship.flight.basis[2].map(x=>x*ship.flight.speed),right=ship.flight.basis[0],point=ship.flight.position.map((v,i)=>v+right[i]*8e10);
 const marker=r.addChildObject('space','waypoint',{x:point[0],y:point[1],z:point[2]});r.selectedId=ship.id;
 const prev=r.previewTravel(marker.id,{craftId:ship.id,warpFactor:2});assert(!prev.error,prev.error);assert(prev.capture);
 assert.equal(prev.properSeconds,prev.coordinateSeconds);assert.equal(prev.estimatedDilationSeconds,0);r.setFlightSequence(ship.id,[{targetId:marker.id,warpFactor:2}],{active:false,loop:false});assert(r.startFlightSequence(ship.id));
 assert(dot(unit(r.transfer.capture.direction),unit(vel))>.999999);
 r.advanceTravel(r.transfer.capture.viewSeconds-.001);assert.equal(ship.flight.speed,0);r.advanceTravel(r.transfer.wallSeconds-r.transfer.elapsed);assert.equal(ship.waypointHoldId,marker.id);
 const endpoint=r.getFocusFrame(ship.id).position;for(let i=0;i<3;i++)near(endpoint[i]*RG,point[i]);r.dispose();
}
console.log('PASS: moving-start 1 g estimates, exact manual takeovers during burns/flip, inertial Drive coast, live reroute tangent, failure preservation, ungated orbit takeover, and Enterprise power continuity.');
