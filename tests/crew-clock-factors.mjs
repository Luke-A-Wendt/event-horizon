import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatProperClock,formatClockDuration} from '../dist/object-clocks.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls,formatClockDrift} from '../dist/pilot-ui.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';

const fx=fixture();
const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=d;globalThis.window=d.createElement('window');d.body=d.querySelector('body');
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{configurable:true,get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const n=create(tag);if(tag==='progress')Object.defineProperty(n,'max',{writable:true,value:1});return n;};
const $=id=>d.getElementById(id),r=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false,deferProgram:true});
const ui=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){}});
try {
 r.loadScene('nasa-shuttle');r.sceneLoad=null;r.state.paused=false;
 const ship=r.objects.find(o=>o.type==='shuttle');let arrivals=0;
 for(let i=0;i<7200&&arrivals<3;i++){const burning=r.transfer;r.advanceChartStages(.05);if(burning&&!r.transfer)arrivals++;}
 assert.equal(arrivals,3);
 const clock=r.getObjectClock(ship.id);ui.update();
 // Independent landmarks for the final prograde parking orbit:
 assert(Math.abs(clock.gravityFactor-1.47214)<1e-4&&Math.abs(clock.kinematicFactor-1.22938)<1e-4);
 assert.equal($('pilotDilationRate').textContent,'810 ms/s');
 assert.equal($('pilotGravityFactor').textContent,'Gravity 580 ms/s');
 assert.equal($('pilotMotionFactor').textContent,'Motion 229 ms/s');
 assert.equal($('pilotFlightAcceleration').textContent,'a = 0.0g');

 r.loadScene('orbital-expedition');ui.update();
 const habitat=r.objects.find(o=>o.type==='habitat'),stationClock=r.getObjectClock(habitat.id);
 assert.equal($('pilotMotionFactor').textContent,'Motion '+formatClockDrift(stationClock.kinematicFactor-1));
 assert.equal($('shuttleEscapeNote').hidden,true);
 r.getObjectClock=()=>({...stationClock,rateFactor:20,gravityFactor:2,kinematicFactor:3});
 ui.update();assert.equal($('pilotDilationRate').textContent,'19 s/s');
 assert.equal($('pilotGravityFactor').textContent,'Gravity —');
 assert.equal($('pilotMotionFactor').textContent,'Motion —');
 delete r.getObjectClock;r.loadScene('warp-lab');ui.update();
 assert(!$('pilotTelemetry').hidden);assert(!$('pilotOnboardRow').hidden);
 assert.equal($('pilotOnboard').textContent,'00:00:00.0');
 assert.equal($('pilotDilation').textContent,'0 s');assert.equal($('pilotDilationRate').textContent,'0 s/s');
 assert($('pilotGravityFactor').hidden&&$('pilotMotionFactor').hidden);
 // Existing crewed models retain their object data and gain their own running
 // clock. Focus switches, replay display updates and pause never advance it.
 r.loadScene('disk');r.sceneLoad=null;
 for(const type of ['classicEnterprise','heritageShuttle','heighliner','iss','astronaut','habitat']){
  const object=r.addObject(type,24,1);r.focusTarget(object.id,'track');r.advanceClocks(.1,.1);
  const reading=r.getObjectClock(object.id);assert(reading.properSeconds>0&&reading.rateFactor>=1);
  ui.update();assert(!$('pilotOnboardRow').hidden);assert.equal($('pilotOnboard').textContent,formatProperClock(reading.properSeconds));
  assert.equal($('pilotProperLabel').textContent,type==='habitat'?'Hub proper time':'Proper time');
  assert.equal($('pilotOnboard').getAttribute('aria-live'),'off');
  ui.update();assert.equal(r.getObjectClock(object.id).properSeconds,reading.properSeconds);
 }
 // The berth controller keeps flying while we inspect either station. Test
 // refocusing a previously scrolled viewport, including when IDs are reused.
 r.loadScene('earth-mars-station-ferry');r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 for(let i=1;i<=20;i++)r.advanceSimulation(1000+100*i);
 const stations=r.objects.filter(o=>o.type==='habitat'),clockPanel=$('pilotTelemetry'),rail=$('instrumentBody'),dockedShip=r.driveId;
 function verifyObserver(target,mode='track'){
  rail.scrollTop=190;r.focusTarget(target.id,mode);ui.update();
  assert.equal(rail.children[0],clockPanel,'Observer clock should be first, above docking and motion');
  assert.equal(rail.scrollTop,0);assert(!clockPanel.hidden);
  const q=r.getObjectClock(target.id),readings=['pilotOnboard','pilotDilation','pilotDilationRate'].map(id=>$(id).textContent);
  assert.deepEqual(readings,[formatProperClock(q.properSeconds),formatClockDuration(q.lagSeconds),formatClockDrift(q.rateFactor-1)]);
  return readings;
 }
 const first=verifyObserver(stations[0]),second=verifyObserver(stations[1]);assert.notEqual(first[2],second[2],'Earth and Neptune stations have distinct loss rates');
 assert.equal(r.driveId,dockedShip);assert.match($('pilotOnboard').title,/nonrotating hub/);
 r.focusTarget(dockedShip,'track');ui.update();assert.notEqual(rail.children[0],clockPanel,'Flight layout restored');
 r.loadScene('radiant-descent');r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 const astronaut=r.objects.find(o=>o.type==='astronaut');
 for(let i=1;i<=5;i++)r.advanceSimulation(1000+i*100);
 const suit=verifyObserver(astronaut);assert.equal(clockPanel.getAttribute('aria-label'),'Astronaut clock');
 r.state.paused=true;r.advanceSimulation(1700);r.focusTarget(astronaut.id,'onboard');ui.update();
 assert.deepEqual(['pilotOnboard','pilotDilation','pilotDilationRate'].map(id=>$(id).textContent),suit,'Pause and camera changes do not age the suit');
 const iss=r.addObject('iss',32);verifyObserver(iss);assert.equal(clockPanel.getAttribute('aria-label'),'Station clock');
 const tiny=2.8e-16;r.getObjectClock=()=>({rateFactor:1+tiny,gravityFactor:1+tiny,gravityExcess:tiny,kinematicFactor:1,kinematicExcess:0,properSeconds:0,lagSeconds:0});
 ui.update();assert.equal($('pilotDilationRate').textContent,'280 as/s');assert.equal($('pilotGravityFactor').textContent,'Gravity 280 as/s');delete r.getObjectClock;
 for(const [sec,expected] of [[0,'00:00:00.0'],[1.2,'00:00:01.2'],[86399.99,'23:59:59.9'],[86400,'1 d 00:00:00'],[90061,'1 d 01:01:01'],[360*86400,'360 d 00:00:00'],[361*86400,'1y 1d 00:00:00'],[2119*86400+49291,'5y 319d 13:41:31']])assert.equal(formatProperClock(sec),expected);
 for(const [seconds,calendar,face] of [[1,'','00:00:01.0'],[361*86400,'1y 1d ','00:00:00'],[1e14,formatProperClock(1e14),'']]){
  r.getObjectClock=()=>({properSeconds:seconds,lagSeconds:0,rateFactor:1});ui.update();
  assert.equal($('clockCalendar').hidden,!calendar);
  assert.equal($('clockCalendar').textContent,calendar);
  assert.equal($('clockFace').textContent,face);
 }
 delete r.getObjectClock;
 assert(!formatProperClock(1e50).includes('Infinity'));

}finally{ui.dispose();r.dispose();}
console.log('PASS: crew clock factor breakdown on the final stable orbit, passive station, incomplete/inconsistent clock and protected warp HUD.');
