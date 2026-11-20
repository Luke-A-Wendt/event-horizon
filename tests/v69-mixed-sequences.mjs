import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
// Build the synthetic route in open space with only its intended obstacles.
r.loadScene('empty-space');r.sceneLoad=null;r.state.paused=false;
const {id}=r.addChildObject('space','shuttle',{x:0,y:0,z:0});
const craft=r.objects.find(o=>o.id===id),plane=r.configCache.primaryBasis;
function add(type,name,x,z){
 const p=plane[0].map((v,i)=>x*v+z*plane[2][i]);return r.addChildObject('space',type,{x:p[0],y:p[1],z:p[2],name,...(type==='planet'?{radiusMeters:5e6,massSolar:3e-6}:{})}).id;
}
const A=add('waypoint','Home',4e8,0),B=add('waypoint','Survey',1e8,7e8),C=add('planet','Inner world',-5e8,3e8),D=add('planet','Outer world',1e9,1e9);
r.selectedId=craft.id;r.fillObjects();r.focusTarget(craft.id,'track');
const q=()=>r.flightSequences[craft.id],state=()=>r.getFlightSequence(craft.id);
const set=(ids,loop)=>{const result=r.setFlightSequence(craft.id,ids.map(targetId=>({targetId})),{loop,active:true});assert.ok(result&&!result.error,result?.error);assert.deepEqual(result.nodes.map(n=>n.targetId),ids);};
let now=1000;r.lastTime=now;
function tick(){now+=100;r.now=()=>now;r.advanceSimulation(now);r.fillObjects();assert(!q().error,q().error);}
const until=(fn,maxTicks=700)=>{for(let n=0;n<maxTicks&&!fn();n++)tick();assert(fn(),JSON.stringify([q().error,q().index,q().inFlight,q().waitSeconds,r.transfer?.targetId]));};
const fix=()=>r.getFocusFrame(craft.id).position.map(x=>x*RG);
const closeVec=(a,b,tol=.05)=>assert(Math.hypot(...a.map((v,i)=>v-b[i]))<tol);
set([A],false);until(()=>q().holding);assert.equal(craft.waypointHoldId,A);
const parked=fix();for(let n=0;n<20;n++)tick();closeVec(parked,fix());assert.equal(craft.flight.speed,0);
// An edited waypoint heading is acquired at rest before continuing or holding.
const heading=(degrees)=>plane[2].map((v,i)=>v*Math.cos(degrees*Math.PI/180)-plane[0][i]*Math.sin(degrees*Math.PI/180));
r.setFlightSequence(craft.id,[{targetId:A,heading:83}],{loop:false,active:true});assert(q().pointTurn?.arrival);
const here=fix();tick();assert.equal(craft.flight.thrust,0);closeVec(here,fix());until(()=>q().holding);closeVec(craft.waypointHoldBasis[2],heading(83),1e-8);
set([A,B,C,D,A],false);
let turns=0,arcs=0;
for(const destination of [B,C,D,A]){
 until(()=>r.transfer?.targetId===destination||!!q().pointTurn||!!q().orbitWait);
 if(q().pointTurn){turns++;const position=fix();const t=q().pointTurn;tick();assert(t.elapsed>0,'alignment advances in the renderer frame clock');closeVec(fix(),position);assert.equal(craft.flight.speed,0);}
 if(q().orbitWait){arcs++;assert(q().orbitWait.wallSeconds>=4&&q().orbitWait.sweepRadians/q().orbitWait.wallSeconds<=2*Math.PI/24+1e-9);assert(q().orbitWait.orbitalAccelerationG>0);}
 until(()=>r.transfer?.targetId===destination);const leg=r.transfer;assert(leg.wallSeconds>=10);until(()=>r.transfer!==leg);
}
assert.equal(arcs,2);assert(turns>0);assert.equal(craft.waypointHoldId,A);assert(state().holding);assert(!state().loop);assert.equal(craft.flight.speed,0);
set([A,B],true);until(()=>r.transfer?.targetId===B);until(()=>r.transfer?.targetId===A);until(()=>r.transfer?.targetId===B);
const inFlight=r.transfer;set([A,B],false);assert.equal(r.transfer,inFlight);
r.setFlightSequence(craft.id,[{targetId:A},{targetId:B,heading:133}],{loop:false,active:true});assert.equal(r.transfer,inFlight);assert(!q().pendingAtContact);
// Choose the desired terminal heading in a new leg before takeoff.
until(()=>q().holding);assert.equal(craft.waypointHoldId,B);assert.equal(craft.flight.speed,0);closeVec(craft.waypointHoldBasis[2],heading(133),1e-8);
r.setFlightSequence(craft.id,[{targetId:B},{targetId:A,heading:-121},{targetId:B,heading:58}],{loop:false,active:true});
until(()=>r.transfer?.targetId===A);until(()=>q().pointTurn?.arrival);const atA=fix();assert.equal(craft.flight.speed,0);
until(()=>!q().pointTurn?.arrival);closeVec(atA,fix());closeVec(q().pointTurn.start,heading(-121),1e-8);
until(()=>r.transfer?.targetId===B);until(()=>q().pointTurn?.arrival);const atB=fix();until(()=>q().holding);closeVec(atB,fix());closeVec(craft.waypointHoldBasis[2],heading(58),1e-8);

set([B,C,D],true);until(()=>r.transfer?.targetId===C);until(()=>!!q().orbitWait&&q().orbitWait.targetId===C);set([C],false);assert(q().holding);for(let n=0;n<20;n++)tick();assert.equal(craft.parentId,C);assert(!r.transfer);
// A replacement whose last item happens to equal the occupied station
// still executes its first item; sitting at its end must not skip the list.
set([A,C],false);until(()=>r.transfer?.targetId===A);until(()=>r.transfer?.targetId===C);until(()=>q().holding);assert.equal(craft.parentId,C);
set([C,B,A],false);until(()=>r.transfer?.targetId===B);tick();set([A,C],false);assert(q().pendingAtContact);assert.equal(r.transfer?.targetId,B);until(()=>r.transfer?.targetId===A);tick();const pose=[...craft.flight.position],vel=[...craft.flight.velocity];
assert(r.setNavigationMode(craft.id,'manual'));assert(!r.transfer);assert(!q().active);closeVec(pose,craft.flight.position);closeVec(vel,craft.flight.velocity);
r.dispose();
console.log('PASS: mixed editable point/point/body/body/point routes, rest turns on renderer clock, loop toggle, both terminal states, deferred reorder and manual handoff.');
