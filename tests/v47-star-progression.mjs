import assert from 'node:assert/strict';
import {speedForWarp,warpForSpeed,warpStarVisuals,warpStarRate,integratePlanar,FLIGHT_LIGHT_SPEED as C} from '../dist/flight-dynamics.js';
import {CpuRenderer,cpuWarpStarElongation,cpuWarpNebulaVisibility} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';
const style=w=>warpStarVisuals(speedForWarp(w)/C);
const milestones=Array.from({length:11},(_,w)=>style(w));
assert.equal(milestones[0].rate,0);
for(let w=1;w<=10;w++)assert(milestones[w].rate>milestones[w-1].rate,'Every warp has a distinct speed');
assert(milestones[1].rate<.002&&milestones[2].rate>milestones[1].rate*5);
assert(milestones[5].rate>milestones[2].rate*10);
assert(milestones[8].rate>milestones[5].rate*4);
assert(milestones[10].trailRadians>.29&&milestones[10].whiteness>.99);
assert(milestones[8].trailRadians>milestones[5].trailRadians*6);
for(let w=0;w<9.999;w+=.01){
 const a=style(w),b=style(w+.001);
 for(const key of ['rate','elongation','trailRadians','whiteness'])assert(b[key]>=a[key]-1e-10&&b[key]-a[key]<.004,'Smooth monotone progression: '+key);
 assert.equal(cpuWarpStarElongation(speedForWarp(w)/C),a.elongation);
}
const flight={position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],speed:speedForWarp(10),angularVelocity:0,headingAngle:0,headingTarget:0};
integratePlanar(flight,1/60,{}, {warp:true,controlled:true});
assert(warpForSpeed(flight.starBeta*C)<1,'The visual ramp no longer jumps directly to warp nine');
assert.equal(flight.speed,speedForWarp(10),'The cinematic curve does not change actual flight speed');
for(let i=0;i<180;i++)integratePlanar(flight,1/60,{}, {warp:true,controlled:true});
assert(warpForSpeed(flight.starBeta*C)>9.9&&Number.isFinite(flight.starPhase));
assert.equal(cpuWarpNebulaVisibility(warpStarRate(speedForWarp(2)/C)),0,'Nebula still fades before streaks');

const f=fixture({width:640,height:400}),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(canvas,{autoStart:false,bindControls:false});cpu.loadScene('warp-lab');cpu.setQuality('high');
const ship=cpu.objects.find(o=>o.type==='enterprise');cpu.setFreeDrive(ship.id,true);
function sky(warp){ship.flight.starBeta=speedForWarp(warp)/C;ship.flight.starPhase=.1;cpu.fillObjects();cpu.updateCameraFrame();cpu.cameraFrame={...cpu.cameraFrame,forward:ship.flight.basis[2],right:ship.flight.basis[0],up:ship.flight.basis[1]};canvas.beginFrame();cpu.sky();return canvas.takeFrame().commands;}
const ratios=[];
for(const w of [3,5,8,10]){
 const commands=sky(w),ellipses=commands.filter(c=>c[0]==='ellipse');assert(ellipses.length>0);
 ratios.push(Math.max(...ellipses.map(c=>c[3]/c[4])));
 assert(commands.length<3000,'CPU work remains bounded independently of trail length');
 for(const c of commands)for(const x of c)if(typeof x==='number')assert(Number.isFinite(x));
}
assert(ratios[1]>ratios[0]&&ratios[2]>ratios[1]&&ratios[3]>ratios[2]);
assert(ratios[3]>80,'Near-ten CPU streaks are lines, not elongated dots');cpu.dispose();
console.log('PASS: distinct nonlinear warp milestones, smooth ramp, unchanged physical speeds, long CPU trails, nebula fade, and bounded work.');
