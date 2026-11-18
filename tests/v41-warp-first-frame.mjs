import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
// Optional real first-draw check, not a browser/device performance claim.
// Use MESA_SHADER_CACHE_DISABLE=true for cold Mesa diagnostics. The check does
// not assert a universal timing threshold; printed timings expose regressions.
const cases=[];
for(const id of ['warp-lab','warp-orbit']){
 const f=fixture({width:390,height:700}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene(id);r.setQuality('low');r.render(1000);
 cases.push({name:id,vertex:f.activeSources.find(s=>s.type===35633).source,fragment:f.activeSources.find(s=>s.type===35632).source,firstFrameUniforms:[...f.uniforms].map(([name,value])=>({name,...value}))});r.dispose();
}
const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:90000});
if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
if(result.status===0)assert.equal((result.stdout.match(/FIRST FRAME:/g)||[]).length,2,'Both shaders reach a real completed draw');
