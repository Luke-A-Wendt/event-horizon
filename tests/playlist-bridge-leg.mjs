import assert from 'node:assert/strict';
import './fixtures/shuttle-bridge.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {bridgePlaylistLeg} from '../dist/autopilot.js';
import {fixture} from './render-fixture.mjs';
for(const id of ['test-shuttle-bridge','bridge-nebulae']){
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 try{
  r.loadScene(id);r.sceneLoad=null;r.state.paused=false;
  const c=r.objects.find(o=>['shuttle','enterprise'].includes(o.type)),q=r.flightSequences[c.id];
  const before=JSON.stringify([r.time,c,r.bridgeParking,q]),a=bridgePlaylistLeg(r,c,q,0,1),b=q.nodes.length===4?bridgePlaylistLeg(r,c,q,1,2):null;
  const wrap=bridgePlaylistLeg(r,c,q,q.nodes.length-1,0);assert(wrap.properSeconds>0);assert.equal(JSON.stringify([r.time,c,r.bridgeParking,q]),before,'Inspection must never move the vehicle or alter its route');
  const departureLimit=Math.ceil((q.waitSeconds||0)*10)+160;
  for(let i=0;i<departureLimit&&!r.transfer;i++)r.advanceChartStages(.1);
  const t=r.transfer;assert(t?.active);
  // The planner assumes the mathematical parking tangent; sampled display poses
  // on a compressed wormhole chart need not agree to machine precision.
  for(const k of ['properSeconds','distanceMeters','coordinateSeconds','dilationSeconds'])assert(Math.abs(t[k]-a[k]-(b?.[k]||0))<Math.max(1e-9,Math.abs(t[k])*.004),k);
  if(b){assert(a.flyThroughThroat&&b.flyThroughThroat);assert(a.peakSpeed>0&&b.peakSpeed>0);r.advanceTravel(t.wallSeconds/2);assert(Math.abs(t.properElapsedSeconds/a.properSeconds-1)<.004,'Crossing clock ends the first local burn profile at the open throat');}
  else {
   assert.equal(a.dilationSeconds,0);
   const clock=c.clock,baseline=clock.properSeconds-t.sample.coordinateSeconds;
   for(const seconds of [.1*t.wallSeconds,.3*t.wallSeconds,t.wallSeconds]){
    r.advanceTravel(seconds);
    assert(Math.abs(clock.properSeconds-baseline-t.sample.coordinateSeconds)<1e-6);
    assert.equal(clock.properSeconds,clock.coordinateSeconds);
    assert.equal(clock.lagSeconds,0);
   }
   assert(!r.transfer);assert(Math.abs(clock.properSeconds-baseline-t.properSeconds)<1e-6);
  }
 }finally{r.dispose();}
}
// A frame straddling orbital departure spends only its remaining time in
// transit, while the world outside the bridge vehicle continues to animate.
{
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 try{
  r.loadScene('test-shuttle-bridge');r.sceneLoad=null;r.state.paused=false;
  const c=r.objects.find(o=>o.type==='shuttle'),q=r.flightSequences[c.id],arc=q.orbitWait;
  assert(arc);
  while(q.waitSeconds>.031)r.advanceChartStages(Math.min(.5,q.waitSeconds-.03));
  const wait=q.waitSeconds,sceneTime=r.time;r.lastTime=1000;r.advanceSimulation(1080);
  assert(r.transfer?.active);assert(r.time>sceneTime);
  assert(Math.abs(r.transfer.elapsed-(.08-wait))<1e-8);
  assert(Math.abs(c.clock.properSeconds-arc.durationSeconds-r.transfer.sample.properSeconds)<1e-6);
 }finally{r.dispose();}
}
console.log('PASS: stationary bridge traversal, split shuttle fly-through, loop closure and immutable map previews.');
