import assert from 'node:assert/strict';
import {clockRate,compactCircularClockRate,CLOCK_LIGHT_SPEED as c,CLOCK_SOLAR_GM as mu} from '../dist/object-clocks.js';
const close=(a,b,tol=2e-11)=>assert(Math.abs(a/b-1)<tol,`${a} vs ${b}`);
const M=2**32,source={id:'hole',massSolar:M*c*c/mu,positionMeters:[0,0,0],spinAxis:[0,1,0]};
for(const spin of [0,.65,.998]){
 const q=Math.sqrt(1-spin**2),rp=M*(1+q),rm=M*(1-q);
 Object.assign(source,{spinParameter:spin,horizonMeters:rp});
 for(const cos of [0,1]){
  let prev=1;
  for(const relativeGap of [1,.1,1e-3,1e-6,1e-8,1e-12]){
   const r=rp*(1+relativeGap),a=spin*M,p=cos?[0,r,0]:[r,0,0],D=(r-rp)*(r-rm),S=r*r+(a*cos)**2,A=(r*r+a*a)**2-D*a*a*(1-cos*cos);
   const k=clockRate({sources:[source],positionMeters:p,bodyRadiusMeters:1000});
   close(k.gravityFactor,Math.sqrt(A/(D*S)));assert(k.gravityFactor>prev);prev=k.gravityFactor;
   if(!cos&&spin){const v=.4*c,clock=compactCircularClockRate(k,v,source,p);close(clock.rateFactor,k.gravityFactor/Math.sqrt(1-(v/c)**2));
    close(clock.coordinateAngularSpeed,2*M*a*r*c/A+v*Math.sqrt(D*S/A)*Math.sqrt(S/A));}
  }
 }
 if(!spin)for(const r of [6*M,9*M,40*M]){
  const p=[r,0,0],k=clockRate({positionMeters:p,sources:[source]}),v=c*Math.sqrt(M/r);
  const clock=compactCircularClockRate(k,v,source,p);
  close(clock.rateFactor,1/Math.sqrt(1-3*M/r));close(clock.coordinateAngularSpeed,v/r);
 }
}
console.log('PASS: Schwarzschild stable circular orbits; Kerr lapse at equator and pole; finite rising exterior rate through 10^-12 horizon gaps; local speed and frame-dragging conversion.');
