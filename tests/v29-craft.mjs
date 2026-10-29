import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {OBJECT_KIND,OBJECT_CLASS,OBJECT_DIMENSIONS} from '../dist/objects.js';
import {createCraftGLSL} from '../dist/craft-glsl.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
assert.equal(OBJECT_KIND.heighliner,12);assert.equal(OBJECT_CLASS.heighliner,2);assert.equal(OBJECT_DIMENSIONS.heighliner.lengthMeters,10000);
for(const mask of [0,2,8,15,16,31]){
 const source=createCraftGLSL({mask});assert.equal(source.includes('// Guild Heighliner:'),!!(mask&16));assert.equal(source.includes('// Shuttle: nose-to-engine'),!!(mask&2));
 assert.equal((source.match(/{/g)||[]).length,(source.match(/}/g)||[]).length);
}
for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:400,height:300}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('empty-space');const ship=r.addChildObject('space','heighliner');assert(ship);assert(!r.canParentObject('star',ship.id).ok);r.fillHoles();r.fillObjects();assert(r.shaderFeatures().craftMask&16);
 const radius=r.getFocusFrame(ship.id).radius;r.updateObject(ship.id,{scale:2});assert.equal(r.getFocusFrame(ship.id).radius,2*radius);
 for(const mode of ['track','chase','onboard']){assert(r.focusTarget(ship.id,mode,false,true));r.updateCameraFrame();assert(r.cameraFrame.observer.every(Number.isFinite));assert(r.validateFrameGeometry());}
 if(Renderer===CpuRenderer){r.focusTarget(ship.id,'track',false,true);canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>0);}r.dispose();
}
const cases=[];
for(const webgl2 of [false,true])for(const mixed of [false,true]){
 let vertex=VERTEX,fragment=createFragment({craft:true,craftMask:mixed?31:16,rings:mixed,dyson:mixed,stellar:mixed});
 assert.match(fragment,/hollowCylinderHit/);assert.match(fragment,/steer>=0\.0\?-\.145:\.145/);
 if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
 cases.push({name:`heighliner/${mixed?'mixed':'isolated'}/ES${webgl2?3:1}`,vertex,fragment});
}
const compiled=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:90000});
if(compiled.stdout)process.stdout.write(compiled.stdout);if(compiled.stderr)process.stderr.write(compiled.stderr);assert(!compiled.error,compiled.error?.message);assert([0,77].includes(compiled.status));
console.log('PASS: Heighliner registration, selective model compilation, physical rescaling, GPU/CPU camera paths and native craft/attachment shader variants.');
