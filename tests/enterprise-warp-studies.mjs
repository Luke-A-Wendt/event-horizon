import assert from 'node:assert/strict';
import {SCENE_PRESETS,SCENE_PROGRESSIONS} from '../dist/config.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {OBJECT_KIND,hullType} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';

function fly(Renderer,id,model){
 const f=fixture(),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false,deferProgram:true});
 try{
  r.loadScene(id);r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  const ship=r.objects.find(o=>o.type==='enterprise');
  assert.equal(hullType(ship),model);assert.equal(r.focusId,ship.id);assert.equal(r.warpObjectId,ship.id);
  assert.equal(r.state.disk,true);assert.equal(r.colorData[r.getFocusFrame().index*4+3],OBJECT_KIND[model]);
  if(model==='classicEnterprise'){
   assert.equal(ship.name,'USS Enterprise');assert(r.shaderFeatures().craftMask&64);
   assert.equal(r.state.diskPalette,'artistic');
   const saved=parseScene(serializeScene(r));
   assert.equal(hullType(saved.objects.find(o=>o.id===ship.id)),model);
  }
  const tape=[];
  for(let tick=0;tick<=490;tick++){
   if(tick)r.advanceSimulation(1000+100*tick);
   if(tick%10)continue;
   r.fillObjects();r.updateCameraFrame();
   const q=r.getFlightSequence(ship.id);assert(!q.error,q.error);
   tape.push({position:[...r.getFocusFrame().position],forward:[...r.cameraFrame.forward],cameraDistance:r.camera.focusDistance,
    nodes:q.nodes.map(n=>[n.kind,n.warpFactor]),leg:q.index,warpFactor:r.state.warpFactor,scenario:r.state.warpScenario});
  }
  assert.notDeepEqual(tape[3].position,tape[0].position,'the ship leaves its starting position');
  assert(r.getManualDriveEligibility(ship.id).allowed);
  return tape;
 }finally{r.dispose();}
}
for(const original of ['warp-excursion','warp-orbit']){
 const variant='enterprise-'+original;
 assert(SCENE_PROGRESSIONS['Warp drive'].includes(variant));
 assert(SCENE_PRESETS.find(scene=>scene.id===variant).explore.length);
 for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
  const run=fly(Renderer,variant,'classicEnterprise'),baseline=fly(Renderer,original,'enterprise');
  for(const [i,{position,forward,...rest}] of run.entries()){
   const {position:reference,forward:axis,...expected}=baseline[i];
   assert(Math.hypot(...position.map((p,k)=>p-reference[k]))<1e-11,'matched trajectory');
   assert(Math.hypot(...forward.map((p,k)=>p-axis[k]))<1e-11,'matched camera direction');
   assert.deepEqual(rest,expected,variant+' retains the original waypoints, warp field and camera distance');
  }
 }
}
console.log('PASS: both Enterprise warp remixes preserve GPU/CPU trajectories, camera, playlists, helm access and the saved saucer model.');
