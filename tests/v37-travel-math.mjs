import assert from 'node:assert/strict';
import {estimateTransfer,sampleTransfer,TRANSFER_LIGHT_SPEED as c,TRANSFER_GRAVITY as a} from '../dist/travel-math.js';
const near=(x,y,tolerance=1e-10)=>assert(Math.abs(x-y)<=Math.max(1e-30,Math.abs(y)*tolerance),`${x} != ${y}`);
for(const distance of [0,1e-9,1,1000,3.844e8,1.496e11,4.0175e16,1e25,1e100])for(const type of ['shuttle','enterprise']){
 const p=estimateTransfer(distance,type);assert(Object.values(p).filter(v=>typeof v==='number').every(Number.isFinite));assert(p.properSeconds<=p.coordinateSeconds*(1+1e-14));assert(p.dilationSeconds>=0);
 let previous=null;
 for(let i=0;i<=100;i++){
  const s=sampleTransfer(p,i/100);assert(Object.values(s).every(Number.isFinite));assert(s.distanceFraction>=0&&s.distanceFraction<=1);assert(s.speedMetersPerSecond>=0&&s.speedMetersPerSecond<=c*(1+1e-14));
  if(previous)for(const key of ['distanceMeters','coordinateSeconds','properSeconds','dilationSeconds'])assert(s[key]>=previous[key],key+' is monotone');previous=s;
 }
 const start=sampleTransfer(p,0),middle=sampleTransfer(p,.5),end=sampleTransfer(p,1);near(start.distanceMeters,0);near(end.distanceMeters,distance);near(middle.distanceMeters,distance*.5);near(end.speedMetersPerSecond,0);near(end.coordinateSeconds,p.coordinateSeconds);near(end.properSeconds,p.properSeconds);near(end.dilationSeconds,p.dilationSeconds);
 if(type==='shuttle'&&distance){assert(p.peakSpeed<c);near(p.dilationSeconds,2*c/a*(p.peakRapidity<.02?p.peakRapidity**3/6*(1+p.peakRapidity**2/20+p.peakRapidity**4/840+p.peakRapidity**6/60480+p.peakRapidity**8/6652800):Math.sinh(p.peakRapidity)-p.peakRapidity));}
 if(type==='enterprise'&&distance){near(middle.speedMetersPerSecond,c);assert.equal(p.dilationSeconds,0);near(p.coordinateSeconds,1.875*distance/c);}
}
const ordinary=estimateTransfer(1000,'shuttle');near(ordinary.properSeconds,2*Math.sqrt(1000/a),1e-10);assert(ordinary.dilationSeconds>0,'Small ordinary trips retain clock differences');
const interstellar=estimateTransfer(4.0175e16,'shuttle');assert(interstellar.peakSpeed>.8*c);assert(interstellar.coordinateSeconds>interstellar.properSeconds);
for(const f of [.1,.3,.7,.9]){
 const p=estimateTransfer(1.496e11,'shuttle'),epsilon=1e-5,left=sampleTransfer(p,f-epsilon),right=sampleTransfer(p,f+epsilon),center=sampleTransfer(p,f);
 near((right.distanceMeters-left.distanceMeters)/(right.coordinateSeconds-left.coordinateSeconds),center.speedMetersPerSecond,1e-7);
 near((right.coordinateSeconds-left.coordinateSeconds)/(right.properSeconds-left.properSeconds),center.lorentzFactor,1e-7);
}
for(const invalid of [-1,NaN,Infinity,-Infinity])assert.equal(estimateTransfer(invalid).distanceMeters,0);
assert.equal(sampleTransfer(ordinary,-1).fraction,0);assert.equal(sampleTransfer(ordinary,2).fraction,1);
console.log('PASS: stable 1g relativistic rest-to-rest travel times, tiny clock excess, monotonic samples, speed/time derivatives, and smooth peak-Warp1 transfers.');
