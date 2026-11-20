import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {objectRadiusMeters,JANUS_THRUST_MAX_G,OBJECT_DIMENSIONS} from '../dist/objects.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {speedForWarp,FLIGHT_STANDARD_GRAVITY as G} from '../dist/flight-dynamics.js';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const mirror=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
try{
 r.loadScene('shuttle-space');const s=r.objects.find(o=>o.hullModel==='janusPod'),id=s.id;
 assert.equal(OBJECT_DIMENSIONS.janusPod.lengthMeters,5.4);assert.equal(objectRadiusMeters('janusPod')*1.60,5.4);
 assert(r.setNavigationMode(id,'manual'));r.state.paused=false;r.sceneLoad=null;r.lastTime=1000;
 const step=(n=1)=>{for(let i=0;i<n;i++){r.advanceSimulation(r.lastTime+100);r.fillObjects();r.updateCameraFrame();}};
 const f=()=>r.getFlightState();assert.equal(f().flightMode,'impulse');assert.equal(f().maxThrustG,JANUS_THRUST_MAX_G);
 assert(!r.warpMotionState().active);assert.equal(f().warpFactor,0);
 r.setFlightPower(99);assert.equal(f().thrustSettingG,.3);step(10);assert(Math.abs(f().speed-.3*G)<1e-5);
 assert.equal(r.getObjectClock(id).crewLoadG,.3);assert(s.clock.properSeconds>0);
 s.flight.thrust=2.7;s.flight.brakeInitialSpeed=2.7;s.flight.brakeSpeed=true;
 const legacy=parseScene(serializeScene(r)),restored=legacy.objects.find(o=>o.id===id).flight;
 assert.equal(restored.thrust,.3);assert.equal(restored.brakeInitialSpeed,.3);assert.deepEqual(restored.velocity,s.flight.velocity);
 restoreRenderer(mirror,legacy);assert.equal(mirror.getFlightState().thrustSettingG,.3);
 r.setFlightPower(.04);assert.equal(f().thrustSettingG,.04);
 r.setFlightPower(0);const coast=[...f().velocity],heading=[...f().basis[2]];
 r.setFlightHeading(65);step(2);assert.notDeepEqual(f().basis[2],heading);assert(f().steeringInput);
 step(70);assert.deepEqual(f().velocity,coast);assert(!r.warpMotionState().active);
 const p=f().position;assert(r.setPodPropulsion(id,'warp'));assert.deepEqual(f().position,p);assert.equal(f().speed,0);assert(r.state.warp);
 r.setFlightPower(3);step(20);assert.equal(f().speed,speedForWarp(3));assert(r.warpMotionState().active&&r.warpMotionState().beta>1);
 const saved=parseScene(serializeScene(r));assert.equal(saved.objects.find(o=>o.id===id).podPropulsion,'warp');restoreRenderer(mirror,saved);assert.equal(mirror.getFlightState().flightMode,'warp');
 const q=f().position,t=s.clock.properSeconds;r.setPodPropulsion(id,'impulse');
 assert.deepEqual(f().position,q);assert.equal(s.clock.properSeconds,t);assert.deepEqual(f().velocity,coast);
 assert(!r.warpObjectId&&!r.state.warp&&!r.warpMotionState().active);assert.equal(f().warpFactor,0);
 restoreRenderer(mirror,snapshotRenderer(r,{includeObjects:false,objectIds:[id]}));
 assert.equal(mirror.getFlightState().flightMode,'impulse');assert.deepEqual(mirror.getFlightState().velocity,coast);
 assert.equal(parseScene(serializeScene(r)).objects.find(o=>o.id===id).podPropulsion,'impulse');
 const added=r.addChildObject('space','janusPod');assert.equal(added.type,'enterprise');assert.equal(added.hullModel,'janusPod');assert.equal(added.name,'NASA Janus');
 assert(r.setNavigationMode(added.id,'manual'));assert.equal(f().flightMode,'impulse');assert(!r.setPodPropulsion(id,'warp'),'a parked craft cannot commandeer the field');assert(r.setPodPropulsion(added.id,'warp'));
}finally{mirror.dispose();r.dispose();}
const cpu=new CpuRenderer(fixture().canvas,{autoStart:false,bindControls:false});
try{cpu.loadScene('shuttle-space');const pod=cpu.objects.find(o=>o.hullModel==='janusPod');assert(cpu.setNavigationMode(pod.id,'manual'));assert(cpu.setFlightPower(2));assert.equal(cpu.getFlightState().thrustSettingG,.3);assert(cpu.setPodPropulsion(pod.id,'warp'));assert(cpu.setFlightPower(2));assert.equal(cpu.getFlightState().speed,speedForWarp(2));}finally{cpu.dispose();}
console.log('PASS: true-size addable Janus, steerable 0.3g impulse, warp optics, local velocity restoration, save/resume, CPU and worker pose snapshots.');
