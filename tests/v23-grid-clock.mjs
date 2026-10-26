// Dimensional and behavioral checks for the common orbit / free-fall chart clock.
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {weakGridMaterialRadius,weakGridTracerRadius,weakGridFlowWindow,ORBITAL_WORLD_SPEED,coordinateGridGLSL} from '../dist/grid-glsl.js';
import {fixture} from './render-fixture.mjs';
import {readFileSync} from 'node:fs';
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const mass=1.4/4300000,radius=300000/REFERENCE_RG_METERS,bodyRadius=100000/REFERENCE_RG_METERS;
const omega=ORBITAL_WORLD_SPEED*Math.sqrt(mass/radius**3),period=2*Math.PI/omega;
const start=radius*1.3,time=period*.025,epsilon=period*1e-6;
const at=t=>weakGridTracerRadius(start,mass,t),r=at(time);
assert(r<start&&r>bodyRadius,'A tracer visibly falls inward while remaining outside the star');
near(weakGridMaterialRadius(r,mass,time),start);
const speed=-(at(time+epsilon)-at(time-epsilon))/(2*epsilon),circularSpeed=omega*radius;
near(speed/(ORBITAL_WORLD_SPEED*Math.sqrt(mass/r)),Math.SQRT2,1e-6);
near(ORBITAL_WORLD_SPEED*Math.sqrt(2*mass/radius)/circularSpeed,Math.SQRT2);
// The equivalent computation in any grid coordinate scale has identical results.
for(const scale of [bodyRadius*.1,bodyRadius*.5,bodyRadius*20]){
 const q=start/scale,m=mass/scale,t=ORBITAL_WORLD_SPEED*time/scale;
 const result=Math.pow(q**1.5-1.5*Math.sqrt(2*m)*t,2/3)*scale;
 near(result,r,1e-10);
}
assert.equal(weakGridFlowWindow(bodyRadius,0),0);
const window=weakGridFlowWindow(bodyRadius,mass);
assert(window>0&&Number.isFinite(window));
// Replenishment windows never produce a brightness pulse or an abrupt reset.
for(const fraction of [0,.00001,.25,.49999,.5,.75,.99999,1,1e5+.3]){
 const phase=fraction%1,other=(phase+.5)%1;
 near(Math.sin(Math.PI*phase)**2+Math.sin(Math.PI*other)**2,1);
}
const f=fixture(),renderer=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
renderer.loadScene('geometry-orbit');renderer.state.paused=false;
near(renderer.orbitDisplayPeriodSeconds(),20,1e-6);
renderer.update({speed:4});near(renderer.orbitDisplayPeriodSeconds(),10,1e-6);
assert(renderer.effectivePlaybackSpeed()<=2.00001);
renderer.lastTime=1000;const before=renderer.time;renderer.advanceSimulation(1100);
near(renderer.time-before,.1*renderer.effectivePlaybackSpeed()*renderer.simulationTimeScale(),1e-12);
renderer.render();const uniformWindow=f.uniforms.get('uGridFlowWindow').args[0];near(uniformWindow,window);
renderer.camera.focusDistance=40;renderer.render();near(f.uniforms.get('uGridFlowWindow').args[0],window);
const traveler=renderer.objects.find(o=>o.type==='probe');
renderer.updateObject(traveler.id,{orbitMeters:180000});
assert(renderer.playbackSpeedLimit()<2);near(renderer.orbitDisplayPeriodSeconds(),10,1e-6);
renderer.state.paused=true;const pausedTime=renderer.time;renderer.advanceSimulation(1200);near(renderer.time,pausedTime);
renderer.update({speed:0});assert.equal(renderer.orbitDisplayPeriodSeconds(),null);
renderer.loadScene('disk');renderer.update({speed:4});assert.equal(renderer.effectivePlaybackSpeed(),4,'Other scenes retain their existing playback control');renderer.dispose();
const glsl=coordinateGridGLSL();assert.match(glsl,/18\.0\*max\(weakFlowTime,0\.0\)\/scale/);
assert.match(glsl,/stretch=max\(stretch,max\(expansion/);
assert.match(glsl,/phase\*uGridFlowWindow/);assert.match(glsl,/other\*uGridFlowWindow/);
const cpuSource=readFileSync(new URL('../dist/cpu-renderer.js',import.meta.url),'utf8');
assert.match(cpuSource,/weakGridTracerRadius\(radial,body.massSolar\/4300000,flowTime\)/);
assert.match(cpuSource,/weakGridFlowWindow\(weakBodies\[0\].radius,weakBodies\[0\].massSolar\/4300000\)/);
assert.equal(CpuRenderer.prototype.advanceSimulation,BlackHoleRenderer.prototype.advanceSimulation,'CPU and GPU use one playback clock');
console.log('PASS: shared orbit/grid clock, radial free-fall conservation and sqrt(2) speed ratio, camera-invariant tracer replenishment, antialias stretch, 10s orbit floor and CPU clock parity.');
