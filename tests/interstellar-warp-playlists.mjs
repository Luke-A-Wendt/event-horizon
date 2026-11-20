import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {speedForWarp} from '../dist/flight-dynamics.js';
import {hullType} from '../dist/objects.js';
import {appendPlaylistStop} from '../dist/playlist-ui.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';

const ly=299792458*365.25*86400;
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const open=scene=>{r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;return r.objects.find(o=>o.type==='enterprise');};
const fly=(craft,planetNames)=>{
 const q=r.flightSequences[craft.id];assert(q.active&&q.loop);assert.equal(r.getNavigationState(craft.id).mode,'auto');
 assert(q.nodes.every(n=>n.warpFactor<=4&&!n.transferProperSeconds));let plateau=false,arrivals=[];
 for(let i=0;i<12000&&arrivals.length<planetNames.length;i++){
  const before=r.transfer;r.advanceChartStages(.05);assert(!q.error,q.error);
  const t=r.transfer;
  if(t){
   assert(t.warpFactor<=4&&r.state.warpFactor<=4+1e-9);
   assert(craft.flight.speed<=speedForWarp(4)*(1+1e-12));
   assert(t.plan.properSeconds===t.plan.coordinateSeconds&&t.plan.dilationSeconds===0);
   if(t.currentDistanceFraction>.43&&t.currentDistanceFraction<.57){
    assert(Math.abs(craft.flight.speed/speedForWarp(t.warpFactor)-1)<1e-10,'Cruise setting is sustained, not touched just at midpoint');
    assert.equal(r.state.warpFactor,t.warpFactor);
    if(t.warpFactor===4)plateau=true;
   }
  }
  if(before&&!t){
   arrivals.push(r.getTravelTargets({craftId:craft.id}).find(t=>t.id===craft.parentId)?.name);
   assert.equal(craft.parentId,before.targetId);
   assert(r.state.warpFactor<1,'The parking orbit must not keep the interstellar warp factor');
  }
 }
 assert.deepEqual(arrivals,planetNames);assert(plateau,'a real warp-4 cruise');
};
try{
 for(const [scene,plan,baseline] of [
  ['warp-proxima-direct',['Proxima Centauri d','Proxima Centauri b','Earth'],4.2465],
  ['warp-sgra-direct',['Sagittarius A*','Earth'],26996],
 ]){
  const ship=open(scene);assert.equal(hullType(ship),'enterprise');assert.equal(ship.name,'NASA Warp Explorer');assert.equal(r.focusId,ship.id);
  const first=r.flightSequences[ship.id].nodes[1],preview=r.previewTravel(first.targetId,{craftId:ship.id});
  assert(!preview.error,preview.error);assert(Math.abs(preview.distanceMeters/ly-baseline)<baseline*.002);
  assert.equal(preview.warpFactor,4);assert(preview.coordinateSeconds>=preview.distanceMeters/speedForWarp(4));
  fly(ship,plan);
 }
 const ship=open('earth-vulcan');assert.equal(hullType(ship),'classicEnterprise');
 const id=name=>r.objects.find(o=>o.name===name).id;
 // Replace the preset planetary stops with the Moon and both stellar orbits
 // using real edit actions. Per-leg values travel with the itinerary on save.
 r.setFlightSequence(ship.id,[{targetId:id('Moon'),warpFactor:2}],{active:true,loop:true});
 const result=appendPlaylistStop(r,ship.id,id('40 Eridani A'));assert.equal(result.nodes.at(-1).warpFactor,4);
 appendPlaylistStop(r,ship.id,id('Sun'),8.5);
 const q=r.getFlightSequence(ship.id);assert.deepEqual(q.nodes.map(n=>n.warpFactor),[2,4,4]);
 assert.deepEqual(parseScene(serializeScene(r)).flightSequences[ship.id].nodes.map(n=>n.warpFactor),[2,4,4]);
 fly(ship,['Moon','40 Eridani A','Sun','Moon']);
 assert(r.setNavigationMode(ship.id,'manual'));r.setFlightPower(8.5);assert.equal(r.getFlightState().warpFactor,4);
 const lab=open('warp-lab');assert(r.setNavigationMode(lab.id,'manual'));r.setFlightPower(6);assert(Math.abs(r.getFlightState().warpFactor-6)<1e-12,'Local route limits do not change the laboratory');
}finally{r.dispose();}
console.log('PASS: warp-4 round trips to Proxima and Sagittarius A*, capped editable Enterprise playlist to both suns and Moon, protected clocks, save/restore and manual cap.');
