import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {SWARM_LANES,ASTER_LANE,ASTER_BERTH,swarmLayers} from '../dist/dyson-swarm.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:640,height:422}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('dyson-swarm');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const star=r.objects.find(o=>o.type==='star'),swarm=r.objects.find(o=>o.catalogId==='dyson-collectors');
 assert.equal(swarm.parentId,star.id);assert.equal(r.focusId,star.id);
 const getFrame=()=>r.getFocusFrame(swarm.id),arrays=()=>swarmLayers(getFrame(),r.cameraFrame.observer);
 const before=arrays(),prefixes=SWARM_LANES.map((_,index)=>SWARM_LANES.slice(0,index).reduce((sum,l)=>sum+l.count,0));
 const anchorId=r.objects.find(o=>o.catalogId==='swarm-aster').id;
 const anchored=items=>{const center=items[prefixes[ASTER_LANE]+ASTER_BERTH].position;
  assert(Math.hypot(...r.getFocusFrame(anchorId).position.map((v,i)=>v-center[i]))<1e-11,'Aster follows one real occupied habitat');
 };
 anchored(before);assert.equal(before.length,180);assert.equal(new Set(SWARM_LANES.map(l=>l.radius)).size,6);
 const secondsPerTick=18*REFERENCE_RG_METERS/299792458,seconds=6000;
 r.time+=seconds/secondsPerTick;r.fillObjects();const after=arrays();anchored(after);
 for(let i=0;i<6;i++){
  const index=prefixes[i],a=before[index].position,b=after[index].position;
  const delta=Math.acos(a.reduce((sum,z,j)=>sum+z*b[j],0)/(Math.hypot(...a)*Math.hypot(...b)));
  const distance=swarm.radiusMeters*SWARM_LANES[i].radius;
  assert(Math.abs(delta-Math.sqrt(1.32712440018e20/distance**3)*seconds)<1e-6,'Each lane advances at its own circular frequency');
  assert(Math.abs(Math.hypot(...a)-Math.hypot(...b))<1e-12,'Motion preserves the radius');
 }
 const saved=parseScene(serializeScene(r));restoreRenderer(r,saved);r.fillObjects();r.updateCameraFrame();
 assert.equal(getFrame().catalogId,'dyson-collectors');const restored=arrays();assert.deepEqual(restored.map(a=>a.position),after.map(a=>a.position),'Saving preserves orbital phases');
 r.focusTarget(swarm.id,'track',false,true);r.updateCameraFrame();const hud=observedBodyMeasurements(r);assert(hud.rows.some(row=>row.key==='formations'&&row.value==='180'));assert.equal(hud.kind,'Dyson swarm');
 r.focusTarget(anchorId,'track',false,true);r.updateCameraFrame();anchored(restored);
 assert.equal(observedBodyMeasurements(r).rows.find(v=>v.key==='district').value,'Shielded atrium');
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>180);}
 r.dispose();
}
console.log('PASS: 180 solar-facing formations, six Keplerian lanes, GPU/CPU scene frames, restored motion, and swarm HUD.');
