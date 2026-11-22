import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {studyReplayOpacity,displayStudyReplay} from '../dist/study-replay.js';
import {captureAnnotationFrame} from '../dist/annotations.js';
import {installPilotControls,formatFlightSpeed} from '../dist/pilot-ui.js';
import {formatClockDuration} from '../dist/object-clocks.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';

const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make(),copy=make();
const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=d;globalThis.window=d.createElement('window');d.body=d.querySelector('body');
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const el=create(tag);if(tag==='progress')Object.defineProperty(el,'max',{writable:true,value:1});return el;};
const el=id=>d.getElementById(id),ui=installPilotControls({mount:el('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){}});
const bar=d.querySelector('.flight-leg-progress'),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const near=(a,b,tol,label)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=tol,label+': '+a+' vs '+b);
const step=.05,tau=2*Math.PI,c=299792458;
try{
 for(const scene of ['nasa-shuttle','shuttle-earth-moon-loop']){
  r.loadScene(scene);r.sceneLoad=null;
  const ship=r.objects.find(o=>o.type==='shuttle'),id=ship.id,body=ship.parentId;
  if(scene==='shuttle-earth-moon-loop'){
   const nodes=[ship.orbitMeters,ship.orbitMeters*1.5].map(radiusMeters=>({targetId:body,radiusMeters}));
   assert(!r.setFlightSequence(id,nodes,{loop:true,active:true}).error);
  }
  const nodes=r.getFlightSequence(id).nodes;
  assert.equal(nodes.length,scene==='nasa-shuttle'?4:2);
  assert(nodes.every((n,i)=>n.targetId===body&&n.extraLaps===(scene==='nasa-shuttle'?i+1:1)));
  if(scene==='nasa-shuttle'){
   assert(nodes.every((n,i)=>!i||n.radiusMeters<nodes[i-1].radiusMeters),'All four visits descend in radius');
  }
  const saved=parseScene(serializeScene(r));restoreRenderer(copy,saved);
  assert.deepEqual(copy.getFlightSequence(id).nodes.map(n=>[n.targetId,n.radiusMeters,n.extraLaps]),nodes.map(n=>[n.targetId,n.radiusMeters,n.extraLaps]));
  r.state.paused=false;
  // Observe the rendered radius and signed phase in the chart's own basis.
  // There is no privileged screen orientation and no need to unwrap a full turn.
  function location(){
   r.fillObjects();
   const origin=r.getFocusFrame(body).position,delta=r.getFocusFrame(id).position.map((v,i)=>(v-origin[i])*RG);
   const basis=r.configCache.primaryBasis,x=dot(delta,basis[0]),z=dot(delta,basis[2]);
   return {x,z,R:Math.hypot(x,z)};
  }
  for(let leg=0;leg<(scene==='nasa-shuttle'?nodes.length-1:nodes.length);leg++){
   const start=nodes[leg].radiusMeters,end=nodes[(leg+1)%nodes.length].radiusMeters;
   let prev=location(),sweep=0,burnSeconds=0,sawBurn=false,lastAngle=0,prevLocalClock=0;
   const slews=new Set();
   for(let tick=0;tick<4500;tick++){
    const before=r.transfer;
    r.advanceChartStages(step);
    const t=r.transfer,q=r.getFlightSequence(id),w=q.orbitWait,now=location();
    assert(!q.error,scene+' leg '+leg+': '+q.error);
    const ccw=Math.atan2(prev.z*now.x-prev.x*now.z,prev.x*now.x+prev.z*now.z);
    // Up to thousands of physical turns can fold into a representative spiral.
    // A pair of apparent positions alone cannot determine turn direction.
    if(!before){assert(ccw>=-1e-8,'Parking lap reversed');sweep+=ccw;}
    if(t){
     assert(t.sample.angle>=lastAngle-1e-10,'The continuous azimuth must advance counterclockwise');
     assert(t.properElapsedSeconds>=prevLocalClock,'The onboard clock cannot reverse');
     lastAngle=t.sample.angle;prevLocalClock=t.properElapsedSeconds;
    }
    if(before){burnSeconds+=step;}
    if(t&&!before){
     near(sweep,tau*nodes[leg].extraLaps,.001,'All departure laps complete');
     near(now.R,start,start*1e-8,'Burn begins on occupied orbit');
    }
    if(t){
     assert((now.R-prev.R)*Math.sign(end-start)>=-start*1e-9,'Actual radius moves toward target');
     if(t.plan.spiral&&t.progress>0){
      const s=t.sample,R=t.orbitRadial,normal=t.tangentLeg.normal;
      const T=[normal[1]*R[2]-normal[2]*R[1],normal[2]*R[0]-normal[0]*R[2],normal[0]*R[1]-normal[1]*R[0]];
      if(s.slew!==undefined){
       slews.add(s.phase);
       assert.equal(ship.flight.thrust,0,'Main engine is off while slewing on the circular coast');
       near(s.radialVelocity,0,1e-7,'Radial velocity on a parking coast');
       near(s.tangentialVelocity,Math.sqrt(t.plan.mu/s.radius),1e-6,'Circular speed is preserved during the slew');
      }else if(s.requiredSupportG>.001){
       const F=R.map((v,k)=>v*s.radialThrust+T[k]*s.tangentialThrust+normal[k]*s.normalThrust);
       near(dot(ship.flight.basis[2],F)/Math.hypot(...F),1,1e-8,'Main nozzle follows applied acceleration, independent of velocity');
      }
     }
     if(t.progress>.35&&t.progress<.65){
      sawBurn||=ship.flight.thrust>0;assert(ship.flight.thrust>=0&&ship.flight.thrust<=1+1e-10,'The engine command is at most 1g, even on an unsupported trajectory');
      const s=t.sample,clock=r.getObjectClock(id),v=ship.flight.velocity;
      const radial=dot(v,t.orbitRadial),speed=Math.hypot(...v);
      near(radial,s.radialVelocity,Math.max(1,speed)*1e-10,'Radial velocity reaches the live flight state');
      near(speed,Math.hypot(s.radialVelocity,s.tangentialVelocity),Math.max(1,speed)*1e-10,'Actual speed includes radial and tangential velocity');
      assert(s.radialVelocity*Math.sign(end-start)>0&&s.tangentialVelocity>0);
      assert(speed<c&&Number.isFinite(clock.crewLoadG)&&clock.crewLoadG>=0);
      near(clock.speedMetersPerSecond,speed,Math.max(1,speed)*1e-10,'Telemetry speed matches actual vector');
      assert(Number.isFinite(clock.accelerationG)&&clock.accelerationG>=0);
      assert(Number.isFinite(clock.rateFactor)&&clock.rateFactor>=1);
      ui.update();assert.equal(el('pilotLegSpeed').textContent,'v = '+formatFlightSpeed(Math.hypot(s.chartVr??s.radialVelocity,s.chartVphi??s.tangentialVelocity)));
      assert(now.R>Math.min(start,end)&&now.R<Math.max(start,end));
     }
    }
    // Compare the visible standalone maneuver HUD against the current onboard clock.
    if(t||(w&&!before)){
     ui.update();const proper=t?t.properSeconds:w.durationSeconds,elapsed=t?t.properElapsedSeconds:proper*(w.arcFraction||0);
     assert(!bar.hidden&&!el('pilotFlightMetrics').hidden);
     assert.equal(el('pilotFlightRemaining').textContent,formatClockDuration(Math.max(0,proper-elapsed)));
     near(Number(bar.value),elapsed/proper,1e-6,'Progress belongs to this maneuver');
    }
    if(before&&!t){
     if(before.plan.spiral)assert.deepEqual([...slews],['Orienting for radius change','Aligning with parking orbit']);
     assert(sawBurn,'The live motor fired during the radius change');near(burnSeconds,before.wallSeconds,step+.000001,'Each burn consumes its scheduled presentation interval');
     assert.equal(ship.parentId,body);near(now.R,end,end*1e-8,'Selected radius reached');
     assert(q.orbitWait,'Arrival starts the next orbit');
     if(scene==='nasa-shuttle'){
      ui.update();const clock=r.getObjectClock(id),h=clock.horizonGapMeters;
      if(leg===2){
       near(end,1.01*r.configCache.isco[0]*r.massScale*RG,.01,'Final stop beyond the prograde ISCO');
       assert(h>0&&clock.rateFactor>1&&Number.isFinite(clock.rateFactor));
       assert.equal(clock.requiredSupportG,0,'The stable circular geodesic needs no thrust');
       assert.equal(clock.crewLoadG,0);assert(el('pilotCrewAlert').hidden,'No lethal acceleration warning during free fall');
      }
     }
     break;
    }
    if(tick===4499)assert.fail('No arrival in '+scene+' leg '+leg);
    prev=now;
   }
  }
  if(scene==='nasa-shuttle'){
   const last=nodes.at(-1),q=r.flightSequences[id],w=q.orbitWait;
   assert(w?.replayAfterLap&&!w.leg&&w.sweepRadians===4*tau&&w.wallSeconds>=4*8,'Final orbit has four full laps and no outbound transfer');
   const startPhase=w.startPhase;
   const mask=el('sceneReplay');let sawDim=false,lastShade=0;
   assert.equal(studyReplayOpacity(r),0,'No replay mask during the innermost laps');

   r.state.paused=true;const frozen=w.elapsed;r.advanceChartStages(step);assert.equal(w.elapsed,frozen);r.state.paused=false;
   for(let guard=0;q.orbitWait===w;guard++){
    assert(guard<Math.ceil(w.wallSeconds/step)+2,'Final lap must finish');
    r.advanceChartStages(Math.min(step,w.wallSeconds-w.elapsed));assert(!r.transfer,'No ascent burn is scheduled');
    if(q.orbitWait===w){
     near(location().R,last.radiusMeters,last.radiusMeters*1e-8,'Final lap stays at the last radius');
     const shade=studyReplayOpacity(r);assert(shade>=lastShade,'Fade-out never reverses');
     if(!sawDim&&shade>.25&&shade<.75){
      sawDim=true;r.state.paused=true;r.advanceChartStages(step);assert.equal(studyReplayOpacity(r),shade,'Pausing freezes the fade');
      restoreRenderer(copy,snapshotRenderer(r));const frame=captureAnnotationFrame(copy);
      displayStudyReplay(mask,frame.replayShade);assert(!mask.hidden);near(Number(mask.style.opacity),shade,1e-9,'Worker frame and live overlay agree');r.state.paused=false;
     }
     lastShade=shade;
    }
   }
   near(Math.abs(w.lastPhase-startPhase),4*tau,1e-8,'Final lap completed before replay');
   near(location().R,nodes[0].radiusMeters,nodes[0].radiusMeters*1e-8,'One frame restores the first radius');
   assert.equal(ship.phase,q.replayPhase);assert.equal(q.legsCompleted,0);
   assert.equal(ship.clock.properSeconds,0);assert(q.orbitWait&&!q.orbitWait.replayAfterLap);
   assert(sawDim&&lastShade===1&&studyReplayOpacity(r)===1,'The rewind occurs under full black');
   r.advanceChartStages(.65);const opening=studyReplayOpacity(r);assert(opening>0&&opening<1,'Opening radius fades into view');
   r.advanceChartStages(.65);displayStudyReplay(mask,studyReplayOpacity(r));assert(mask.hidden,'No overlay remains on the new run');
   const reloaded=parseScene(serializeScene(r)).flightSequences[id];assert.equal(reloaded.replayPhase,q.replayPhase);assert(reloaded.restartOnLoop);
   const once=r.setFlightSequence(id,q.nodes,{loop:false});assert(!once.loop&&once.restartOnLoop);
   const edited=r.setFlightSequence(id,q.nodes.slice(0,2),{loop:true});assert(edited.loop&&!edited.restartOnLoop,'A custom route is flown as entered');
  }
 }
 r.loadScene('orbital-expedition');r.sceneLoad=null;r.fillHoles();r.fillObjects();ui.update();
 const station=r.objects.find(o=>o.type==='habitat'),clock=r.getObjectClock(station.id);
 assert.equal(r.focusId,station.id);assert(!r.autopilot?.enabled,'The observing station is not drivable');
 assert(el('pilotControls').hidden,'The station does not expose a playlist');
 assert(!d.querySelector('.motion-stack').hidden,'The habitat keeps its flight instruments');
 assert(clock.speedMetersPerSecond>0&&clock.accelerationG>0&&clock.rateFactor>1);
 assert.equal(el('pilotLegSpeed').textContent,'v = '+formatFlightSpeed(clock.distantSpeedMetersPerSecond));
 assert(!el('pilotDilationRateRow').hidden&&!el('pilotDilationRow').hidden);
 assert.equal(clock.crewLoadG,0,'The habitat hub follows a free orbit');
 assert(el('shuttleEscapeNote').hidden,'A passive station has no shuttle return maneuver');
 assert(!el('pilotSpeedLog').parentElement.hidden,'Crew light-speed gap remains visible');
 assert.match(el('pilotRatioLabel').textContent,/log₁₀/);
 console.log('PASS: complete Edge and Earth radius loops; actual radial and tangential velocity, thrust cap, stable Kerr parking, ISS instruments, saved playlist, onboard ETA and progress.');
}finally{r.dispose();copy.dispose();}
