import assert from 'node:assert/strict';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { DEFAULTS,horizonRg } from '../dist/config.js';
import { fixture } from './render-fixture.mjs';
const f=fixture({width:3000,height:2000,dpr:3,maxSize:4096}),errors=[];
const renderer=new BlackHoleRenderer(f.canvas,{onError:e=>{if(e)errors.push(e)}});
const uniform=name=>f.uniforms.get(name)?.args;
const close=(a,b,tol=1e-6)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const settle=()=>{for(let i=0;i<180;i++)renderer.frame(10000+i*16.667);};
assert.equal(errors.length,0);assert.equal(renderer.getState().quality,'adaptive');
renderer.setQuality('ultra');assert(f.canvas.width*f.canvas.height<=16000000);assert(f.canvas.width<=4096&&f.canvas.height<=4096);assert(renderer.steps>=768);

// Regression: changing mass must not move the physical observer.
const start=renderer.getState(),horizon=renderer.configCache.horizon[0];
renderer.update({mass:8.6});renderer.render();
close(renderer.getState().worldDistance,start.worldDistance);close(renderer.getState().distance,start.distance/2);close(renderer.configCache.horizon[0],horizon*2);close(uniform('uMass')[0],2);
renderer.update({spin:0});renderer.render();close(renderer.configCache.horizon[0],4);close(uniform('uSpin')[0],0);close(uniform('uIsco')[0],6);
renderer.update({spin:.98});renderer.render();assert(renderer.configCache.horizon[0]<4);assert(uniform('uIsco')[0]<6);

// Independent flags, colors, spectra, and all twelve simultaneous bodies.
renderer.update({...DEFAULTS,stars:false,disk:false,nebula:true,planet:true,tidalStar:true,jets:true});renderer.render();
assert.deepEqual(uniform('uFlags'),[0,0,1,1]);assert.deepEqual(uniform('uFlags2'),[0,1,1,0]);assert.equal(uniform('uObjectCount')[0],2);
renderer.update({spectrum:'infrared'});renderer.render();assert.equal(uniform('uSpectrum')[0],1);
renderer.update({spectrum:'xray'});renderer.render();assert.equal(uniform('uSpectrum')[0],2);
renderer.update({planetColor:'#ff00ff',starColor:'#00ff00',jetColor:'#00ffff',diskColor:'#ffffff'});renderer.render();
assert.deepEqual(uniform('uJetColor')[0],[0,1,1]);assert.deepEqual(uniform('uDiskColor')[0],[1,1,1]);
const colors=uniform('uColors[0]')[0];close(colors[0],1);close(colors[1],0);close(colors[4],0);close(colors[5],1);
for(let i=0;i<10;i++)assert(renderer.addObject('planet',12,i));assert.equal(renderer.addObject('star',12),false);renderer.render();assert.equal(uniform('uObjectCount')[0],12);
renderer.clearObjects();assert.equal(renderer.getState().objectCount,0);

// Barycentric binary, aligned spin frame, and disjoint Roche-limited discs.
renderer.update({...DEFAULTS,binary:true,binaryRatio:.35,binarySeparation:24,primaryTilt:0,secondaryTilt:90,secondaryAzimuth:0});renderer.time=7;renderer.render();
let holes=uniform('uHoles[0]')[0];
for(const axis of [0,1,2])close(holes[axis]*holes[3]+holes[4+axis]*holes[7],0,1e-5);
close(Math.hypot(...[0,1,2].map(i=>holes[i]-holes[i+4])),24,1e-5);
assert.deepEqual(uniform('uPrimaryAxis')[0],[0,1,0]);close(uniform('uSecondaryAxis')[0][0],1);close(uniform('uSecondaryAxis')[0][1],0);
assert(renderer.configCache.diskOuter[0]+renderer.configCache.diskOuter[1]<24);
const h0=holes.slice();renderer.time+=.01;renderer.render();holes=uniform('uHoles[0]')[0];
assert(h0[2]*(holes[0]-h0[0])-h0[0]*(holes[2]-h0[2])>0,'Binary angular momentum aligns with +Y');

