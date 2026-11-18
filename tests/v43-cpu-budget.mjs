import assert from 'node:assert/strict';
import {CpuQualityBudget,CPU_QUALITY_PROFILES,CPU_ADAPTIVE_PROFILES,CPU_STARTUP_PROFILE} from '../dist/cpu-quality.js';

const b=new CpuQualityBudget();
assert.equal(b.profile,CPU_STARTUP_PROFILE);
assert(b.profile.width<112&&b.profile.height<74,'First preview has a lower floor than the previous 112×74');
assert.equal(b.profile.bodies,CPU_QUALITY_PROFILES.low.bodies,'Resolution floor retains the Low body budget');
b.note(1,100,{complete:false});assert(b.startup,'Preparation cannot complete startup');
b.note(25,200);assert(!b.startup);
for(let now=225;now<16000;now+=25)b.note(25,now);
assert.equal(b.level,'ultra');assert.equal(b.profile.width,720,'Sustained >35FPS capacity reaches full Ultra');
const high=b.rung;
for(let now=16000;now<19000;now+=40)b.note(40,now);
assert.equal(b.rung,high,'25FPS is inside the hold band');
for(let now=19000;now<22000;now+=1000/35)b.note(1000/35,now);
assert.equal(b.rung,high,'35FPS is inside the hold band');
b.note(41,22100);assert(b.rung<high,'Below 25FPS reduces resolution promptly');
const before=b.rung;b.note(120,22200);assert(b.rung<before,'Large stalls reduce work faster');
for(let now=22300;now<24500;now+=100)b.note(100,now);
assert.equal(b.rung,0,'Persistent slow frames reach the minimum');
assert.equal(b.relief,2,'Legacy relief reports the new floor');
for(let now=24500;now<40000;now+=25)b.note(25,now);
assert.equal(b.level,'ultra','Recovery is not held behind long retry timers');
for(let i=1;i<CPU_ADAPTIVE_PROFILES.length;i++){
 const a=CPU_ADAPTIVE_PROFILES[i-1],c=CPU_ADAPTIVE_PROFILES[i];
 assert(c.width>a.width&&c.width/a.width<1.15,'Small resolution increments bridge public quality tiers');
 assert(['low','medium','high','ultra'].includes(c.level));
 if(c.level==='low')assert.equal(c.bodies,CPU_QUALITY_PROFILES.low.bodies);
}
b.level='medium';b.beginScene(41000);const interactive=b.rung;b.noteInteraction(41000);assert.equal(b.rung,interactive,'Input holds the current measured fidelity');
for(let now=41025;now<44000;now+=25){b.noteInteraction(now);b.note(10,now);}
assert.equal(b.rung,interactive,'Continuous manipulation blocks promotions without repeatedly degrading');
for(let now=44300;now<60000;now+=25)b.note(10,now);
assert.equal(b.level,'ultra','Detail returns after input ends');
for(const mode of ['low','medium','high','ultra']){
 b.select(mode);b.beginScene(61000);assert.equal(b.level,mode);assert.equal(b.profile,CPU_QUALITY_PROFILES[mode]);
 b.note(0,61020,{complete:false});assert(!b.startup,'Scene changes do not restart the preview');
 b.note(8,61040);assert.equal(b.level,mode);assert.equal(b.profile,CPU_QUALITY_PROFILES[mode]);
 b.note(200,61200);assert.equal(b.profile,CPU_QUALITY_PROFILES[mode],'Manual choices remain fixed during transitions');
}
console.log('PASS: CPU 25–35FPS capacity band, prompt reductions, smooth resolution ladder, lower startup floor, interaction priority, recovery through Ultra, and fidelity-preserving transitions.');
