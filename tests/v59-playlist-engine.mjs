import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {advanceAutopilot} from '../dist/autopilot.js';
const make=id=>{const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene(id);r.sceneLoad=null;r.state.paused=false;r.fillObjects();return r;};
const step=(r,seconds)=>{for(let i=0;i<Math.ceil(seconds*10);i++){r.advanceTravel(.1);advanceAutopilot(r,.1);}};
const pose=c=>({position:[...c.flight.position],basis:c.flight.basis.map(v=>[...v]),velocity:[...c.flight.velocity],speed:c.flight.speed});
{
 const r=make('solar-system'),c=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon'),mars=r.objects.find(o=>o.name==='Mars'),earth=r.objects.find(o=>o.name==='Earth');
 r.state.annotations=false;r.state.paused=true;
 assert(r.setFlightSequence(c.id,[{targetId:moon.id},{targetId:mars.id}],{loop:false}));assert(r.startFlightSequence(c.id));assert(r.state.paused,'Playlist editing does not replace global Play');assert(!r.state.annotations,'Guidance does not force labels');assert.deepEqual(r.getFlightSequence(c.id).nodes.map(n=>n.targetId),[moon.id,mars.id]);
 r.state.paused=false;step(r,5.01);r.advanceTravel(1);const current=r.transfer;for(const node of r.flightSequences[c.id].nodes)delete node.kind;
 r.setFlightSequence(c.id,[{targetId:moon.id},{targetId:earth.id}],{loop:true});assert.equal(r.transfer,current,'Future and loop edits retain the live leg');
 const live=pose(c);r.setFlightSequence(c.id,[{targetId:mars.id},{targetId:earth.id}],{loop:true});assert.equal(r.transfer.targetId,moon.id,'Midflight edits finish the committed tangent');assert(r.getFlightSequence(c.id).pendingAtContact);assert.deepEqual({...pose(c),speed:0},{...live,speed:0},'Current destination changes preserve live position, orientation and velocity');assert(Math.abs(c.flight.speed-live.speed)<1e-9);assert(!r.state.annotations);
 const next=pose(c);r.setFlightSequence(c.id,[],{loop:false});assert(!r.transfer);assert.deepEqual(pose(c),next,'Removing all items coasts without a teleport');assert(!r.getFlightSequence(c.id).active);
 assert(r.setNavigationMode(c.id,'manual'));assert(!r.state.annotations);assert(r.setNavigationMode(c.id,'auto'));assert(!r.state.annotations);r.dispose();
}
{
 const r=make('solar-system'),c=r.objects.find(o=>o.type==='shuttle'),earth=r.objects.find(o=>o.name==='Earth'),moon=r.objects.find(o=>o.name==='Moon');
 r.setFlightSequence(c.id,[{targetId:earth.id}],{loop:false});r.startFlightSequence(c.id);step(r,3.6);assert(!r.transfer);assert(r.getFlightSequence(c.id).holding,'A final orbit is perpetual with Loop off');assert.equal(c.parentId,earth.id);assert(!r.getFlightSequence(c.id).error);
 r.setFlightSequence(c.id,[{targetId:earth.id},{targetId:moon.id}],{loop:false});assert(r.getFlightSequence(c.id).orbitWait,'A newly appended leg follows a full orbit');step(r,5.01);assert.equal(r.transfer?.targetId,moon.id);step(r,10.01);assert(r.getFlightSequence(c.id).holding);assert.equal(c.parentId,moon.id);assert(!r.transfer);r.dispose();
}
{
 const r=make('solar-system'),c=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon'),mars=r.objects.find(o=>o.name==='Mars');
 r.setFlightSequence(c.id,[{targetId:moon.id},{targetId:mars.id}],{loop:false});r.startFlightSequence(c.id);step(r,15.1);assert(r.getFlightSequence(c.id).orbitWait,'Intermediate body gets a five-second partial parking arc');assert(!r.transfer);step(r,4.1);assert(!r.transfer);step(r,1.0);assert.equal(r.transfer?.targetId,mars.id);r.dispose();
}
{
 const r=make('test-shuttle-bridge'),c=r.objects[0];r.stopFlightSequence(c.id);r.state.annotations=false;r.setFlightSequence(c.id,[{targetId:'bridge-far-world'}],{loop:false});r.startFlightSequence(c.id);step(r,5.01);assert(r.transfer.crossing,'Bridge crossing is inserted for opposite-side destination');assert(!r.state.annotations);r.setFlightSequence(c.id,[{targetId:'bridge-throat'}],{loop:false});assert.equal(r.getFlightSequence(c.id).nodes[0].kind,'waypoint');assert.equal(r.transfer.targetId,'bridge-throat');r.dispose();
}
{
 const r=make('solar-system'),c=r.objects.find(o=>o.type==='shuttle'),moon=r.objects.find(o=>o.name==='Moon');r.setFlightSequence(c.id,[{targetId:moon.id}],{loop:false});const q=r.flightSequences[c.id];q.active=false;q.orbitWait=null;q.resumeOnPlay=true;r.state.paused=true;advanceAutopilot(r,.1);assert(!r.transfer);r.state.paused=false;advanceAutopilot(r,.1);step(r,5.01);assert.equal(r.transfer.targetId,moon.id,'Global Play resumes imported Auto playlist');assert(!q.resumeOnPlay);r.dispose();
}
console.log('PASS: editable playlists preserve live state and global pause, implicit bridge, finite/single perpetual orbit, full intermediate orbit, and user-controlled labels.');
