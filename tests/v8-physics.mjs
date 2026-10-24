import assert from 'node:assert/strict';
import { bridgeIsotropicRadius,bridgeProperRadius,bridgeConformal,bridgeGradient,bridgePath,gaussianSegmentIntegral } from '../dist/bridge-math.js';
import { gridOutflowLabel,gridInfallVelocity } from '../dist/grid-glsl.js';
import { DEFAULTS,makePreset } from '../dist/config.js';
import { createFragment } from '../dist/shaders.js';
const near=(actual,expected,tolerance=1e-7)=>assert(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

// Independent coordinate identities: neither the throat nor either finite end
// may acquire a coordinate singularity. Physical lengths use Ω times dx.
for(const b of [1e-8,1,2000])for(const l of [-100,-6,-1,0,1,6,100].map(x=>x*b)){
 const r=bridgeIsotropicRadius(l,b),other=bridgeIsotropicRadius(-l,b);
 assert(r>0&&Number.isFinite(r));
 near(bridgeProperRadius(r,b)/b,l/b,1e-9);
 near(r*other/(b*b),.25,1e-9);
 near(bridgeConformal(r,b)*r/b,Math.hypot(l,b)/b,1e-9);
 const epsilon=r*1e-5;
 const numerical=(Math.log(bridgeConformal(r+epsilon,b))-Math.log(bridgeConformal(r-epsilon,b)))/(2*epsilon);
 near(bridgeGradient([0,0,r],b)[2]*r,numerical*r,1e-7);
}
near(bridgeConformal(.5,1),2);near(bridgePath(0,1).l,6);
near(bridgePath(Math.PI/.12,1).l,-6);near(bridgePath(100,1,false).l,6);

// Trace a ray against the analytic conserved impact parameter n*r*sin(alpha).
// Below the Ellis critical impact b it reaches the other end; above b it
// returns to the original end. This catches repulsive or wrong-sign gradients.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
for(const impact of [.8,1.2]){
 let p=[0,0,6],theta=Math.asin(impact/(bridgeConformal(6,1)*6)),v=[Math.sin(theta),0,-Math.cos(theta)],other=false,escaped=false,maxError=0;
 const acceleration=(position,direction)=>{const g=bridgeGradient(position,1),parallel=dot(g,direction);return g.map((x,i)=>x-direction[i]*parallel);};
 for(let i=0;i<20000;i++){
  const r=Math.hypot(...p);if(r<.012){other=true;break;}if(r>20&&dot(p,v)>0){escaped=true;break;}
  const angular=Math.hypot(p[1]*v[2]-p[2]*v[1],p[2]*v[0]-p[0]*v[2],p[0]*v[1]-p[1]*v[0]);
  maxError=Math.max(maxError,Math.abs(bridgeConformal(r,1)*angular-impact));
  const h=Math.min(.003*r,.003),a=acceleration(p,v),midV=unit(v.map((x,j)=>x+a[j]*h*.5)),midP=p.map((x,j)=>x+v[j]*h*.5),midA=acceleration(midP,midV);
  p=p.map((x,j)=>x+midV[j]*h);v=unit(v.map((x,j)=>x+midA[j]*h));
 }
 assert(maxError<.00002,`Ellis angular momentum drift ${maxError}`);
 assert.equal(other,impact<1);assert.equal(escaped,impact>1);
}

// Integrate Gaussian coverage independently with Simpson quadrature. Narrow
// off-midpoint crossings must contribute, including near-parallel segments.
for(const [start,end,width] of [[[-3,.05],[1,.05],.12],[[0,0],[0,0],.2],[[1,0],[1,1],.3],[[-2,.3],[4,-.2],.4],[[0,0],[1e-7,0],1]]){
 const n=20000,h=1/n;let integral=0;
 for(let i=0;i<=n;i++){const point=start.map((x,j)=>x+(end[j]-x)*i*h),value=Math.exp(-dot(point,point)/(width*width));integral+=(i===0||i===n?1:i%2?4:2)*value;}
 integral*=h/3;near(gaussianSegmentIntegral(start,end,width),integral,1e-6);
}
assert(gaussianSegmentIntegral([-3,.05],[1,.05],.12)>.04,'Oblique thin beam must not disappear between ray samples');

// Time-reversed PG labels are conserved along outward marker trajectories.
for(const start of [2.2,4,12])for(const time of [.1,1,10]){
 const radius=Math.pow(start**1.5+3*Math.SQRT2*time,2/3),epsilon=1e-5;
 near(gridOutflowLabel(radius,time),start);
 const position=t=>Math.pow(start**1.5+3*Math.SQRT2*t,2/3);
 near((position(time+epsilon)-position(time-epsilon))/(2*epsilon),-gridInfallVelocity(radius),1e-6);
}
for(const time of [0,1,1000]){
 const boundary=Math.pow(3*Math.SQRT2*time,2/3);
 for(const delta of [-1e-8,0,1e-8])assert(Number.isFinite(gridOutflowLabel(Math.max(0,boundary+delta),time)));
}
assert(Math.abs(gridOutflowLabel(1e12,1000)/1e12-1)<1e-10,'Outgoing labels must become an undistorted far chart');
assert(Math.abs(gridInfallVelocity(1e12))<1e-5,'Both flow orientations must become stationary far away');
assert.equal(DEFAULTS.whiteHole,false);assert.equal(DEFAULTS.bridge,false);
assert.equal(makePreset('white-hole').spin,0);assert.equal(makePreset('bridge').blackHole,false);
const base=createFragment(),bridge=createFragment({bridge:true});
assert(!base.includes('vec3 bridgeTrace('),'Ordinary cold starts must not compile wormhole integration');
assert(bridge.includes('vec3 bridgeTrace('));
assert(bridge.includes('bridgeGridSegment(previous,p,travelled,pixelAngle)'));
assert(base.includes('jetField(previous,p,dt)'),'Jets must sample the deflected ray segment');
assert(base.includes('uPhotoOffset+uPhotoJitter'),'Tile samples must address their full-image pixel');
assert(base.includes('uInverseProjection*vec4(ndc,-1.0,1.0)'),'XR rays must use the actual per-eye projection');
console.log('PASS: Ellis coordinate identities, conserved impact and two-ended rays, jet Gaussian coverage, outward PG flow, and optional metric/XR/photo shader paths.');
