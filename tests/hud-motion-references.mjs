import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {enterpriseMotionReading} from '../dist/pilot-ui.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {speedForWarp} from '../dist/flight-dynamics.js';

const close=(actual,wanted,tolerance=1e-10)=>assert(Math.abs(actual-wanted)<=tolerance*Math.max(Math.abs(wanted),1),actual+' vs '+wanted);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const load=scene=>{r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;};
const components=q=>{
 for(const [p,n,total] of [[q.feltParallel,q.feltPerp,q.crewLoadG],[q.pathParallel,q.pathPerp,q.accelerationG]]){
  assert(Number.isFinite(p)&&Number.isFinite(n)&&n>=0);close(Math.hypot(p,n),total);
 }
};
try{
 load('orbital-expedition');
 const habitat=r.objects.find(o=>o.type==='habitat'),q=r.getObjectClock(habitat.id),rho=habitat.orbitMeters||habitat.radius*r.massScale*REFERENCE_RG_METERS;
 components(q);assert(q.coordinateAngularSpeed>0);close(q.pathPerp,rho*q.coordinateAngularSpeed**2/9.80665);
 load('radiant-descent');
 r.time=8;r.fillObjects();r.updateCameraFrame();components(r.getObjectClock(r.focusId));
 load('horizon-watch');const still=r.getObjectClock(r.focusId);
 assert(still.crewLoadG>0);assert.equal(still.speedMetersPerSecond,0);
 assert.equal(still.feltParallel,null,'no velocity-aligned frame for a stationary observer');
 load('shuttle-earth-moon-loop');
 const shuttle=r.objects.find(x=>x.type==='shuttle'),planetOrbit=r.getObjectClock(shuttle.id);
 components(planetOrbit);close(planetOrbit.crewLoadG,0);assert(planetOrbit.pathPerp>0);
 load('shuttle-sgra-direct');
 const interstellar=r.objects.find(x=>x.type==='shuttle');
 for(let i=0;i<800&&(!r.transfer||r.transfer.progress<.23);i++)r.advanceChartStages(.05);
 assert(r.transfer?.active);
 const burn=r.getObjectClock(interstellar.id);components(burn);
 assert(burn.crewLoadG>.99&&burn.feltParallel>0);
 assert(burn.pathParallel<burn.feltParallel,'chart acceleration has relativistic suppression');
 load('bridge');
 const bridge=r.objects.find(o=>o.type==='enterprise');
 const reading=()=>enterpriseMotionReading(r,bridge,r.getFlightState(),r.getFlightSequence(bridge.id).orbitalSpeed);
 assert.equal(r.state.warp,false);assert(r.state.warpFactor>0);
 assert.deepEqual(reading(),{speed:0,warp:0,effectiveWarp:false});
 for(let i=0;i<30;i++)r.advanceChartStages(.05);
 assert(r.getFlightState().speedMetersPerSecond>0);close(reading().speed,r.getFlightState().speedMetersPerSecond);
 assert.equal(reading().warp,0);assert.equal(reading().effectiveWarp,false);
 load('warp-orbit');
 const enterprise=r.objects.find(o=>o.type==='enterprise'),orbital=r.getFlightSequence(enterprise.id).orbitalSpeed;
 const propelled=enterpriseMotionReading(r,enterprise,r.getFlightState(),orbital);
 assert.equal(propelled.warp,4);close(propelled.speed,speedForWarp(4));assert(propelled.effectiveWarp);
}finally{r.dispose();}
console.log('PASS: habitat hub chart centripetal acceleration, astronaut felt/chart components, undefined rest-frame direction, and active warp vs real impulse velocities.');
