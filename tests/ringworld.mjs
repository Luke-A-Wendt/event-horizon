import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {dysonShellHit,ASTRONOMICAL_UNIT} from '../dist/dyson.js';
import {dysonCanopyHit,dysonObserverUnderGlass} from '../dist/dyson-preview.js';
import {gardenWaterDistance} from '../dist/garden-waters.js';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';
import {captureAnnotationFrame,openSurfacePick} from '../dist/annotations.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';

const ray=(origin,direction)=>dysonShellHit(origin,direction,0,Infinity,true);
assert.equal(ray([0,3,0],[0,-1,0]),null,'An axial sightline sees open sky through both poles.');
assert.equal(dysonShellHit([0,3,0],[0,-1,0]).t,2,'The original Dyson sphere still has polar shell panels.');
assert.equal(ray([0,0,3],[0,0,-1]).inside,false);
const inner=ray([0,0,0],[0,0,1]);
assert(inner.inside);
assert(dysonCanopyHit([0,0,0],[0,0,1]).t<inner.t,'The glass canopy comes before the garden when seen from the star.');
const wet=[],dry=[],W=48,H=64;
for(let sector=0;sector<24;sector++){
 let samples=0,emptyColumns=0;
 for(let x=0;x<W;x++){
  let wetColumn=false;
  for(let y=0;y<H;y++){
   const longitude=(sector+(x+.5)/W)/24,across=2*(y+.5)/H-1;
   if(gardenWaterDistance(longitude,across)<0){samples++;wetColumn=true;}
  }
  if(!wetColumn)emptyColumns++;
 }
 wet.push(samples/(W*H));dry.push(emptyColumns);
}
assert(Math.min(...wet)>.009&&Math.max(...wet)>.18,'Small ponds and major lake districts coexist.');
assert(Math.max(...wet)>8*Math.min(...wet));
assert(dry.reduce((a,b)=>a+b)>W*24*.20,'There is no single uninterrupted canal.');
for(let j=0;j<10;j++)assert(Math.abs(gardenWaterDistance(-.001,j/5-1)-gardenWaterDistance(.999,j/5-1))<1e-9,'No discontinuity at the repeating longitude.');

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:400,height:260}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('ringworld');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const ring=r.objects.find(o=>o.catalogId==='ringworld'),star=r.objects.find(o=>o.type==='star'),frame=()=>r.getFocusFrame(ring.id);
 assert.equal(ring.parentId,star.id);assert.equal(ring.radiusMeters,ASTRONOMICAL_UNIT);assert.equal(r.focusId,ring.id);
 assert.equal(frame().bodyParams[3],1);assert.deepEqual(frame().position,r.getFocusFrame(star.id).position);
 assert.equal(observedBodyMeasurements(r).rows.find(x=>x.key==='floorGravity').value,'1.0g');
 const map=renderOrbitMap(mapModel(r,star.id),{viewportWidth:640});assert.match(map.svg,/equatorial deck radius/);assert(!map.svg.includes('shell radius'));
 const payload=structuredClone(captureAnnotationFrame(r)),surface=payload.openSurfaces.find(o=>o.id===ring.id);
 assert.equal(openSurfacePick(surface,payload.cameraFrame,0,0),null,'The star is selectable through the opening, including in worker snapshots.');
 const cam={observer:[0,0,3],right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},normalized={...surface,position:[0,0,0],radius:1};
 assert.equal(openSurfacePick(normalized,cam,0,0),2,'The ring can be picked directly on its deck.');
 const saved=parseScene(serializeScene(r));restoreRenderer(r,saved);r.fillObjects();r.updateCameraFrame();
 assert.equal(frame().bodyParams[3],1,'Saving and reopening preserves the open belt.');
 r.focusTarget(ring.id,'onboard',false,true);r.updateCameraFrame();
 const eye=r.cameraFrame.observer.map((n,i)=>(n-frame().position[i])/frame().radius);
 assert(dysonObserverUnderGlass(eye));assert.equal(r.cameraFrame.hideIndex,-1);
 if(Renderer===CpuRenderer){
  canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}
  assert(canvas.takeFrame().commands.length>0,'The software renderer draws an interior.');
 }
 r.dispose();
}
console.log('PASS: open ring, original closed sphere, sealed deck, saved 1g habitat and periodic garden watersheds.');
