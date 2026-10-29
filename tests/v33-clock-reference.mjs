import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {RenderHost} from '../dist/render-host.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {clockRate} from '../dist/object-clocks.js';
class LogicHost extends RenderHost{startBackend(){}queueSnapshot(){}resize(){}}
const near=(a,b,t=1e-10)=>assert(Math.abs(a-b)<=Math.max(1,Math.abs(a),Math.abs(b))*t,`${a} ≠ ${b}`);
for(const Class of [BlackHoleRenderer,CpuRenderer,LogicHost]){
 const f=fixture(),canvas=Class===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Class===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Class(canvas,{autoStart:false,bindControls:false});r.loadScene('disk');
 const actors=['astronaut','shuttle','iss'].map(type=>{const id=r.addObject(type,12,0,1).id;return r.objects.find(o=>o.id===id);});
 for(const actor of actors){
  const unit=r.massScale*REFERENCE_RG_METERS;
  assert(r.setOrbitRadiusMeters(actor.id,5*unit).ok);
  near(r.getObjects().find(o=>o.id===actor.id).radius,5);
  r.updateObject(actor.id,{height:0});assert.equal(actor.heightMeters,0,'The height slider must clear the actual meter-based height');
  r.updateObject(actor.id,{radius:r.minimumObjectRadiusRg(actor)});
  const reading=r.getObjectClock(actor.id);assert(reading.rateFactor>1000&&Number.isFinite(reading.rateFactor));
  assert(reading.horizonGapMeters>0);assert.equal(reading.properSecondsPerWallSecond,1);
  near(reading.referenceDistanceMeters,Math.hypot(...r.getFocusFrame(actor.id).position)*REFERENCE_RG_METERS);
  near(reading.horizonGapMeters,reading.referenceDistanceMeters-reading.horizonRadiusMeters);
  r.updateObject(actor.id,{heightMeters:.2*unit});near(r.getObjects().find(o=>o.id===actor.id).height,.2);
  r.updateObject(actor.id,{height:0,radius:5});
 }
 const rates=actors.map(o=>r.getObjectClock(o.id).rateFactor);rates.forEach(rate=>near(rate,rates[0]));
 let now=1000;r.lastTime=now;r.sceneLoad?.complete(r.sceneLoad.revision);r.state.paused=false;r.state.speed=1;
 function tick(){const before=actors.map(o=>o.clock.properSeconds);now+=100;r.advanceSimulation(now);actors.forEach((o,i)=>near(o.clock.properSeconds-before[i],.1));}
 tick();const ship=actors.find(o=>o.type==='shuttle'),beforeDrive=structuredClone(ship.clock);
 r.setFreeDrive(ship.id,true);assert.deepEqual(ship.clock,beforeDrive);tick();
 r.setFreeDrive(ship.id,false);tick();r.state.speed=2;const before=ship.clock.properSeconds;now+=100;r.advanceSimulation(now);near(ship.clock.properSeconds-before,.1);
 r.state.paused=true;const paused=structuredClone(ship.clock);now+=100;r.advanceSimulation(now);assert.deepEqual(ship.clock,paused);
 const nearMass=r.getObjectClock(actors[0].id);r.update({mass:r.state.mass*.5});const farMass=r.getObjectClock(actors[0].id);assert(farMass.rateFactor<nearMass.rateFactor,'Meter-based orbit responds immediately to central mass edits');
 for(const actor of actors){const reading=r.getObjectClock(actor.id);near(reading.properSeconds+reading.lagSeconds,reading.coordinateSeconds);assert(reading.lagSeconds<=reading.coordinateSeconds);}
 r.loadScene('radiant-descent');const fall=r.objects.find(o=>o.type==='astronaut');r.time=10;r.fillObjects();const fallen=r.getObjectClock(fall.id);assert(fallen.rateFactor>1000&&Number.isFinite(fallen.rateFactor));assert(fallen.horizonGapMeters>0);
 r.dispose();
}
// Rounded render horizon constants still preserve exact rate/loss complement.
const source={massSolar:1,horizonMeters:2*1476.62504,positionMeters:[0,0,0]};
for(const gap of [1,.001,1e-6]){const rate=clockRate({positionMeters:[source.horizonMeters*(1+gap),0,0],sources:[source]});near(rate.properRate+rate.lossRate,1,2e-15);}
console.log('PASS: map/property unit synchronization, immediate deep-horizon rates and clearance, equal clock types, one playback reference through Drive/pause/speed/mass edits, finite endpoints on GPU/CPU/host.');
