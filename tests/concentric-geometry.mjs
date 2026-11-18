import assert from 'node:assert/strict';
import {concentricChord,circularRadiusPose} from '../dist/travel-routes.js';
import {circularRadiusPlan,sampleCircularRadius,sampleTransferAtDistance,sampleTransfer} from '../dist/travel-math.js';
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),norm=v=>Math.hypot(...v);
for(const [a,b] of [[3,5],[5,3]]){
 const chord=concentricChord([0,0,0],a,b,[0,1,0],[1,0,0]);
 assert(Math.abs(norm(chord.start)-a)<1e-12);assert(Math.abs(norm(chord.end)-b)<1e-12);assert.equal(chord.length,4);
 assert(Math.abs(dot(a<b?chord.start:chord.end,chord.tangent))<1e-12);
 assert(dot(chord.arrivalTangent,chord.tangent)>0);
}
const g=9.80665,mu=3.9860044e14;
const near=(x,y,tol=1e-8)=>assert(Math.abs(x-y)<=tol*Math.max(1,Math.abs(y)),x+' vs '+y);
const geometry={radial:[1,0,0],departureTangent:[0,0,-1],orbitCenter:[0,0,0]};
for(const [ra,rb,h] of [[7e6,11e6,0],[11e6,7e6,0],[7e6,11e6,5e5]]){
 const p=circularRadiusPlan(ra,rb,mu,h),sign=Math.sign(rb-ra);
 const start=sampleCircularRadius(p,0),end=sampleCircularRadius(p,1);
 near(start.radius,ra);near(end.radius,rb);near(start.radialVelocity,0);near(end.radialVelocity,0);
 near(start.speedMetersPerSecond,Math.sqrt(mu/ra));near(end.speedMetersPerSecond,Math.sqrt(mu/rb));
 let last=start;
 for(let i=1;i<=100;i++){
  const u=i/100,s=sampleCircularRadius(p,u),pose=circularRadiusPose(geometry,s);
  assert(s.angle>last.angle&&s.properSeconds>last.properSeconds&&s.distanceMeters>last.distanceMeters);
  assert((s.radius-last.radius)*sign>=0);
  assert(s.commandedThrustG<=1&&s.requiredSupportG<=1+1e-12);
  near(s.speedMetersPerSecond,Math.hypot(s.radialVelocity,s.tangentialVelocity));
  near(s.radialAcceleration,s.radialThrust-mu*s.radius/Math.hypot(s.radius,h)**3);
  near(s.normalThrust,mu*h/Math.hypot(s.radius,h)**3);
  near(s.requiredSupportG,Math.hypot(s.radialThrust,s.normalThrust,s.tangentialThrust)/g);
  assert(s.tangentialThrust*sign>=0);
  if(u>0&&u<1){
   const du=1e-5,dt=du*p.coordinateSeconds,ls=sampleCircularRadius(p,u-du),rs=sampleCircularRadius(p,u+du);
   const l=circularRadiusPose(geometry,ls),r=circularRadiusPose(geometry,rs);
   const v=r.p.map((x,i)=>(x-l.p[i])/(2*dt)),acc=r.forward.map((x,j)=>(x*rs.speedMetersPerSecond-l.forward[j]*ls.speedMetersPerSecond)/(2*dt));
   near(norm(v),s.speedMetersPerSecond,1e-7);near(dot(v,pose.radial),s.radialVelocity,1e-6);
   near(dot(acc,pose.radial),s.radialAcceleration,1e-7);near(dot(acc,pose.tangent),s.tangentialAcceleration,1e-7);
   assert(Math.sign(s.radialVelocity)===sign);
  }
  near(sampleTransferAtDistance(p,s.distanceFraction).properSeconds,s.properSeconds);
  near(sampleTransfer(p,s.fraction).distanceMeters,s.distanceMeters);
  near(s.coordinateSeconds-s.properSeconds,s.dilationSeconds);last=s;
 }
}
// Work-energy consistency on an elevated transfer, independent of the polar
// acceleration assertions: only engine work can change orbital energy.
const elevated=circularRadiusPlan(7e6,11e6,mu,5e5),energy=s=>s.speedMetersPerSecond**2/2-mu/Math.hypot(s.radius,5e5);
let work=0;
for(let i=0;i<2000;i++){
 const s=sampleCircularRadius(elevated,(i+.5)/2000);
 work+=(s.radialThrust*s.radialVelocity+s.tangentialThrust*s.tangentialVelocity)*elevated.coordinateSeconds/2000;
}
near(work,energy(sampleCircularRadius(elevated,1))-energy(sampleCircularRadius(elevated,0)),1e-7);
// A deliberately unsupported close and elevated path is still playable;
// required support and an engine's actual capability are distinct.
const deep=circularRadiusPlan(1e11,1e10,5e26,3e9),low=sampleCircularRadius(deep,1);
assert(!deep.nominallyFeasible&&low.requiredSupportG>1e4&&low.commandedThrustG===1);
console.log('PASS: circular endpoint velocities, signed finite thrust, radial and tangential acceleration match trajectory derivatives, real elevated gravity, and unrestricted overload diagnostics.');
