import assert from 'node:assert/strict';
import {drawNasaMeridian,meridianInterior} from '../dist/nasa-warp-mesh.js';
import {meridianIris} from '../dist/meridian-mesh.js';
const shieldColors=new Set(['#d8dad2','#bec4c3','#747e80']);
function contains(p,[x,y]){
 let inside=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++){
  const a=p[i],b=p[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
function draw(irisClosure){
 const target=[],ctx={beginPath(){this.poly=[];},moveTo(x,y){this.poly.push([x,y]);},lineTo(x,y){this.poly.push([x,y]);},closePath(){},fill(){target.push([this.fillStyle,this.poly]);}};
 for(const _ of drawNasaMeridian(ctx,{basis:[[1,0,0],[0,1,0],[0,0,1]],frame:{right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},relativeCenter:[0,0,-6],radiusPixels:180,bodyRadius:1,centerProjection:{depth:6,pixels:180,x:320,y:200},width:640,height:400,spectrum:'visible',color:c=>c,...(irisClosure!=null?{irisClosure}:{})})){}
 return target;
}
const pigment=(polys,x,y)=>polys.findLast(([,p])=>contains(p,[x,y]))?.[0];
const open=draw(0),moving=draw(.5),closed=draw(1);
assert.deepEqual(open,draw(undefined));
assert.equal(meridianIris(0).faces.length,0);
assert(!open.some(([c])=>shieldColors.has(c)));
for(const t of [.15,.74,1.85,2.47]){
 const sample=(polys,r)=>pigment(polys,r*Math.cos(t),r*Math.sin(t));
 assert(shieldColors.has(sample(moving,78)),'The curved leaves cover the perimeter first');
 assert(!shieldColors.has(sample(moving,24)),'The half-open aperture preserves the view');
 assert(shieldColors.has(sample(closed,24))&&shieldColors.has(sample(closed,78)),'Closed leaves block both center and perimeter');
}
assert(!closed.some(([c])=>['#3d764c','#66a361','#b8dfeb'].includes(c)),'Sealed exterior never draws glazing or landscape through the shield');
const linerColors=new Set(['#a99f91','#989085','#747e80']);
function roof(irisClosure){
 const liners=[];
 meridianInterior((points,color,alpha)=>{if(linerColors.has(color)){assert.equal(alpha,1);liners.push(points.map(([x,y])=>[x,y]));}},irisClosure);
 return liners;
}
assert.equal(roof(0).length,0);
assert(roof(.5).some(p=>contains(p,[.37,.035]))&&!roof(.5).some(p=>contains(p,[.03,.018])));
assert(roof(1).some(p=>contains(p,[.080,.018])),'A passenger sees the opaque reverse of a closed leaf by the flange');
for(const closure of [0,1]){
 let hatch=false;
 meridianInterior((pts,color,alpha)=>{if(color==='#858889'&&alpha===1&&contains(pts.map(([x,y])=>[x,y]),[.030,.018]))hatch=true;},closure);
 assert(hatch,'The fixed metal hatch remains over the central aperture at every shield position');
}
console.log('PASS: CPU exterior and onboard iris retract completely, close from rim to crown, and fully occlude the dome.');
