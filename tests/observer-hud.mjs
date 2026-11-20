// Exercise camera/selection/helm changes against the real renderer, retaining the
// same DOM across scene loads to catch stale values and hidden-parent mistakes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls,formatFlightSpeed} from '../dist/pilot-ui.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';

const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const fx=fixture({width:375,height:667}),d=uiDomFixture(html);
globalThis.document=d; d.body=d.querySelector('body'); globalThis.window=d.createElement('window');
Object.assign(window,{innerWidth:375,innerHeight:667,devicePixelRatio:1,matchMedia:()=>({matches:false})});
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{configurable:true,get(){return this.parentNode;}});
const create=d.createElement;
d.createElement=tag=>{const e=create(tag);if(tag==='progress')Object.defineProperty(e,'max',{writable:true,value:1});return e;};
const r=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false,deferProgram:true});
const el=id=>{const node=d.getElementById(id);assert(node,'Missing #'+id);return node;};
const ui=installPilotControls({mount:el('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){}});
const visible=id=>{for(let x=el(id);x;x=x.parentNode)if(x.hidden)return false;return true;};
const load=scene=>{r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;ui.update();};
const body=type=>{const o=r.objects.find(o=>o.type===type);assert(o,type);return o;};
const focus=(id,mode='track')=>{assert.equal(r.focusTarget(id,mode),true);ui.update();};
const instrumentTitle=()=>el('instrumentSubject').textContent;
function natural(object){
 assert.equal(el('sceneMetrics').dataset.subjectId,object.id);
 if(object.name)assert(instrumentTitle().includes(object.name),instrumentTitle());
 assert(visible('bodyMeasurements'));
 assert(el('bodyMeasurements').querySelectorAll('dt').length>=2,'Empty body measurements');
 for(const id of ['pilotLegSpeed','pilotFlightAcceleration','pilotCrewAlert','pilotDilationRate','pilotDestination'])assert.equal(visible(id),false,'Stale #'+id);
}
function crew(object){
 assert.equal(el('sceneMetrics').dataset.subjectId,object.id);
 for(const id of ['pilotLegSpeed','pilotFlightAcceleration','pilotSpeedLog','pilotDilation','pilotDilationRate'])assert(visible(id),'Missing #'+id);
 assert.equal(visible('bodyMeasurements'),false);
 if(object.type==='shuttle')assert.match(el('pilotSpeedLog').innerHTML,/10<sup>|^0$/);
 else assert.match(el('pilotRatioLabel').textContent,/log₁₀/);
 assert.equal(el('pilotLegSpeed').textContent,'v = '+formatFlightSpeed(r.getObjectClock(object.id).distantSpeedMetersPerSecond));
}
try{
 load('shuttle-sgra-direct');
 if(el('instrumentBody').hidden)el('sceneMetrics').querySelector('button').click();
 const shuttle=body('shuttle'),earth=body('planet'),sun=body('star');
 for(let i=0;i<800&&(!r.transfer||r.transfer.progress<.23);i++)r.advanceChartStages(.05);
 ui.update();assert(r.transfer?.active);crew(shuttle);assert(visible('pilotDestination'));
 focus(earth.id);assert(r.selectObject(shuttle.id));ui.update();natural(earth);
 const trip=r.transfer;assert(trip.active);
 focus(sun.id);natural(sun);assert.strictEqual(r.transfer,trip,'Observation cancelled flight');assert(trip.active);
 focus(shuttle.id);crew(shuttle);assert(visible('pilotDestination'));
 r.setNavigationMode(shuttle.id,'manual');assert.equal(r.driveId,shuttle.id);
 focus(earth.id);r.selectObject(shuttle.id);ui.update();natural(earth);
 assert.equal(r.driveId,shuttle.id,'Tracking a planet stole the helm');
 assert.equal(el('pilotVelocityLabel').textContent,'Thrust');assert.match(el('pilotPower').title,/Engine thrust setting per unit mass/);
 // Free camera: the offscreen ship may still be selected and manually driven.
 r.setViewMode('free');ui.update();
 assert.equal(instrumentTitle(),'Scene overview');
 for(const id of ['bodyMeasurements','pilotLegSpeed','pilotDilation','pilotDestination'])assert(!visible(id),id);
 load('nasa-shuttle');
 // A departure arc and the subsequent arrival share the same black hole.
 // Advancing the playlist index must not rename the active coast prematurely.
 const stages=new Set();
 for(let i=0;i<7000;i++){
  r.advanceChartStages(.05);const q=r.flightSequences[r.focusId],dw=q?.orbitWait;
  if(!q)continue;
  const key=q.index+':'+(dw?.replayAfterLap?'final':Boolean(dw));if(stages.has(key))continue;
  stages.add(key);ui.update();
  if(dw?.radiusChange&&q.index===3){
   assert.equal(el('pilotDestination').textContent,'Disc edge');
   assert.equal(el('pilotAccelMode').textContent,'Free fall');assert.equal(el('pilotFlightAcceleration').textContent,'a = 0.0g');assert(!visible('pilotCrewAlert'));
   assert(visible('shuttleEscapeNote')&&el('shuttleEscapeNote').textContent.startsWith('Return benchmark'));
   assert.equal(el('pilotFlightStage').textContent,'Next: Innermost stable stop');
   assert.equal(el('pilotFlightEtaLabel').textContent,'Departs in');
  }
  if(!dw&&q.index===3){assert.equal(el('pilotDestination').textContent,'Innermost stable stop');assert.equal(el('pilotFlightEtaLabel').textContent,'ETA');}
  if(dw?.replayAfterLap){
   assert.equal(el('pilotDestination').textContent,'Innermost stable stop');
   assert.equal(el('pilotFlightStage').textContent,'Final orbit');assert.equal(el('pilotFlightEtaLabel').textContent,'Replay in');break;
  }
 }
 assert(stages.has('3:false')&&stages.has('3:true')&&stages.has('3:final'));
 load('orbital-expedition');const habitat=body('habitat');crew(habitat);
 assert(visible('habitatMeasurements'));assert.match(el('habitatFloorRadius').textContent,/1(?:\.0+)? km/);
 assert.equal(el('habitatRimGravity').textContent,'1.0g');assert.equal(el('pilotFlightAcceleration').textContent,'a = 0.0g');assert(!visible('pilotCrewAlert'));
 assert.equal(parseFloat(el('habitatSpinRate').textContent),Number((Math.sqrt(9.80665/1000)*60/(2*Math.PI)).toPrecision(3)));
 assert.equal(visible('pilotModeDrive'),false);assert.equal(el('motionPowerLabel').textContent,'HUB ACCELERATION');assert.equal(el('pilotDilationLabel').textContent,'Hub clock lag');
 const former=r.addObject('iss',31);focus(former.id);crew(former);assert(!visible('habitatMeasurements'));assert.equal(el('motionPowerLabel').textContent,'FELT ACCELERATION');assert(!d.getElementById('pilotFeltParallel')&&!d.getElementById('pilotFeltPerpendicular'));
 focus('primary');natural({id:'primary'});assert.match(el('bodyMeasurements').textContent,/horizon/i);
 load('radiant-descent');const explorer=body('astronaut');crew(explorer);
 focus(explorer.id,'onboard');crew(explorer);
 r.lastTime=100;
 for(let i=0;i<=Math.ceil(100/r.simulationTimeScale());i++){
  if(i)r.advanceSimulation(100+i*100);
  if(i%25===0){ui.update();assert.equal(el('pilotFlightAcceleration').textContent,'a = 0.0g');assert(!visible('pilotCrewAlert'),'No lethal thrust warning in free fall');}
 }
 assert(r.getObjectClock(explorer.id).approachHeld);assert.notEqual(el('pilotDilation').textContent,'0 s');
 load('horizon-watch');ui.update();assert(visible('pilotCrewAlert'),'A held observer does require proper acceleration');
 load('warp-lab');const ship=body('enterprise');
 assert.equal(el('sceneMetrics').dataset.subjectId,ship.id);
 assert(visible('pilotLegSpeed')&&visible('pilotSpeedLog')&&visible('pilotFlightAcceleration'));
 assert.match(el('pilotRatioLabel').textContent,/v\/c/);assert.match(el('pilotFlightAcceleration').textContent,/Warp/);
 for(const id of ['bodyMeasurements','pilotCrewAlert','shuttleEscapeNote'])assert(!visible(id),id);
 assert(visible('pilotOnboard')&&visible('pilotDilation')&&visible('pilotDilationRate'));
 assert.equal(el('pilotDilation').textContent,'0 s','The warp-protected clock has no lag');
 const second=r.addObject('enterprise',23);
 focus(second.id);assert.equal(el('sceneMetrics').dataset.subjectId,second.id);
 assert.equal(r.getFlightState().id,ship.id);
 assert.equal(el('pilotFlightAcceleration').textContent,'Warp 0','Inactive ship borrowed the driven Enterprise’s warp factor');
 focus(ship.id);assert.match(el('pilotFlightAcceleration').textContent,/Warp 4/);
 // Keep controls reachable and preserve a collapsed narrow HUD on subject changes.
 const rail=el('sceneMetrics'),toggle=rail.querySelector('button');
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'false');
 load('orbital-expedition');assert(!visible('pilotLegSpeed'));
 assert(!el('instrumentBody').contains(el('pilotModeDrive')));
 toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');crew(body('habitat'));
 load('binary');assert.equal(instrumentTitle(),'Scene overview','The barycenter is not either black hole');
 focus('primary');natural({id:'primary'});const primaryName=instrumentTitle();
 focus('secondary');natural({id:'secondary'});assert.notEqual(instrumentTitle(),primaryName);
 load('disk');natural({id:'primary'}); // overview orbits the single central mass
 load('empty-space');assert.equal(instrumentTitle(),'Scene overview');
 assert(!visible('pilotLegSpeed')&&!visible('bodyMeasurements'));
}finally{ui.dispose();r.dispose();}
console.log('PASS: observed-subject instruments across real trips, manual flight, Track, Ride, free camera, scene changes and compact-rail expansion.');
