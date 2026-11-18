import assert from 'node:assert/strict';
import {crewAccelerationG,circularClockRate,clockRate,createObjectClock,tickAtClockRate,CLOCK_SOLAR_GM as mu,CLOCK_LIGHT_SPEED as c} from '../dist/object-clocks.js';
import {BlackHoleRenderer} from '../dist/renderer.js';import {fixture} from './render-fixture.mjs';
const close=(a,b,tol=1e-11)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),a+' vs '+b);
const source={id:'body',massSolar:1,positionMeters:[0,0,0]},r1=Math.sqrt(mu/9.80665),p=[r1,0,0];
close(crewAccelerationG(p,[source],[1,0,0]),0);
close(crewAccelerationG(p,[source],[-1,0,0]),2);
close(crewAccelerationG(p,[source],[0,1,0]),Math.SQRT2);
const r=14*mu/(c*c),speed=Math.sqrt(mu/r),rate=circularClockRate(clockRate({positionMeters:[0,r,0],sources:[source]}),speed);
close(rate.rateFactor,1/Math.sqrt(1-3*mu/(r*c*c)));
const clock=createObjectClock();tickAtClockRate(clock,375,rate);close(clock.coordinateSeconds,375*rate.rateFactor);close(clock.lagSeconds,clock.coordinateSeconds-375);
// Arc clocks must integrate the simulated angle traversed, not five wall seconds.
const sim=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});sim.loadScene('solar-system');sim.sceneLoad=null;sim.state.paused=false;
const craft=sim.objects.find(x=>x.type==='shuttle'),arc=sim.getFlightSequence(craft.id).orbitWait;assert(arc.durationSeconds>5&&arc.clockRate.rateFactor>1);
const before=craft.clock.properSeconds;for(let i=0;i<10;i++)sim.advanceChartStages(.1);
const progressed=sim.getFlightSequence(craft.id).orbitWait;close(craft.clock.properSeconds-before,arc.durationSeconds*progressed.arcFraction);close(craft.clock.coordinateSeconds-before,craft.clock.properSeconds*arc.clockRate.rateFactor);sim.dispose();
console.log('PASS vector gravity/thrust, exact Schwarzschild circular clock and compressed onboard arc time.');
