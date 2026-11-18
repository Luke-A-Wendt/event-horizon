import './fixtures/shuttle-bridge.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {bridgeRayStep,bridgeProperRadius} from '../dist/bridge-math.js';
import assert from 'node:assert/strict';
const norm=v=>Math.hypot(...v),diff=(a,b)=>a.map((x,i)=>x-b[i]);
// A radial coast from either mouth must not cross the isotropic-chart pole.
for(const length of [100,450,1e7]){const x=bridgeRayStep([0,0,100],[0,0,-1],50,length);assert(x<100);assert(Math.abs(bridgeProperRadius(100,50)-bridgeProperRadius(100-x,50)-length)<1e-7*length);}
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene('test-shuttle-bridge');r.sceneLoad=null;const c=r.objects.find(o=>o.type==='shuttle');
const id=c.id;r.stopFlightSequence(id);assert(r.startTravel('bridge-far-world',{craftId:id}));r.advanceTravel(3);
const pos=[...c.flight.position],v=[...c.flight.velocity];assert(norm(v)>0);
r.setNavigationMode(id,'manual');r.setFlightSequence(id,[{targetId:'bridge-far-world'}],{active:false});
r.setNavigationMode(id,'auto');let b=r.transfer;assert(b?.rejoinBrake);assert.deepEqual(c.flight.position,pos);assert(norm(diff(c.flight.velocity,v))<1e-7);
r.advanceTravel(b.rejoinBrake.turnSeconds+.7);assert(c.flight.speed>0&&c.flight.speed<norm(v));assert.equal(c.flight.thrust,1);
const brakePose=[...c.flight.position],brakeV=[...c.flight.velocity];r.setNavigationMode(id,'manual');assert.deepEqual(c.flight.position,brakePose);assert(norm(diff(c.flight.velocity,brakeV))<1e-7);r.setNavigationMode(id,'auto');
b=r.transfer;r.advanceTravel(b.wallSeconds);assert(r.transfer?.active&&!r.transfer.rejoinBrake);assert.equal(r.transfer.initialSpeed,0);assert(norm(diff(r.transfer.startPose.position,b.endPose.position))<.01);
r.advanceTravel(r.transfer.wallSeconds);assert.equal(r.bridgeParking[id].targetId,'bridge-far-world');r.dispose();
console.log('PASS: conformal bridge stopping distance, interrupted braking, zero-speed restart and arrival.');
