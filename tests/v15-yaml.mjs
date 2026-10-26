import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {serializeScene,parseScene,SCENE_FILE_VERSION} from '../dist/scene-file.js';
import {snapshotRenderer} from '../dist/render-state.js';
assert.equal(SCENE_FILE_VERSION,JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json',import.meta.url),'utf8')).version);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const normalized=x=>{x=structuredClone(x);delete x.sceneRevision;for(const object of x.objects)for(const key of Object.keys(object))if(object[key]===undefined)delete object[key];return x;};
for(const scene of ['collapse-cycle','geometry-orbit','mixed-pair-geometry','merger','mixed-merger','bridge-blackhole','bridge-planets','prism-disc','braided-jets']){
 r.loadScene(scene);assert.deepEqual(parseScene(serializeScene(r)),normalized(snapshotRenderer(r)),scene+' exact full roundtrip');
}
// Removing a preset does not remove its supported physical object or cutaway
// setting. Both remain strict, complete file roundtrips when configured directly.
r.loadScene('bridge-blackhole');r.update({bridgeTravelerType:'whitehole'});
let configured=parseScene(serializeScene(r));assert.equal(configured.state.bridgeTravelerType,'whitehole');assert.equal(configured.objects[0].type,'whitehole');assert.deepEqual(configured,normalized(snapshotRenderer(r)),'Configured white-hole traveler exact roundtrip');
r.loadScene('geometry');r.update({interiorView:true});
configured=parseScene(serializeScene(r));assert.equal(configured.state.interiorView,true);assert.equal(configured.state.spectrum,'geometry');assert.deepEqual(configured,normalized(snapshotRenderer(r)),'Configured interior cutaway exact roundtrip');
r.loadScene('empty-space');const star=r.addChildObject('space','star',{starStyle:'neutron',angularVelocity:300,massSolar:2,radiusMeters:14000,collapseEnabled:true,collapsePeriod:30,collapseRadiusMin:4500,collapseRadiusMax:50000}),ship=r.addChildObject(star.id,'enterprise',{orbitMeters:5e6});
const disc=r.addChildObject(star.id,'disk',{diskStyle:'ribbons',diskPalette:'artistic',color:'#aabbff'}),jets=r.addChildObject(star.id,'jets',{jetStructure:'helix',color:'#bbddff'});assert(disc&&jets,'Stars accept owned disk/jet objects');
r.setFreeDrive(ship.id,true);r.setFlightInput({speed:1,curvature:.4,torsion:-.2});r.state.paused=false;r.lastTime=1000;r.advanceSimulation(1033);r.focusTarget(ship.id,'chase');
let text=serializeScene(r),saved=parseScene(text);assert.deepEqual(saved,normalized(snapshotRenderer(r)));assert.equal(saved.focusMode,'chase');assert(saved.objects.find(o=>o.id===ship.id).flight,'Frenet flight state is human-readable object data');assert(!text.includes('flightInput'),'Transient held keys cannot be stuck on by a file');
for(const [before,after,pattern]of [
 [`version: "${SCENE_FILE_VERSION}"`,'version: "1.14.0"',/does not match/],
 ['starStyle: "neutron"','starStyle: "unrecognized"',/not a supported/],
 ['jetStructure: "helix"','jetStructure: "unknown"',/not a supported/],
 ['collapsePeriod: 30','collapsePeriod: -1',/finite number/],
 ['angularVelocity: 300','angularVelocity: 1e100',/finite number/]
]){assert(text.includes(before),before);assert.throws(()=>parseScene(text.replace(before,after)),pattern);}
assert.throws(()=>parseScene(text.replace('type: "star"','type: "planet"')),/Discs and jets must belong/);
r.loadScene('geometry-orbit');text=serializeScene(r);assert.throws(()=>parseScene(text.replace('grid: true','grid: false')),/grid/);
r.loadScene('mixed-pair-geometry');text=serializeScene(r);assert.throws(()=>parseScene(text.replace('secondaryWhiteHole: true','secondaryWhiteHole: false')),/white-hole setting/);
r.dispose();console.log('PASS: current exact-version YAML, retained scene modes and configured white-hole/interior features, mixed-hole identity, stellar attachments/collapse, chase camera and Frenet flight state, strict enum/range rejection.');
