import {advanceJanusExchanges} from '../dist/janus-exchange.js';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
import {janusLocalField} from '../dist/janus-aperture.js';
import {janusLapSample} from '../dist/janus-local.js';
import {speedForWarp} from '../dist/flight-dynamics.js';

const f=fixture({width:720,height:480}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
const TAU=2*Math.PI,dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
try{
 r.loadScene('earth-andromeda-bridge');r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 const ship=r.objects.find(o=>o.hullModel==='janusPod'),earth=r.objects.find(o=>o.catalogId==='earth');
 const sample=janusLapSample(r,ship);assert(Math.abs(sample.localSpeed-speedForWarp(r.state.warpFactor))<1e-6);
 assert(r.state.warp&&r.warpObjectId===ship.id&&r.shaderFeatures().weakField);
 const field=()=>janusLocalField(r,r.cameraFrame,720,480);
 assert(field()?.radius>0,'thin local field follows the physical hull');r.state.warpField=false;assert(!field());r.state.warpField=true;
 const offset=()=>{const pos=r.frameById.get(ship.id).position,center=r.frameById.get(earth.id).position,v=pos.map((n,i)=>n-center[i]),mag=Math.hypot(...v);return v.map(n=>n/mag);};
 let prev=offset(),angle=0;const steering=[];
 for(let tick=1;tick<=75;tick++){
  r.advanceSimulation(1000+100*tick);r.fillObjects();const next=offset();
  angle+=Math.acos(Math.max(-1,Math.min(1,dot(next,prev))));prev=next;
  const frame=r.frameById.get(ship.id);
  if(tick<75){assert(frame.warpImpulse>0&&frame.warpImpulse<.6);steering.push(frame.warpYawJet);assert(r.state.warp);}
 }
 assert(Math.abs(angle-TAU)<.0001,'the geometry must sweep one real revolution');
 assert(Math.min(...steering)<-.3&&Math.max(...steering)>-.01,'inward trim pulses have a coast interval');
 r.updateCameraFrame();assert.equal(r.getJanusBridge(ship.id).stage,'charge');assert(field(),'The local shell persists through opening');assert(!r.state.warp);
 assert(Math.abs(r.getObjectClock(ship.id).properSeconds-sample.periodSeconds)<.01,'a 7.5 s visual lap represents the actual period');
 // The persistent comoving shell is independent of orbital thrust and of
 // the expanding exchange aperture. Track it through the actual chart commit.
 const shell=field();advanceJanusExchanges(r,3.21);r.fillObjects();r.updateCameraFrame();
 assert.equal(r.getJanusBridge(ship.id).stage,'settle');assert(field());
 assert(Math.abs(field().radius-shell.radius)<1e-6,'The field stays hull-relative through transfer');
 advanceJanusExchanges(r,2.5);r.fillObjects();r.updateCameraFrame();assert(field());
 r.state.warpField=false;assert.equal(field(),null);r.state.warpField=true;
 // Drive → Go must not leave the manual integrator overwriting a local
 // approach. Sample positions during travel, not just arrival metadata.
 r.loadScene('shuttle-space');r.sceneLoad=null;r.state.paused=false;
 const pilot=r.objects.find(o=>o.hullModel==='janusPod');r.setNavigationMode(pilot.id,'manual');r.focusTarget(pilot.id,'track',false,true);r.fillObjects();
 const [x,y,z]=r.frameById.get(pilot.id).position.map(v=>v*REFERENCE_RG_METERS);
 const mark=r.addChildObject('space','waypoint',{x:x+700,y,z});assert(r.startTravel(mark.id,{craftId:pilot.id}));
 r.lastTime=1000;
 let last=0;
 for(let i=1;i<=80;i++){
  r.advanceSimulation(1000+100*i);r.fillObjects();r.updateCameraFrame();
  const pos=r.frameById.get(pilot.id).position[0]*REFERENCE_RG_METERS-x,progress=r.getJanusBridge(pilot.id);
  assert(pos>=last-1e-5&&pos-last<15,'every sample advances continuously');last=pos;
  assert.equal(progress.exchanges,0);assert.equal(r.getJanusExchangeVisual(pilot.id),null);
  if(i===40){assert(Math.abs(pos-350)<.001);assert(janusLocalField(r,r.cameraFrame,640,422));assert(r.frameById.get(pilot.id).warpImpulse>0);}
 }
 assert(Math.abs(last-700)<.001);assert.equal(r.state.warp,false,'at rest at a waypoint');assert(janusLocalField(r,r.cameraFrame,640,422),'The cabin shell stays around the stationary arrival');
}finally{r.dispose();}
const fc=fixture(),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=fc.canvas.getBoundingClientRect;const cpu=new CpuRenderer(canvas,{autoStart:false});
try{
 cpu.loadScene('earth-andromeda-bridge');cpu.sceneLoad=null;const pod=cpu.objects.find(o=>o.hullModel==='janusPod');const local=janusLocalField(cpu,cpu.cameraFrame,cpu.canvas.width,cpu.canvas.height);assert(local);
 canvas.beginFrame();cpu.render(1000,false,true);const painted=canvas.takeFrame();
 assert(painted.gradients.some(g=>g.kind==='linear'&&g.stops.some(stop=>stop[1]==='rgba(101,197,239,.46)')));assert(cpu.frameById.get(pod.id).warpImpulse>0);assert.equal(canvas.stack.length,0);
}finally{cpu.dispose();}
console.log('PASS: Janus visibly flies one measured circle under local warp, with sublight orbital speed, inward trim and recessed thruster ports, independent local clocks, thin GPU/CPU field and clear bridge handoff.');
