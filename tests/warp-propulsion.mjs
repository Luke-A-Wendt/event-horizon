import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {integratePlanar,speedForWarp,warpCruiseSplit,setPlanarHeading} from '../dist/flight-dynamics.js';
import {warpArcSteering} from '../dist/warp-thrusters.js';
const near=(v,w,t=1e-9)=>assert(Math.abs(v-w)<t*Math.max(1,Math.abs(w)),v+' != '+w);
const B=[[1,0,0],[0,1,0],[0,0,1]],f=()=>({position:[0,0,0],basis:B.map(v=>[...v]),speed:0,angularVelocity:0,headingAngle:0,headingTarget:0});
for(const speed of [4,12,3000,speedForWarp(9.99)]){
 const s=warpCruiseSplit(speed),p=f();assert(s.local===Math.min(12,speed));near(s.local+s.shift,speed);
 p.speed=speed;integratePlanar(p,.5,{}, {warp:true,controlled:true});near(p.position[2],speed*.5);near(p.velocity[2],speed);
}
const turn=f();setPlanarHeading(turn,1.1);const jets=[];
for(let i=0;i<220;i++){
 const prev=turn.angularVelocity;integratePlanar(turn,.05,{}, {warp:true,controlled:true});jets.push(turn.visualJet);
 if(Math.abs(turn.angularVelocity-prev)>1e-5)assert.equal(Math.sign(turn.visualJet),Math.sign(turn.angularVelocity-prev));
}
assert(jets.some(x=>x>.1)&&jets.some(x=>x<-.1));assert.equal(jets.at(-1),0);near(turn.headingAngle,1.1,1e-6);near(turn.position[2],0);
// Positive and negative prescribed torques must match actual curvature of
// the hull-heading history, measured against onboard time (uniform arc fraction).
for(const sweep of [.05,3.7,30]){
 const state=x=>warpArcSteering({arcFraction:x,direction:-1,sweepRadians:sweep}),yaw=x=>sweep*x+state(x).offset;
 for(const x of [.002,.01,.5,.99,.998]){
  const dx=.00002,a=(yaw(x+dx)-2*yaw(x)+yaw(x-dx))/dx**2,j=state(x).jet;
  if(j)assert.equal(Math.sign(a),Math.sign(j));else assert(Math.abs(a)<.0005);
 }
 near(yaw(0),0);near(yaw(1),sweep);assert(Math.abs(yaw(.000001)/.000001)<.001);
}
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const open=id=>{r.loadScene(id);r.sceneLoad=null;r.lastTime=1000;r.state.paused=false;return r.objects.find(o=>o.type==='enterprise');};
const state=o=>{r.fillObjects();r.updateCameraFrame();const f=r.getFocusFrame(o.id);if(f.index>=0){near(r.bodyParamData[f.index*4],f.warpImpulse);near(r.bodyParamData[f.index*4+1],f.warpYawJet,1e-6);}return f;};
try{
 const lab=open('warp-lab');assert.equal(state(lab).warpImpulse,1);assert.equal(state(lab).warpYawJet,0);
 const other=r.addChildObject('space','enterprise',{name:'Second Explorer'});
 assert.equal(state(other).warpImpulse,0,'Only the ship operating a drive has cruise glow.');
 for(const power of [0,.001,1,9.2,0]){r.update({warpFactor:power});assert.equal(state(lab).warpImpulse,Number(power>0));}
 r.setObjectWarp(other.id,true);r.update({warpFactor:2});assert.equal(state(other).warpImpulse,1);assert.equal(state(lab).warpImpulse,0);
 const planet=open('warp-orbit');r.update({warpFactor:0});assert(r.warpEnvelope(state(planet)).strength>0);assert.equal(state(planet).warpImpulse,0);
 const anomaly=open('gravity-anomaly'),commands=[];
 for(let i=1;i<=410;i++){r.advanceSimulation(1000+100*i);commands.push(state(anomaly).warpYawJet);}
 assert(Math.min(...commands)<-.01&&Math.max(...commands)>.01,'Unpiloted curved flight actuates the correct side on successive bends.');
 const tour=open('enterprise-solar-tour'),arc=r.getFlightSequence(tour.id).orbitWait;assert(arc);const seen=[];
 for(let i=0;i<52&&!r.transfer;i++){r.advanceChartStages(.1);seen.push(state(tour).warpYawJet);}
 assert(seen.some(x=>x>.1)&&seen.some(x=>x<-.1),'Actual orbital entry/departure performs two opposite steering firings.');
 assert(r.transfer?.active);near(r.transfer.plan.properSeconds,300);assert.equal(state(tour).warpImpulse,1);
 const escort=open('warp-excursion');let atRestTurn=false;
 for(let i=1;i<=350&&!atRestTurn;i++){r.advanceSimulation(1000+100*i);const s=state(escort);atRestTurn=!s.warpImpulse&&Math.abs(s.warpYawJet)>.1;}
 assert(atRestTurn,'Turning at a waypoint uses a bow jet with the cruise engines off.');
}finally{r.dispose();}
console.log('PASS: constant ship-local cruise, signed bow torque, two independent Explorer hulls, unpowered shield, orbital and anomaly turns, zero-warp reorientation and unchanged warp-tour leg clock.');
