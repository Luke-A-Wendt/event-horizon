import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installViewportUI} from '../dist/viewport-ui.js';
import {createLoadingIndicator} from '../dist/loading-indicator.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS} from '../dist/config.js';
import {OBJECT_TYPES,OBJECT_DIMENSIONS} from '../dist/objects.js';

const [html,app]=await Promise.all(['index.html','app.js'].map(name=>readFile(new URL('../dist/'+name,import.meta.url),'utf8')));
const document=uiDomFixture(html);globalThis.document=document;
const window={matchMedia:()=>({matches:false}),addEventListener(){}};globalThis.window=window;
let now=100,timerSerial=0,frameCount=0;const timers=new Map(),frames=[];
const clock={performance:{now:()=>now},setTimeout:(callback,delay=0)=>{const id=++timerSerial;timers.set(id,{callback,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
function advance(ms){const end=now+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,timer])=>timer.at<=end);if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}now=end;}
async function frame(){frameCount++;const batch=frames.splice(0);for(const callback of batch)callback(now);await Promise.resolve();}

// The rendering host is a deliberately small contract double. Real camera,
// worker, shader, and physics behavior are covered by their own suites.
let host,nextStartup=null;
function createRenderHost(canvas,callbacks,{cpu}){
 let state={...DEFAULTS},items=[],serial=0,revision=0,prepared=false;const calls=[],lifecycle={sceneLoadState:'loading',renderReady:false,renderBusy:true,sceneLoadError:''};
 const api={ready:true,cpu,gl:cpu?null:{},camera:{yaw:.25,pitch:.19,distance:32,lookYaw:0,lookPitch:0,focusDistance:6},target:{yaw:.25,pitch:.19,distance:32,lookYaw:0,lookPitch:0,focusDistance:6},time:0,sceneId:'disk',quality:cpu?'cpu':'adaptive',get state(){return state;},set state(value){state=value;},get objects(){return items;},set objects(value){items=value;},get nextObjectId(){return serial;},set nextObjectId(value){serial=value;},refreshConfiguration(){},fillHoles(){},fillObjects(){},updateCameraFrame(){},focusId:null,focusMode:'track',selectedId:null,calls,startup:nextStartup||Promise.resolve({available:true,worker:true,cpu}),
  getObjectContext(){return {kind:state.bridge?'bridge':state.blackHole?'orbit':'local',referenceLabel:'scene origin',allowedTypes:state.bridge?['enterprise','shuttle','astronaut']:OBJECT_TYPES.map(o=>o.id)};},
  getObjects(){return items.map(o=>({...o,focused:o.id===api.focusId}));},
  getState(){return {...state,cpu,sceneLoadRevision:revision,...lifecycle,objects:api.getObjects(),objectContext:api.getObjectContext(),objectCount:items.length,maxObjects:10,selectedId:api.selectedId,focusId:api.focusId,focusMode:api.focusMode,warpObjectId:items.find(o=>o.warpEnabled)?.id,bridgeObjectId:items.find(o=>o.bridgeTraveler)?.id,bridgeRegion:'near',fps:30,scale:1,steps:100,effectiveQuality:'medium',cameraDistanceMeters:1000,worldDistance:35};},
  getSceneTargets(){return [...(state.blackHole?[{id:'primary',label:'Black hole',enabled:true,canTrack:true}]:[]),...items.map(o=>({id:o.id,label:o.label,enabled:true,canTrack:true,canBoard:true}))];},
  update(patch){Object.assign(state,patch);},setQuality(value){api.quality=value;},selectObject(id){api.selectedId=id;},
  requestSceneLoad(){if(api.throwOnPrepare)throw new Error('Scene preparation failed');revision++;prepared=true;Object.assign(lifecycle,{sceneLoadState:'loading',renderReady:false,renderBusy:true,sceneLoadError:''});calls.push(['requestSceneLoad',revision]);},
  emit(patch={}){Object.assign(lifecycle,patch);callbacks.onStats(api.getState());},
  loadScene(id){if(!prepared)api.requestSceneLoad();prepared=false;calls.push(['loadScene',id,frameCount]);if(api.throwOnLoad)throw new Error('Scene geometry failed validation');api.sceneId=id;state=makePreset(id);items=[];api.focusId=null;api.selectedId=null;for(const o of SCENE_PRESETS.find(p=>p.id===id)?.objects||[])api.addObject(o.type,o.radius,o.phase,o.scale);return api.getState();},
  addObject(type,radius=12,phase=0,scale=1){const placement=api.getObjectContext().kind,o={id:'object-'+(++serial),type,label:OBJECT_TYPES.find(o=>o.id===type).label,radius,height:0,phase,scale,placement,x:0,y:0,z:0,headingDegrees:phase*180/Math.PI,warpEnabled:false,bridgeTraveler:placement==='bridge',lengthMeters:OBJECT_DIMENSIONS[type].lengthMeters};items.push(o);return o;},
  updateObject(id,patch){Object.assign(items.find(o=>o.id===id),patch);calls.push(['updateObject',id,patch]);},
  removeObject(id){items=items.filter(o=>o.id!==id);},clearObjects(){items=[];},
  setObjectWarp(id,enabled){for(const o of items)o.warpEnabled=o.id===id&&enabled;state.warp=enabled;calls.push(['setObjectWarp',id,enabled]);},
  exploreWarp(){let o=items.find(o=>o.type==='enterprise')||api.addObject('enterprise');api.setObjectWarp(o.id,true);api.focusTarget(o.id,'track');return o;},
  setBridgeTraveler(type){let o=items.find(o=>o.bridgeTraveler);if(o){Object.assign(o,{type,label:OBJECT_TYPES.find(o=>o.id===type).label,lengthMeters:OBJECT_DIMENSIONS[type].lengthMeters});}else o=api.addObject(type);calls.push(['setBridgeTraveler',type]);return o;},
  focusObject(id,mode){return api.focusTarget(id,mode);},focusTarget(id,mode){if(!api.getSceneTargets().some(o=>o.id===id))return false;api.focusId=id;api.focusMode=mode;return true;},releaseFocus(){api.focusId=null;},
  setViewMode(mode){state.viewMode=mode;},resetCamera(){api.focusId=null;},setPresentationPaused(){},getVRSupport:async()=>({supported:false,reason:'No headset in fixture'}),dispose(){api.disposed=true;},resize(){},zoom(){},look(){},
 };
 nextStartup=null;host=api;return api;
}
const sandbox={document,window,matchMedia:window.matchMedia,performance:clock.performance,requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame(){},setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,setInterval:()=>1,clearInterval(){},console:{...console,error(){}},createRenderHost,snapshotRenderer,restoreRenderer,createLoadingIndicator:(el,reason)=>createLoadingIndicator(el,reason,clock),installViewportUI,renderMathGuide(){},renderWarpGuide(){},DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS,OBJECT_TYPES};
vm.runInNewContext(app.replace(/^import[^\n]+\n/gm,''),sandbox,{filename:'app.js'});
await Promise.resolve();await Promise.resolve();
const $=id=>{const node=document.getElementById(id);assert(node,`Missing control ${id}`);return node;};

