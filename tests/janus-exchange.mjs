import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {restoreRenderer,snapshotRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';

const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make(),copy=make(),worker=make(),step=(v,seconds)=>{for(let i=0;i<Math.round(seconds*10);i++)v.advanceSimulation(v.lastTime+100);};
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])), near=(a,b,e,msg)=>assert(Math.abs(a-b)<=e,msg+' '+a+' vs '+b);
const resume=v=>{v.sceneLoad=null;v.state.paused=false;v.lastTime=1000;};
try{
 r.loadScene('earth-andromeda-bridge');resume(r);
 const pod=r.objects.find(o=>o.hullModel==='janusPod'),earth=r.objects.find(o=>o.catalogId==='earth'),away=r.objects.find(o=>o.catalogId==='aster-vale'),moon=r.objects.find(o=>o.parentId===earth.id&&o.type==='moon');
 const state=()=>r.getJanusBridge(pod.id);
 const realOrbit=(v,host)=>{
  const p=v.objectById.get(pod.id),f=v.getFocusFrame(pod.id),h=v.getFocusFrame(host.id),vel=f.velocity.map((x,i)=>(x-h.velocity[i])*299792458/18);
  assert.equal(p.parentId,host.id);near(dist(f.position,h.position)*RG,p.orbitMeters,.003,'physical orbit radius (m)');
  near(Math.hypot(...vel),Math.sqrt(1.32712440018e20*h.massSolar/p.orbitMeters),.02,'orbital speed relative to parent');
  near(f.position.reduce((c,x,i)=>c+(x-h.position[i])*vel[i],0),0,1e-7,'tangent, no radial drift');
 };
 realOrbit(r,earth);assert.deepEqual(state().stops,[earth.id,away.id]);assert(state().loop);assert(!r.state.bridge);
 const phase0=r.currentPhase(pod);step(r,4);assert.notEqual(r.currentPhase(pod),phase0);realOrbit(r,earth);
 step(r,4);assert.equal(state().stage,'charge');const prior=state().progress;
 r.state.paused=true;step(r,2);near(state().progress,prior,1e-10,'pause');r.state.paused=false;
 assert.equal(r.startJanusExchange(pod.id,away.id),false,'reject double request');step(r,2.6);assert.equal(state().exchanges,0);
 const bridge=r.getJanusExchangeVisual(pod.id);assert.equal(bridge.oppositeId,away.id);
 const eyeRange=r.camera.focusDistance,forward=r.getFocusFrame(pod.id).frame[2].slice(),fromClock=pod.clock.properSeconds;
 const instant=v=>{resume(v);step(v,.1);};
 restoreRenderer(copy,parseScene(serializeScene(r)));instant(r);instant(copy);
 for(const v of [r,copy]){assert.equal(v.getJanusBridge(pod.id).exchanges,1);realOrbit(v,away);assert.equal(v.getJanusBridge(pod.id).stage,'settle');}
 assert.equal(r.getJanusExchangeVisual(pod.id).oppositeId,earth.id);
 near(r.camera.focusDistance,eyeRange,.01,'same size cabin across exchange');assert(dist(r.getFocusFrame(pod.id).frame[2],forward)<.08,'smooth orbital tangent');assert(pod.clock.properSeconds>=fromClock);
 const delta=r.getFocusFrame(away.id).position.map((x,i)=>x-r.getFocusFrame(pod.id).position[i]);
 assert(dist(bridge.oppositeOffset,delta)<.05*Math.hypot(...delta),'portal position joins actual orbit');
 assert(!r.objectFrames.some(o=>o.id===earth.id));assert(r.frameById.has(earth.id),'off-screen planet remains addressable');
 assert.equal(r.startJanusExchange(pod.id,earth.id),false);
 restoreRenderer(worker,snapshotRenderer(r));realOrbit(worker,away);
 restoreRenderer(copy,parseScene(serializeScene(r)));resume(copy);step(copy,.1);assert.equal(copy.getJanusBridge(pod.id).exchanges,1,'restoring the committed pulse does not jump twice');
 step(r,13);realOrbit(r,earth);assert.equal(state().exchanges,2);
 // Seizing the helm during a pending automatic charge aborts that jump.
 step(r,12);assert.equal(state().stage,'charge');assert(r.setNavigationMode(pod.id,'manual'));assert(!state().auto);assert.equal(state().stage,'orbit');
 step(r,18);assert.equal(state().exchanges,2);assert.equal(r.driveId,pod.id);
 assert(r.startJanusExchange(pod.id,moon.id));step(r,5.5);realOrbit(r,moon);
 assert(pod.flight.orbitHold);assert.equal(r.getNavigationState(pod.id).mode,'manual');assert(!state().auto);
 // A custom point belongs to the same local chart in SI; a galactic address
 // carries a separate chart origin and must never be added to cabin meters.
 const local=[-42000000,19,730000000];assert(r.startJanusExchange(pod.id,{position:local}));step(r,5.5);
 near(dist(pod.flight.position,local),0,.001,'local SI coordinate');
 const addr=[-1052222.75,842.53,210000.125];assert(r.startJanusExchange(pod.id,{addressLy:addr,label:'Perseus field'}));step(r,5.5);
 assert.deepEqual(state().addressLy,addr);assert.equal(pod.parentId,'space');assert(r.objectFrames.every(o=>o.id===pod.id));near(Math.hypot(...pod.flight.position),0,1e-5,'small local coordinate chart');
 restoreRenderer(copy,parseScene(serializeScene(r)));assert.deepEqual(copy.getJanusBridge(pod.id).addressLy,addr);assert(copy.objectFrames.every(o=>o.id===pod.id));
 assert(!r.startJanusExchange(pod.id,{addressLy:addr}));assert(!r.startJanusExchange(pod.id,{addressLy:[1e300,0,0]}));
 assert(r.startJanusExchange(pod.id,earth.id));step(r,5.5);realOrbit(r,earth);assert.equal(state().addressLy,null);
 assert(r.setJanusItinerary(pod.id,[earth.id,moon.id],false));assert(r.setJanusAuto(pod.id,true));step(r,28);
 assert.equal(state().auto,false);assert.equal(pod.parentId,moon.id);realOrbit(r,moon);
 // The same ship and controls work in the open-space vehicle gallery, where
 // the departure has no planet. Deep space never transports its neighbours.
 r.loadScene('shuttle-space');resume(r);const ship=r.objects.find(o=>o.hullModel==='janusPod');
 assert(ship);r.setNavigationMode(ship.id,'manual');const original=ship.flight.position.slice();
 assert(r.startJanusExchange(ship.id,{addressLy:addr}));step(r,5.5);
 assert.equal(r.objectFrames.length,1);assert(r.getJanusBridge(ship.id).targets.some(t=>t.id==='janus-departure'));
 assert(r.startJanusExchange(ship.id,'janus-departure'));step(r,5.5);assert(r.objectFrames.length>1);
 near(dist(ship.flight.position,original),0,.001,'returned to formation');
 console.log('Janus exchange: stable parking orbits, paired remote optics, pause, network/file handoff, manual and automatic authority, local/deep coordinates, and return.');
}finally{r.dispose();copy.dispose();worker.dispose();}
