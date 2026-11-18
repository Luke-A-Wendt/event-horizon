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
for(const scene of ['warp-cruise']){
 cpu.loadScene(scene);cpu.state.nebula=true;const ship=cpu.objects.find(o=>o.type==='enterprise');cpu.setFreeDrive(ship.id,true);ship.flight.starBeta=0;
 const stationary=sky();assert(stationary.gradients.length>0,'Nebula is present at rest');
 let lo=1,hi=2;for(let i=0;i<40;i++){const w=(lo+hi)/2;if(warpStarRate(speedForWarp(w)/FLIGHT_LIGHT_SPEED)<.003)lo=w;else hi=w;}ship.flight.starBeta=speedForWarp((lo+hi)/2)/FLIGHT_LIGHT_SPEED;const fading=sky();assert.equal(fading.gradients.length,stationary.gradients.length);
 for(let i=0;i<fading.gradients.length;i++){
  const alpha=entry=>Number(entry.stops[0][1].match(/,([\d.]+)\)$/)[1]);
  assert(Math.abs(alpha(fading.gradients[i])/alpha(stationary.gradients[i])-.5)<1e-9,'Nebula fades with actual smoothed motion, not the power slider');
 }
 for(const spectrum of ['visible','infrared','xray','radio','gamma']){cpu.state.spectrum=spectrum;ship.flight.starBeta=speedForWarp(5)/FLIGHT_LIGHT_SPEED;const moving=sky();assert.equal(moving.gradients.length,0,'Moving sky skips nebula draws in '+spectrum);}
 cpu.state.spectrum='visible';ship.flight.starBeta=0;assert(sky().gradients.length>0,'Stopping restores the nebula');
}
cpu.loadScene('warp-lab');
const lab=cpu.objectById.get(cpu.driveId);
assert.equal(cpu.getNavigationState(lab.id).mode,'manual');
assert.equal(cpu.displayState().nebula,false);cpu.setNavigationMode(lab.id,'auto');assert.equal(cpu.displayState().nebula,false);cpu.setNavigationMode(lab.id,'manual');cpu.state.nebula=true;
const factor=w=>lab.flight.starBeta=speedForWarp(w)/FLIGHT_LIGHT_SPEED;
const gradientAlpha=g=>Number(g.stops[0][1].match(/,([\d.]+)\)$/)[1]);
factor(4);lab.flight.escapeBlend=1;assert(cpu.isDriveOpenSpace());
assert(cpu.displayState().nebula,'The laboratory background survives leaving the origin');
const full=sky().gradients.map(gradientAlpha);assert(full.length>0);
factor(5);assert.deepEqual(sky().gradients.map(gradientAlpha),full);
factor(7.5);for(const [i,alpha] of sky().gradients.map(gradientAlpha).entries())assert(Math.abs(alpha/full[i]-.5)<.0001);
factor(9.9999);assert.equal(sky().gradients.length,0);
cpu.setNavigationMode(lab.id,'auto');assert.deepEqual(sky().gradients.map(gradientAlpha),full,'Auto restores the authored nebula');
cpu.state.nebula=false;assert.equal(sky().gradients.length,0);
for(const scene of ['warp-orbit','bridge','gravity-anomaly']){
 cpu.loadScene(scene);cpu.state.nebula=true;const ship=cpu.objects.find(o=>o.type==='enterprise');cpu.setFreeDrive(ship.id,true);ship.flight.starBeta=speedForWarp(9)/FLIGHT_LIGHT_SPEED;
 assert(!cpu.warpMotionState().active);assert(sky().gradients.length>0,scene+' retains its original nebula');
}
cpu.dispose();
const gpu=new BlackHoleRenderer(fixtureState.canvas,{autoStart:false,bindControls:false});gpu.loadScene('warp-lab');
gpu.render(1000,false,true);const source=fixtureState.sources.filter(s=>s.type===35632).at(-1).source;
assert(source.includes('1.0-smoothstep(0.0,.006,uWarpMotion.y)'));
assert(source.includes('if(skyHaze>0.0)'));assert(source.includes('nebulaParams.z*=skyHaze;'),'GPU skips cloud noise entirely after fading');
const gpuLab=gpu.objectById.get(gpu.driveId);
assert.equal(fixtureState.uniforms.get("uFlags2").args[1],0);gpu.state.nebula=true;
for(const [w,haze] of [[4,1],[5,1],[7.5,.5],[9.9999,0]]){
 gpuLab.flight.escapeBlend=1;gpuLab.flight.starBeta=speedForWarp(w)/FLIGHT_LIGHT_SPEED;
 gpu.render(1000+w*1000,false,true);
 assert.equal(fixtureState.uniforms.get('uFlags2').args[1],1);
 assert(Math.abs(fixtureState.uniforms.get('uLabNebulaVisibility').args[0]-haze)<.0001);
}
gpu.dispose();
console.log('PASS: smooth rate-linked nebula fade and recovery, zero moving cloud work, unchanged non-isolated skies, CPU/GPU parity across spectra.');
