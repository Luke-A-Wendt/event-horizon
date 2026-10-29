import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {warpStarRate,speedForWarp,FLIGHT_LIGHT_SPEED} from '../dist/flight-dynamics.js';
const fx=fixture(),r=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false});
for(const preset of ['bridge','bridge-nebulae']){
 r.loadScene(preset);r.render();const id=r.bridgeObjectId,initial={factor:r.state.warpFactor,scenario:r.state.warpScenario};assert(!r.state.warp);assert.equal(fx.uniforms.get('uBridgeBubble').args[3],0);assert.equal(fx.uniforms.get('uWarpStrength').args[0],0);assert.equal(r.focusMode,'track');
 r.setFreeDrive(id,true);assert.equal(r.getFlightState().flightMode,'warp');assert(r.getFlightState().canWarp);assert.equal(r.setFlightMode('impulse'),false);r.setFlightPower(5);r.update({grid:true});r.fillObjects();r.updateCameraFrame();r.render();
 assert(r.state.bridge&&r.state.warp);assert.equal(r.shaderFeatures().warp,false,'Bridge reuses its existing bubble integrator without adding the ordinary warp shader');assert(fx.uniforms.get('uBridgeBubble').args[3]>0);assert(fx.uniforms.get('uWarpStrength').args[0]>0);assert.equal(fx.uniforms.get('uFlags').args[0],1);assert.equal(r.warpMotionState().active,false);
 r.state.paused=false;r.lastTime=1000;r.advanceSimulation(1100);r.fillObjects();r.updateCameraFrame();r.render();assert(fx.uniforms.get('uWarpGridOffset').args[0]>0);assert(r.validateFrameGeometry());
 const saved=parseScene(serializeScene(r));r.loadScene('disk');restoreRenderer(r,saved);assert(r.state.bridge&&r.state.warp);assert.equal(r.getFlightState().flightMode,'warp');
 r.setFlightPower(0);r.render();assert.equal(fx.uniforms.get('uBridgeBubble').args[3],0);r.setFlightPower(5);r.setFreeDrive(id,false);r.fillObjects();r.updateCameraFrame();r.render();assert(!r.state.warp);assert.equal(r.warpObjectId,null);assert.equal(r.state.warpFactor,initial.factor);assert.equal(r.state.warpScenario,initial.scenario);assert.equal(fx.uniforms.get('uBridgeBubble').args[3],0);
}
r.loadScene('bridge-earth-proxima');r.setFreeDrive(r.bridgeObjectId,true);r.setFlightPower(10);assert.equal(r.getFlightState().flightMode,'impulse');assert.equal(r.getFlightState().thrustSettingG,10);assert(!r.state.warp);
const low=warpStarRate(speedForWarp(5)/FLIGHT_LIGHT_SPEED),high=warpStarRate(speedForWarp(9.9999)/FLIGHT_LIGHT_SPEED);assert(high>low*20&&high<.7);let previous=0;for(let w=0;w<=9.9999;w+=.05){const rate=warpStarRate(speedForWarp(w)/FLIGHT_LIGHT_SPEED);assert(rate>=previous);previous=rate;}
r.dispose();console.log('PASS: manual Enterprise Warp in bridges, independent bubble/grid, no extra warp shader variant, automatic route/field restoration, saved-drive restoration, unchanged Shuttle thrust, accelerated bounded high-warp star motion.');
