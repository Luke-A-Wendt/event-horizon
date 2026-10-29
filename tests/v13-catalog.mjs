import {objectRadiusMeters} from '../dist/objects.js';
import assert from 'node:assert/strict';
import {SOLAR_PLANETS,SOLAR_MINOR_BODIES,SOLAR_MOONS,SOLAR_MINOR_MOONS,SOLAR_RINGS,SOLAR_CATALOG_COUNTS,AU_METERS,solarBodies} from '../dist/solar-catalog.js';
import {BlackHoleRenderer,MAX_RENDER_OBJECTS} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {SCENE_PRESETS} from '../dist/config.js';
const objects=solarBodies();
assert.equal(objects.length,518);
assert.equal(SOLAR_PLANETS.length,8);assert.equal(SOLAR_MOONS.length,461);assert.equal(SOLAR_MINOR_BODIES.length,24);assert.equal(SOLAR_MINOR_MOONS.length,14);assert.equal(SOLAR_RINGS.length,5);
assert.deepEqual(SOLAR_CATALOG_COUNTS,{planets:8,minorBodies:24,planetaryMoons:461,minorMoons:14,rings:5,unknownRadiusProxies:232});
assert.deepEqual(SOLAR_MOONS.reduce((a,o)=>(a[o.parentKey]=(a[o.parentKey]||0)+1,a),{}),{earth:1,mars:2,jupiter:115,saturn:293,uranus:29,neptune:16,pluto:5});
assert.equal(SOLAR_MOONS.filter(o=>o.name.startsWith('S/')).length,289,'Provisional designations retain readable IAU form');
assert.equal(SOLAR_MOONS.filter(o=>o.name==='Puck').length,1,'Duplicate JPL Puck ephemerides produce one object');
assert.equal(SOLAR_MOONS.find(o=>o.name==='Puck').orbitMeters,86007000,'Use the newer URA184 Puck orbit');
assert.equal(SOLAR_MOONS.find(o=>o.name==='S/2009 S 1').sourceKey,'cassini-iauc9091');
assert.equal(SOLAR_MOONS.find(o=>o.catalogId==='519').name,'Megaclite');assert.equal(SOLAR_MOONS.find(o=>o.catalogId==='558').name,'Philophrosyne');
const byName=name=>objects.find(o=>o.name===name);
for(const name of ['Sun','Earth','Moon','Mars','Phobos','Deimos','Jupiter','Io','Europa','Ganymede','Callisto','Saturn','Titan','Pluto','Charon','Styx','Nix','Kerberos','Hydra','Ceres','Sedna','Vesta','Haumea','Eris','Makemake','Arrokoth','Bennu','Ryugu','Itokawa'])assert(byName(name),`${name} is selectable`);
assert.equal(byName('Moon').surfaceId,2);assert.equal(byName('Earth').surfaceId,1);assert.equal(byName('Jupiter').surfaceId,4);assert.equal(byName('Saturn').surfaceId,5);assert.equal(byName('Pluto').surfaceId,10);assert.equal(byName('Charon').surfaceId,11);
assert.equal(byName('Moon').radiusMeters,1737400);assert.equal(byName('Moon').orbitMeters,384400000);assert.equal(byName('Charon').parentKey,'pluto');assert(byName('Charon').barycentric);assert.equal(byName('Charon').axialTilt,119.5);for(const name of ['Styx','Nix','Kerberos','Hydra'])assert(byName(name).orbitBarycenter);assert.equal(byName('Ariel').axialTilt,97.77);
assert.equal(byName('Eris').rotationPeriodSeconds,15.78590*86400);assert.equal(byName('Haumea · narrow ring').axialTilt,byName('Haumea').axialTilt);
assert(byName('Sedna').orbitMeters>500*AU_METERS);assert(byName('Sedna').eccentricity>.8);assert.match(byName('Sedna').dataNote,/uncertainty/);
assert(byName('Phobos').shapeAxes[0]>byName('Phobos').shapeAxes[1]*1.35);assert(byName('Haumea').shapeAxes[0]>byName('Haumea').shapeAxes[1]*2);assert.equal(byName('Arrokoth').shapeStyle,'contact');
const ids=new Set();for(const o of objects){assert(!ids.has(o.key),`unique key ${o.key}`);assert(o.parentKey?ids.has(o.parentKey):true,`${o.name} parent precedes child`);ids.add(o.key);assert(['iss','shuttle','enterprise'].includes(o.type)?objectRadiusMeters(o.type)>0:o.radiusMeters>0&&Number.isFinite(o.radiusMeters));if(o.massSolar!==undefined)assert(o.massSolar>=0&&Number.isFinite(o.massSolar));if(o.eccentricity!==undefined)assert(o.eccentricity>=0&&o.eccentricity<1);if(o.shapeAxes)assert(o.shapeAxes.length===3&&o.shapeAxes.every(x=>x>0&&Number.isFinite(x)));}
for(const moon of SOLAR_MOONS.filter(o=>!o.physicalRadiusKnown)){assert.equal(moon.radiusMeters,1000);assert.equal(moon.radiusProxyMeters,1000);assert(moon.radiusEstimated);assert.match(moon.dataNote,/not a measured/);assert.equal(moon.massSolar,0);}
const again=solarBodies();again[1].shapeAxes[0]=99;assert.notEqual(SOLAR_PLANETS[0].shapeAxes[0],99,'Preset shape arrays never mutate catalog reference data');
const hypothetical=solarBodies(true);assert.equal(hypothetical[0].parentId,'primary');assert.equal(hypothetical[0].radius,1e7);
const hill=hypothetical[0].radius*(1.47662504e3*4.3e6)*Math.cbrt(1/(3*4.3e6)),sedna=byName('Sedna');assert(hill>sedna.orbitMeters*(1+sedna.eccentricity),'Hypothetical Hill radius exceeds Sedna aphelion');
assert.equal(SCENE_PRESETS.find(s=>s.id==='solar-system').objects.length,518);assert(!SCENE_PRESETS.some(s=>s.id==='solar-system-blackhole'),'Removed gallery scene does not remove catalog or hierarchy support');
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');r.render();
assert.equal(r.objects.length,518,'The renderer retains the entire catalog');assert.equal(r.objectFrames.length,518);assert.equal(r.getObjects().length,518);assert.equal(r.getObjectTree().length,519);
const runtimeByName=name=>r.objects.find(o=>o.name===name);
for(const name of ['Earth','Moon','Saturn','Pluto','Charon','S/2009 S 1','Sedna','Arrokoth','S/2023 S 1']){const body=runtimeByName(name);assert(body,`${name} exists in loaded catalog`);assert(r.focusTarget(body.id,'track'));r.render();assert(r.validateFrameGeometry(),`${name} inspection has finite geometry`);assert(r.getFocusFrame(body.id).index>=0,`${name} remains in the visible GPU selection`);assert(r.objectCount<=MAX_RENDER_OBJECTS);assert(r.focusTarget(body.id,'onboard'));r.render();assert(r.validateFrameGeometry(),`${name} surface camera has finite geometry`);}
for(const moon of r.objects.filter(o=>o.type==='moon')){assert(r.getFocusFrame(moon.id),`${moon.name} has a world frame`);assert(moon.parentId&&moon.parentId!=='space',`${moon.name} retains its actual parent`);}
assert.equal(runtimeByName('Charon').parentId,runtimeByName('Pluto').id);assert.equal(runtimeByName('Saturn · icy rings').parentId,runtimeByName('Saturn').id);
// The small Pluto moons orbit the binary center, not Pluto's moving center.
const pluto=runtimeByName('Pluto'),charon=runtimeByName('Charon');
for(const name of ['Styx','Nix','Kerberos','Hydra']){const moon=runtimeByName(name);r.updateObject(moon.id,{phase:0});r.fillObjects();const pp=r.getFocusFrame(pluto.id).position,pc=r.getFocusFrame(charon.id).position,bary=pp.map((v,i)=>(v*pluto.massSolar+pc[i]*charon.massSolar)/(pluto.massSolar+charon.massSolar));const radius=Math.hypot(...r.getFocusFrame(moon.id).position.map((v,i)=>v-bary[i]))*REFERENCE_RG_METERS;assert(Math.abs(radius-moon.orbitMeters*(1-moon.eccentricity))<.005,`${name} orbits the Pluto–Charon barycenter`);}
const ariel=runtimeByName('Ariel'),uranus=runtimeByName('Uranus'),basis=r.configCache.primaryBasis,tilt=uranus.axialTilt*Math.PI/180,north=basis[1].map((v,i)=>v*Math.cos(tilt)+basis[2][i]*Math.sin(tilt));r.fillObjects();const delta=r.getFocusFrame(ariel.id).position.map((v,i)=>v-r.getFocusFrame(uranus.id).position[i]);assert(Math.abs(delta.reduce((a,v,i)=>a+v*north[i],0))/Math.hypot(...delta)<1e-8,'Ariel orbit uses Uranus equator');r.dispose();
console.log('PASS: 518-entry offline catalog, 461 unique planetary moons from JPL and Cassini, parent closure, all five Pluto moons, physical profiles/shapes, explicit unknown-size proxies, outer-orbit consistency, all 518 renderer objects, bounded GPU slots, and finite inspected cameras.');
