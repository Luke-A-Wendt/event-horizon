import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';

function rig(scene){
 const f=fixture({width:390,height:700}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 r.loadScene(scene);r.sceneLoad=null;r.update({paused:false,grid:true,speed:1});r.lastTime=1000;
 const draw=()=>{r.fillHoles();r.fillObjects();r.updateCameraFrame();r.render();return f.uniforms.get('uWarpGridOffset').args.slice();};
 const tick=(count=1)=>{for(let i=0;i<count;i++)r.advanceSimulation(r.lastTime+50);return draw();};
 return {r,f,draw,tick};
}
const wrap=d=>d-Math.round(d/4096)*4096;
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>wrap(x-b[i])));
const near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<=eps,`${a} and ${b} differ`);
const lab=rig('warp-lab'),orbit=rig('warp-orbit'),worker=rig('disk');
try{
 const l0=lab.draw(),o0=orbit.draw(),l1=lab.tick(4),o1=orbit.tick(4);
 const labSpeed=distance(l0,l1)/.2;
 near(labSpeed,.07*lab.r.state.warpFactor);near(distance(o0,o1)/.2,.07*orbit.r.state.warpFactor);
 // Transmitting a camera/phase-only worker snapshot must not depend on resending geometry.
 restoreRenderer(worker.r,snapshotRenderer(orbit.r));near(distance(worker.draw(),o1),0);
 const advanced=orbit.tick(3);restoreRenderer(worker.r,snapshotRenderer(orbit.r,{includeObjects:false}));
 near(distance(worker.draw(),advanced),0);
 const saved=serializeScene(orbit.r);
 near(parseScene(saved).warpLocalGridPhase,orbit.r.warpLocalGridPhase);
 near(parseScene(saved.replace(/^\s*warpLocalGridPhase:.*$/m,'')).warpLocalGridPhase,0);
 orbit.r.update({paused:true});near(distance(advanced,orbit.tick(4)),0);
 orbit.r.update({grid:false});orbit.draw();assert.equal(orbit.f.uniforms.get('uWarpFlags').args[2],0);
 orbit.r.update({grid:true,paused:false});const id=orbit.r.warpObjectId;
 assert(orbit.r.setFreeDrive(id,true));near(distance(advanced,orbit.draw()),0);
 orbit.r.setFlightPower(5);orbit.tick(4);
 const flight=orbit.r.objectById.get(id).flight,manual0=flight.gridPhase,t0=orbit.draw(),t1=orbit.tick(2);
 near(wrap(t1[0]-t0[0]),wrap(flight.gridPhase-manual0));assert(distance(t0,t1)>0&&distance(t0,t1)<.2,'Manual warp phase remains bounded at astronomical speeds');
}finally{for(const x of [lab,orbit,worker])x.r.dispose();}
console.log('PASS: laboratory roll rate, orbit/drive, paused phase, Grid toggle, worker updates, save compatibility');
