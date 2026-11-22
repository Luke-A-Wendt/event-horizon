import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {BRAIN_TIERS,BRAIN_RADIUS,brainLayers,brainStarRadius} from '../dist/matrioshka.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(x=>x/Math.hypot(...a));
for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:640,height:422}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('matrioshka-brain');
 r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const eye=r.cameraFrame.observer,opening=unit(eye),star=r.objects.find(o=>o.type==='star'),core=r.getFocusFrame(star.id);
 assert.equal(star.radiusMeters,696340000);assert(core.brainStar);
 assert(Math.abs(core.drawRadius/core.radius-5.8)<1e-6);assert.equal(brainStarRadius(core.radius,core.radius*2),core.radius);
 let lastT=Infinity,lastR=0;
 for(const t of BRAIN_TIERS){
  const shell=r.objects.find(o=>o.catalogId===t.id),frame=r.getFocusFrame(shell.id);
  assert.equal(shell.parentId,star.id);assert.deepEqual(frame.position,r.getFocusFrame(star.id).position);
  assert(frame.radius*.965>lastR,'There is a physical gap between shells');lastR=frame.radius;
  assert(!(shell.dysonCutaway>0),'Start with a whole shell');
  assert.equal(shell.radiusMeters,BRAIN_RADIUS*t.radius);
  const panels=brainLayers(frame,eye);assert(panels.length>t.bays*3);
  assert(panels.some(p=>dot(unit(p.position),t.axis)>.9)&&panels.some(p=>dot(unit(p.position),t.axis)<-.9),'Lattice reaches both polar caps');
  for(const panel of panels)for(const face of panel.parts)for(const pt of face.points){
   assert(Math.hypot(...pt)<=frame.radius*(1+1e-7));assert(Math.hypot(...pt)>=.95*frame.radius);
  }
  r.focusTarget(shell.id,'track',false,true);r.updateCameraFrame();
  const rows=observedBodyMeasurements(r).rows;
  assert.equal(rows.find(row=>row.key==='function').value,t.role);
  const T=parseFloat(rows.find(row=>row.key==='temperature').value);assert(T>0&&T<lastT,'Outer layers reradiate at lower effective temperature');lastT=T;
 }
 const outer=r.objects.find(o=>o.catalogId==='brain-radiator');
 r.resetCamera();let previous=Infinity,crossings=[];r.sceneLoad=null;
 for(let i=0;i<=560;i++){
  r.time=i*.1*r.simulationTimeScale();r.fillObjects();r.updateCameraFrame();const range=Math.hypot(...r.cameraFrame.observer);
  for(const tier of BRAIN_TIERS){const radius=r.objectRadius(r.objects.find(o=>o.catalogId===tier.id));if(previous>=radius&&range<radius)crossings.push(tier.id);}
  assert(range<=previous*(1+1e-10));previous=range;
 }
 assert.deepEqual(crossings,BRAIN_TIERS.map(t=>t.id).reverse());r.rotate(.03,0);assert.equal(r.cameraGuide,null);
 r.updateObject(outer.id,{dysonCutaway:.60});r.fillObjects();
 const ribs=brainLayers(r.getFocusFrame(outer.id),eye);
 assert(ribs.some(b=>b.parts.length===3)&&ribs.some(b=>b.parts.length>3)&&[-1,1].every(sign=>ribs.some(b=>sign*unit(b.position)[2]>.8)),'Only supports remain, on both hemispheres');
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>200);}
 const save=parseScene(serializeScene(r));restoreRenderer(r,save);r.fillObjects();
 for(const [yaw,pitch] of [[-1,.9],[.7,-.33],[2.88,.55]]){
  r.focusTarget(star.id,'track',false,true);r.target.focusDistance=r.camera.focusDistance=BRAIN_RADIUS*2.69/star.radiusMeters;
  r.target.yaw=r.camera.yaw=yaw;r.target.pitch=r.camera.pitch=pitch;r.updateCameraFrame();
  if(Renderer===CpuRenderer){canvas.beginFrame();r.render(2000,false,true);const frame=canvas.takeFrame();assert(frame.commands.length<20000&&frame.commands.some(row=>row[0]==='fillPolygon'));}
  else assert(r.drawScene());
 }
 assert.deepEqual(r.objectFrames.map(o=>o.catalogId).filter(Boolean),BRAIN_TIERS.map(t=>t.id));
 r.dispose();
}
console.log('PASS: four complete spherical decks and an interior camera passage, magnified stellar overview and physical approach, warm/cool layers, all-angle CPU/GPU draws, thermal cascade and saved scene.');
