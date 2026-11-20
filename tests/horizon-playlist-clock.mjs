import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { CLOCK_LIGHT_SPEED as C, CLOCK_SOLAR_GM as MU } from '../dist/object-clocks.js';
import { REFERENCE_RG_METERS as RG } from '../dist/objects.js';
import { fixture } from './render-fixture.mjs';
import { orbitClearance } from '../dist/orbit-clearance.js';

// The physical edge route ends at a stable circular equatorial geodesic.
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try {
 r.loadScene('nasa-shuttle');r.sceneLoad=null;
 const ship=r.objects.find(o=>o.type==='shuttle'),id=ship.id;
 const final=r.getFlightSequence(id).nodes.at(-1);
 r.stopFlightSequence(id);
 assert(r.setOrbitRadiusMeters(id,final.radiusMeters).ok);
 const metricRadius=r.massScale*RG,x=1.01*r.configCache.isco[0],spin=r.state.spin;
 const clock=r.getObjectClock(id);
 assert(Math.abs(clock.horizonGapMeters-(final.radiusMeters-r.getFocusFrame('primary').horizonRadius*RG))<.01);
 const expected=(1+spin/x**1.5)/Math.sqrt(1-3/x+2*spin/x**1.5);
 assert(Math.abs(expected-clock.rateFactor)<1e-9);
 const editing=r.setOrbitRadiusMeters(id,r.getFocusFrame('primary').horizonRadius*RG+1);
 assert(Math.abs(editing.radiusMeters-metricRadius*x)<.01,'Manually requesting an impossible circular stop respects the stable floor');
 assert.equal(clock.crewLoadG,0);
 console.log('PASS: prograde stable orbit floor, Kerr circular clock, and proper acceleration.');
} finally {r.dispose();}
