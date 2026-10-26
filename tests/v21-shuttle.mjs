import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {integratePlanar,shuttleThrustSetting,FLIGHT_STANDARD_GRAVITY,speedForWarp,warpForSpeed} from '../dist/flight-dynamics.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene,prepareSceneFile} from '../dist/scene-file.js';
import {installSceneFileWorker} from '../dist/scene-file-worker.js';
import {installRenderWorker} from '../dist/render-worker.js';

const near=(a,b,t=1e-10)=>assert(Math.abs(a-b)<=t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`),vec=(a,b,t)=>a.forEach((v,i)=>near(v,b[i],t));
const make=()=>({position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],velocity:[0,0,0],speed:0,thrust:1,curvature:0,torsion:0,angularVelocity:0});
assert.equal(FLIGHT_STANDARD_GRAVITY,9.80665);
for(const [input,value] of [[-5,0],[0,0],[.24,0],[.25,.5],[.74,.5],[1,1],[1.25,1.5],[4.9,5],[20,10],[NaN,0]])assert.equal(shuttleThrustSetting(input),value);

// One g for ten seconds: exact SI velocity and displacement, independent of
// craft dimensions, initial speed, or the old derivative input channel.
const shuttle=make();for(let i=0;i<10;i++)integratePlanar(shuttle,1,{speed:-1},{lengthMeters:1e6,maxSpeed:1});
vec(shuttle.velocity,[0,0,10*FLIGHT_STANDARD_GRAVITY]);vec(shuttle.position,[0,0,50*FLIGHT_STANDARD_GRAVITY]);near(shuttle.speed,10*FLIGHT_STANDARD_GRAVITY);
shuttle.thrust=0;shuttle.angularVelocity=Math.PI/10;const coastingVelocity=[...shuttle.velocity],position=[...shuttle.position];
for(let i=0;i<10;i++)integratePlanar(shuttle,1);
vec(shuttle.velocity,coastingVelocity);vec(shuttle.position,position.map((v,i)=>v+coastingVelocity[i]*10));vec(shuttle.basis[2],[0,0,-1]);
// Turning 180 degrees does not reverse velocity. A subsequent forward burn
// first slows the craft, reaches rest, and only then accelerates it backward.
shuttle.angularVelocity=0;shuttle.thrust=1;integratePlanar(shuttle,1);near(shuttle.speed,9*FLIGHT_STANDARD_GRAVITY);assert(shuttle.velocity[2]>0);
for(let i=0;i<9;i++)integratePlanar(shuttle,1);near(shuttle.speed,0);integratePlanar(shuttle,1);near(shuttle.velocity[2],-FLIGHT_STANDARD_GRAVITY);

// A rotating burn agrees with the closed-form integral and with ten smaller
// intervals; near-zero and signed turns retain finite planar frames.
for(const omega of [0,1e-12,-1e-8,.3,-.6]){
 const whole={...make(),angularVelocity:omega},split=structuredClone(whole);integratePlanar(whole,1);for(let i=0;i<10;i++)integratePlanar(split,.1);vec(whole.velocity,split.velocity);vec(whole.position,split.position);vec(whole.basis[1],[0,1,0]);assert.equal(whole.position[1],0);
 if(Math.abs(omega)>.1){near(whole.velocity[0],FLIGHT_STANDARD_GRAVITY*(1-Math.cos(omega))/omega);near(whole.position[2],FLIGHT_STANDARD_GRAVITY*(1-Math.cos(omega))/omega**2);near(whole.position[0],FLIGHT_STANDARD_GRAVITY*(omega-Math.sin(omega))/omega**2);}
}
const legacy={...make(),speed:25,thrust:0};delete legacy.velocity;integratePlanar(legacy,1);vec(legacy.velocity,[0,0,25]);near(legacy.position[2],25);
const enterprise={...make(),speed:speedForWarp(4)};delete enterprise.velocity;for(let i=0;i<100;i++)integratePlanar(enterprise,.01,{speed:1},{warp:true});near(warpForSpeed(enterprise.speed),4.45);

const fixtureA=fixture(),r=new BlackHoleRenderer(fixtureA.canvas,{autoStart:false,bindControls:false});r.loadScene('nasa-shuttle');const ship=r.objects.find(o=>o.type==='shuttle');assert(r.setFreeDrive(ship.id,true));r.update({paused:false,speed:1});
let flight=r.getFlightState();assert.equal(flight.thrustSetting,0);assert.equal(flight.speedMetersPerSecond,0);vec(flight.velocity,[0,0,0]);const start=[...flight.position];r.lastTime=1000;r.advanceSimulation(1100);vec(r.getFlightState().position,start);
for(const [input,value] of [[-1,0],[1.2,1],[1.3,1.5],[8,8]])assert.equal(r.setFlightPower(input).thrustSetting,value);
flight=r.setFlightPower(1);assert.equal(flight.thrustSettingG,1);near(flight.accelerationMetersPerSecondSquared,FLIGHT_STANDARD_GRAVITY);assert.equal(flight.throttle,.1);r.advanceSimulation(1200);near(r.getFlightState().speedMetersPerSecond,FLIGHT_STANDARD_GRAVITY*.1);r.render();assert.equal(fixtureA.uniforms.get('uFlightMetrics').args[0],.1);
const velocity=[...ship.flight.velocity];r.brakeFlight('speed');assert.equal(ship.flight.thrust,0);assert.equal(ship.flight.brakeSpeed,false);ship.flight.angularVelocity=.65;r.advanceSimulation(1300);vec(ship.flight.velocity,velocity);r.resetFlight();vec(ship.flight.velocity,velocity);assert.equal(ship.flight.angularVelocity,0);
// Directional metrics follow the inertial velocity rather than the nose.
ship.flight.velocity=[12,0,-9];ship.flight.speed=15;r.fillObjects();vec(r.getFocusFrame(ship.id).velocity,[12/REFERENCE_RG_METERS,0,-9/REFERENCE_RG_METERS]);vec(r.getObjectMetrics(ship.id).velocityDirection,[.8,0,-.6]);
r.setFlightPower(2.5);r.nudgeFlightTurn(1);r.advanceSimulation(1400);const snapshot=snapshotRenderer(r),saved=serializeScene(r),parsed=parseScene(saved);assert.deepEqual(parsed.objects.find(o=>o.id===ship.id).flight,ship.flight);assert(!saved.includes('flightInput'));
for(const [from,to] of [['thrust: 2.5','thrust: -0.5'],['thrust: 2.5','thrust: 10.5'],['thrust: 2.5','thrust: 1.2']])assert.throws(()=>parseScene(saved.replace(from,to)),/thrust/);
const copy=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});restoreRenderer(copy,parsed);assert.deepEqual(copy.getFlightState().velocity,r.getFlightState().velocity);assert.equal(copy.getFlightState().thrustSetting,2.5);copy.lastTime=r.lastTime=2000;copy.advanceSimulation(2100);r.advanceSimulation(2100);vec(copy.getFlightState().velocity,r.getFlightState().velocity);vec(copy.getFlightState().position,r.getFlightState().position);

// Both file-worker transport and renderer-worker snapshots retain the vector
// and g setting, including orientation that differs from the velocity.
let fileHandler;const replies=[];installSceneFileWorker({addEventListener(_name,handler){fileHandler=handler;},postMessage:message=>replies.push(message)});fileHandler({data:{id:1,operation:'serialize',...prepareSceneFile(r)}});assert(replies[0].ok);fileHandler({data:{id:2,operation:'parse',text:replies[0].value}});assert(replies[1].ok);assert.deepEqual(replies[1].value.objects.find(o=>o.id===ship.id).flight.velocity,ship.flight.velocity);
class WorkerGpu extends BlackHoleRenderer{constructor(canvas,options){super(canvas,{...options,autoStart:false,bindControls:false});}}
const workerMessages=[],worker=installRenderWorker({postMessage:message=>workerMessages.push(message),addEventListener(){}},{GpuRenderer:WorkerGpu});await worker.handle({type:'init',canvas:fixture().canvas,cpu:false,viewport:{width:900,height:650,dpr:1},signature:'shuttle',snapshot});assert.deepEqual(worker.renderer.getFlightState().velocity,snapshot.objects.find(o=>o.id===ship.id).flight.velocity);assert.equal(worker.renderer.getFlightState().thrustSetting,2.5);await worker.handle({type:'state',serial:1,snapshot:snapshotRenderer(r),signature:'shuttle'});assert.deepEqual(worker.renderer.getFlightState().velocity,r.getFlightState().velocity);assert(!workerMessages.some(m=>m.type==='error'));await worker.handle({type:'dispose'});

r.loadScene('bridge');r.setBridgeTraveler('shuttle');const traveler=r.objects.find(o=>o.type==='shuttle');r.setFreeDrive(traveler.id,true);assert.equal(r.reverseFlight(),false);traveler.flight.travelDirection=-1;traveler.flight.velocity=[10,0,0];traveler.flight.speed=10;r.update({paused:false,speed:1});const bridgeStart=[...traveler.flight.position];r.lastTime=3000;r.advanceSimulation(3100);assert(traveler.flight.position[0]>bridgeStart[0],'Legacy reverse flags cannot flip Shuttle travel');vec(traveler.flight.velocity,[10,0,0]);
r.dispose();copy.dispose();
console.log('PASS: exact SI Shuttle acceleration, 0–10 g half-g settings, inertial coast/180° turn/opposing burns, bounded rotating-thrust integral, zero Drive, normalized plume telemetry, no velocity reset/reverse, metric vector direction, and worker/YAML restore continuity; Enterprise Warp behavior preserved.');
