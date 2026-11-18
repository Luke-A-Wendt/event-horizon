import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS,makePreset} from '../dist/config.js';
import {bridgeGLSL} from '../dist/bridge-glsl.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {objectRadiusMeters} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';

const scene=SCENE_PRESETS.find(s=>s.id==='bridge-blackhole');
assert.equal(scene.category,'Geometry');assert.equal(makePreset(scene.id).spectrum,'geometry');
assert.equal(scene.camera.pitch,.2,'Both perpendicular sheets remain visible in an oblique opening view');
for(const id of ['shuttle-earth-moon-loop','shuttle-earth-mars-loop']){
 const ship=SCENE_PRESETS.find(s=>s.id===id).objects.find(o=>o.type==='shuttle');
 assert.equal(ship.orbitMeters,1.04*6371000+2*objectRadiusMeters('shuttle'));
}
const source=bridgeGLSL({bodyGravity:true}),bodyGrid=source.slice(source.indexOf('vec4 bridgeBodyGridAt('),source.indexOf('// Finite worlds'));
assert.match(bodyGrid,/coordinateGridChart\(point\)/);assert(!bodyGrid.includes('atan('));assert(!bodyGrid.includes('gridRadialDelta'));
assert.match(source,/bridgeBodyGridSegment\(previous\*throat,p\*throat/);
assert.match(source,/bridgeBodyGridEscape\(p\*throat/);
const withoutBody=bridgeGLSL({bodyGravity:false}),polar=s=>s.slice(s.indexOf('vec4 bridgeGridAtAxis('),s.indexOf('// Finite worlds')).split('// The traveler')[0];
assert.equal(polar(source).trim(),polar(withoutBody).trim(),'The wormhole polar grid is unchanged');
const cases=[];
for(const webgl2 of [false,true]){
 const r=new BlackHoleRenderer(fixture({webgl2}).canvas,{autoStart:false,bindControls:false});r.loadScene(scene.id);r.render();assert(r.validateFrameGeometry());
 let vertex=VERTEX,fragment=createFragment({...r.shaderFeatures(),derivativeExtension:!webgl2});
 if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
 cases.push({name:`Cartesian black-hole bridge grid ES${webgl2?3:1}`,vertex,fragment});r.dispose();
}
const native=spawnSync('python3',['tests/native-glsl.py'],{input:JSON.stringify(cases),encoding:'utf8',timeout:60000});
if(native.stdout)process.stdout.write(native.stdout);if(native.stderr)process.stderr.write(native.stderr);assert(!native.error);assert([0,77].includes(native.status));
console.log('PASS: independent Cartesian traveler sheet, unchanged wormhole grid, geometric preset, tighter authored loop parking, and two native shader variants.');
