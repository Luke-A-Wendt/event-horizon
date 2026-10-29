import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer,cpuVisibleBodies} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {anomalyGradient,anomalyGridOffset,anomalySkyDirection} from '../dist/anomaly.js';
import {createOpticalContext,opticalForce,hasWeakOpticalField} from '../dist/optical-projection.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
const region={position:[0,0,0],radius:10,anomalyStrength:2,anomalyScale:1.3,anomalyMotion:1};
for(const t of [0,1,100])for(const p of [[0,0,0],[2,3,4],[29.999999,0,0],[30,0,0],[1e6,0,0]])assert(anomalyGradient(p,region,t).every(Number.isFinite));
assert.deepEqual(anomalyGradient([30,0,0],region),[0,0,0]);
assert.deepEqual(anomalyGradient([0,0,0],{...region,anomalyStrength:0}),[0,0,0]);
assert.deepEqual(anomalyGradient([1,2,3],{...region,anomalyMotion:0},0),anomalyGradient([1,2,3],{...region,anomalyMotion:0},100));
assert.notDeepEqual(anomalyGradient([1,2,3],region,0),anomalyGradient([1,2,3],region,10));
assert(anomalyGridOffset([1,0,2],[region],1).some(v=>Math.abs(v)>.01));
assert(Math.abs(Math.hypot(...anomalySkyDirection([0,0,1],[1,0,-30],[region]))-1)<1e-12);

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:480,height:320}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('gravity-anomaly');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const anomaly=r.objects.find(o=>o.type==='anomaly'),ship=r.objects.find(o=>o.type==='enterprise');assert(anomaly&&ship&&r.state.warp&&r.state.grid);
 assert.equal(r.anomalyFrames.length,1);assert.equal(r.anomalyFrames[0].massSolar,0);assert(!r.renderObjects.some(o=>o.type==='anomaly'));
 assert(!cpuVisibleBodies(r.objectFrames,r.cameraFrame,480,320).some(o=>o.type==='anomaly'),'An anomaly has no opaque surface');
 r.focusTarget(anomaly.id,'track');r.zoom(.01);assert(r.target.focusDistance<1,'A region is not a solid camera barrier');r.focusTarget(ship.id,'track');
 assert(!r.canParentObject('planet',anomaly.id).ok);assert(!r.canParentObject('anomaly',ship.id).ok);assert(!r.getOrbitEditInfo(anomaly.id).editable);
 const optics=createOpticalContext(r);assert.equal(optics.anomalies.length,1);assert(!optics.bodies.some(o=>o.type==='anomaly'));assert(!hasWeakOpticalField(optics));
 const force=opticalForce({...optics,lensing:true,warp:null},optics.anomalies[0].position,[0,0,1]);assert(force.every(Number.isFinite));assert(force.some(v=>Math.abs(v)>0));
 r.updateObject(anomaly.id,{anomalyStrength:0,radiusMeters:9000});assert.equal(r.anomalyFrames[0].anomalyStrength,0);assert.equal(parseScene(serializeScene(r)).objects.find(o=>o.id===anomaly.id).radiusMeters,9000);
 for(let i=0;i<3;i++)assert(r.addChildObject('space','anomaly'));
 assert(!r.addChildObject('space','anomaly'));assert.match(r.lastTreeError,/four/);
 assert(!r.addObject('anomaly'));r.removeTreeObject(anomaly.id);assert(r.addChildObject('space','anomaly'));
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>0);}
 r.loadScene('disk');assert(!r.shaderFeatures().anomaly);r.dispose();
}
assert(!createFragment().includes('vec3 anomalyGradient'));
const cases=[false,true].map(webgl2=>{let vertex=VERTEX,fragment=createFragment({anomaly:true,warp:true,grid:true,craft:true,craftMask:8});if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}return {name:`anomaly/WebGL${webgl2?2:1}`,vertex,fragment};});
const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',timeout:60000});
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
console.log('PASS: bounded anomaly field, no singular or opaque body, Space-only leaf, four-region cap, CPU/GPU optical context, configurable field, YAML and absent-feature fast path.');
