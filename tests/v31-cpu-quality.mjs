import assert from 'node:assert/strict';
import {CpuQualityBudget,CPU_QUALITY_PROFILES} from '../dist/cpu-quality.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';

const budget=new CpuQualityBudget();assert.equal(budget.level,'low');
for(let t=0;t<25000;t+=100)budget.note(8,t);
assert.equal(budget.level,'high','Sustained CPU headroom probes upward');
budget.note(120,26000);assert.equal(budget.level,'medium');
budget.note(120,26100);assert.equal(budget.level,'low','Expensive frames promptly lower CPU work');
budget.select('ultra');budget.note(120,27000);assert.equal(budget.level,'ultra','Manual quality stays explicit');
budget.select('adaptive');assert.equal(budget.level,'low');

const f=fixture({width:900,height:650}),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const r=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
const finite=value=>{if(typeof value==='number')assert(Number.isFinite(value));else if(Array.isArray(value))value.forEach(finite);else if(value&&typeof value==='object')Object.values(value).forEach(finite);};
function frame(){
 r.resize();canvas.beginFrame();const stages=r.paintStages();let step;do{step=stages.next();}while(!step.done);assert.equal(step.value,true);
 const result=canvas.takeFrame();finite(result);assert(result.commands.some(c=>c[0]==='fillRect'));
 let stack=0;for(const c of result.commands){if(c[0]==='save')stack++;if(c[0]==='restore')stack--;assert(stack>=0);}assert.equal(stack,0);
 assert(result.commands.length<20000);assert(result.width<=r.cpuProfile.width&&result.height<=r.cpuProfile.height);return result;
}
let maximum=0;for(const preset of SCENE_PRESETS){r.loadScene(preset.id);maximum=Math.max(maximum,frame().commands.length);}
assert(maximum<2200,'Low CPU starts with bounded, inexpensive geometry in every scene');
r.loadScene('lens-alignment');const totals=[];
for(const level of Object.keys(CPU_QUALITY_PROFILES)){r.setQuality(level);const result=frame();totals.push(result.commands.length);assert.equal(r.getState().effectiveQuality,level);assert.equal(r.getState().quality,level);}
assert(totals.every((n,i)=>i===0||n>totals[i-1]),'All four CPU choices have distinct geometric fidelity');
r.setQuality('adaptive');r.noteCpuCost(12,30000);assert.equal(r.cpuBudget.samples,0,'Command generation alone does not undercount a frame');
r.noteCpuCost(28,30001,'presentation');assert.equal(r.cpuBudget.cost,40,'CPU frame budget includes generation plus paint');
r.loadScene('warp-cruise');const ship=r.objects.find(o=>o.type==='enterprise');r.setFreeDrive(ship.id,true);frame();assert(r.warpMotionState().active);
r.dispose();
console.log(`PASS: CPU tier recovery/demotion, four distinct profiles (${totals.join('/')} commands), all ${SCENE_PRESETS.length} initial scenes at low (max ${maximum}), finite balanced frames, Drive starfield, complete frame accounting.`);
