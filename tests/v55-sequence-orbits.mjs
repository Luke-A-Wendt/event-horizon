import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {advanceAutopilot} from '../dist/autopilot.js';
import {SEQUENCE_ORBIT_SECONDS} from '../dist/flight-sequence.js';
const TAU=2*Math.PI,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const make=id=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene(id);r.state.paused=false;r.sceneLoad=null;r.fillObjects();return r;};
function phase(r,c){r.fillObjects();const p=r.getFocusFrame(c.id).position,b=r.getBridgeParkingOrbit(c.id),center=b?.center||r.getFocusFrame(c.parentId).position,basis=b?.basis||r.orbitGeometryById.get(c.id).basis,radial=sub(p,center);return Math.atan2(dot(radial,basis[2]),dot(radial,basis[0]));}
function completeOrbit(r,c){
 const wait=r.getFlightSequence(c.id).orbitWait;assert(wait);const dir=wait.direction,sceneTime=r.time,bridge=r.getBridgeParkingOrbit(c.id),center=bridge?.center||r.getFocusFrame(c.parentId).position,basis=bridge?.basis||r.orbitGeometryById.get(c.id).basis,angle=()=>{r.fillObjects();const radial=sub(r.getFocusFrame(c.id).position,center);return Math.atan2(dot(radial,basis[2]),dot(radial,basis[0]));};let previous=angle(),sweep=0,steps=0;
 while(!r.transfer?.active&&steps<300){const now=r.time;advanceAutopilot(r,.1);assert.equal(r.time,now,'Dwell never accelerates the global scene clock');const next=angle();sweep+=Math.atan2(Math.sin(next-previous),Math.cos(next-previous))*dir;previous=next;steps++;if(sweep<wait.sweepRadians-1e-8)assert(!r.transfer?.active,'A leg cannot launch before reaching its CCW contact');}
 assert(r.transfer?.active);assert(Math.abs(sweep-wait.sweepRadians)<1e-6);assert(sweep<TAU);assert(steps*.1<=SEQUENCE_ORBIT_SECONDS+.2);assert.equal(r.time,sceneTime);return r.transfer;
}
for(const id of ['shuttle-earth-moon-loop','shuttle-earth-mars-loop','test-shuttle-bridge']){
 const r=make(id),c=r.objects.find(o=>o.type==='shuttle');const before=phase(r,c);assert(r.getFlightSequence(c.id).orbitWait,'Preset begins with a partial orbit');
 const initialWait=r.getFlightSequence(c.id).waitSeconds;r.state.paused=true;for(let i=0;i<20;i++)advanceAutopilot(r,.5);assert.equal(phase(r,c),before);assert.equal(r.getFlightSequence(c.id).waitSeconds,initialWait);r.state.paused=false;
 completeOrbit(r,c);for(let i=0;i<600;i++)r.advanceTravel(.1);assert(!r.transfer);advanceAutopilot(r,.1);assert(r.getFlightSequence(c.id).orbitWait,'Arrival also starts a partial orbit');
 completeOrbit(r,c);assert.equal(r.getFlightSequence(c.id).legsCompleted,1);r.dispose();
}
{
 const r=make('test-shuttle-bridge'),c=r.objects[0],initialWait=r.getFlightSequence(c.id).waitSeconds;advanceAutopilot(r,60);assert(!r.transfer,'A resumed frame cannot skip an entire visible revolution');assert(r.getFlightSequence(c.id).waitSeconds>initialWait-.2);
 const pose=structuredClone(c.drivePosition);assert(r.setNavigationMode(c.id,'manual'));assert(!r.getFlightSequence(c.id).active);assert.equal(r.getFlightSequence(c.id).orbitWait,null);assert(Math.hypot(...sub(c.drivePosition,pose))<=Number.EPSILON*Math.hypot(...pose),'Manual takeover preserves position to floating-point precision');advanceAutopilot(r,.1);assert(!r.transfer);r.dispose();
}
{
 const r=make('shuttle-earth-moon-loop'),c=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.setFlightSequence(c.id,[{targetId:moon.id}],{loop:false});assert(r.startFlightSequence(c.id));completeOrbit(r,c);assert(r.transfer,'A one-way flight follows one departure orbit');for(let i=0;i<600;i++)r.advanceTravel(.1);advanceAutopilot(r,.1);assert(r.getFlightSequence(c.id).holding,'Removing the current stop leaves one perpetual destination');assert.deepEqual(r.getFlightSequence(c.id).nodes.map(n=>n.targetId),[moon.id]);r.dispose();
}
{
 const r=make('bridge'),c=r.objects[0];assert(!r.getFlightSequence(c.id).orbitWait,'Empty-space waypoints do not pretend to orbit');advanceAutopilot(r,.1);assert(r.transfer);for(let i=0;i<600;i++)r.advanceTravel(.1);for(let i=0;!r.transfer&&i<80;i++)advanceAutopilot(r,.1);assert(r.transfer,'A zero-speed waypoint aligns before the return leg');assert(!r.getFlightSequence(c.id).orbitWait);r.dispose();
}
console.log('PASS: measured rendered CCW arcs at initial and subsequent loop stops, ordinary/bridge paths, bounded craft-only display clock, pause, bounded resumed frames, manual cancellation, round-trip repetition, and non-orbiting waypoints.');
