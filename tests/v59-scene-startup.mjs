import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {createFragment,VERTEX} from '../dist/shaders.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';

// Visit a previously compiled scene before the cache fills. Its recent use
// must keep it resident when the next feature variant arrives, within the
// existing four-program memory bound.
{
 const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.setQuality('low');
 const visit=scene=>{r.loadScene(scene);r.requestProgram();return r.activeProgram;};
 const bridge=visit('bridge');
 visit('disk');visit('geometry');visit('warp-lab');
 assert.equal(r.programs.size,4);
 assert.equal(visit('bridge'),bridge);
 const count=f.programs.length;
 visit('solar-system-natural');
 assert.equal(r.programs.size,4,'GPU program memory remains bounded');
 assert(r.programs.has(bridge.key),'Recent bridge visit survives cache pressure');
 assert.equal(visit('bridge'),bridge);
 assert.equal(f.programs.length,count+1,'Revisiting the bridge does not compile again');
 assert.equal(f.calls.finish,0);r.dispose();
}

const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const apply=app.slice(app.indexOf('async function applyPreset(id){'),app.indexOf('async function loadSceneSnapshot('));
assert(apply.indexOf("$('atlasDialog').close()")<apply.indexOf('renderer?.requestSceneLoad'));
assert(apply.indexOf("$('sceneTitle').textContent=p.title")<apply.indexOf('await sceneChoicePaint()'));
assert(apply.indexOf('await sceneChoicePaint()')<apply.indexOf('state=makePreset(p.id)'));

// Remove unreachable functions, not effects. The bridge still uses its own
// bending integrator and available craft/material/nebula branches.
const variants=new Map();
for(const scene of SCENE_PRESETS.filter(p=>p.patch.bridge)){
 const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.setQuality('low');r.loadScene(scene.id);
 for(const extra of [{},{ultra:true},{photo:true,photoSteps:1024}]){
  const features={...r.shaderFeatures(),...extra},source=createFragment(features);
  assert(source.includes('vec3 bridgeTrace('),scene.id);
  assert(!source.includes('vec4 discAt('),scene.id+': unused black-hole disc removed');
  assert(source.includes('CraftSurface craftHit('),scene.id+': traveler retained');
  const key=createHash('sha256').update(source).digest('hex');
  if(!variants.has(key))variants.set(key,{name:scene.id+(extra.photo?'/photo':extra.ultra?'/ultra':'/live'),features});
 }
 r.dispose();
}
console.log('PASS: immediate title/blank handoff ordering, four-program LRU reuse, and reachable bridge graphics.');

if(process.argv.includes('--native')){
 const sources=[...variants.values()];
 // Compile both WebGL language versions; photo variants share the same
 // interfaces but have their independently bounded photographic loops.
 const both=sources.flatMap(v=>{
  const fragment=createFragment({...v.features,derivatives:true,derivativeExtension:false});
  return [{name:v.name+'/WebGL1',vertex:VERTEX,fragment:createFragment({...v.features,derivatives:true,derivativeExtension:true})},
   {name:v.name+'/WebGL2',vertex:'#version 300 es\n'+VERTEX.replace('attribute','in'),fragment:'#version 300 es\n'+fragment.replace('precision highp float;','precision highp float;\nout vec4 outColor;').replaceAll('gl_FragColor','outColor')}];
 });
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(both),encoding:'utf8',maxBuffer:1024*1024,timeout:180000});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,`Native compiler: ${result.error?.message}`);
 assert([0,77].includes(result.status),`Native compile failed: ${result.status}`);
}
