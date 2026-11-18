import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
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
  assert(nodes.every(n=>n.targetId===body&&n.extraLaps===1));
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
  for(let leg=0;leg<nodes.length;leg++){
   const start=nodes[leg].radiusMeters,end=nodes[(leg+1)%nodes.length].radiusMeters;
   let prev=location(),sweep=0,burnSeconds=0,sawBurn=false,lastAngle=0,prevLocalClock=0;
   for(let tick=0;tick<650;tick++){
    const before=r.transfer;
    r.advanceChartStages(step);
    const t=r.transfer,q=r.getFlightSequence(id),w=q.orbitWait,now=location();
    assert(!q.error,scene+' leg '+leg+': '+q.error);
    const ccw=Math.atan2(prev.z*now.x-prev.x*now.z,prev.x*now.x+prev.z*now.z);
    // Up to thousands of physical turns are compressed into ten seconds.
    // A pair of apparent positions alone cannot determine turn direction.
    if(!before){assert(ccw>=-1e-8,'Parking lap reversed');sweep+=ccw;}
    if(t){
     assert(t.sample.angle>=lastAngle-1e-10,'The continuous azimuth must advance counterclockwise');
     assert(t.properElapsedSeconds>=prevLocalClock,'The onboard clock cannot reverse');
     lastAngle=t.sample.angle;prevLocalClock=t.properElapsedSeconds;
    }
    if(before){burnSeconds+=step;}
    if(t&&!before){
     near(sweep,tau,.001,'One complete departure lap');
     near(now.R,start,start*1e-8,'Burn begins on occupied orbit');
    }
    if(t){
     assert((now.R-prev.R)*Math.sign(end-start)>=-start*1e-9,'Actual radius moves toward target');
     if(t.elapsed>3&&t.elapsed<7){
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
      ui.update();assert.equal(el('pilotLegSpeed').textContent,'v = '+formatFlightSpeed(speed));
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
     assert(sawBurn,'The live motor fired during the radius change');near(burnSeconds,10,step+.000001,'Ten seconds of transfer playback');
     assert.equal(ship.parentId,body);near(now.R,end,end*1e-8,'Selected radius reached');
     assert(q.orbitWait,'Arrival starts the next orbit');
     if(scene==='nasa-shuttle'){
      ui.update();const clock=r.getObjectClock(id),h=clock.horizonGapMeters;
      if(leg===2){
       const hull=r.objectRadius(ship)*RG;assert(h>=hull&&h<=3*hull,'The last orbit clears the horizon by a small finite hull clearance: '+h);
       assert(clock.rateFactor>100&&Number.isFinite(clock.rateFactor),'Finite exterior clock');
       assert(clock.crewLoadG>9&&clock.requiredSupportG>1,'The near-horizon track demands unsafe proper support');
       assert(!el('pilotEngineAlert')&&!el('pilotCrewAlert').hidden,'The live instruments warn at the exceptionally deep stop');
       assert(clock.highGExposureSeconds>=clock.extremeGExposureSeconds&&clock.extremeGExposureSeconds>0,'Simulated onboard time is counted through dangerous exposure');
       const snapshot=parseScene(serializeScene(r));restoreRenderer(copy,snapshot);
       near(copy.getObjectClock(id).extremeGExposureSeconds,clock.extremeGExposureSeconds,1e-7,'Saved exposure survives reload');
      }else if(leg===3){
       assert(clock.crewLoadG<1.5&&clock.extremeGExposureSeconds===0,'Returning outside resets continuous exposure');
       assert(el('pilotCrewAlert').hidden,'A past deep visit does not leave a stale live danger warning');
      }
     }
     break;
    }
    if(tick===649)assert.fail('No arrival in '+scene+' leg '+leg);
    prev=now;
   }
  }
 }
 r.loadScene('orbital-expedition');r.sceneLoad=null;r.fillHoles();r.fillObjects();ui.update();
 const station=r.objects.find(o=>o.type==='iss'),clock=r.getObjectClock(station.id);
 assert.equal(r.focusId,station.id);assert(!r.autopilot?.enabled,'The observing station is not drivable');
 assert(el('pilotControls').hidden,'The station does not expose a playlist');
 assert(!d.querySelector('.motion-stack').hidden,'The ISS keeps its flight instruments');
 assert(clock.speedMetersPerSecond>0&&clock.accelerationG>0&&clock.rateFactor>1);
 assert.equal(el('pilotLegSpeed').textContent,'v = '+formatFlightSpeed(clock.speedMetersPerSecond));
 assert(!el('pilotDilationRateRow').hidden&&!el('pilotDilationRow').hidden);
 assert(!el('pilotEngineAlert')&&!el('pilotCrewAlert').hidden,'ISS displays the warnings applicable to its own supported track');
 assert(!el('shuttleEscapeNote').hidden&&!el('pilotSpeedLog').parentElement.hidden,'The station also reports the return benchmark and relativistic speed');
 console.log('PASS: complete Edge and Earth radius loops; actual radial and tangential velocity, thrust cap, exterior-horizon warnings, ISS instruments, saved playlist, onboard ETA and progress.');
}finally{r.dispose();copy.dispose();}
