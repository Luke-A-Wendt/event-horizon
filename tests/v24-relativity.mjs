import assert from 'node:assert/strict';
import {integratePlanar,shuttleRelativity,FLIGHT_LIGHT_SPEED as C,FLIGHT_STANDARD_GRAVITY as G,SHUTTLE_THRUST_MAX_G,shuttleThrustSetting,speedForWarp} from '../dist/flight-dynamics.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
const near=(a,b,tolerance=1e-10)=>assert(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const ship=(speed=0,thrust=10)=>({position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],velocity:[0,0,speed],speed,thrust,angularVelocity:0,curvature:0,torsion:0});
assert.equal(SHUTTLE_THRUST_MAX_G,10);assert.equal(shuttleThrustSetting(100),10);assert.equal(shuttleThrustSetting(7.25),7.5);

// Independent special-relativistic limits, parallel and transverse proper thrust.
for(const beta of [0,.1,.8,.99,.999999]){
 const f=ship(beta*C),gamma=1/Math.sqrt(1-beta*beta),alpha=10*G;
 near(shuttleRelativity(f).coordinateAcceleration,alpha/gamma**3);
 f.basis=[[0,0,-1],[0,1,0],[1,0,0]];
 near(shuttleRelativity(f).coordinateAcceleration,alpha/gamma**2);
 for(let i=0;i<10;i++)integratePlanar(f,1,{curvature:.3});
 assert(f.speed<C);assert(f.position.every(Number.isFinite));assert(f.timeLagSeconds>=0&&f.timeLagSeconds<=f.coordinateTimeSeconds);
}

// Constant collinear proper acceleration has u(t)=u0+alpha*t, v=u/gamma.
const initial=.8*C,alpha=10*G,total=100,u0=initial/Math.sqrt(1-.8**2),u1=u0+alpha*total,g0=Math.hypot(1,u0/C),g1=Math.hypot(1,u1/C);
const f=ship(initial);for(let i=0;i<1000;i++)integratePlanar(f,.1);
near(f.speed,u1/g1);near(f.position[2],total*(u0+u1)/(g0+g1));near(f.coordinateTimeSeconds,total);
const exactProper=C/alpha*(Math.asinh(u1/C)-Math.asinh(u0/C));near(total-f.timeLagSeconds,exactProper,1e-8);

// At ordinary speeds the clocks differ by a few nanoseconds: retain the lag
// directly rather than losing it by subtracting equal-looking long clocks.
const slow=ship();for(let i=0;i<600;i++)integratePlanar(slow,.1);
near(slow.coordinateTimeSeconds,60);const lowSpeedLag=alpha**2*60**3/(6*C*C);
assert(Math.abs(slow.timeLagSeconds/lowSpeedLag-1)<1e-9);assert(slow.timeLagSeconds*1e9>3.8);
const coast=ship(.8*C,0),v=[...coast.velocity];for(let i=0;i<100;i++)integratePlanar(coast,.1,{curvature:.1});
assert.deepEqual(coast.velocity,v);near(coast.coordinateTimeSeconds,10);near(coast.timeLagSeconds,4);
// Turning does not redirect inertial motion. A reversed burn slows it.
coast.angularVelocity=0;coast.basis=[[1,0,0],[0,1,0],[0,0,-1]];coast.thrust=10;const before=coast.speed;integratePlanar(coast,1);assert(coast.speed<before);assert(coast.velocity[2]>0);
const limit=ship(C*(1-1e-12));for(let i=0;i<100;i++)integratePlanar(limit,1);assert(limit.speed<C);

// Both clocks share simulation playback, pause and save/load. Lifetime clock
// totals survive Drive sessions; a superluminal warp speed is never sent to SR.
const renderer=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});renderer.loadScene('shuttle-space');const shuttle=renderer.objects[0];renderer.setFreeDrive(shuttle.id,true);renderer.update({paused:false,speed:2});renderer.setFlightPower(10);renderer.lastTime=1000;renderer.advanceSimulation(1100);near(renderer.getFlightState().coordinateTimeSeconds,.2);
renderer.update({paused:true});renderer.advanceSimulation(1200);near(renderer.getFlightState().coordinateTimeSeconds,.2);assert(renderer.getFlightState().timeLagSeconds>0);
const saved=serializeScene(renderer),copy=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});restoreRenderer(copy,parseScene(saved));near(copy.getFlightState().coordinateTimeSeconds,.2);assert.equal(copy.getFlightState().timeLagSeconds,renderer.getFlightState().timeLagSeconds);
assert.throws(()=>parseScene(saved.replace('thrust: 10','thrust: 10.5')),/thrust/);assert.throws(()=>parseScene(saved.replace(/velocity: \[[^\n]+\]/,'velocity: [0, 0, 299792458]')),/speed of light/);
const lifetimeClock=structuredClone(shuttle.clock);renderer.setFreeDrive(shuttle.id,false);assert.deepEqual(shuttle.clock,lifetimeClock);renderer.setFreeDrive(shuttle.id,true);near(renderer.getFlightState().coordinateTimeSeconds,.2);assert.equal(renderer.getFlightState().timeLagSeconds,lifetimeClock.lagSeconds);near(renderer.getFlightState().speedMetersPerSecond,0);
renderer.loadScene('warp-cruise');const enterprise=renderer.objects.find(o=>o.type==='enterprise');renderer.setFreeDrive(enterprise.id,true);renderer.update({paused:false,speed:1});renderer.lastTime=2000;renderer.advanceSimulation(2100);const warp=renderer.getFlightState();assert(warp.speedMetersPerSecond>C);near(warp.coordinateTimeSeconds,.1);assert.equal(warp.properTimeSeconds,null);assert.equal(warp.timeLagSeconds,null);
renderer.dispose();copy.dispose();
console.log('PASS: SR proper thrust, subluminal motion, analytic collinear trajectory, transverse acceleration, stable nanosecond clock lag, coast/turn-and-burn, pause/reset/YAML clocks and distinct warp-clock semantics.');
