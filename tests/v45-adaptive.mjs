import assert from 'node:assert/strict';
import {RenderBudget,QUALITY_PROFILES,ADAPTIVE_STEPS,STARTUP_PROFILE} from '../dist/performance-controller.js';

function frames(b,fps,ms,start=0){let now=start;while(now<start+ms){now+=1000/fps;b.noteCompletion(now);}return now;}
assert.equal(new RenderBudget().profile,STARTUP_PROFILE,'Cold startup is still cheap');
assert.equal(ADAPTIVE_STEPS.at(-1).profile,QUALITY_PROFILES.ultra,'Adaptive includes the real Ultra endpoint');
for(let i=1;i<ADAPTIVE_STEPS.length;i++){
 const a=ADAPTIVE_STEPS[i-1].profile,b=ADAPTIVE_STEPS[i].profile;
 assert(b.scale>=a.scale&&b.pixels>=a.pixels&&b.steps>=a.steps);
 assert(b.pixels/a.pixels<1.36,'Internal steps remain small');
}
for(const fps of [25,30,35]){
 const b=new RenderBudget();b.level=2;const before=b.step;
 frames(b,fps,2000);assert.equal(b.step,before,`${fps} FPS holds current detail`);
}
{
 const b=new RenderBudget();b.level=2;const high=b.step;
 frames(b,60,200);assert.equal(b.effectiveQuality,'ultra','High at 60FPS promptly tries Ultra');
 frames(b,60,1000,200);assert.equal(b.profile,QUALITY_PROFILES.ultra,'Persistent headroom reaches full Ultra');
 const profile=b.profile;b.beginScene(1200);assert.equal(b.profile,profile,'Scene/Drive transitions retain detail');
 assert(b.noteGpu(1300,100,false,{polls:2}));const dropped=b.step;
 assert(b.noteGpu(1500,300,false,{polls:4}));assert(b.step<dropped-1,'Longer stalls cause larger drops');
 assert(b.noteGpu(2200,1000,false,{polls:20}));assert.equal(b.step,0,'An unfinished 1s draw triggers the emergency floor');
 b.level=2;b.beginScene(2300);frames(b,36,150,2300);assert.equal(b.step,high,'Small headroom is not treated like 60FPS');
 frames(b,36,900,2450);assert(b.step>high,'Small sustained headroom still improves fidelity');
}
{
 const drop=fps=>{const b=new RenderBudget();b.level=2;const before=b.step;b.settleUntil=0;b.noteCompletion(0);frames(b,fps,300);return before-b.step;};
 assert(drop(3)>drop(20),'Greater misses reduce fidelity faster');
 const b=new RenderBudget();b.level=2;const before=b.step;b.noteInteraction(1000);
 assert.equal(b.step,before,'Input alone does not lower detail');
 frames(b,60,150,1000);assert.equal(b.step,before,'Wait for gesture to settle before promotion');
 assert(b.noteGpu(1155,200,false,{polls:3}),'A gesture does not block necessary reductions');
 b.level=3;b.limitUltra(2000);assert.equal(b.effectiveQuality,'high');
 frames(b,60,2000,2000);assert.equal(b.effectiveQuality,'high','Unsupported Ultra does not repeatedly compile');
}
for(let initial=0;initial<4;initial++){
 const b=new RenderBudget();b.level=initial;let now=0;
 for(let i=0;i<600;i++){const ms=8+b.profile.pixels/7000;now+=ms;b.noteCompletion(now);}
 assert(b.renderFps>=25&&b.renderFps<=35,`Simulated pixel workload settles in band from tier ${initial}`);
}
for(const name of ['low','medium','high','ultra']){
 const b=new RenderBudget();b.setQuality(name);const profile=b.profile;b.beginScene(1000);
 frames(b,2,2000,1000);assert.equal(b.profile,profile);assert.equal(b.noteGpu(4000,2000,false,{polls:10}),false);
 b.setQuality('adaptive',5000);assert.deepEqual(b.profile,profile,'Enabling Adaptive inherits manual fidelity');
}
console.log('PASS: adaptive 25–35FPS band, retained transitions, proportional response, real Ultra, stall relief, and stable workload convergence.');
