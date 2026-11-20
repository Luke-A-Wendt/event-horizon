import {warpForSpeed} from '../dist/flight-dynamics.js';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {playlistRouteModel} from '../dist/playlist-route-model.js';
import {fixture} from './render-fixture.mjs';
import {captureParkedOrbit} from '../dist/orbit-path.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),a+' vs '+b);
const make=id=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene(id);return r;};
function model(r,q){const ship=r.objects.find(o=>['enterprise','shuttle'].includes(o.type));return playlistRouteModel({delegate:r},ship,q||r.getFlightSequence(ship.id));}
{
 const r=make('shuttle-earth-moon-loop'),craft=r.objects.find(o=>o.type==='shuttle'),q=r.getFlightSequence(craft.id);
 const before=structuredClone(r.flightSequences),motion=[craft.parentId,craft.orbitMeters,r.time,r.routeChartY,structuredClone(craft.flight)];
 const m=model(r),n=q.nodes[q.index],t=r.previewTravel(n.targetId,{craftId:craft.id,tangentLeg:q.orbitWait?.leg,orbitRadii:{[n.targetId]:n.radiusMeters}});
 assert.equal(m.legs.length,2);assert.equal(m.stops[0].name,'Earth');near(m.stops[0].radiusMeters,6371000);near(m.stops[0].massKg,5.97e24,.01);
 const live=m.legs.find(l=>l.toIndex===q.index);
 for(const key of ['properSeconds','coordinateSeconds','distanceMeters','dilationSeconds'])near(live[key],t[key]);
 assert(live.peakSpeed>50000);assert(live.dilationSeconds>0&&live.dilationSeconds<.01);
 assert.deepEqual(before,r.flightSequences);assert.deepEqual(motion,[craft.parentId,craft.orbitMeters,r.time,r.routeChartY,craft.flight]);
 assert.equal(model(r,{...q,loop:false}).legs.length,1);assert.equal(model(r,{...q,nodes:q.nodes.slice(0,1)}).legs.length,0);
 assert(model(r,{...q,nodes:[q.nodes[0],{kind:'waypoint',targetId:'missing'}]}).legs[0].error);r.dispose();
}
{
 const r=make('enterprise-solar-tour'),m=model(r);assert(m.legs.length>8&&m.legs.every(l=>l.properSeconds===300&&l.coordinateSeconds===300&&l.dilationSeconds===0&&l.peakSpeed>0&&l.maxWarp===warpForSpeed(l.peakSpeed)));
 assert(new Set(m.legs.map(l=>l.distanceMeters)).size>6);r.dispose();
}
{
 const r=make('shuttle-proxima-direct'),m=model(r);
 assert(m.legs[0].distanceMeters>4e16&&m.legs[0].dilationSeconds>1e7);
 assert(m.legs[1].distanceMeters<2e10&&m.legs[1].dilationSeconds<1);
 assert(m.legs.at(-1).toIndex===0&&m.legs.at(-1).distanceMeters>4e16);r.dispose();
}
{
 const r=make('nasa-shuttle'),m=model(r);
 assert.deepEqual(m.legs.map(l=>[l.fromIndex,l.toIndex]),m.stops.slice(1).map((s,i)=>[i,i+1]),'A replay jump is not a flight or a return leg');
 assert.equal(new Set(m.stops.map(s=>s.targetId)).size,1);assert.equal(new Set(m.stops.map(s=>s.orbitRadiusMeters)).size,4);
 assert(m.stops.every(s=>s.horizonRadiusMeters>0));assert(m.legs.every(l=>!l.error&&l.peakSpeed>0&&l.distanceMeters>0));
 const ship=r.objects.find(o=>o.type==='shuttle'),up=r.configCache.primaryBasis[1],signed=p=>p.reduce((n,v,i)=>n+v*up[i],0),origin=r.getFocusFrame('primary').position.map(v=>v*REFERENCE_RG_METERS);
 const checkPlane=guide=>{
  assert(guide.pathPoints.length>8);
  for(const p of guide.pathPoints)assert(Math.abs(signed(p)-signed(origin))<.1,'World guide stays in the equatorial plane to sub-metre precision');
  for(const p of guide.pathOffsets)assert(Math.abs(signed(p))<.1,'Magnified guide offsets have no vertical drift');
 };
 r.sceneLoad=null;r.state.paused=false;r.fillObjects();r.updateCameraFrame();checkPlane(captureParkedOrbit(r,ship.id));
 const seen=new Set();
 for(let n=0;n<5000&&seen.size<m.legs.length;n++){
  r.advanceChartStages(.1);r.fillHoles();r.fillObjects();
  const t=r.transfer;
  if(t&&t.progress>.4&&t.progress<.6&&!seen.has(t.orbitRadiusMeters)){
   const guide=r.getTravelState();checkPlane(guide);
   assert.equal(guide.pathAngles.length,guide.pathPoints.length);
   assert(guide.pathAngles[0]>=-Math.PI-.01&&guide.pathAngles.at(-1)<=Math.PI+.01,'At most one adjacent revolution is drawn');
   assert(guide.pathAngles.every((a,i)=>!i||a>=guide.pathAngles[i-1]&&a-guide.pathAngles[i-1]<.14),'No undersampled leap across the hole on the approach to each parking radius');
   assert(guide.pathOffsets.some(p=>Math.hypot(...p)<.02),'The active guide passes through the ship');
   const xyz=ship.drivePosition.map(v=>v*REFERENCE_RG_METERS);
   assert(guide.pathPoints.some(p=>Math.hypot(...p.map((v,i)=>v-xyz[i]))<.02),'The map and the ship use the same representative azimuth');
   const leg=m.legs[seen.size];near(leg.distanceMeters,t.distanceMeters,1e-5);near(leg.properSeconds,t.properSeconds,1e-5);
   seen.add(t.orbitRadiusMeters);
  }
 }
 assert.equal(seen.size,m.legs.length,'All three descending orbital transfers sampled');r.dispose();
}
{
 const r=make('warp-excursion'),m=model(r);assert(m.stops.every(s=>s.kind==='waypoint'&&s.massKg===null&&s.radiusMeters===null));assert(m.legs.every(l=>l.distanceMeters>0&&l.dilationSeconds===0));r.dispose();
}
console.log('PASS: independent stop-to-stop forecasts, live planner parity, closed loops, radius changes, waypoints, invalid targets, and protected warp clocks.');
