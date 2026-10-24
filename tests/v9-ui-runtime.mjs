import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installViewportUI} from '../dist/viewport-ui.js';
import {createLoadingIndicator} from '../dist/loading-indicator.js';
import {DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS} from '../dist/config.js';
import {OBJECT_TYPES,OBJECT_DIMENSIONS} from '../dist/objects.js';

const [html,app]=await Promise.all(['index.html','app.js'].map(name=>readFile(new URL('../dist/'+name,import.meta.url),'utf8')));
const document=uiDomFixture(html);globalThis.document=document;
const window={matchMedia:()=>({matches:false}),addEventListener(){}};globalThis.window=window;
const clock={performance:{now:()=>100},setTimeout:()=>1,clearTimeout(){}};
// The rendering host is a deliberately small contract double. Real camera,
// worker, shader, and physics behavior are covered by their own suites.
let host;
function createRenderHost(canvas,callbacks,{cpu}){
 let state={...DEFAULTS},items=[],serial=0;const calls=[];
 const api={ready:true,cpu,gl:cpu?null:{},focusId:null,focusMode:'track',selectedId:null,calls,startup:Promise.resolve({available:true,worker:true,cpu}),
  getObjectContext(){return {kind:state.bridge?'bridge':state.blackHole?'orbit':'local',referenceLabel:'scene origin',allowedTypes:state.bridge?['enterprise','shuttle','astronaut']:OBJECT_TYPES.map(o=>o.id)};},
  getObjects(){return items.map(o=>({...o,focused:o.id===api.focusId}));},
  getState(){return {...state,objects:api.getObjects(),objectContext:api.getObjectContext(),objectCount:items.length,maxObjects:10,selectedId:api.selectedId,focusId:api.focusId,focusMode:api.focusMode,warpObjectId:items.find(o=>o.warpEnabled)?.id,bridgeObjectId:items.find(o=>o.bridgeTraveler)?.id,bridgeRegion:'near',fps:30,scale:1,steps:100,effectiveQuality:'medium',renderReady:true,renderBusy:false,cameraDistanceMeters:1000,worldDistance:35};},
  getSceneTargets(){return [...(state.blackHole?[{id:'primary',label:'Black hole',enabled:true,canTrack:true}]:[]),...items.map(o=>({id:o.id,label:o.label,enabled:true,canTrack:true,canBoard:true}))];},
  update(patch){Object.assign(state,patch);},setQuality(){},selectObject(id){api.selectedId=id;},
  loadScene(id){state=makePreset(id);items=[];api.focusId=null;api.selectedId=null;for(const o of SCENE_PRESETS.find(p=>p.id===id)?.objects||[])api.addObject(o.type,o.radius,o.phase,o.scale);return api.getState();},
  addObject(type,radius=12,phase=0,scale=1){const placement=api.getObjectContext().kind,o={id:'object-'+(++serial),type,label:OBJECT_TYPES.find(o=>o.id===type).label,radius,height:0,phase,scale,placement,x:0,y:0,z:0,headingDegrees:phase*180/Math.PI,warpEnabled:false,bridgeTraveler:placement==='bridge',lengthMeters:OBJECT_DIMENSIONS[type].lengthMeters};items.push(o);return o;},
  updateObject(id,patch){Object.assign(items.find(o=>o.id===id),patch);calls.push(['updateObject',id,patch]);},
  removeObject(id){items=items.filter(o=>o.id!==id);},clearObjects(){items=[];},
  setObjectWarp(id,enabled){for(const o of items)o.warpEnabled=o.id===id&&enabled;state.warp=enabled;calls.push(['setObjectWarp',id,enabled]);},
  exploreWarp(){let o=items.find(o=>o.type==='enterprise')||api.addObject('enterprise');api.setObjectWarp(o.id,true);api.focusTarget(o.id,'track');return o;},
  setBridgeTraveler(type){let o=items.find(o=>o.bridgeTraveler);if(o){Object.assign(o,{type,label:OBJECT_TYPES.find(o=>o.id===type).label,lengthMeters:OBJECT_DIMENSIONS[type].lengthMeters});}else o=api.addObject(type);calls.push(['setBridgeTraveler',type]);return o;},
  focusObject(id,mode){return api.focusTarget(id,mode);},focusTarget(id,mode){if(!api.getSceneTargets().some(o=>o.id===id))return false;api.focusId=id;api.focusMode=mode;return true;},releaseFocus(){api.focusId=null;},
  setViewMode(mode){state.viewMode=mode;},resetCamera(){api.focusId=null;},setPresentationPaused(){},getVRSupport:async()=>({supported:false,reason:'No headset in fixture'}),dispose(){},resize(){},zoom(){},look(){},
 };
 host=api;return api;
}
const sandbox={document,window,matchMedia:window.matchMedia,performance:clock.performance,requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console,createRenderHost,createLoadingIndicator:(el,reason)=>createLoadingIndicator(el,reason,clock),installViewportUI,renderMathGuide(){},renderWarpGuide(){},DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS,OBJECT_TYPES};
vm.runInNewContext(app.replace(/^import[^\n]+\n/gm,''),sandbox,{filename:'app.js'});
await Promise.resolve();await Promise.resolve();
const $=id=>{const node=document.getElementById(id);assert(node,`Missing control ${id}`);return node;};
assert.equal($('fpsCorner').textContent,'30 FPS');
assert($('scene').contains(document.querySelector('.controls')),'Properties remain available in fullscreen');
$('elementsToggle').click();assert.equal($('elementsPanel').hidden,false);
$('viewportAdd').click();assert.equal(document.querySelector('.controls').dataset.inspectorKind,'add');
$('objectType').value='shuttle';$('objectType').dispatch('change');$('addObject').click();
assert.equal(host.getObjects()[0].type,'shuttle');assert.equal($('elementsPanel').hidden,false);assert(document.querySelector('.controls').hidden,'Creating an object opens the list, not a floating editor');
let object=host.getObjects()[0];document.querySelector(`[data-element="${object.id}"]`).click();
assert.equal(document.querySelector('.controls').dataset.inspectorKind,'object');assert.equal($('orbitalPlacement').hidden,false);assert.equal($('localPlacement').hidden,true);
$('inspectorRide').click();assert.equal(host.focusId,object.id);assert.equal(host.focusMode,'onboard');
$('cameraToggle').click();$('releaseFocusToolbar').click();assert.equal(host.focusId,null);

