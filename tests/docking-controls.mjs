import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCENE_PRESETS,SCENE_PROGRESSIONS} from '../dist/config.js';
import {installDockingPanel} from '../dist/docking-ui.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {advanceDock} from '../dist/station-docking.js';
import {installPilotControls} from '../dist/pilot-ui.js';
import {uiDomFixture} from './ui-dom-fixture.mjs';
const preset=SCENE_PRESETS.find(p=>p.id==='earth-mars-station-ferry');
assert.equal(preset.category,'Spacecraft');assert(SCENE_PROGRESSIONS.Spacecraft.includes(preset.id));
assert.equal(SCENE_PRESETS.filter(p=>p.number===preset.number).length,1);
const [earth,neptune]=['earth','neptune'].map(key=>preset.objects.find(o=>o.key===key));
const ports=preset.objects.filter(o=>o.type==='habitat');
for(const [i,planet] of [earth,neptune].entries()){assert.equal(ports[i].parentKey,planet.key);assert.equal(ports[i].orbitMeters-planet.radiusMeters,i?3_000_000:400_000);}
assert.equal(preset.objects[preset.camera.focusIndex].type,'shuttle');
const d=uiDomFixture(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));globalThis.document=d;d.body=d.querySelector('body');
const craft={type:'shuttle',id:'s1'},stations=ports.map((o,i)=>({...o,id:'port'+i}));let calls=[],state=null;
const r={objects:[craft,...stations],startDocking:(...args)=>{calls.push(args);return true;},undock:(...args)=>{calls.push(args);return true;},cancelDocking:()=>true};
const mount=d.createElement('div');d.body.append(mount);const ui=installDockingPanel(mount,{renderer:()=>r});
const $=id=>d.getElementById(id);
ui.update(r,craft,null);$('dockOpen').click();assert($('dockingDialog').open);assert.equal($('dockTarget').querySelectorAll('option').length,2);
$('dockTarget').value='port1';$('dockPort').value='south';$('dockCommit').click();assert.deepEqual(calls.pop(),['s1','port1','south']);assert(!$('dockingDialog').open);
state={phase:'approach',stationName:'Neptune Station',stationId:'port1',port:'south',label:'Final approach',relativeSpeed:.06,gapMeters:8};
ui.update(r,craft,state);assert.equal($('dockStage').textContent,'Final approach · Lower port');assert.equal($('dockGap').textContent,'8 m');assert($('dockSpeed').textContent.includes('/s'));
$('dockOpen').click();assert($('dockTarget').disabled);assert($('dockCommit').hidden);assert(!$('dockTakeControl').hidden);$('dockClose').click();
ui.update(r,craft,{...state,phase:'docked',canUndock:true,loop:true});$('dockOpen').click();assert.equal($('dockCommit').textContent,'Undock');assert.match($('dockInstructions').textContent,/automatically/);
$('dockCommit').click();assert.deepEqual(calls.pop(),['s1']);
r.startDocking=()=>false;r.lastDockingError='No direct approach available';ui.update(r,craft,null);$('dockOpen').click();$('dockCommit').click();assert(!$('dockError').hidden);assert.equal($('dockError').textContent,r.lastDockingError);
ui.update(r,{type:'enterprise',id:'w'},null);assert(!$('dockingDialog').open);assert(mount.querySelector('.docking-instruments').hidden);
ui.update(r,stations[1],null);$('dockOpen').click();assert.equal($('dockTarget').value,'port1','A tracked habitat preselects its own port');
ui.dispose();console.log('PASS: physical Earth and Neptune station orbits, unique gallery entry, both port controls, docking feedback and guidance handoffs.');


