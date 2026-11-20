import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene('nasa-shuttle');r.sceneLoad=null;r.state.paused=false;
 const ship=r.objects.find(o=>o.type==='shuttle'),up=r.configCache.primaryBasis[1];
 const disc=r.configCache.primaryDiscAxis;
 assert(Math.abs(dot(disc,up)-Math.cos(18*Math.PI/180))<1e-12,'Only the emitting disc is inclined');
 let arrivals=0,arcs=0,burnFrames=0,above=false,below=false;
 for(let i=0;i<7000&&arrivals<3;i++){
  const prior=r.transfer;r.advanceChartStages(.05);r.fillObjects();
  const pose=r.getFocusFrame(ship.id),frame=pose.frame;
  const center=r.getFocusFrame('primary').position;
  const delta=pose.position.map((v,i)=>v-center[i]);
  assert(Math.abs(dot(delta,up))<1e-9,'Laps and burns lie in the equatorial plane through the black hole');
  const height=dot(delta,disc);above||=height>0;below||=height<0;
  assert(Math.abs(dot(frame[2],up))<1e-10,'No pitch on either a parking lap or a burn');
  assert(Math.abs(dot(frame[0],up))<1e-10&&dot(frame[1],up)>1-1e-10,'No bank or inverted hull');
  const t=r.transfer;
  if(t?.radiusTransfer&&t.progress>0){
   const {radialThrust:ar,tangentialThrust:at}=t.sample,mag=Math.hypot(ar,at);
   if(mag>1e-8){const radial=t.orbitRadial,tangent=[up[1]*radial[2]-up[2]*radial[1],up[2]*radial[0]-up[0]*radial[2],up[0]*radial[1]-up[1]*radial[0]];
    assert(Math.abs(dot(frame[2],radial)-ar/mag)<1e-9&&Math.abs(dot(frame[2],tangent)-at/mag)<1e-9,'Nozzle opposite the physical thrust vector');burnFrames++;}
  }else if(!t){arcs++;}
  if(prior&&!t){arrivals++;if(arrivals>=2)assert(height>.25*r.massScale,'Both inner arrivals approach the upper side of the luminous disc');}
 }
 assert.equal(arrivals,3);assert(arcs>100&&burnFrames>100);assert(above&&below,'Free circular laps cross the tilted disc plane');
 // Take manual control partway through a burn. Turning rotates the
 // hull about the same normal without rotating the existing coast velocity.
 r.loadScene('nasa-shuttle');r.sceneLoad=null;r.state.paused=false;
 const pilot=r.objects.find(o=>o.type==='shuttle');
 for(let tick=0;tick<1800&&!(r.transfer?.progress>.3);tick++)r.advanceChartStages(.05);
 assert(r.transfer?.progress>.3);
 const nose=r.getFocusFrame(pilot.id).frame[2],v=[...pilot.flight.velocity];
 r.setNavigationMode(pilot.id,'manual');r.setFlightHeading(100);
 let now=1000;r.lastTime=now;
 for(let tick=0;tick<130;tick++){
  r.advanceSimulation(now+=50);r.fillObjects();
  const frame=r.getFocusFrame(pilot.id).frame;
  assert(dot(frame[1],up)>1-1e-10&&Math.abs(dot(frame[2],up))<1e-10);
  assert.deepEqual(pilot.flight.velocity,v);
 }
 assert(dot(nose,pilot.flight.basis[2])<.995,'manual heading actually changed');
 console.log('PASS: Hull remains level on each parking arc and points along the applied acceleration on all three transfers.');
}finally{r.dispose();}
