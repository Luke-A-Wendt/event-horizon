import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const mul=(v,s)=>v.map(x=>x*s),sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=v=>Math.hypot(...v),near=(a,b,tol)=>assert(norm(sub(a,b))<tol,JSON.stringify([a,b]));
const make=id=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene(id);r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;return r;};
for(const scene of ['solar-system','warp-orbit','test-shuttle-bridge']){
 const r=make(scene),c=r.objects.find(o=>['shuttle','enterprise'].includes(o.type)),pos=()=>r.getFocusFrame(c.id).position.slice(),start=pos(),frame=r.getFocusFrame(c.id).frame.map(v=>[...v]),delta=()=>sub(pos(),r.getBridgeParkingOrbit(c.id)?.center||r.getFocusFrame(c.parentId).position);
 r.setNavigationMode(c.id,'manual');assert(!c.flight.orbitHold,scene);assert.equal(c.flight.thrust,0);near(pos(),start,1e-11);near(c.flight.basis[2],frame[2],1e-7);
 const p=[...c.flight.position],velocity=[...c.flight.velocity],speed=norm(velocity);assert(speed>0);
 for(let i=1;i<=20;i++){r.advanceSimulation(1000+i*40);r.fillObjects();}
 near(c.flight.velocity,velocity,Math.max(.001,speed*1e-9));const deltaP=sub(c.flight.position,p),along=deltaP.reduce((s,v,i)=>s+v*velocity[i]/speed,0);
 assert(along>0);near(deltaP,mul(velocity,along/speed),Math.max(.01,norm(p)*1e-13));
 if(!r.state.bridge)near(deltaP,mul(velocity,.8),Math.max(.01,norm(p)*1e-13));
 r.dispose();
}
{
 const r=make('solar-system'),c=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');
 r.startTravel(moon.id,{craftId:c.id});for(let j=0;j<60&&!r.transfer;j++)r.advanceChartStages(.1);assert(r.transfer);
 r.advanceTravel(5);const pos=[...c.flight.position],vel=[...c.flight.velocity];r.setNavigationMode(c.id,'manual');
 assert(!r.transfer&&!c.flight.orbitHold);near(c.flight.position,pos,1e-5);near(c.flight.velocity,vel,1e-6);r.dispose();
}
console.log('PASS: Drive leaves orbit with its instantaneous tangent velocity, underway takeover preserves velocity.');
