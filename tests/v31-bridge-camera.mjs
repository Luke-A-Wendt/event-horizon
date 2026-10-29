import assert from 'node:assert/strict';
import {bridgeJourney,bridgeConformal,HEIGHLINER_PASSAGE,BRIDGE_VEHICLE_CAMERA} from '../dist/bridge-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {bridgeFlatWorldSphere,BRIDGE_WORLD_LAYOUT} from '../dist/bridge-glsl.js';
import {fixture} from './render-fixture.mjs';

const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const journey=t=>bridgeJourney(t,1,'open-transit-close'),endpoint=HEIGHLINER_PASSAGE.endpoint/HEIGHLINER_PASSAGE.throatRadius;
assert.equal(journey(0).l,endpoint);assert.equal(journey(60).l,-endpoint);
assert.equal(journey(0).open,0);assert.equal(journey(60).open,0);
for(let t=0;t<60;t+=.125)assert(Math.abs(journey(t).l)<=endpoint+1e-12);
near(journey(7+Math.PI/.24).l,0);
assert(journey(4).open>0&&journey(4).open<1);
const eye=[0,0,.25],world=bridgeFlatWorldSphere(eye),farEye=1,farDistance=BRIDGE_WORLD_LAYOUT.distance-farEye;
near(world.radius/Math.hypot(...world.center.map((v,i)=>v-eye[i])),BRIDGE_WORLD_LAYOUT.radius/farDistance);


for(const Cls of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture(),canvas=Cls===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Cls===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Cls(canvas,{autoStart:false,bindControls:false});
 for(const scene of ['bridge','bridge-nebulae','bridge-earth-proxima']){
  r.loadScene(scene);assert.equal(r.state.viewMode,'orbit');assert.equal(r.focusMode,'track');
  r.cameraFrame.inspectCamera.forEach((v,i)=>near(v,[0,1.44,-4.32][i]));
  const eye=r.cameraFrame.inspectCamera,forward=r.cameraFrame.inspectForward;
  near(eye.reduce((sum,v,i)=>sum+v*forward[i],0),-BRIDGE_VEHICLE_CAMERA.focusDistance);
  r.rotate(.25,.1);assert.equal(r.focusMode,'track');assert(r.target.yaw!==BRIDGE_VEHICLE_CAMERA.yaw);
  r.resetCamera();r.cameraFrame.inspectCamera.forEach((v,i)=>near(v,[0,1.44,-4.32][i]));
 }
 r.loadScene('bridge-blackhole');r.setBridgeTraveler('shuttle');
 assert.equal(r.focusId,r.bridgeObjectId);assert.equal(r.focusMode,'track');
 r.cameraFrame.inspectCamera.forEach((v,i)=>near(v,[0,1.44,-4.32][i]));
 r.loadScene('bridge-planets');assert.equal(r.focusMode,'track');
 const ship=r.objects.find(o=>o.id===r.bridgeObjectId),unit=r.objectRadius(ship),throat=r.configCache.bridgeRadius;
 near(throat/unit,HEIGHLINER_PASSAGE.hullRadius*2);
 for(const time of [0,60]){
  const stage=bridgeJourney(time,throat,'open-transit-close'),scale=unit/bridgeConformal(stage.r,throat),halfHull=HEIGHLINER_PASSAGE.halfLength*scale;
  assert(time===0?stage.r-halfHull>throat/2:stage.r+halfHull<throat/2,'Entire hull clears the mouth before opening/closing');
  const eye=Math.hypot(1.44*scale,stage.r+4.32*scale);
  assert(time===0?eye>throat/2:eye<throat/2,'Behind-vehicle orbit eye is in the traveler’s end region');
 }
 r.render?.();if(Cls===BlackHoleRenderer){assert.equal(f.uniforms.get('uBridgeBubble').args[3],0);assert.equal(f.uniforms.get('uWarpStrength').args[0],0);}
 for(const time of [0,4,7,20,34,40]){r.time=time;r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());}
 r.dispose();
}
console.log('PASS: short symmetric Heighliner crossing; consistent behind-vehicle orbit camera, reset and traveler replacement on GPU/CPU.');
