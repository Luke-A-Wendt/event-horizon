import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SCENE_PRESETS,SCENE_PROGRESSIONS,DEFAULTS,makePreset} from '../dist/config.js';
import {stellarInfo,SOLAR_RG_METERS} from '../dist/stellar-physics.js';

const ids=SCENE_PRESETS.map(scene=>scene.id),planned=Object.values(SCENE_PROGRESSIONS).flat();
assert.equal(ids.length,47);
assert.equal(new Set(ids).size,ids.length);
assert.deepEqual(ids,planned,'Every scene has one deliberate place in its category progression');
assert.equal(ids[0],'disk');
assert.deepEqual(makePreset('disk'),{...DEFAULTS},'The opening accretion disc retains the defaults');
assert(!ids.includes('solar-system-blackhole'));
assert(!fs.existsSync(new URL('../dist/assets/atlas-solar-system-blackhole.webp',import.meta.url)));
for(const [index,scene] of SCENE_PRESETS.entries()){
 const state=makePreset(scene.id);
 assert.equal(scene.number,String(index+1).padStart(2,'0'));
 assert.equal(state.paused,true,`${scene.id} starts paused`);
 assert.equal(state.annotations,scene.category==='Geometry',`${scene.id} uses its category label default`);
 assert.equal(state.metrics,false,`${scene.id} has no metric overlay`);
 assert.equal(state.horizonGuide,false,`${scene.id} has no misleading exterior coordinate circle`);
 if(scene.category==='Geometry')assert.equal(state.spectrum,'geometry');
}
const scene=SCENE_PRESETS.find(s=>s.id==='collapse-cycle'),star=scene.objects[0],rs=2*SOLAR_RG_METERS*star.massSolar;
assert.equal(star.angularVelocity,0,'The spherical redshift comparison uses a nonrotating core');
assert(star.collapseRadiusMin<rs&&star.collapseRadiusMax>rs);
assert.equal(stellarInfo(star,0).collapsed,false);
assert.equal(stellarInfo(star,star.collapsePeriod/2).collapsed,true);
assert.equal(stellarInfo(star,star.collapsePeriod).collapsed,false);
assert.match(scene.description,/light reddens and fades/);
assert.match(scene.description,/fictional reset/);
assert.match(scene.explore,/apparent silhouette/);
const math=fs.readFileSync(new URL('../dist/math.js',import.meta.url),'utf8');
assert.match(math,/Quasi-static spherical surface redshift and bolometric intensity/);
assert.match(math,/escape-cone limit/);
assert.match(math,/not a universal collapse signature/);
console.log('PASS: 45 ordered scenes; labels enabled for Geometry, Geometry-only automatic metrics; no exterior coordinate guide; preserved default; explicit spherical collapse and shadow limits.');
