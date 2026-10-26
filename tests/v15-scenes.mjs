import assert from 'node:assert/strict';
import {SCENE_PRESETS,DEFAULTS,makePreset,SCENE_CATEGORIES} from '../dist/config.js';
const scenes=new Map(SCENE_PRESETS.map(s=>[s.id,s]));
assert.equal(scenes.size,45);
for(const id of ['beacon-sweep','grid-planet','ringed-world','ribbon-flow','bridge-whitehole','interior-geometry'])assert(!scenes.has(id),`${id} was removed without removing its object type`);
for(const id of ['collapse-cycle','geometry-orbit','mixed-pair-geometry','merger','mixed-merger','bridge-blackhole','bridge-planets','bridge-nebulae','prism-disc','braided-jets'])assert(scenes.has(id));
assert.deepEqual(makePreset('disk'),{...DEFAULTS},'Opening accretion scene is unchanged');
for(const scene of scenes.values()){
 const state=makePreset(scene.id);assert(state.paused,`${scene.id} begins paused`);
 assert(SCENE_CATEGORIES.some(c=>c.id===scene.category));
 for(const property of Object.keys(scene.patch))assert(property in DEFAULTS,`${scene.id}: declared state field ${property}`);
 if(scene.category==='Geometry'){
  assert.equal(state.spectrum,'geometry',`${scene.id} has a geometry-only rendering contract`);
  assert(state.grid&&!state.metrics);assert(!state.stars&&!state.nebula&&!state.disk&&!state.jets);
 }
 assert.equal(state.secondaryDiskPalette,scene.patch.secondaryDiskPalette??state.diskPalette);
 assert.equal(state.secondaryJetStructure,scene.patch.secondaryJetStructure??state.jetStructure);
}
const collapse=scenes.get('collapse-cycle').objects[0];
const rs=2*6.67430e-11*1.98847e30*collapse.massSolar/299792458**2;
assert(collapse.collapseRadiusMin<rs&&collapse.collapseRadiusMax>rs,'Cycle crosses its nonrotating compactness scale');
assert.match(scenes.get('collapse-cycle').description,/fictional reset/);
assert.equal(scenes.get('bridge').patch.nebula,false);assert.equal(scenes.get('bridge').patch.bridgeOtherColor,'#875ba3');assert.equal(scenes.get('bridge').camera.mode,'chase');
for(const id of ['bridge-blackhole']){const scene=scenes.get(id);assert.equal(scene.patch.bridgeTravelerType,scene.objects[0].type);assert.match(scene.description,/not .*solution/);}
assert.equal(makePreset('mixed-pair-geometry').secondaryWhiteHole,true);assert.equal(makePreset('mixed-pair-geometry').secondaryWhiteHole,true);
assert.equal(makePreset('merger').binaryMotion,'merger');assert.equal(makePreset('merger').gravitationalWaves,true);
assert(!scenes.has('crossed-bridges'));
assert.equal(makePreset('prism-disc').diskPalette,'artistic');assert.equal(makePreset('braided-jets').jetStructure,'helix');
console.log('PASS: 45 complete paused scenes, preserved default, removed presets, pure Geometry category, collapse threshold crossing, explicit speculative comparisons, artistic materials, and bridge skies.');