// Actual app events are driven with a controlled animation-frame / timer queue.
// This verifies first-paint ordering and state races, not real browser paint.
const ready=()=>host.emit({sceneLoadState:'ready',renderReady:true,renderBusy:false});
ready();advance(500);assert.equal($('loading').hidden,true);
assert.equal($('renderStatus').tagName,'DIV');assert.equal($('renderStatus').events.get('click'),undefined);
assert.equal(document.getElementById('qualityShortcut'),null);
assert.equal($('gpuLabel').textContent,'ADAPTIVE');assert.equal($('qualityTier').textContent,'MEDIUM');assert.equal($('fpsCorner').textContent,'30 FPS');
for(const tier of ['low','medium','high']){sandbox.updateQualityStatus({...host.getState(),effectiveQuality:tier,fps:59.5});assert.equal($('gpuLabel').textContent,'ADAPTIVE');assert.equal($('qualityTier').textContent,tier.toUpperCase());}
$('quality').value='ultra';$('quality').dispatch('change');assert.equal($('gpuLabel').textContent,'MANUAL');
const css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');assert(css.includes('grid-template-columns:5px 61px 44px 48px'));assert(css.includes('font-variant-numeric:tabular-nums'));assert(css.includes('grid-template-columns:48px 36px 40px;column-gap:4px;font-size:8px'));assert(css.includes('grid-template-columns:52px 38px 42px;column-gap:5px;font-size:8px'));assert(css.includes('.scene.render-failed #universe{visibility:hidden}'));
const credits=document.querySelector('.author-credits');assert(credits.textContent.includes('Author Dr. Luke A. Wendt'));assert(credits.textContent.includes('Co-author Astra Ultra'));
assert.deepEqual(credits.querySelectorAll('a').map(link=>link.getAttribute('href')),['https://github.com/Luke-A-Wendt','https://openai.com/index/gpt-6-astra/']);
assert.deepEqual(document.querySelectorAll('[data-spectrum]').map(button=>button.dataset.spectrum),['visible','xray','infrared','radio','gamma','geometry']);
for(const spectrum of ['radio','gamma']){document.querySelector(`[data-spectrum="${spectrum}"]`).click();assert.equal(host.state.spectrum,spectrum);assert($('spectrumNote').textContent.includes('false color'));}

