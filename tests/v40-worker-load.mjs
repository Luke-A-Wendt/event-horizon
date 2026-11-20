import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {snapshotRenderer,restoreRenderer,renderSignature} from '../dist/render-state.js';
import {installRenderWorker} from '../dist/render-worker.js';

// Exercise the actual worker transport/render path with a recording GL. This
// catches missing snapshots/readiness errors without pretending to test a GPU.
const host=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const wf=fixture({width:390,height:700}),messages=[];
const worker=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){},close(){}});
await worker.handle({type:'init',canvas:wf.canvas,viewport:{width:390,height:700,dpr:1},snapshot:snapshotRenderer(host),signature:renderSignature(host),presentationPaused:true});
let serial=0;
for(const preset of SCENE_PRESETS){
 host.sceneRevision=++serial;host.loadScene(preset.id);
 // Preserve the last scene's current fidelity, then measure the new workload.
 worker.renderer.budget.level=2;worker.renderer.budget.safety=0;
 const snapshot=snapshotRenderer(host),signature=renderSignature(host);
 await worker.handle({type:'state',serial,snapshot,signature,presentationPaused:false});
 assert.equal(worker.renderer.budget.level,2,preset.id+' retains High');
 assert.equal(worker.renderer.budget.pixelScale,1,preset.id+' keeps its current resolution');
 worker.renderer.render(serial*1000);worker.renderer.render(serial*1000+100);
 assert(!messages.some(m=>m.type==='error'||m.type==='render-error'&&m.message),preset.id+' restores and renders without an exception');
 assert(messages.some(m=>m.type==='annotation-frame'&&m.signature===signature||m.type==='status'&&m.stats.frameReady&&m.stats.renderedSignature===signature),preset.id+' reports a complete matching frame');
 // Frequent camera/time snapshots preserve an established adaptive tier.
 worker.renderer.budget.level=1;
 await worker.handle({type:'state',serial:serial+1000,snapshot:{sceneRevision:host.sceneRevision,sceneId:host.sceneId,camera:{...host.camera,yaw:host.camera.yaw+.02}},signature,presentationPaused:false});
 assert.equal(worker.renderer.budget.level,1,preset.id+' camera update keeps adaptation');
 messages.length=0;
}
host.setQuality('high');host.sceneRevision++;host.loadScene('bridge');
await worker.handle({type:'state',serial:9999,snapshot:snapshotRenderer(host),signature:renderSignature(host),presentationPaused:false});
assert.equal(worker.renderer.budget.effectiveQuality,'high','Explicit manual quality is retained');

// An annotated worker presents status as often as every frame. Building a
// 500-body UI catalog here consumes a substantial fraction of a frame.
function checkTelemetry(renderer){
 const full=renderer.getState(),compact=renderer.getRenderStats();
 for(const [key,value] of Object.entries(compact))assert.equal(full[key],value,key);
 for(const key of ['objects','objectTree','sceneTargets'])assert(!Object.hasOwn(compact,key));
 renderer.getObjectTree=renderer.getObjects=()=>assert.fail('Telemetry built the object catalog');
 return compact;
}
host.sceneRevision++;host.loadScene('solar-system-natural');
const solarSignature=renderSignature(host);
await worker.handle({type:'state',serial:10000,snapshot:snapshotRenderer(host),signature:solarSignature,presentationPaused:false});
assert(worker.renderer.objects.length>=500);
const compact=checkTelemetry(worker.renderer);
messages.length=0;
worker.renderer.completed(solarSignature,99999);
worker.renderer.statsStart=99999;worker.renderer.emitStats(100700);
const notices=messages.filter(m=>m.type==='status');
assert(notices.some(m=>m.stats.frameReady));assert(notices.length>=2);
for(const {stats} of notices){
 for(const key of ['qualityReduced','steps','adaptiveLevel','targetFps','effectiveQuality','webgl'])assert.equal(stats[key],compact[key],key);
}
await worker.handle({type:'dispose'});host.dispose();

fixture();const canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=()=>({width:390,height:700});
const cpu=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
cpu.cpuBudget.level='high';cpu.loadScene('solar-system');assert.equal(cpu.cpuBudget.level,'high');
cpu.cpuBudget.level='high';restoreRenderer(cpu,{sceneRevision:7,sceneId:'solar-system'});assert.equal(cpu.cpuBudget.level,'high','CPU scene revision preserves its separate budget');
cpu.cpuBudget.level='medium';restoreRenderer(cpu,{sceneRevision:7,time:2});assert.equal(cpu.cpuBudget.level,'medium');
cpu.setQuality('high');cpu.loadScene('bridge');assert.equal(cpu.cpuBudget.mode,'high','CPU manual choice survives scene changes');assert.equal(cpu.cpuBudget.level,'high','Manual CPU scenes retain their selected quality');cpu.noteCpuCost(10,1000,'frame');assert.equal(cpu.cpuBudget.level,'high');
const cpuTelemetry=checkTelemetry(cpu);assert.equal(cpuTelemetry.webgl,0);assert.equal(cpuTelemetry.effectiveQuality,'high');assert.equal(cpu.getRenderStats().targetFps,cpu.cpuBudget.cadence.target);
cpu.dispose();
console.log(`PASS: ${SCENE_PRESETS.length} worker scene snapshots, GPU/CPU fidelity retention and lightweight presentation telemetry.`);
