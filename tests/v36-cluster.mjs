import assert from 'node:assert/strict';
import {SCENE_PRESETS} from '../dist/config.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const preset=SCENE_PRESETS.find(s=>s.id==='horizon-hierarchy');
const holes=preset.objects.filter(o=>o.type==='blackhole'),majors=holes.filter(o=>o.parentId==='primary');
assert.equal(preset.patch.mass,300);assert.equal(holes.length,18);assert.equal(majors.length,6);
assert(majors.every(o=>o.massSolar>=26.5e6&&o.massSolar<=29e6));
assert(holes.filter(o=>o.parentKey).every(o=>o.massSolar>=2.49e6));
assert(holes.every(o=>o.eccentricity>0&&o.eccentricity<=.21));
assert(new Set(majors.map(o=>o.orbitInclination)).size===6);
assert(new Set(majors.map(o=>o.argumentPeriapsis)).size===6);
assert(!preset.objects.some(o=>o.type==='jets'));
assert(preset.objects.filter(o=>o.type==='disk').every(o=>o.diskStyle==='thermal'));
for(const [width,height]of [[960,632],[390,720]]){
 const f=fixture({width,height}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene(preset.id);
 const first=new Map();let displaced=false;
 for(let t=0;t<=180;t+=3){
  r.time=t;r.fillHoles();r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());
  for(const o of r.objects.filter(o=>o.type==='blackhole')){
   const a=r.getFocusFrame(o.id),b=r.getFocusFrame(o.parentId),distance=Math.hypot(...a.position.map((v,i)=>v-b.position[i]));
   assert(distance>a.radius+b.radius,`${o.name} crosses parent horizon at ${t}`);
   if(!first.has(o.id))first.set(o.id,[...a.position]);
   else if(Math.hypot(...a.position.map((v,i)=>v-first.get(o.id)[i]))>a.radius)displaced=true;
  }
 }
 assert(displaced);assert.equal(r.objects.length,36);assert.equal(r.orbitPairs.size,0);r.dispose();
}
console.log('PASS: physically enlarged 19-hole cluster, 18 inclined eccentric satellite orbits, finite desktop/mobile geometry and nonintersecting parent horizons through 180 simulation seconds, unchanged object budget.');
