import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {speedForWarp,warpStarRate,FLIGHT_LIGHT_SPEED} from '../dist/flight-dynamics.js';
import {cpuWarpStarDirection,cpuWarpStarElongation} from '../dist/cpu-renderer.js';
const near=(a,b,e=1e-10)=>assert(Math.abs(a-b)<=e*Math.max(1,Math.abs(b)),`${a} != ${b}`),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const make=()=>{const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');r.lastTime=1000;return r;};
const step=(r,ms=100)=>{r.advanceSimulation(r.lastTime+ms);r.fillHoles();r.fillObjects();r.updateCameraFrame();};
for(const type of ['shuttle','enterprise']){
 const r=make(),control=make(),ship=r.objects.find(o=>o.type===type),twin=control.objects.find(o=>o.type===type),before=[...r.getFocusFrame(ship.id).position];
 assert(r.setFreeDrive(ship.id,true));assert(ship.flight.orbitHold);assert.equal(r.getFlightState().warpFactor,0);assert.equal(r.getFlightState().thrustSettingG,0);assert.deepEqual(r.getFocusFrame(ship.id).position,before);
 r.state.paused=control.state.paused=false;
 const basis=ship.driveBasis.map(v=>[...v]);r.nudgeFlightTurn(-1);
 for(let i=0;i<45;i++){step(r);step(control);const p=r.getFocusFrame(ship.id).position,q=control.getFocusFrame(twin.id).position;p.forEach((v,j)=>near(v,q[j],1e-13));}
 assert(ship.flight.orbitHold,'Heading alone leaves the analytic orbit in place');assert(dot(ship.flight.basis[2],basis[0])>0,'Left turns toward screen-left from a behind-ship view');assert(r.getFlightState().headingDegrees<0);
 const atRelease=[...r.getFocusFrame(ship.id).position],velocity=[...ship.flight.velocity];r.setFlightPower(type==='shuttle'?1:2);assert(!ship.flight.orbitHold);r.fillObjects();r.getFocusFrame(ship.id).position.forEach((v,j)=>near(v,atRelease[j],1e-13));
 if(type==='shuttle'){assert(Math.hypot(...velocity)>100,'Departure inherits the current orbital velocity');velocity.forEach((v,j)=>near(v,ship.flight.velocity[j],1e-12));}
 step(r);assert(Math.hypot(...sub(r.getFocusFrame(ship.id).position,atRelease))*REFERENCE_RG_METERS>0);
 const saved=parseScene(serializeScene(r));assert.equal(saved.objects.find(o=>o.id===ship.id).flight.orbitHold,false);r.setFreeDrive(ship.id,false);assert.equal(r.driveId,null);r.dispose();control.dispose();
}
{
 const r=make(),ship=r.objects.find(o=>o.type==='enterprise'),count=r.objects.length;r.setFreeDrive(ship.id,true);const parent=r.getFocusFrame(ship.parentId);r.setFlightPower(8);const f=ship.flight;f.position=parent.position.map((v,i)=>v*REFERENCE_RG_METERS+(i===0?f.escapeRadiusMeters*6:0));
 let previous=0;for(let i=0;i<60;i++){r.updateDriveEnvironment(ship,.1);assert(f.escapeBlend>=previous&&f.escapeBlend<=1);previous=f.escapeBlend;}assert(r.isDriveOpenSpace());assert(r.warpMotionState().active);assert.equal(r.objects.length,count,'Cruise does not delete the source system');assert(!r.displayState().blackHole);r.setFreeDrive(ship.id,false);assert(!r.isDriveOpenSpace());assert.equal(r.objects.length,count);r.dispose();
}
for(const [w,rate] of [[0,0],[1,.001],[2,.008],[5,.16],[8,.85]])near(warpStarRate(speedForWarp(w)/FLIGHT_LIGHT_SPEED),rate,1e-8);
assert(cpuWarpStarElongation(speedForWarp(8)/FLIGHT_LIGHT_SPEED)>.7);assert(cpuWarpStarElongation(speedForWarp(9.9999)/FLIGHT_LIGHT_SPEED)>.99);
const star=[.2,.1,Math.sqrt(.95)],direction=cpuWarpStarDirection(star,[0,0,1],.3,0,0);direction.forEach((v,i)=>near(v,star[i]));
console.log('PASS: zero-power Drive entry, orbit hold while steering, correct left/right, continuous inertial departure, saved flight state, reversible scale-relative open-space transition, nonlinear bounded warp sky and near-10 white-streak extent.');
