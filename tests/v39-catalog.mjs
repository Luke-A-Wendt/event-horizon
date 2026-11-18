import assert from 'node:assert/strict';
import {SCENE_PRESETS,makePreset} from '../dist/config.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {AU_METERS} from '../dist/solar-catalog.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const byId=id=>SCENE_PRESETS.find(s=>s.id===id),craft=byId('solar-system'),natural=byId('solar-system-natural');
assert.equal(craft.title,'Touring Our Solar System');assert.equal(craft.category,'Spacecraft');assert.equal(craft.objects.length,515);
assert.equal(natural.title,'Our Solar System');assert.equal(natural.category,'Solar systems');assert.equal(natural.objects.length,513);assert(!natural.objects.some(o=>['iss','shuttle','enterprise'].includes(o.type)));
assert.equal(craft.objects[craft.camera.focusIndex].type,'shuttle');assert.equal(natural.objects[natural.camera.focusIndex].name,'Earth');
for(const id of ['solar-system','solar-system-natural','proxima-centauri','alpha-centauri'])assert.equal(makePreset(id).annotations,true,id);
for(const id of ['proxima-centauri','alpha-centauri']){
 const p=byId(id),b=p.objects.find(o=>o.name==='Proxima Centauri b'),d=p.objects.find(o=>o.name==='Proxima Centauri d'),c=p.objects.find(o=>o.key==='proxima-c');
 assert(b&&d&&c);assert.equal(b.orbitalPeriodSeconds,11.18465*86400);assert.equal(d.orbitalPeriodSeconds,5.12338*86400);assert.match(d.dataNote,/Confirmed/);assert.match(c.name,/candidate/);assert.match(c.dataNote,/Unconfirmed/);assert(!p.objects.some(o=>o.name==='Alpha Centauri B b'));
 for(const o of [b,d,c]){assert(o.radiusEstimated);assert(o.reference.startsWith('https://exoplanetarchive.'));assert.match(o.dataNote,/illustrative/);}
}
const alpha=byId('alpha-centauri');assert.equal(alpha.objects.filter(o=>o.type==='star').length,3);assert.match(alpha.objects.find(o=>o.key==='alpha-a-b-candidate').name,/candidate/);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
for(const id of ['solar-system-natural','proxima-centauri','alpha-centauri']){
 r.loadScene(id);assert(r.validateFrameGeometry());assert.equal(r.objects.length,byId(id).objects.length);assert.equal(r.state.annotations,true);assert.equal(parseScene(serializeScene(r)).objects.length,r.objects.length);
 if(id==='alpha-centauri'){
  const p=r.objects.find(o=>o.name==='Proxima Centauri'),pos=r.getFocusFrame(p.id).position;assert(Math.abs(pos[0]*REFERENCE_RG_METERS-12947*AU_METERS)<2,'Proxima subsystem retains its approximate physical separation');
  for(const o of r.objects.filter(o=>o.name.startsWith('Proxima Centauri ')))assert.equal(o.parentId,p.id);
 }
}
r.dispose();
console.log('PASS: separate natural/craft Solar Systems, labels on, complete confirmed Proxima b/d and explicitly marked candidates, three-star Alpha Centauri membership, physical root separation and YAML closure.');
