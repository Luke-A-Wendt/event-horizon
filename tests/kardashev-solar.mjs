import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {K2_GRID,LEGACY_SOLAR_CAMERA,solarNetworkLayers} from '../dist/kardashev-solar.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {SOLAR_PLANETS} from '../dist/solar-catalog.js';
for(const R of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:960,height:632}),canvas=R===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(R===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new R(canvas,{autoStart:false,bindControls:false});restoreRenderer(r,parseScene(readFileSync(new URL('./fixtures/retired-solar-atlas.scene.yaml',import.meta.url),'utf8')));
 const refresh=()=>{r.fillObjects();r.updateCameraFrame();};
 refresh();const grid=r.objects.find(o=>o.catalogId===K2_GRID),planet=k=>r.objects.find(o=>o.catalogId===k);
 assert.equal(r.focusId,grid.id);
 const layout=()=>r.getFocusFrame(grid.id),layers=()=>solarNetworkLayers(layout(),r.cameraFrame.observer);
 assert(layout().isNetworkAtlas);assert.equal(layout().networkPorts.length,40);assert(layers().length>180);
 // Each power spoke terminates on the moving free-flying receiver of its
 // planetary port, never at an arbitrary point outside the harbor.
 const geo=layers(),depots=geo.filter(b=>b.parts[0].fill==='#6293a2').map(b=>b.position);
 const power=geo.filter(b=>b.parts[0].fill==='#ba8449');assert.equal(power.length,16);
 for(let i=1;i<power.length;i+=2){
  const [,left,right]=power[i].parts[0].points,end=left.map((x,k)=>(x+right[k])/2);
  assert(depots.some(p=>Math.hypot(...p.map((x,k)=>x-end[k]))<1e-8),'A power route ends on relay equipment');
 }
 const projected=SOLAR_PLANETS.map(p=>[...r.getFocusFrame(planet(p.key).id).position]);
 for(const p of SOLAR_PLANETS){
  const host=planet(p.key);r.focusTarget(host.id,'track');refresh();const v=r.getFocusFrame(host.id),idx=SOLAR_PLANETS.indexOf(p)+1;
  assert(!layout().isNetworkAtlas);assert(Math.abs(v.radius*REFERENCE_RG_METERS/p.radiusMeters-Math.max(...p.shapeAxes))<.0001);
  assert(Math.abs(layout().networkPorts[idx*4+3]*layout().radius/v.radius-3.8)<.00001);
  assert.equal(r.camera.focusDistance,10.6);
 }
 r.focusTarget(grid.id,'track');refresh();assert(layout().isNetworkAtlas);assert.equal(r.camera.focusDistance,LEGACY_SOLAR_CAMERA.focusDistance);
 assert.deepEqual(SOLAR_PLANETS.map(p=>r.getFocusFrame(planet(p.key).id).position),projected,'Restoring overview reproduces the same planetary positions');
 const before=[...layout().networkPorts];r.time+=4000;refresh();assert.notDeepEqual([...layout().networkPorts],before);
 const saved=parseScene(serializeScene(r));restoreRenderer(r,saved);refresh();assert(layout().isNetworkAtlas);
 if(R===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}const frame=canvas.takeFrame();assert(frame.commands.length>1000&&frame.commands.length<20000);}
 r.dispose();
}
console.log('PASS: moving 9-node stellar network, eight selectable physical-scale port systems, atlas restoration, CPU command bounds, save/restore.');
