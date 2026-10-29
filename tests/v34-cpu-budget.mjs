import assert from 'node:assert/strict';
import {CpuQualityBudget,CPU_QUALITY_PROFILES} from '../dist/cpu-quality.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';

const budget=new CpuQualityBudget();
for(let t=0;t<13000;t+=100)budget.note(28,t);
assert.equal(budget.level,'high','More than 30 FPS of headroom promotes through named levels');
for(let t=13000;t<20000;t+=100)budget.note(50,t);
assert.equal(budget.level,'high','20 FPS is inside the requested band, not a downgrade');
for(let t=20000;t<22500;t+=100)budget.note(90,t);
assert.equal(budget.level,'low');assert.equal(budget.relief,2,'Persistent slow Low frames reach the lower CPU floor');
assert(budget.profile.width<CPU_QUALITY_PROFILES.low.width);assert.equal(budget.profile.bodies,CPU_QUALITY_PROFILES.low.bodies,'Emergency detail does not reduce the body slot limit');
for(let t=22500;t<60000;t+=100)budget.note(20,t);
assert.equal(budget.relief,0);assert.equal(budget.level,'high','Emergency resolution and named detail recover');
budget.select('ultra');for(let t=60000;t<63000;t+=100)budget.note(300,t);
assert.equal(budget.level,'ultra');assert.equal(budget.profile,CPU_QUALITY_PROFILES.ultra,'Manual Ultra remains unchanged');

const f=fixture({width:900,height:650}),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const r=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
r.loadScene('lens-alignment');canvas.beginFrame();const stages=r.paintStages();assert.equal(stages.next().done,false);assert.equal(canvas.commands.length,0,'First CPU task yields before any painting');
assert.equal(stages.next().done,false);assert.equal(canvas.commands.length,0,'Object setup has its own task boundary');
let step;do{step=stages.next();}while(!step.done);assert.equal(step.value,true);
assert(canvas.takeFrame().commands.length<700,'Coarse Low reduces actual command generation for a complex grid scene');
r.dispose();
console.log('PASS: CPU 15–30 Hz hold band, >30 recovery, lower emergency floor, object budget retained, unchanged Ultra, and cooperative setup.');
