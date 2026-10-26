import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {stellarInfo} from '../dist/stellar-physics.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const capture=()=>r.objectFrames.map(o=>({id:o.id,position:[...o.position],velocity:[...o.velocity],frame:o.frame.map(v=>[...v]),radius:o.radius}));
const near=(a,b)=>assert(Math.abs(a-b)<=2e-12*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
function sameFrames(a,b){assert.equal(a.length,b.length);for(let j=0;j<a.length;j++){assert.equal(a[j].id,b[j].id);near(a[j].radius,b[j].radius);for(const key of ['position','velocity','frame']){const x=a[j][key].flat(),y=b[j][key].flat();x.forEach((value,k)=>near(value,y[k]));}}}
function freshEquivalent(){const cached=capture();r.lastGeometryRevision=-1;r.fillObjects();sameFrames(cached,capture());}

r.loadScene('solar-system');assert.equal(r.objects.length,517);
const geometry=r.orbitGeometryById,lookup=r.objectById,earth=r.objects.find(o=>o.name==='Earth'),sun=r.objects.find(o=>o.name==='Sun'),moon=r.objects.find(o=>o.name==='Moon');
r.focusTarget(earth.id,'track');
const originalOmega=r.orbitalOmega,originalRadius=r.objectRadius;let frequencyCalls=0,radiusCalls=0;
r.orbitalOmega=function(...args){frequencyCalls++;return originalOmega.apply(this,args);};r.objectRadius=function(...args){radiusCalls++;return originalRadius.apply(this,args);};
const before=capture();r.time+=.25;r.fillObjects();
assert.equal(r.orbitGeometryById,geometry);assert.equal(r.objectById,lookup);
assert.equal(frequencyCalls,0,'Unchanged orbital elements do not recalculate 1,500 frequencies per moving frame');
assert.equal(radiusCalls,0,'Static body dimensions are retained during orbital motion');
assert.notDeepEqual(capture(),before);assert.equal(r.objectFrames.length,517);assert(r.objectCount<=r.gpuObjectLimit);
r.orbitalOmega=originalOmega;r.objectRadius=originalRadius;freshEquivalent();

const omega=r.orbitGeometryById.get(earth.id).omega;
r.updateObject(sun.id,{massSolar:sun.massSolar*2});near(r.orbitGeometryById.get(earth.id).omega,omega*Math.SQRT2);freshEquivalent();
const size=r.orbitGeometryById.get(earth.id).radius;
r.updateObject(earth.id,{radiusMeters:earth.radiusMeters*1.1,axialTilt:55});near(r.orbitGeometryById.get(earth.id).radius,size*1.1);freshEquivalent();
r.updateObject(moon.id,{orbitMeters:moon.orbitMeters*1.4,eccentricity:.42,orbitInclination:37,orbitNode:29,argumentPeriapsis:70,orbitReferenceFrame:'equatorial'});r.time+=1; r.fillObjects();freshEquivalent();
const saved=snapshotRenderer(r);restoreRenderer(r,saved);freshEquivalent();
const old=r.orbitGeometryById;r.objects=r.objects.map(o=>({...o}));r.fillObjects();assert.notEqual(r.orbitGeometryById,old,'Same-size catalog replacement invalidates derived orbital metadata');freshEquivalent();

// Every scene retains its time-dependent body geometry when the metadata
// cache is reused, including nested pairs, bridge conformal sizes and collapse.
for(const scene of SCENE_PRESETS){
 r.loadScene(scene.id);for(const time of [.1,8,17]){r.time=time;r.fillHoles();r.fillObjects();freshEquivalent();assert(r.validateFrameGeometry(),scene.id);}
}
r.loadScene('collapse-cycle');const star=r.objects.find(o=>o.collapseEnabled),stellarCache=r.orbitGeometryById;
for(const time of [0,7.5,15,22.5]){r.time=time;r.fillObjects();const info=stellarInfo(star,time),frame=r.frameById.get(star.id);near(frame.radius,(info.collapsed?info.horizonMeters:info.radiusMeters)/REFERENCE_RG_METERS);assert.equal(frame.collapsed,info.collapsed);}
assert.equal(r.orbitGeometryById,stellarCache,'Dynamic collapse changes the surface without invalidating static orbital metadata');
r.dispose();
console.log('PASS: 517-body orbital metadata reuse, zero repeated static frequency/radius work, mass/size/orbit/snapshot invalidation, same-size replacement, all-scene cached/fresh parity, and dynamic collapse.');
