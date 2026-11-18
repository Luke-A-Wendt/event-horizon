import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {installViewportUI} from '../dist/viewport-ui.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const [width,height] of [[1280,840],[390,740],[740,390]]){
 const f=fixture({width,height}),document=uiDomFixture(html);globalThis.document=document;globalThis.window=document.createElement('window');window.devicePixelRatio=1;window.matchMedia=()=>({matches:false});
 const $=id=>document.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');
 const shuttle=r.objects.find(o=>o.type==='shuttle'),sun=r.objects.find(o=>o.name==='Sun'),mars=r.objects.find(o=>o.name==='Mars');r.selectedId=r.focusId=shuttle.id;r.state.annotations=true;
 const optics=document.createElement('details');optics.className='geometry-panel';document.querySelector('.view-toolbar').append(optics);
 let ui,pilot;const refresh=()=>{pilot?.update();ui?.refresh(r.getState());};
 const api={renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,activePreset:()=>r.sceneId,refresh,updateParameter:(k,v)=>r.update({[k]:v}),setFeature(){},selectObject:id=>{r.selectedId=id;},selectComponent(){},syncRendererState(){},markCustom(){},setPaused:v=>{r.state.paused=v;},syncViewMode(){},toast(){},openScenes(){},openHelp(){},openDialog:id=>$(id).showModal(),onDialogClose(){},closeTravelPreview:()=>pilot?.closeTravel(),startDrive:id=>pilot.start(id)};
 ui=installViewportUI(api);pilot=installPilotControls({...api,mount:$('pilotControls')});await Promise.resolve();refresh();
 assert(pilot.previewTravel(mars.id));assert(!$('pilotTravel').hidden);
 const scenePrompt=$('pilotTravel'),sceneActions=scenePrompt.querySelector('.pilot-trip-actions');assert(scenePrompt.children.indexOf(sceneActions)<scenePrompt.children.indexOf(scenePrompt.querySelector('.pilot-trip-time')),'3D decisions precede estimates');$('pilotTripCancel').click();assert(scenePrompt.hidden);
 ui.openMap(sun.id);const map=$('orbitMapDialog'),top=map.querySelector('.map-dialog-top');assert(top&&map.children[0]===top);assert(top.contains($('mapTravel')));assert(!$('orbitMapDrawing').contains($('mapTravel')),'Map confirmation is outside the scrolling drawing');
 map.scrollTop=900;$('mapBodyPicker').value=mars.id;$('mapBodyPicker').dispatch('change');assert(!$('mapTravel').hidden);assert(!$('mapTravelGo').disabled);assert.equal($('mapTravelTarget').textContent,'Mars');assert.equal(map.scrollTop,900,'Showing sticky actions does not scroll/jump the map');
 const mapPrompt=$('mapTravel');assert(mapPrompt.children.indexOf(mapPrompt.querySelector('.map-travel-actions'))<mapPrompt.children.indexOf($('mapTravelTimes')),'Map actions precede estimates');
 $('mapTravelCancel').click();assert(mapPrompt.hidden);assert(map.open);$('mapBodyPicker').dispatch('change');assert(!mapPrompt.hidden);$('mapTravelGo').click();refresh();assert(!map.open);assert(r.getTravelState().active);assert(!$('pilotFlightReadout').hidden);assert(!$('pilotControls').hidden);assert($('scene').classList.contains('has-flight-controls'),'Guidance retains the vehicle control strip');assert($('scene').classList.contains('has-flight-readout'));
 assert(!$('pilotDilationRow').hidden,'Clock remains at lower right independently');assert(!$('pilotFlightReadout').contains($('pilotDilation')));assert(!$('cameraToggle').disabled);$('pilotAutoCancel').click();assert($('scene').classList.contains('has-flight-readout'));assert(!$('pilotFlightReadout').hidden);assert(!$('pilotControls').hidden);
 pilot.dispose();ui.dispose();r.dispose();
}
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert(css.includes('.map-dialog-top{position:sticky;top:0'));assert(css.includes('.pilot-flight-readout{position:absolute;left:24px;right:auto;top:auto;bottom:var(--overlay-bottom)'));assert(css.includes('padding:0;border:0;background:none;box-shadow:none'));assert(!css.includes('.scene.has-flight-readout{--flight-strip:0px}'));assert(css.includes('.scene.has-flight-controls.has-flight-readout{--flight-strip:64px'));assert(css.includes('.pilot-travel{top:76px;bottom:auto'));
console.log('PASS: prominent Map and 3D travel decisions, unchanged Go/cancel flow, persistent vehicle controls, separate lower-left telemetry/right clock, and manual camera access. DOM/style fixtures at desktop/portrait/landscape sizes; browser layout unverified.');
