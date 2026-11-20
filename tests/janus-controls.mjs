import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {RenderHost} from '../dist/render-host.js';
import {installRenderWorker} from '../dist/render-worker.js';
import {installViewportUI} from '../dist/viewport-ui.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {advanceJanusExchanges} from '../dist/janus-exchange.js';
import {fixture} from './render-fixture.mjs';
import {uiDomFixture} from './ui-dom-fixture.mjs';
const fx=fixture({width:375,height:667}),d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
globalThis.document=d;d.body=d.querySelector('body');globalThis.window=d.createElement('window');
Object.assign(window,{innerWidth:375,innerHeight:667,devicePixelRatio:1,matchMedia:()=>({matches:false})});
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{configurable:true,get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const e=create(tag);if(tag==='progress')Object.defineProperty(e,'max',{writable:true,value:1});return e;};
const r=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false,deferProgram:true}),$=id=>d.getElementById(id);
const controls=installPilotControls({mount:$('pilotControls'),renderer:()=>r,state:()=>r.state,refresh(){},setPaused(v){r.state.paused=v;}});
const open=()=>$('janusOpen').click(),target=()=>$('janusTarget'),choose=id=>{target().value=id;target().dispatch('change');},toggle=(id,v)=>{$(id).checked=v;$(id).dispatch('change');};
const advance=seconds=>{advanceJanusExchanges(r,seconds);controls.update();};
try{
 r.loadScene('earth-andromeda-bridge');r.sceneLoad=null;controls.update();
 const craft=r.objects.find(o=>o.hullModel==='janusPod'),state=()=>r.getJanusBridge(craft.id);
 const earth=r.objects.find(o=>o.catalogId==='earth'),m31=r.objects.find(o=>o.catalogId==='aster-vale');
 assert.equal(state().currentId,earth.id);assert.equal($('janusPhase').textContent,'Earth orbit');assert(!$('pilotAutoControls').hidden&&$('pilotFlightReadout').hidden);
 const optics=d.createElement('details');optics.className='geometry-panel';d.querySelector('.view-toolbar').append(optics);
 const viewport=installViewportUI({renderer:()=>r,objects:()=>r.getObjects(),state:()=>r.state,selectObject:id=>r.selectObject(id),selectComponent(){},setFeature(){},refresh(){},syncViewMode(){},toast(){},openDialog:id=>$(id).showModal(),onDialogClose(){},activePreset:()=>r.sceneId,showPlaylist:(id,dest)=>controls.openPlaylist(id,dest)});
 await new Promise(resolve=>setImmediate(resolve)); // Complete the viewport’s capability probe on this DOM.
 viewport.openMap();$('mapDestination').value=m31.id;$('mapDestination').dispatch('change');
 assert.equal($('mapTravelMode').textContent,'CENTERED BRIDGE');assert($('mapTravelWarpRow').hidden);
 $('mapTravelQueue').click();assert.deepEqual(state().stops,[earth.id,m31.id,m31.id]);
 $('mapFlightPlan').click();assert(!$('orbitMapDialog').open&&$('vehiclePlaylistDialog').open);
 $('flightPlanStops').querySelector('[data-plan-remove="2"]').click();assert.deepEqual(state().stops,[earth.id,m31.id]);$('vehiclePlaylistDialog').close();
 assert.match($('janusDetail').textContent,/Aster Vale.*Loop/);open();assert($('janusDialog').open);
 assert.equal(target().value,m31.id);assert($('janusAuto').checked&&$('janusLoop').checked);toggle('janusLoop',false);assert(!state().loop);
 toggle('janusAuto',false);assert(!state().auto);$('janusEngage').click();assert.equal(state().stage,'charge');assert(!$('janusDialog').open);assert(!r.state.paused);
 assert.equal($('janusPhase').textContent,'Charging bridge');assert(!$('janusProgress').hidden);open();assert($('janusEngage').disabled);$('janusClose').click();
 advance(3.3);assert.equal(state().stage,'settle');assert.equal(state().currentId,m31.id);assert.match($('janusDetail').textContent,/Arrived.*Aster Vale/);
 advance(2.2);assert.equal(state().stage,'orbit');assert.equal($('janusPhase').textContent,'Aster Vale orbit');
 r.state.annotations=true;assert(controls.previewTravel(earth.id));assert.equal(target().value,earth.id);$('janusClose').click();
 assert(controls.goToLabel(earth.id));advance(6);assert.equal(state().currentId,earth.id);assert.equal(state().exchanges,2);
 const moon=r.objects.find(o=>o.type==='moon'&&o.parentId===earth.id);
 r.setFlightSequence(craft.id,[],{});controls.update();open();choose(moon.id);$('janusUseTarget').click();assert.deepEqual(state().stops,[earth.id,moon.id]);toggle('janusLoop',true);toggle('janusAuto',true);
 advance(26);assert.equal(state().exchanges,4);assert.equal(state().currentId,earth.id);assert.match($('janusDetail').textContent,/Moon/);
 r.loadScene('shuttle-space');r.sceneLoad=null;controls.update();assert(d.querySelector('.janus-instruments').hidden);
 const fleetPod=r.objects.find(o=>o.hullModel==='janusPod');r.selectObject(fleetPod.id);r.focusTarget(fleetPod.id,'track');
 assert(controls.start(fleetPod.id,'manual'));controls.update();open();assert($('janusDialog').open);
 const free=()=>r.getJanusBridge(fleetPod.id);assert(!free().targets.length);assert.match($('janusRouteNote').textContent,/waypoint/);
 choose('@janus-local-position');$('janusX').value='';$('janusEngage').click();assert(!$('janusError').hidden);assert.equal(free().stage,'orbit');
 const xyz=[25,-3,17];['X','Y','Z'].forEach((key,i)=>{$('janus'+key).value=String(xyz[i]);});$('janusEngage').click();advance(6);
 assert.deepEqual([fleetPod.x,fleetPod.y,fleetPod.z],xyz.map(x=>x*1000));assert.equal(free().exchanges,1);
 open();choose('@janus-galactic-address');assert.match($('janusUnits').textContent,/light-years/);
 const ly=[2e8,4e8,-3e9];['X','Y','Z'].forEach((key,i)=>{$('janus'+key).value=String(ly[i]);});$('janusEngage').click();advance(6);
 assert.deepEqual(free().addressLy,ly);assert.equal(free().exchanges,2);
 const wp=r.addChildObject('space','waypoint');r.selectObject(fleetPod.id);r.focusTarget(fleetPod.id,'track');controls.update();
 open();choose(wp.id);$('janusEngage').click();advance(6);assert.equal(free().currentId,wp.id);assert.equal(fleetPod.waypointHoldId,wp.id);assert.equal(free().exchanges,3);
 const other=r.objects.find(o=>o.type==='shuttle');r.focusTarget(other.id,'track');controls.update();assert(d.querySelector('.janus-instruments').hidden);assert(!$('janusDialog').open);
}finally{controls.dispose();r.dispose();}
console.log('PASS: compact Janus controls, manual charge and arrival, auto round trip, label exchange, open-space waypoints, local and universal coordinates.');

