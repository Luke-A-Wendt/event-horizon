import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {restoreRenderer} from '../dist/render-state.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';

const f=fixture();
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene('earth-proxima-gates');
 r.sceneLoad=null;
 r.fillObjects();
 r.updateCameraFrame();
 const ship=r.objects.find(o=>o.type==='shuttle');
 assert.equal(r.sceneId,'earth-proxima-gates');
 assert(ship&&r.focusId===ship.id,'Begin with the camera following Meridian');
 const route=r.getFlightSequence(ship.id),targets=r.getTravelTargets({craftId:ship.id});
 const itinerary=route.nodes.map(n=>targets.find(t=>t.id===n.targetId));
 assert.deepEqual(itinerary.map(t=>t.id),['bridge-near-world','bridge-earth-gate','bridge-far-world','bridge-proxima-gate']);
 assert.equal(itinerary[0].name,'Earth');
 assert.equal(itinerary[2].name,'Proxima Centauri');
 assert.equal(itinerary[2].type,'star');
 assert(route.loop&&route.active);
 const saved=parseScene(serializeScene(r));
 assert.deepEqual(saved.flightSequences[ship.id].nodes.map(n=>n.targetId),itinerary.map(t=>t.id));
 r.requestProgram();r.render();
 const [earthDistance,earthRadius,starDistance,starRadius]=f.uniforms.get('uBridgeWorldLayout').args;
 const [moonDistance,moonRadius]=f.uniforms.get('uBridgeMoon').args;
 assert(Math.abs(earthDistance/earthRadius-384400/6371)<.5,'Earth-to-gate distance in Earth radii');
 assert(Math.abs(moonDistance/earthDistance-2)<.001,'Moon lies on the other side of Earth at the same distance');
 assert(Math.abs(moonRadius/earthRadius-1737/6371)<.01,'Moon to Earth size ratio');
 assert(starDistance>starRadius,'Far gate exterior to the star');
 assert.equal(r.getBridgeStage().open,0,'Departure gate stays closed while orbiting Earth');
 assert(r.getBridgeStage().hardware,'Dodecahedral enclosure is enabled');

 // Advance the shared production clock, so the test exercises route scheduling,
 // metric-side changes, the traveler and the camera in the same frames.
 const parked=[],crossedTo=[],flips=[],measuredOrbits=[];
 let far=false,partialOpen=false,turn=null,now=1000;
 r.state.paused=false;r.lastTime=now;r.now=()=>now;
 for(let i=0;i<6000;i++){
  now+=50;r.advanceSimulation(now);r.fillObjects();r.updateCameraFrame();
  const sequence=r.flightSequences[ship.id],wait=sequence.orbitWait,stage=r.getBridgeStage();
  assert(!sequence.error,sequence.error);
  assert(r.cameraFrame.observer.every(Number.isFinite)&&r.cameraFrame.forward.every(Number.isFinite));
  if(wait&&parked.at(-1)!==wait.targetId){
   parked.push(wait.targetId);
   assert(Math.abs(wait.sweepRadians-2*Math.PI)<1e-6,'Exactly one complete orbit at '+wait.targetId);
   assert.equal(stage.open,0,'Gate closes outside the crossing');
   if(parked.length===2){
    const copy=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
    try{
     restoreRenderer(copy,parseScene(serializeScene(r)));
     assert.equal(copy.sceneId,r.sceneId);
     assert.equal(copy.getBridgeStage().far,true);
     assert.equal(copy.bridgeParking[ship.id].targetId,itinerary[2].id);
     assert.deepEqual(copy.getFlightSequence(ship.id).nodes.map(n=>n.targetId),itinerary.map(t=>t.id));
    }finally{copy.dispose();}
   }
   if(parked.length===3)break;
  }
  if(wait){
   const orbit=r.getBridgeParkingOrbit(ship.id),position=r.getFocusFrame(ship.id).position;
   const direction=position.map((v,j)=>(v-orbit.center[j])/orbit.radius);
   const lap=measuredOrbits.at(-1);
   if(lap?.id===wait.targetId){
    const cos=direction.reduce((sum,x,j)=>sum+x*lap.last[j],0);
    lap.angle+=Math.acos(Math.min(1,Math.max(-1,cos)));
    lap.last=direction;
   }else measuredOrbits.push({id:wait.targetId,last:direction,angle:0});
  }
  if(stage.open>0&&stage.open<1)partialOpen=true;
  if(stage.far!==far){
   assert(partialOpen,'A partially open aperture precedes the crossing');
   assert.equal(stage.open,1,'Ship crosses a fully open throat');
   assert(ship.flight.speed>0,'Transit proceeds through the mouth without a stop');
   far=stage.far;crossedTo.push(far);partialOpen=false;
  }
  if(r.transfer?.phaseName==='Flip and burn'){
   const flight=ship.flight;
   assert.equal(flight.thrust,0,'Coast through the half-turn');
   const nose=flight.basis[2],velocity=flight.velocity;
   const alignment=nose.reduce((sum,x,j)=>sum+x*velocity[j],0)/Math.hypot(...velocity);
   if(!turn){turn={far,start:alignment,end:alignment,speed:flight.speed};flips.push(turn);}
   turn.end=alignment;
   assert(Math.abs(flight.speed/turn.speed-1)<1e-6,'Velocity magnitude holds while coasting');
  }else turn=null;
 }
 assert.deepEqual(parked,[itinerary[0].id,itinerary[2].id,itinerary[0].id]);
 assert.equal(measuredOrbits.length,2);
 assert(measuredOrbits.every(lap=>Math.abs(lap.angle-2*Math.PI)<.05),'Rendered ship completes each revolution');
 assert.deepEqual(crossedTo,[true,false],'Travel through both mouths on the return itinerary');
 assert.deepEqual(flips.map(p=>p.far),[false,true,true,false],
  'A local flip between each gate and its world in both directions');
 assert(flips.every(p=>p.start>.99&&p.end<-.99),'Each coasting ship turns from prograde to retrograde for braking');
 // Named gates are also valid standalone destinations when a pilot edits the
 // itinerary. Exercise their parked state through the file reader and renderer.
 r.stopFlightSequence(ship.id);
 for(const target of [itinerary[1],itinerary[2],itinerary[3]]){
  const trip=r.startTravel(target.id,{craftId:ship.id});
  assert(trip&&!trip.error,trip?.error);
  r.advanceTravel(r.transfer.wallSeconds);
  restoreRenderer(r,parseScene(serializeScene(r)));
  assert.equal(r.bridgeParking[ship.id].targetId,target.id);
  r.sceneLoad=null;r.state.paused=false;
 }
}finally{r.dispose();}
console.log('PASS: Earth–Proxima gate circuit, full parking orbits, local flips and two open-throat crossings.');
