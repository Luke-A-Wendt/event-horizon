import assert from 'node:assert/strict';
import {DEFAULTS,SCENE_PRESETS,SCENE_CATEGORIES,makePreset,sceneComplexity} from '../dist/config.js';
import {SOLAR_PLANETS,AU_METERS,SOLAR_RADIUS_METERS,solarBodies} from '../dist/scene-catalog.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';

const scene=id=>SCENE_PRESETS.find(s=>s.id===id);
assert.equal(SCENE_PRESETS.length,47);
assert.equal(new Set(SCENE_PRESETS.map(s=>s.id)).size,47);
assert.equal(DEFAULTS.paused,true);
for(const s of SCENE_PRESETS){
 assert.equal(makePreset(s.id).paused,true,`${s.id} begins paused`);
 assert(SCENE_CATEGORIES.some(c=>c.id===s.category),`${s.id} belongs to an exposed category`);
 const budget=sceneComplexity(s);assert(budget.score>=0&&budget.score<=100);assert.match(budget.reason,/not|actual frame rate/);
}
assert(sceneComplexity('empty-space').score<sceneComplexity('xray-binary').score);
assert.equal(scene('bridge').category,'Wormholes');
assert.equal(scene('bridge').patch.nebula,false);assert.equal(scene('bridge').patch.bridgeOtherColor,'#875ba3');
assert.equal(scene('horizon-watch').patch.disk,true);assert.equal(scene('horizon-watch').patch.nebula,false);assert.equal(scene('horizon-watch').camera.mode,'onboard');
assert.equal(scene('radiant-descent').camera.mode,'onboard');
for(const id of ['geometry','grid-kerr','grid-binary','geometry-orbit']){
 const p=makePreset(id);assert(p.grid);assert(!p.stars&&!p.nebula&&!p.disk&&!p.jets,`${id} has no sky or plasma emission`);
}
assert.equal(makePreset('geometry').spin,0);assert.equal(makePreset('grid-kerr').spin,.998);assert(makePreset('grid-binary').binary);
assert.equal(scene('ton-618').primaryName,'TON 618');assert.equal(makePreset('ton-618').mass,66000);assert.match(scene('ton-618').description,/estimate|uncertain/);
assert.equal(scene('sagittarius-a').primaryName,'Sagittarius A*');assert.equal(makePreset('sagittarius-a').mass,4.3);
assert.equal(solarBodies().length,517);assert.deepEqual(SOLAR_PLANETS.map(p=>p.name),['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']);
assert.equal(SOLAR_PLANETS[2].radiusMeters,6371000);assert.equal(SOLAR_PLANETS[7].orbitMeters,4515e9);
assert(scene('proxima-centauri').objects.every(o=>!o.name.includes(' c')),'No uncertain Proxima c is silently represented as confirmed');
assert(scene('alpha-centauri').objects.every(o=>o.type==='star'),'No speculative Alpha Centauri planets are presented as observations');

const f=fixture(),errors=[],r=new BlackHoleRenderer(f.canvas,{autoStart:false,onError:error=>{if(error)errors.push(error);}});
for(const s of SCENE_PRESETS){
 r.update({paused:false});r.loadScene(s.id);assert.equal(r.state.paused,true,`${s.id} overrides the preceding scene’s playback state`);
 r.render();assert(r.validateFrameGeometry(),`${s.id} has valid camera and body dimensions`);
}
r.loadScene('solar-system');r.render();
const sun=r.objects.find(o=>o.name==='Sun');assert(sun);assert.equal(sun.parentId,'space');assert.equal(sun.massSolar,1);assert.equal(r.objectRadius(sun)*REFERENCE_RG_METERS,SOLAR_RADIUS_METERS);
for(const planet of SOLAR_PLANETS){
 const body=r.objects.find(o=>o.name===planet.name);assert.equal(body.parentId,sun.id);assert.equal(body.orbitMeters,planet.orbitMeters);assert.equal(body.radiusMeters,planet.radiusMeters);assert(Math.abs(r.objectRadius(body)*REFERENCE_RG_METERS-planet.radiusMeters*Math.max(...planet.shapeAxes))<1e-3);
}
const belt=r.objects.find(o=>o.type==='belt');assert.equal(belt.parentId,sun.id);assert.equal(belt.material,'rocky');
// Keep nested-system coverage even though its gallery preset was removed.
r.loadScene('solar-system');r.update({blackHole:true,mass:4.3});const travelerSun=r.objects.find(o=>o.name==='Sun');assert(r.reparentObject(travelerSun.id,'primary'));r.updateObject(travelerSun.id,{radius:10000000});r.render();assert.equal(travelerSun.parentId,'primary');assert.equal(travelerSun.radius,10000000);
const hill=travelerSun.radius*REFERENCE_RG_METERS*Math.cbrt(1/(3*4.3e6));assert(hill>30*AU_METERS,'The illustrative solar family is not placed inside its immediate Hill limit');
r.loadScene('alpha-centauri');r.render();assert.equal(r.objects[1].parentId,r.objects[0].id);assert.equal(r.objects[1].orbitMeters,23.4*AU_METERS);
r.loadScene('proxima-centauri');r.render();assert.equal(r.objects[1].parentId,r.objects[0].id);assert.equal(r.objects[1].orbitMeters,.04848*AU_METERS);
r.loadScene('empty-space');const giant=r.addChildObject('space','planet',{name:'Ring laboratory',planetStyle:'gas',radiusMeters:58232000});r.addChildObject(giant.id,'ring',{radiusMeters:140000000,orbitMeters:1,material:'icy'});r.render();assert.equal(r.objects[1].type,'ring');assert.equal(r.objects[1].parentId,r.objects[0].id);assert.equal(r.objects[1].material,'icy');
assert.deepEqual(errors,[]);r.dispose();
console.log('PASS: 45 categorized paused scenes, named physical systems, hierarchical Solar System and binary references, honest grid-only limits, contextual cameras, complexity estimates, and finite render geometry.');
