import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {CLUSTER_GLSL} from '../dist/cluster-glsl.js';
const r=new BlackHoleRenderer(fixture({width:390,height:720}).canvas,{autoStart:false,bindControls:false});
r.loadScene('horizon-hierarchy');
const bodies=r.objects.filter(o=>o.type==='blackhole');
assert.equal(bodies.length,18);assert.equal(r.orbitPairs.size,9);assert.equal(r.objects.length,18);
assert(bodies.every(o=>Math.abs(o.massSolar/30e6-1)<.15));assert.equal(r.state.mass,30);
assert.equal(bodies.filter(o=>o.parentId==='space').length,9);
assert.equal(parseScene(serializeScene(r)).objects.length,18,'Comparable pairs remain legal and saveable');
const ids=new Set(['primary',...bodies.map(o=>o.id)]),first=new Map();let moved=false;
for(const time of [0,6,27,90])for(const quality of ['low','high']){
 r.setQuality(quality);r.time=time;r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const bank=r.fillClusterSources([2,-3,4]);assert.equal(bank.count,19);assert.deepEqual(new Set(bank.ids),ids);
 for(const key of ['bodies','params','colors','axes'])assert(bank[key].every(Number.isFinite));
 for(let i=0;i<19;i++){assert(bank.bodies[i*4+3]>0);assert.equal(bank.params[i*4+3],0);assert.equal(bank.colors[i*4+3],0);if(i)assert(bank.depths[i]>=bank.depths[i-1]);}
 for(const body of bodies){const frame=r.getFocusFrame(body.id);if(!first.has(body.id))first.set(body.id,[...frame.position]);else if(Math.hypot(...frame.position.map((v,i)=>v-first.get(body.id)[i]))>frame.radius)moved=true;}
 assert(r.validateFrameGeometry());
}
assert(moved);
for(const body of bodies){r.focusTarget(body.id,'track');r.updateCameraFrame();const bank=r.fillClusterSources(r.getFocusFrame(body.id).position);assert.equal(bank.count,19);assert.deepEqual(new Set(bank.ids),ids,'Tracking cannot exchange away distant horizons');}
assert.equal(r.state.disk,false);assert.equal(r.state.nebula,true);assert.equal(r.state.nebulaColor,'#ff168d');assert.equal(r.state.nebulaVolume,false);assert(!r.objects.some(o=>o.type==='disk'||o.type==='jets'));
assert(CLUSTER_GLSL.includes('j<24'));assert(!CLUSTER_GLSL.includes('i<288')&&!CLUSTER_GLSL.includes('i<768'));
assert(CLUSTER_GLSL.includes('out float surfaceDistance'));assert(CLUSTER_GLSL.includes('point+=direction*segment'));assert(CLUSTER_GLSL.includes('origin=uHoles[0].xyz'));assert(!CLUSTER_GLSL.includes('bend*min(1.0,.75'));assert(!CLUSTER_GLSL.includes('vec3 halo='));
r.dispose();console.log('PASS: all19 comparable bare cluster holes retained across time,quality,camera;9legalbinarypairs; finite typedbank; ordered lens bank; hot pink nebula; boundedanalyticshader.');
