import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {installAnomalyControls} from '../dist/anomaly-ui.js';
import {installViewportUI} from '../dist/viewport-ui.js';
import {createLoadingIndicator} from '../dist/loading-indicator.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS} from '../dist/config.js';
import {OBJECT_TYPES,OBJECT_DIMENSIONS} from '../dist/objects.js';
import {renderRelativityGuide} from '../dist/relativity-math.js';

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
  setViewMode(mode){state.viewMode=mode;},resetCamera(){api.focusId=null;},setPresentationPaused(value){api.presentationPaused=value;},getVRSupport:async()=>({supported:false,reason:'No headset in fixture'}),dispose(){api.disposed=true;},resize(){},zoom(){},look(){},
 };
 nextStartup=null;host=api;return api;
}
const sandbox={document,window,matchMedia:window.matchMedia,performance:clock.performance,requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame(){},setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,setInterval:()=>1,clearInterval(){},console:{...console,error(){}},createRenderHost,snapshotRenderer,restoreRenderer,createLoadingIndicator:(el,reason)=>createLoadingIndicator(el,reason,clock),installViewportUI,installAnomalyControls,renderRelativityGuide,renderMathGuide(){},renderWarpGuide(){},renderWormholeGuide(){},DEFAULTS,SCENE_PRESETS,makePreset,horizonRg,iscoRg,REFERENCE_MASS,OBJECT_TYPES};
vm.runInNewContext(app.replace(/^import[^\n]+\n/gm,''),sandbox,{filename:'app.js'});
await Promise.resolve();await Promise.resolve();
const $=id=>{const node=document.getElementById(id);assert(node,`Missing control ${id}`);return node;};