// Exercise the same HUD and action handler with the live flight controller,
// keeping the compact layout mounted throughout both axial approaches.
const fx=fixture({width:375,height:667});globalThis.document=d;globalThis.window=d.createElement('window');
Object.assign(window,{innerWidth:375,innerHeight:667,devicePixelRatio:1,matchMedia:()=>({matches:false})});
Object.defineProperty(Object.getPrototypeOf(d),'parentElement',{configurable:true,get(){return this.parentNode;}});
const create=d.createElement;d.createElement=tag=>{const e=create(tag);if(tag==='progress')Object.defineProperty(e,'max',{writable:true,value:1});return e;};
const engine=new BlackHoleRenderer(fx.canvas,{autoStart:false,bindControls:false,deferProgram:true});
const flightUi=installPilotControls({mount:$('pilotControls'),renderer:()=>engine,state:()=>engine.state,refresh(){},setPaused(v){engine.state.paused=v;}});
try{
 engine.loadScene(preset.id);engine.sceneLoad=null;engine.state.paused=false;flightUi.update();
 const vessel=engine.objects.find(o=>o.type==='shuttle'),phases=new Set();
 const q=()=>engine.getFlightSequence(vessel.id),berths=engine.objects.filter(o=>o.type==='habitat');
 assert.deepEqual(q().nodes.map(n=>[n.targetId,n.kind,n.port]),berths.map(o=>[o.id,'dock','south']));assert(q().loop);
 assert.deepEqual(engine.getTravelTargets({craftId:vessel.id}).filter(t=>t.dockable).map(t=>t.id).sort(),berths.map(b=>b.id).sort());
 assert(!$('pilotControls').hidden);assert($('pilotModeDrive').disabled);$('pilotPlaylist').click();
 assert($('vehiclePlaylistDialog').open);assert.equal($('flightPlanLoop').getAttribute('aria-pressed'),'true');
 assert.equal($('flightPlanDestination').querySelectorAll('option').filter(opt=>opt.textContent.includes(' · dock')).length,2);
 const stops=$('flightPlanStops');
 assert.match(stops.textContent,/Earth Station/);assert.match(stops.textContent,/Neptune Station/);
 assert.equal(stops.querySelectorAll('[data-plan-port]').length,2);assert(!stops.querySelector('[data-plan-laps]'));
 assert.match(stops.querySelector('#flight-route-l0').textContent,/current separation/);
 assert.equal(stops.querySelectorAll('.flight-route-link').length,2,'Loop shows both outbound and return transfers.');
 const oldMission=engine.dockingMission;const editable=()=>stops.querySelector('[data-plan-port="1"]');
 for(const port of ['north','south']){editable().value=port;editable().dispatch('change');assert.equal(q().nodes[1].port,port);assert.equal(engine.dockingMission,oldMission,'Editing a later berth preserves ongoing flight');}
 const picker=$('flightPlanDestination');picker.value=berths[0].id;picker.dispatch('change');assert.equal(q().nodes.length,3);assert.equal(q().nodes[2].kind,'dock');
 stops.querySelector('[data-plan-remove="2"]').click();assert.equal(q().nodes.length,2);
 for(const expected of [false,true]){$('flightPlanLoop').click();assert.equal(q().loop,expected);}
 $('vehiclePlaylistDialog').close();
 assert.equal(engine.focusId,vessel.id);assert.match($('dockStage').textContent,/Lower port/);
 for(let i=0;i<480;i++){
  advanceDock(engine,.5);flightUi.update();const status=engine.getDockingState(vessel.id);assert(status);
  phases.add(status.phase+':'+status.stationName);
  if(status.phase==='transit'){assert.equal($('dockRangeLabel').textContent,'Station range');assert.notEqual($('dockGap').textContent,'—');}
  if(status.phase==='docked'&&status.stationName==='Neptune Station'){
   assert.equal($('dockStation').textContent,'Neptune Station');$('dockOpen').click();assert.equal($('dockPort').value,'south');
   $('dockCommit').click();assert.equal(engine.getDockingState(vessel.id).loop,false);break;
  }
 }
 for(const p of ['orbit:Earth Station','acquire:Earth Station','docked:Earth Station','undock:Earth Station','depart:Earth Station','transit:Neptune Station','orbit:Neptune Station','acquire:Neptune Station','approach:Neptune Station','docked:Neptune Station'])assert(phases.has(p),p);
}finally{flightUi.dispose();engine.dispose();}
console.log('PASS: live compact HUD on departure, Earth capture, cruise, Neptune capture and user-directed release.');
