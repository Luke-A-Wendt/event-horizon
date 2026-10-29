import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
const f=fixture({width:390,height:720});const document=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));globalThis.document=document;globalThis.window=document.createElement('window');
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false}),$=id=>document.getElementById(id);
const ui=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,setPaused:paused=>r.update({paused}),refresh(){},closePanels(){}});
r.loadScene('solar-system');r.sceneLoad={state:'ready',revision:1};r.lastTime=1000;
const shuttle=r.objects.find(o=>o.type==='shuttle'),enterprise=r.objects.find(o=>o.type==='enterprise'),moon=r.objects.find(o=>o.name==='Moon'),earth=r.objects.find(o=>o.name==='Earth');assert(shuttle&&enterprise&&moon&&earth);assert.equal(r.selectedId,shuttle.id);
function flight(craft,target){
 assert(ui.start(craft.id));r.update({annotations:true});ui.update();assert(ui.previewTravel(target.id));assert(!$('pilotTravel').hidden);assert(!$('pilotTripGo').hidden);const estimate=r.previewTravel(target.id);assert(estimate.coordinateSeconds>0);assert.equal(r.getTravelState().active,false);$('pilotTripGo').click();assert(r.getTravelState().active);assert($('pilotPower').disabled);assert.equal(r.sceneLoad.state,'ready','Travel does not enter scene loading');
 let sawMidway=false,sawField=false;for(let i=0;i<100&&r.getTravelState().active;i++){r.advanceSimulation(r.lastTime+100);r.fillHoles();r.fillObjects();r.updateCameraFrame();ui.update();assert.equal(r.focusId,craft.id);assert.equal(r.sceneLoad.state,'ready');if(i===35){sawMidway=true;assert(r.getTravelState().coordinateElapsedSeconds>0);assert(!$('pilotTripProgress').hidden);}if(craft.type==='enterprise'&&r.state.warpFactor>0)sawField=true;}
 assert(sawMidway);if(craft.type==='enterprise')assert(sawField);assert(!r.getTravelState().active);assert.equal(craft.parentId,target.id);assert(craft.orbitMeters>=2*target.radiusMeters);assert.equal(r.driveId,null);assert.equal(r.focusId,craft.id);assert.equal(r.focusMode,'track');assert($('pilotTravel').hidden);assert($('pilotControls').hidden);assert(r.getTravelState().coordinateElapsedSeconds>=estimate.coordinateSeconds*.99);
}
flight(shuttle,moon);assert(shuttle.clock.lagSeconds>0,'Accelerated trip contributes lifetime dilation');flight(enterprise,earth);assert(!enterprise.clock,'Enterprise remains exempt');ui.dispose();r.dispose();
console.log('PASS: real Solar System renderer and pilot UI complete Shuttle 1g and Enterprise Warp1 Go flights, accelerated clock/field activity, arrival reparenting and camera continuity with no loader.');
