import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';

const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const r=make(),add=r.addObject;let additions=0;
r.addObject=function(...args){additions++;return add.apply(this,args);};
function normalized(objects){
 const ids=new Map(objects.map((object,i)=>[object.id,`slot-${i}`]));
 return objects.map(object=>{const out=JSON.parse(JSON.stringify(object));out.id=ids.get(out.id);out.parentId=ids.get(out.parentId)||out.parentId;if(out.referenceId)out.referenceId=ids.get(out.referenceId)||out.referenceId;return out;});
}
r.loadScene('solar-system');assert.equal(additions,518,'First load validates every authored object');
const first=normalized(r.objects),firstIds=new Set(r.objects.map(o=>o.id)),firstObjects=r.objects,phases=r.objects.map(o=>o.phase),selectedIndex=r.objects.findIndex(o=>o.id===r.selectedId);
const earth=r.objects.find(o=>o.name==='Earth'),irregular=r.objects.find(o=>Array.isArray(o.shapeAxes));
r.updateObject(earth.id,{name:'Edited Earth',radiusMeters:earth.radiusMeters*1.5,color:'#123456'});
if(irregular)irregular.shapeAxes[0]*=.8;
r.loadScene('disk');additions=0;r.loadScene('solar-system');
assert.equal(additions,0,'Returning to an unchanged catalog reuses validated templates');
assert.deepEqual(normalized(r.objects),first,'Runtime edits never modify a cached authored scene');
r.objects.forEach((object,i)=>assert(Object.is(object.phase,phases[i]),'Signed initial phases are preserved'));
assert.notEqual(r.objects,firstObjects);assert(r.objects.every(o=>!firstIds.has(o.id)),'IDs remain unique across reloads');
assert.equal(r.objects.length,518);assert.equal(r.selectedId,r.objects[selectedIndex].id);
const ids=new Set(r.objects.map(o=>o.id));for(const o of r.objects)assert(o.parentId==='space'||ids.has(o.parentId));

// Authored source edits invalidate the template, including nested properties.
const preset=SCENE_PRESETS.find(p=>p.id==='solar-system'),source=preset.objects.find(o=>o.name==='Earth'),previous=source.color;
try{
 source.color='#fedcba';additions=0;r.loadScene('solar-system');
 assert.equal(additions,518);assert.equal(r.objects.find(o=>o.name==='Earth').color,'#fedcba');
}finally{if(previous===undefined)delete source.color;else source.color=previous;}
r.loadScene('solar-system');assert.deepEqual(normalized(r.objects),first);
const other=make();other.loadScene('solar-system');
assert.deepEqual(normalized(other.objects),first,'Another renderer can safely use the same authored template');
other.objects[0].name='Mutated other instance';assert.notEqual(r.objects[0].name,other.objects[0].name);

// Small scenes keep their normal construction path; all object arrays are
// fresh even when scenes are loaded after a large cached catalog.
for(const preset of SCENE_PRESETS){
 r.loadScene(preset.id);const fresh=normalized(r.objects);r.loadScene(preset.id);
 assert.deepEqual(normalized(r.objects),fresh,preset.id);assert.equal(r.buildingScene,false);
 assert.equal(r.sceneBuildObjects,null);assert(r.validateFrameGeometry(),preset.id);
}
other.dispose();r.dispose();
console.log('PASS: cold validation, cached 518-body reload, fresh IDs/arrays, runtime-edit isolation, authored-edit invalidation, cross-renderer reuse and all-scene repeated-load parity.');
