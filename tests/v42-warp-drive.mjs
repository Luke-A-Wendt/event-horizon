import {LOW_PIXEL_SCALES} from '../dist/performance-controller.js';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';

// Replay the actual same-target Drive + scene reselection sequence. Recording
// WebGL checks the state transitions; optional native EGL verifies completed
// draws, including deferred driver compilation. This is not a device benchmark.
const cases=[];
for(const sceneId of ['warp-lab','warp-orbit']){
 const f=fixture({width:390,height:700});
 const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 r.now=()=>f.control.now;
 function capture(stage,now){
  f.control.now=now;assert(r.render(now),sceneId+'/'+stage+' submits');
  assert(r.activeProgram.features.warpLocal,stage+' keeps local warp tracing');
  assert.equal(r.activeProgram.features.warpOnly,sceneId==='warp-lab');
  assert(r.activeProgram.features.warpLocalOnlyCraft,stage+' keeps one craft pass');
  cases.push({name:sceneId+'/'+stage,vertex:f.activeSources.find(s=>s.type===35633).source,fragment:f.activeSources.find(s=>s.type===35632).source,firstFrameUniforms:[...f.uniforms].map(([name,value])=>({name,...value}))});
  return f.activeProgram;
 }
 r.loadScene(sceneId);
 const initial=capture('load',1000),craftId=r.warpObjectId;
 // Simulate detail learned from completed frames before selecting Drive. Drive
 // can have the same focus, but its zero-power camera is a new, much closer view.
 r.budget.level=2;r.budget.safety=0;
 assert(r.setFreeDrive(craftId,true));r.focusTarget(craftId,'track',false,true);
 assert.equal(r.budget.effectiveQuality,'low','Same-target Drive starts at Low');
 assert.equal(r.budget.safety,LOW_PIXEL_SCALES.length-1,'Drive starts at the smallest adaptive pixel floor');
 const drive=capture('drive-zero',2000);
 assert.equal(drive,initial,'Same-focus Drive reuses the program');
 assert.equal(r.state.warpFactor,0,'Manual Drive begins without warp power');
 r.setFlightPower(5);capture('drive-warp5',3000);
 r.loadScene(sceneId);
 const reselect=capture('reselect',4000);
 assert.equal(reselect,initial,'Repeated scene selection reuses the program');
 assert.equal(r.driveId,null,'Reselection leaves Drive');
 assert.equal(r.budget.effectiveQuality,'low');assert.equal(r.budget.safety,LOW_PIXEL_SCALES.length-1);
 const compiled=f.programs.length;
 for(let i=0;i<8;i++){
  const id=r.warpObjectId;
  r.budget.level=2;r.budget.safety=0;r.setFreeDrive(id,true);
  assert.equal(r.budget.effectiveQuality,'low');assert.equal(r.budget.safety,LOW_PIXEL_SCALES.length-1);
  f.control.now=5000+i*1000;assert(r.render(f.control.now));
  r.budget.level=2;r.budget.safety=0;r.setFreeDrive(id,false);
  assert.equal(r.budget.effectiveQuality,'low','Leaving Drive also starts conservatively');
  assert.equal(r.budget.safety,LOW_PIXEL_SCALES.length-1);
  f.control.now+=250;assert(r.render(f.control.now));
  r.loadScene(sceneId);f.control.now+=250;assert(r.render(f.control.now));
  assert(r.programs.size<=4,'Completed program cache stays bounded');
 }
 assert.equal(f.programs.length,compiled,'Repeated Drive/exit/reselection does not compile more programs');
 r.setQuality('high');r.setFreeDrive(r.warpObjectId,true);
 assert.equal(r.quality,'high');assert.equal(r.budget.effectiveQuality,'high','Explicit quality remains user-controlled');
 r.setFreeDrive(r.driveId,false);assert.equal(r.budget.effectiveQuality,'high');
 r.dispose();
}
if(process.argv.includes('--native')){
 const result=spawnSync('python3',[fileURLToPath(new URL('./native-glsl.py',import.meta.url))],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:1024*1024,timeout:90000});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 assert(!result.error,result.error?.message);assert([0,77].includes(result.status));
 if(result.status===0)assert.equal((result.stdout.match(/FIRST FRAME:/g)||[]).length,cases.length);
}
console.log('PASS: mobile-sized Warp → Drive → warp 5 → exit/reselection restores the adaptive floor, preserves explicit quality, and reuses bounded cached programs across repeated cycles.');
