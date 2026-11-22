import assert from 'node:assert/strict';
import {estimateTransfer,minimumTransferDistance,transferPlayback,arcPlaybackFraction,sampleTransferAtDistance,sampleTransfer,TRANSFER_LIGHT_SPEED as C,TRANSFER_GRAVITY as G} from '../dist/travel-math.js';
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),a+' != '+b);
for(const [length,initialSpeed,finalSpeed] of [[1e9,0,0],[1e9,1500,12000],[1e9,12000,1500],[2e16,.3*C,.7*C]]){
 const plan=estimateTransfer(length,'shuttle',1,{initialSpeed,finalSpeed,flipCoast:true}),r={straight:true,plan};
 const gammaExcess=v=>{let beta=v/C,s=Math.sqrt(1-beta*beta);return beta*beta/(s*(1+s));};
 const expected=length/2+C*C/(2*G)*(gammaExcess(finalSpeed)-gammaExcess(initialSpeed));
 near(transferPlayback(r,.5).distanceFraction*length,expected);
 let last=-1,proper=-1;
 for(let i=0;i<=100;i++){
  const u=i/100,s=transferPlayback(r,u),sample=sampleTransferAtDistance(plan,s.distanceFraction);
  assert(s.distanceFraction>last);last=s.distanceFraction;assert(sample.properSeconds>proper);proper=sample.properSeconds;
  near(sampleTransfer(plan,sample.properSeconds/plan.properSeconds).distanceFraction,s.distanceFraction);
  if(u>.41&&u<.59){assert.equal(s.commandedThrustG,0);near(sample.speedMetersPerSecond,plan.peakSpeed);assert.equal(sample.accelerationSign,0);}
 }
 near(transferPlayback(r,.5).turnAngle,Math.PI/2);near(transferPlayback(r,1).turnAngle,Math.PI);
 near(proper,plan.properSeconds);near(sampleTransferAtDistance(plan,1).coordinateSeconds,plan.coordinateSeconds);near(sampleTransferAtDistance(plan,1).speedMetersPerSecond,finalSpeed);
 for(const seam of [.41,.59]){const d=u=>transferPlayback(r,u).distanceFraction,h=1e-5;near((d(seam)-d(seam-h))/h,(d(seam+h)-d(seam))/h,3e-6);}
 assert(transferPlayback(r,.001).distanceFraction<1e-6);assert(1-transferPlayback(r,.999).distanceFraction<1e-6);
}
// The orbital arrival has a real, powered-off coasting distance during its
// return to prograde, including on legs whose total span loses local precision.
for(const length of [4e8,2e16]){
 const plan=estimateTransfer(length,'shuttle',1,{initialSpeed:7600,finalSpeed:1200,flipCoast:true,parkingArrival:true});
 assert(plan.parkingCoast);
 const route={straight:true,plan},join=10/(10+plan.parkingCoast.viewSeconds);
 let previous=Math.PI;
 for(let i=0;i<=40;i++){
  const shot=transferPlayback(route,join+(1-join)*i/40);
  const sample=sampleTransferAtDistance(plan,shot.distanceFraction,shot.remainingFraction);
  assert.equal(shot.commandedThrustG,0);assert(shot.turnAngle<=previous);
  near(sample.speedMetersPerSecond,plan.finalSpeed);near(sample.properSeconds,shot.sample.properSeconds);
  previous=shot.turnAngle;
 }
 near(previous,0);near(sampleTransfer(plan,1).distanceMeters,length);
}
assert(estimateTransfer(minimumTransferDistance(9000,1000)*.9,'shuttle',1,{initialSpeed:9000,finalSpeed:1000,flipCoast:true}).error);
assert(arcPlaybackFraction(.001)>0&&arcPlaybackFraction(.001)<1e-6);near(arcPlaybackFraction(.5),.5);
console.log('PASS straight transfer acceleration/braking/coast clocks, velocity-matched flip, stable point-to-point transfer and smooth contact timing');
