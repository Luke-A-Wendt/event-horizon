import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parkedOrbitGeometry} from '../dist/orbit-path.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),len=a=>Math.hypot(...a),unit=a=>a.map(x=>x/len(a)),close=(a,b,t=1e-8)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
for(const scene of ['warp-orbit','shuttle-earth-moon-loop']){
 r.loadScene(scene);const craft=r.objects.find(o=>o.type===(scene==='warp-orbit'?'enterprise':'shuttle'));
 r.updateObject(craft.id,{orbitInclination:42,orbitNode:20,eccentricity:.2});
 for(let n=0;n<12;n++){
  r.time+=(2*Math.PI/r.orbitalOmega(craft))/12;r.fillHoles();r.fillObjects();
  const orbit=parkedOrbitGeometry(r,craft.id);assert(orbit,'has a parking orbit');
  const parent=r.getFocusFrame(craft.parentId),relativeVelocity=sub(orbit.craft.velocity,parent.velocity),plane=r.configCache.primaryBasis;
  close(dot(orbit.normal,plane[1]),1);close(dot(orbit.radial,orbit.normal),0);close(dot(unit(relativeVelocity),orbit.tangent),1);close(dot(orbit.craft.frame[2],orbit.tangent),1);
  close(len(relativeVelocity)*299792458/18,orbit.circularSpeedMetersPerSecond);close(orbit.radius,(craft.orbitMeters||craft.radius*r.massScale*RG));
 }
 if(craft.type==='shuttle'){
  const before=r.getOrbitEditInfo(craft.id),after=r.setShuttleOrbitSpeed(craft.id,before.speedMetersPerSecond*.5);assert(after.ok);close(after.radiusMeters,before.radiusMeters*4);close(after.speedMetersPerSecond,before.speedMetersPerSecond*.5);
 }
}
r.dispose();console.log('PASS: complete coplanar CCW spacecraft orbits; disk-level normal, tangential velocity, inverse-square speed/radius editor');
