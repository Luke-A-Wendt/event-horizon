import assert from 'node:assert/strict';
import {habitatMesh,stabilizeHabitatHub} from '../dist/habitat-mesh.js';
import {HABITAT_DOCK_FACE_UNITS,HABITAT_HUB_RADIUS_UNITS,HABITAT_AIRLOCK_RADIUS_UNITS,HABITAT_FLOOR_UNITS,HABITAT_FLOOR_METERS} from '../dist/habitat-spin.js';
import {drawNasaHabitat} from '../dist/nasa-warp-mesh.js';

const mesh=habitatMesh();
assert(Math.max(...mesh.vertices.map(p=>Math.hypot(...p)))<1,'All parts inside the physical bound');
assert(mesh.faces.some(f=>f.alpha>0 && f.alpha<1),'Glazing admits a view of the physical garden');
const radial=p=>Math.hypot(p[0],p[2]);
assert(mesh.faces.some(f=>f.material==='meadow'&&f.ids.every(i=>Math.abs(radial(mesh.vertices[i])-.92)<1e-9)),'A physical walking deck at 0.92 model radii');
const basis=[[1,0,0],[0,1,0],[0,0,1]],r=145;
const wheel=[[0,0,-1],[0,1,0],[1,0,0]],turnedHub=stabilizeHabitatHub(mesh,wheel,basis);
for(const detail of [16,48])for(const side of [-1,1]){
 const probe=habitatMesh(detail),hub=probe.vertices.slice(probe.fixedStart),outer=v=>side*v[1];
 const lipHeight=Math.max(...hub.filter(v=>radial(v)<.0012).map(outer));
 const shell=probe.faces.filter(f=>f.hubShell);
 assert(shell.length>0&&shell.every(f=>f.ids.every(i=>i>=probe.coreStart&&i<probe.fixedStart&&Math.abs(Math.hypot(...probe.vertices[i])-HABITAT_HUB_RADIUS_UNITS)<1e-12)),'Pressure shell follows a sphere of the specified physical radius');
 assert(probe.faces.filter(f=>f.hubRace).every(f=>f.ids.every(i=>i<probe.coreStart)),'Equatorial race belongs to the wheel and its lift shafts');
 assert(Math.abs(Math.max(...hub.map(radial))-HABITAT_AIRLOCK_RADIUS_UNITS)<1e-10);
 assert.equal(Math.max(...hub.map(outer)),HABITAT_DOCK_FACE_UNITS,'No cylinder or pedestal above either spherical cap');
 for(let spoke=0;spoke<3;spoke++){
  const door=probe.faces.filter(f=>f.liftDoor===spoke);
  assert.equal(door.length,2);
  const normal=[Math.cos(spoke*2*Math.PI/3),0,Math.sin(spoke*2*Math.PI/3)];
  const along=v=>v[0]*normal[0]+v[2]*normal[2];
  assert(door.every(f=>Math.abs(Math.max(...f.ids.map(i=>along(probe.vertices[i])))-HABITAT_FLOOR_UNITS)<1e-12),'Lobby side doors open at walking-deck height');
  const shaft=probe.faces.filter(f=>f.liftShaft===spoke).flatMap(f=>f.ids.map(i=>along(probe.vertices[i]))),lobby=probe.faces.filter(f=>f.liftLobby===spoke).flatMap(f=>f.ids.map(i=>along(probe.vertices[i])));
  assert(Math.min(...shaft)<HABITAT_HUB_RADIUS_UNITS&&Math.max(...shaft)>.777&&Math.max(...shaft)>Math.min(...lobby)&&Math.max(...lobby)>=HABITAT_FLOOR_UNITS,'Continuous shaft links the core through the canopy to the enclosed lobby');
 }
 assert(hub.some(v=>radial(v)<1e-9&&outer(v)<lipHeight&&outer(v)>lipHeight-.001),'Pressure hatch sits just behind capture seal');
}
const relative=stabilizeHabitatHub(mesh,wheel,wheel,basis);
const si=mesh.faces.find(f=>f.hubShell).ids[0],bi=mesh.faces.find(f=>f.bearingMark).ids[0];
assert.notDeepEqual(relative.vertices[si],mesh.vertices[si],'Shell is inertially fixed even when the locks rotate at station speed');
assert.deepEqual(relative.vertices[bi],mesh.vertices[bi],'Uncoupled lock follows the race independently of the core');
for(const side of [-1,1]){
 const lip=mesh.faces.filter(f=>f.captureFace===side);assert(lip.length>=12);
 const ids=[...new Set(lip.flatMap(f=>f.ids))],rr=ids.map(i=>radial(mesh.vertices[i])*HABITAT_FLOOR_METERS/HABITAT_FLOOR_UNITS);
 assert(Math.abs(Math.min(...rr)-.9)<1e-10&&Math.abs(Math.max(...rr)-1.25)<1e-10);
 for(const i of ids){
  assert.equal(mesh.vertices[i][1],side*HABITAT_DOCK_FACE_UNITS);
  const v=turnedHub.vertices[i],world=wheel[0].map((_,j)=>wheel.reduce((a,axis,k)=>a+v[k]*axis[j],0));
  for(let j=0;j<3;j++)assert(Math.abs(world[j]-mesh.vertices[i][j])<1e-12,'Ports stay fixed as the wheel turns');
 }
}
function image(forward,right,up,basisOverride=basis){
 const polys=[];let points;
 const ctx={beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},fill(){polys.push({points,color:this.fillStyle});}};
 for(const _ of drawNasaHabitat(ctx,{radiusPixels:r,relativeCenter:forward.map(n=>n*10),basis:basisOverride,frame:{forward,right,up},bodyRadius:1,centerProjection:{depth:10,pixels:r,x:180,y:180},width:360,height:360,spectrum:'visible',color:(c,s,k,a)=>[c,a]})){}
 return polys;
}
function at(polys,x,y){return polys.filter(p=>{let inside=false;for(let i=0,j=p.points.length-1;i<p.points.length;j=i++){const [a,b]=p.points[i],[c,d]=p.points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;});}
for(const sign of [-1,1]){
 const img=image([0,sign,0],[1,0,0],[0,0,-sign]);
 assert(at(img,1.712,1.103).length,'Solid docking port');
 assert(at(img,.9*r,1).length,'Solid outer ring');
 assert(!at(img,.40*r,.30*r).length,'Opening between spokes');
 assert(img.some(p=>p.color[0]==='#aa433b'),'Visible NASA marking on both axial faces');
 assert(img.filter(p=>p.color[1]<1).length,'Clear inner shoulders');
 assert(img.some(p=>p.color[0]==='#93b45c'||p.color[0]==='#3d764c'),'Glazed landscape visible in axial view');
}
const forward=[0,-.5,Math.sqrt(.75)],right=[1,0,0],up=[0,Math.sqrt(.75),.5];
const frame=image(forward,right,up),turned=image(forward,right,up,[[0,0,1],[0,1,0],[-1,0,0]]);
assert.notDeepEqual(frame.slice(0,3),turned.slice(0,3),'Follows the shared spinning model basis');
assert(frame.length<2200,'Detailed fallback tier stays within command replay budget');
console.log('PASS: CPU station bounds, wheel openings, axial nameplates, translucent landscape and rotation.');
