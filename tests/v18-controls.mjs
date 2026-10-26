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
  getObjectTree(){const nodes=[{id:'space',parentId:null,type:'space',label:'Space',canAdd:!state.bridge},...(state.blackHole?[{id:'primary',parentId:'space',type:'blackhole',label:'Black hole',canAdd:true}]:[]),...items.map(o=>({id:o.id,parentId:o.parentId||'space',type:o.type,label:o.label,canAdd:true}))];for(const n of nodes)n.children=nodes.filter(c=>c.parentId===n.id).map(c=>c.id);return nodes;},
  getObjects(){return items.map(o=>({...o,focused:o.id===api.focusId}));},
  getState(){return {...state,objects:api.getObjects(),objectContext:api.getObjectContext(),objectCount:items.length,maxObjects:10,selectedId:api.selectedId,focusId:api.focusId,focusMode:api.focusMode,warpObjectId:items.find(o=>o.warpEnabled)?.id,bridgeObjectId:items.find(o=>o.bridgeTraveler)?.id,bridgeRegion:'near',fps:30,scale:1,steps:100,effectiveQuality:'medium',renderReady:true,renderBusy:false,cameraDistanceMeters:1000,worldDistance:35};},
  getSceneTargets(){return [...(state.blackHole?[{id:'primary',label:'Black hole',enabled:true,canTrack:true}]:[]),...items.map(o=>({id:o.id,label:o.label,enabled:true,canTrack:true,canBoard:true}))];},
  update(patch){Object.assign(state,patch);},setQuality(value){api.quality=value;},selectObject(id){api.selectedId=id;},
  loadScene(id){api.sceneId=id;state=makePreset(id);items=[];api.focusId=null;api.selectedId=null;for(const o of SCENE_PRESETS.find(p=>p.id===id)?.objects||[])api.addObject(o.type,o.radius,o.phase,o.scale);return api.getState();},
  addObject(type,radius=12,phase=0,scale=1){const placement=api.getObjectContext().kind,o={id:'object-'+(++serial),type,label:OBJECT_TYPES.find(o=>o.id===type).label,radius,height:0,phase,scale,placement,parentId:placement==='orbit'?'primary':'space',x:0,y:0,z:0,headingDegrees:phase*180/Math.PI,warpEnabled:false,bridgeTraveler:placement==='bridge',lengthMeters:OBJECT_DIMENSIONS[type].lengthMeters};items.push(o);return o;},
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

// Application event wiring, not a simulated browser layout.
for(const id of ['capture','labelsToggle','metricsToggle','metricShortcut','mapMetrics'])assert.equal(document.getElementById(id),null);
assert.equal(document.querySelectorAll('.scene-complexity').length,0);
assert.equal($('picturePreset').querySelectorAll('option').length,3);
for(const mode of ['visible','infrared','xray','radio','gamma','geometry']){
 $('displayToggle').click();assert(!$('displayPanel').hidden);document.querySelector('[data-spectrum="'+mode+'"]').click();assert($('displayPanel').hidden);assert.equal(host.state.spectrum,mode);
}
$('cameraToggle').click();$('relativeFree').click();assert($('cameraPanel').hidden);assert.equal(host.state.viewMode,'free');
$('cameraToggle').click();$('viewportTarget').value='primary';$('viewportTrack').click();await Promise.resolve();await Promise.resolve();assert($('cameraPanel').hidden);assert.equal(host.focusId,'primary');
$('maxMass').value='100000000';$('maxMass').dispatch('change');$('mass').value='.5';$('mass').dispatch('input');assert.equal(host.state.mass,.01,'Half the exponential range is 10,000 solar masses');
$('exactMass').value='1234';$('exactMass').dispatch('change');assert.equal(host.state.mass,.001234);assert(Math.abs(Number($('mass').value)-Math.log10(1234)/8)<1e-12);
$('maxMass').value='100';$('maxMass').dispatch('change');assert.equal(host.state.mass,.0001,'Lowering max keeps the mass in the chosen range');
for(const p of SCENE_PRESETS){assert.equal(p.heading,p.title);assert.equal(p.patch.metrics,false);}
const {fixture}=await import('./render-fixture.mjs'),{BlackHoleRenderer}=await import('../dist/renderer.js'),{serializeScene,parseScene}=await import('../dist/scene-file.js');
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});r.loadScene('solar-system');
const earth=r.objects.find(o=>o.name==='Earth'),iss=r.objects.find(o=>o.type==='iss'),shuttle=r.objects.find(o=>o.type==='shuttle');
for(const craft of [iss,shuttle]){assert.equal(craft.parentId,earth.id);assert.equal(craft.referenceId,null);assert(craft.orbitMeters>6371000&&craft.orbitMeters<7000000);assert.equal(craft.orbitInclination,51.6);}
assert.equal(parseScene(serializeScene(r)).objects.length,517);r.focusTarget(shuttle.id,'track');const camera={...r.camera};assert(r.setFreeDrive(shuttle.id,true));assert.deepEqual(r.camera,camera);
r.setFlightPower(1.5);r.update({paused:false});r.lastTime=1000;r.advanceSimulation(1100);r.render();assert(r.getFlightState().speedMetersPerSecond>0);assert.equal(f.uniforms.get('uFlightMetrics').args[0],.15);assert.equal(f.uniforms.get('uFlightMetrics').args[3],1);assert.equal(parseScene(serializeScene(r)).objects.find(o=>o.id===shuttle.id).flight.thrust,1.5);
r.nudgeFlightTurn(1);assert(r.getFlightState().turnRateRadiansPerSecond>0);r.setFlightInput({curvature:-1});r.render();assert.equal(f.uniforms.get('uFlightMetrics').args[1],-1);r.brakeFlight('speed');assert.equal(r.getFlightState().thrustSetting,0);
r.loadScene('warp-cruise');r.setFreeDrive(r.warpObjectId,true);r.setFlightPower(6);assert(Math.abs(r.getFlightState().warpFactor-6)<1e-10);r.render();assert.equal(f.uniforms.get('uFlightMetrics').args[3],0,'Shuttle thrusters never attach to Enterprise');
r.loadScene('rainbow-disc');assert(Math.abs(r.camera.pitch)<.06);r.render();assert.equal(f.uniforms.get('uSceneOptions').args[2],2);
const hue=a=>Math.cos(2*Math.PI*(.35-Math.sin(a)*.12));assert(Math.abs(hue(Math.PI-1e-8)-hue(-Math.PI+1e-8))<1e-7);
r.dispose();console.log('PASS: auto-closing spectrum/camera panels, exponential mass and exact/max edits, consistent scene names, removed metrics/capture UI, Solar spacecraft hierarchy and saves, throttle/steering uniforms, drive camera preservation, edge-on periodic rainbow.');
