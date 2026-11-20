import assert from 'node:assert/strict';
import {earthCanvasStages} from '../dist/earth-canvas.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
const basis=[[1,0,0],[0,1,0],[0,0,1]],R=160,rad=Math.PI/180;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function viewOf(lon,lat){
 const a=lon*rad,b=lat*rad,p=[Math.cos(a)*Math.cos(b),Math.sin(b),-Math.sin(a)*Math.cos(b)],right=[-Math.sin(a),0,-Math.cos(a)];
 return {right,up:cross(p,right),forward:p.map(x=>-x)};
}
function draw(lon,lat,time=0){
 const cv=new CpuCommandCanvas();cv.beginFrame();const ctx=cv.getContext('2d');
 for(const step of earthCanvasStages(ctx,{basis,r:R,view:viewOf(lon,lat),time,light:[1,0,0],coarse:false,color:c=>c})){}
 const cmds=cv.takeFrame().commands;assert(cmds.length<5000,'Bound the geographic layer for the legacy worker.');return cmds;
}
// Project several known points to the very center. Determine the even/odd
// fill of the projected geographic paths there, the same rule Canvas uses.
function interiorAtCenter(cmds){
 const out=[];let xs=0,last,first;
 const crossCenter=(a,b)=>{if((a[1]>0)!==(b[1]>0)&&a[0]+(-a[1])/(b[1]-a[1])*(b[0]-a[0])>0)xs++;};
 for(const [op,...p] of cmds){
  if(op==='beginPath')xs=0;
  if(op==='moveTo')last=first=p;
  if(op==='lineTo'){crossCenter(last,p);last=p;}
  if(op==='closePath'&&first)crossCenter(last,first);
  if(op==='fill'&&p[0]==='evenodd')out.push(Boolean(xs%2));
 }
 return out;
}
assert.deepEqual(interiorAtCenter(draw(-135,0)),[false,false,false],'No continent in the central Pacific.');
assert.deepEqual(interiorAtCenter(draw(17,22)),[true,true,false],'Dry mapped land in the central Sahara.');
assert.deepEqual(interiorAtCenter(draw(-62,-5)),[true,false,false],'Green Amazon basin.');
assert.deepEqual(interiorAtCenter(draw(-41,76)),[true,false,true],'Snow-covered Greenland.');
const start=draw(17,22),later=draw(17,22,160);
const geoEnd=a=>a.findLastIndex(x=>x[0]==='fill'&&x[1]==='evenodd')+1;
assert.deepEqual(start.slice(0,geoEnd(start)),later.slice(0,geoEnd(later)),'Weather does not move fixed geography.');
assert.notDeepEqual(start.slice(geoEnd(start)),later.slice(geoEnd(later)),'Weather advects independently.');
console.log('PASS: mapped CPU coasts, dry land, ice and clear ocean rotate correctly; bounded, moving weather above stable geography.');
