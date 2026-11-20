import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {REFERENCE_RG_METERS as rg} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make(),worker=make(),restored=make();
const step=(r,n)=>{for(let i=0;i<n;i++)r.advanceSimulation(r.lastTime+100);};
const near=(a,b,tol,label)=>assert(Math.abs(a-b)<=tol,label+': '+a+' vs '+b);
function compare(a,b,label){
 const A=a.getDockingState(),B=b.getDockingState();assert.deepEqual([A.phase,A.port,A.stationId],[B.phase,B.port,B.stationId],label);
 near(A.gapMeters,B.gapMeters,0.005,label+' gap');near(A.relativeSpeed,B.relativeSpeed,.0001,label+' closing velocity');
 const fa=a.getFocusFrame(A.craftId),fb=b.getFocusFrame(B.craftId);
 near(Math.hypot(...fa.position.map((x,i)=>x-fb.position[i]))*rg,0,.005,label+' spacecraft center');
 const ha=a.getFocusFrame(A.stationId),hb=b.getFocusFrame(B.stationId);
 for(const key of ['frame','drumFrame'])for(let k=0;k<3;k++)for(let j=0;j<3;j++)near(ha[key][k][j],hb[key][k][j],1e-7,label+' '+key);
 const sa=a.dockingMission.sample,sb=b.dockingMission.sample;
 for(const key of ['velocity','rcs','rcsTorque'])for(let k=0;k<3;k++)near(sa[key]?.[k]??0,sb[key]?.[k]??0,key==='velocity'?1e-4:1e-5,label+' '+key);
 for(let k=0;k<3;k++)for(let j=0;j<3;j++)near(sa.basis[k][j],sb.basis[k][j],1e-7,label+' orientation');
 near(sa.extension,sb.extension,1e-8,label+' collar stroke');near(sa.mainThrustG,sb.mainThrustG,1e-7,label+' main burn');
 if(a.dockingMission.playlist)for(const flag of ['index','loop','active','inFlight','holding','legsCompleted'])assert.equal(a.flightSequences[A.craftId][flag],b.flightSequences[B.craftId][flag],label+' '+flag);
 near(a.getObjectClock(A.craftId).properSeconds,b.getObjectClock(B.craftId).properSeconds,1e-6,label+' watch');
}
try{
 r.loadScene('earth-mars-station-ferry');r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 restoreRenderer(worker,snapshotRenderer(r));
 function checkScene(){
  r.fillObjects();r.updateCameraFrame();const m=r.dockingMission;
  restoreRenderer(worker,snapshotRenderer(r,{includeObjects:false,objectIds:[m.craftId]}));compare(r,worker,'worker update');
  const yaml=serializeScene(r);restoreRenderer(restored,parseScene(yaml));restored.sceneLoad=null;restored.lastTime=r.lastTime;
  compare(r,restored,'restored '+m.phase);step(r,1);step(restored,1);compare(r,restored,'continued '+m.phase);
  return yaml;
 }
 const id=r.dockingMission.craftId,earth=r.objects.find(o=>o.catalogId==='earth-station').id;
 const firstRoute=r.flightSequences[id];assert.deepEqual(firstRoute.nodes.map(n=>[n.kind,n.port]),[['dock','south'],['dock','south']]);assert(firstRoute.loop);
 const stages=new Set(),stations=new Set();
 // Visit phases by event rather than assuming screening times. Sample inside
 // each stage as well, so loading does not silently replay its beginning.
 for(let i=0;i<6000;i++){
  const m=r.dockingMission;assert(m,'Ferry stopped unexpectedly.');
  if(m.phase==='docked')stations.add(m.stationId);
  const key=m.phase+':'+m.stationId;
  if(!stages.has(key)&&m.elapsed>=m.duration*.25){
   stages.add(key);
   const text=checkScene();
   if(m.phase==='orbit'||m.phase==='acquire'){
    assert(!/^    route:/m.test(text),'There is no second itinerary in the docking mission.');
    assert.throws(()=>parseScene(text.replace('port: "south"','port: "aft"')),/port/);
    assert.throws(()=>parseScene(text.replace(/targetId: "body-\d+"(\s+kind: "dock")/,'targetId: "space"$1')),/Garden Station/);
   }
   continue;
  }
  if(stations.size===2&&m.stationId===earth&&m.phase==='docked')break;
  step(r,1);
 }
 for(const phase of ['transit','orbit','acquire','approach','docked','undock'])assert([...stages].some(key=>key.startsWith(phase+':')),'Missing '+phase);
 assert.equal(stations.size,2);assert.equal(r.dockingMission.phase,'docked');
 const beforeEdit=snapshotRenderer(r),neptune=r.objects.find(o=>o.name==='Neptune').id;
 const edited=r.setFlightSequence(id,[{targetId:neptune,kind:'orbit'}],{loop:false,active:true});assert(edited.active&&edited.pendingAtContact);
 checkScene(); // The current berth is allowed to differ from the next command.
 const left=new Set();
 for(let i=0;i<800&&r.dockingMission;i++){
  const m=r.dockingMission;
  if(['depart','departOrbit'].includes(m.phase)&&m.elapsed>=m.duration*.25&&!left.has(m.phase)){left.add(m.phase);checkScene();}
  else step(r,1);
 }
 assert(left.has('depart'),'Saved the return flight from the berth to the parking orbit.');
 restoreRenderer(r,beforeEdit);r.sceneLoad=null;
 assert(r.undock(id));for(let i=0;i<600&&r.dockingMission;i++)step(r,1);
 assert(!r.dockingMission);assert(r.startDocking(id,earth,'north'),r.lastDockingError);
 assert(r.dockingMission.plan.local,'Changed axial ports through an RCS-only rendezvous.');
 step(r,85);const localFile=checkScene();
 assert.throws(()=>parseScene(localFile.replace('side: 1','side: 0')),/docking side/);
 // A real mid-transit file from before the playlist migration keeps its old
 // worldline through this leg and now exposes both original ports as stops.
 const legacy=parseScene(readFileSync(new URL('./fixtures/legacy-ferry.scene.yaml',import.meta.url),'utf8')),crew=legacy.dockingMission.craftId;
 const oldQ=legacy.flightSequences[crew];assert.deepEqual(oldQ.nodes.map(n=>n.port),['north','south']);assert(oldQ.loop&&oldQ.active&&oldQ.inFlight&&legacy.dockingMission.playlist);
 restoreRenderer(restored,legacy);restored.sceneLoad=null;restored.lastTime=1000;step(restored,1);
 const next=restored.dockingMission.sample.position,expected=[-71348893821.20244,-452096797.96552795,152290727648.36066];
 assert(Math.hypot(...next.map((x,i)=>x-expected[i]))<.005,'Restored old transfer keeps its exact next position');
 r.loadScene('disk');restoreRenderer(worker,snapshotRenderer(r));assert.equal(worker.dockingMission,null);
 const oldLike=serializeScene(r).replace(/^  dockingMission: null\n/m,'');
 assert.equal(parseScene(oldLike).dockingMission,null,'Pre-docking scene files still open.');
 console.log('PASS: worker and YAML reproduce both stations, ports, approach, latch, separation, powered transfer and local RCS flyaround; resumed clocks, geometry and playback agree.');
}finally{r.dispose();restored.dispose();worker.dispose();}
