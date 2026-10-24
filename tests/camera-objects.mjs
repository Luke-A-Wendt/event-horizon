import assert from 'node:assert/strict';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { SCENE_PRESETS } from '../dist/config.js';
import { OBJECT_DIMENSIONS, REFERENCE_RG_METERS, objectRadiusMeters } from '../dist/objects.js';
const f=fixture(),r=new BlackHoleRenderer(f.canvas),near=(a,b,e=1e-9)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
r.update({paused:true,objectScaleMode:'illustrative'});assert.equal(r.state.objectScaleMode,'physical','Physical dimensions are mandatory even for legacy state');
const ship=r.addObject('enterprise',14,.8,1),shuttle=r.addObject('shuttle',10,.2,1);
assert.notEqual(ship.id,shuttle.id);r.time=7;r.render();
const phase=r.getObjects().find(o=>o.id===ship.id).phase;
r.updateObject(ship.id,{radius:19,height:2,scale:1.4});
near(r.getObjects().find(o=>o.id===ship.id).phase,phase);r.updateObject(ship.id,{phase:1.25});near(r.getObjects().find(o=>o.id===ship.id).phase,1.25);
r.time=9;r.render();assert.notEqual(r.getObjects().find(o=>o.id===ship.id).phase,1.25);
assert.equal(r.selectObject('missing'),false);assert.equal(r.updateObject('missing',{radius:5}),false);assert.equal(r.removeObject('missing'),false);
r.updateObject(ship.id,{scale:1});r.update({objectScaleMode:'physical',planet:true,tidalStar:true,starRadius:1,planetRadius:1});r.render();
const entry=r.objectFrames.find(o=>o.id===ship.id),small=r.objectFrames.find(o=>o.id===shuttle.id);
near(entry.radius*REFERENCE_RG_METERS,objectRadiusMeters('enterprise'),1e-9);
near(small.radius*REFERENCE_RG_METERS,objectRadiusMeters('shuttle'),1e-9);
near(r.objectFrames[0].radius*REFERENCE_RG_METERS,6371000,1e-5);
assert(entry.radius<1e-6,'A physical spacecraft must not acquire a visualization-size floor');
assert.equal(r.getObjects().find(o=>o.id===ship.id).lengthMeters,OBJECT_DIMENSIONS.enterprise.lengthMeters);
const physicalRadius=entry.radius;r.update({mass:8});r.render();near(r.objectFrames.find(o=>o.id===ship.id).radius,physicalRadius,1e-15);
const overview={camera:{...r.camera},target:{...r.target},viewMode:r.state.viewMode};
r.focusObject(ship.id,'track');r.render();
assert.equal(r.getState().focusId,ship.id);assert.equal(r.getState().focusMode,'track');assert.equal(r.cameraFrame.inspectIndex,r.objectFrames.find(o=>o.id===ship.id).index);
near(Math.hypot(...r.cameraFrame.inspectCamera),6);
const before=[...r.cameraFrame.observer];r.time+=1;r.render();assert(Math.hypot(...r.cameraFrame.observer.map((x,i)=>x-before[i]))>.01,'Tracked observer must travel with its target');
near(Math.hypot(...r.cameraFrame.forward),1);near(Math.hypot(...r.cameraFrame.right),1);near(r.cameraFrame.forward.reduce((x,v,i)=>x+v*r.cameraFrame.right[i],0),0);
const localBefore=r.target.focusDistance;r.zoom(.5);near(r.target.focusDistance,localBefore*.5);r.zoom(1e-20);near(r.target.focusDistance,1.15);r.zoom(1e20);near(r.target.focusDistance,160);
r.focusObject(ship.id,'onboard');r.render();assert.equal(r.cameraFrame.inspectIndex,-1);assert.equal(r.cameraFrame.hideIndex,r.objectFrames.find(o=>o.id===ship.id).index);assert.equal(r.state.viewMode,'look');
const eye=[...r.cameraFrame.observer];r.look('outward');r.render();for(let i=0;i<3;i++)near(r.cameraFrame.observer[i],eye[i]);
r.rotate(.2,.1);const yaw=r.target.lookYaw;r.rotate(.2,.1);near(r.target.lookYaw,yaw+.2);
near(r.getState().cameraDistanceMeters,Math.hypot(0,.22,.35)*physicalRadius*REFERENCE_RG_METERS,1e-8);
r.releaseFocus();assert.equal(r.focusId,null);assert.deepEqual(r.camera,overview.camera);assert.deepEqual(r.target,overview.target);assert.equal(r.state.viewMode,overview.viewMode);assert.equal(r.cameraFrame.inspectIndex,-1);near(Math.hypot(...r.cameraFrame.observer),overview.camera.distance);r.focusObject(ship.id,'track');
r.removeObject(ship.id);assert.equal(r.focusId,null);assert.equal(r.getObjects().length,1);assert.equal(r.getState().selectedId,shuttle.id);
r.clearObjects();assert.equal(r.getObjects().length,0);assert.equal(r.focusId,null);
for(const mode of ['isolated','orbit','excursion']){
 r.loadWarpScenario(mode);r.render();const id=r.warpObjectId;assert.equal(r.objects.length,1);assert.equal(r.objects[0].type,'enterprise');assert.equal(r.state.blackHole,mode!=='isolated');
 assert.equal(r.state.warp,true);assert.equal(r.getState().warpObjectId,id);assert.equal(r.getObjects()[0].id,id);
 if(mode==='isolated'){near(Math.hypot(...r.objectFrames[0].position),0);assert.equal(r.focusId,id);const initial=[...r.cameraFrame.observer],local=[...r.cameraFrame.inspectCamera];r.time=4;r.render();assert(r.getState().warpTravelMeters>0);assert(r.getState().warpSpeedMetersPerSecond>0);assert(Math.hypot(...r.objectFrames[0].position)>0);assert.notDeepEqual(r.cameraFrame.observer,initial);assert.deepEqual(r.cameraFrame.inspectCamera,local);const offset=f.uniforms.get('uWarpGridOffset').args;assert(offset.some(v=>v>0));const rotation=f.uniforms.get('uWarpGridRotation').args;near(Math.hypot(...rotation),1);const travelled=r.getState().warpTravelMeters;r.update({warpFactor:0});r.time=8;r.render();near(r.getState().warpTravelMeters,travelled);r.update({warpFactor:5});}
 if(mode!=='orbit'){r.time=7;const p=r.getObjects()[0].phase;r.updateObject(id,{scale:2});near(r.getObjects()[0].phase,p);}
 if(mode==='excursion')for(let t=0;t<45;t+=.5){r.time=t;r.render();const body=r.objectFrames.find(o=>o.id===id),distance=Math.hypot(...body.position);assert(distance-body.radius*r.state.warpRadius>r.configCache.horizon[0],'Entire prescribed warp bubble must remain outside the primary horizon');}
 r.update({warpFactor:10});r.render();assert.equal(f.uniforms.get('uWarpStrength').args[0],3);assert(f.uniforms.get('uWarpObserver').args[0].every(Number.isFinite));r.clearObjects();r.update({grid:true});assert.equal(r.objects.length,0);assert.equal(r.state.warp,false);
}
r.loadWarpScenario('excursion');r.update({objectScaleMode:'illustrative'});r.focusObject(r.warpObjectId,'track');
for(const time of [9,29]){r.time=time;r.render();const body=r.objectFrames.find(o=>o.id===r.warpObjectId),radial=[Math.cos(body.angle),0,Math.sin(body.angle)],alignment=body.frame[2].reduce((sum,v,i)=>sum+v*radial[i],0);assert(time===9?alignment<-.99:alignment>.99,'Ship and warp direction must follow radial inward/outward travel');}
r.time=Math.PI/.16;
for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const distance of [1.15,3,6,20]){r.camera.yaw=yaw;r.camera.pitch=0;r.camera.focusDistance=distance;r.render();assert(Math.hypot(...r.cameraFrame.observer)>=r.configCache.horizon[0]*1.0129,'A tracked camera must remain outside the horizon');}
for(const preset of SCENE_PRESETS){const state=r.loadScene(preset.id);r.render();assert.equal(state.objectScaleMode,'physical');if(preset.objects)assert.equal(r.objects.length,preset.objects.length);if(Number.isInteger(preset.camera?.focusIndex))assert.equal(r.focusId,r.objects[preset.camera.focusIndex].id);}
r.setQuality('ultra');r.render();assert.equal(r.steps,768);assert.equal(f.uniforms.get('uDetail').args[0],3);assert(r.canvas.width*r.canvas.height<=16000000);
r.dispose();
console.log('PASS: physical-only dimensions, individual CRUD, phase continuity, full overview restoration, tracking/onboard precision, moving warp grid/ship, preset object cameras, Ultra detail, finitewarp10 and exterior bubble safety.');
