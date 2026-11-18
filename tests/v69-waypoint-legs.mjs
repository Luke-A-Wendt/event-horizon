import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {orbitalTangentLeg,sequencePlaneHeight} from '../dist/travel-routes.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>s*v),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const close=(a,b,tol=1e-5)=>assert(Math.hypot(...sub(a,b))<tol,JSON.stringify([a,b]));
const render=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
for(const type of ['shuttle','enterprise']){
 const r=render();r.loadScene('shuttle-space');r.sceneLoad=null;
 if(type==='enterprise'){r.clearObjects();r.addChildObject('space','enterprise',{x:0,y:0,z:0});}
 const craft=r.objects.find(o=>o.type===type),origin=[0,0,0],plane=r.configCache.primaryBasis;
 const pos=id=>mul(r.getFocusFrame(id).position,RG);
 const marker=(point,name)=>r.addChildObject('space','waypoint',{x:point[0],y:point[1],z:point[2],name}).id;
 const A=marker(mul(plane[0],4e7),'A'),B=marker(add(mul(plane[0],3e7),mul(plane[2],1e8)),'B');
 const planet=r.addChildObject('space','planet',{x:0,y:0,z:0,name:'Test world',radiusMeters:5e6,massSolar:3.003e-6});
 // Put the craft at A rather than spawning it inside the planet.
 Object.assign(craft,{x:pos(A)[0],y:pos(A)[1],z:pos(A)[2],parentId:'space',placement:'local',waypointHoldId:A,waypointHoldBasis:plane.map(v=>[...v])});
 r.selectedId=craft.id;r.refreshConfiguration();r.fillObjects();r.focusTarget(craft.id,'track');
 const go=(target,source,fromSpeed,toSpeed)=>{
  const preview=r.previewTravel(target,{craftId:craft.id});assert(!preview.error,preview.error);const leg=preview.tangentLeg;
  assert.equal(leg.sourceId,source);if(fromSpeed!=null)assert.equal(leg.initialSpeed,fromSpeed);if(toSpeed!=null)assert.equal(leg.finalSpeed,toSpeed);
  assert(r.startTravel(target,{craftId:craft.id,fromSequence:true,tangentLeg:leg}));
  r.advanceTravel(5);const mid=r.getTravelState();assert.equal(mid.wallElapsedSeconds,5);
  if(fromSpeed===0&&toSpeed===0){close(craft.flight.position,mul(add(leg.start,leg.end),.5),.02);assert(craft.flight.speed>0);if(type==='shuttle')assert.equal(craft.flight.thrust,0);}
  r.advanceTravel(5);assert(!r.transfer);r.fillObjects();close(pos(craft.id),leg.end,.05);return leg;
 };
 const ab=go(B,A,0,0);
 assert.equal(ab.arrivalRadius,0);assert.equal(craft.placement,'local');assert.equal(craft.waypointHoldId,B);assert.equal(craft.flight.speed,0);assert.equal(craft.flight.thrust,0);close(craft.flight.velocity,origin);
 const hold=[...pos(craft.id)],facing=r.getFocusFrame(craft.id).frame[2].slice();r.time+=100;r.fillObjects();close(pos(craft.id),hold);close(r.getFocusFrame(craft.id).velocity,origin);
 r.setNavigationMode(craft.id,'manual');assert.equal(craft.flight.speed,0);close(craft.flight.position,hold);close(craft.flight.basis[2],facing);r.setNavigationMode(craft.id,'auto');
 const incoming=go(planet.id,B,0,null);assert(incoming.arrivalRadius>0);assert(incoming.finalSpeed>0);assert.equal(craft.parentId,planet.id);
 assert(Math.abs(dot(sub(incoming.end,incoming.center),incoming.tangent))<.01);
 const back=go(B,planet.id,null,0);assert(back.departureRadius>0);assert.equal(back.arrivalRadius,0);close(pos(B),pos(craft.id));
 const off=marker(add(pos(B),mul(plane[1],1000)),'Off plane');r.fillObjects();assert(!Number.isFinite(sequencePlaneHeight(r,craft,[A,off])));assert.match(orbitalTangentLeg(r,off,{craftId:craft.id}).error,/plane/);r.dispose();
}
console.log('PASS: Shuttle and Enterprise point-to-point rest, midpoint, tangent point/orbit joins, terminal rest and manual handoff, invalid plane refused.');
