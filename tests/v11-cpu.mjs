import assert from 'node:assert/strict';
import { CpuRenderer, cpuColor, cpuProject, cpuSpectrum } from '../dist/cpu-renderer.js';
import { CpuCommandCanvas } from '../dist/cpu-commands.js';
import { SCENE_PRESETS } from '../dist/config.js';
import { fixture } from './render-fixture.mjs';

// Exercise the actual preset/camera/object/projection path. This records Canvas
// operations; it is not a browser emulator or a physical-phone benchmark.
const f=fixture({width:640,height:400}),canvas=new CpuCommandCanvas(),errors=[];
const spectra=['visible','infrared','xray','radio','gamma'];
canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const renderer=new CpuRenderer(canvas,{bindControls:false,autoStart:false,onError:e=>errors.push(e)});
let frames=0,maxCommands=0,maxStageCommands=0;
const finite=value=>{
 if(typeof value==='number')assert.ok(Number.isFinite(value),'Canvas numeric arguments must be finite');
 else if(Array.isArray(value))value.forEach(finite);
 else if(value&&typeof value==='object')Object.values(value).forEach(finite);
};
function record(){
 canvas.beginFrame();const stages=renderer.renderStages(100000,false,true);let step,previous=0;
 do{step=stages.next();maxStageCommands=Math.max(maxStageCommands,canvas.commands.length-previous);previous=canvas.commands.length;}while(!step.done);
 assert.equal(step.value,true,`${renderer.state.scene} must render a complete frame`);
 const frame=canvas.takeFrame();finite(frame);
 assert.equal(frame.width,640);assert.equal(frame.height,400);
 assert.ok(frame.commands.some(command=>command[0]==='fillRect'),'even an intentionally empty scene paints its background');
 assert.ok(frame.commands.length<20000,'frame command budget is bounded');
 let stack=0;for(const command of frame.commands){if(command[0]==='save')stack++;if(command[0]==='restore')stack--;assert.ok(stack>=0,'Canvas restore must have a matching save');}assert.equal(stack,0);
 for(const gradient of frame.gradients){assert.ok(gradient.args[2]>=0&&gradient.args[5]>=0);assert.ok(gradient.stops.every(([offset])=>offset>=0&&offset<=1));}
 maxCommands=Math.max(maxCommands,frame.commands.length);frames++;return frame;
}

for(const scene of SCENE_PRESETS){
 renderer.loadScene(scene.id);
 record(); // First frame matters: it is what dismisses the scene loading screen.
 renderer.update({paused:true});
 for(let step=0;step<120;step++)renderer.advanceSimulation(1000+step*17);
 for(const time of [0,45,240]){
  renderer.time=time;
  for(const spectrum of spectra){renderer.update({spectrum});assert.equal(renderer.state.spectrum,spectrum);record();}
 }
}
assert.ok(!errors.some(Boolean),errors.join('\n'));
assert.ok(maxStageCommands<500,'geometry generation yields between bounded rows/rings/objects');

// A dark authored scene is valid. Never infer failure from its pixel colors.
renderer.loadScene('empty-space');renderer.update({stars:false,nebula:false,grid:false});
const empty=record();assert.equal(empty.commands.filter(c=>c[0]==='fillRect').length,1);

// Corrupt geometry must fail before the first paint, rather than publish a
// seemingly successful background-only frame. Recovery must remain possible.
const updateCameraFrame=renderer.updateCameraFrame.bind(renderer);
renderer.updateCameraFrame=()=>{updateCameraFrame();renderer.cameraFrame.observer[0]=NaN;};
canvas.beginFrame();assert.equal(renderer.render(100000,false,true),false);
assert.equal(canvas.commands.length,0);assert.match(errors.at(-1),/camera orientation/);
await assert.rejects(renderer.captureImage(),/camera orientation/,'invalid geometry must not export a stale image');
renderer.updateCameraFrame=updateCameraFrame;record();
assert.equal(renderer.geometryError,'');

const rgb=[.8,.6,.3],light=values=>values.reduce((a,b)=>a+b,0);
for(const kind of ['surface','star','source','hot','nebula','jet','probe','white-hole'])assert.deepEqual(cpuSpectrum(rgb,'visible',kind),rgb,'visible palettes are preserved');
for(const band of ['radio','gamma']){
 assert.ok(light(cpuSpectrum(rgb,band,'jet'))>100*light(cpuSpectrum(rgb,band,'surface')),'high-energy plasma must dominate cold surfaces');
 assert.ok(light(cpuSpectrum(rgb,band,'probe'))<.01,'a visible beacon does not become a bright high-energy source');
}
assert.ok(light(cpuSpectrum(rgb,'gamma','hot',1))>100*light(cpuSpectrum(rgb,'gamma','hot',.15)),'gamma emission is concentrated in the hot inner flow');
assert.ok(light(cpuSpectrum(rgb,'radio','nebula'))>10*light(cpuSpectrum(rgb,'gamma','nebula')),'ordinary clouds are strongly suppressed in gamma');
const camera={observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]};
assert.equal(cpuProject([Infinity,0,0],camera,640,400),null);
assert.equal(cpuProject([0,0,0],camera,Infinity,400),null);

renderer.loadScene('nasa-shuttle');renderer.focusObject(renderer.objects[0].id,'onboard');
for(const spectrum of spectra){
 renderer.update({spectrum});const commands=record().commands;
 assert.ok(!commands.some(c=>c[0]==='property'&&c[1]==='fillStyle'&&c[2]===cpuColor('#4b5145',spectrum)),`No cockpit overlay in ${spectrum}`);
}
renderer.dispose();
console.log(`PASS: ${SCENE_PRESETS.length} CPU presets, ${frames} first/settled/evolved spectral frames, finite geometry, invalid-frame refusal, component spectra, cockpit response, and bounded cooperative stages (${maxCommands} commands/frame; ${maxStageCommands} commands/stage maximum).`);
