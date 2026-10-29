import assert from 'node:assert/strict';
import {speedForWarp,warpStarRate,FLIGHT_LIGHT_SPEED} from '../dist/flight-dynamics.js';
import {CpuRenderer,cpuWarpStarOpacity} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';
const rate=w=>warpStarRate(speedForWarp(w)/FLIGHT_LIGHT_SPEED);
assert.equal(rate(0),0);assert(Math.abs(rate(5)-.004*Math.log1p(speedForWarp(5)/FLIGHT_LIGHT_SPEED))<1e-12,'Lower-warp motion is preserved');
for(let w=.01;w<10;w+=.01)assert(rate(w)>=rate(w-.01),'Apparent motion always accelerates with warp');
assert(rate(9.9)>rate(9)*5);assert(rate(9.9999)<.65);assert(Math.abs(rate(8.000001)-rate(8))<1e-7,'High-warp boost starts smoothly');
for(let phase=0;phase<1;phase+=.001){
 const opacity=[0,1,2].map(layer=>cpuWarpStarOpacity(phase,layer,rate(9.9999)));
 assert(opacity.every(x=>x>=0&&x<=1));assert(opacity[0]+opacity[1]>.9,'Even the two-layer low-tier sky never fades out');assert(opacity.reduce((a,b)=>a+b,0)>1.8);
}
for(let layer=0;layer<3;layer++)assert.equal(cpuWarpStarOpacity(1-(.25+.25*layer),layer,rate(9.9999)),0,'Fast layer renewal is still invisible');
const f=fixture(),canvas=new CpuCommandCanvas();canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
const r=new CpuRenderer(canvas,{autoStart:false,bindControls:false});r.loadScene('bridge');const id=r.bridgeObjectId;
function bubble(){r.fillObjects();r.updateCameraFrame();canvas.beginFrame();r.bridgeBubble();return canvas.takeFrame().commands;}
assert.equal(bubble().length,0,'Bridge autoplay has no bubble');r.setFreeDrive(id,true);r.setFlightPower(4);r.state.grid=true;
const warped=bubble();assert(warped.length>30&&warped.length<700,'Manual warp sheet uses a bounded CPU tier budget');for(const command of warped)for(const value of command)if(typeof value==='number')assert(Number.isFinite(value));
r.setFlightPower(0);assert.equal(bubble().length,0);r.setFlightPower(4);r.setFreeDrive(id,false);assert.equal(bubble().length,0,'Returning to the automatic route removes the bubble');r.dispose();
console.log('PASS: strong smooth near-ten star-rate ramp, bounded high-speed layer renewal, manual-only CPU bridge bubble/grid.');
