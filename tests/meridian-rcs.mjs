import assert from 'node:assert/strict';
import {rimJets,rimTurnCommand} from '../dist/meridian-rcs.js';
import {meridianExhaust} from '../dist/meridian-mesh.js';
import {makeDockingLeg,sampleDockingTransit,sampleDockingAcquire,sampleDockingOrbit,sampleDockingClose} from '../dist/docking-flight.js';
const S=[0,0,0],near=(x,y,e=1e-10)=>assert(Math.abs(x-y)<e,x+' vs '+y);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Sum each nozzle's reaction force and moment about the deck cluster center.
for(const [acc,turn] of [[S,S],[[.5,-.8,.9],S],[S,[0,0,1]],[S,[.7,-.8,-.4]],[[.4,-.8,.92],[-1,.2,.5]]]){
 const f=[0,0,0],m=[0,0,0];
 for(const jet of rimJets(acc,turn)){
  const pos=jet.position.slice();pos[2]-=(.35+.645)/2;
  const reaction=jet.axis.map(v=>-v*jet.duty),moment=cross(pos,reaction);
  for(let i=0;i<3;i++){f[i]+=reaction[i];m[i]+=moment[i];}
 }
 const scale=Math.max(1,.5*Math.abs(acc[2])+Math.max(Math.abs(turn[0]),Math.abs(turn[1])));
 for(let i=0;i<3;i++){near(f[i],2*acc[i]/scale);near(m[i],2*.473*turn[i]/scale);}
}
const basis=a=>[[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0],[0,0,1]];
const h=.04,rate=t=>basis(t*.02);
assert.deepEqual(rimTurnCommand(rate(1-h),rate(1),rate(1+h),h),S);
const angle=t=>basis(.001*t*t);
assert(rimTurnCommand(angle(1-h),angle(1),angle(1+h),h)[2]>.49);
for(const dir of [-1,1])assert(meridianExhaust(0,0,null,[0,dir,0]).faces.length>0,'opposed rim jets in a coast flip');
const B=basis(0),a={position:S,velocity:S,basis:B},b={...a,position:[0,0,4e9]},T=60000;
const leg=makeDockingLeg(a,b,T),plan={duration:T,legs:[leg],target:b,craftRadius:21.6};
const flip=f=>sampleDockingTransit(plan,leg.hold+leg.burn+f*leg.coast);
assert(flip(.25).rcsTorque[0]>.1&&flip(.75).rcsTorque[0]<-.1,'flip spins up, then fires opposite nozzles to arrest rotation');
assert.deepEqual(flip(.5).rcsTorque,S);assert.equal(flip(.25).mainThrustG,0);
const station={position:[6800000,0,0],velocity:[0,0,7670],parentPosition:S,parentVelocity:S,parentRadiusMeters:6371000,radiusMeters:1060,basis:B,side:-1};
const approach=sampleDockingAcquire(station,21.6,.25);
assert(Math.hypot(...approach.rcsTorque)>.0001&&Math.hypot(...approach.rcs)>.01&&approach.mainThrustG===0,'acquiring the underside uses rim translation and turning together');
for(const q of [sampleDockingOrbit(station,21.6),sampleDockingClose(station,21.6,1,'hold')])assert.equal(rimJets(q.rcs,q.rcsTorque).length,0,'matched orbit and latched rest have no exhaust');
console.log('PASS: nozzle reaction vectors deliver commanded force and torque (including simultaneous saturation); constant-rate rotation coasts, spin-up fires correctly signed jets.');
