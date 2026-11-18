import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {playlistRouteModel} from '../dist/playlist-route-model.js';
import {fixture} from './render-fixture.mjs';
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
 const r=make('enterprise-solar-tour'),m=model(r);assert(m.legs.length>8&&m.legs.every(l=>l.properSeconds===300&&l.coordinateSeconds===300&&l.dilationSeconds===0&&l.peakSpeed>0));
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
 assert.equal(new Set(m.stops.map(s=>s.targetId)).size,1);assert.equal(new Set(m.stops.map(s=>s.orbitRadiusMeters)).size,4);
 assert(m.stops.every(s=>s.horizonRadiusMeters>0));assert(m.legs.every(l=>!l.error&&l.peakSpeed>0&&l.distanceMeters>0));r.dispose();
}
{
 const r=make('warp-excursion'),m=model(r);assert(m.stops.every(s=>s.kind==='waypoint'&&s.massKg===null&&s.radiusMeters===null));assert(m.legs.every(l=>l.distanceMeters>0&&l.dilationSeconds===0));r.dispose();
}
console.log('PASS: independent stop-to-stop forecasts, live planner parity, closed loops, radius changes, waypoints, invalid targets, and protected warp clocks.');
