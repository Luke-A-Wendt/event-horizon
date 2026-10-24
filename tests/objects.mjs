import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { OBJECT_TYPES,OBJECT_KIND,REFERENCE_RG_METERS,objectRadiusMeters } from '../dist/objects.js';
import { fixture } from './render-fixture.mjs';
const f=fixture(),errors=[];
const renderer=new BlackHoleRenderer(f.canvas,{onError:message=>{if(message)errors.push(message);}});
const uniform=name=>f.uniforms.get(name).args[0];
const close=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
assert.equal(OBJECT_TYPES.length,7);
for(const {id} of OBJECT_TYPES){
 renderer.clearObjects();const obj=renderer.addObject(id,12,.6,2);renderer.render();
 assert.equal(obj.type,id);close(obj.scale,2);assert.equal(uniform('uObjectCount'),1);close(uniform('uColors[0]')[3],OBJECT_KIND[id]);
 const data=uniform('uObjects[0]');assert(data.every(Number.isFinite));
 assert(Math.abs(data[3]*REFERENCE_RG_METERS/objectRadiusMeters(id,2)-1)<1e-6,'GPU geometry retains physical dimensions');
 assert(renderer.configCache.bounds>Math.hypot(...data.slice(0,3))+data[3]);
}
renderer.clearObjects();assert.equal(renderer.addObject('shuttle',12,Infinity,.01).scale,.25);assert.equal(renderer.objects[0].phase,0);
assert.equal(renderer.addObject('enterprise',12,0,100).scale,4);
assert.equal(renderer.addObject('not-a-model',12,0,1).type,'planet');
renderer.clearObjects();renderer.addObject('iss',90,0,4);renderer.render();const scaled=uniform('uObjects[0]').slice();assert(renderer.configCache.bounds>90+scaled[3]);
renderer.clearObjects();renderer.addObject('iss',90,0,1);renderer.render();close(scaled[3],uniform('uObjects[0]')[3]*4);
renderer.clearObjects();renderer.addObject('astronaut',12,.2,1);renderer.time=0;renderer.render();const initial=uniform('uObjects[0]').slice();renderer.time=.01;renderer.render();const moved=uniform('uObjects[0]');assert(initial[2]*(moved[0]-initial[0])-initial[0]*(moved[2]-initial[2])>0,'Craft orbit follows primary angular momentum.');
renderer.update({primaryTilt:90,primaryAzimuth:35});renderer.render();assert(uniform('uObjects[0]').every(Number.isFinite));
assert.equal(errors.length,0);renderer.dispose();
console.log('PASS: procedural object catalog, GPU kinds, conservative bounds, physical dimensions, scale clamps, finite phases, coherent orbits.');
