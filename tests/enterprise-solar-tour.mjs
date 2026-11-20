import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS,SCENE_PROGRESSIONS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';
import {speedForWarp} from '../dist/flight-dynamics.js';
import {sampleTransfer} from '../dist/travel-math.js';

const open=id=>{
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.loadScene(id);assert.equal(r.sceneId,id);r.sceneLoad=null;r.state.paused=false;return r;
};
const manifest=(r,type)=>{
 const craft=r.objects.find(o=>o.type===type),q=r.flightSequences[craft.id];
 assert(q.active&&q.loop);return {craft,q,names:q.nodes.map(n=>r.objectById.get(n.targetId).name)};
};
const near=(x,y,tol=1e-7)=>assert(Math.abs(x-y)<=tol*Math.max(1,Math.abs(y)),`${x} ≠ ${y}`);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);

const shuttle=open('solar-system'),enterprise=open('enterprise-solar-tour');
try{
 const preset=SCENE_PRESETS.find(scene=>scene.id===enterprise.sceneId);
 assert.equal(preset.title,'Warping around the solar system');assert(SCENE_PROGRESSIONS['Warp drive'].includes(preset.id));
 assert.equal(enterprise.state.grid,false);assert.equal(enterprise.state.warpGridOnly,true);
 const original=manifest(shuttle,'shuttle'),{craft,q,names}=manifest(enterprise,'enterprise');
 assert.deepEqual(names,original.names);
 assert.equal(names.length,12);assert.equal(craft.parentId,q.nodes[0].targetId);
 assert(original.q.orbitWait.transferSeconds>300,'Shuttle retains its physical 1g transfer duration');
 const peaks=[];
 for(let index=0;index<names.length;index++){
  const departure=q.nodes[index],destination=q.nodes[(index+1)%names.length],arc=q.orbitWait;
  assert.equal(arc.targetId,departure.targetId);assert.equal(arc.destinationId,destination.targetId);
  assert(arc.sweepRadians>0&&arc.wallSeconds>0,'A visible parking arc connects the incoming and outgoing tangent');
  near(arc.transferSeconds,300);
  // The cinematic arc covers its true swept length in the clock, even when
  // those hours or days of orbit fit into only a few seconds of screen time.
  const onboardAtStop=craft.clock.properSeconds,arcSeconds=arc.sweepRadians*departure.radiusMeters/arc.speedMetersPerSecond;
  near(arc.durationSeconds,arcSeconds);
  for(let i=0;i<450&&!enterprise.transfer;i++)enterprise.advanceChartStages(Math.min(.1,Math.max(1e-9,q.waitSeconds)));
  near(craft.clock.properSeconds-onboardAtStop,arcSeconds);
  const onboardAtLaunch=craft.clock.properSeconds;
  const t=enterprise.transfer;assert(t?.active,q.error||'Transfer should have started');
  assert.equal(t.targetId,destination.targetId);assert.equal(t.plan.type,'enterprise');
  near(t.properSeconds,300);near(t.coordinateSeconds,300);near(t.initialSpeed,arc.speedMetersPerSecond);
  // Independently integrate the reported speed over onboard seconds. A fixed
  // ETA pasted onto a leg still flying at a fixed warp would fail this.
  let integral=0;
  for(let i=0;i<300;i++)integral+=sampleTransfer(t.plan,(i+.5)/300).speedMetersPerSecond;
  near(integral,t.distanceMeters,5e-5);
  let max=0,lastTime=-1,mid=0,late=0;
  for(let i=1;i<=100;i++){
   enterprise.advanceChartStages(t.wallSeconds/100);
   near(craft.clock.properSeconds-onboardAtLaunch,t.properElapsedSeconds);
   assert.equal(craft.clock.coordinateSeconds,craft.clock.properSeconds);
   assert.equal(craft.clock.lagSeconds,0);
   if(i<100){
    assert(t.properElapsedSeconds>lastTime);lastTime=t.properElapsedSeconds;
    near(speedForWarp(enterprise.state.warpFactor),craft.flight.speed,1e-5);
    assert.equal(craft.flight.thrust,0,'No shuttle-style retrograde flip and burn');
    assert(dot(craft.flight.basis[2],t.tangent)>.999,'Nose follows the travel tangent');
    max=Math.max(max,craft.flight.speed);
    if(i===50)mid=craft.flight.speed;if(i===90)late=craft.flight.speed;
   }
  }
  assert(!enterprise.transfer,q.error||'Arrived at orbital contact');
  near(t.properElapsedSeconds,300);near(t.sample.distanceMeters,t.distanceMeters);
  assert(max>Math.max(t.initialSpeed,t.finalSpeed)&&mid>late,'Warp rises after departure and slows before arrival');
  assert.equal(craft.parentId,destination.targetId);
  assert(q.orbitWait,'Return to a circular arc after travel');near(q.orbitWait.speedMetersPerSecond,t.finalSpeed);
  peaks.push(max);
 }
 assert(Math.max(...peaks)>100*Math.min(...peaks),'A short lunar hop and an outer-system crossing use different peak warps');
 console.log('PASS: Enterprise flies all 12 shuttle tour stops in order and loops, with 300 onboard seconds on every tangent, matched arc speeds, distance-integrated warp ramps, and no flip or thrust.');
}finally{enterprise.dispose();shuttle.dispose();}
