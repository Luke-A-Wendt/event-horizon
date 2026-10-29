import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installPilotControls} from '../dist/pilot-ui.js';
const document=uiDomFixture('<main id="scene" class="scene"><div class="scene-bottom"></div><div id="pilotControls"></div></main>');
globalThis.document=document;globalThis.window=document.createElement('window');
const $=id=>document.getElementById(id),state={paused:false,bridge:false},objects=[{id:'ship',type:'enterprise'},{id:'shuttle',type:'shuttle'}];
let flight=null,input=null,headingCalls=0,now=0,timerId=0;const timers=new Map(),originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
globalThis.setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,at:now+delay});return timerId;};globalThis.clearTimeout=id=>timers.delete(id);
function advance(ms){const end=now+ms;while(true){const item=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;timers.delete(item[0]);now=item[1].at;item[1].fn();}now=end;}
const renderer={state,objects,driveId:null,focusId:null,
 getFlightState:()=>flight||{active:false},setFlightInput:x=>{input=x;},
 getObjectClock(id){return id==='shuttle'?{name:'NASA Shuttle',lagSeconds:6120,rateFactor:1800,horizonGapMeters:11000,referenceName:'Black hole',referenceSecondsPerDemoSecond:1}:null;},
 setFreeDrive(id,on){this.driveId=on?id:null;const type=objects.find(o=>o.id===id).type;flight=on?{id,type,active:true,flightMode:type==='shuttle'?'impulse':'warp',canWarp:type==='enterprise',headingTargetDegrees:0,warpFactor:4,thrustSetting:0,speedMetersPerSecond:0,turnRateRadiansPerSecond:0}:null;return true;},
 focusTarget(id,mode){this.focusId=id;this.focusMode=mode;},
 setFlightHeading(degrees){headingCalls++;flight.headingTargetDegrees=degrees;},
 setFlightPower(value){if(flight.flightMode==='warp')flight.warpFactor=value;else flight.thrustSetting=value;},brakeFlight(){},look(){},updateCameraFrame(){}
};
const ui=installPilotControls({mount:$('pilotControls'),renderer:()=>renderer,state:()=>state,setPaused:value=>state.paused=value,refresh(){}});
try{
 assert(ui.start('ship'));assert.equal($('pilotHeading'),null,'Heading slider is removed');for(const id of ['pilotModes','pilotWarpMode','pilotImpulseMode'])assert.equal($(id),null,'Manual propulsion selector is removed');assert.equal($('pilotPower').max,'9.9999');
 $('pilotRight').click();assert.equal(flight.headingTargetDegrees,5);$('pilotLeft').click();assert.equal(flight.headingTargetDegrees,0);assert.equal(input.curvature,0);
 flight.headingTargetDegrees=175;$('pilotRight').click();assert.equal(flight.headingTargetDegrees,-180);$('pilotRight').click();assert.equal(flight.headingTargetDegrees,-175);
 $('pilotRight').dispatch('pointerdown',{button:0,pointerId:1,detail:1});assert.equal(flight.headingTargetDegrees,-170);advance(349);assert.equal(flight.headingTargetDegrees,-170);advance(1);assert.equal(flight.headingTargetDegrees,-165);advance(300);assert.equal(flight.headingTargetDegrees,-150);$('pilotRight').dispatch('pointerup',{pointerId:1});const held=headingCalls;advance(1000);assert.equal(headingCalls,held);$('pilotRight').dispatch('click',{detail:1});assert.equal(headingCalls,held,'Pointer click does not double-apply the press');
 document.dispatch('keydown',{code:'KeyA',timeStamp:2000,target:document});assert.equal(flight.headingTargetDegrees,-155);document.dispatch('keydown',{code:'KeyA',repeat:true,timeStamp:2050,target:document});assert.equal(flight.headingTargetDegrees,-155);document.dispatch('keydown',{code:'KeyA',repeat:true,timeStamp:2100,target:document});assert.equal(flight.headingTargetDegrees,-160);document.dispatch('keyup',{code:'KeyA',target:document});assert.equal(input.curvature,0,'A/D never send analog steering');
 $('pilotPower').value='5';$('pilotPower').dispatch('input');assert.equal(flight.warpFactor,5);assert.equal($('pilotBrakeSpeed').getAttribute('aria-label'),'Stop motion');assert($('pilotDilationRow').hidden,'Enterprise is exempt from clock comparisons');
 document.dispatch('keydown',{code:'KeyW',timeStamp:3000,target:document});assert.equal(input.speed,1);document.dispatch('keyup',{code:'KeyW',target:document});assert.equal(input.speed,0);
 $('pilotLeft').dispatch('pointerdown',{button:0,pointerId:2});state.paused=true;ui.update();const pausedCalls=headingCalls;advance(2000);assert.equal(headingCalls,pausedCalls);assert.equal(timers.size,0,'Pause cancels held repetition');state.paused=false;
 $('pilotStop').click();state.bridge=true;assert(ui.start('ship'));assert.equal(flight.flightMode,'warp');assert.equal($('pilotPower').max,'9.9999');assert.equal($('pilotVelocityLabel').textContent,'Warp');document.dispatch('keydown',{code:'KeyW',timeStamp:4000,target:document});assert.equal(input.speed,1,'Enterprise keeps warp keyboard controls inside the bridge');document.dispatch('keyup',{code:'KeyW',target:document});
 $('pilotStop').click();state.bridge=false;assert(ui.start('shuttle'));assert.equal($('pilotModes'),null);assert.equal($('pilotPower').max,'10');assert.equal($('pilotPower').getAttribute('step'),'0.5');assert.equal($('pilotDilation').textContent,'1.7 h');assert.equal($('pilotDilationRate').textContent,'1800×');assert.equal($('pilotClockRelation').textContent,'1 s onboard = 30 min distant');assert($('pilotDilationRow').textContent.includes('(accumulated)'));assert.equal($('pilotHorizonGap').textContent,'Horizon clearance: 11 km');assert(!$('pilotHorizonGap').hidden);assert($('pilotClockRelation').title.includes('one second on the distant reference clock'));assert(!$('pilotControls').contains($('pilotClockRelation')),'Clock explanation remains outside the control strip');
 $('pilotLeft').dispatch('pointerdown',{button:0,pointerId:3});window.dispatch('blur');assert.equal(timers.size,0);assert(!$('pilotLeft').classList.contains('is-held'));
 const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(css,/grid-template-columns:36px minmax\(0,1fr\) 36px/);assert(!css.includes('pilot-impulse'));assert(!/\.pilot-power>span:first-child\{display:none\}/.test(css),'Mobile must not hide the power range');assert.match(css,/\.pilot-console\.pilot-shuttle\{--pilot-risk-start:40%\}/);assert.match(css,/--flight-strip:76px/);
}finally{ui.dispose();globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout;}
console.log('PASS: quantized 5° arrows/keyboard, held repetition/cancellation/wrap, Enterprise warp-only controls including bridges, unchanged Shuttle acceleration, compact fixed strip, and explicit accumulated clock/rate relation. DOM/style checks; no browser layout emulation.');
