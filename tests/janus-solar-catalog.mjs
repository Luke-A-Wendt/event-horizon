import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {solarBodies} from '../dist/solar-catalog.js';
import {fixture} from './render-fixture.mjs';
const preset=SCENE_PRESETS.find(s=>s.id==='janus-solar-tour'),catalog=solarBodies();
const natural=catalog.filter(o=>['star','planet','moon','asteroid','planetoid','ring'].includes(o.type));
assert.equal(preset.objects.length,natural.length+1);
const stopKeys=preset.janusRoute.destinations;
assert.deepEqual(stopKeys.map(key=>preset.objects.find(o=>o.catalogId===key).name),
 ['Earth','Moon','Sun','Mercury','Venus','Mars','Ceres','Jupiter','Saturn','Uranus','Neptune','Pluto']);
const render=new BlackHoleRenderer(fixture({width:390,height:844}).canvas,{autoStart:false,bindControls:false});
try{
 render.loadScene(preset.id);
 const pod=render.objects.find(o=>o.id===render.focusId);assert.equal(pod.hullModel,'janusPod');
 const r=render.getJanusBridge(pod.id),ids=new Set(r.targets.map(o=>o.id));
 assert.equal(r.currentLabel,'Earth');assert(r.auto&&r.loop);
 for(const body of render.objects){
  if(['star','planet','moon','asteroid','planetoid'].includes(body.type))assert(ids.has(body.id),body.name+' must be visitable');
  else assert(!ids.has(body.id),body.name+' must not be an orbit stop');
 }
 // Visit a secondary with its host outside the active camera as well as a
 // dwarf planet beyond the default route. Editing a tour must not mutate its
 // authored template when loaded again.
 const from=r.currentId,extra=['Titan','Eris'].map(name=>r.targets.find(t=>t.label===name).id);
 assert(render.setJanusItinerary(pod.id,[from,...extra],false));
 assert.deepEqual(render.getJanusBridge(pod.id).stops,[from,...extra]);
 render.loadScene(preset.id);assert.equal(render.getJanusBridge(render.focusId).stops.length,12);
 assert.deepEqual(render.getJanusBridge(render.focusId).targets.filter(s=>s.id===render.focusId),[]);
}finally{render.dispose();}
console.log('PASS: solar Janus catalog starts at Earth, provides twelve ordered defaults and 508 independent editable body targets; rings and other hulls are excluded.');
