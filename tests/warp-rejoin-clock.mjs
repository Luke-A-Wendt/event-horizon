import assert from 'node:assert/strict';
import {estimateTransfer,sampleTransfer,sampleTransferAtDistance,transferPlayback} from '../dist/travel-math.js';
import {speedForWarp} from '../dist/flight-dynamics.js';
const cap=speedForWarp(8);
for(const [length,v0,v1] of [[8e15,0,0],[6e14,speedForWarp(9),0],[1e6,20,7000]]) {
 const plan=estimateTransfer(length,'enterprise',1,{rejoin:true,initialSpeed:v0,finalSpeed:v1});
 const at=u=>sampleTransfer(plan,u),cruise=at(.5).speedMetersPerSecond;
 assert(cruise<=cap);assert.equal(at(0).speedMetersPerSecond,v0);assert.equal(at(1).speedMetersPerSecond,v1);
 assert.equal(at(.35).speedMetersPerSecond,cruise);assert.equal(at(.65).speedMetersPerSecond,cruise);
 const coast=transferPlayback({straight:true,plan},.5);assert.equal(coast.phase,'Warp cruise');
 let x=0;
 for(let i=1;i<=400;i++){
  const u=i/400,m=at(u-.5/400),s=at(u);assert(s.distanceMeters>=x);assert(s.speedMetersPerSecond<=Math.max(cap,v0));
  const avg=(s.distanceMeters-x)*400/plan.coordinateSeconds;assert(Math.abs(avg-m.speedMetersPerSecond)<1e-4*Math.max(v0,cruise,v1));
  if(u>.02&&u<.98)assert(Math.abs(sampleTransferAtDistance(plan,s.distanceFraction).speedMetersPerSecond-s.speedMetersPerSecond)<1e-6*Math.max(cruise,v0));
  x=s.distanceMeters;
 }
 assert.equal(x,length);
}
console.log('PASS: warp recovery timing, integrated distance, matched velocities, coast and warp-eight cap.');
