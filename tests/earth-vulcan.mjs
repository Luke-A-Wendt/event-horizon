import assert from 'node:assert/strict';
import {SURFACE_PROFILES,planetAtmosphereProfile} from '../dist/planet-profiles.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {OBJECT_KIND, REFERENCE_RG_METERS, hullType} from '../dist/objects.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const ly=299792458*365.25*86400;
try{
 r.loadScene('earth-vulcan');r.sceneLoad=null;r.state.paused=false;
 const bodies=Object.fromEntries(r.objects.map(o=>[o.name,o])),ship=bodies['USS Enterprise'],vulcan=bodies.Vulcan,earth=bodies.Earth;
 assert.equal(r.state.annotations,true);assert.equal(r.state.bridge,false);
 assert.equal(earth.parentId,bodies.Sun.id);assert.equal(bodies.Moon.parentId,earth.id);
 assert.equal(vulcan.parentId,bodies['40 Eridani A'].id);assert.match(SURFACE_PROFILES.find(p=>p.id===vulcan.surfaceId).label,/desert/i);assert(planetAtmosphereProfile(vulcan.surfaceId));assert(!r.objects.some(o=>o.parentId===vulcan.id));
 assert.equal(hullType(ship),'classicEnterprise');assert.equal(r.shaderFeatures().craftMask,64);
 assert.equal(r.focusId,ship.id);
 const checkHull=()=>{r.updateCameraFrame();const frame=r.renderObjects.find(o=>o.id===ship.id);assert(frame);assert.equal(r.colorData[frame.index*4+3],OBJECT_KIND.classicEnterprise);};
 checkHull();
 const saved=serializeScene(r),reload=parseScene(saved),reloaded=reload.objects.find(o=>o.id===ship.id);
 assert.equal(reload.objects.find(o=>o.id===vulcan.id).surfaceId,vulcan.surfaceId);
 assert.deepEqual([reloaded.name,reloaded.type,hullType(reloaded)],['USS Enterprise','enterprise','classicEnterprise']);
 assert.throws(()=>parseScene(saved.replace('hullModel: "classicEnterprise"','hullModel: "heritageShuttle"')),/Hull does not match/);
 const stops=r.flightSequences[ship.id];assert.deepEqual(stops.nodes.map(n=>n.targetId),[earth.id,vulcan.id]);
 const arrivals=[];let sawWarp=false,lastAngularDiameter=null;
 for(let i=0;i<2200&&arrivals.length<2;i++){
  const before=r.transfer;r.advanceChartStages(.05);assert(!stops.error,stops.error);
  if(!before&&r.transfer){assert(Math.abs(r.transfer.distanceMeters/ly-16.5)<.001);assert(r.transfer.warpFactor>1);}
  if(r.transfer){
   const target=r.getFocusFrame(r.transfer.targetId),craft=r.getFocusFrame(ship.id);
   const range=Math.hypot(...craft.position.map((x,i)=>x-target.position[i]));
   const diameter=2*Math.asin(Math.min(1,target.radius/range));
   if(lastAngularDiameter!==null)assert(Math.abs(diameter-lastAngularDiameter)<.035,'Even at interstellar range the destination grows by less than 2° per 50 ms frame');
   lastAngularDiameter=diameter;
  }else lastAngularDiameter=null;
  if(r.transfer?.currentDistanceFraction>.4&&r.transfer.currentDistanceFraction<.6){
   sawWarp||=ship.flight.speed>299792458&&r.state.warp;
   if(arrivals.length===0){const x=ship.flight.position[0];assert(x>6*ly&&x<11*ly,'Flight moves continuously between the two stellar systems');}
  }
  if(before&&!r.transfer){
   arrivals.push(ship.parentId);checkHull();const parent=r.getFocusFrame(ship.parentId),craft=r.getFocusFrame(ship.id);
   const range=Math.hypot(...craft.position.map((v,i)=>v-parent.position[i]))*REFERENCE_RG_METERS;
   assert(Math.abs(range/ship.orbitMeters-1)<1e-4,'Arrival circular orbit around the actual planet');
  }
 }
 assert.deepEqual(arrivals,[vulcan.id,earth.id]);assert(sawWarp);
}finally{r.dispose();}
console.log('PASS: labeled Earth–Vulcan warp loop, physical separation, classic hull, save/load and both orbital arrivals.');
