import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integratePlanar,setPlanarHeading,speedForWarp} from '../dist/flight-dynamics.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installPilotControls} from '../dist/pilot-ui.js';
const close=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const make=warp=>({position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],speed:warp?speedForWarp(4):40,velocity:[0,0,40],thrust:0,headingAngle:0,headingTarget:0,angularVelocity:0,curvature:0,torsion:0});
for(const warp of [false,true]){
 const f=make(warp);setPlanarHeading(f,Math.PI/2);const steps=[];
 for(let i=0;i<160;i++){integratePlanar(f,.05,{}, {warp,controlled:true});steps.push(f.angularVelocity);assert(f.headingAngle<=Math.PI/2+1e-9);assert(Math.abs(f.angularVelocity)<=.65+1e-9);}
 close(f.headingAngle,Math.PI/2);close(f.angularVelocity,0);assert(steps[0]>0&&steps[0]<steps[5],'Heading accelerates smoothly rather than jumping');
 if(!warp)assert.deepEqual(f.velocity,[0,0,40],'Attitude changes do not rotate a coasting Shuttle velocity');
 const fixed=f.headingAngle;for(let i=0;i<20;i++)integratePlanar(f,.05,{}, {warp,controlled:true});close(f.headingAngle,fixed);
 for(let i=0;i<20;i++)integratePlanar(f,.05,{curvature:-1},{warp,controlled:true});assert(f.headingTarget<fixed-.59,'Held A changes desired heading');
 for(let i=0;i<120;i++)integratePlanar(f,.05,{}, {warp,controlled:true});close(f.angularVelocity,0);
 const wrap=make(warp);wrap.headingAngle=3.1;setPlanarHeading(wrap,-3.1);assert(wrap.headingTarget>3.1&&wrap.headingTarget<3.2,'Heading target wraps through the short angular path');
}
const f=fixture({width:360,height:600}),document=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));globalThis.document=document;globalThis.window=document.createElement('window');
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false}),$=id=>document.getElementById(id);
const pilot=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,setPaused:paused=>r.update({paused}),refresh(){}});
r.loadScene('warp-cruise');let ship=r.objects.find(o=>o.type==='enterprise');r.update({speed:2});assert(pilot.start(ship.id));assert.equal(r.state.speed,2);assert.equal(r.focusId,ship.id);assert.equal(r.focusMode,'track');assert.equal(r.state.viewMode,'orbit');
assert.equal($('pilotHeading'),null,'Heading slider is removed');assert($('pilotLeft')&&$('pilotRight'));
for(let i=0;i<12;i++)$('pilotRight').click();close(r.getFlightState().headingTargetDegrees,60);r.lastTime=1000;
for(let i=1;i<=160;i++)r.advanceSimulation(1000+i*100);assert(r.getFlightState().headingDegrees>50);pilot.update();assert.equal($('pilotHeadingValue').textContent,'60°');
const parsed=parseScene(serializeScene(r)),saved=parsed.objects.find(o=>o.id===ship.id);close(saved.flight.headingTarget,Math.PI/3);assert(Number.isFinite(saved.flight.headingAngle));
$('pilotStop').click();assert.equal(r.state.speed,2);assert.equal(r.focusId,ship.id);
r.loadScene('bridge');ship=r.objects.find(o=>o.type==='enterprise');assert(pilot.start(ship.id));assert.equal(r.getFlightState().flightMode,'warp');assert.equal($('pilotPower').max,'9.9999');assert.equal($('pilotVelocityLabel').textContent,'Warp');$('pilotPower').value='5';$('pilotPower').dispatch('input');close(r.getFlightState().warpFactor,5);$('pilotStop').click();
r.loadScene('shuttle-space');ship=r.objects.find(o=>o.type==='shuttle');assert(pilot.start(ship.id));assert.equal(r.getFlightState().thrustSetting,0);for(let i=0;i<6;i++)$('pilotLeft').click();r.lastTime=20000;r.advanceSimulation(20100);assert(r.getFlightState().steeringInput<0,'Left heading fires the right-side corrective nozzle');
for(let i=2;i<=100;i++)r.advanceSimulation(20000+i*100);close(r.getFlightState().steeringInput,0);for(let i=0;i<12;i++)$('pilotRight').click();r.advanceSimulation(30100);assert(r.getFlightState().steeringInput>0,'Right heading fires the left-side corrective nozzle');
r.update({paused:true});assert.equal(r.getFlightState().steeringInput,0,'Paused correction produces no thruster emission');
pilot.dispose();r.dispose();console.log('PASS: smooth direct headings, shortest-path wrap, zero settled turn, held-key target control, inertial Shuttle coasting, opposite-side RCS signal, quantized corner arrows, serialized headings, playback speed preserved across Drive entry/exit and centered track.');
