import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {RenderHost} from '../dist/render-host.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const near=(a,b,t=1e-10)=>assert(Math.abs(a-b)<t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
class LogicHost extends RenderHost{startBackend(){}queueSnapshot(){}resize(){}}
function create(Class){const f=fixture();let canvas=f.canvas;if(Class===CpuRenderer){canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;}return new Class(canvas,{autoStart:false,bindControls:false});}
let savedSnapshot;
for(const Class of [BlackHoleRenderer,CpuRenderer,LogicHost]){
 const r=create(Class);r.loadScene('nasa-shuttle');const ship=r.objects.find(o=>o.type==='shuttle'),station=r.addObject('iss',20,1),astronaut=r.addObject('astronaut',7,2);r.fillHoles();r.fillObjects();
 for(const id of [ship.id,station.id,astronaut.id])assert.equal(r.getObjectClock(id).lagSeconds,0);
 r.state.paused=false;r.state.speed=1;r.lastTime=1000;
 for(let i=1;i<=10;i++)r.advanceSimulation(1000+i*100);
 for(const id of [ship.id,station.id,astronaut.id]){const reading=r.getObjectClock(id);assert(reading.lagSeconds>0);near(reading.coordinateSeconds,18*REFERENCE_RG_METERS/299792458);assert(reading.properSeconds>0);}
 const started=structuredClone(ship.clock);assert(r.setFreeDrive(ship.id,true));assert.deepEqual(ship.clock,started,'Beginning Drive preserves the lifetime clock');
 r.setFlightPower(10);r.advanceSimulation(2100);near(ship.clock.coordinateSeconds-started.coordinateSeconds,.1);assert(ship.clock.lagSeconds>started.lagSeconds);
 const during=structuredClone(ship.clock);r.resetFlight();assert.deepEqual(ship.clock,during);r.resetCamera();assert.deepEqual(ship.clock,during);
 r.state.paused=true;r.advanceSimulation(2200);assert.deepEqual(ship.clock,during,'Pause does not accrue any coordinate or local time');
 r.setFreeDrive(ship.id,false);assert.deepEqual(ship.clock,during);assert(r.setFreeDrive(ship.id,true));assert.deepEqual(ship.clock,during);assert.equal(r.getFlightState().timeLagSeconds,during.lagSeconds);
 const snapshot=snapshotRenderer(r),yaml=serializeScene(r),parsed=parseScene(yaml);assert.deepEqual(parsed.objects.find(o=>o.id===ship.id).clock,ship.clock);const copy=create(BlackHoleRenderer);restoreRenderer(copy,parsed);assert.deepEqual(copy.objects.find(o=>o.id===ship.id).clock,ship.clock);assert.equal(copy.getFlightState().timeLagSeconds,ship.clock.lagSeconds);copy.dispose();savedSnapshot=snapshot;
 const sourceBefore=JSON.stringify(r.objects);r.getObjectClock(ship.id);r.getObjectClock(station.id);assert.equal(JSON.stringify(r.objects),sourceBefore,'Reading a clock never mutates persisted object state');
 r.setFreeDrive(ship.id,false);r.removeObject(station.id);assert.equal(r.getObjectClock(station.id),null);const replacement=r.addObject('iss',20,1);assert.notEqual(replacement.id,station.id);assert.equal(r.getObjectClock(replacement.id).lagSeconds,0);
 r.loadScene('radiant-descent');const falling=r.objects.find(o=>o.type==='astronaut');r.state.paused=false;r.state.speed=1;r.lastTime=3000;for(let i=1;i<=100;i++)r.advanceSimulation(3000+i*100);const horizon=r.getObjectClock(falling.id);assert(horizon.idealizedInfall);assert(horizon.horizonLimit);assert.equal(horizon.rateFactor,Infinity);assert(Number.isFinite(horizon.lagSeconds));assert(horizon.lagSeconds>0);assert(Object.values(falling.clock).every(Number.isFinite));
 r.loadScene('horizon-watch');const observer=r.objects.find(o=>o.type==='astronaut');assert(observer);const exterior=r.getObjectClock(observer.id);assert(!exterior.horizonLimit,'A deliberately exterior horizon-watch camera is not mislabeled as exactly on the horizon');assert(Number.isFinite(exterior.rateFactor));
 r.loadScene('warp-lab');const enterprise=r.objects.find(o=>o.type==='enterprise');assert.equal(r.getObjectClock(enterprise.id),null);assert(!enterprise.clock);
 r.loadScene('solar-system');const solarShip=r.objects.find(o=>o.type==='shuttle');r.state.paused=false;r.lastTime=15000;r.advanceSimulation(15100);assert(solarShip.clock.lagSeconds>0);r.loadScene('solar-system');assert.equal(r.objects.find(o=>o.type==='shuttle').clock.lagSeconds,0,'Cached presets create fresh lifetime clocks');
 r.dispose();
}

// The actual render-worker wrapper applies authoritative UI snapshots. Its
// repeated draw frames must never advance the already-integrated clocks again.
class WorkerGpu extends BlackHoleRenderer{constructor(canvas,options){super(canvas,{...options,autoStart:false,bindControls:false});}}
const messages=[],worker=installRenderWorker({postMessage:message=>messages.push(message),addEventListener(){}},{GpuRenderer:WorkerGpu});
await worker.handle({type:'init',canvas:fixture().canvas,cpu:false,viewport:{width:900,height:650,dpr:1},signature:'clock-test',snapshot:savedSnapshot});
const before=JSON.stringify(worker.renderer.objects.map(o=>o.clock));for(let i=0;i<30;i++)worker.renderer.advanceSimulation(1000+i*100);assert.equal(JSON.stringify(worker.renderer.objects.map(o=>o.clock)),before);assert(!messages.some(m=>m.type==='error'));await worker.handle({type:'dispose'});
console.log('PASS: GPU/CPU/UI-host creation→orbit→Drive→pause→resume lifetime clocks, view/reset continuity, source-clock units, deletion/recreation, YAML/snapshot retention, infall horizon ratio, exterior camera distinction, fresh cached presets and no render-worker double integration.');
