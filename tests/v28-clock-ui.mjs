import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installPilotControls} from '../dist/pilot-ui.js';
import {formatClockDuration} from '../dist/object-clocks.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');
const $=id=>document.getElementById(id),clocks=new Map(),objects=['astronaut','shuttle','iss','enterprise'].map(type=>({id:type,type}));
for(const type of ['astronaut','shuttle','iss'])clocks.set(type,{id:type,type,lagSeconds:.001234,lossRate:.01,horizonLimit:false,name:type});
const renderer={objects,state:{paused:true},focusId:'astronaut',selectedId:'astronaut',driveId:null,getFlightState(){return this.driveId?{id:this.driveId,type:this.driveId,speedMetersPerSecond:42,turnRateRadiansPerSecond:0,thrustSetting:0}:null;},getObjectClock:id=>clocks.get(id)||null,setFlightInput(){},setFreeDrive(id,enabled){this.driveId=enabled?id:null;return true;},focusTarget(id,mode){this.focusId=id;this.focusMode=mode;},look(){},resize(){}};
const pilot=installPilotControls({mount:$('pilotControls'),renderer:()=>renderer,state:()=>renderer.state,setPaused:value=>renderer.state.paused=value,refresh(){}});
for(const id of ['astronaut','shuttle','iss']){
 renderer.focusId=renderer.selectedId=id;pilot.update();assert(!$('pilotTelemetry').hidden);assert(!$('pilotDilationRow').hidden);assert($('pilotControls').hidden);assert.equal($('pilotDilation').textContent,'1.2 ms');assert($('pilotSpeedRow').hidden);assert($('pilotTurnRow').hidden);assert(!$('pilotControls').contains($('pilotDilation')));
}
renderer.focusId=renderer.selectedId='astronaut';pilot.update();assert.equal($('pilotDilationRate').textContent,'10 ms / s');const prior=$('pilotDilation').textContent;clocks.get('astronaut').lossRate=.2;pilot.update();assert.equal($('pilotDilationRate').textContent,'200 ms / s');assert.equal($('pilotDilation').textContent,prior,'Changing rate preserves the accumulated total');
renderer.focusId='astronaut';renderer.selectedId='iss';clocks.get('astronaut').lagSeconds=10;pilot.update();assert.equal($('pilotDilation').textContent,'10 s','Tracked clock takes precedence over a different selected object');
renderer.focusId=renderer.selectedId='enterprise';pilot.update();assert($('pilotTelemetry').hidden,'Enterprise is exempt from time dilation');
renderer.focusId='space';renderer.selectedId='iss';pilot.update();assert(!$('pilotTelemetry').hidden,'An eligible tree selection can expose its clock from overview');
renderer.focusId=renderer.selectedId='shuttle';const lag=clocks.get('shuttle').lagSeconds;assert(pilot.start('shuttle'));assert(!$('pilotControls').hidden);assert(!$('pilotSpeedRow').hidden);assert.equal($('pilotDilation').textContent,formatClockDuration(lag));
$('pilotStop').click();assert.equal(clocks.get('shuttle').lagSeconds,lag);assert(!$('pilotTelemetry').hidden);assert($('pilotControls').hidden);assert($('pilotSpeedRow').hidden);assert(pilot.start('shuttle'));assert.equal(clocks.get('shuttle').lagSeconds,lag);
renderer.driveId=null;renderer.focusId=renderer.selectedId='astronaut';clocks.get('astronaut').horizonLimit=true;pilot.update();assert(!$('pilotClockRateRow').hidden);assert.equal($('pilotClockRate').textContent,'∞');assert.equal($('pilotDilation').textContent,'10 s','Infinite rate factor does not replace finite accumulated lag');
clocks.get('astronaut').horizonLimit=false;pilot.update();assert($('pilotClockRateRow').hidden);
clocks.delete('astronaut');renderer.selectedId=null;pilot.update();assert($('pilotTelemetry').hidden,'Deleted clock is removed');
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(css,/#pilotDilation\{[^}]*min-width:10ch[^}]*text-align:right[^}]*700 16px[^}]*tabular-nums/);assert.match(css,/\.scene\.has-object-clock \.scene-bottom\{visibility:visible/);
pilot.dispose();console.log('PASS: persistent astronaut/ISS/Shuttle telemetry outside Drive and while paused, lifecycle UI continuity, supported-selection priority, finite lag + horizon ∞, stable bold type. DOM/style contracts; no browser layout emulation.');
