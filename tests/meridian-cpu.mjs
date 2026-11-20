import assert from 'node:assert/strict';
import {meridianMesh,meridianDockPort,meridianExhaust} from '../dist/meridian-mesh.js';
import {drawNasaMeridian,meridianInterior} from '../dist/nasa-warp-mesh.js';
const mesh=meridianMesh(),z=mesh.vertices.map(p=>p[2]);
assert(Math.abs(Math.min(...z)+.86)<1e-9&&Math.abs(Math.max(...z)-(.68+.18*Math.sqrt(1-(.072/.405)**2)))<1e-9);
assert(mesh.vertices.every(p=>Math.hypot(...p)<1),'No structure reaches outside the culling envelope');
assert(mesh.faces.some(f=>f.material==='forest')&&mesh.faces.some(f=>f.material==='glazing'&&f.alpha<.2));
assert(mesh.faces.filter(f=>f.material==='path').every(f=>f.normal[2]>.999),'Habitat paths perpendicular to thrust');
assert.equal(meridianExhaust(0,0).faces.length,0);
const flame=meridianExhaust(1,0);assert(flame.vertices.every(p=>p[2]<-.84));
for(const sign of [-1,1]){
 const points=meridianExhaust(0,sign).vertices;
 assert(points.some(p=>p[2]<-.55&&p[0]*sign>.28));
 assert(points.every(p=>p[2]<0));
 for(const torque of [[sign,0,0],[0,sign,0]]){const flip=meridianExhaust(0,0,null,torque).vertices;assert(flip.length&&flip.every(p=>p[2]<0));}
}
// Misreported legacy throttle cannot light a main bell during capture.
for(const level of [0,.4,1]){
 const points=meridianDockPort(level).vertices;
 assert(Math.abs(Math.max(...points.map(p=>p[2]))-(.86+.12*level))<1e-8);
 assert(points.every(p=>Math.hypot(...p)<1),'All hardware within registered bound');
 assert(points.some(p=>p[0]===0&&p[1]===0&&p[2]===.850),'Recessed pressure hatch remains in the bore at every extension');
}
for(const sign of [-1,1]){
 const axial=meridianExhaust(1,1,[0,0,sign]).vertices,lateral=meridianExhaust(1,1,[sign,0,0]).vertices;
 assert(axial.length&&axial.every(p=>sign>0?p[2]<.350&&p[2]>.2:p[2]>.645&&p[2]<.8));
 assert(lateral.length&&lateral.every(p=>sign*p[0]<-.47&&p[2]>.3));
}
assert.equal(meridianExhaust(1,1,[0,0,0]).faces.length,0,'Quiet hard dock, all jets off');
assert(mesh.faces.some(f=>f.interior&&f.material==='lift'&&f.alpha===undefined&&f.center[2]>.78&&Math.hypot(...f.center.slice(0,2))<.034),'opaque grey elevator');
assert(mesh.faces.filter(f=>f.material==='glazing').every(f=>f.ids.every(i=>Math.hypot(mesh.vertices[i][0],mesh.vertices[i][1])>=.072-1e-9)),'No glazing can intersect the coupling');
const polys=[];let points=[];
const ctx={beginPath(){points=[]},moveTo(x,y){points.push([x,y])},lineTo(x,y){points.push([x,y])},closePath(){},fill(){polys.push([this.fillStyle,points])}};
const draw=(forward,right,up)=>{
 polys.length=0;
 for(const _ of drawNasaMeridian(ctx,{basis:[[1,0,0],[0,1,0],[0,0,1]],frame:{right,up,forward},relativeCenter:forward.map(x=>x*6),radiusPixels:180,bodyRadius:1,centerProjection:{depth:6,pixels:180,x:320,y:200},width:640,height:400,spectrum:'visible',color:(c,s,k,a)=>[c,a]})){}
 assert(polys.every(([,p])=>p.length>=3&&p.flat().every(Number.isFinite)));
 return new Set(polys.map(([[c]])=>c));
};
const axial=draw([0,0,-1],[1,0,0],[0,1,0]);
assert(axial.has('#b8dfeb')&&axial.has('#3d764c'),'Bow view includes both clear glazing and planted canopy beneath');
const side=draw([-1,0,0],[0,1,0],[0,0,1]);assert(side.has('#aa433b'),'NASA nameplate visible on the belt');
let transparency=false,garden=false;
meridianInterior((points,color,alpha)=>{transparency||=alpha<1;garden||=color==='#3d764c';});
assert(transparency&&garden,'Onboard deck retains glazing and gardens');
console.log('PASS: Meridian bounds, planar decks, clear garden, NASA plates, model-space jets and onboard surfaces.');
