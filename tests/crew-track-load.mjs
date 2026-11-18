import assert from 'node:assert/strict';
import {compactTrackLoadG,accumulateCrewExposure} from '../dist/crew-load.js';
import {CLOCK_LIGHT_SPEED as c,createObjectClock} from '../dist/object-clocks.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';
const rg=5e9,g0=9.80665,close=(x,y,tol=1e-10)=>assert(Math.abs(x-y)<=tol*Math.max(1,Math.abs(y)),x+' versus '+y);
// Reference tests use analytic Schwarzschild hovering, and prograde
// circular geodesics at both stable and unstable timelike radii.
for(const spin of [0,.8]){
 const hole={spinParameter:spin,spinAxis:[0,1,0],horizonMeters:rg*(1+Math.sqrt(1-spin**2)),positionMeters:[0,0,0]};
 for(const x of [5,8,16,100]){
  const r=x*rg,D=x*x-2*x+spin**2,A=(x*x+spin**2)**2-spin**2*D;
  const alpha=Math.sqrt(x*x*D/A),w=2*spin*x/A,h3=Math.sqrt(A)/x;
  const beta=(1/(x**1.5+spin)-w)*h3/alpha;
  close(compactTrackLoadG(hole,[r,0,0],beta*c),0,1e-7);
  if(spin===0)close(compactTrackLoadG(hole,[r,0,0],0),c*c/(g0*rg*x*x*Math.sqrt(1-2/x)));
  const circ={radius:r,radialVelocity:0,tangentialVelocity:beta*c,radialAcceleration:-((beta*c)**2)/r,tangentialAcceleration:0};
  close(compactTrackLoadG(hole,[r,0,0],beta*c,circ),0,1e-7);
 }
 const R=hole.horizonMeters;
 assert(compactTrackLoadG(hole,[R+1,0,0],0)>compactTrackLoadG(hole,[R+10,0,0],0));
}
const clock=createObjectClock(),day=86400;
accumulateCrewExposure(clock,day,1,2);close(clock.highGExposureSeconds,day/2);
accumulateCrewExposure(clock,7*day,2);close(clock.highGExposureSeconds,7.5*day);close(clock.extremeGExposureSeconds,0);
accumulateCrewExposure(clock,4,7,9);close(clock.extremeGExposureSeconds,2);
accumulateCrewExposure(clock,100,1.5);assert.equal(clock.highGExposureSeconds,0);assert.equal(clock.extremeGExposureSeconds,0);
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make(),copy=make();
try{
 r.loadScene('orbital-expedition');const iss=r.objects.find(o=>o.type==='iss');const station=()=>r.getObjectClock(iss.id);
 assert(station().speedMetersPerSecond>0&&station().crewLoadG>8&&station().minimumReturnG>1);
 assert(iss.id!==r.driveId);r.advanceClocks(8*day);close(station().highGExposureSeconds,8*day);close(station().extremeGExposureSeconds,8*day);
 restoreRenderer(copy,parseScene(serializeScene(r)));close(copy.getObjectClock(iss.id).extremeGExposureSeconds,8*day);
 r.loadScene('shuttle-sgra-direct');r.sceneLoad=null;r.state.paused=false;
 let reached=false;
 for(let i=0;i<2000&&!reached;i++){
  r.advanceChartStages(.05);const t=r.transfer,s=t?.sample;
  if(s?.lorentzFactor>100&&t.commandedThrustG>.99&&t.progress<.35){
   const read=r.getObjectClock(t.craftId);close(read.crewLoadG,1);close(read.accelerationG*s.lorentzFactor**3,1);
   assert.equal(read.highGExposureSeconds,0);reached=true;
  }
 }
 assert(reached,'sample the physical relativistic acceleration on the 27,000 ly flight');
}finally{r.dispose();copy.dispose();}
console.log('PASS: Kerr geodesic and hover load, threshold crossings in proper time, station telemetry and save/restore, longitudinal SR acceleration at gamma > 100.');
