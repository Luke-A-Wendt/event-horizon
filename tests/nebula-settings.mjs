import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULTS,SCENE_PRESETS,makePreset,SCENE_PROGRESSIONS} from '../dist/config.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';
const fields=['nebulaVolume','nebulaVolumePreset','nebulaVolumeDensity','nebulaVolumeDepth','nebulaVolumeScale','nebulaVolumeSpeed','nebulaMulticolor','nebulaSecondaryColor','nebulaColorMix'];
assert.equal(DEFAULTS.nebulaVolume,false);assert.equal(DEFAULTS.nebulaMulticolor,false);
for(const id of ['nebula','dust-cathedral','bridge-nebulae']){const s=makePreset(id);assert(s.nebula&&s.nebulaVolume,id);assert.equal(s.nebulaMulticolor,id!=='bridge-nebulae',id+' palette');}
assert(!SCENE_PRESETS.some(s=>s.id==='nebula-heart'));
assert.equal(makePreset('warp-cruise').nebulaMulticolor,false);
assert.equal(SCENE_PRESETS.find(s=>s.id==='planet').objects[0].catalogId,'pelagia-ocean');
assert(SCENE_PROGRESSIONS.Geometry.includes('bridge-blackhole'));assert(!SCENE_PROGRESSIONS.Wormholes.includes('bridge-blackhole'));
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('nebula');
for(const preset of ['wisps','clouds','storm']){
 Object.assign(r.state,{nebulaVolumePreset:preset,nebulaVolumeDensity:1.4,nebulaVolumeDepth:2.2,nebulaVolumeScale:3.1,nebulaVolumeSpeed:0,nebulaSecondaryColor:'#e890bc',nebulaColorMix:.72});
 const yaml=serializeScene(r),restored=parseScene(yaml);for(const key of fields)assert.equal(restored.state[key],r.state[key],key);
 assert.throws(()=>parseScene(yaml.replace('nebulaVolumeDensity: 1.4','nebulaVolumeDensity: 3')),/between/);
 assert.throws(()=>parseScene(yaml.replace('nebulaVolumeScale: 3.1','nebulaVolumeScale: 0')),/between/);
 assert.throws(()=>parseScene(yaml.replace(`nebulaVolumePreset: "${preset}"`,'nebulaVolumePreset: "unknown"')),/supported/);
 assert.throws(()=>parseScene(yaml.replace('nebulaSecondaryColor: "#e890bc"','nebulaSecondaryColor: "invalid"')),/#rrggbb/);
}
r.dispose();
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');for(const key of fields)assert(app.includes(`'${key}'`),`${key} has a control`);
assert(app.includes("$('nebulaColorControls').hidden=!state.nebulaMulticolor"));assert(app.includes("$('nebulaVolumeControls').hidden=!state.nebulaVolume"));
console.log('PASS: nebula controls/defaults, curated layered scenes, valid YAML roundtrips, bounded parameters, color validation, equilibrium ocean preset, and bridge grouping.');