// Focused app-bootstrap regression; the host double omits GPU work.
assert($('atlasDialog').open,'Scenes opens on the first page load');
assert.equal(host.sceneId,'disk','Edge of infinity remains the fallback scene');
const scenes=$('viewportScenes');assert(scenes.classList.contains('scene-discovery'));
document.querySelector('[data-scene="warp-lab"]').click();assert(!$('atlasDialog').open);
await frame();await frame();await Promise.resolve();
assert.equal(host.sceneId,'warp-lab');assert(scenes.classList.contains('scene-discovery'),'Choosing a scene in the initial gallery does not dismiss the cue');
scenes.click();assert($('atlasDialog').open);assert(!scenes.classList.contains('scene-discovery'));
$('closeAtlas').click();assert(!$('atlasDialog').open);host.emit({sceneLoadState:'ready',renderReady:true,renderBusy:false});assert(!scenes.classList.contains('scene-discovery'),'Closing without choosing keeps the cue dismissed');
for(const key of ['warpField','bridgeWarpEnvelope','bridgeGridOrientation','bridgeLifecycle','bridgeWorlds','anomalyRadius','anomalyRadiusMeters','anomalyStrength','anomalyScale','anomalyMotion'])assert.equal(document.querySelectorAll('#'+key).length,1,'Exactly one '+key);
for(const [key,value]of [['bridgeGridOrientation','parallel'],['bridgeLifecycle','open-transit-close'],['bridgeWorlds','earth-proxima'],['bridgeGridOrientation','perpendicular']]){$(key).value=value;$(key).dispatch('change');assert.equal(host.state[key],value);}
assert.equal(document.getElementById('playbackCorner'),null);for(const cpu of [false,true]){host.cpu=cpu;sandbox.updateQualityStatus(host.getState());assert($('renderStatus').getAttribute('aria-label').includes('30 FPS'));assert(!$('renderStatus').getAttribute('aria-label').includes('playback'));}host.cpu=false;
const anomaly=host.addObject('anomaly');Object.assign(anomaly,{placement:'local',parentId:'space',radiusMeters:6000,anomalyStrength:1.8,anomalyScale:1,anomalyMotion:1});sandbox.selectObject(anomaly.id);assert(!$('anomalyStrength').closest('section').hidden);
$('anomalyStrength').value='2.5';$('anomalyStrength').dispatch('input');assert.equal(host.objects.find(o=>o.id===anomaly.id).anomalyStrength,2.5);
$('anomalyRadius').value='4';$('anomalyRadius').dispatch('input');assert.equal(host.objects.find(o=>o.id===anomaly.id).radiusMeters,10000);
// Home restarts the gallery/discovery flow without waiting for a new renderer.
const brand=document.querySelector('.brand');brand.click();
assert($('atlasDialog').open);assert(scenes.classList.contains('scene-discovery'));
await frame();await frame();await Promise.resolve();
assert.equal(host.sceneId,'disk');assert($('atlasDialog').open);
$('closeAtlas').click();assert(scenes.classList.contains('scene-discovery'));
scenes.click();assert(!scenes.classList.contains('scene-discovery'));$('closeAtlas').click();
for(const cpu of [false,true]){host.cpu=cpu;sandbox.updateQualityStatus({...host.getState(),cpu});assert.equal($('backendStatus').textContent,cpu?'GPU OFF':'GPU ON');assert.equal($('quality').disabled,false);}
// Generic compact children use the existing mass editor and physical orbit fields.
const holeA={id:'nested-a',type:'blackhole',name:'Nested black hole',label:'Nested black hole',parentId:'primary',placement:'orbit',massSolar:10,orbitMeters:3e11,radius:12,phase:0,height:0,scale:1,lengthMeters:59065,renderRadiusMeters:29532.5};
const holeB={...holeA,id:'nested-b',type:'whitehole',name:'Nested white hole',label:'Nested white hole',parentId:holeA.id,massSolar:2,orbitMeters:1e8};host.objects.push(holeA,holeB);
for(const [object,mass,orbit] of [[holeA,12,4e11],[holeB,3,2e8]]){
 sandbox.selectObject(object.id);assert(!$('bodyAppearance').hidden);assert(!$('editMassSolar').hidden);assert($('editRadiusMeters').hidden);assert($('editRotation').hidden);assert($('editBodyStyle').hidden);assert($('editBodyColor').closest('label').hidden);assert(!$('physicalOrbitProperties').hidden,'Physical orbit properties remain visible even under primary');assert($('editRadius').hidden&&$('editPhase').hidden,'No duplicate legacy radius/phase fields');if(object.parentId==='primary'){assert(!$('orbitalPlacement').hidden);assert(!$('editHeight').hidden,'Height and motion remain available for primary children');}assert($('objectDimensions').textContent.includes('Event-horizon radius:'));
 $('editMassSolar').value=String(mass);$('editMassSolar').dispatch('change');assert.equal(host.objects.find(o=>o.id===object.id).massSolar,mass);$('editOrbitMeters').value=String(orbit);$('editOrbitMeters').dispatch('change');assert.equal(host.objects.find(o=>o.id===object.id).orbitMeters,orbit);
}
assert.equal(holeA.massSolar,12);assert.equal(holeB.massSolar,3);assert.equal(holeA.orbitMeters,4e11);assert.equal(holeB.orbitMeters,2e8);
const restored=host.addObject('planet');sandbox.selectObject(restored.id);assert(!$('editBodyColor').closest('label').hidden);assert(!$('editRadiusMeters').hidden);assert(!$('editScale').hidden,'Ordinary body controls return after compact selection');
// The fundamentals notebook is lazy and its roadmap/metric links are operable.
assert.equal($('relativityContent').innerHTML,'');
const relativityButton=document.querySelector('[data-open-relativity]');assert(relativityButton);relativityButton.click();
assert($('relativityDialog').open);assert($('relativityContent').innerHTML.includes('Lorentz'));
const roadmap=$('relativityContent').querySelector('[data-relativity-section]');assert(roadmap);roadmap.click();assert($(roadmap.dataset.relativitySection).open);await frame();
for(const [target,dialog]of [['blackholes','mathDialog'],['warp','warpDialog'],['wormholes','bridgeDialog']]){relativityButton.click();const jump=$('relativityContent').querySelector('[data-relativity-target="'+target+'"]');assert(jump);jump.click();assert(!$('relativityDialog').open);assert($(dialog).open);$(dialog).close();}
// Each notebook returns to the subject picker, including direct/contextual entry.
for(const [subject,dialog]of [['relativity','relativityDialog'],['math','mathDialog'],['warp','warpDialog'],['bridge','bridgeDialog']]){
 const hub=$('mathHubDialog'),card=hub.querySelector('[data-open-'+subject+']');hub.close();card.click();assert($(dialog).open);
 const back=$(dialog).querySelector('[data-math-back]');assert(back);assert.equal(back.getAttribute('aria-label'),'Back to Math subjects');back.click();
 assert(!$(dialog).open);assert(hub.open);assert.equal(document.activeElement,card);assert(host.presentationPaused,'Math hub keeps scene paused');
 $('closeMathHub').click();assert(!hub.open);assert.equal(document.activeElement,$('mathNav'));
}
console.log('PASS: actual app bootstrap opens Scenes over default; first alternate selection keeps pulse; actual button click permanently clears it for this visit; bridge/warp IDs unique; bridge property events, restored GPU/CPU FPS status anomaly inspector edits, and independent nested compact mass/orbit fields work. DOM fixture, not browser layout.');
