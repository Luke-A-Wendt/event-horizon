const SHUTTLE_COCKPIT_EYE=[0,.28,.65];
import assert from 'node:assert/strict';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { snapshotRenderer, restoreRenderer } from '../dist/render-state.js';
import { REFERENCE_RG_METERS, objectRadiusMeters } from '../dist/objects.js';
import { bridgeConformal } from '../dist/bridge-math.js';

const near=(actual,expected,tolerance=1e-8)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const vectorNear=(actual,expected,tolerance=1e-8)=>actual.forEach((x,i)=>near(x,expected[i],tolerance));
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const meters=position=>position.map(x=>x*REFERENCE_RG_METERS);
const fresh=()=>{const f=fixture();return {f,r:new BlackHoleRenderer(f.canvas)};};
const refresh=r=>{r.fillHoles();r.fillObjects();r.updateCameraFrame();};
const frame=(r,id)=>r.objectFrames.find(o=>o.id===id);
const relativeMeters=(r,childId,parentId)=>{
 const child=frame(r,childId),parent=frame(r,parentId),delta=meters(child.position.map((x,i)=>x-parent.position[i]));
 return parent.frame.map(axis=>dot(axis,delta));
};

// Empty-space navigation must stay in human-scale units on its first wheel
// event, and a later mass-control change must not resize local placement.
{
 const {r}=fresh();r.loadScene('empty-space');
 near(r.camera.distance*REFERENCE_RG_METERS,1000);
 r.zoom(1.1);near(r.target.distance*REFERENCE_RG_METERS,1100);
 const ship=r.addObject('shuttle');r.updateObject(ship.id,{x:120,y:30,z:-40,phase:.8});
 const person=r.addObject('astronaut');r.updateObject(person.id,{x:11,y:8,z:-12,referenceId:ship.id});
 r.time=20;refresh(r);vectorNear(meters(frame(r,ship.id).position),[120,30,-40]);
 vectorNear(relativeMeters(r,person.id,ship.id),[11,8,-12]);
 const initial=meters(frame(r,person.id).position);r.time=80;r.update({mass:70});refresh(r);
 vectorNear(meters(frame(r,person.id).position),initial);
 assert.equal(r.getObjectContext().kind,'local');
 // Removing a parent now cascades through its nested objects and releases a
 // camera riding a deleted descendant, instead of retaining an orphan.
 r.focusTarget(person.id,'onboard');
 r.removeObject(ship.id);refresh(r);assert.equal(frame(r,person.id),undefined);assert.equal(frame(r,ship.id),undefined);
 assert.equal(r.focusId,null);assert(r.cameraFrame.observer.every(Number.isFinite));
 r.dispose();
}

// A local companion moves with a warp ship. Switching the bubble to another
// Enterprise leaves the first ship where it was, with no implicit new orbit.
{
 const {r}=fresh();r.loadScene('empty-space');const first=r.exploreWarp();
 const passenger=r.addObject('astronaut');r.updateObject(passenger.id,{x:10,y:2,z:-20,referenceId:first.id});
 r.time=12;refresh(r);vectorNear(relativeMeters(r,passenger.id,first.id),[10,2,-20]);
 const firstPosition=meters(frame(r,first.id).position);
 const second=r.addObject('enterprise');r.setObjectWarp(second.id,true);r.time=30;refresh(r);
 vectorNear(meters(frame(r,first.id).position),firstPosition);
 vectorNear(relativeMeters(r,passenger.id,first.id),[10,2,-20]);
 assert.equal(r.objects.filter(o=>o.warpEnabled).length,1);
 assert.equal(r.warpObjectId,second.id);
 assert(r.getSceneTargets().some(o=>o.id===second.id));
 const before=meters(frame(r,second.id).position);r.setObjectWarp(second.id,false);r.time=50;refresh(r);
 vectorNear(meters(frame(r,second.id).position),before);assert.equal(r.state.warp,false);
 r.dispose();
}

// Bridge replacement preserves logical identity through state transport and
// photo freezing, while adapting actual dimensions and the onboard frame.
{
 const {r}=fresh();r.loadScene('warp-lab');const original=r.warpObjectId;
 const companion=r.addObject('astronaut');r.updateObject(companion.id,{referenceId:original,x:3,y:2,z:1});
 r.update({bridge:true});assert.equal(r.bridgeObjectId,original);assert.equal(r.state.warp,false);
 assert(r.objects.every(o=>!o.warpEnabled));r.time=9;refresh(r);
 r.focusTarget(original,'onboard');const clock=r.bridgeTime;
 r.setBridgeTraveler('shuttle');assert.equal(r.bridgeObjectId,original);assert.equal(r.focusId,original);near(r.bridgeTime,clock);
 near(r.configCache.bridgeRadius*REFERENCE_RG_METERS,objectRadiusMeters('shuttle')*r.state.bridgeRadius);
 vectorNear(r.cameraFrame.inspectCamera,SHUTTLE_COCKPIT_EYE);
 const ship=frame(r,original),factor=bridgeConformal(Math.hypot(...ship.position),r.configCache.bridgeRadius);
 near(ship.radius*factor*REFERENCE_RG_METERS,objectRadiusMeters('shuttle'));
 // A retained local passenger uses the same local proper-length conversion,
 // including after switching the traveler's physical model and throat size.
 vectorNear(relativeMeters(r,companion.id,original).map(x=>x*factor),[3,2,1]);
 const person=frame(r,companion.id),personFactor=bridgeConformal(Math.hypot(...person.position),r.configCache.bridgeRadius);
 near(person.radius*personFactor*REFERENCE_RG_METERS,objectRadiusMeters('astronaut'));
 const saved=snapshotRenderer(r),before=meters(r.cameraFrame.observer);
 const {r:copy}=fresh();restoreRenderer(copy,saved);
 assert.equal(copy.focusId,original);assert.equal(copy.getObjects()[0].type,'shuttle');
 vectorNear(meters(copy.cameraFrame.observer),before);near(copy.bridgeTime,clock);
 const frozen=copy.beginPhotoCapture();assert(frozen);assert.equal(copy.photoActive,true);
 near(copy.time,saved.time);near(copy.bridgeTime,clock);
 copy.endPhotoCapture();assert.equal(copy.photoActive,false);assert.equal(copy.focusMode,'onboard');
 vectorNear(meters(copy.cameraFrame.observer),before);
 r.dispose();copy.dispose();
}

console.log('PASS: meter-scale navigation, local reference deletion, moving warp companions, bubble ownership, bridge traveler identity, cockpit frame, and transport/photo continuity.');
