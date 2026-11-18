import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {previewRoute,beginRoute,advanceRoute,travelTargets,routeState} from '../dist/travel-routes.js';
import {sampleTransferCurve,sampleTransfer,transferEase,estimateTransfer,TRANSFER_WALL_SECONDS,transferCurvePoint,transferCurveDerivative} from '../dist/travel-math.js';
import {speedForWarp} from '../dist/flight-dynamics.js';
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),length=a=>Math.hypot(...a),unit=a=>a.map(v=>v/length(a));
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function make(){const f=fixture({width:390,height:720}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');if(!r.objects.some(o=>o.type==='shuttle'))r.loadScene('solar-travel');return r;}
assert.equal(TRANSFER_WALL_SECONDS,60);
// The pooled evaluator must retain the original arithmetic and independent
// returned vectors even when point/derivative evaluations are interleaved.
const legacyPoint=(points,t)=>{const q=points.map(p=>[...p]);for(let k=q.length-1;k>0;k--)for(let i=0;i<k;i++)for(let j=0;j<3;j++)q[i][j]+=(q[i+1][j]-q[i][j])*t;return q[0];};
for(const n of [4,8]){const points=Array.from({length:n},(_,i)=>[Math.sin(i)*1e11,Math.cos(i*2)*1e10,i**3*1e8]);for(let i=0;i<=10;i++){const u=i/10,value=transferCurvePoint(points,u),expected=legacyPoint(points,u),derivative=points.slice(1).map((p,k)=>p.map((v,j)=>(n-1)*(v-points[k][j])));assert.deepEqual(transferCurveDerivative(points,u),legacyPoint(derivative,u));assert.deepEqual(value,expected);}}
for(const warp of [.1,1,4,8,9.9]){const p=estimateTransfer(1.496e11,'enterprise',warp);near(sampleTransfer(p,.5).speedMetersPerSecond,speedForWarp(warp));assert.equal(p.dilationSeconds,0);near(p.properSeconds,p.coordinateSeconds);}
for(const [type,destination] of [['shuttle','Moon'],['enterprise','Earth']]){
 const r=make();if(type==='enterprise'&&!r.objects.some(o=>o.type===type)){const moon=r.objects.find(o=>o.name==='Moon');r.addChildObject(moon.id,'enterprise',{orbitMeters:moon.radiusMeters*3,phase:Math.PI});}const craft=r.objects.find(o=>o.type===type),target=r.objects.find(o=>o.name===destination);assert(craft&&target);r.selectedId=craft.id;r.focusTarget(craft.id,'track');r.fillObjects();
 const start=[...r.getFocusFrame(craft.id).position].map(v=>v*REFERENCE_RG_METERS),departureVelocity=r.getFocusFrame(craft.id).velocity||[0,0,0],heading=length(departureVelocity)>.001?unit(departureVelocity):[...r.getFocusFrame(craft.id).frame[2]],options={craftId:craft.id,warpFactor:4};
 assert.equal(r.driveId,null);assert(travelTargets(r,options).some(o=>o.id===target.id));const preview=previewRoute(r,target.id,options);assert(!preview.error,preview.error);assert.equal(r.driveId,null,'Preview never takes manual control');assert.equal(preview.craftId,craft.id);assert(preview.pathPoints.length>=129&&preview.pathPoints.length<=240);assert.equal(preview.wallSeconds,60);
 assert(beginRoute(r,target.id,options));assert(r.transfer.autonomous);assert.equal(craft.flight.orbitHold,false);near(length(sub(craft.flight.position,start)),0,1e-5);const curve=r.transfer;
 assert(dot(sampleTransferCurve(curve,0).tangent,heading)>.999999,'Exact live-velocity departure tangent');assert(dot(sampleTransferCurve(curve,1).tangent,curve.tangent)>.999999,'Arrival tangent');
 assert(transferEase(.1)<.02&&transferEase(.9)>.98,'Slow departure/arrival playback');const first=sampleTransfer(curve.plan,transferEase(.1)).distanceFraction,middle=sampleTransfer(curve.plan,transferEase(.6)).distanceFraction-sampleTransfer(curve.plan,transferEase(.5)).distanceFraction;assert(middle>first*5);
 const originalProper=craft.clock?.properSeconds||0;let previousProper=0,previousDilation=0;
 for(let i=0;i<120;i++){
  advanceRoute(r,.5);r.fillHoles();r.fillObjects();r.updateCameraFrame();const state=routeState(r);assert(state.properElapsedSeconds>=previousProper);assert(state.dilationSeconds>=previousDilation);previousProper=state.properElapsedSeconds;previousDilation=state.dilationSeconds;
  if(i===71&&type==='shuttle'){const path=sampleTransferCurve(curve,curve.sample.distanceFraction);assert(dot(craft.flight.basis[2],path.tangent)<-.99,'Reverse burn faces backward');assert.equal(craft.flight.thrust,1);}
  if(state.active){assert(state.pathPoints.some(p=>p.every((v,j)=>v===craft.flight.position[j])),'Overlay contains the exact visible ship position');assert(state.pathPoints.length<=240);}
  if(i===118)assert(state.active,'Not complete before sixty active seconds');
 }
 const arrived=routeState(r);assert.equal(arrived.phase,'Arrived');assert.equal(craft.parentId,target.id);assert.equal(r.driveId,null);assert.equal(r.focusId,craft.id);assert(craft.orbitMeters>target.radiusMeters*1.04);near(arrived.properElapsedSeconds,preview.properSeconds);assert(arrived.estimatedDilationSeconds>=0);
 if(type==='shuttle'){near(craft.clock.properSeconds-originalProper,preview.properSeconds);assert(craft.clock.lagSeconds>0);near(arrived.dilationSeconds,preview.dilationSeconds,5e-4);}else assert(!craft.clock);
 r.dispose();
}
// Exercise the actual moving-world update: recomputing shortest rotations from
// the initial heading used to cause a large roll jump near an antipodal tangent.
{
 const r=make(),craft=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.selectedId=craft.id;r.lastTime=1000;assert(beginRoute(r,moon.id));let previous=craft.flight.basis.map(v=>[...v]),maxTurn=0;
 for(let i=0;i<1200;i++){r.advanceSimulation(r.lastTime+50);r.fillHoles();r.fillObjects();r.updateCameraFrame();const next=r.getFocusFrame(craft.id).frame;for(let j=0;j<3;j++)maxTurn=Math.max(maxTurn,Math.acos(Math.max(-1,Math.min(1,dot(next[j],previous[j])))));previous=next.map(v=>[...v]);}
 assert.equal(routeState(r).phase,'Arrived');assert(maxTurn<.15,`All three attitude axes must remain continuous: ${maxTurn}`);r.dispose();
}
console.log('PASS: selected craft can plan without Drive, curvature-blended path preserves departure/arrival tangents, selectable warp estimates, 60-second eased flights, reverse burn, accelerated clocks, reparented orbit, and smooth all-axis attitude in a moving world.');
