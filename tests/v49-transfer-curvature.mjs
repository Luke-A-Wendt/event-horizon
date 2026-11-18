import assert from 'node:assert/strict';
import {orbitTransferPath,buildTransferCurve,transferCurvePoint,transferCurveDerivative,sampleTransferCurve} from '../dist/travel-math.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a));
const close=(a,b,t=1e-7)=>assert(norm(sub(a,b))<t,`${a} != ${b}`);
function endpoint(segment,last){const n=segment.length-1,p=last?segment.slice().reverse():segment,v=mul(sub(p[1],p[0]),n*(last?-1:1)),a=mul(add(sub(p[2],mul(p[1],2)),p[0]),n*(n-1)),t=unit(v);return {p:p[0],t,k:mul(sub(a,mul(t,dot(a,t))),1/dot(v,v))};}
for(const distance of [30,3000,3e6]){
 const start=[1,0,0],end=[distance-1,0,0],path=orbitTransferPath({start,end,startCenter:[0,0,0],endCenter:[distance,0,0],startTangent:[0,0,-1],endTangent:[0,0,1]});
 assert.equal(path.segments.length,33);assert(path.departureTurns>=1&&path.departureTurns<=2&&path.arrivalTurns>=1&&path.arrivalTurns<=2);
 close(transferCurvePoint(path,0),start);close(transferCurvePoint(path,1),end);close(unit(transferCurveDerivative(path,0)),[0,0,-1]);close(unit(transferCurveDerivative(path,1)),[0,0,1]);
 close(endpoint(path.segments[0],false).k,[-1,0,0]);close(endpoint(path.segments.at(-1),true).k,[1,0,0]);
 for(let i=1;i<path.segments.length;i++){const a=endpoint(path.segments[i-1],true),b=endpoint(path.segments[i],false);close(a.p,b.p);assert(dot(a.t,b.t)>1-1e-11,'No tangent corner');close(a.k,b.k,1e-7);}
 for(let i=0;i<=256;i++){const u=i/256,departure=transferCurvePoint(path,u*16/33),arrival=transferCurvePoint(path,17/33+u*16/33);assert(norm(departure)>=1-1e-8,'Departure stays outside the starting orbit');assert(norm(sub(arrival,[distance,0,0]))>=1-1e-8,'Insertion stays outside the parking orbit');}
 const curve=buildTransferCurve(path);for(let i=0;i<=100;i++){const p=sampleTransferCurve(curve,i/100);assert(p.position.every(Number.isFinite));assert(p.tangent.every(Number.isFinite));}
}
console.log('PASS: bounded clothoid turns, exact circular-orbit tangents/curvatures, position/tangent/curvature continuity at every join, exterior spiral legs, and finite arc playback across six orders of route scale.');
