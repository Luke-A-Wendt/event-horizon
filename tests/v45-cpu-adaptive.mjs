import assert from 'node:assert/strict';
import {CpuQualityBudget,CPU_LIVE_FLOOR,CPU_QUALITY_PROFILES,CPU_ADAPTIVE_PROFILES,CPU_STARTUP_PROFILE} from '../dist/cpu-quality.js';

const b=new CpuQualityBudget();
assert.equal(b.profile,CPU_STARTUP_PROFILE);
b.note(8,10,{complete:false});assert(b.startup,'Preparation cannot complete first preview');
b.note(8,20);assert(!b.startup);
b.level='high';const high=b.rung,profile=b.profile;
b.beginScene(100);assert.equal(b.rung,high);assert.equal(b.profile,profile);assert(!b.startup,'Scene and Drive transitions preserve the actual profile');
for(const cost of [40,1000/35,1000/30]){
 b.beginScene(100);
 for(let now=100;now<1000;now+=cost)b.note(cost,now);
 assert.equal(b.rung,high,'The 25–35 FPS band holds quality');
}
b.beginScene(1000);
for(let now=1000;now<=1100;now+=1000/60)b.note(1000/60,now);
assert.equal(b.level,'ultra');assert.equal(b.profile.width,720,'High at 60 FPS tries full CPU Ultra in approximately 100ms');
const ultra=b.rung;
b.note(1000,1110,{complete:false});assert.equal(b.rung,0,'A one-second unfinished frame triggers emergency relief without waiting for completion');
assert.equal(b.profile.bodies,CPU_QUALITY_PROFILES.low.bodies);
const sampleDrop=cost=>{const x=new CpuQualityBudget();x.level='high';x.beginScene(0);x.note(cost,200);return high-x.rung;};
assert(sampleDrop(200)>sampleDrop(80));assert(sampleDrop(80)>sampleDrop(41),'Large misses take larger steps');
const sampleRise=(cost,duration)=>{const x=new CpuQualityBudget();x.level='medium';const initial=x.rung;x.beginScene(0);for(let now=0;now<=duration;now+=cost)x.note(cost,now);return x.rung-initial;};
assert(sampleRise(1000/60,150)>sampleRise(1000/36,150),'Clear 60 FPS headroom reacts sooner than slight headroom');
assert(sampleRise(1000/36,800)>0,'Sustained slight headroom also raises fidelity');
b.level='high';b.noteInteraction(2000);assert.equal(b.rung,high,'Camera input does not blindly drop quality');
for(let now=2000;now<2200;now+=16)b.note(16,now);
assert.equal(b.rung,high,'Camera input suppresses upshifts while held');
b.note(300,2210,{complete:false});assert(b.rung<high,'Camera input never blocks needed reductions');
for(const mode of ['low','medium','high','ultra']){
 b.select(mode);b.beginScene(3000);assert.equal(b.level,mode);assert.equal(b.profile,CPU_QUALITY_PROFILES[mode]);
 b.note(2000,5000);assert.equal(b.profile,CPU_QUALITY_PROFILES[mode],'Manual quality remains fixed');
 b.select('adaptive');assert.equal(b.level,mode,'Enabling Adaptive inherits the selected tier');
}
b.beginScene(6000,{cold:true});assert.equal(b.profile,CPU_STARTUP_PROFILE,'Explicit renderer restart can request a cheap preview');
for(let i=1;i<CPU_ADAPTIVE_PROFILES.length;i++){
 const a=CPU_ADAPTIVE_PROFILES[i-1],c=CPU_ADAPTIVE_PROFILES[i];
 assert(c.width>a.width&&c.width/a.width<1.15,'Resolution increments remain granular through Ultra');
}
assert.equal(CPU_ADAPTIVE_PROFILES.at(-1).width,CPU_QUALITY_PROFILES.ultra.width);
assert(ultra>high);
// Model scenes whose CPU work scales with resolution and detail. All start
// levels must converge rather than ping-pong across a viable intermediate rung.
for(const power of [1.5,2,3])for(const base of [3,10,25,60,150])for(const start of [0,10,18,23]){
 const x=new CpuQualityBudget();x.startup=false;x.rung=start;x.beginScene(0);
 let now=0;const settled=[];
 while(now<12000){
  const cost=2+base*(x.profile.width/224)**power;
  now+=Math.max(cost,1000/30);x.note(cost,now);
  if(now>8000)settled.push({rung:x.rung,fps:1000/cost,target:x.cadence.target});
 }
 assert.equal(new Set(settled.map(s=>s.rung)).size,1,`Stable rung for ${power}/${base}/${start}`);
 for(const s of settled){
  if(s.target===15)assert(s.rung>=CPU_LIVE_FLOOR&&(s.fps>=13||s.rung===CPU_LIVE_FLOOR),'Readable live resolution at reduced cadence');
  else assert(s.fps>=25&&(s.fps<=35||s.rung===CPU_ADAPTIVE_PROFILES.length-1),`Target band or Ultra ceiling for ${power}/${base}/${start}`);
 }
}
console.log('PASS: CPU fidelity survives transitions, responsive proportional adaptation reaches Ultra, zero-frame relief, manual tiers, and interaction headroom.');

{
 const x=new CpuQualityBudget();
 for(let t=0;t<12000;t+=55){x.noteInteraction(t);x.note(55,t);}
 assert(x.rung>=CPU_LIVE_FLOOR,'Continuous flight input cannot pin the CPU preview');
 assert.equal(x.cadence.target,15);
 for(let t=12000;t<20000;t+=33)x.note(15,t);
 assert.equal(x.cadence.target,30,'Measured recovery restores preferred CPU cadence');
 assert(x.rung>CPU_LIVE_FLOOR);
}
