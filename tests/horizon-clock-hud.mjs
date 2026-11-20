import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installPilotControls,formatClockDrift} from '../dist/pilot-ui.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
for(const [value,display] of [[0,'0 s/s'],[-.1,'100 ms/s'],[-.000025,'25 µs/s'],[-3e-9,'3 ns/s'],[-.0009999,'1 ms/s']])assert.equal(formatClockDrift(value),display);
const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=d;globalThis.window=d.createElement('window');d.body=d.querySelector('body');
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const el=create(tag);if(tag==='progress')Object.defineProperty(el,'max',{writable:true,value:1});return el;};
const clock={type:'shuttle',lagSeconds:12,rateFactor:38000,horizonGapMeters:22,horizonRadiusMeters:1e10};
const r={objects:[{id:'s',type:'shuttle'}],state:{paused:false},focusId:'s',selectedId:'s',getFlightState:()=>null,getObjectClock:()=>clock,setFlightInput(){},getHorizonProximity:id=>id==='s'?{id:'primary',name:'Black hole A',gapMeters:22}:null};
const ui=installPilotControls({mount:d.getElementById('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){}});
ui.update();
const horizon=d.getElementById('pilotHorizonWarning');assert(!horizon.hidden);assert.equal(horizon.textContent,'Horizon gap = 22 m');
assert.equal(d.getElementById('pilotDilationRate').textContent,'38 ks/s');
const note=d.getElementById('shuttleEscapeNote');clock.minimumReturnG=1;ui.update();assert(note.hidden);
clock.minimumReturnG=360.6;ui.update();assert(!note.hidden);assert.equal(note.textContent,'Return benchmark ≈ 361g');clock.minimumReturnG=.9;ui.update();assert(note.hidden);
r.getHorizonProximity=()=>null;ui.update();assert(horizon.hidden);
console.log('PASS: finite large rate and exterior coordinate gap; gap hidden far from horizon.');

// High gravitational acceleration must not imply the crew is being crushed.
// Check the presentation independently of the orbit solver and its clock integrator.
const station={id:'station',type:'iss'};r.sceneId='orbital-expedition';r.objects=[station];r.focusId=r.selectedId=station.id;
Object.assign(clock,{id:station.id,type:'iss',accelerationG:9,speedMetersPerSecond:1.5e8,crewLoadG:0,requiredSupportG:0});
const el=id=>d.getElementById(id);
ui.update();assert(!el('pilotLegSpeed').parentElement.parentElement.parentElement.hidden);
assert(el('pilotControls').hidden&&el('pilotFlightReadout').hidden);
assert.equal(el('pilotLegSpeed').textContent,'v = 150 Mm/s');
assert.equal(el('pilotFlightAcceleration').textContent,'a = 0.0g');assert(!el('pilotCrewLoad'));
assert(!el('pilotSpeedLog').parentElement.hidden&&!el('pilotDilationRow').hidden);
assert(el('pilotCrewAlert').hidden&&!el('pilotEngineAlert'));
Object.assign(clock,{crewLoadG:1.5});ui.update();assert(el('pilotCrewAlert').hidden);
Object.assign(clock,{crewLoadG:2,requiredSupportG:2,highGExposureSeconds:7*86400});ui.update();
assert(!el('pilotEngineAlert'));assert.equal(el('pilotFlightAcceleration').textContent,'a = 2.0g');
assert.match(el('pilotCrewAlert').textContent,/>1\.5g [(]7 d limit[)]/);
Object.assign(clock,{crewLoadG:5});ui.update();assert.notEqual(el('pilotCrewAlert').textContent,'Lethal acceleration');
Object.assign(clock,{crewLoadG:5.01,requiredSupportG:8,extremeGExposureSeconds:3600});ui.update();
assert.match(el('pilotCrewAlert').textContent,/^Lethal acceleration$/);
Object.assign(clock,{crewLoadG:0,requiredSupportG:0,highGExposureSeconds:0,extremeGExposureSeconds:0});ui.update();
assert(el('pilotCrewAlert').hidden&&!el('pilotEngineAlert'));
console.log('PASS: passive station HUD, onboard acceleration and compact exposure warnings, duration-based alerts and clearing.');
// Focus takes precedence over a different selected/driven vessel, whether in
// Track or Ride. The astronaut has no propulsion controls or duplicate g row.
r.objects=[{id:'observer',type:'astronaut'},{id:'ship',type:'enterprise'}];
r.focusId='observer';r.driveId=r.selectedId='ship';r.getFlightState=()=>({id:'ship',type:'enterprise'});
const astronaut={id:'observer',type:'astronaut',speedMetersPerSecond:2.8e8,accelerationG:4,crewLoadG:0,rateFactor:3,minimumReturnG:4};
r.getObjectClock=id=>id==='observer'?astronaut:null;ui.update();
assert(!el('pilotLegSpeed').parentElement.parentElement.parentElement.hidden&&!el('pilotSpeedLog').parentElement.hidden);
assert.equal(el('pilotLegSpeed').textContent,'v = 280 Mm/s');assert.equal(el('pilotDilationRate').textContent,'2 s/s');
assert(el('pilotControls').hidden&&el('pilotFlightReadout').hidden&&el('pilotCrewAlert').hidden);
assert.equal(el('motionPowerLabel').textContent,'FELT ACCELERATION');assert.equal(el('pilotFlightAcceleration').textContent,'a = 0.0g');
assert(el('shuttleEscapeNote').hidden);assert(!el('pilotGravityRow'));
Object.assign(astronaut,{speedMetersPerSecond:0,accelerationG:0,crewLoadG:100,requiredSupportG:100,extremeGExposureSeconds:4});ui.update();
assert(!el('pilotSpeedLog').parentElement.hidden);assert.equal(el('pilotSpeedLog').textContent,'−∞');
assert.equal(el('pilotFlightAcceleration').textContent,'a = 100.0g');
assert(!el('pilotCrewLoad'));assert.equal(el('pilotCrewAlert').textContent,'Lethal acceleration');assert(!el('pilotEngineAlert'));
console.log('PASS: camera-focused astronaut owns both HUD panels and conditional alerts without acquiring another ship’s helm.');

r.focusId='ship';r.getHorizonProximity=id=>id==='ship'?{id:'secondary',name:'Black hole B',gapMeters:18000}:null;
ui.update();assert(!horizon.hidden);assert.equal(horizon.textContent,'Horizon gap = 18 km');assert.match(horizon.title,/Black hole B/);assert(el('pilotDilationRow').hidden);
r.getNavigationState=()=>({mode:'manual'});r.getHorizonProximity=()=>({name:'Black hole B',gapMeters:1e13,noticeable:false});ui.update();
assert(!horizon.hidden&&horizon.classList.contains('distant-horizon'));delete r.getNavigationState;
r.focusId='observer';astronaut.approachHeld=true;r.getHorizonProximity=id=>id==='observer'?{id:'primary',name:'Primary',gapMeters:15}:null;
ui.update();assert.equal(horizon.textContent,'Horizon gap = 15 m');assert.equal(el('pilotDilationLabel').textContent,'Clock lag (frozen)');assert(!horizon.classList.contains('distant-horizon'));

Object.assign(astronaut,{crewLoadG:5.01});ui.update();assert.equal(el('pilotFlightAcceleration').textContent,'a > 5.0g');assert.equal(el('pilotCrewAlert').textContent,'Lethal acceleration');
Object.assign(astronaut,{crewLoadG:1.028e10,accelerationG:1.56e-8});ui.update();assert.equal(el('pilotFlightAcceleration').textContent,'a = 1×10¹⁰g');

// Identical physical inputs give all three people-bearing subjects identical instruments.
for(const type of ['shuttle','iss','astronaut']){
 const subject={id:'same',type};r.objects=[subject];r.driveId=null;r.focusId=r.selectedId=subject.id;
 r.getObjectClock=()=>({...clock,type,id:subject.id,speedMetersPerSecond:1.5e8,accelerationG:5600,crewLoadG:937.4,requiredSupportG:937.4,minimumReturnG:37});
 r.getHorizonProximity=()=>({name:'Nearest hole',gapMeters:15});ui.update();
 assert.equal(el('motionPowerLabel').textContent,'FELT ACCELERATION');assert.equal(el('pilotFlightAcceleration').textContent,'a = 937.4g');
 assert.equal(el('pilotCrewAlert').textContent,'Lethal acceleration');assert.equal(el('shuttleEscapeNote').hidden,type!=='shuttle');if(type==='shuttle')assert.equal(el('shuttleEscapeNote').textContent,'Return benchmark ≈ 37g');
 assert.equal(horizon.textContent,'Horizon gap = 15 m');assert(!el('pilotEngineAlert'));
}

const speedEl=el('pilotLegSpeed'),accelEl=el('pilotFlightAcceleration');
for(const [rate,load,st,at] of [[1,0,0,0],[1.1,1.5,0,0],[1.1001,5,2,0],[1,5.01,0,2],[1,0,0,0]]){
 r.getObjectClock=()=>({...clock,type:'astronaut',id:'same',rateFactor:rate,crewLoadG:load,lagSeconds:31557600+load});ui.update();
 assert.equal(el("pilotDilationRate").classList.contains("metric-alert"),rate>1.1);assert.equal(el("pilotDilation").classList.contains("metric-alert"),load>0);
 for(const [node,tier] of [[speedEl,st],[accelEl,at]]){assert.equal(node.classList.contains('metric-caution'),tier===1);assert.equal(node.classList.contains('metric-alert'),tier===2);}
}

// The accelerometer context follows the model, not a rounded reading or a
// possible future burn. Unavailable/null/invalid loads cannot trigger alerts.
r.objects=[{id:'probe-crew',type:'shuttle'}];r.focusId=r.selectedId='probe-crew';r.driveId=null;
for(const [mode,g,text,caption,alarm] of [
 ['free-fall',0,'a = 0.0g','Free fall',false],['thrust',.01,'a = 0.0g','Thrust',false],
 ['support',8,'a = 8.0g','Supported path',true],['coast',0,'a = 0.0g','Coasting',false],
 ['unavailable',8,'a = —','Not available',false],['unavailable',null,'a = —','Not available',false]
]){
 r.getObjectClock=()=>({type:'shuttle',accelerationMode:mode,crewLoadG:g,requiredSupportG:999,accelerationG:2000,minimumReturnG:45.7});
 ui.update();assert.equal(accelEl.textContent,text);assert.equal(el('pilotAccelMode').textContent,caption);
 assert.equal(el('pilotCrewAlert').hidden,!alarm);assert.equal(accelEl.classList.contains('metric-alert'),alarm);
 assert.equal(note.textContent,'Return benchmark ≈ 45.7g');
}
