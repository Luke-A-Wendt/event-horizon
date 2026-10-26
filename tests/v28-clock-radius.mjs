import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {RenderHost} from '../dist/render-host.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';

// Use the production simulation/controller methods with recording graphics.
// No browser-layout or physical-device performance claim is made here.
class LogicHost extends RenderHost{startBackend(){}queueSnapshot(){}resize(){}}
function make(Class){const f=fixture();let canvas=f.canvas;if(Class===CpuRenderer){canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;}return new Class(canvas,{autoStart:false,bindControls:false});}
const relativeNear=(actual,expected)=>assert(Math.abs(actual-expected)<=Math.max(1e-20,Math.abs(expected)*1e-10),`${actual} != ${expected}`);

for(const Class of [BlackHoleRenderer,CpuRenderer,LogicHost]){
 const r=make(Class);let now=1000;
 function advance(id){
  const before=r.getObjectClock(id);r.state.paused=false;r.state.speed=1;r.lastTime=now;now+=100;r.advanceSimulation(now);r.state.paused=true;
  const after=r.getObjectClock(id),elapsed=after.coordinateSeconds-before.coordinateSeconds;
  assert(elapsed>0);relativeNear((after.lagSeconds-before.lagSeconds)/elapsed,after.lossRate);
  return after;
 }
 function editWithoutReset(object,edit){
  const clock=object.clock,saved=structuredClone(clock);assert(r.state.paused);
  edit();assert.equal(object.clock,clock);assert.deepEqual(object.clock,saved,'Paused property/map edits preserve the lifetime clock');
  return r.getObjectClock(object.id);
 }
 for(const type of ['astronaut','shuttle','iss']){
  r.loadScene('disk');const added=r.addObject(type,12,0,1),object=r.objects.find(o=>o.id===added.id);r.updateObject(object.id,{height:0});
  const initial=advance(object.id);assert(initial.lagSeconds>0);
  const far=editWithoutReset(object,()=>r.updateObject(object.id,{radius:100}));assert(far.lossRate<initial.lossRate*.2);relativeNear(advance(object.id).lossRate,far.lossRate);
  const near=editWithoutReset(object,()=>r.updateObject(object.id,{radius:4}));assert(near.lossRate>far.lossRate*10);relativeNear(advance(object.id).lossRate,near.lossRate);
  const mapFar=editWithoutReset(object,()=>assert(r.setOrbitRadiusMeters(object.id,80*r.massScale*REFERENCE_RG_METERS).ok));assert(mapFar.lossRate<near.lossRate*.2);relativeNear(advance(object.id).lossRate,mapFar.lossRate);
  const mapNear=editWithoutReset(object,()=>assert(r.setOrbitRadiusMeters(object.id,5*r.massScale*REFERENCE_RG_METERS).ok));assert(mapNear.lossRate>mapFar.lossRate*10);relativeNear(advance(object.id).lossRate,mapNear.lossRate);
 }

 // In Earth's neighborhood the Sun still contributes to the distant-clock
 // comparison. A larger local orbit changes the rate by a modest amount; the
 // measured future lag slope must nevertheless follow that changed rate.
 r.loadScene('solar-system');const earth=r.objects.find(o=>o.name==='Earth'),station=r.objects.find(o=>o.type==='iss');
 const added=r.addChildObject(earth.id,'astronaut',{orbitMeters:6771000,heightMeters:0,phase:station.phase,orbitInclination:station.orbitInclination,orbitNode:station.orbitNode,argumentPeriapsis:station.argumentPeriapsis,orbitReferenceFrame:station.orbitReferenceFrame});assert(added);
 for(const object of r.objects.filter(o=>['astronaut','shuttle','iss'].includes(o.type))){
  const near=editWithoutReset(object,()=>assert(r.setOrbitRadiusMeters(object.id,6771000).ok));assert(near.lossRate>0);advance(object.id);
  const far=editWithoutReset(object,()=>assert(r.setOrbitRadiusMeters(object.id,67710000).ok));assert(far.lossRate>near.lossRate*.5&&far.lossRate<near.lossRate,'Solar background remains while the local-orbit contribution changes');advance(object.id);
 }
 r.dispose();
}
console.log('PASS: production GPU/CPU/host clock rates respond immediately to paused property/map radius edits for all three clocked actors, lifetime totals remain intact, future lag slopes match current rates, and nested Solar-System changes retain the solar background.');
