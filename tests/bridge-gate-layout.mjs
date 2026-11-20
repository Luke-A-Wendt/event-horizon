import assert from 'node:assert/strict';
import {GATE_RADIUS,GATE_VERTICES as V,GATE_EDGES as E,GATE_FACES as F} from '../dist/bridge-gate-layout.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),norm=a=>Math.hypot(...a);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const close=(a,b)=>assert(Math.abs(a-b)<1e-10, a+' != '+b);
const edgeId=(a,b)=>a<b?a+','+b:b+','+a;
assert.deepEqual([V.length,E.length,F.length],[20,30,12]);V.forEach(v=>close(norm(v),GATE_RADIUS));
const adjacent=new Map(E.map(([a,b])=>[edgeId(a,b),0]));assert.equal(adjacent.size,30);
const degree=V.map(()=>0),len=norm(sub(V[E[0][0]],V[E[0][1]]));
for(const [a,b] of E){
 degree[a]++;degree[b]++;close(norm(sub(V[a],V[b])),len);
 // Nearest point of the *entire edge* to the travel axis; endpoints alone
 // would overstate the entry pentagon's available clearance.
 const A=V[a].slice(0,2),d=sub(V[b].slice(0,2),A),t=Math.max(0,Math.min(1,-dot(A,d)/(dot(d,d)||1)));
 assert(norm(A.map((x,i)=>x+t*d[i]))>1.44,'Edge enters axial transit corridor');
}
assert(degree.every(d=>d===3));
for(const face of F){
 assert.equal(new Set(face).size,5);
 const [a,b,c]=face.map(i=>V[i]),normal=cross(sub(b,a),sub(c,a)),h=dot(a,normal)/norm(normal);
 assert(h>2.3,'Each face must face outward and clear the optical throat');
 for(let i=0;i<5;i++){
  const u=face[i],v=face[(i+1)%5],k=edgeId(u,v);assert(adjacent.has(k));adjacent.set(k,adjacent.get(k)+1);
  close(dot(V[u],normal)/norm(normal),h);
 }
 assert(V.every(v=>dot(v,normal)/norm(normal)<=h+1e-10),'Nonconvex face');
}
assert([...adjacent.values()].every(count=>count===2));
console.log('PASS: regular convex dodecahedron, twelve planar faces, three-way junctions and clear axial approach.');
