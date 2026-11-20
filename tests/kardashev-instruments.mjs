import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {AU_METERS} from '../dist/solar-catalog.js';
import {K2_GRID} from '../dist/kardashev-solar.js';
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make(),copy=make();
try {
 restoreRenderer(r,parseScene(readFileSync(new URL('./fixtures/retired-solar-atlas.scene.yaml',import.meta.url),'utf8')));r.state.annotations=true;r.state.velocityArrows=true;
 const get=key=>r.objects.find(o=>o.catalogId===key),sun=get('sun'),earth=get('earth'),net=get(K2_GRID),at=id=>r.getFocusFrame(id);
 const ports=()=>mapModel(r,sun.id).children,chart=()=>ports().map(({distanceMeters,radiusMeters,vx,vy})=>[distanceMeters,radiusMeters,vx,vy]);
 const physical=r.getObjectMetrics(earth.id).distanceMeters,earthPort=ports().find(b=>b.id===earth.id);
 assert(physical/AU_METERS>.98&&physical/AU_METERS<1.02&&earthPort.distanceMeters===physical);
 assert(Math.hypot(earthPort.vx,earthPort.vy)>28500&&Math.hypot(earthPort.vx,earthPort.vy)<30900);
 assert(at(net.id).isNetworkAtlas&&at(earth.id).radius>at(earth.id).physicalRadius*100);
 assert(observedBodyMeasurements(r).rows.some(x=>x.value==='Schematic atlas'));
 assert(!observedBodyMeasurements(r).rows.some(x=>['center','innerRadius','material'].includes(x.key)));
 assert.match(renderOrbitMap(mapModel(r,sun.id)).svg,/class="map-body map-solar-network"/);
 const baseline=chart();
 for(const id of [earth.id,net.id,earth.id]){
  r.focusTarget(id,'track');assert(r.state.paused);assert.deepEqual(chart(),baseline,'ephemeris cannot depend on the camera');
  assert.equal(r.getObjectMetrics(earth.id).distanceMeters,physical);
  assert.equal(at(net.id).isNetworkAtlas,id===net.id);
  if(id===earth.id){
   assert.equal(at(id).radius,at(id).physicalRadius);assert(Math.abs(r.getState().cameraDistanceMeters/(10.6*at(id).physicalRadius*RG)-1)<1e-10);
   const rows=new Map(observedBodyMeasurements(r).rows.map(v=>[v.key,v.value]));
   assert.equal(rows.get('orbitRate'),'1.99×10⁻⁷ rad/s');assert.equal(rows.get('distantSpeed'),'29.8 km/s');assert.equal(rows.get('radius'),'6,370 km');
   assert(/biosphere/.test(rows.get('port')));assert(Math.abs(at(id).radius*RG/earth.radiusMeters-1)<.005);
  }else{const label=captureAnnotationFrame(r).objectFrames.find(o=>o.id===earth.id);assert(label?.labelEligible&&label.anchor,'Label remains on the visually enlarged planet');}
  const saved=parseScene(serializeScene(r));restoreRenderer(copy,saved);
  assert.equal(copy.focusId,id);assert.equal(copy.getFocusFrame(net.id).isNetworkAtlas,id===net.id);
  assert.deepEqual(mapModel(copy,sun.id).children.map(o=>o.distanceMeters),baseline.map(a=>a[0]));
  assert.equal(copy.objects.find(o=>o.id===earth.id).radiusMeters,earth.radiusMeters);
 }
}finally{r.dispose();copy.dispose();}
console.log('PASS: Type II overview, physical ports and reloads agree on all planet orbits, radii and map velocities; schematic readout, route network and physical Earth camera scale.');
