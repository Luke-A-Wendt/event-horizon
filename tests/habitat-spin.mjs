import assert from 'node:assert/strict';
import {habitatSpin} from '../dist/habitat-spin.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {fixture} from './render-fixture.mjs';
const close=(a,b,e=1e-10)=>assert(Math.abs(a-b)<e,`${a} vs ${b}`);
for(const scale of [.25,1,4]){
 const v=habitatSpin(scale);
 close(v.floorRadiusMeters,1000*scale);close(v.floorRadiusMeters*v.angularSpeedRadPerSecond**2,9.80665);
 close(v.periodSeconds*v.rpm,60);close(v.angularSpeedRadPerSecond*v.periodSeconds,2*Math.PI);
}
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});
const r=make(),worker=make();
try{
 r.loadScene('orbital-expedition');const id=r.focusId,frame=()=>r.getFocusFrame(id);
 assert.equal(frame().type,'habitat');const model=r.getHabitatSpin(id);
 close(model.rpm,.9456528,1e-6);close(r.getObjectClock(id).crewLoadG,0);
 const start=frame().headingAngle,view=[...r.cameraFrame.forward];
 restoreRenderer(worker,snapshotRenderer(r));
 const elapsed=model.periodSeconds/4;
 const chartSec=elapsed*r.getObjectClock(id).rateFactor;
 const dt=chartSec*r.simulationTimeScale();
 r.time+=dt;r.advanceClocks(chartSec,dt);r.fillObjects();r.updateCameraFrame();
 close(r.getObjectClock(id).properSeconds,elapsed);close(frame().headingAngle,start-Math.PI/2);
 for(let j=0;j<3;j++)close(r.cameraFrame.forward[j],view[j]); // camera holds as wheel turns
 close(r.headingData[2*frame().index],Math.cos(frame().headingAngle),1e-6);
 const packet=snapshotRenderer(r,{includeObjects:false});assert(!packet.objects);
 restoreRenderer(worker,packet);close(worker.getFocusFrame(id).headingAngle,frame().headingAngle);
 // Repainting an unchanged paused time never moves the spokes.
 const held=frame().headingAngle;r.fillObjects();r.updateCameraFrame();close(frame().headingAngle,held);
 console.log('PASS: 1g rim at all scales; geodesic hub, proper-time spin, stationary tracking camera and worker agreement.');
}finally{r.dispose();worker.dispose();}
