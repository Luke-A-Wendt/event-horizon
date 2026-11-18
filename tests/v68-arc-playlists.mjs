import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {advanceAutopilot} from '../dist/autopilot.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),tau=2*Math.PI;
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
r.loadScene('solar-system');r.sceneLoad=null;r.state.paused=false;r.fillObjects();
const c=r.objects.find(o=>o.type==='shuttle'),stops=['Sun','Mercury','Mars'].map(name=>r.objects.find(o=>o.name===name));
r.setFlightSequence(c.id,stops.map(o=>({targetId:o.id})),{loop:true});assert(r.startFlightSequence(c.id));
let initialHeight,firstStep;
for(let i=0;i<4;i++){
 const q=r.getFlightSequence(c.id),arc=q.orbitWait,leg=arc.leg;assert(q.loop);assert.equal(arc.targetId,stops[i%3].id);assert(arc.sweepRadians>=0&&arc.sweepRadians<tau);assert.equal(arc.wallSeconds,5);assert(arc.orbitalAccelerationG>0);assert(arc.durationSeconds>=0);
 initialHeight??=leg.planeHeightMeters;assert(Math.abs(leg.planeHeightMeters-initialHeight)<.01);
 firstStep??=leg.start;if(i===3)assert(Math.hypot(...sub(leg.start,firstStep))<.01,'One complete cycle returns to the same contact');
 for(let j=0;j<50;j++)advanceAutopilot(r,.1);
 const t=r.transfer;assert(t?.active);assert.equal(t.targetId,stops[(i+1)%3].id);assert.equal(t.wallSeconds,10);
 const line=sub(leg.end,leg.start),L=Math.hypot(...line);let previous=-1;
 for(let j=0;j<100;j++){r.advanceTravel(.1);if(!r.transfer)break;const p=sub(c.flight.position,leg.start),s=dot(p,leg.tangent),lateral=Math.hypot(...p.map((x,k)=>x-s*leg.tangent[k]));assert(lateral<Math.max(.05,L*1e-12));assert(s>=previous-.01);previous=s;}
 assert(!r.transfer);assert.equal(c.parentId,t.targetId);advanceAutopilot(r,.01);
}
r.setFlightSequence(c.id,[{targetId:c.parentId}],{loop:true});assert(r.getFlightSequence(c.id).holding);assert(!r.getFlightSequence(c.id).orbitWait);
r.setFlightSequence(c.id,[{targetId:c.parentId},{targetId:stops[0].id}],{loop:true});
r.setFlightSequence(c.id,[{targetId:stops[0].id}],{loop:true});assert.deepEqual(r.getFlightSequence(c.id).nodes.map(n=>n.targetId),[stops[0].id]);assert(r.getFlightSequence(c.id).orbitWait);
for(let i=0;i<50;i++)advanceAutopilot(r,.1);assert.equal(r.transfer?.targetId,stops[0].id);r.advanceTravel(10);advanceAutopilot(r,.01);assert(r.getFlightSequence(c.id).holding);assert.equal(c.parentId,stops[0].id);r.dispose();console.log('PASS: three-body cycle wraps its actual incoming and outgoing contacts, one fixed plane, 5s partial orbit/10s straight, single-body perpetual parking');
