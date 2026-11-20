import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {SHKADOV_AXIS as axis,SHKADOV_COVERAGE,shkadovHit,shkadovPreview} from '../dist/shkadov.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
import {captureAnnotationFrame} from '../dist/annotations.js';

const scaled=n=>axis.map(x=>x*n);
assert(Math.abs(SHKADOV_COVERAGE-.29663)<.00001);
assert.equal(shkadovHit(scaled(-3),axis,3),null,'From the open side the star is visible before the far cap');
const front=shkadovHit(scaled(-3),axis,5),back=shkadovHit(scaled(3),scaled(-1),3);
assert(Math.abs(front.t-4)<1e-10&&front.inside);
assert(Math.abs(back.t-2)<1e-10&&!back.inside);
assert.match(shkadovPreview(back,scaled(-1)),/^#[0-9a-f]{6}$/);
assert.equal(shkadovHit(scaled(0),scaled(-1)),null,'Nothing blocks the escaping hemisphere');

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:640,height:422}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});
 r.loadScene('shkadov-thruster');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const [star,mirror]=r.objects,m=()=>r.getFocusFrame(mirror.id);
 assert.equal(mirror.parentId,star.id);assert.equal(r.focusId,mirror.id);
 const before=m().frame.map(v=>[...v]);
 r.time+=1e6;r.fillObjects();assert.deepEqual(m().frame,before);
 assert.deepEqual(m().position,r.getFocusFrame(star.id).position);
 assert.equal(r.bodyParamData[m().index*4+3],4);
 assert(!r.getSceneTargets().find(t=>t.id===mirror.id).canBoard);
 assert.equal(r.focusTarget(mirror.id,'onboard'),false,'There is no 1g garden on this mirror');
 r.state.annotations=true;r.updateCameraFrame();
 const labels=captureAnnotationFrame(r),a=labels.objectFrames.find(b=>b.id===mirror.id),b=labels.objectFrames.find(b=>b.id===star.id);
 assert(a?.anchor&&b?.anchor&&Math.abs(a.anchor.x-b.anchor.x)>.03,'Both star and on-sail locator are visible');
 const restored=parseScene(serializeScene(r));restoreRenderer(r,restored);r.fillObjects();r.updateCameraFrame();
 assert.equal(m().catalogId,'shkadov-mirror');assert.equal(m().dysonSpin,undefined);
 const hud=observedBodyMeasurements(r);assert.equal(hud.kind,'Stellar engine');assert(hud.rows.some(x=>x.key==='coverage'&&x.value==='29.7%'));assert(hud.rows.some(x=>x.key==='recoil'));assert(!hud.rows.some(x=>x.key==='floorGravity'));
 assert.equal(hud.rows.find(x=>x.key==='engineAcceleration').value,'1.9×10⁻¹³ m/s²');
 assert.equal(hud.rows.find(x=>x.key==='support').value,'Controlled hover');
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>20);}
 r.dispose();
}
console.log('PASS: single stationary cap, clear escaping hemisphere, distinct visible locators, GPU/CPU selection, save/restore and recoil readout.');
