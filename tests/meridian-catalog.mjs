import assert from 'node:assert/strict';
import {OBJECT_TYPES,OBJECT_DIMENSIONS} from '../dist/objects.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {advanceAutopilot} from '../dist/autopilot.js';
import {fixture} from './render-fixture.mjs';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
try{
 const label=t=>OBJECT_TYPES.find(o=>o.id===t)?.label;
 assert.equal(label('shuttle'),'NASA Meridian');assert.equal(label('heritageShuttle'),'NASA Shuttle');
 assert.equal(OBJECT_DIMENSIONS.shuttle.lengthMeters,37.24);
 const heritageRoutes=new Set(['shuttle-earth-moon-loop','shuttle-earth-mars-loop']);
 for(const preset of SCENE_PRESETS){
  assert(!preset.objects?.some(o=>o.type==='heritageShuttle'),preset.id);
  if(!preset.objects?.some(o=>o.type==='shuttle'))continue;
  r.loadScene(preset.id);const ships=r.getObjects().filter(o=>o.type==='shuttle');
  assert(ships.length,preset.id);
  const heritage=heritageRoutes.has(preset.id);
  if(preset.id==='shuttle-space')assert.deepEqual(ships.map(o=>o.label),['NASA Meridian','NASA Shuttle']);
  else assert(ships.every(o=>o.label===(heritage?'NASA Shuttle':'NASA Meridian')),preset.id);
  if(heritage){
   const shuttle=r.objects.find(o=>o.type==='shuttle');
   assert.equal(shuttle.hullModel,'heritageShuttle');assert.equal(r.focusId,shuttle.id);
   const flight=r.getFlightSequence(shuttle.id);assert.equal(flight.loop,true);assert.equal(flight.nodes.length,2);
   r.fillObjects();assert(Array.from(r.colorData).some((v,i)=>i%4===3&&v===16),'GPU receives the winged orbiter');
   r.state.paused=false;r.sceneLoad=null;
   for(const arrival of [preset.id.includes('moon')?'Moon':'Mars','Earth']){
    const elapsed=shuttle.clock.properSeconds;
    for(let i=0;i<200&&!r.transfer;i++)advanceAutopilot(r,.1);
    assert(r.transfer?.active,'Heritage autopilot leaves the parking orbit');
    for(let i=0;i<1000&&r.transfer;i++)r.advanceTravel(.1);
    assert(!r.transfer);assert.equal(r.objects.find(x=>x.id===shuttle.parentId)?.name,arrival);
    assert(shuttle.clock.properSeconds>elapsed,'The same onboard clock accumulates throughout both legs');
   }
  }
 }
 r.loadScene('shuttle-earth-moon-loop');
 const tour=serializeScene(r),newTour=parseScene(tour);
 // A pre-variant file uses the same display name but has no explicit hull.
 const oldTour=parseScene(tour.replace(/^\s*hullModel: "heritageShuttle"\n/m,'\n'));
 const tourId=newTour.objects.find(o=>o.type==='shuttle').id;
 assert.equal(newTour.objects.find(o=>o.id===tourId).name,'NASA Shuttle');
 assert.equal(newTour.objects.find(o=>o.id===tourId).hullModel,'heritageShuttle');
 assert.equal(oldTour.objects.find(o=>o.id===tourId).name,'NASA Meridian');
 assert(newTour.flightSequences[tourId].nodes.length>=2);
 assert.deepEqual(oldTour.flightSequences,newTour.flightSequences);
 r.loadScene('shuttle-space');const original=serializeScene(r);
 assert(original.includes('name: "NASA Meridian"'));
 for(const [stored,expected] of [['NASA Shuttle','NASA Meridian'],['Discovery','Discovery']]){
  const state=parseScene(original.replace('name: "NASA Meridian"','name: "'+stored+'"'));
  assert.equal(state.objects.find(o=>o.type==='shuttle').name,expected);
 }
 assert(r.getObjectContext().allowedTypes.includes('heritageShuttle'));
 const placed=r.addChildObject('space','heritageShuttle');assert.equal(r.getObjects().find(o=>o.id===placed.id).label,'NASA Shuttle');
 const heritage=parseScene(serializeScene(r)).objects.find(o=>o.id===placed.id);assert.equal(heritage.type,'heritageShuttle');
} finally {r.dispose();}
console.log('PASS: both transfer routes fly the heritage shuttle; other shuttle presets, historic saves, editable routes and independent model placement are preserved.');
