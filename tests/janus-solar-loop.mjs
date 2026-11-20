// Run the entire default player route. Measure real radial-vector motion in
// each host's own frame; a dwell timer with a stationary ship would fail.
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {JANUS_SOLAR_TOUR} from '../dist/janus-solar-tour.js';

const r=new BlackHoleRenderer(fixture({width:860,height:560}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene(JANUS_SOLAR_TOUR.id); r.sceneLoad=null;r.state.paused=false;r.state.speed=3;r.lastTime=1000;
 const pod=r.objects.find(o=>o.hullModel==='janusPod');
 const route=r.getFlightSequence(pod.id),expected=JANUS_SOLAR_TOUR.janusRoute.destinations;
 assert.equal(route.propulsion,'bridge');
 const record=new Map();let previous=null,last=null,visits=[],elapsed=0;
 const unit=v=>{const n=Math.hypot(...v);assert(n>0&&Number.isFinite(n));return v.map(x=>x/n);};
 const angle=(u,v)=>Math.acos(Math.min(1,Math.max(-1,u.reduce((a,x,i)=>a+x*v[i],0))));
 for(let tick=1;tick<=3000;tick++){
  r.advanceSimulation(1000+100*tick);r.fillObjects();
  const state=r.getJanusBridge(pod.id),host=r.objectById.get(pod.parentId);assert(host);
  const key=host.catalogId;
  if(key!==last){visits.push(key);last=key;}
  if(visits.length>expected.length)break;
  const phase=state.stage;
  const a=r.frameById.get(pod.id).position,b=r.frameById.get(host.id).position,u=unit(a.map((x,i)=>x-b[i]));
  if(phase==='orbit'){
   assert.equal(r.state.warp,true,key+' missing orbital warp');
   if(previous?.key===key&&previous.phase==='orbit'){
    record.set(key,(record.get(key)||0)+angle(previous.u,u));
   }
  }
  const seconds=r.getObjectClock(pod.id).properSeconds;
  assert(seconds>=elapsed,'Crew clock went backwards at '+key);elapsed=seconds;
  previous={u,key,phase};
 }
 assert.deepEqual(visits,[...expected,expected[0]]);
 for(const k of expected){const turn=(record.get(k)||0)/(2*Math.PI);assert(turn>.93&&turn<1.015,k+' completed '+turn+' turns before departure');}
 console.log('PASS: measured a complete local warp orbit at all twelve player stops, eleven outbound bridge exchanges and a return to Earth with a continuous clock.');
}finally{r.dispose();}
