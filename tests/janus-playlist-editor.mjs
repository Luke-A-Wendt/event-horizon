import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {advanceJanusExchanges} from '../dist/janus-exchange.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true}),r=make(),copy=make();
const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=d;d.body=d.querySelector('body');globalThis.window=d.createElement('window');Object.assign(window,{innerWidth:375,innerHeight:667,devicePixelRatio:1,matchMedia:()=>({matches:false})});
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{configurable:true,get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const e=create(tag);if(tag==='progress')Object.defineProperty(e,'max',{writable:true,value:1});return e;};
const el=id=>d.getElementById(id);
const controls=installPilotControls({mount:el('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){},setPaused(on){r.state.paused=on;}});
const near=(a,b,eps=.03)=>assert(Math.abs(a-b)<eps,JSON.stringify([a,b,eps]));
try{
 r.loadScene('janus-solar-tour');r.sceneLoad=null;controls.update();
 const pod=r.objects.find(o=>o.hullModel==='janusPod'),id=pod.id,lookup=key=>r.objects.find(o=>o.catalogId===key).id;
 const at=()=>r.getJanusBridge(id),queue=()=>r.getFlightSequence(id),age=n=>{r.state.paused=false;advanceJanusExchanges(r,n);r.fillObjects();};
 const e=lookup('earth'),moon=lookup('301'),mars=lookup('mars'),j=lookup('jupiter');
 el('pilotPlaylist').click();assert(el('vehiclePlaylistDialog').open);assert(r.state.paused);assert.equal(queue().nodes.length,12);
 assert(el('flightPlanStops').innerHTML.includes('Bridge exchange'));assert(!el('flightPlanStops').querySelector('[data-plan-warp]'));
 // Edit the plan in one dialog: keyboard move, remove, add twice and turn off Loop.
 const grip=()=>el('flightPlanStops').querySelector('[data-stop-index="5"]').querySelector('.route-grip');
 grip().dispatch('keydown',{key:'Home'});assert.equal(queue().nodes[0].targetId,mars);
 el('flightPlanStops').querySelector('[data-plan-remove="0"]').click();assert(!queue().nodes.find(n=>n.targetId===mars));
 const pick=el('flightPlanDestination');pick.value=mars;pick.dispatch('change');assert.equal(queue().nodes.at(-1).targetId,mars);
 el('flightPlanLoop').click();assert.equal(queue().loop,false);
 el('vehiclePlaylistDialog').close();
 // Live edits during a charge preserve that exchange; ordering controls the subsequent one.
 r.setFlightSequence(id,[e,moon,mars].map(targetId=>({targetId})),{loop:false});age(12.4);assert.equal(at().stage,'charge');assert.equal(at().destinationId,moon);
 r.setFlightSequence(id,[e,moon,j,mars].map(targetId=>({targetId})),{loop:false});age(5.1);assert.equal(at().currentId,moon);
 age(15.2);assert.equal(at().currentId,j);assert.equal(at().exchanges,2);
 // Alter the occupied parking radius in the player. Smooth local warp reaches
 // it without opening a bridge; importing a half-complete maneuver yields the same endpoint.
 age(3);const radius=pod.orbitMeters,newR=radius*1.08;const oldX=r.getFocusFrame(id).position.slice();
 const q=queue();const update=q.nodes.map(n=>n.targetId===j?{...n,radiusMeters:newR}:n);
 assert(r.setFlightSequence(id,update,{loop:false}));assert.equal(at().stage,'local');
 age(3);assert(!r.getJanusExchangeVisual(id));assert(r.state.warp);assert(r.getFocusFrame(id).position.every(Number.isFinite));
 restoreRenderer(copy,parseScene(serializeScene(r)));copy.sceneLoad=null;copy.state.paused=false;
 age(5);advanceJanusExchanges(copy,5);assert.equal(pod.orbitMeters,newR);assert.equal(copy.objectById.get(id).orbitMeters,newR);assert.equal(at().exchanges,2);
 assert.notDeepEqual(r.getFocusFrame(id).position,oldX);
 // A nearby waypoint in open space uses a continuous short maneuver; a
 // waypoint beyond the local neighborhood uses the bridge instead.
 r.loadScene('shuttle-space');r.sceneLoad=null;r.state.paused=false;
 const free=r.objects.find(o=>o.hullModel==='janusPod'),p=r.getFocusFrame(free.id).position.map(v=>v*REFERENCE_RG_METERS);
 const waypoint=(dx)=>{const w=r.addChildObject('space','waypoint');r.updateObject(w.id,{x:p[0]+dx,y:p[1],z:p[2]});return w.id;};
 const nearId=waypoint(2300),far=waypoint(5e8);
 assert(r.startTravel(nearId,{craftId:free.id}));assert.equal(r.getJanusBridge(free.id).stage,'local');age(4);
 near(r.getFocusFrame(free.id).position[0]*REFERENCE_RG_METERS-p[0],1150,2);assert.equal(r.getJanusBridge(free.id).exchanges,0);
 age(4.2);assert.equal(free.waypointHoldId,nearId);assert(r.startTravel(far,{craftId:free.id}));assert.equal(r.getJanusBridge(free.id).stage,'charge');
 console.log('PASS: Janus standard player adds/removes/reorders, edits during a jump, preserves its next stop, smoothly changes parking radius, and distinguishes nearby and distant waypoints.');
}finally{controls.dispose();r.dispose();copy.dispose();}
