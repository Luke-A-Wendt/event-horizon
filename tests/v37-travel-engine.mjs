import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {RenderHost} from '../dist/render-host.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
class LogicHost extends RenderHost{startBackend(){}queueSnapshot(){}resize(){}}
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<=e*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function make(Class=BlackHoleRenderer){const f=fixture({width:390,height:720}),canvas=Class===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Class===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;const r=new Class(canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');r.sceneLoad?.complete(r.sceneLoad.revision);r.lastTime=1000;return r;}
function step(r,ms){r.advanceSimulation(r.lastTime+ms);r.fillHoles();r.fillObjects();r.updateCameraFrame();}
for(const Class of [BlackHoleRenderer,CpuRenderer,LogicHost]){
 const r=make(Class),ship=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.setFreeDrive(ship.id,true);r.focusTarget(ship.id,'track');
 const targetList=r.getTravelTargets();assert.strictEqual(targetList,r.getTravelTargets(),'Eligibility is cached');assert(!targetList.some(o=>o.id===ship.id||['space','disk','jets','ring','belt','anomaly'].includes(o.type)));assert(targetList.some(o=>o.id===moon.id));
 const estimate=r.previewTravel(moon.id);assert(!estimate.error);assert(estimate.properSeconds>1000);assert(estimate.coordinateSeconds>=estimate.properSeconds);assert(estimate.orbitRadiusMeters>=2*moon.radiusMeters);
 const revision=r.sceneLoad?.revision;assert(r.startTravel(moon.id));const camera={...r.camera};step(r,500);const beforePause=r.getTravelState().progress;r.state.paused=true;step(r,2000);assert.equal(r.getTravelState().progress,beforePause);r.state.paused=false;
 const save=parseScene(serializeScene(r));assert.equal(save.transfer,null);assert.equal(save.driveId,ship.id);assert(save.objects.find(o=>o.id===ship.id).clock.lagSeconds>0);
 for(let i=0;i<19;i++)step(r,500);assert.equal(r.getTravelState().phase,'Arrived');assert.equal(r.driveId,null);assert.equal(ship.parentId,moon.id);near(ship.orbitMeters,estimate.orbitRadiusMeters);assert.equal(r.focusId,ship.id);near(r.camera.yaw,camera.yaw);assert.equal(r.sceneLoad?.revision,revision,'Travel never stages a load');
 const frame=r.getFocusFrame(ship.id),parent=r.getFocusFrame(moon.id);near(Math.hypot(...frame.position.map((v,i)=>v-parent.position[i]))*REFERENCE_RG_METERS,ship.orbitMeters);assert(ship.clock.lagSeconds>0);near(ship.clock.properSeconds,estimate.properSeconds,1e-8);near(ship.clock.coordinateSeconds,estimate.coordinateSeconds,1e-5);
 restoreRenderer(r,save);assert.equal(r.transfer,null);assert.equal(r.driveId,ship.id);assert(r.getFocusFrame(ship.id));r.dispose();
}
// The same ten wall seconds at 2 and 20 FPS; the ordinary simulation cap is independent.
const results=[];for(const interval of [50,500]){const r=make(),ship=r.objects.find(o=>o.type==='enterprise'),earth=r.objects.find(o=>o.name==='Earth');r.setFreeDrive(ship.id,true);assert(r.startTravel(earth.id));for(let i=0;i<10000/interval;i++)step(r,interval);assert.equal(r.getTravelState().phase,'Arrived');assert.equal(ship.parentId,earth.id);assert(!ship.clock);assert.equal(r.state.warp,false);results.push(r.getTravelState().properElapsedSeconds);r.dispose();}near(...results);
{
 const r=make(),ship=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.setFreeDrive(ship.id,true);r.state.paused=false;r.setFlightPower(5);step(r,100);const originalSpeed=ship.flight.speed;assert(r.brakeFlight('speed'));step(r,100);assert(ship.flight.thrust>0&&ship.flight.thrust<5);assert(ship.flight.speed>originalSpeed,'Shutting engines down does not erase velocity');assert.doesNotThrow(()=>serializeScene(r));for(let i=0;i<12;i++)step(r,100);assert.equal(ship.flight.thrust,0);const coasting=ship.flight.speed;step(r,100);near(ship.flight.speed,coasting);
 r.setFlightPower(4);r.brakeFlight('speed');step(r,100);r.setFlightPower(2);assert.equal(ship.flight.thrust,2);assert(!ship.flight.brakeSpeed,'Manual thrust overrides the ramp');
 assert(r.startTravel(moon.id));step(r,500);const position=[...ship.flight.position];assert(r.cancelTravel());assert.deepEqual(ship.flight.position,position);assert.equal(r.driveId,ship.id);assert(r.startTravel(moon.id));r.removeObject(moon.id);step(r,100);assert(!r.getTravelState().active);assert.equal(r.driveId,ship.id);r.dispose();
}
{
 const r=make();r.loadScene('bridge');const ship=r.objects.find(o=>o.type==='enterprise');r.setFreeDrive(ship.id,true);assert.deepEqual(r.getTravelTargets(),[],'Wormhole automatic routes remain separate');r.dispose();
}
console.log('PASS: GPU/CPU/host travel eligibility, 1g clock accounting, smooth insertion/reparenting without loads, 10 wall-second transfers at 2–20 FPS, paused and saved transit, cancellation/deletion, Enterprise exemption, and gradual engine shutdown.');
