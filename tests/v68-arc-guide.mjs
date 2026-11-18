import assert from 'node:assert/strict';
import {parkedOrbitGeometry,captureParkedOrbit} from '../dist/orbit-path.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');const ship=r.objects.find(o=>o.type==='shuttle'),orbit=parkedOrbitGeometry(r,ship.id);
const sweep=Math.PI*.6,exit=orbit.sampleAtDistance((orbit.phase+sweep*.5)*orbit.radius),next=orbit.sampleAtDistance((orbit.phase+sweep*.5+.00001)*orbit.radius),u=next.map((x,i)=>x-exit[i]),len=Math.hypot(...u),end=exit.map((x,i)=>x+u[i]/len*orbit.radius*20);
// Start with no queued departure, regardless of the scene’s default tour.
r.stopFlightSequence(ship.id);
assert.equal(captureParkedOrbit(r,ship.id).kind,'orbit');
r.flightSequences[ship.id].orbitWait={sweepRadians:sweep,startPhase:2,unwrappedPhase:2-sweep*.5,direction:-1,leg:{start:exit,end}};
const route=captureParkedOrbit(r,ship.id),points=route.pathPoints;
assert.equal(route.kind,'arc-transfer');assert(Math.abs(route.pathLengthMeters/orbit.radius-(sweep+20))<1e-8);assert.deepEqual(points.at(-1),end);assert(Math.hypot(...points[0].map((v,i)=>v-orbit.sampleAtDistance((orbit.phase-sweep*.5)*orbit.radius)[i]))<.01);
assert(points.some(p=>p.every((v,i)=>Math.abs(v-exit[i])<.01)));assert(points.length<260);
r.dispose();console.log('PASS: guide is a circle for a single stop and only the swept arc plus outgoing common tangent for multiple stops');