// Gaze changes do not change observer position. Navigation recenters gaze.
renderer.update({...DEFAULTS});renderer.resetCamera();settle();
const position={yaw:renderer.camera.yaw,pitch:renderer.camera.pitch,distance:renderer.camera.distance};
renderer.look('outward');close(renderer.camera.lookYaw,Math.PI);close(renderer.camera.distance,position.distance);close(renderer.camera.yaw,position.yaw);close(renderer.camera.pitch,position.pitch);
renderer.zoom(1.25);close(renderer.camera.lookYaw,0);renderer.look('tangent');close(renderer.camera.lookYaw,Math.PI/2);renderer.rotate(.1,0);close(renderer.camera.lookYaw,0);
renderer.setDistanceRg(1e6);close(renderer.target.distance/renderer.massScale,5000);renderer.setDistanceRg(.0001);assert(renderer.target.distance>renderer.configCache.horizon[0]);
renderer.setDistanceRg(horizonRg(renderer.state.spin)*1.08);renderer.look('outward');settle();assert(renderer.camera.distance>renderer.configCache.horizon[0]);close(renderer.camera.lookYaw,Math.PI);

// Middle-mouse look excludes wheel zoom; pinch owns touch until all fingers lift.
renderer.resetCamera();settle();renderer.navigationUntil=0;
const emit=(name,event)=>f.canvas.listeners.get(name)?.({preventDefault(){},...event});
const beforeOrbit=renderer.target.yaw;
emit('pointerdown',{pointerType:'mouse',button:1,pointerId:1,clientX:100,clientY:100});emit('pointermove',{pointerId:1,clientX:130,clientY:110});assert.notEqual(renderer.target.lookYaw,0);close(renderer.target.yaw,beforeOrbit);
const beforeWheel=renderer.target.distance;emit('wheel',{deltaY:100});close(renderer.target.distance,beforeWheel);emit('pointerup',{pointerId:1});
renderer.setViewMode('look');renderer.navigationUntil=0;
emit('pointerdown',{pointerType:'touch',button:0,pointerId:1,clientX:100,clientY:100});emit('pointerdown',{pointerType:'touch',button:0,pointerId:2,clientX:200,clientY:100});
const prePinch=renderer.target.distance;emit('pointermove',{pointerId:2,clientX:250,clientY:100});assert(renderer.target.distance<prePinch);close(renderer.target.lookYaw,0);
emit('pointerup',{pointerId:2});emit('pointermove',{pointerId:1,clientX:180,clientY:110});close(renderer.target.lookYaw,0);emit('pointerup',{pointerId:1});

// Finite values across combined extremes, pause, hidden-tab suspension, disposal.
for(const mass of [.5,4.3,20])for(const spin of [0,.65,.98]){renderer.update({mass,spin,planet:true,tidalStar:true,binary:true,primaryTilt:180,secondaryTilt:90});for(const time of [0,8,37,100]){renderer.time=time;renderer.render();for(const record of f.uniforms.values())assert(record.args.flat(3).filter(x=>typeof x==='number').every(Number.isFinite));}}
renderer.update({paused:true});const time=renderer.time;renderer.frame(22000);renderer.frame(22050);close(renderer.time,time);renderer.update({paused:false});renderer.frame(22100);assert(renderer.time>time);
document.hidden=true;const beforeDraws=f.draws;renderer.frame(22150);assert.equal(f.draws,beforeDraws);document.hidden=false;
renderer.setQuality('adaptive');renderer.statsStart=0;renderer.frames=0;for(let i=0;i<120;i++)renderer.frame(30000+i*50);assert.equal(renderer.getState().effectiveQuality,'low');assert.equal(renderer.steps,96);
renderer.dispose();assert(f.disposed>=2);assert.equal(f.canvas.listeners.size,0);
console.log('PASS: mass regression, Kerr boundaries, independent components, spectra, barycenter/Roche/orientation, free-look gestures, horizon safety, 5000rg zoom, finite-state sweep, adaptive budget, lifecycle.');
