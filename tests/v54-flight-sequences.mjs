import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {advanceAutopilot} from '../dist/autopilot.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const make=id=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene(id);r.state.paused=false;r.sceneLoad=null;return r;};
const startSequence=(r,id)=>{const result=r.startFlightSequence(id);for(let i=0;i<121&&r.getFlightSequence(id).orbitWait;i++)advanceAutopilot(r,.1);return result;};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),close=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
for(const id of ['shuttle-earth-moon-loop','shuttle-earth-mars-loop','test-shuttle-bridge','bridge']){
 const r=make(id),craft=r.objects.find(o=>['shuttle','enterprise'].includes(o.type)),q=r.getFlightSequence(craft.id);
 assert(q.loop&&q.active&&q.nodes.length>=2,'Built-in loops are editable user queues');assert(r.getManualDriveEligibility(craft.id).allowed);
 assert(startSequence(r,craft.id));const names=new Set();let previousLag=craft.clock?.lagSeconds||0;
 for(let i=0;i<1500;i++){r.advanceTravel(.1);advanceAutopilot(r,.1);if(r.transfer?.active){assert(r.transfer.pathPoints.every(p=>p.every(Number.isFinite)));names.add(r.transfer.targetId);}if(craft.clock){assert(craft.clock.lagSeconds>=previousLag);previousLag=craft.clock.lagSeconds;}}
 assert(r.getFlightSequence(craft.id).legsCompleted>=2,`${id}: Queue executes outward and return legs: ${r.getFlightSequence(craft.id).error}`);assert(names.size>=2);assert(!r.getFlightSequence(craft.id).error);
 if(id==='bridge')assert(!r.state.warp,'The default Enterprise bridge itinerary remains impulse-powered');
 r.dispose();
}
{
 const r=make('test-shuttle-bridge'),ship=r.objects[0],targets=r.getNavigationWaypoints(ship.id);
 assert.deepEqual(targets.map(t=>t.id),['bridge-near-world','bridge-throat','bridge-far-world']);assert(targets.every(t=>t.position.every(Number.isFinite)&&Number.isFinite(t.radius)));
 assert(startSequence(r,ship.id));const crossing=r.transfer;assert(crossing.flyThrough);assert.equal(crossing.wallSeconds,10);
 const phases=[];let elapsed=0,preGateSpeed=0,peak=0;
 for(const fraction of [.05,.25,.5,.75,.95]){
  r.advanceTravel((fraction-elapsed)*crossing.wallSeconds);elapsed=fraction;phases.push(r.getTravelState().stage);
  if(fraction===.25)preGateSpeed=ship.flight.speed;
  if(fraction===.5){peak=ship.flight.speed;assert(peak>preGateSpeed&&preGateSpeed>0);assert.equal(ship.flight.thrust,0);close(Math.hypot(...ship.flight.position),r.configCache.bridgeRadius*REFERENCE_RG_METERS*.5);}
  if(fraction===.75)assert(ship.flight.speed>0&&ship.flight.speed<peak);
 }
 assert.deepEqual(phases,['Leaving orbit','Accelerating','Flip through gate','Decelerating','Entering orbit']);
 r.advanceTravel((1-elapsed)*crossing.wallSeconds);assert(!r.transfer);assert.equal(r.bridgeParking[ship.id].targetId,'bridge-far-world');assert(ship.flight.speed>0);assert(r.getBridgeParkingOrbit(ship.id));
 // Standalone throat instructions stop at zero, then can continue without a degenerate leg.
 r.stopFlightSequence(ship.id);assert(r.startTravel('bridge-throat',{craftId:ship.id,heading:0}));r.advanceTravel(r.transfer.wallSeconds);assert.equal(ship.flight.speed,0);assert.equal(r.bridgeParking[ship.id].targetId,'bridge-throat');assert(dot(ship.flight.basis[2],r.configCache.primaryBasis[2])>.999999);close(Math.hypot(...ship.flight.position),r.configCache.bridgeRadius*REFERENCE_RG_METERS*.5);
 assert(r.startTravel('bridge-near-world',{craftId:ship.id}));assert(!r.transfer.crossing,'Leaving the throat needs only the remaining leg');r.advanceTravel(r.transfer.wallSeconds/3);
 const before=structuredClone(ship.flight),clock=structuredClone(ship.clock);assert(r.startTravel('bridge-far-world',{craftId:ship.id}));assert.deepEqual(ship.flight.position,before.position);assert.deepEqual(ship.flight.basis,before.basis);assert.deepEqual(ship.flight.velocity,before.velocity);assert.deepEqual(ship.clock,clock);
 r.fillObjects();r.updateCameraFrame();assert(r.setNavigationMode(ship.id,'manual'));assert(!r.transfer);assert.deepEqual(ship.flight.position,before.position);assert.deepEqual(ship.flight.velocity,before.velocity);r.dispose();
}
{
 const r=make('solar-system'),ship=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon'),mars=r.objects.find(o=>o.name==='Mars');
 assert(r.setFlightSequence(ship.id,[{targetId:moon.id},{targetId:mars.id}],{loop:true}));assert(startSequence(r,ship.id));r.advanceTravel(2);assert(r.startTravel(mars.id,{craftId:ship.id}));assert(!r.getFlightSequence(ship.id).active,'Direct Go stops the old queue');
 r.removeObject(moon.id);assert(r.getFlightSequence(ship.id).nodes.every(n=>n.targetId!==moon.id));r.removeObject(ship.id);assert(!r.flightSequences[ship.id]);assert(!r.navigationModes[ship.id]);assert(!r.bridgeParking?.[ship.id]);r.dispose();
}
{
 const r=make('bridge'),ship=r.objects[0];r.stopFlightSequence(ship.id);assert(r.setFlightSequence(ship.id,[{targetId:'bridge-throat',warpFactor:1}],{loop:false}));assert(startSequence(r,ship.id));r.advanceTravel(.3*r.transfer.wallSeconds);assert(r.state.warp,'A user-selected Enterprise warp route uses its bubble');assert(!ship.clock);r.dispose();
}
{
 const r=make('bridge'),ship=r.objects[0];assert(r.setFlightSequence(ship.id,[{targetId:'bridge-throat',warpFactor:0,heading:35},{targetId:'bridge-far-world',warpFactor:2}],{loop:false}));assert(startSequence(r,ship.id));assert(r.transfer.crossing);assert(r.transfer.parts[0].impulse);assert.equal(r.transfer.parts[1].warpFactor,2);
 const dt=r.transfer.wallSeconds;r.advanceTravel(dt*.49);assert.equal(ship.flight.speed,0);const heading=35*Math.PI/180,desired=r.configCache.primaryBasis[0].map((v,i)=>-v*Math.sin(heading)+r.configCache.primaryBasis[2][i]*Math.cos(heading));assert(dot(ship.flight.basis[2],desired)>.999999,'A fused throat stop retains its own requested heading');assert(!r.state.warp);r.advanceTravel(dt*.14);assert(r.state.warp,'The onward node applies its independently selected warp');r.dispose();
}
console.log('PASS: shared editable preset loops, two-way execution, ten-second continuous shuttle bridge profile, zero-speed heading waypoints, onward routes, moving reroutes/takeovers, default impulse bridge and selected warp, queue cancellation, and deleted-target/craft pruning.');
