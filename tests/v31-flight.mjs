import assert from 'node:assert/strict';
import {integratePlanar,speedForWarp,FLIGHT_LIGHT_SPEED} from '../dist/flight-dynamics.js';
import {warpDisplayStrength,anomalyCruise} from '../dist/warp-physics.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';
for(const warp of [false,true]){
 const f={position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],speed:warp?speedForWarp(5):0,velocity:[0,0,0],thrust:0,headingAngle:3.1,headingTarget:-3.1-8*Math.PI,angularVelocity:0};
 integratePlanar(f,.1,{}, {warp,controlled:true});assert(f.angularVelocity>0,'Restored heading targets take the short modulo path');
 if(warp){assert(f.starPhase>0&&f.starPhase<.005);assert(f.starBeta>0&&f.starBeta<f.speed/FLIGHT_LIGHT_SPEED);assert(f.gridPhase>0);}
}
assert.equal(warpDisplayStrength(0),0);assert(warpDisplayStrength(8)>warpDisplayStrength(4));assert(warpDisplayStrength(10)<=3);
for(let i=0;i<400;i++){const q=anomalyCruise(i*.1,[2,3,4],10);assert(Math.hypot(q.position[0]-2,q.position[1]-3,q.position[2]-4)<6.6);assert(Math.abs(Math.hypot(...q.forward)-1)<1e-12);}
const a=anomalyCruise(.4,[0,0,0],10),b=anomalyCruise(.4+2*Math.PI,[0,0,0],10);assert(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))<1e-12);
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('gravity-anomaly');const id=r.warpObjectId,field=r.objects.find(o=>o.type==='anomaly'),R=r.objectRadius(field);
for(const time of [0,10,100,1000,10000]){r.time=time;r.fillObjects();const ship=r.frameById.get(id);assert(Math.hypot(...ship.position)<R*.7,'Autopilot stays in anomaly');}
r.setFreeDrive(id,true);r.setFlightPower(5);r.lastTime=1000;r.state.paused=false;r.advanceSimulation(1100);r.fillObjects();r.updateCameraFrame();r.render();
assert(f.uniforms.get('uWarpGridOffset').args[0]>0);assert.deepEqual(f.uniforms.get('uWarpGridRotation').args,[1,0]);
assert.equal(f.uniforms.get('uWarpMotion').args[3],0);assert(!r.isDriveOpenSpace());assert.equal(f.uniforms.get('uAnomalyCount').args[0],1);assert.equal(r.objectCount,1);
assert(parseScene(serializeScene(r)).objects.find(o=>o.id===id).flight.starPhase>0);
r.setFreeDrive(id,false);assert(!r.isDriveOpenSpace());assert(r.objects.some(o=>o.type==='anomaly'),'Logical scene remains present during Drive and Return');
r.loadScene('warp-orbit');const ship=r.warpObjectId;r.setFreeDrive(ship,true);const o=r.objectById.get(ship);o.drivePosition=[1e8,0,0];o.flight.position=o.drivePosition.map(v=>v*6.349487672e9);r.fillObjects();r.updateCameraFrame();r.render();assert(r.state.blackHole);assert(r.displayState().blackHole);assert.equal(f.uniforms.get('uWarpFlags').args[3],1);r.setFreeDrive(ship,false);assert(r.displayState().blackHole);
r.dispose();console.log('PASS: modulo headings, speed-derived field strength and star phase, smooth rolling Drive chart, closed anomaly route, preserved surrounding scene and Return, scene serialization.');
