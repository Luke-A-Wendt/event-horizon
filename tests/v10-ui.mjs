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
let now=100;const clock={performance:{now:()=>now},setTimeout:()=>1,clearTimeout(){}};
// The rendering host is a deliberately small contract double. Real camera,
// worker, shader, and physics behavior are covered by their own suites.
let host,nextStartup=null;
function createRenderHost(canvas,callbacks,{cpu}){
 let state={...DEFAULTS},items=[],serial=0;const calls=[];
 const api={ready:true,cpu,gl:cpu?null:{},camera:{yaw:.25,pitch:.19,distance:32,lookYaw:0,lookPitch:0,focusDistance:6},target:{yaw:.25,pitch:.19,distance:32,lookYaw:0,lookPitch:0,focusDistance:6},time:0,sceneId:'disk',quality:cpu?'cpu':'adaptive',get state(){return state;},set state(value){state=value;},get objects(){return items;},set objects(value){items=value;},get nextObjectId(){return serial;},set nextObjectId(value){serial=value;},refreshConfiguration(){},fillHoles(){},fillObjects(){},updateCameraFrame(){},focusId:null,focusMode:'track',selectedId:null,calls,startup:nextStartup||Promise.resolve({available:true,worker:true,cpu}),
  getObjectContext(){return {kind:state.bridge?'bridge':state.blackHole?'orbit':'local',referenceLabel:'scene origin',allowedTypes:state.bridge?['enterprise','shuttle','astronaut']:OBJECT_TYPES.map(o=>o.id)};},
  getObjects(){return items.map(o=>({...o,focused:o.id===api.focusId}));},
  getState(){return {...state,objects:api.getObjects(),objectContext:api.getObjectContext(),objectCount:items.length,maxObjects:10,selectedId:api.selectedId,focusId:api.focusId,focusMode:api.focusMode,warpObjectId:items.find(o=>o.warpEnabled)?.id,bridgeObjectId:items.find(o=>o.bridgeTraveler)?.id,bridgeRegion:'near',fps:30,scale:1,steps:100,effectiveQuality:'medium',renderReady:true,renderBusy:false,cameraDistanceMeters:1000,worldDistance:35};},
  getSceneTargets(){return [...(state.blackHole?[{id:'primary',label:'Black hole',enabled:true,canTrack:true}]:[]),...items.map(o=>({id:o.id,label:o.label,enabled:true,canTrack:true,canBoard:true}))];},
  update(patch){Object.assign(state,patch);},setQuality(value){api.quality=value;},selectObject(id){api.selectedId=id;},
  loadScene(id){api.sceneId=id;state=makePreset(id);items=[];api.focusId=null;api.selectedId=null;for(const o of SCENE_PRESETS.find(p=>p.id===id)?.objects||[])api.addObject(o.type,o.radius,o.phase,o.scale);return api.getState();},
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
const sandbox={document,window,matchMedia:window.matchMedia,performance:clock.performance,requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console,createRenderHost,snapshotRenderer,restoreRenderer,createLoadingIndicator:(el,reason)=>createLoadingIndicator(el,reason,clock),installViewportUI,renderMathGuide(){},renderWarpGuide(){},DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS,OBJECT_TYPES};
vm.runInNewContext(app.replace(/^import[^\n]+\n/gm,''),sandbox,{filename:'app.js'});
await Promise.resolve();await Promise.resolve();
const $=id=>{const node=document.getElementById(id);assert(node,`Missing control ${id}`);return node;};

// Exercise the shipped UI event handlers with the same limited DOM contract.
// This verifies affordances/state wiring, not browser layout or real rendering.
const addBody=$('addObjectPanel').querySelector('.object-body');
assert.equal(addBody.children.find(n=>n.tagName!=='#TEXT').id,'addObject','The creation action is the first control, above descriptions');
assert.equal(document.querySelector('link[rel="preload"]').getAttribute('href'),'assets/loading-orbit.gif');
assert.equal(document.querySelector('.loading-orbit-motion').getAttribute('src'),'assets/loading-orbit.gif');
assert.equal(document.querySelector('.loading-orbit-still').getAttribute('src'),'assets/loading-orbit-still.svg');
const css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');
assert(css.includes('.loading-orbit-motion{display:none!important}'));
assert(!css.includes('@keyframes hole-orbit'),'No CSS spinner competes with the self-contained GIF');
assert.deepEqual($('diskStyle').querySelectorAll('option').slice(-2).map(o=>o.value),['radiant','ribbons']);
assert.equal($('mass').getAttribute('max'),'100');assert.equal($('spin').getAttribute('max'),'0.998');

function add(type){$('elementsToggle').click();if($('elementsPanel').hidden)$('elementsToggle').click();$('viewportAdd').click();$('objectType').value=type;$('objectType').dispatch('change');$('addObject').click();const item=host.getObjects().at(-1);document.querySelector(`[data-element="${item.id}"]`).click();return item;}
const shuttle=add('shuttle');
assert.equal($('inspectorCockpit').hidden,false);assert.equal($('cockpitObject').hidden,false);
$('inspectorCockpit').click();assert.equal(host.focusId,shuttle.id);assert.equal(host.focusMode,'onboard');assert($('toast').textContent.includes('cockpit'));
$('cameraToggle').click();$('viewportTarget').value=shuttle.id;$('viewportTarget').dispatch('change');assert.equal($('viewportCockpit').hidden,false);$('viewportCockpit').click();assert.equal(host.focusId,shuttle.id);assert.equal(host.focusMode,'onboard');
const astronaut=add('astronaut');assert.equal($('inspectorCockpit').hidden,true);assert.equal($('cockpitObject').hidden,true);
$('editMotion').value='infall';$('editMotion').dispatch('change');assert.equal(host.getObjects().find(o=>o.id===astronaut.id).motion,'infall');assert.equal($('editRadiusLabel').textContent,'Starting distance from black hole');
$('editMotion').value='horizon';$('editMotion').dispatch('change');assert.equal($('editRadius').disabled,true);assert.equal($('editHeight').disabled,true);assert.equal($('editPhase').disabled,false);
const probe=add('probe');assert.equal($('probeProperties').hidden,false);
$('editLuminosity').value='3';$('editLuminosity').dispatch('input');assert.equal(host.getObjects().find(o=>o.id===probe.id).logLuminosity,3);assert.equal($('editLuminosityValue').textContent,'1.0 thousand ×');
$('editLuminosity').value='8';$('editLuminosity').dispatch('input');assert.equal(host.getObjects().find(o=>o.id===probe.id).logLuminosity,8);assert.equal($('editLuminosityValue').textContent,'100.0 million ×');
$('closeInspector').click();
vm.runInNewContext("var managerCalls=0;const originalManager=renderObjectManager;renderObjectManager=(...args)=>{managerCalls++;return originalManager(...args);};",sandbox);
for(let i=0;i<100;i++){now+=16;sandbox.handleStats({...host.getState(),fps:30});}
assert.equal(sandbox.managerCalls,0,'Hidden property panels are not updated by frame stats');
$('elementsToggle').click();const stableList=$('viewportElements').children[0];$('elementsToggle').click();
for(let i=0;i<100;i++){now+=16;sandbox.handleStats({...host.getState(),fps:30});}
assert.equal($('viewportElements').children[0],stableList,'Closed element drawer keeps its DOM');
$('elementsToggle').click();document.querySelector(`[data-element="${probe.id}"]`).click();sandbox.managerCalls=0;
for(let i=0;i<100;i++){now+=16;sandbox.handleStats({...host.getState(),fps:30});}
assert(sandbox.managerCalls<=7,'Open properties update at most four times per second for routine frames');
now+=300;sandbox.handleStats({...host.getState(),cpu:true,cpuBackend:'worker-commands'});assert.equal($('cpuBackendStatus').textContent,'Geometry in a worker');
now+=300;sandbox.handleStats({...host.getState(),cpu:true,cpuBackend:'cooperative-main'});assert.equal($('cpuBackendStatus').textContent,'Compatibility renderer · cooperative tasks');

$('bridgeOtherNebula').checked=false;$('bridgeOtherNebula').dispatch('change');assert.equal(host.getState().bridgeOtherNebula,false);
// Backend retries retain state even when the previous startup never completed.
$('closeInspector').click();document.querySelector('[data-scene="empty-space"]').click();await Promise.resolve();
const cabin=add('shuttle');$('editX').value='125';$('editX').dispatch('change');$('inspectorCockpit').click();
sandbox.updateParameter('exposure',2.2);$('quality').value='high';host.camera.lookYaw=.4;host.target.lookYaw=.4;host.time=23;
const previous=host;let resolveOldStartup;nextStartup=new Promise(resolve=>resolveOldStartup=resolve);
const staleStartup=sandbox.initRenderer(false),pending=host;
assert.notEqual(pending,previous);assert(previous.disposed);assert.equal(pending.sceneId,'empty-space');assert.equal(pending.getObjects()[0].x,125);assert.equal(pending.camera.lookYaw,.4);assert.equal(pending.time,23);assert.equal(pending.getState().exposure,2.2);assert.equal(pending.focusId,cabin.id);
const addedWhileStarting=add('probe');$('editLuminosity').value='5';$('editLuminosity').dispatch('input');pending.camera.lookYaw=.8;pending.target.lookYaw=.8;pending.time=42;
$('continueCPU').click();const cpuHost=host;await Promise.resolve();await Promise.resolve();
assert.notEqual(cpuHost,pending);assert(pending.disposed);assert.equal(cpuHost.cpu,true);assert.equal(cpuHost.quality,'cpu');assert.equal(cpuHost.sceneId,'empty-space');assert.equal(cpuHost.camera.lookYaw,.8);assert.equal(cpuHost.time,42);assert.equal(cpuHost.getObjects().find(o=>o.id===addedWhileStarting.id).logLuminosity,5);assert.equal(cpuHost.selectedId,addedWhileStarting.id);assert.equal(cpuHost.getObjects()[0].x,125);
resolveOldStartup({workerFailed:true,reason:'Old startup failed after CPU was ready'});await staleStartup;assert.equal(host,cpuHost);assert.equal($('renderError').hidden,true,'An obsolete startup cannot replace or error the current renderer');
$('retryGPU').click();const gpuHost=host;await Promise.resolve();await Promise.resolve();assert.equal(gpuHost.cpu,false);assert.equal(gpuHost.quality,'high');assert.equal(gpuHost.camera.lookYaw,.8);assert.equal(gpuHost.getObjects().length,2);assert.equal(gpuHost.selectedId,addedWhileStarting.id);
console.log('PASS: dedicated shuttle cockpit actions, top creation button, exponential probe intensity, motion controls, independent bridge nebula, preloaded GIF/reduced-motion asset, CPU diagnostics, and bounded visible-only UI updates, and state-preserving GPU/CPU retries during unfinished startup. DOM contract fixture; browser layout is not emulated.');
