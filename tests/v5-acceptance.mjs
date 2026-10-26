// Cross-scene acceptance checks against the real renderer and recorded uniforms.
// These do not emulate a browser or claim to measure GPU performance.
import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { SCENE_PRESETS } from '../dist/config.js';
import { objectRadiusMeters, REFERENCE_RG_METERS } from '../dist/objects.js';
import { fixture } from './render-fixture.mjs';
import { bridgeConformal } from '../dist/bridge-math.js';

const f=fixture(),r=new BlackHoleRenderer(f.canvas);
// Retain the absolute tolerance, with a few machine ulps for supergiant/AU dimensions.
const near=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<Math.max(tolerance,4*Number.EPSILON*Math.max(Math.abs(a),Math.abs(b))),`${a} differs from ${b}`);
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const finite=()=>{
 for(const record of f.uniforms.values())assert(record.args.flat(3).filter(value=>typeof value==='number').every(Number.isFinite));
 for(const vector of ['observer','forward','right','up'])assert(r.cameraFrame[vector].every(Number.isFinite));
 near(Math.hypot(...r.cameraFrame.forward),1);near(Math.hypot(...r.cameraFrame.right),1);near(Math.hypot(...r.cameraFrame.up),1);
 near(dot(r.cameraFrame.forward,r.cameraFrame.right),0);
};

// Loading every example in sequence must replace its predecessor atomically,
// preserve real dimensions, and produce a usable camera and finite uniforms.
for(const preset of SCENE_PRESETS){
 r.loadScene(preset.id);r.render();finite();
 assert.equal(r.state.objectScaleMode,'physical');
 const count=(preset.objects?.length||0)+(preset.patch.warp&&!preset.objects?.some(o=>o.type==='enterprise')?1:0);
 assert.equal(r.objects.length,count,`${preset.id} inherited an object from another scene`);
 for(const object of r.objects){
  const frame=r.objectFrames.find(frame=>frame.id===object.id);
  // In the Ellis isotropic chart, physical lengths are Ω times coordinate
  // lengths. The same SI-sized ship must shrink in coordinates near the throat.
  const spatialScale=r.state.bridge?bridgeConformal(Math.hypot(...frame.position),r.configCache.bridgeRadius):1;
  // The ocean illustration keeps its physical rocky core and adds a bounded
  // cap; ordinary shaped bodies retain their existing SI reference dimensions.
  near((frame.coreRadius||frame.radius)*spatialScale*REFERENCE_RG_METERS,(object.radiusMeters?object.radiusMeters*object.scale:objectRadiusMeters(object.type,object.scale))*Math.max(...(frame.waterCap?[1,1,1]:object.shapeAxes||[1,1,1])),1e-5);
  if(frame.waterCap)near(frame.radius/frame.coreRadius,Math.max(1,frame.waterCap.offsetRatio+frame.waterCap.radiusRatio),1e-10);
 }
 if(Number.isInteger(preset.camera?.focusIndex))assert.equal(r.focusId,r.objects[preset.camera.focusIndex].id);
 for(const time of [3,11,23]){r.time=time;r.render();finite();}
 if(r.focusId){
  const saved=structuredClone(r.savedOverview);r.releaseFocus(true);
  assert.equal(r.focusId,null);assert.equal(r.cameraFrame.inspectIndex,-1);assert.equal(r.cameraFrame.hideIndex,-1);
  assert.deepEqual(r.camera,saved.camera);assert.deepEqual(r.target,saved.target);assert.equal(r.state.viewMode,saved.viewMode);
 }
}

// Switching focused bodies keeps the original overview as the return target;
// deleting either focused body must not strand the user in its local camera.
r.loadScene('orbital-expedition');r.releaseFocus();
r.camera.lookYaw=.33;r.target.lookYaw=.33;r.setViewMode('look');r.render();
const original={camera:{...r.camera},target:{...r.target},viewMode:r.state.viewMode};
const [station,shuttle]=r.objects;r.focusObject(station.id,'track');r.focusObject(shuttle.id,'onboard');r.removeObject(shuttle.id);
assert.deepEqual(r.camera,original.camera);assert.deepEqual(r.target,original.target);assert.equal(r.state.viewMode,original.viewMode);assert.equal(r.focusId,null);
r.render();finite();

// The local field travels through a fixed grid. A change of spin-plane basis
// rotates the whole reference plane without attaching grid cells to the ship.
r.loadScene('warp-lab');r.update({primaryTilt:42,primaryAzimuth:71});r.time=8;r.render();finite();
const body=r.objectFrames.find(frame=>frame.id===r.warpObjectId),radius=body.radius*r.state.warpRadius,basis=r.configCache.primaryBasis;
const offset=f.uniforms.get('uWarpGridOffset').args,rotation=f.uniforms.get('uWarpGridRotation').args;
const modulo=value=>((value%4096)+4096)%4096;
near(offset[0],modulo(dot(body.position,basis[0])/radius));near(offset[1],modulo(dot(body.position,basis[2])/radius));
near(rotation[0],dot(body.frame[2],basis[0]));near(rotation[1],dot(body.frame[2],basis[2]));
assert(r.getState().warpTravelMeters>0);
const worldBefore=[...body.position],distanceBefore=r.getState().warpTravelMeters;
r.update({paused:true});r.frame(10000);r.frame(10100);
assert.deepEqual(r.objectFrames.find(frame=>frame.id===r.warpObjectId).position,worldBefore);near(r.getState().warpTravelMeters,distanceBefore);
r.update({paused:false,warpFactor:0});r.time+=10;r.render();near(r.getState().warpTravelMeters,distanceBefore);
r.update({warpFactor:10});r.time+=10;r.render();assert(r.getState().warpTravelMeters>distanceBefore);finite();
// Steering changes future displacement, never the already travelled position.
const beforeTurn=[...r.objectFrames.find(frame=>frame.id===r.warpObjectId).position],travelBeforeTurn=r.getState().warpTravelMeters;
r.updateObject(r.warpObjectId,{phase:r.objects.find(object=>object.id===r.warpObjectId).phase+Math.PI/2});r.render();
assert.deepEqual(r.objectFrames.find(frame=>frame.id===r.warpObjectId).position,beforeTurn);near(r.getState().warpTravelMeters,travelBeforeTurn);
r.time+=2;r.render();const turned=r.objectFrames.find(frame=>frame.id===r.warpObjectId),displacement=turned.position.map((value,i)=>value-beforeTurn[i]);
assert(Math.hypot(...displacement)>0);near(dot(displacement,turned.frame[2]),Math.hypot(...displacement),1e-16);
r.dispose();
console.log('PASS: all scene transitions and physical cameras, cross-object return restoration, fixed world-grid phase, paused/zero-warp travel, heading continuity, and finite Warp 10.');
