import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {integratePlanar,speedForWarp} from '../dist/flight-dynamics.js';
import {bridgeProperRadius,bridgeConformal} from '../dist/bridge-math.js';
import {SCENE_PRESETS,SCENE_PROGRESSIONS} from '../dist/config.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {installRenderWorker} from '../dist/render-worker.js';
const close=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} != ${b}`),vec=(a,b)=>a.forEach((v,i)=>close(v,b[i]));
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
assert.equal(SCENE_PRESETS.length,45);assert.deepEqual(SCENE_PRESETS.map(p=>p.id),Object.values(SCENE_PROGRESSIONS).flat());
for(const preset of SCENE_PRESETS){r.loadScene(preset.id);assert.equal(r.state.annotations,preset.category==='Geometry');assert.equal(r.state.metrics,false);assert(r.state.paused);parseScene(serializeScene(r));}
for(const preset of SCENE_PRESETS.filter(p=>p.category==='Warp drive')){r.loadScene(preset.id);close(r.camera.yaw,-Math.PI/2);assert.equal(r.focusMode,'track');assert.equal(r.state.warpFactor,4);}
for(const scene of ['nasa-shuttle','warp-cruise'])for(const mode of ['track','onboard','chase']){
 r.loadScene(scene);const id=r.objects.find(o=>['enterprise','shuttle'].includes(o.type)).id;r.focusTarget(id,mode);r.rotate(.3,.16);r.camera={...r.target};r.updateCameraFrame();const before=structuredClone(r.cameraFrame),camera={...r.camera};
 assert(r.setFreeDrive(id,true));assert.equal(r.focusMode,mode);assert.deepEqual(r.camera,camera);r.fillObjects();r.updateCameraFrame();vec(r.cameraFrame.forward,before.forward);vec(r.cameraFrame.observer,before.observer);
 r.setFreeDrive(id,false);assert.equal(r.focusMode,mode);
 if(mode!=='track'){r.focusTarget(id,mode);r.camera.lookYaw=r.target.lookYaw=.43;r.camera.lookPitch=r.target.lookPitch=.2;r.updateCameraFrame();const heading=[...r.cameraFrame.forward];r.zoom(1.01);assert.equal(r.focusMode,'track');vec(r.cameraFrame.forward,heading);const d=r.target.focusDistance;r.zoom(1.1);close(r.target.focusDistance,d*1.1);}
}
for(const warp of [true,false]){
 const flight={position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],speed:warp?speedForWarp(4):300,angularVelocity:.3,brakeSpeed:true,brakeInitialSpeed:warp?speedForWarp(4):300,brakeTurn:true};let v=flight.speed,w=flight.angularVelocity;
 for(let i=0;i<400;i++){integratePlanar(flight,.01,{}, {warp});assert(flight.speed<=v);assert(flight.angularVelocity<=w);assert(flight.position.every(Number.isFinite));v=flight.speed;w=flight.angularVelocity;}assert.equal(flight.speed,warp?0:300);assert.equal(flight.angularVelocity,0);
}
r.loadScene('bridge-planets');assert.equal(r.objects[0].type,'enterprise');const id=r.bridgeObjectId;assert(r.setFreeDrive(id,true));r.update({paused:false});r.lastTime=1000;const b=r.configCache.bridgeRadius,start=[...r.objects[0].drivePosition];
let lastL=Infinity;for(let i=1;i<=2200;i++){r.advanceSimulation(1000+i*16.667);r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());const p=r.getFocusFrame(id),l=bridgeProperRadius(Math.hypot(...p.position),b);assert(l<=lastL+1e-9);lastL=l;close(p.radius*bridgeConformal(Math.hypot(...p.position),b),p.physicalRadius,1e-15);}
assert(lastL<0,'Crossed to the other asymptotic region');const view=[...r.cameraFrame.forward];r.reverseFlight();r.updateCameraFrame();vec(view,r.cameraFrame.forward);
for(let i=2201;i<=4400;i++){r.advanceSimulation(1000+i*16.667);r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());}
assert(bridgeProperRadius(Math.hypot(...r.getFocusFrame(id).position),b)>0,'Returned through the throat');r.brakeFlight('speed');r.brakeFlight('turn');assert(parseScene(serializeScene(r)).objects.find(o=>o.id===id).flight.brakeSpeed);
r.loadScene('rainbow-disc');r.render();assert.equal(r.state.diskPalette,'rainbow');assert.equal(f.uniforms.get('uSceneOptions').args[2],2);r.dispose();
// Actual worker subclass: capture while the draw buffer is fresh, not after a later GPU fence.
const wf=fixture();let fresh=false,captures=0;wf.canvas.transferToImageBitmap=()=>{assert(fresh,'WebGL frame was captured after buffer discard');captures++;return{width:20,height:20,close(){}};};
class TestGpu extends BlackHoleRenderer{constructor(canvas,opts){super(canvas,{...opts,autoStart:false,bindControls:false});}render(){this.fillHoles();this.fillObjects();this.updateCameraFrame();this.setDrawUniforms();fresh=true;this.gpuFence={};return true;}gpuAvailable(){this.gpuFence=null;return true;}}
const messages=[],worker=installRenderWorker({postMessage:m=>messages.push(m),addEventListener(){}},{GpuRenderer:TestGpu});await worker.handle({type:'init',canvas:wf.canvas,cpu:false,viewport:{width:900,height:650,dpr:1},signature:'diagnostic'});worker.renderer.update({annotations:true});worker.renderer.render();fresh=false;assert.equal(captures,1);assert(messages.some(m=>m.type==='bitmap-frame'));worker.renderer.gpuAvailable(100);assert.equal(captures,1,'Fence completion cannot capture a cleared second bitmap');await worker.handle({type:'dispose'});
const metric=fs.readFileSync(new URL('../dist/metric-glsl.js',import.meta.url),'utf8');assert(metric.includes('velocity*radius*2.0'));assert(metric.includes('metricSphereRim(a,b,center,radius,width)'));assert(!metric.includes('radiusVector'));
console.log('PASS: v17 camera/drive pose continuity, Enterprise braking and inertial Shuttle coasting, bidirectional conformal wormhole traversal, rainbow uniforms, exact-version saves, immediate worker frame capture and lensed metric strokes.');
