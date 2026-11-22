import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {HABITAT_DOCK_FACE_UNITS as face} from '../dist/habitat-spin.js';
import {MERIDIAN_DOCK_TIP_STOWED as base,MERIDIAN_DOCK_STROKE as stroke} from '../dist/meridian-port.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const norm=v=>Math.hypot(...v),minus=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((x,v,i)=>x+v*b[i],0);
try{
 r.loadScene('earth-mars-station-ferry');r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 let now=1000;const tick=(n=1)=>{for(let i=0;i<n;i++)r.advanceSimulation(now+=100);r.fillObjects();};
 const m=r.dockingMission,id=m.craftId,ports=[],ship=()=>r.getFocusFrame(id);
 const initial=r.getFlightSequence(id),[earthStop,neptuneStop]=initial.nodes;
 assert.deepEqual(initial.nodes,r.objects.filter(o=>o.type==='habitat').map(o=>({targetId:o.id,kind:'dock',port:'south'})));
 assert(initial.active&&initial.loop);const destinations=r.getTravelTargets({craftId:id});assert(destinations.filter(t=>t.dockable).every(t=>t.type==='habitat'));
 let trackedStation='',wheelAngle=0,approachAngle=0,properAtOrbit=0;
 let previousDrumAxis=null,previousWheelAxis=null,sawWheelTurnAtLatch=false;
 const appearances=new Map(),angle=x=>Math.acos(Math.min(1,Math.max(-1,x)))*180/Math.PI;
 let prevPose=null;
 let last='',observedRCS=false,observedMain=false,lastProper=-1;const stages=[],events=[],burns=new Set();
 for(let i=0;i<=6000&&ports.length<3;i++){
  if(i)tick();
  const {phase,stationId,side,sample:s}=r.dockingMission,station=r.getFocusFrame(stationId),f=ship(),clock=r.getObjectClock(id);
  if(prevPose)assert(angle((prevPose.reduce((sum,axis,k)=>sum+dot(axis,s.basis[k]),0)-1)/2)<8,'No yaw, pitch or roll jumps in a 100 ms frame on either leg');
  prevPose=s.basis;
  for(const p of r.objects.filter(o=>o.type==='planet')){
   const world=r.getFocusFrame(p.id),d=minus(world.position,f.position),direction=mul(d,1/norm(d)),radius=Math.asin(world.radius/norm(d))*180/Math.PI,old=appearances.get(p.id);
   if(old){assert(Math.abs(old.radius-radius)<3,'The planetary limb must grow continuously through local and cruise gateways');if(radius>.5)assert(angle(dot(direction,old.direction))<5,'Nearby planets must not jump across the sky');}
   appearances.set(p.id,{direction,radius});
  }
  if(phase==='orbit'&&last!=='orbit'){approachAngle=0;properAtOrbit=r.getObjectClock(stationId).properSeconds;}
  if(stationId===trackedStation){
   const delta=Math.abs(Math.atan2(Math.sin(station.headingAngle-wheelAngle),Math.cos(station.headingAngle-wheelAngle)));
   assert(delta<=.1*r.getHabitatSpin(stationId).angularSpeedRadPerSecond+1e-8,'No rendered wheel jumps during a compressed orbit, burn, capture or release');
   if(['orbit','acquire','approach'].includes(phase))approachAngle+=delta;
  }
  trackedStation=stationId;wheelAngle=station.headingAngle;
  if(phase==='docked'&&last!=='docked'){
   assert(approachAngle>.1&&approachAngle<2*Math.PI*2,'The station turns gently from insertion to capture');
   assert(r.getObjectClock(stationId).properSeconds-properAtOrbit>1000,'Physical station time still includes the half-orbit and close maneuver');
  }
  if(['approach','docked','undock'].includes(phase)&&i%10===0){
   r.updateCameraFrame();const eye=mul(minus(r.cameraFrame.observer,f.position),RG);
   assert(dot(eye,station.habitatHubFrame[1])*side>0,'The tracked camera must stay on the accessible side of the latch');
   if(phase==='docked')assert(norm(eye)>65&&norm(eye)<125,'The camera frames the actual mating hardware');
  }
  assert(clock.properSeconds>=lastProper);lastProper=clock.properSeconds;
  assert.equal(r.driveId,id);
  if(s.docking){assert.equal(f.dockMainThrottle,0);assert.equal(r.getFlightState().throttle,0);if(norm(s.rcs)>0.02)observedRCS=true;}
  else if(s.mainThrustG>.1)observedMain=true;
  if(phase!==last){stages.push(phase);events.push(i/10);}if(phase==='transit')burns.add(s.phase);
  if(phase==='transit')for(const p of r.objects.filter(o=>o.type==='planet')){const world=r.getFocusFrame(p.id);assert(norm(minus(world.position,f.position))>world.radius,'Transfer cannot cross a planetary surface');}
  if(phase==='docked'){
   if(last==='docked'){
    assert(dot(previousDrumAxis,station.drumFrame[0])>1-1e-11,'Locked coupler remains inertially stationary');
    if(dot(previousWheelAxis,station.frame[0])<.99999)sawWheelTurnAtLatch=true;
   }
   previousDrumAxis=[...station.drumFrame[0]];previousWheelAxis=[...station.frame[0]];
   assert.equal(s.extension,1);assert.equal(s.relativeSpeed,0);assert.equal(norm(s.rcs),0);assert(clock.crewLoadG<.001,'Only the tiny tidal support load remains');
   const axis=station.habitatHubFrame[1],offset=mul(minus(f.position,station.position),RG),nose=f.frame[2];
   const tip=offset.map((x,k)=>x+nose[k]*(base+stroke)*f.radius*RG);
   assert(norm(minus(tip,mul(axis,side*face*station.radius*RG)))<.001,'Port and sleeve coincide in SI meters at AU coordinates');
   assert(dot(axis,nose)*side<-.99999);
   if(phase!==last)ports.push([stationId,side]);
   assert(Math.abs(clock.rateFactor-r.getObjectClock(stationId).rateFactor)<1e-11,'Co-moving clocks age together at capture');
  }
  last=phase;
 }
 assert(sawWheelTurnAtLatch,'Wheel keeps rotating around the latched spherical hub');
 assert.deepEqual(ports,[[earthStop.targetId,-1],[neptuneStop.targetId,-1],[earthStop.targetId,-1]]);
 assert.deepEqual(stages.slice(0,12),['orbit','acquire','approach','docked','undock','depart','departOrbit','transit','orbit','acquire','approach','docked']);
 const event=i=>events[i];
 assert(Math.abs(event(3)-event(1)-10)<.11,'Acquisition plus approach take ten seconds.');
 assert(Math.abs(event(6)-event(4)-10)<.11,'Undocking plus jet clearance take ten seconds.');
 assert(Math.abs(event(11)-event(3)-42.95)<.11,'Latch-to-latch travel includes a single working arc at each world.');
 assert([...burns].some(x=>/flip/i.test(x)),'Burn reversal must survive the presentation-time compression');
 assert.equal(r.getFlightSequence(id).legsCompleted,3);
 assert(observedRCS&&observedMain);
 const earth=m.stationId;
 // A drag transfers control from the authored bearing to the identical live tracker pose.
 r.updateCameraFrame();const eyeBefore=[...r.cameraFrame.observer];r.rotate(.05,0);r.updateCameraFrame();
 assert(norm(mul(minus(eyeBefore,r.cameraFrame.observer),RG))<.001);assert.equal(r.cameraGuide,null);
 assert(r.undock(id));assert(!r.getDockingState(id).loop);tick(120);assert.equal(r.dockingMission,null);
 const p=[...ship().position],v=[...r.objectById.get(id).flight.velocity],t=r.time;
 tick();assert(norm(minus(minus(mul(ship().position,RG),mul(p,RG)),mul(v,.1)))<.001);
 assert(Math.abs((r.time-t)*18*RG/299792458-.1)<1e-7);
 const start=[...ship().position];assert(r.startDocking(id,earth,'north'));assert(norm(mul(minus(start,ship().position),RG))<.001,'Selecting another berth does not teleport the shuttle');
 for(let i=0;i<600&&r.dockingMission.phase!=='docked';i++){tick();assert.equal(r.getFlightState().throttle,0,'Local port change uses only RCS');}
 assert.equal(r.dockingMission.phase,'docked');assert.equal(r.dockingMission.side,1);
 const prop=r.getObjectClock(id).properSeconds;r.state.paused=true;tick(5);assert.equal(r.getObjectClock(id).properSeconds,prop);
 r.state.paused=false;const shipId=id;assert(r.removeObject(earth));assert.equal(r.getDockingState(shipId),null);
 // A finite, edited itinerary follows the ordinary planet leg, then
 // re-enters the docking controller and physically holds the last berth.
 r.loadScene('earth-mars-station-ferry');r.sceneLoad=null;r.state.paused=false;r.lastTime=now;
 const craft=r.driveId,[a,b]=r.getFlightSequence(craft).nodes,planet=r.objects.find(o=>o.name==='Neptune');
 const edited=r.setFlightSequence(craft,[a,{targetId:planet.id},b],{loop:false,active:true});
 assert.deepEqual(edited.nodes.map(n=>n.kind),['dock','orbit','dock']);
 let ordinary=false,visitedNeptuneOrbit=false;
 for(let i=0;i<6000;i++){
  tick();if(r.transfer?.active&&r.transfer.targetId===planet.id)ordinary=true;
  if(r.dockingMission?.stationId===b.targetId&&r.flightSequences[craft].index===2)visitedNeptuneOrbit=true;
  if(r.getDockingState()?.phase==='docked'&&r.getDockingState().stationId===b.targetId)break;
 }
 assert(ordinary&&visitedNeptuneOrbit);assert(r.flightSequences[craft].holding);assert(!r.getDockingState().automaticDeparture);
 tick(80);assert.equal(r.getDockingState().phase,'docked');assert.equal(r.flightSequences[craft].legsCompleted,3);
 // Remove the occupied berth, insert a different port, and depart without a
 // camera cut or a spontaneous relaunch of the original two-station loop.
 const at=[...r.getFocusFrame(craft).position],replacement={...b,port:'north'};
 r.setFlightSequence(craft,[replacement],{active:true});assert.equal(r.getDockingState().port,'south');
 assert(norm(minus(at,r.getFocusFrame(craft).position))<1e-12);
 for(let i=0;i<850;i++){tick();if(r.getDockingState()?.phase==='docked'&&r.getDockingState().port==='north')break;}
 assert.equal(r.getDockingState().port,'north');assert(r.flightSequences[craft].holding);
 r.loadScene('disk');assert.equal(r.getDockingState(),null);
 console.log('PASS: Lower-port ferry repeats, matches orbital speed, carries the clock, clears both worlds, and honors mixed/edited non-looping playlists and port changes.');
}finally{r.dispose();}
