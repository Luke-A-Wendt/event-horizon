import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [width,height] of [[1280,840],[320,568],[740,320]]){
 const f=fixture({width,height}),document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');window.devicePixelRatio=1;window.matchMedia=()=>({matches:false});
 const $=id=>document.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('warp-lab');const craft=r.objects.find(o=>o.type==='enterprise');r.selectedId=r.focusId=craft.id;let planId=null;
 const pilot=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,activePreset:()=>r.sceneId,objects:()=>r.getObjects(),setPaused:v=>r.state.paused=v,updateParameter:(key,value)=>r.update({[key]:value}),refresh(){},openFlightPlan:id=>{planId=id;}});pilot.update();
 const drive=$('pilotModeDrive'),auto=$('pilotModeAuto'),parent=drive.parentNode;
 assert(!$('pilotControls').hidden);assert.equal(drive.textContent,'Drive');assert.equal(auto.textContent,'Auto');assert.equal(auto.getAttribute('aria-pressed'),'true');assert(!$('pilotAutoControls').hidden);assert($('pilotManualControls').hidden);assert.equal($('pilotStop'),null);assert.equal($('pilotFlightCancel'),null);assert.equal($('pilotFlightReadout').querySelectorAll('button,input,select').length,0);
 pilot.showHint();assert($('pilotNavHint').hidden,'No tutorial on Warp laboratory');assert.equal($('pilotAutoPause'),null);assert.equal($('pilotAutoCancel'),null);assert.equal($('pilotAddDestination'),null);r.state.annotations=false;pilot.update();assert.equal(r.state.annotations,false);assert.equal(r.getNavigationState(craft.id).mode,'auto');
 drive.click();pilot.update();assert.equal(drive.getAttribute('aria-pressed'),'true');assert(!$('pilotManualControls').hidden);assert($('pilotAutoControls').hidden);assert(!$('pilotControls').hidden);assert($('pilotNavHint').hidden);assert.equal(drive.parentNode,parent);assert.equal(auto.parentNode,parent);assert(!$('pilotLeft').hidden);assert(!$('pilotRight').hidden);
 auto.click();pilot.update();assert.equal(auto.getAttribute('aria-pressed'),'true');assert.equal(drive.getAttribute('aria-pressed'),'false');assert($('pilotLeft').hidden);assert($('pilotRight').hidden);
 r.loadScene('solar-system');const shuttle=r.objects.find(o=>o.type==='shuttle'),earth=r.objects.find(o=>o.name==='Earth'),mars=r.objects.find(o=>o.name==='Mars');r.selectedId=r.focusId=shuttle.id;pilot.update();pilot.showHint();assert(!$('pilotNavHint').hidden);$('pilotHintClose').click();pilot.showHint();assert($('pilotNavHint').hidden,'Solar tutorial stays dismissed this visit');
 r.setFlightSequence(shuttle.id,[{targetId:mars.id},{targetId:earth.id}],{loop:true});const q=r.flightSequences[shuttle.id];q.active=true;q.inFlight=false;q.orbitWait={targetId:earth.id,startPhase:0,unwrappedPhase:Math.PI,lastPhase:Math.PI,direction:1,sweepRadians:Math.PI,wallSeconds:5,elapsed:2.5,orbitalAccelerationG:.84};q.waitSeconds=2.5;r.autopilot={enabled:true,craftId:shuttle.id};r.transfer=null;pilot.update();
 assert.equal($('pilotFlightStage').textContent,'Orbital arc');assert.equal($('pilotFlightAcceleration').textContent,'84% g inward');assert.equal($('pilotFlightTimeLabel').textContent,'Arc time');assert.equal($('pilotFlightEtaLabel').textContent,'Next leg');assert.equal($('pilotFlightPercent').textContent,'50%');assert.equal($('pilotFlightProgress').value,'0.5');assert.equal($('flightPlanStops').querySelectorAll('[data-stop-index]').length,2);assert(!$('pilotControls').hidden,'Navigation remains available during orbit dwell');
 r.loadScene('disk');pilot.update();assert($('pilotControls').hidden);assert($('pilotFlightReadout').hidden);pilot.dispose();r.dispose();
}
// Layout contract checks for the specific legacy conflicts. These do not emulate browser layout.
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert(!css.includes('.scene.has-flight-readout{--flight-strip:0px}'),'Telemetry cannot collapse the control strip');
assert(!/\.scene\.has-flight-controls(?:\.viewport-panel-open)? \.viewport-dock\{visibility:hidden\}/.test(css),'Short landscape never hides the main controls');
assert(css.includes('.pilot-console .pilot-mode-options button[aria-pressed="true"]'));
assert(css.includes('grid-template-columns:58px minmax(0,1fr)'));assert(css.includes('.scene.has-flight-controls .pilot-console{grid-template-columns:36px minmax(0,1fr) 36px'));
assert(css.includes('.scene.has-flight-controls .scene-bottom{right:12px;max-width:calc(48% - 20px)'));assert(css.includes('.scene.has-flight-controls .pilot-flight-readout{left:12px;width:calc(48% - 20px)'));
console.log('PASS: persistent vehicle panel in both modes, persistent Auto and Drive buttons, read-only telemetry, inline playlist editing without redundant playback controls, solar-only tutorial, orbit-dwell readout, and regression checks for legacy strip/landscape CSS conflicts. DOM fixtures cover 1280×840, 320×568, and 740×320; browser layout is unverified.');
