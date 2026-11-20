import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls,logSpeedRatio} from '../dist/pilot-ui.js';
import {formatClockDuration} from '../dist/object-clocks.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=d;globalThis.window=d.createElement('window');d.body=d.querySelector('body');
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const el=create(tag);if(tag==='progress')Object.defineProperty(el,'max',{writable:true,value:1});return el;};
const el=id=>d.getElementById(id),ui=installPilotControls({mount:el('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){}});
for(const scene of ['shuttle-proxima-direct','shuttle-sgra-direct']){
 r.loadScene(scene);r.sceneLoad=null;ui.update();
 assert(!el('tourEstimate').hidden,'Read the leg before pressing Play');
 const arc=r.getFlightSequence(r.selectedId).orbitWait,initialTime=el('tourShipTime').textContent;
 assert.equal(initialTime,(arc.transferSeconds/31557600).toLocaleString('en-US',{maximumSignificantDigits:3})+' yr');
 assert.match(el('tourDistance').textContent,/ly$/);
 r.state.paused=false;
 for(let i=0;i<300&&!r.transfer?.active;i++)r.advanceChartStages(.05);
 assert(r.transfer?.active,'Transfer launches');r.advanceChartStages(.5);ui.update();
 const state=r.getTravelState();assert.equal(el('pilotFlightRemaining').textContent,formatClockDuration(state.remainingProperSeconds));
 assert.equal(el('tourShipTime').textContent,initialTime);
 r.transfer.properSeconds=31557599;ui.update();assert(el('tourEstimate').hidden);
 assert(!el('pilotDilationRateRow').hidden,'Live rate visible while comparison is active');
}
r.loadScene('bridge');ui.update();assert(el('tourEstimate').hidden,'Wormhole retains existing HUD');
console.log('PASS: direct tour estimates before Play, year threshold, live onboard ETA, and preserved bridge HUD.');
r.loadScene('warp-lab');ui.update();
assert(!el('pilotControls').querySelector('#pilotLegSpeed'));
assert(el('pilotSpeedLog').parentElement.classList.contains('warp-ratio'));
assert.equal(el('pilotRatioLabel').textContent,'v/c ~ ');assert.equal(el('pilotSpeedLog').innerHTML,'10<sup>2.0</sup>');
for(const w of [0,1]){
 r.setFlightPower(w);ui.update();assert(!el('pilotSpeedLog').parentElement.hidden);
 assert.equal(el('pilotSpeedLog').innerHTML,w?'10<sup>0.0</sup>':'0');
}
for(const scene of ['earth-vulcan','warp-proxima-direct','warp-sgra-direct']){
 r.loadScene(scene);ui.update();assert.equal(el('pilotPower').getAttribute('max'),'4');
 const choice=scene==='earth-vulcan'?'Moon':'Sun',target=r.objects.find(o=>o.name===choice);assert(ui.previewTravel(target.id));
 assert.equal(el('pilotTripWarp').getAttribute('max'),'4');assert.equal(el('pilotTripWarp').value,'4');
 assert.equal(el('pilotTripTarget').textContent,choice);ui.closeTravel();
}
r.loadScene('shuttle-proxima-direct');ui.update();
const log=el('pilotSpeedLog'),logRow=log.parentElement;
assert(!logRow.hidden&&!logRow.classList.contains('warp-ratio')&&!logRow.classList.contains('metric-alert'));
assert.equal(el('pilotRatioLabel').textContent,'v/c ~ ');
assert.equal(log.innerHTML,'10<sup>−4.1</sup>','The displayed departure speed is sublight');
r.state.paused=false;for(let i=0;i<2000;i++){r.advanceChartStages(.025);if(r.transfer?.progress>.49)break;}ui.update();
assert(logRow.classList.contains('metric-alert'));assert.equal(el('pilotRatioLabel').textContent,'');
assert.equal(log.innerHTML,'10<sup>−0.1</sup> &lt; v/c &lt; 1','Round toward a sublight interval near c');
assert.equal(logSpeedRatio(0),-Infinity);
assert.equal(logSpeedRatio(.1),-1);
assert.equal(logSpeedRatio(.01),-2);
assert(logSpeedRatio(1,1e10)<0);
assert.equal(logSpeedRatio(1),0);
assert(Number.isNaN(logSpeedRatio(1.1)));
