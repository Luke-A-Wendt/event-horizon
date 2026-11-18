import assert from 'node:assert/strict';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installPlaylistEditor} from '../dist/playlist-ui.js';
const d=uiDomFixture('<dialog open><div id="editor"></div></dialog>'),mount=d.getElementById('editor');
let changes=0;
const craft={id:'shuttle',type:'shuttle'},r={
 sceneId:'custom',state:{},objects:[craft],getTravelTargets:()=>[{id:'planet',name:'Home',type:'planet'},{id:'gate',name:'Gate',waypoint:true}],
 getFlightSequence:()=>q,setFlightSequence(id,nodes,{loop}){changes++;return q={...q,nodes,loop};}
};
let q={nodes:[{targetId:'planet',kind:'orbit',extraLaps:1,defaultExtraLaps:1,radiusMeters:5e7},{targetId:'gate',kind:'waypoint',heading:15}],active:true,index:0,loop:true};
const editor=installPlaylistEditor(mount,{renderer:()=>r,refresh(){}});editor.refresh(craft,q);
const selector='[data-plan-laps="0"]',field=()=>mount.querySelector(selector),help=()=>mount.querySelector('#flightPlanLapHelp');
assert.equal(field().value,'1');assert.equal(mount.querySelector('[data-plan-laps="1"]'),null);assert(!help().hidden);
field().value='3';field().dispatch('change');assert.equal(q.nodes[0].extraLaps,3);assert(!('defaultExtraLaps' in q.nodes[0]));assert.equal(q.nodes[0].radiusMeters,5e7);
assert.equal(q.nodes[1].heading,15);assert(q.loop);
field().value='0';field().dispatch('change');assert.equal(q.nodes[0].extraLaps,0);assert.equal(field().value,'0');
for(const invalid of ['','1.5','-1','100']){field().value=invalid;field().dispatch('change');assert.equal(q.nodes[0].extraLaps,0);}
assert.equal(changes,2);
q={...q,nodes:[q.nodes[1]]};editor.refresh(craft,q);assert.equal(field(),null);assert(help().hidden);
console.log('PASS: orbit-only lap field, explicit zero, whole-number bounds, uninterrupted playlist metadata.');
