import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installPilotControls} from '../dist/pilot-ui.js';
import {uiDomFixture} from './ui-dom-fixture.mjs';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {captureAnnotationFrame,installAnnotations} from '../dist/annotations.js';
import {lineupPicking} from '../dist/scene-picking.js';
import {createFragment} from '../dist/shaders.js';

for(const [pointerType,width,height] of [['mouse',1280,780],['touch',390,700]]){
 const f=fixture({width,height}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
 const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));globalThis.document=d;globalThis.window=d.createElement('window');d.body=d.querySelector('body');
 if(!Object.getOwnPropertyDescriptor(Object.getPrototypeOf(d),'parentElement'))Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{get(){return this.parentNode;}});
 const create=d.createElement;d.createElement=tag=>{const el=create(tag);if(tag==='progress')Object.defineProperty(el,'max',{writable:true,value:1});return el;};
 const panel=d.getElementById('pilotControls'),pilot=installPilotControls({mount:panel,renderer:()=>r,state:()=>r.state,setPaused:v=>r.update({paused:v}),refresh(){}});
 r.loadScene('shuttle-space');pilot.update();assert(panel.hidden,'Overview does not assign a helm');let layer,payload,at=0,serial=0;const events=[],listeners=new Map(),timers=new Map();
 document.createElementNS=()=>layer={style:{},setAttribute(){},remove(){},innerHTML:''};
 const rect={top:0,left:0,width,height},surface={tagName:'canvas',closest:()=>null,getBoundingClientRect:()=>rect};
 const scene={append(){},querySelector:q=>q==='#universe'?surface:null,getBoundingClientRect:()=>rect,
  addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 const ui=installAnnotations(scene,()=>r,{
  ...lineupPicking(()=>r,id=>{events.push('inspect:'+id);r.selectObject(id);pilot.update();},id=>{events.push('drive:'+id);assert(pilot.start(id,'manual'));}),
  getInteractionRevision:()=>[r.sceneRevision,r.selectedId,r.driveId,r.getNavigationState()?.mode].join('|'),
  onLabelTap:id=>events.push('preview:'+id),onLabelDoubleTap:id=>events.push('go:'+id),
  onTrack:id=>events.push('track:'+id),setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:id=>timers.delete(id)});
 const refresh=()=>{r.fillHoles();r.fillObjects();r.updateCameraFrame();payload=captureAnnotationFrame(r);ui.update(payload);};
 const flush=()=>{at+=400;const queue=[...timers.values()];timers.clear();for(const fn of queue)fn();};
 const fire=(kind,p,extra={})=>listeners.get(kind)({pointerType,pointerId:1,button:0,timeStamp:at+=20,target:surface,clientX:p[0],clientY:p[1],...extra});
 const tap=p=>{fire('pointerdown',p);fire('pointerup',p);};
 const bodyPos=id=>{const b=payload.objectFrames.find(b=>b.id===id);return [width*.5+b.anchor.x*height,height*.5-b.anchor.y*height];};
 const labelPos=id=>{const tag=layer.innerHTML.split('data-object-id="'+id+'"')[1]?.match(/<rect x="([\d.-]+)" y="([\d.-]+)"/);assert(tag,'missing label '+id+' at '+width);return [+tag[1]+10,+tag[2]+10];};
 const unset=()=>{assert.equal(r.focusId,null);assert(!r.driveId||r.getNavigationState(r.driveId).mode!=='manual');};
 refresh();assert.equal(payload.lineupIds.length,5);unset();
 const overviewProgram=r.programKey(r.shaderFeatures());
 r.update({annotations:false});refresh();for(const id of payload.lineupIds)assert.equal(ui.pick(...bodyPos(id))?.id,id,'model is pickable even with labels off');r.update({annotations:true});
 for(const [n,obj] of r.objects.entries()){
  refresh();const id=obj.id,body=bodyPos(id),label=labelPos(id);
  assert.equal(ui.pick(...label)?.id,id);assert.equal(ui.pick(...body)?.id,id);
  const before=events.length;tap(n%2?label:body);assert.equal(events.length,before);flush();
  assert.deepEqual(events.slice(before),['inspect:'+id]);assert.equal(r.selectedId,id);unset();
  // Selection alone must not activate destination filtering or change zoom.
  refresh();for(const fleetId of payload.lineupIds)labelPos(fleetId);
  const p=n%2?bodyPos(id):labelPos(id);tap(p);tap(p);fire('dblclick',p);flush();
  assert.deepEqual(events.slice(before),['inspect:'+id,'drive:'+id]);
  assert.equal(r.driveId,id);assert.equal(r.getNavigationState(id).mode,'manual');assert.equal(r.focusId,id);
  assert.equal(r.programKey(r.shaderFeatures()),overviewProgram,'A stationary helm reuses the fleet program');
  const selector=d.getElementById('janusPropulsion');
  if(obj.hullModel==='janusPod'){
   assert.equal(selector.hidden,false);assert.equal(selector.value,'impulse');
   const power=d.getElementById('pilotPower');assert.equal(power.getAttribute('max'),'0.3');assert.equal(power.getAttribute('step'),'0.01');
   selector.value='warp';selector.dispatch('change');assert.equal(r.getFlightState().flightMode,'warp');power.value='2';power.dispatch('input');assert.equal(r.getFlightState().warpFactor,2);
   selector.value='impulse';selector.dispatch('change');power.value='1.8';power.dispatch('input');assert.equal(r.getFlightState().thrustSettingG,.3);power.value='0.07';power.dispatch('input');assert.equal(r.getFlightState().thrustSettingG,.07);
  }else assert.equal(selector.hidden,true);
  r.focusTarget(id,'onboard');assert.equal(r.focusMode,'onboard');
  assert(pilot.start(id,'manual'));assert.equal(r.focusMode,'chase','Explicitly retaking the same helm restores its chase view');
  r.update({paused:true});assert(pilot.start(id,'manual'));assert.equal(r.state.paused,false);
  pilot.releaseInput();r.showVehicleLineup();pilot.update();unset();assert.equal(r.selectedId,null);assert(panel.hidden,'Returning from manual control restores an unobstructed fleet overview');
 }
 // Explicitly choosing another hull also hands over the sole live control
 // stream when the previous ship is already in Drive.
 const [oldHelm,newHelm]=r.objects;
 assert(pilot.start(oldHelm.id,'manual'));assert(pilot.start(newHelm.id,'manual'));
 assert.equal(r.driveId,newHelm.id);assert.equal(r.focusId,newHelm.id);assert.equal(r.getNavigationState(oldHelm.id).mode,'auto');
 pilot.releaseInput();r.showVehicleLineup();pilot.update();
 const explorer=r.objects.find(o=>o.type==='enterprise'&&!o.hullModel);
 assert(pilot.start(explorer.id,'manual'));r.setFlightPower(2);r.render();
 const powered=r.shaderFeatures(),flightProgram=createFragment(powered);
 assert(powered.warp&&powered.fleetWarpHull&&powered.fleetView);
 assert(flightProgram.includes('warpLocalTrace(cameraRay,exitRay')&&flightProgram.includes('weakFieldHit(end,p,original'));
 assert(!flightProgram.includes('i<288'),'Curved rays need only the local warp integrator in this empty fleet');
 r.setFlightPower(0);r.render();assert.equal(r.annotationOptics.warp.enabled,false);
 assert.equal(r.programKey(r.shaderFeatures()),overviewProgram);
 pilot.releaseInput();r.showVehicleLineup();pilot.update();r.render();
 // Browsers deliver dblclick for rapid clicks anywhere on one canvas. Two
 // distinct ships are not a double-tap, even though the DOM target matches.
 refresh();const [a,b]=r.objects,pa=bodyPos(a.id),pb=bodyPos(b.id),last=events.length;
 tap(pa);tap(pb);fire('dblclick',pb);flush();assert.deepEqual(events.slice(last),['inspect:'+b.id]);unset();
 const moved=events.length;fire('pointerdown',pb);fire('pointermove',[pb[0]+30,pb[1]]);fire('pointerup',pb);fire('dblclick',pb);flush();assert.equal(events.length,moved);
 tap(pb);r.loadScene('solar-system');flush();assert.equal(events.length,moved,'scene switch cancels the deferred inspector');
 const regular=lineupPicking(()=>r,()=>assert.fail(),()=>assert.fail());assert.equal(regular.onObjectTap(r.objects.find(o=>o.type==='shuttle').id),false);assert.equal(regular.onObjectDoubleTap(r.objects.find(o=>o.type==='shuttle').id),false);
 ui.dispose();pilot.dispose();r.dispose();
}
console.log('PASS: Desktop/mobile real model and label hits, all five helms, lineup return, drag/cross-ship rejection, native click deduplication, scene revision guards and regular-scene fallback.');
