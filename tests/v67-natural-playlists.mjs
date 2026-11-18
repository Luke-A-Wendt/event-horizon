import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {advanceAutopilot} from '../dist/autopilot.js';
import {SEQUENCE_ORBIT_SECONDS} from '../dist/flight-sequence.js';
import {arcPlaybackFraction} from '../dist/travel-math.js';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
for(const id of ['warp-orbit','solar-system','shuttle-earth-mars-loop','shuttle-earth-moon-loop','test-shuttle-bridge']){
 r.loadScene(id);const craft=r.objects.find(o=>['shuttle','enterprise'].includes(o.type)),q=r.getFlightSequence(craft.id),parent=r.bridgeParking?.[craft.id]?.targetId||craft.parentId;
 assert.equal(r.getNavigationState(craft.id).mode,'auto');assert(q.active&&q.nodes.some(n=>n.kind==='orbit'&&n.targetId===parent),id);
 if(id==='warp-orbit'){r.setFlightSequence(craft.id,[],{loop:false});assert.equal(r.getFlightSequence(craft.id).nodes[0].targetId,parent);}
 if(!id.endsWith('loop')&&id!=='test-shuttle-bridge')continue;
 const sign=q.orbitWait.direction;assert.equal(sign,-1);const initial=q.orbitWait.startPhase,sweep=q.orbitWait.sweepRadians;r.state.paused=false;
 assert(sweep>=0 && sweep<2*Math.PI);
 for(let i=0;i<40;i++)advanceAutopilot(r,.1);
 const almost=r.getFlightSequence(craft.id).orbitWait;assert(Math.abs((initial-almost.lastPhase)/sweep-arcPlaybackFraction(4/SEQUENCE_ORBIT_SECONDS))<1e-8);assert(!r.transfer);
 for(let i=0;i<10;i++)advanceAutopilot(r,.1);
 assert(r.transfer?.active,id);assert.equal(r.transfer.wallSeconds,10);r.advanceTravel(10);assert(!r.transfer);assert.equal(r.bridgeParking?.[craft.id]?.targetId||craft.parentId,q.nodes.at(id==='test-shuttle-bridge'?2:1).targetId);

}
r.dispose();console.log('PASS: orbit presets enter Auto with their parked body, traverse a partial prograde arc in five seconds, then transfer in ten seconds.');
