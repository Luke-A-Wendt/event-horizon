import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installPilotControls} from '../dist/pilot-ui.js';
import {formatClockDuration} from '../dist/object-clocks.js';

for(const bridge of [false,true]){
 const document=uiDomFixture('<main id="scene" class="scene has-viewport-ui"><div class="scene-bottom"></div><button id="cameraToggle">Camera</button><div id="pilotControls"></div></main>');
 globalThis.document=document;globalThis.window=document.createElement('window');
 const $=id=>document.getElementById(id),state={paused:false,bridge},objects=[{id:'shuttle',type:'shuttle',name:'Shuttle'}];
 let trip={active:true,craftId:'shuttle',craftType:'shuttle',targetName:bridge?'Other mouth':'Moon',properSeconds:3600,properElapsedSeconds:0,progress:0,phaseIndex:0,commandedThrustG:1},flight=null,cameraChanges=0,cancelled=0,resizeCount=0,headingCalls=0;
 const renderer={state,objects,focusId:'shuttle',focusMode:'track',selectedId:'shuttle',driveId:null,
  getTravelState:()=>trip,getFlightState:()=>flight,getObjectClock:()=>({name:'Shuttle',lagSeconds:12,rateFactor:1.2}),setFlightInput(){},
  cancelTravel(){cancelled++;trip={...trip,active:false,phase:'Cancelled'};},
  setFreeDrive(id,on){this.driveId=on?id:null;flight=on?{id,type:'shuttle',thrustSetting:0,headingTargetDegrees:0}:null;return true;},
  focusTarget(){cameraChanges++;},look(){cameraChanges++;},updateCameraFrame(){cameraChanges++;},resize(){resizeCount++;},
  setFlightHeading(value){headingCalls++;flight.headingTargetDegrees=value;},setFlightPower(value){flight.thrustSetting=value;}
 };
 const ui=installPilotControls({mount:$('pilotControls'),renderer:()=>renderer,state:()=>state,setPaused:value=>state.paused=value,refresh(){}});
 try{
  ui.update();assert($('pilotControls').hidden);assert(!$('pilotFlightReadout').hidden);assert($('scene').classList.contains('has-flight-readout'));assert(!$('scene').classList.contains('has-flight-controls'),'Autopilot does not reserve the manual Drive strip');
  assert.equal($('pilotFlightTotal').textContent,formatClockDuration(3600));assert.equal($('pilotFlightRemaining').textContent,formatClockDuration(3600));assert.equal($('pilotFlightPercent').textContent,'0%');
  assert.equal($('pilotFlightStage').textContent,'Leaving orbit');assert.equal($('pilotFlightAcceleration').textContent,'1.0 g');assert.equal(cameraChanges,0);assert.equal(resizeCount,1);
  assert($('pilotSpeedRow').hidden);assert($('pilotTurnRow').hidden);assert($('pilotOnboardRow').hidden);assert(!$('pilotDilationRow').hidden);assert.equal($('pilotDilation').textContent,formatClockDuration(12),'Lifetime clock stays in its existing readout');assert(!$('pilotFlightReadout').contains($('pilotDilation')));
  assert(!$('cameraToggle').disabled);assert($('pilotTravel').hidden,'No floating travel card covers the craft');
  for(const [index,stage] of ['Leaving orbit','Accelerating','Flip and burn','Decelerating','Entering orbit'].entries()){
   trip={...trip,phaseIndex:index,stage,progress:index/4,properElapsedSeconds:index*900,remainingProperSeconds:3600-index*900,commandedThrustG:index===2?0:1};ui.update();
   assert.equal($('pilotFlightStage').textContent,stage);assert.equal($('pilotFlightAcceleration').textContent,index===2?'0.0 g':'1.0 g');assert.equal($('pilotFlightPercent').textContent,index*25+'%');assert.equal(Number($('pilotFlightProgress').value),index/4);assert.equal($('pilotFlightRemaining').textContent,formatClockDuration(3600-index*900));
  }
  assert.equal(cameraChanges,0,'Flight updates preserve the selected camera');assert.equal(resizeCount,1,'Telemetry updates do not resize the scene');
  state.paused=true;ui.update();assert(!$('pilotFlightPaused').hidden);assert.match($('pilotFlightProgress').getAttribute('aria-valuetext'),/paused/);state.paused=false;
  trip={...trip,progress:1.1,remainingProperSeconds:-4};ui.update();assert.equal($('pilotFlightPercent').textContent,'100%');assert.equal($('pilotFlightRemaining').textContent,'0 s');
  $('pilotFlightCancel').click();assert.equal(cancelled,1);assert.equal(cameraChanges,0,'Cancelling guided flight preserves the camera');assert($('pilotControls').hidden);assert($('pilotFlightReadout').hidden);assert(!$('scene').classList.contains('has-flight-readout'));
  assert(ui.start('shuttle'));assert(!$('pilotControls').hidden);assert($('pilotFlightReadout').hidden);assert(!$('pilotPower').disabled);assert(!$('pilotSpeedRow').hidden);assert.equal($('pilotPower').max,'10');$('pilotRight').click();assert.equal(headingCalls,1);assert.equal(flight.headingTargetDegrees,5,'Manual Drive keeps its heading controls');
  trip={...trip,active:true,progress:.5,remainingProperSeconds:1800,stage:'Flip and burn',commandedThrustG:0};ui.update();const before=cameraChanges;
  document.dispatch('keydown',{key:'Escape',target:document});assert.equal(cancelled,2);assert.equal(cameraChanges,before,'Escape also cancels without resetting the camera');assert($('pilotFlightReadout').hidden);
 }finally{ui.dispose();}
 assert.equal($('pilotFlightReadout'),null);assert(!$('scene').classList.contains('has-flight-readout'));
}
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert.match(css,/\.pilot-flight-readout\[hidden\]/);assert.match(css,/\.scene\.has-flight-readout\{--flight-strip:0px\}/);assert.match(css,/\.scene\.has-flight-readout \.viewport-dock\{visibility:visible/);
console.log('PASS: guided orbital/wormhole readout stages, onboard total/remaining, progress, 1g/0g burns, persistent lifetime clock, camera-preserving cancel/Escape, and unchanged manual controls. DOM/style fixtures; no browser layout emulation.');
