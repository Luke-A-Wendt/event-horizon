import assert from 'node:assert/strict';
import { DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg } from '../dist/config.js';
const close=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
close(horizonRg(0),2);close(horizonRg(.6),1.8);close(horizonRg(.8),1.6);
close(iscoRg(0),6);close(iscoRg(.5),4.233002529530826);close(iscoRg(.9),2.320883041761887);
for(let a=0;a<.99;a+=.01){assert(horizonRg(a)<iscoRg(a),'Prograde ISCO remains outside outer horizon for subextremal spins');assert(Number.isFinite(iscoRg(a)));}
assert.equal(new Set(SCENE_PRESETS.map(p=>p.id)).size,SCENE_PRESETS.length);
for(const p of SCENE_PRESETS){const config=makePreset(p.id);for(const key of Object.keys(p.patch))assert(key in DEFAULTS,`Unknown ${p.id} control: ${key}`);assert.deepEqual(Object.keys(config).sort(),Object.keys(DEFAULTS).sort());}
assert.deepEqual(makePreset('disk'),{...DEFAULTS},'Original scene remains the default');
assert.equal(DEFAULTS.stars,true);assert.equal(DEFAULTS.disk,true);assert.equal(DEFAULTS.binary,false);assert.equal(DEFAULTS.nebula,false);
console.log('PASS: Kerr scalar values, horizon/ISCO ordering, independent complete atlas presets, original default.');
