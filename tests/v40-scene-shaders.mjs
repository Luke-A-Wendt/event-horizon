import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';

// Compile the actual first live shader, rather than the Ultra/photo variant
// used to bake thumbnails. Source-key deduplication keeps the native work small.
const variants=new Map();
for(const webgl2 of [false,true]){
 const f=fixture({width:320,height:200,webgl2});
 const renderer=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
 renderer.setQuality('low');
 for(const scene of SCENE_PRESETS){
  renderer.loadScene(scene.id);renderer.render();
  assert(renderer.activeProgram,`${scene.id}: requests a live program`);
  assert.equal(renderer.activeProgram.features.ultra,false);
  const sources=f.activeSources;
  const vertex=sources.find(source=>source.type===35633).source;
  const fragment=sources.find(source=>source.type===35632).source;
  const key=createHash('sha256').update(vertex).update(fragment).digest('hex');
  if(!variants.has(key))variants.set(key,{name:`${scene.id}/low/WebGL${webgl2?2:1}`,vertex,fragment});
 }
 renderer.dispose();
}
console.log(`Checking ${SCENE_PRESETS.length} scenes, ${variants.size} unique initial WebGL programs.`);
const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify([...variants.values()]),encoding:'utf8',maxBuffer:2*1024*1024,timeout:180000});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
assert(!result.error,`Native compiler failed: ${result.error?.message}`);
assert([0,77].includes(result.status),`Live shader compilation failed with exit ${result.status}`);
