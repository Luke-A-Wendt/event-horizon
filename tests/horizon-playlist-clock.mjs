import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { CLOCK_LIGHT_SPEED as C, CLOCK_SOLAR_GM as MU } from '../dist/object-clocks.js';
import { REFERENCE_RG_METERS as RG } from '../dist/objects.js';
import { fixture } from './render-fixture.mjs';
import { orbitClearance } from '../dist/orbit-clearance.js';

// The prescribed horizon track leaves clearance for the whole hull. The
// separate reference-point comparison can still be edited to a 1 m gap.
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try {
 r.loadScene('nasa-shuttle');r.sceneLoad=null;
 const ship=r.objects.find(o=>o.type==='shuttle'),id=ship.id;
 const final=r.getFlightSequence(id).nodes.at(-1);
 r.stopFlightSequence(id);
 assert(r.setOrbitRadiusMeters(id,final.radiusMeters).ok);
 const actual=r.getObjectClock(id),hull=r.objectRadius(ship)*RG;
 assert(actual.horizonGapMeters>=2*hull-.001&&actual.horizonGapMeters<=2*hull+.002,
  'Authored horizon track clears the full hull and uses the same center as the clock');
 const level=Math.max(ship.routeParkingHeightMeters||0,orbitClearance(r,ship,'primary')*RG);
 const requested=r.getFocusFrame('primary').horizonRadius*RG+1;
 const circle=Math.sqrt((requested-level)*(requested+level));
 assert(r.setOrbitRadiusMeters(id,circle).ok);
 const frame=r.getFocusFrame(id),hole=r.getFocusFrame('primary'),delta=frame.position.map((v,i)=>(v-hole.position[i])*RG);
 const R=Math.hypot(...delta),h=hole.horizonRadius*RG,gap=R-h,clock=r.getObjectClock(id);
 assert(gap>0&&gap<.00001*h,'Real position, including disc clearance, must be close to the horizon: '+gap);
 assert(Math.abs(gap-clock.horizonGapMeters)<.01,'Clock reference is the rendered shuttle center');
 const s=r.state.spin,M=h/(1+Math.sqrt(1-s*s)),a=s*M,rMinus=M*(1-Math.sqrt(1-s*s));
 const cos=delta.reduce((sum,v,i)=>sum+v*r.configCache.primaryAxis[i],0)/R;
 const D=gap*(R-rMinus),S=R*R+a*a*cos*cos,A=(R*R+a*a)**2-a*a*D*(1-cos*cos);
 const lapse=Math.sqrt(S*D/A),speed=Math.sqrt(MU*r.parentMassSolar(ship)/ship.orbitMeters);
 const expected=1/(lapse*Math.sqrt(1-(speed/C)**2));
 assert(Number.isFinite(expected)&&expected>100,'The finite exterior clock should be strongly dilated');
 assert(Math.abs(clock.rateFactor/expected-1)<1e-5,'Actual '+clock.rateFactor+' vs Kerr lapse and local speed '+expected);
 console.log('PASS: edited near-horizon orbit, visible clearance '+gap.toFixed(2)+' m, finite distant/onboard rate '+clock.rateFactor.toPrecision(6)+'×.');
} finally {r.dispose();}