// Paused workers receive route-control mutations even before time advances.
const prev=globalThis.Worker,workers=[];
globalThis.Worker=class{constructor(){this.messages=[];this.listeners=new Map();workers.push(this);}addEventListener(n,fn){this.listeners.set(n,fn);}postMessage(m){this.messages.push(m);}emit(m){this.listeners.get('message')?.({data:m});}terminate(){}};
const f=fixture();f.canvas.transferControlToOffscreen=()=>({});
const host=new RenderHost(f.canvas,{}, {presentationPaused:true}),worker=workers.at(-1),threads=[];
try{
 worker.emit({type:'ready',available:true});await host.startup;host.loadScene('earth-andromeda-bridge');
 const id=host.objects.find(o=>o.hullModel==='janusPod').id,{targets,currentId}=host.getJanusBridge(id),dst=targets.find(t=>t.label==='Aster Vale').id;
 for(const [method,...args] of [['setJanusLoop',false],['setJanusAuto',false],['setJanusItinerary',[currentId,dst],true],['startJanusExchange',dst]]){
  const rev=host.controlRevision;assert(host[method](id,...args));assert(host.controlRevision>rev,method+' invalidates paused scene');
 }
 host.mailbox.acknowledge(host.mailbox.serial);host.queueSnapshot();const message=worker.messages.filter(m=>m.type==='state').at(-1);
 for(const cpu of [false,true]){
  const wf=fixture(),thread=installRenderWorker({postMessage(){},addEventListener(){},close(){}});threads.push(thread);
  await thread.handle({type:'init',cpu,commandMode:cpu,canvas:wf.canvas,viewport:{width:640,height:400,dpr:1},snapshot:message.snapshot,presentationPaused:true});
  const state=thread.renderer.getJanusBridge(id);assert.equal(state.stage,'charge');assert.equal(state.destinationId,dst);assert.equal(state.loop,true);assert.equal(state.auto,false);
 }
}finally{for(const t of threads)await t.handle({type:'dispose'});host.dispose();if(prev)globalThis.Worker=prev;else delete globalThis.Worker;}
console.log('PASS: Janus controls invalidate paused snapshots and reach GPU and CPU worker renderers.');
