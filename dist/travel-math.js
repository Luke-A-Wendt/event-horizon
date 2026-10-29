// Bounded rest-to-rest transfer estimates in a local flat reference frame.
// Shuttle: 1 g proper acceleration, reverse thrust halfway, then 1 g braking.
// Enterprise: fictional clock protection and a smooth Warp 1 (at most c) ramp.
// Gravity and moving-target corrections belong to the scene controller.
export const TRANSFER_LIGHT_SPEED=299792458;
export const TRANSFER_GRAVITY=9.80665;
const MAX_DISTANCE=1e100;
const clamp01=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const c=TRANSFER_LIGHT_SPEED,a=TRANSFER_GRAVITY,clockScale=c/a;
function sinhExcess(x){
 // sinh(x)-x loses all significant digits for ordinary short Shuttle trips.
 if(Math.abs(x)<.02){const x2=x*x;return x*x2*(1/6+x2*(1/120+x2*(1/5040+x2*(1/362880+x2/39916800))));}
 return Math.sinh(x)-x;
}
const speedAt=eta=>Math.min(c*(1-8*Number.EPSILON),c*Math.tanh(eta));
export function estimateTransfer(distanceMeters,type='shuttle'){
 const distance=Math.max(0,Math.min(MAX_DISTANCE,Number.isFinite(distanceMeters)?distanceMeters:0));
 if(type==='enterprise'){
  // The quintic ease has peak derivative 15/8. This duration makes its peak c.
  const seconds=distance/c*1.875;
  return {type,distanceMeters:distance,properSeconds:seconds,coordinateSeconds:seconds,dilationSeconds:0,peakSpeed:distance?c:0,peakRapidity:0,accelerationMetersPerSecondSquared:0,warpFactor:1};
 }
 // acosh(1+z) written without adding a tiny z to one.
 const z=distance*(a/(2*c*c)),peakRapidity=2*Math.asinh(Math.sqrt(z*.5));
 const properSeconds=2*clockScale*peakRapidity,coordinateSeconds=2*clockScale*Math.sinh(peakRapidity),dilationSeconds=2*clockScale*sinhExcess(peakRapidity);
 return {type:'shuttle',distanceMeters:distance,properSeconds,coordinateSeconds,dilationSeconds,peakSpeed:speedAt(peakRapidity),peakRapidity,accelerationMetersPerSecondSquared:a,warpFactor:0};
}
export function sampleTransfer(plan,fraction){
 const u=clamp01(fraction),distance=plan?.distanceMeters||0;
 if(!(distance>0))return {fraction:u,distanceFraction:u,distanceMeters:0,speedMetersPerSecond:0,properSeconds:0,coordinateSeconds:0,dilationSeconds:0,rapidity:0,lorentzFactor:1,accelerationSign:0};
 if(plan.type==='enterprise'){
  const distanceFraction=u*u*u*(10+u*(-15+6*u)),derivative=30*u*u*(1-u)*(1-u),seconds=u*plan.coordinateSeconds;
  return {fraction:u,distanceFraction,distanceMeters:distance*distanceFraction,speedMetersPerSecond:distance/plan.coordinateSeconds*derivative,properSeconds:seconds,coordinateSeconds:seconds,dilationSeconds:0,rapidity:0,lorentzFactor:1,accelerationSign:u===0||u===.5||u===1?0:u<.5?1:-1};
 }
 const outward=u<=.5,rapidity=plan.peakRapidity*2*(outward?u:1-u),localCoordinate=clockScale*Math.sinh(rapidity),localDifference=clockScale*sinhExcess(rapidity);
 const halfRatio=Math.sinh(rapidity*.5)/Math.sinh(plan.peakRapidity*.5),distanceFraction=outward?.5*halfRatio*halfRatio:1-.5*halfRatio*halfRatio;
 return {fraction:u,distanceFraction,distanceMeters:distance*distanceFraction,speedMetersPerSecond:speedAt(rapidity),properSeconds:u*plan.properSeconds,coordinateSeconds:outward?localCoordinate:plan.coordinateSeconds-localCoordinate,dilationSeconds:outward?localDifference:plan.dilationSeconds-localDifference,rapidity,lorentzFactor:Math.cosh(rapidity),accelerationSign:u===0||u===1?0:outward?1:-1};
}

// A C2 cinematic clock: the physical 1 g / Warp 1 model stays unchanged;
// only its playback rate eases in/out within ten active wall seconds.
export const TRANSFER_WALL_SECONDS=10;
export const transferEase=x=>{const u=clamp01(x);return u*u*u*(10+u*(-15+6*u));};
const vadd=(a,b)=>a.map((v,i)=>v+b[i]),vsub=(a,b)=>a.map((v,i)=>v-b[i]),vscale=(a,s)=>a.map(v=>v*s);
function curveDerivative(p,t){const u=1-t;return vadd(vadd(vscale(vsub(p[1],p[0]),3*u*u),vscale(vsub(p[2],p[1]),6*u*t)),vscale(vsub(p[3],p[2]),3*t*t));}
function curvePoint(p,t){const u=1-t;return p[0].map((v,i)=>v*u*u*u+3*p[1][i]*u*u*t+3*p[2][i]*u*t*t+p[3][i]*t*t*t);}
// Five-point Gaussian quadrature and three bounded Newton iterations eliminate
// the velocity steps from linearly interpolating a sparse arc-length table.
const GAUSS_X=[0,-.5384693101056831,.5384693101056831,-.906179845938664,.906179845938664],GAUSS_W=[.5688888888888889,.4786286704993665,.4786286704993665,.2369268850561891,.2369268850561891];
function curveLength(p,lo,hi){const half=(hi-lo)*.5,mid=(hi+lo)*.5;let n=0;for(let i=0;i<5;i++)n+=GAUSS_W[i]*Math.hypot(...curveDerivative(p,mid+half*GAUSS_X[i]));return n*half;}
export function buildTransferCurve(points){const arc=[0],segments=64;for(let i=0;i<segments;i++)arc.push(arc[i]+curveLength(points,i/segments,(i+1)/segments));return {points,arc,length:arc.at(-1)};}
export function sampleTransferCurve(curve,fraction){
 const u=clamp01(fraction),arc=curve.arc,n=arc.length-1,total=arc[n],distance=u*total;let low=0,high=n;
 while(high-low>1){const mid=(low+high)>>1;if(arc[mid]<=distance)low=mid;else high=mid;}
 const lo=low/n,hi=high/n,span=arc[high]-arc[low];let t=span>0?lo+(hi-lo)*(distance-arc[low])/span:lo;
 for(let i=0;i<3;i++){const speed=Math.hypot(...curveDerivative(curve.points,t));if(speed>0)t=Math.max(lo,Math.min(hi,t-(arc[low]+curveLength(curve.points,lo,t)-distance)/speed));}
 if(u===0)t=0;if(u===1)t=1;const tangent=curveDerivative(curve.points,t),length=Math.hypot(...tangent)||1;
 return {position:curvePoint(curve.points,t),tangent:tangent.map(v=>v/length),parameter:t};
}
