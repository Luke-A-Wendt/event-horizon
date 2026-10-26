import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {PHOTO_PRESETS} from '../dist/photo-renderer.js';

// The recording GL fixture alone cannot catch a GLSL call-signature failure.
// First check the contract on every generated source, then feed those actual
// sources to a native compiler when the host supplies EGL/GLES. This is not a
// browser, device-performance, or visual-quality assertion.
const bridgeScenes=SCENE_PRESETS.filter(scene=>scene.patch.bridge);
assert(bridgeScenes.length>=4);
const unique=new Map();let cases=0;
function add(name,features,webgl2){
 let vertex=VERTEX,fragment=createFragment(features);
 assert.match(fragment,/vec3 bridgeTrace\(/,name);
 const calls=[...fragment.matchAll(/\bobjectHit\(([^)]*)\)/g)];
 assert(calls.length>=2,`${name}: definition and bridge call`);
 for(const call of calls)assert.equal(call[1].split(',').length,5,`${name}: objectHit must receive the per-ray transparency mask`);
 const start=fragment.indexOf('vec3 bridgeTrace('),trace=fragment.slice(start,fragment.indexOf('return color+metricColor;',start));
 assert(trace.indexOf('transparentMask=0.0')<trace.indexOf('for('),`${name}: reset transparency once per ray, never each step`);
 assert.equal((trace.match(/transparentMask=0\.0/g)||[]).length,1);
 assert.match(trace,/body=objectHit\(p\*throat,previous\*throat,v,fraction,transparentMask\)/);
 assert.match(trace,/color\+=transmission\*body\.rgb\*body\.a;transmission\*=1\.0-body\.a/);
 assert.match(trace,/body\.a<=0\.0\|\|planetFraction<fraction/);
 if(webgl2){vertex='#version 300 es\n'+vertex.replace('attribute','in');fragment='#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor');}
 const key=createHash('sha256').update(vertex).update(fragment).digest('hex');
 if(!unique.has(key))unique.set(key,{name,vertex,fragment});
 cases++;
}
for(const webgl2 of [false,true])for(const scene of bridgeScenes){
 const f=fixture({width:320,height:200,webgl2});
 const renderer=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 renderer.loadScene(scene.id);
 for(const quality of ['low','medium','high','ultra']){
  renderer.setQuality(quality);renderer.render();
  add(`${scene.id}/${quality}/WebGL${webgl2?2:1}`,renderer.shaderFeatures(),webgl2);
 }
 for(const preset of PHOTO_PRESETS.filter(preset=>preset.steps))add(`${scene.id}/photo-${preset.id}/WebGL${webgl2?2:1}`,{...renderer.shaderFeatures(),ultra:true,photo:true,photoSteps:preset.steps},webgl2);
 // Additional bridge objects may be translucent and emissive, and may carry
 // discs/rings. Exercise all these function branches in native compilation.
 add(`${scene.id}/transparent-attachments/WebGL${webgl2?2:1}`,{...renderer.shaderFeatures(),derivatives:true,derivativeExtension:!webgl2,probe:true,attachments:true,rings:true,stellar:true,bodyGravity:true,planetary:true,diagnostics:true},webgl2);
 renderer.dispose();
}
console.log(`PASS: ${cases} bridge scene/quality/API variants preserve ray opacity and shader interfaces.`);
const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify([...unique.values()]),encoding:'utf8',maxBuffer:2*1024*1024,timeout:180000});
if(result.error?.code==='ENOENT')console.log('SKIP: Python 3 is unavailable; native shader compilation was not run.');
else{
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,`Native shader compiler failed: ${result.error?.message}`);
 assert([0,77].includes(result.status),`Native shader compilation failed with exit ${result.status}`);
}
