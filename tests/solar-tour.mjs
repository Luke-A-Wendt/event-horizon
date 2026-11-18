import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene('solar-system');r.sceneLoad=null;
const craft=r.objects.find(o=>o.type==='shuttle'),q=r.flightSequences[craft.id],names=q.nodes.map(n=>r.objects.find(o=>o.id===n.targetId).name);assert.equal(new Set(names).size,12);r.state.paused=false;
for(const stop of q.nodes){const body=r.objects.find(o=>o.id===stop.targetId);
 const minimum=Math.sqrt(1.32712440018e20*r.objectMassSolar(body)/9.80665);assert(stop.radiusMeters>=minimum,body.name);assert(Math.abs(stop.radiusMeters/Math.max(minimum,1.1*r.objectRadius(body)*REFERENCE_RG_METERS)-1)<1e-6,body.name);
}
const visits=[];
for(let i=0;i<2100&&visits.length<12;i++){let t=r.transfer;r.advanceChartStages(.1);if(t&&!r.transfer){const expected=q.nodes.find(n=>n.targetId===craft.parentId);assert(Math.abs(craft.orbitMeters/expected.radiusMeters-1)<1e-6);}
if(t&&!r.transfer)visits.push(r.objects.find(o=>o.id===craft.parentId).name);assert(!q.error,q.error+' '+visits);}
assert.deepEqual(visits,[...names.slice(1),'Sun']);console.log(visits.join(' → '));r.dispose();
