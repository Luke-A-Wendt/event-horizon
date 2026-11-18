import assert from 'node:assert/strict';
import {directedExternalTangent} from '../dist/travel-routes.js';
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>a.map(v=>v/Math.hypot(...a));
for(const [ra,rb] of [[30,30],[10,50],[50,10],[0,10],[30,0]]){
 const up=unit([1,2,3]),A=[-8,4,5],east=unit(cross(up,[0,1,0])),D=300,B=A.map((v,i)=>v+east[i]*D),g=directedExternalTangent(A,ra,B,rb,up);
 assert(!g.error);assert(Math.abs(g.length-Math.sqrt(D*D-(ra-rb)**2))<1e-9);
 assert(Math.abs(dot(up,sub(g.end,g.start)))<1e-9);
 for(const [center,point,radius] of [[A,g.start,ra],[B,g.end,rb]]){
 const radial=sub(point,center);assert(Math.abs(Math.hypot(...radial)-radius)<1e-10);
 assert(Math.abs(dot(radial,g.tangent))<1e-9);if(radius>0)assert(dot(unit(cross(up,radial)),g.tangent)>1-1e-12);
 }
 const returning=directedExternalTangent(B,rb,A,ra,up);assert(dot(returning.radial,g.radial)<-.9);
}
assert(directedExternalTangent([0,0,0],45,[30,0,0],3,[0,1,0]).error);
console.log('PASS directed external tangents in a tilted plane; both circles stay left, reverse leg uses opposite side, infeasible nested circles rejected.');
