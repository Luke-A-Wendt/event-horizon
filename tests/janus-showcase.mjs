import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';

const renderer=new BlackHoleRenderer(fixture({width:960,height:632}).canvas,{autoStart:false,bindControls:false});
const id='earth-andromeda-bridge';
try{
 renderer.loadScene(id);
 const byModel=()=>renderer.objects.find(o=>o.hullModel==='janusPod');
 const pod=byModel();
 assert.equal(renderer.focusId,pod.id);
 assert.equal(renderer.state.bridge,false,'The ship carries the aperture, so there is no fixed wormhole in space.');
 renderer.sceneLoad=null;renderer.state.paused=false;renderer.lastTime=1000;
 let previous=renderer.getObjectClock(pod.id),visits=[],clockSteps=[],stages=new Set(),completed=0;
 for(let tick=1;tick<=400&&!(completed>=2&&stages.has('return-closed'));tick++){
  const priorTime=renderer.time;renderer.advanceSimulation(1000+tick*100);renderer.fillObjects();
  const route=renderer.getJanusBridge(pod.id),clock=renderer.getObjectClock(pod.id);
  stages.add(route.stage);
  if(route.exchanges>=2&&route.stage==='orbit')stages.add('return-closed');
  if(visits.at(-1)!==route.currentLabel)visits.push(route.currentLabel);
  assert.equal(renderer.focusId,pod.id);
  assert(clock.properSeconds>=previous.properSeconds);
  const delta=clock.properSeconds-previous.properSeconds,chart=(renderer.time-priorTime)*18*REFERENCE_RG_METERS/299792458;
  assert(Math.abs(delta-chart)<Math.max(.001,chart*1e-5),'Cabin time must follow local orbit pace, even across a chart exchange.');clockSteps.push(delta);
  assert(clock.distantSpeedMetersPerSecond<1e5&&clock.distantSpeedMetersPerSecond>100,'Readout must describe the local orbit, including the exchange frame.');
  const local=new Set(renderer.objectFrames.map(o=>o.catalogId));
  assert(local.has('nasa-janus'));assert.equal(local.has('sun'),route.currentLabel==='Earth');assert.equal(local.has('m31-lyra'),route.currentLabel==='Aster Vale');
  previous=clock;completed=route.exchanges;
 }
 assert.deepEqual(visits,['Earth','Aster Vale','Earth']);
 assert(stages.has('charge')&&stages.has('settle')&&stages.has('return-closed'));
 assert(Math.max(...clockSteps)<1000,'Jump distance leaked into cabin time.');
 renderer.loadScene('shuttle-space');
 assert.equal(renderer.getJanusBridge(byModel().id).active,false);assert.equal(renderer.getJanusBridge(byModel().id).auto,false);
 renderer.loadScene(id);
 assert.equal(renderer.getJanusBridge(byModel().id).exchanges,0);
 assert.equal(renderer.getJanusBridge(byModel().id).currentLabel,'Earth');
 assert.equal(renderer.getObjectClock(byModel().id).properSeconds,0);
 console.log('PASS: an uninterrupted Earth–Aster Vale–Earth loop, local clocks and speeds at both exchanges, separate skies, clean fleet visit and scene replay.');
}finally{renderer.dispose();}
