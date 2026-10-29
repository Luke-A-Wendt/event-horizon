import assert from 'node:assert/strict';
import {integratePlanar,FLIGHT_LIGHT_SPEED as c,FLIGHT_STANDARD_GRAVITY as g} from '../dist/flight-dynamics.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
const f={position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],velocity:[0,0,0],speed:0,thrust:1000,headingAngle:3.1,headingTarget:-3.1};
integratePlanar(f,.1,{}, {warp:false,maxThrustG:1000,controlled:true,clockExempt:true});
assert(f.speed>900&&f.speed<1000);assert(f.angularVelocity>0);assert.equal(f.timeLagSeconds,0);
f.velocity=[0,0,c*.999999];f.speed=Math.hypot(...f.velocity);integratePlanar(f,1,{}, {warp:false,maxThrustG:1000,controlled:true});assert(f.speed<c);
const fx=fixture(),r=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false});
r.loadScene('warp-cruise');const id=r.warpObjectId,before={warp:r.state.warp,owner:r.warpObjectId,factor:r.state.warpFactor,scenario:r.state.warpScenario};
r.setFreeDrive(id,true);assert.equal(r.getFlightState().flightMode,'warp');r.setFlightPower(5);r.state.paused=false;r.lastTime=1000;r.advanceSimulation(1100);r.fillObjects();assert(r.warpMotionState().active);assert(r.warpMotionState().rate>0&&r.warpMotionState().rate<.05);const ship=r.objectById.get(id);assert(ship.flight.gridPhase>0);assert(r.warpGridState(r.frameById.get(id),1).offset[0]>0);
assert.equal(r.setFlightMode('impulse'),false);assert(r.state.warp);assert.equal(r.getFlightState().flightMode,'warp');assert.equal(r.getFlightState().timeLagSeconds,null);r.setFlightPower(0);assert.equal(r.getFlightState().speed,0);r.setFlightPower(5);
const position=[...ship.flight.position],parsed=parseScene(serializeScene(r));assert.equal(parsed.objects.find(o=>o.id===id).flight.mode,'warp');assert(parsed.objects.find(o=>o.id===id).driveRestore);r.loadScene('disk');restoreRenderer(r,parsed);assert.equal(r.getFlightState().flightMode,'warp');assert.deepEqual(r.objectById.get(id).flight.position,position);
r.setFreeDrive(id,false);assert.equal(r.state.warp,before.warp);assert.equal(r.state.warpFactor,before.factor);assert.equal(r.state.warpScenario,before.scenario);assert.equal(r.warpObjectId,before.owner);
for(const scene of ['warp-orbit','gravity-anomaly','bridge']){r.loadScene(scene);const ship=r.objects.find(o=>o.type==='enterprise');if(!ship)continue;r.setFreeDrive(ship.id,true);assert(!r.warpMotionState().active);assert.equal(r.isDriveOpenSpace(),false);assert.equal(r.displayState(),r.state);if(r.state.bridge){assert.equal(r.getFlightState().flightMode,'warp');assert(r.getFlightState().canWarp);assert(r.state.warp);r.fillObjects();r.updateCameraFrame();r.render();assert(fx.uniforms.get('uBridgeBubble').args[3]>0);}}
r.loadScene('disk');const extra=r.addObject('enterprise');r.setFreeDrive(extra.id,true);assert(r.state.warp);r.setFreeDrive(extra.id,false);assert(!r.state.warp);assert(r.state.blackHole);
r.dispose();console.log('PASS: bounded SR thrust helper, modulo heading, universal manual warp, Enterprise clock exemption, stable rolling chart, isolated stars, environment retention, saved field restoration, YAML.');
