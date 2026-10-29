import assert from 'node:assert/strict';
import {cpuWarpStarDirection,cpuWarpStarElongation,cpuWarpStarOpacity,CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {speedForWarp,FLIGHT_LIGHT_SPEED} from '../dist/flight-dynamics.js';
import {fixture} from './render-fixture.mjs';
const forward=[0,0,1],star=[Math.sin(.4),0,Math.cos(.4)];
assert(Math.hypot(...cpuWarpStarDirection(star,forward,0).map((x,i)=>x-star[i]))<1e-14,'Starting warp retains the original star position');
const moved=cpuWarpStarDirection(star,forward,.01);assert(moved[2]<star[2],'Head-on stars flow outward from the flight direction');
for(const phase of [0,.1,.7,1,1024])assert(Math.abs(Math.hypot(...cpuWarpStarDirection(star,forward,phase))-1)<1e-12);
assert(Math.hypot(...cpuWarpStarDirection(star,forward,1).map((x,i)=>x-star[i]))<1e-12,'Periodic renewal has no phase seam');
for(let layer=0;layer<3;layer++){let previous=-1;for(let i=1;i<50;i++){const angle=i*Math.PI/50,mapped=cpuWarpStarDirection([Math.sin(angle),0,Math.cos(angle)],forward,.31,layer),next=Math.acos(mapped[2]);assert(next>previous,'Radial star mapping never folds into a bright ring');previous=next;}assert.equal(cpuWarpStarOpacity(0,layer),1);assert.equal(cpuWarpStarOpacity(1-(.25+.25*layer),layer),0,'Recycling is invisible');}
const widths=[0,1,2,2.5,3,5,8,9.9999].map(w=>cpuWarpStarElongation(speedForWarp(w)/FLIGHT_LIGHT_SPEED));
assert(widths[2]<1e-10);assert(widths[3]>0&&widths[3]<widths[4]);assert(widths.every((x,i)=>x>=0&&x<=1&&(!i||x>=widths[i-1])));
const f=fixture({width:800,height:550}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
for(const scene of ['warp-orbit','bridge','gravity-anomaly']){r.loadScene(scene);const ship=r.objects.find(o=>o.type==='enterprise');r.setFreeDrive(ship.id,true);assert(!r.warpMotionState().active,scene+' retains its regular sky');}
r.loadScene('warp-lab');const ship=r.objects.find(o=>o.type==='enterprise');r.setFreeDrive(ship.id,true);r.setFlightPower(5);assert(r.warpMotionState().active);r.setFreeDrive(ship.id,false);assert(!r.warpMotionState().active);r.dispose();
const canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;const c=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
c.loadScene('warp-lab');c.setQuality('low');const craft=c.objects.find(o=>o.type==='enterprise');c.setFreeDrive(craft.id,true);craft.flight.starPhase=.03;craft.flight.starBeta=speedForWarp(5)/FLIGHT_LIGHT_SPEED;c.fillObjects();c.updateCameraFrame();canvas.beginFrame();c.sky();const commands=canvas.takeFrame().commands;assert(commands.length<900,'CPU Gaussian sky stays within a bounded low-tier command budget');
for(const command of commands)for(const value of command)if(typeof value==='number')assert(Number.isFinite(value));c.dispose();
console.log('PASS: continuous seeded warp sky, cone flow, gradual Warp2–3 Gaussian threshold, isolated Drive gating, bounded CPU sky.');
