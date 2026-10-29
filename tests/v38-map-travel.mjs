import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {installViewportUI} from '../dist/viewport-ui.js';
import {formatClockDuration} from '../dist/object-clocks.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for(const width of [390,1280]){
 const f=fixture({width,height:720}),document=uiDomFixture(html);
 globalThis.document=document;globalThis.window=document.createElement('window');window.devicePixelRatio=1;window.matchMedia=()=>({matches:false});
 const $=id=>document.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 r.loadScene('solar-system');r.sceneLoad={state:'ready',revision:1};r.lastTime=1000;
 const shuttle=r.objects.find(o=>o.type==='shuttle'),enterprise=r.objects.find(o=>o.type==='enterprise'),earth=r.objects.find(o=>o.name==='Earth'),moon=r.objects.find(o=>o.name==='Moon');
 const optics=document.createElement('details');optics.className='geometry-panel';document.querySelector('.view-toolbar').append(optics);
 let ui,pilot,closedBeforeStart=false;
 const refresh=()=>{pilot?.update();ui?.refresh(r.getState());};
 const api={renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,activePreset:()=>r.sceneId,refresh,
 updateParameter(key,value){r.update({[key]:value});},setFeature(){},selectObject(id){r.selectedId=id;},selectComponent(){},syncRendererState(){},markCustom(){},setPaused(value){r.state.paused=value;refresh();},syncViewMode(){},toast(){},openScenes(){},openHelp(){},
 openDialog(id){$(id).showModal();r.setPresentationPaused(true);},onDialogClose(){r.setPresentationPaused(!!document.querySelector('dialog[open]'));},startDrive:id=>pilot.start(id)};
 ui=installViewportUI(api);pilot=installPilotControls({...api,mount:$('pilotControls')});await Promise.resolve();refresh();
 const pick=id=>{$('mapBodyPicker').value=id;$('mapBodyPicker').dispatch('change');};
 ui.openMap(earth.id);assert($('mapTravel').hidden,'Ordinary map has no flight planner');$('closeOrbitMap').click();
 pilot.start(shuttle.id);refresh();assert($('mapToggle').classList.contains('control-discovery'));assert($('annotationShortcut').classList.contains('control-discovery'),'Labels retain their own Drive cue');
 $('mapToggle').click();assert($('orbitMapDialog').open);assert(r.presentationPaused);assert(!$('mapToggle').classList.contains('control-discovery'));assert($('mapTravelGo').disabled,'Cannot fly to the driven ship itself');
 pick(moon.id);const preview=r.previewTravel(moon.id);assert(!preview.error);assert.equal($('mapTravelTime').textContent,formatClockDuration(preview.coordinateSeconds));assert.equal($('mapTravelProper').textContent,formatClockDuration(preview.properSeconds));assert.match($('mapTravelMode').textContent,/1g/);assert(!$('mapTravelGo').disabled);assert.equal(r.focusId,shuttle.id);assert.equal(r.selectedId,shuttle.id);
 $('mapTravelCancel').click();assert($('mapTravel').hidden);assert($('orbitMapDialog').open);pick(moon.id);assert(!$('mapTravel').hidden,'Explicit reselection reopens the plan');
 const start=r.startTravel.bind(r);r.startTravel=id=>{closedBeforeStart=!$('orbitMapDialog').open&&!r.presentationPaused;return start(id);};
 $('mapTravelGo').click();assert(closedBeforeStart,'Map closes and presentation pause releases before starting the route');assert(r.getTravelState().active);assert(!r.state.paused);assert.equal(r.focusId,shuttle.id);assert(!$('pilotTravel').hidden,'The normal pilot progress card follows flights started in the map');
 ui.openMap(earth.id);pick(moon.id);assert($('mapTravelGo').disabled);assert.match($('mapTravelNote').textContent,/current flight/);$('closeOrbitMap').click();
 r.lastTime=1000;for(let i=0;i<110&&r.getTravelState().active;i++){r.advanceSimulation(r.lastTime+100);r.fillHoles();r.fillObjects();r.updateCameraFrame();refresh();}
 assert(!r.getTravelState().active);assert.equal(shuttle.parentId,moon.id);assert.equal(r.focusId,shuttle.id);assert.equal(r.focusMode,'track');assert(!$('mapToggle').classList.contains('control-discovery'));
 pilot.start(enterprise.id);refresh();assert($('mapToggle').classList.contains('control-discovery'),'A new Drive session restores Map discovery');ui.openMap(earth.id);pick(earth.id);assert.match($('mapTravelMode').textContent,/WARP 1/);assert($('mapTravelProperRow').hidden,'Clock-exempt Enterprise has a single trip estimate');assert(!$('mapTravelGo').disabled);
 // Deleted targets and stale Go clicks cannot start a flight or change focus.
 const targets=r.getTravelTargets.bind(r);r.getTravelTargets=()=>[];refresh();assert($('mapTravelGo').disabled);$('mapTravelGo').dispatch('click');assert(!r.getTravelState().active);assert.equal(r.focusId,enterprise.id);r.getTravelTargets=targets;
 // A route failure preserves the open map and active pilot without a loading screen.
 pick(earth.id);r.startTravel=()=>false;$('mapTravelGo').click();assert($('orbitMapDialog').open);assert(r.presentationPaused);assert.equal(r.driveId,enterprise.id);assert.match($('mapTravelNote').textContent,/no longer available/);
 $('closeOrbitMap').click();$('pilotStop').click();refresh();assert(!$('mapToggle').classList.contains('control-discovery'));pilot.dispose();ui.dispose();r.dispose();
}
console.log('PASS: Map Drive cue, destination preview/Go/Not now, 1g and Warp 1 clocks, actual dialog-pause release, ship focus, arrival orbit, invalid/busy/failure guards at mobile/desktop fixture sizes.');
