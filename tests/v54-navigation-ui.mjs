import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {installViewportUI} from '../dist/viewport-ui.js';
import {installScenePicking} from '../dist/scene-picking.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [width,height] of [[1280,840],[390,740]]){
 const f=fixture({width,height}),document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');window.devicePixelRatio=1;window.matchMedia=()=>({matches:false});
 const $=id=>document.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');
 const shuttle=r.objects.find(o=>o.type==='shuttle'),sun=r.objects.find(o=>o.name==='Sun'),venus=r.objects.find(o=>o.name==='Venus'),earth=r.objects.find(o=>o.name==='Earth');r.selectedId=r.focusId=shuttle.id;
 const optics=document.createElement('details');optics.className='geometry-panel';document.querySelector('.view-toolbar').append(optics);
 let ui,pilot;const refresh=()=>{pilot?.update();ui?.refresh(r.getState());};
 const api={renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,activePreset:()=>r.sceneId,refresh,updateParameter:(k,v)=>r.update({[k]:v}),setFeature(){},selectObject:id=>{r.selectedId=id;},selectComponent(){},syncRendererState(){},markCustom(){},setPaused:v=>{r.state.paused=v;},syncViewMode(){},toast(){},openScenes(){},openHelp(){},openDialog:id=>$(id).showModal(),onDialogClose(){},closeTravelPreview:()=>pilot?.closeTravel(),beginDestinationSelection:()=>pilot?.beginDestinationSelection(),startDrive:id=>pilot.start(id),openFlightPlan:(...args)=>ui.openFlightPlan(...args)};
 ui=installViewportUI(api);pilot=installPilotControls({...api,mount:$('pilotControls')});await Promise.resolve();refresh();
 const auto=$('pilotModeAuto'),drive=$('pilotModeDrive'),loop=$('flightPlanLoop'),stops=$('flightPlanStops'),picker=$('flightPlanDestination');
 const choose=id=>{picker.value=id;picker.dispatch('change');};
 assert.equal($('quickDrive'),null);assert.equal($('pilotAddDestination'),null);assert.equal($('flightPlanDialog'),null);assert.equal($('pilotRoute'),null);assert(!$('pilotControls').hidden&&$('pilotAutoControls').contains(stops),'Playlist is editable in the footer without opening anything');assert.equal($('pilotFlightReadout').querySelectorAll('button,input').length,0);
 assert.equal(auto.getAttribute('aria-pressed'),'true');assert.equal(drive.getAttribute('aria-pressed'),'false');assert(r.state.annotations);assert($('pilotNavHint').hidden);
 r.state.annotations=false;refresh();assert(!$('mapToggle').classList.contains('control-discovery'));assert(!$('annotationShortcut').classList.contains('control-discovery'));
 r.updateCameraFrame();const camera=structuredClone(r.cameraFrame);drive.click();refresh();assert.equal(r.getNavigationState(shuttle.id).mode,'manual');for(const axis of ['observer','forward','up'])assert(Math.hypot(...r.cameraFrame[axis].map((v,i)=>v-camera[axis][i]))<1e-6,'Taking over preserves the rendered camera');
 assert.equal(drive.getAttribute('aria-pressed'),'true');assert.equal(auto.getAttribute('aria-pressed'),'false');assert($('pilotAutoControls').hidden&&!$('pilotManualControls').hidden);assert(!$('pilotNavHint').hidden);
 $('pilotHintClose').click();$('pilotPower').value='2';$('pilotPower').dispatch('input');drive.click();assert.equal(r.getFlightState().thrustSetting,2,'Selecting the active mode does not reinitialize the flight');auto.click();refresh();assert.equal(r.getNavigationState(shuttle.id).mode,'auto');assert($('pilotManualControls').hidden&&!$('pilotAutoControls').hidden);assert.equal(r.state.annotations,false);assert($('pilotNavHint').hidden);
 r.state.annotations=true;assert(pilot.previewTravel(venus.id));assert($('pilotTripHeadingRow').hidden);$('pilotTripQueue').click();refresh();assert(r.getFlightSequence(shuttle.id).active);assert(stops.textContent.includes('Venus'));assert(r.state.annotations,'Choosing from visible labels leaves them visible');
 assert(pilot.previewTravel(sun.id));$('pilotTripCancel').click();assert(r.getFlightSequence(shuttle.id).active,'Closing a preview leaves the executing playlist alone');
 r.cancelTravel();r.setFlightSequence(shuttle.id,[],{});r.state.paused=true;assert(pilot.goToLabel(venus.id));assert.equal(r.getFlightSequence(shuttle.id).nodes[0].targetId,venus.id);assert(r.state.paused);
 choose(earth.id);assert.equal(r.getFlightSequence(shuttle.id).nodes.length,2);assert(!loop.hidden&&!r.getFlightSequence(shuttle.id).loop);loop.click();assert(r.getFlightSequence(shuttle.id).loop);assert.equal(loop.getAttribute('aria-pressed'),'true');loop.click();assert(!r.getFlightSequence(shuttle.id).loop);
 stops.querySelector('[data-plan-up="1"]').click();assert.equal(r.getFlightSequence(shuttle.id).nodes[0].targetId,earth.id);stops.querySelector('[data-plan-remove="1"]').click();assert.equal(r.getFlightSequence(shuttle.id).nodes.length,1);assert(r.state.paused,'Queue edits preserve global pause');
 r.state.annotations=false;ui.openMap(shuttle.id);assert($('orbitMapDialog').open&&!r.state.annotations);const preview=r.previewTravel.bind(r);r.previewTravel=()=>({error:'Already here'});$('mapDestination').value=earth.id;$('mapDestination').dispatch('change');assert(!$('mapTravelQueue').hidden,'A current-position estimate never blocks adding a reachable future stop');assert($('mapTravelTimes').hidden);$('mapTravelQueue').click();assert(!$('orbitMapDialog').open);r.previewTravel=preview;
 r.loadScene('test-shuttle-bridge');const bridgeCraft=r.objects.find(o=>['shuttle','enterprise'].includes(o.type));r.selectedId=r.focusId=bridgeCraft.id;ui.sceneChanged();refresh();ui.openMap(bridgeCraft.id);assert($('mapDestination').querySelectorAll('option').some(o=>o.value==='bridge-throat'));$('mapDestination').value='bridge-throat';$('mapDestination').dispatch('change');assert(!$('mapTravelQueue').hidden);assert(!$('mapTravelHeadingRow').hidden);$('mapTravelHeading').value='45';$('mapTravelHeading').dispatch('input');$('mapTravelQueue').click();refresh();
 let q=r.getFlightSequence(bridgeCraft.id);assert.equal(q.nodes.at(-1).heading,45);const field=stops.querySelector('[data-plan-heading="'+(q.nodes.length-1)+'"]');field.value='-30';field.dispatch('change');assert.equal(r.getFlightSequence(bridgeCraft.id).nodes.at(-1).heading,-30,'Arrival heading is editable inline');
 assert(pilot.previewTravel('bridge-throat'));assert(!$('pilotTripHeadingRow').hidden);$('pilotTripHeading').value='90';$('pilotTripHeading').dispatch('input');$('pilotTripQueue').click();assert.equal(r.getFlightSequence(bridgeCraft.id).nodes.at(-1).heading,90);
 pilot.dispose();ui.dispose();r.dispose();
}
// One gesture produces one action. Delayed singles cannot race an immediate Go.
{
 const document=uiDomFixture('<section id="scene"><canvas></canvas></section>');globalThis.document=document;const scene=document.getElementById('scene'),canvas=scene.querySelector('canvas'),timers=new Map();let serial=0,revision=1,previews=0,go=0,tracks=0,properties=0;
 const gestures=installScenePicking(scene,()=>({id:'earth',hit:'label'}),{getInteractionRevision:()=>revision,onLabelTap:()=>{previews++;return true;},onLabelDoubleTap:()=>{go++;return true;},onSelect:()=>properties++,onTrack:()=>tracks++,setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id)});
 const tap=t=>{canvas.dispatch('pointerdown',{pointerId:1,timeStamp:t,clientX:20,clientY:20,button:0});canvas.dispatch('pointerup',{pointerId:1,timeStamp:t+20,clientX:20,clientY:20,button:0});};
 tap(0);assert.equal(previews,0);tap(150);assert.equal(go,1);assert.equal(timers.size,0);canvas.dispatch('dblclick',{timeStamp:200,clientX:20,clientY:20,button:0});assert.equal(go,1);assert.equal(tracks+properties,0);
 tap(1000);for(const fn of timers.values())fn();timers.clear();assert.equal(previews,1);tap(2000);revision++;for(const fn of timers.values())fn();timers.clear();assert.equal(previews,1,'Mode/scene changes invalidate delayed single taps');gestures.dispose();
}
console.log('PASS: Drive/Auto authority UI, explicit destination labels, per-visit help, destination previews, live playlist order/loop/add controls and pause preservation, bridge waypoint destinations, and exclusive single/double label actions. DOM fixtures cover desktop and mobile state flow; visual layout is not simulated.');
