import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {bridgeResearchGateStage,bridgeIsotropicRadius,bridgeProperRadius} from '../dist/bridge-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {advanceAutopilot} from '../dist/autopilot.js';
import {createOpticalContext} from '../dist/optical-projection.js';
const make=id=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene(id);r.sceneLoad=null;r.state.paused=false;return r;};
const b=8,at=l=>bridgeResearchGateStage([0,0,bridgeIsotropicRadius(l*b,b)],b);
assert.equal(at(5).open,0);assert.equal(at(-5).open,0);
assert.equal(at(1).open,1);assert.equal(at(-1).open,1);
assert.equal(at(0).open,1);assert.equal(at(-1).far,true);assert.equal(at(1).far,false);
for(let d=3.5;d>1.3;d-=.05)assert(at(d-.05).open>=at(d).open,'Gate grows smoothly as the traveler approaches');
for(const id of ['bridge']){
 const r=make(id),craft=r.objects.find(o=>o.type==='enterprise');
 assert.equal(r.state.annotations,false,`${id} retains an uncluttered initial sky`);
 assert.equal(r.getBridgeStage().hardware,true);
 assert.equal(r.getBridgeStage().open,0,'The accelerator is on standby while the ship is parked.');
 assert.deepEqual(r.getFlightSequence(craft.id).nodes.map(n=>n.targetId),['bridge-near-world','bridge-far-world']);
 advanceAutopilot(r,.05);assert(r.transfer?.cinematicBridge);assert(Math.abs(r.transfer.wallSeconds-Math.PI/.12)<1e-12);assert.equal(r.transfer.alignHold,0);
 const w=r.transfer.wallSeconds,throat=r.configCache.bridgeRadius;
 const location=()=>bridgeProperRadius(Math.hypot(...craft.drivePosition),throat)/throat;
 r.advanceTravel(w*.312);
 r.advanceTravel(w*.088);const opening=r.getBridgeStage();
 assert(opening.open>0&&opening.open<1&&!opening.far);assert.equal(opening.phase,'Opening gate');
 r.advanceTravel(w*.09);const approach=location(),approachSpeed=craft.flight.speed;assert.equal(r.getBridgeStage().open,1);
 r.advanceTravel(w*.01);const speed=craft.flight.speed;assert(Math.abs(location())<1e-10,'midpoint is the throat in proper radial coordinates');
 assert.equal(r.state.annotations,false);assert(!r.state.warp);
 r.advanceTravel(w*.01);assert(approach>0&&Math.abs(location()+approach)<1e-8,'symmetric proper motion on both sides');
 assert(approachSpeed>0&&craft.flight.speed>0&&speed>approachSpeed&&speed>craft.flight.speed,'no engine stop or speed dip at the throat');
 r.advanceTravel(w*.09);const closing=r.getBridgeStage();
 assert(closing.far&&Math.abs(closing.open-opening.open)<1e-12);assert.equal(closing.phase,'Closing gate');
 r.advanceTravel(w*.102);
 r.advanceTravel(w*.298);assert.equal(r.getBridgeStage().open,0);
 for(let i=0;i<180&&!r.transfer;i++)r.advanceChartStages(.1);
 assert(r.transfer?.active&&r.transfer.targetId==='bridge-near-world');
 const returnWall=r.transfer.wallSeconds;
 r.advanceTravel(returnWall*.298);const returnPeak=r.getBridgeStage();
 assert(returnPeak.far&&returnPeak.open===0);
 r.advanceTravel(returnWall*.102);const returning=r.getBridgeStage();
 assert(returning.far&&Math.abs(returning.open-opening.open)<1e-12);assert.equal(returning.phase,'Opening gate');
 r.dispose();
}
for(const id of ['bridge-planets','bridge-blackhole','bridge-nebulae']){
 const r=make(id);assert.equal(r.sceneId,id);assert.equal(r.getBridgeStage().hardware,false,`${id} has no research station`);r.dispose();
}
for(const id of ['test-shuttle-bridge','shuttle-earth-mars-loop','shuttle-earth-moon-loop']){
 const r=make(id);assert.equal(r.state.annotations,true,`${id} starts with its route and destinations visible`);
 if(id==='test-shuttle-bridge'){
  const craft=r.objects.find(o=>o.type==='shuttle');assert.equal(r.getBridgeStage().open,0,'Gate begins closed in Earth orbit');assert.equal(createOpticalContext(r).bridge,false,'Labels use the flat chart while the gate is closed');
  craft.drivePosition=r.configCache.primaryBasis[2].map(v=>v*bridgeIsotropicRadius(.8*r.configCache.bridgeRadius,r.configCache.bridgeRadius));
  assert.equal(r.getBridgeStage().open,1);assert.equal(createOpticalContext(r).bridge,true);assert.equal(createOpticalContext(r).bridgeScale,1);r.state.annotations=false;r.stopFlightSequence(craft.id);assert(r.startTravel('bridge-throat',{craftId:craft.id}));assert.equal(r.state.annotations,false,'A queued or direct flight does not force labels on');
 }
 r.dispose();
}
console.log('PASS: proximity gate closure/opening, classic uninterrupted bridge timing, bridge/shuttle label defaults, and label-preserving routing.');
