import assert from 'node:assert/strict';
import {createFragment} from '../dist/shaders.js';
import {anomalyGradient} from '../dist/anomaly.js';
// Regression: a physical-size region has no central black hole. The old
// unused mass=1 margin dwarfed its ~3e-6 render bounds and exhausted every ray.
const radius=9.449581170883903e-7,bounds=3.3073534566585423e-6;
const region={position:[radius*.5,0,0],radius,anomalyStrength:2.4,anomalyScale:1.35,anomalyMotion:1};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,k)=>a.map(x=>x*k),norm=a=>mul(a,1/Math.hypot(...a));
function trace(v,legacy){
 let p=[0,0,radius*.38],steps=0;
 const force=(p,v)=>{const g=mul(anomalyGradient(p,region),1/radius);return mul(add(g,mul(v,-dot(g,v))),-2);};
 for(;steps<256;steps++){
  if(Math.hypot(...p)>bounds+(legacy?.05:bounds*.00001)&&dot(p,v)>0)break;
  const distance=Math.hypot(...add(p,mul(region.position,-1))),dt=Math.min(Math.max(.000001,bounds*.06),Math.max(radius*.055,Math.abs(distance-radius*2.5)*.3));
  const a=force(p,v),midV=add(v,mul(a,dt*.5)),midP=add(p,mul(v,dt*.5));
  v=add(v,mul(force(midP,midV),dt));p=add(p,mul(midV,dt));
 }
 return {direction:norm(v),steps};
}
let oldSteps=0,newSteps=0;
for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){
 const direction=norm([x*.18,y*.18,-1]),before=trace(direction,true),after=trace(direction,false);
 assert(Math.hypot(...add(before.direction,mul(after.direction,-1)))<1e-10,'The bounded exit must preserve outgoing light direction');
 oldSteps+=before.steps;newSteps+=after.steps;
}
assert(newSteps<oldSteps*.4,'Empty-space steps should be removed');
const source=createFragment({anomaly:true,warp:true,grid:true,craft:true,craftMask:8});
assert(source.includes('uBounds+(uWarpFlags.w>.5?uMass*.05:uBounds*.00001)'));
assert(source.includes('enter-(uWarpFlags.w>.5?uMass*.03:uBounds*.00001)'));
console.log(`PASS: ${oldSteps} → ${newSteps} ray steps; identical outgoing directions; hole margin retained only for actual holes.`);
