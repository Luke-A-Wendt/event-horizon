import assert from 'node:assert/strict';
import {createObjectClock,clockRate,advanceObjectClock,objectClockReading,formatClockDuration,formatClockRate,CLOCK_LIGHT_SPEED as c} from '../dist/object-clocks.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {RenderHost} from '../dist/render-host.js';
import {fixture} from './render-fixture.mjs';
const relative=(a,b,tolerance=1e-10)=>assert(Math.abs(a-b)<=Math.abs(b)*tolerance,`${a} != ${b}`);
const idle=createObjectClock();for(let i=0;i<600;i++)advanceObjectClock(idle,.1,clockRate());assert.equal(idle.lagSeconds,0);assert.equal(objectClockReading(idle,clockRate()).rateFactor,1);
// One modest burn is far below the precision of subtracting two whole clocks.
const thrust=createObjectClock(),a=9.80665;advanceObjectClock(thrust,1,clockRate(),[a,0,0]);relative(thrust.lagSeconds,a*a/(6*c*c));assert(thrust.lagSeconds>0);
const start=thrust.lagSeconds;advanceObjectClock(thrust,1,clockRate({rapidityVector:thrust.rapidityVector}));relative(thrust.lagSeconds-start,a*a/(2*c*c));
const coarse=createObjectClock(),fine=createObjectClock();advanceObjectClock(coarse,100,clockRate(),[a,0,0]);for(let i=0;i<1000;i++)advanceObjectClock(fine,.1,clockRate({rapidityVector:fine.rapidityVector}),[a,0,0]);relative(coarse.lagSeconds,fine.lagSeconds);
const gravity=clockRate({positionMeters:[1e20,0,0],sources:[{id:'star',massSolar:1,positionMeters:[0,0,0]}]}),weak=createObjectClock();assert(gravity.gravityExcess>0);advanceObjectClock(weak,1,gravity);assert(weak.lagSeconds>0,'Weak-field excess survives rate rounding to1');
const rate=clockRate({rapidityVector:[1,0,0]}),coast=createObjectClock();coast.rapidityVector=[1,0,0];advanceObjectClock(coast,10,rate);relative(coast.lagSeconds,10*(Math.cosh(1)-1));
for(const [seconds,text] of [[0,'0 s'],[1e-9,'1.0 ns'],[1.2e-6,'1.2 µs'],[.1234,'120 ms'],[3.7,'3.7 s'],[59.9,'1.0 min'],[2340,'39 min'],[3600,'1.0 h'],[86400,'1.0 d'],[31557600,'1.0 yr'],[31557600e6,'1.0 million yr']])assert.equal(formatClockDuration(seconds),text);
for(const [q,text] of [[1,'1.0×'],[18,'18×'],[1800,'1,800×'],[1.8e6,'1.8 million×'],[1e9,'1.0 billion×']])assert.equal(formatClockRate(q),text);
class LogicHost extends RenderHost{startBackend(){}queueSnapshot(){}resize(){}}
for(const Class of [BlackHoleRenderer,CpuRenderer,LogicHost]){
 const f=fixture(),canvas=Class===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Class===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Class(canvas,{autoStart:false,bindControls:false});r.loadScene('shuttle-space');r.sceneLoad?.complete(r.sceneLoad.revision);r.lastTime=1000;r.state.paused=false;
 const ship=r.objects.find(o=>o.type==='shuttle');assert(ship);for(let i=0;i<10;i++)r.advanceSimulation(r.lastTime+1000);
 const reading=r.getObjectClock(ship.id);assert.equal(reading.lagSeconds,0);assert.equal(reading.rateFactor,1);assert.equal(formatClockDuration(reading.lagSeconds),'0 s');assert.equal(formatClockRate(reading.rateFactor),'1.0×');
 r.setFreeDrive(ship.id,true);r.setFlightPower(0);r.advanceSimulation(r.lastTime+1000);assert.equal(r.getObjectClock(ship.id).lagSeconds,0);r.setFreeDrive(ship.id,false);assert.equal(r.getObjectClock(ship.id).lagSeconds,0);r.dispose();
}
console.log('PASS: stationary open-space shuttle remains0 at1× in GPU/CPU/host, tiny real burns preserve excess, coasting retains dilation, readable units and rate multipliers.');
