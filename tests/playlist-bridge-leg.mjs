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
  for(let i=0;i<160&&!r.transfer;i++)r.advanceChartStages(.1);
  const t=r.transfer;assert(t?.active);
  // The planner assumes the mathematical parking tangent; sampled display poses
  // on a compressed wormhole chart need not agree to machine precision.
  for(const k of ['properSeconds','distanceMeters','coordinateSeconds','dilationSeconds'])assert(Math.abs(t[k]-a[k]-(b?.[k]||0))<Math.max(1e-9,Math.abs(t[k])*.004),k);
  if(b){assert(a.flyThroughThroat&&b.flyThroughThroat);assert.equal(a.peakSpeed,b.peakSpeed);r.advanceTravel(t.wallSeconds/2);assert(Math.abs(t.properElapsedSeconds/a.properSeconds-1)<.004,'Crossing clock is the moving flip point, not an extra stop at rest');}
  else assert.equal(a.dilationSeconds,0);
 }finally{r.dispose();}
}
console.log('PASS: stationary bridge traversal, split shuttle fly-through, loop closure and immutable map previews.');
