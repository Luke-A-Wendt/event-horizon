// The independently commanded drive and the local tidal field contribute
// to optics without changing the actual motor setting or vehicle velocity.
import assert from 'node:assert/strict';
import {shieldDemand,combinedWarpEnvelope,effectiveWarpRadius,warpDisplayStrength,SHIELD_REFERENCE_DISTANCE as D} from '../dist/warp-physics.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const hole=[0,0,0,1],h=[2];
const shield=(r=1,m=1)=>shieldDemand([D*r,0,0],[0,0,0,m],h);
assert.equal(shield(),4);assert(shield(.5)>4&&shield(2)<4);assert(shield(1,2)>4);
assert(shield(2,2)<4,'Larger black hole at the same scaled radius has weaker tides');
assert.equal(shieldDemand([D,0,0],[],[],[{collapsed:true,massSolar:4300000,horizonRadius:2,position:[0,0,0]}]),4);
assert.deepEqual(combinedWarpEnvelope(4,0),combinedWarpEnvelope(0,4));
const both=combinedWarpEnvelope(4,4);assert(both.strength>warpDisplayStrength(4)&&both.radius>effectiveWarpRadius(4));
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('warp-orbit');const id=r.warpObjectId,q=r.getFlightSequence(id);
r.setFlightSequence(id,q.nodes.map(n=>({...n,warpFactor:0})),{loop:q.loop});
assert.equal(r.state.warpFactor,0);assert.equal(r.orbitalOmega(r.objects.find(x=>x.id===id)),0);
r.fillObjects();r.updateCameraFrame();r.setDrawUniforms();
assert(f.uniforms.get('uWarpStrength').args[0]>0,'Parked ship still has a visible field');
const frame=r.getFocusFrame(id),rad=r.warpEnvelope(frame).radius;assert(rad>effectiveWarpRadius(0));
r.setNavigationMode(id,'manual');assert.equal(r.getFlightState().speedMetersPerSecond,0);
r.loadScene('warp-lab');const b=r.getFocusFrame(r.warpObjectId);
for(const warpFactor of [0,.5,4,8])assert.deepEqual(r.warpEnvelope(b,{...r.state,warpFactor}),{radius:effectiveWarpRadius(warpFactor),strength:warpDisplayStrength(warpFactor)});
r.dispose();console.log('PASS: tidal shielding and independent warp propulsion combine; stationary orbital shield and flat-space lab behavior.');
