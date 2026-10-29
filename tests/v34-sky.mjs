import assert from 'node:assert/strict';
import {cpuWarpNebulaVisibility,CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {speedForWarp,warpStarRate,FLIGHT_LIGHT_SPEED} from '../dist/flight-dynamics.js';
import {fixture} from './render-fixture.mjs';

assert.equal(cpuWarpNebulaVisibility(0),1);
assert.equal(cpuWarpNebulaVisibility(.006),0);
assert.equal(cpuWarpNebulaVisibility(.2,false),1);
let previous=1;for(let i=0;i<=120;i++){const visibility=cpuWarpNebulaVisibility(i*.0001);assert(visibility>=0&&visibility<=previous);previous=visibility;}
assert.equal(cpuWarpNebulaVisibility(warpStarRate(speedForWarp(2)/FLIGHT_LIGHT_SPEED)),0,'Clouds have vanished before recognizable star streaks');
const fixtureState=fixture(),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=fixtureState.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(canvas,{autoStart:false,bindControls:false});
function sky(){cpu.state.nebulaRotation=0;cpu.state.bridgeOtherRotation=0;cpu.fillObjects();cpu.updateCameraFrame();cpu.cameraFrame={...cpu.cameraFrame,forward:[0,0,1],right:[1,0,0],up:[0,1,0]};canvas.beginFrame();cpu.sky();return canvas.takeFrame();}
for(const scene of ['warp-lab','warp-cruise']){
 cpu.loadScene(scene);cpu.state.nebula=true;const ship=cpu.objects.find(o=>o.type==='enterprise');cpu.setFreeDrive(ship.id,true);ship.flight.starBeta=0;
 const stationary=sky();assert(stationary.gradients.length>0,'Nebula is present at rest');
 ship.flight.starBeta=Math.expm1(.003/.004);const fading=sky();assert.equal(fading.gradients.length,stationary.gradients.length);
 for(let i=0;i<fading.gradients.length;i++){
  const alpha=entry=>Number(entry.stops[0][1].match(/,([\d.]+)\)$/)[1]);
  assert(Math.abs(alpha(fading.gradients[i])/alpha(stationary.gradients[i])-.5)<1e-12,'Nebula fades with actual smoothed motion, not the power slider');
 }
 for(const spectrum of ['visible','infrared','xray','radio','gamma']){cpu.state.spectrum=spectrum;ship.flight.starBeta=speedForWarp(5)/FLIGHT_LIGHT_SPEED;const moving=sky();assert.equal(moving.gradients.length,0,'Moving sky skips nebula draws in '+spectrum);}
 cpu.state.spectrum='visible';ship.flight.starBeta=0;assert(sky().gradients.length>0,'Stopping restores the nebula');
}
for(const scene of ['warp-orbit','bridge','gravity-anomaly']){
 cpu.loadScene(scene);cpu.state.nebula=true;const ship=cpu.objects.find(o=>o.type==='enterprise');cpu.setFreeDrive(ship.id,true);ship.flight.starBeta=speedForWarp(9)/FLIGHT_LIGHT_SPEED;
 assert(!cpu.warpMotionState().active);assert(sky().gradients.length>0,scene+' retains its original nebula');
}
cpu.dispose();
const gpu=new BlackHoleRenderer(fixtureState.canvas,{autoStart:false,bindControls:false});gpu.loadScene('warp-lab');
gpu.render(1000,false,true);const source=fixtureState.sources.filter(s=>s.type===35632).at(-1).source;
assert(source.includes('1.0-smoothstep(0.0,.006,uWarpMotion.y)'));
assert(source.includes('if(skyHaze>0.0)'));assert(source.includes('nebulaParams.z*=skyHaze;'),'GPU skips cloud noise entirely after fading');
gpu.dispose();
console.log('PASS: smooth rate-linked nebula fade and recovery, zero moving cloud work, unchanged non-isolated skies, CPU/GPU parity across spectra.');
