import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {installViewportUI} from '../dist/viewport-ui.js';
import {formatClockDuration,formatClockRate} from '../dist/object-clocks.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),f=fixture({width:390,height:720}),document=uiDomFixture(html);
globalThis.document=document;globalThis.window=document.createElement('window');window.devicePixelRatio=1;window.matchMedia=()=>({matches:false});
const $=id=>document.getElementById(id),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('orbital-expedition');const shuttle=r.objects.find(o=>o.type==='shuttle'),astronaut=r.objects.find(o=>o.type==='astronaut'),iss=r.objects.find(o=>o.type==='iss');
const optics=document.createElement('details');optics.className='geometry-panel';document.querySelector('.view-toolbar').append(optics);
let ui,pilot;
const refresh=()=>{pilot?.update();ui?.refresh(r.getState());};
const api={renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,activePreset:()=>r.sceneId,refresh,updateParameter(){},setFeature(){},selectObject(id){r.selectedId=id;},selectComponent(){},syncRendererState(){},markCustom(){},setPaused(value){r.state.paused=value;refresh();},syncViewMode(){},toast(){},openScenes(){},openDialog:id=>$(id).showModal(),onDialogClose(){},openHelp(){},startDrive:id=>pilot.start(id)};
ui=installViewportUI(api);pilot=installPilotControls({...api,mount:$('pilotControls')});await Promise.resolve();refresh();
assert($('viewportPause').classList.contains('control-discovery'),'New paused scene invites Play');
$('viewportPause').click();assert(!r.state.paused);assert(!$('viewportPause').classList.contains('control-discovery'));$('viewportPause').click();assert(r.state.paused);assert(!$('viewportPause').classList.contains('control-discovery'),'Pausing later does not restart Play pulse');
r.selectedId=shuttle.id;refresh();assert(!$('quickDrive').hidden);assert($('quickDrive').classList.contains('control-discovery'),'First vehicle selection invites Drive');
$('quickDrive').click();assert.equal(r.driveId,shuttle.id);assert(!$('quickDrive').classList.contains('control-discovery'));assert(!$('pilotControls').hidden);
for(const id of ['pilotCompact','pilotSettings','pilotChase','pilotOnboard','pilotClockRelation','pilotHorizonGap'])assert.equal($(id),null,`${id} is removed`);
assert.match($('pilotStop').getAttribute('aria-label'),/^Home/);assert($('pilotStop').querySelector('svg'));
for(const [button,mode] of [['viewportChase','chase'],['viewportRide','onboard'],['viewportTrack','track']]){ui.openCamera();assert.equal($('viewportTarget').value,shuttle.id);assert(!$(button).disabled);$(button).click();assert.equal(r.focusMode,mode);assert.equal(r.focusId,shuttle.id);assert($('cameraPanel').hidden,'Camera choice closes its panel');}
$('pilotStop').click();assert.equal(r.driveId,null);assert.equal(r.focusId,shuttle.id);assert.equal(r.focusMode,'track');refresh();assert(!$('quickDrive').classList.contains('control-discovery'),'Home does not restart Drive pulse');
r.focusId=r.selectedId=astronaut.id;refresh();assert($('quickDrive').hidden);r.selectedId=shuttle.id;refresh();assert(!$('quickDrive').classList.contains('control-discovery'));
// The HUD is exactly the requested pair, and shows distant t rather than t−τ.
const clocks=new Map([shuttle,astronaut,iss].map(o=>[o.id,{name:o.name,coordinateSeconds:18000,lagSeconds:10,rateFactor:1800}]));r.getObjectClock=id=>clocks.get(id)||null;
for(const object of [shuttle,astronaut,iss]){r.focusId=r.selectedId=object.id;pilot.update();assert.equal($('pilotDilation').textContent,formatClockDuration(18000));assert.equal($('pilotDilationRate').textContent,formatClockRate(1800));assert(!$('pilotDilationRow').textContent.includes('accumulated'));assert(!$('pilotDilationRow').hidden);assert(!$('pilotDilationRateRow').hidden);assert($('pilotSpeedRow').hidden);assert($('pilotTurnRow').hidden);}
r.loadScene('warp-lab');ui.sceneChanged();refresh();assert($('viewportPause').classList.contains('control-discovery'));const ship=r.objects.find(o=>o.type==='enterprise');r.selectedId=ship.id;refresh();assert($('quickDrive').classList.contains('control-discovery'));$('quickDrive').click();assert.equal(r.driveId,ship.id);assert(!$('viewportPause').classList.contains('control-discovery'),'Drive starting motion also resolves Play cue');assert($('pilotDilationRow').hidden,'Enterprise has no clock');$('pilotStop').click();assert.equal(r.focusId,ship.id);assert.equal(r.focusMode,'track');
r.loadScene('warp-lab');ui.sceneChanged();refresh();assert($('quickDrive').classList.contains('control-discovery'),'A new scene lifetime resets Drive discovery');
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert(css.includes('control-discovery-pulse 3.2s'));assert(css.includes('prefers-reduced-motion:reduce'));assert(css.includes('min-width:18ch'));assert(css.includes('.pilot-actions #pilotStop{width:36px;height:36px'));assert(css.includes('bottom:calc(var(--overlay-bottom) - 12px)'));
pilot.dispose();ui.dispose();r.dispose();
console.log('PASS: Home replaces pilot camera/back, all vehicle camera modes remain in main Camera, two scientific clock fields use distant t, independent Play/Drive discovery lifetimes, mobile spacing and reduced-motion styling. DOM contracts, not browser layout.');