$('viewportScenes').click();assert.equal($('atlasDialog').open,true);
const initialLoads=host.calls.filter(call=>call[0]==='loadScene').length;
document.querySelector('[data-scene="empty-space"]').click();
assert.equal($('atlasDialog').open,false,'Gallery dismisses in the tap task');assert.equal($('loading').hidden,false,'Loading appears in the tap task');assert($('loadingReason').textContent.startsWith('Opening '));
assert.equal(host.calls.filter(call=>call[0]==='loadScene').length,initialLoads,'No scene construction before a paint opportunity');
const oldRevision=host.getState().sceneLoadRevision;
sandbox.handleStats({...host.getState(),sceneLoadRevision:oldRevision-1,sceneLoadState:'ready',renderReady:true,renderBusy:false});advance(500);assert.equal($('loading').hidden,false,'Old completed frames cannot clear the new loader');
await frame();assert.equal(host.calls.filter(call=>call[0]==='loadScene').length,initialLoads,'First frame only schedules construction for the following frame');
// A second choice replaces the first without constructing an obsolete scene.
$('viewportScenes').click();document.querySelector('[data-scene="bridge"]').click();
await frame();assert.equal(host.calls.filter(call=>call[0]==='loadScene').length,initialLoads);
await frame();assert.equal(host.sceneId,'bridge');assert.equal(host.calls.filter(call=>call[0]==='loadScene').length,initialLoads+1);
assert.equal($('loading').hidden,false,'Loading persists until the matching completed frame');
ready();advance(500);assert.equal($('loading').hidden,true);
sandbox.handleStats({...host.getState(),sceneLoadRevision:oldRevision,sceneLoadState:'failed',sceneLoadError:'Stale failure'});assert.equal($('renderError').hidden,true,'Old failures cannot replace a newly completed scene');

// Both reported deadline failures and synchronous construction failures surface.
document.querySelector('[data-scene="empty-space"]').click();await frame();await frame();
host.emit({sceneLoadState:'failed',sceneLoadError:'The CPU renderer did not finish loading in time.',renderReady:false,renderBusy:false});advance(500);
assert.equal($('renderError').hidden,false);assert($('renderError').textContent.includes('Failed to load'));assert.equal($('loading').hidden,true);assert($('scene').classList.contains('render-failed'));
$('chooseAnotherScene').click();assert.equal($('atlasDialog').open,true);document.querySelector('[data-scene="disk"]').click();assert.equal($('renderError').hidden,true);assert(!$('scene').classList.contains('render-failed'));await frame();await frame();ready();advance(500);
host.throwOnLoad=true;document.querySelector('[data-scene="empty-space"]').click();await frame();await frame();assert.equal($('renderError').hidden,false);assert($('errorText').textContent.includes('validation'));
// Retry keeps an explicitly selected CPU backend; it does not silently retry GPU.
$('continueCPU').click();await Promise.resolve();await Promise.resolve();assert.equal(host.cpu,true);host.emit({sceneLoadState:'failed',sceneLoadError:'CPU failed',renderReady:false,renderBusy:false});const oldCPU=host;$('retryRenderer').click();await Promise.resolve();await Promise.resolve();assert(oldCPU.disposed);assert.equal(host.cpu,true);assert.equal($('renderError').hidden,true);

// A backend retry during the paint window retains the latest scene choice.
ready();advance(500);document.querySelector('[data-scene="radio-observatory"]').click();const stagedHost=host;$('retryRenderer').click();await Promise.resolve();await Promise.resolve();assert(stagedHost.disposed);await frame();await frame();assert.equal(host.sceneId,'radio-observatory');assert.equal(host.cpu,true);ready();advance(500);
host.throwOnPrepare=true;document.querySelector('[data-scene="empty-space"]').click();assert.equal($('renderError').hidden,false);assert($('errorText').textContent.includes('preparation'));host.throwOnPrepare=false;

// A deferred loader can be promoted immediately, with no stale timer hiding it.
const element=document.createElement('div'),reason=document.createElement('span');element.hidden=true;
const indicator=createLoadingIndicator(element,reason,clock);indicator.update(true,'Deferred');advance(50);assert.equal(element.hidden,true);indicator.update(true,'Scene tap',true);assert.equal(element.hidden,false);assert.equal(reason.textContent,'Scene tap');advance(200);assert.equal(element.hidden,false);indicator.update(false);advance(50);indicator.update(true,'A newer request',true);advance(500);assert.equal(element.hidden,false);indicator.update(false);advance(500);assert.equal(element.hidden,true);indicator.dispose();
console.log('PASS: scene tap first-paint ordering, last-choice cancellation, revision-guarded readiness, failure/retry recovery, CPU retry preservation, stable noninteractive quality/FPS, six light / geometry controls, exact linked credits, and immediate loader promotion. DOM lifecycle fixture; real S9/GPU/browser behavior is not emulated.');
