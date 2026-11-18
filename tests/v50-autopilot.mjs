import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {fixture} from './render-fixture.mjs';
import {manualDriveEligibility} from '../dist/autopilot.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
const presets=new Map(SCENE_PRESETS.map(s=>[s.id,s]));
assert.equal(presets.get('solar-system').objects.length,515);
assert.equal(presets.get('solar-system-natural').objects.length,513);
for(const id of ['solar-system','solar-system-natural']){
 assert(!presets.get(id).objects.some(o=>o.type==='enterprise'));
 assert(!presets.get(id).objects.some(o=>o.type==='belt'));
}
assert(presets.get('solar-system').objects.some(o=>o.type==='planetoid'&&o.name==='Pluto'));
assert(presets.get('solar-system').objects.some(o=>o.type==='asteroid'&&o.name==='Vesta'));
for(const id of ['shuttle-earth-mars-loop','shuttle-earth-moon-loop','test-shuttle-bridge']){
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene(id);
 const a=r.autopilot,craft=r.objects.find(o=>o.type==='shuttle');assert(a?.enabled&&craft);
 assert(presets.get(id).objects.length<=4,'Loop scene is a small relevant system');
 assert.equal(manualDriveEligibility(r,craft.id).allowed,false);
 r.state.paused=false;r.sceneLoad=null;r.lastTime=1000;let turnSeen=false,burnSeen=false,firstTarget,firstLag=0;
 for(let i=0;i<1280;i++){
  r.advanceSimulation(1100+i*100);r.fillHoles();r.fillObjects();r.updateCameraFrame();
  if(r.transfer?.active)firstTarget??=r.transfer.targetName;
  if(r.transfer?.active){turnSeen ||=r.transfer.commandedThrustG===0;burnSeen ||=r.transfer.commandedThrustG===1;assert(r.transfer.pathPoints.every(p=>p.every(Number.isFinite)));}
  if(craft.completedTransfer&&a.legsCompleted===0)firstLag=craft.clock?.lagSeconds||0;
  assert(r.validateFrameGeometry(),'Every submitted transfer pose is finite');
  const frame=r.getFocusFrame(craft.id);assert(frame&&frame.position.every(Number.isFinite));
  if(r.transfer?.bridgeRoute)frame.position.forEach((v,j)=>assert(Math.abs(v-craft.flight.position[j]/REFERENCE_RG_METERS)<1e-10,'Rendering retains the scripted bridge position'));
 }
 assert(turnSeen&&burnSeen,'One-g burns and the engine-off flip both occur');
 assert(craft.completedTransfer,'First flight arrives');assert(a.legsCompleted>=2,'Both outbound and return flights arrive');
 assert(r.transfer?.active,'Third flight starts after parking');assert.equal(r.transfer.targetName,firstTarget);
 assert(Number.isFinite(craft.clock.lagSeconds)&&craft.clock.lagSeconds>=firstLag);
 assert.equal(r.state.warp,false,'Shuttle loop never creates a warp bubble');
 if(id==='test-shuttle-bridge'){
  assert(r.transfer.bridgeRoute);assert(r.transfer.coordinateSeconds<1e7,'Clock estimates use local shortcut, not4.2ly');
  assert.match(r.transfer.mode,/shortcut/);assert.equal(craft.parentId,'space','Bridge keeps separate optical chart semantics');
 }
 r.dispose();
}
console.log('PASS: small two-way orbital and wormhole autopilots, one-g/flip telemetry, finite clocks, parking/reversal, manual-drive gate, and Solar System categories.');
