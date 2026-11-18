import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make();r.loadScene('solar-system');r.sceneLoad=null;r.state.paused=false;
const craft=r.objects.find(o=>o.type==='shuttle'),byName=n=>r.objects.find(o=>o.name===n).id;
const ids=['Earth','Mars','Venus'].map(byName),pos=id=>r.getFocusFrame(id).position.slice();
const before=pos(craft.id);r.setFlightSequence(craft.id,ids.map(targetId=>({targetId})));r.startFlightSequence(craft.id);
assert.deepEqual(pos(craft.id),before,'Chart activation keeps tracked ship fixed');const centers=ids.map(pos);
assert.equal(r.time,0);r.lastTime=1000;let now=1000;const tick=d=>{now+=d*1000;r.now=()=>now;r.advanceSimulation(now);r.fillObjects();};
for(let i=0;i<10;i++)tick(.47);tick(.55);
assert(Math.abs(r.transfer.elapsed-.25)<1e-10,'Boundary-crossing frame is split: 5 s of arc, 0.25 s of straight');
assert.deepEqual(ids.map(pos),centers);assert.equal(r.time,0);assert(r.routeVisualTime>0);
const secondary=make();restoreRenderer(secondary,snapshotRenderer(r));
for(const id of [...ids,craft.id])assert.deepEqual(secondary.getFocusFrame(id).position,pos(id),'Worker and host use the same chart');secondary.dispose();
for(let i=0;i<19;i++)tick(.5);tick(.5);assert(!r.transfer);assert(Math.abs(r.getFlightSequence(craft.id).orbitWait.elapsed-.25)<1e-9);assert.equal(craft.parentId,ids[1]);
assert.deepEqual(ids.map(pos),centers);const file=parseScene(serializeScene(r));assert.equal(file.routeChartY,r.routeChartY);
r.stopFlightSequence(craft.id);const held=r.time;tick(.05);assert(r.time>held);assert.equal(r.routeChartY,secondary.routeChartY);
r.loadScene('solar-system');assert.equal(r.routeChartY,null);
// A one-stop playlist can still have a departure arc from the current orbit.
// Let the surrounding ephemeris move here and the ship jumps from the moving
// planet to a stale tangent when that arc ends.
r.sceneLoad=null;r.state.paused=false;const single=r.objects.find(o=>o.type==='shuttle'),home=single.parentId,moon=byName('Moon');
r.setFlightSequence(single.id,[{targetId:moon}],{loop:false,active:true});assert(r.getFlightSequence(single.id).orbitWait);
const homePosition=pos(home);r.lastTime=now;for(let i=0;i<49;i++)tick(.1);
assert.deepEqual(pos(home),homePosition,'The one-stop acquisition keeps the same ephemeris throughout its arc');
tick(.1);assert.equal(r.transfer.targetId,moon);for(let i=0;i<100;i++)tick(.1);assert(r.getFlightSequence(single.id).holding);const atRestEpoch=r.time;tick(.05);assert(r.time>atRestEpoch,'A terminal orbit continues moving once the single transfer ends');r.dispose();console.log('PASS: fixed planar ephemeris through arc and line, exact frame-time handoff, aligned render worker and file persistence, normal ephemeris resumes on exit.');
