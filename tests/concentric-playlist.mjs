import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
r.loadScene('shuttle-earth-moon-loop');r.sceneLoad=null;
const craft=r.objects.find(o=>o.type==='shuttle'),body=craft.parentId,first=craft.orbitMeters,second=first*1.5;
r.setFlightSequence(craft.id,[{targetId:body,radiusMeters:first},{targetId:body,radiusMeters:second}],{loop:true,active:true});
r.state.paused=false;
const arrivals=[];
for(let i=0;i<900&&arrivals.length<4;i++){const t=r.transfer;r.advanceChartStages(.1);const q=r.getFlightSequence(craft.id);assert(!q.error,q.error);if(t&&!r.transfer){arrivals.push(craft.orbitMeters);assert.equal(craft.parentId,body);}}
assert.deepEqual(arrivals,[second,first,second,first]);
const q=r.getFlightSequence(craft.id);r.setFlightSequence(craft.id,[q.nodes[0]],{active:true,loop:false});assert(r.getFlightSequence(craft.id).holding);r.dispose();
console.log('PASS: repeated same-body stops retain distinct radii and alternate over two complete loops; terminal radius holds.');
