import assert from 'node:assert/strict';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {fixture} from './render-fixture.mjs';
import {drawNasaWarpShip,warpShipMesh} from '../dist/nasa-warp-mesh.js';
const basis=[[1,0,0],[0,1,0],[0,0,1]],r=120;
function picture(forward,right,up){
 const polygons=[];let path;
 const ctx={beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){polygons.push({material:this.fillStyle,points:path});}};
 const depth=10,centerProjection={depth,x:200,y:200,pixels:r};
 for(const _ of drawNasaWarpShip(ctx,{frame:{right,up,forward},relativeCenter:forward.map(v=>v*depth),basis,bodyRadius:1,centerProjection,width:400,height:400,radiusPixels:r,spectrum:'visible',color:x=>x})){}
 assert(polygons.every(p=>p.points.every(point=>point.every(Number.isFinite))));
 const contains=(points,x,y)=>{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [a,b]=points[i],[c,d]=points[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;}return inside;};
 return {polygons,at:(x,y)=>polygons.filter(p=>contains(p.points,x*r,y*r)).at(-1)?.material};
}
const mesh=warpShipMesh(24);
assert(Math.max(...mesh.vertices.map(p=>Math.hypot(...p)))<1,'Model stays inside its existing culling sphere');
for(const sign of [-1,1]){
 const img=picture([0,0,sign],[-sign,0,0],[0,1,0]);
 assert(img.at(.032,.003),'The center of the hull must be solid');
 assert(img.at(.49,.005),'Looking along the axis reveals a solid annular face');
 assert.equal(img.at(.35,.005),undefined,'The ring opening must show the background');
 const side=picture([sign,0,0],[0,0,sign],[0,1,0]);
 assert(side.at(.437,.48),'Fore ring must be distinct from body');
 assert(side.at(-.437,.48),'Aft ring must be distinct from body');
 assert.equal(side.at(.02,.48),undefined,'Side view must leave a gap between rings');
 assert(side.polygons.some(p=>p.material==='#aa433b'),'The visible side has NASA lettering');
}
console.log('PASS: CPU warp craft fits the existing bounds, has clear apertures and two separated rings, and paints the NASA markings on both flanks.');

// Only the three landing feet break the spherical hull. Apertures, labels,
// glazing, and any exterior trim have the identical spherical silhouette.
const {janusMesh,janusExhaust,janusInterior}=await import('../dist/janus-mesh.js');
const {JANUS_RADIUS,JANUS_PORT,JANUS_EYE,JANUS_SEAT_X}=await import('../dist/janus-hull.js');
const {OBJECT_DIMENSIONS}=await import('../dist/objects.js');
for(const lod of [false,true]){
 const pod=janusMesh(lod);
 assert(pod.vertices.every(v=>v.every(Number.isFinite)&&Math.hypot(...v)<1));
 for(const f of pod.faces.filter(f=>!f.landingGear&&!f.cabin))
  for(const id of f.ids)assert(Math.abs(Math.hypot(...pod.vertices[id])-JANUS_RADIUS)<1e-6);
 assert.equal(2*JANUS_RADIUS/OBJECT_DIMENSIONS.janusPod.normalizedExtent*OBJECT_DIMENSIONS.janusPod.lengthMeters,5.4);
 assert.equal(pod.faces.filter(f=>f.port).length,16);
 assert(pod.faces.filter(f=>f.material==='janusGlass').every(f=>0<f.alpha&&f.alpha<1));
 for(const sign of [-1,1])assert(pod.faces.some(f=>f.material==='janusHead'&&Math.abs(f.center[0]-sign*JANUS_SEAT_X)<.03));
 assert(pod.faces.some(f=>f.material==='janusScreen')&&pod.faces.some(f=>f.material==='janusReadout'));
 const onboard=[];janusInterior((p,c)=>onboard.push({p,c}),JANUS_EYE,[0,0,1]);
 assert(onboard.length>0&&onboard.every(f=>f.p.every(v=>v.every(Number.isFinite))));
}
assert.equal(janusExhaust(0,0).faces.length,0);
assert(janusExhaust(1,0).vertices.every(v=>v[2]<=-JANUS_PORT.axial));
for(const sign of [-1,1])assert(janusExhaust(0,sign).vertices.every(v=>Math.abs(v[0])>=JANUS_PORT.axial));

// The normal passenger view must actually draw the instrument panel after
// scene optics, including through the Canvas-command worker fallback.
const frameWidth=640,frameHeight=422,screen=fixture({width:frameWidth,height:frameHeight}),canvas=new CpuCommandCanvas();
canvas.getBoundingClientRect=screen.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(canvas,{bindControls:false,autoStart:false});
try{
 cpu.loadScene('janus-solar-tour');cpu.sceneLoad=null;
 const pod=cpu.objects.find(o=>o.hullModel==='janusPod');
 cpu.focusTarget(pod.id,'onboard',false,true);cpu.camera={...cpu.target};cpu.updateCameraFrame();
 assert.deepEqual(cpu.cameraFrame.inspectCamera,JANUS_EYE);
 canvas.width=frameWidth;canvas.height=frameHeight;
 const record=stages=>{canvas.beginFrame();for(const _ of stages){}return canvas.takeFrame().commands;};
 const cockpit=record(cpu.cockpitStages()),whole=record(cpu.paintStages());
 assert.deepEqual(whole.slice(-cockpit.length),cockpit);
 const filledAt=(sx,sy)=>cockpit.some(([kind,...coords])=>{
  if(kind!=='fillPolygon')return false;
  let inside=false;
  for(let j=coords.length-2,i=0;i<coords.length;j=i,i+=2){
   const [x,y]=coords.slice(i,i+2),[x0,y0]=coords.slice(j,j+2);
   if((y>sy)!==(y0>sy)&&sx<(x0-x)*(sy-y)/(y0-y)+x)inside=!inside;
  }
  return inside;
 });
 assert(!filledAt(frameWidth*.5,frameHeight*.25),'The pilot must see the scene through the upper bow pane');
 assert(filledAt(frameWidth*.5,frameHeight*.73),'The lower pilot view must contain a real instrument surface');
 assert(whole.length<20000,'One full pilot view must fit the worker presentation budget');
}finally{cpu.dispose();}
console.log('PASS: Janus has a spherical exterior with recessed jets, a clear windshield and a furnished cockpit in the CPU worker frame.');