document.querySelector('[data-scene="empty-space"]').click();await Promise.resolve();
$('elementsToggle').click();assert.equal(document.querySelector('[data-element-toggle="planet"]').disabled,true,'No orphan orbital planet control without a black hole');$('viewportAdd').click();assert.equal($('addOrbitPlacement').hidden,true);assert($('addPlacementContext').textContent.includes('meters'));
$('objectType').value='astronaut';$('addObject').click();object=host.getObjects()[0];document.querySelector(`[data-element="${object.id}"]`).click();
assert.equal($('localPlacement').hidden,false);assert.equal($('orbitalPlacement').hidden,true);
$('editX').value='125';$('editX').dispatch('change');assert.equal(host.getObjects()[0].x,125);
document.querySelector('[data-feature="warp"]').click();object=host.getObjects().find(o=>o.type==='enterprise');assert(object);assert.equal(host.focusId,object.id);assert.equal($('enterpriseProperties').hidden,false);
$('objectWarpEnabled').checked=false;$('objectWarpEnabled').dispatch('change');assert.equal(host.getObjects().find(o=>o.id===object.id).warpEnabled,false);
$('editObjectWarp').click();assert.equal(host.getObjects().find(o=>o.id===object.id).warpEnabled,true);assert.equal($('pane-warp').hidden,false);

document.querySelector('[data-scene="bridge"]').click();await Promise.resolve();$('elementsToggle').click();document.querySelector('[data-element="bridge"]').click();
const travelerId=host.getObjects()[0].id;$('bridgeTravelerType').value='astronaut';$('bridgeTravelerType').dispatch('change');assert.equal(host.getObjects()[0].id,travelerId);assert.equal(host.getObjects()[0].type,'astronaut');
$('inspectorBack').click();$('viewportAdd').click();assert.deepEqual($('objectType').querySelectorAll('option').map(o=>o.value),['shuttle','astronaut','enterprise']);assert.equal($('addObject').textContent,'Use as traveler');
assert.equal(document.getElementById('viewportSelection'),null);assert.equal(document.getElementById('objectMarkers'),null);
console.log('PASS: actual app/viewport startup and event wiring: add/select/track/ride/return, local meter edits, intrinsic Enterprise warp, Explore Warp selection, and bridge traveler replacement. DOM contract fixture; no browser layout or hardware emulation.');
