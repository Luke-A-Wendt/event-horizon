import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {CLOCK_HORIZON_EPSILON,compactExteriorRadius,clockRate,advanceObjectClock,createObjectClock} from '../dist/object-clocks.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';

for(const Cls of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture(),canvas=Cls===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Cls===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Cls(canvas,{autoStart:false,bindControls:false});r.loadScene('disk');
 const bodies=['astronaut','shuttle','iss'].map(type=>r.addObject(type,12,0,1));
 for(const body of bodies)r.updateObject(body.id,{height:0});
 let previous=1;
 for(const radius of [12,4,2.3,1.9]){
  const rates=bodies.map(body=>{r.updateObject(body.id,{radius});return r.getObjectClock(body.id).rateFactor;});
  assert(rates.every(x=>Math.abs(x/rates[0]-1)<1e-10),'Identical position and orbital speed yield identical clocks across object types');
  assert(rates[0]>previous);previous=rates[0];
 }
 const shuttle=r.objectById.get(bodies[1].id),minimum=r.minimumObjectRadiusRg(shuttle);
 assert(minimum<2.2,'Kerr proximity no longer capped by a fixed2.2rg slider floor');
 r.updateObject(shuttle.id,{radius:minimum});const close=r.getObjectClock(shuttle.id);
 assert(Number.isFinite(close.rateFactor)&&close.rateFactor>1000,'A physically close shuttle has a large finite factor');
 const life=structuredClone(shuttle.clock);r.setFreeDrive(shuttle.id,true);r.setFreeDrive(shuttle.id,false);assert.deepEqual(shuttle.clock,life);
 r.loadScene('radiant-descent');const falling=r.objects.find(o=>o.type==='astronaut');r.time=10;r.fillObjects();
 let prior=1;
 for(const t of [0,2,5,8,9,9.5,9.9,10]){
  r.time=t;r.fillObjects();const current=r.getObjectClock(falling.id);
  assert(current.rateFactor>=prior&&Number.isFinite(current.rateFactor));assert(current.prescribedRadialClock);prior=current.rateFactor;
  // Identical path physics applies to all eligible types, not just astronauts.
  for(const type of ['shuttle','iss']){const comparison={...falling,type};assert.equal(r.clockRateForObject(comparison).rateFactor,current.rateFactor);}
 }
 const frame=r.getFocusFrame(falling.id),clock=r.getObjectClock(falling.id),horizon=r.configCache.horizon[0];
 const actualRadius=Math.hypot(...frame.position),expectedRadius=compactExteriorRadius(horizon,r.objectRadius(falling));
 assert(Math.abs(actualRadius/expectedRadius-1)<1e-12);assert(actualRadius>horizon*(1+CLOCK_HORIZON_EPSILON*.99));
 assert(Number.isFinite(clock.rateFactor)&&clock.rateFactor>1000);assert(!clock.horizonLimit);
 const same=clockRate({id:falling.id,positionMeters:frame.position.map(x=>x*REFERENCE_RG_METERS),velocityMetersPerSecond:[0,0,0],sources:r.clockSources()});
 assert(Math.abs(same.rateFactor/clock.rateFactor-1)<1e-12,'Endpoint clock uses actual position without hidden clearance subtraction');
 const total=createObjectClock();advanceObjectClock(total,10,clock);assert(Math.abs(total.coordinateSeconds/(10*clock.rateFactor)-1)<1e-12,'Wall seconds are proper time, so displayed t grows by the full rate');
 r.dispose();
}
console.log('PASS: shared actual-radius clocks, deep adjustable proximity, finite epsilon endpoint, persistent Drive clock, integrated distant time on GPU/CPU controllers.');
