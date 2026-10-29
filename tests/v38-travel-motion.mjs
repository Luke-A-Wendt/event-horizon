import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {buildTransferCurve,sampleTransferCurve,TRANSFER_WALL_SECONDS,transferEase} from '../dist/travel-math.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),unit=a=>a.map(v=>v/Math.hypot(...a)),angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(unit(a),unit(b)))));
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function make(width=390,height=720){const f=fixture({width,height}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');r.sceneLoad?.complete(r.sceneLoad.revision);r.lastTime=1000;return r;}
function step(r,ms){r.advanceSimulation(r.lastTime+ms);r.fillHoles();r.fillObjects();r.updateCameraFrame();}
// Uniform arc samples keep speed smooth across all 64 lookup boundaries.
const curve=buildTransferCurve([[0,0,0],[20,80,-35],[180,-30,45],[200,0,0]]),samples=Array.from({length:1001},(_,i)=>sampleTransferCurve(curve,i/1000));
for(let i=1;i<samples.length;i++){const distance=Math.hypot(...sub(samples[i].position,samples[i-1].position));near(distance,curve.length/1000,2e-5);assert(angle(samples[i].tangent,samples[i-1].tangent)<.05);}
near(transferEase(0),0);near(transferEase(1),1);assert(transferEase(1e-4)<1e-10);assert.equal(TRANSFER_WALL_SECONDS,10);
for(const [type,destination] of [['shuttle','Moon'],['enterprise','Earth']])for(const [width,height] of [[390,720],[1440,900]]){
 const r=make(width,height),ship=r.objects.find(o=>o.type===type),body=r.objects.find(o=>o.name===destination);r.setFreeDrive(ship.id,true);
 // Map tracking may look elsewhere; Go must bring the driven craft back.
 r.focusTarget(body.id,'track');assert(r.startTravel(body.id));assert.equal(r.focusId,ship.id);assert.equal(r.focusMode,'track');
 const estimate=r.getTravelState(),radius=r.objectRadius(ship);let lastHeading=[...ship.flight.basis[2]],lastGaze=[...r.cameraFrame.forward],maxHeading=0,maxCamera=0;
 for(let i=0;i<600;i++){
  step(r,1000/60);const heading=r.getFocusFrame(ship.id).frame[2],gaze=r.cameraFrame.forward;
  maxHeading=Math.max(maxHeading,angle(heading,lastHeading));maxCamera=Math.max(maxCamera,angle(gaze,lastGaze));lastHeading=[...heading];lastGaze=[...gaze];
  assert(r.validateFrameGeometry());const frame=r.getFocusFrame(ship.id);assert(angle(sub(frame.position,r.cameraFrame.observer),gaze)<1e-4,`Vehicle centered: ${angle(sub(frame.position,r.cameraFrame.observer),gaze)}`);near(frame.physicalRadius||frame.radius,radius,1e-10);
  if(i===200){const saved=snapshotRenderer(r);assert(saved.focusReferenceFrame);restoreRenderer(r,saved);assert(r.focusReferenceFrame?.basis);}
 }
 assert.equal(r.getTravelState().phase,'Arrived');assert.equal(r.driveId,null);assert.equal(r.objects.find(o=>o.id===ship.id).parentId,body.id);assert(maxHeading<.09,`Heading step ${maxHeading}`);assert(maxCamera<.035,`Camera step ${maxCamera}`);near(r.getTravelState().properElapsedSeconds,estimate.properSeconds);
 const frame=r.getFocusFrame(ship.id),target=r.getFocusFrame(body.id),offset=sub(target.position,r.cameraFrame.observer),gazeAngle=angle(offset,r.cameraFrame.forward),angularRadius=Math.asin(Math.min(1,target.radius/Math.hypot(...offset)));
 assert(gazeAngle<angularRadius,'Destination surface is behind the vehicle at arrival');assert(gazeAngle>.1,'Destination limb is not perfectly centered/hidden');
 const arrival=[...r.cameraFrame.forward];step(r,100);assert(angle(arrival,r.cameraFrame.forward)<1e-8,'Orbit insertion does not snap the camera');r.dispose();
}
// Panning overrides the automatic destination framing without restoring the
// rapidly turning craft frame. Clocks still finish the physical trip.
{
 const r=make(),ship=r.objects.find(o=>o.type==='shuttle'),body=r.objects.find(o=>o.name==='Moon');r.setFreeDrive(ship.id,true);r.startTravel(body.id);step(r,2000);r.rotate(.18,.04);step(r,100);assert(r.transfer.cameraReleased);const reference=JSON.stringify(r.focusReferenceFrame.basis);step(r,1000);assert.equal(JSON.stringify(r.focusReferenceFrame.basis),reference);r.state.paused=true;const elapsed=r.transfer.elapsed;step(r,3000);near(r.transfer.elapsed,elapsed);r.state.paused=false;r.cancelTravel();assert.equal(r.getTravelState().phase,'Cancelled');r.dispose();
}
console.log('PASS: smooth arc velocity/tangents, C2 playback, ten seconds, mobile/desktop vehicle framing, continuous heading and camera, physical scale, destination limb at arrival, snapshot persistence, pan override and pause/cancel.');
