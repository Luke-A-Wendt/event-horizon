import assert from 'node:assert/strict';
import {sampleEquatorialFreefall as sample} from '../dist/freefall.js';
const rg=6.35e9,c=299792458,rad=180*rg,near=(actual,desired,eps=1e-10)=>assert(Math.abs(actual-desired)<=eps*Math.max(1,Math.abs(desired)),actual+' ≠ '+desired);
for(const a of [0,.75,-.75,.9999]){
 const horizon=(1+Math.sqrt(1-a*a))*rg,end=horizon+15;
 const at=f=>sample(rg,a,rad,end,f);
 const s0=at(0),s1=at(1);
 assert.equal(s0.speedMetersPerSecond,0);assert.equal(s0.properSeconds,0);assert.equal(s0.coordinateSeconds,0);assert.equal(s0.azimuth,0);
 assert.equal(s0.radiusMeters,rad);assert.equal(s1.radiusMeters,end);
 assert(s1.speedMetersPerSecond<c&&s1.speedMetersPerSecond>.999999*c);
 assert(s1.coordinateSeconds>s1.properSeconds&&s1.properSeconds>0);
 assert.equal(Math.sign(s1.azimuth),Math.sign(a));const E=1/s0.gravityFactor;
 let prev=s0;
 for(let i=1;i<=50;i++){
  const f=i/50,y=at(f);assert(y.properSeconds>=prev.properSeconds&&y.coordinateSeconds>prev.coordinateSeconds&&y.lagSeconds>prev.lagSeconds);
  assert(y.radiusMeters<prev.radiusMeters&&y.speedMetersPerSecond>prev.speedMetersPerSecond);assert.equal(y.crewLoadG,0);
  near(y.kinematicFactor/y.gravityFactor,E);near(y.kinematicFactor*y.gravityFactor,y.rateFactor);
  near(y.coordinateSeconds-y.properSeconds,y.lagSeconds,1e-9);
  if(a===0){
   const x=y.radiusMeters/rad;
   const tau=rg/c*Math.sqrt(180**3/2)*(Math.acos(Math.sqrt(x))+Math.sqrt(x*(1-x)));
   near(y.properSeconds,tau,2e-9);assert.equal(y.azimuth,0);
  }
  prev=y;
 }
 const q=at(.52),l=at(.52-1e-6),h=at(.52+1e-6),dt=h.coordinateSeconds-l.coordinateSeconds;
 near((h.radiusMeters-l.radiusMeters)/dt,q.radialSpeedMetersPerSecond,1e-7);
 near((h.azimuth-l.azimuth)/dt,q.angularVelocity,1e-9);
 near((h.properSeconds-l.properSeconds)/(2e-6),q.properSecondsPerFraction,1e-7);
 const x=q.radiusMeters/rg,H=x*x+a*a+2*a*a/x;
 const metricPhi=-2*a/x*q.rateFactor+H*q.angularVelocity*(rg/c)*q.rateFactor;
 near(metricPhi,0);
 near((h.radialSpeedMetersPerSecond-l.radialSpeedMetersPerSecond)/dt-q.radiusMeters*q.angularVelocity**2,q.radialAcceleration,1e-6);
 near(q.radiusMeters*(h.angularVelocity-l.angularVelocity)/dt+2*q.radialSpeedMetersPerSecond*q.angularVelocity,q.tangentialAcceleration,1e-6);
}
assert.equal(sample(rg,0,rad,1.9*rg,1),null);
console.log('PASS: free fall from rest, Schwarzschild proper-time solution, Kerr energy/angular momentum, trajectory derivatives, incoming clocks at a 15 m horizon gap.');

// Playback may run the same worldline at a different pace. At a given radius,
// both accumulated clocks, physical velocity and dragging must still match.
const a=.75,end=(1+Math.sqrt(1-a*a))*rg+15,shot=f=>sample(rg,a,rad,end,f,'visual');
const rs=[.10,.20,.30,.40].map(f=>shot(f).radiusMeters),steps=rs.slice(1).map((r,i)=>rs[i]-r);
assert(Math.max(...steps)/Math.min(...steps)<1.12,'nearly even radial steps in the long outer approach');
assert(Math.abs(shot(1).azimuth-shot(.8).azimuth)>5,'the final sweep gets its own share of screen time');
for(const f of [0,.15,.5,.76,.92,1]){
 const y=shot(f);let l=0,h=1;
 for(let i=0;i<54;i++){const m=(l+h)/2;if(sample(rg,a,rad,end,m).properSeconds<y.properSeconds)l=m;else h=m;}
 const old=sample(rg,a,rad,end,f===0||f===1?f:(l+h)/2);
 near(y.radiusMeters,old.radiusMeters,1e-8);near(y.coordinateSeconds,old.coordinateSeconds,3e-7);near(y.speedMetersPerSecond,old.speedMetersPerSecond,1e-8);
 if(f>0&&f<.8)near((shot(f+1e-6).properSeconds-shot(f-1e-6).properSeconds)/2e-6,y.properSecondsPerFraction,2e-5);
}
console.log('PASS: camera-paced Kerr descent samples the original worldline and both physical clocks.');
