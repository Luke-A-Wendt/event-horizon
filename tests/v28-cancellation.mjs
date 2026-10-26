import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {createOpticalContext,opticalForce} from '../dist/optical-projection.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:480,height:320}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const errors=[],r=new Renderer(canvas,{autoStart:false,bindControls:false,onError:e=>{if(e)errors.push(e)}});
 r.loadScene('mixed-merger');assert.equal(r.state.binaryRatio,1);assert.equal(r.state.mergerOutcome,'illustrative-cancellation');
 let prior=Infinity;
 for(const fraction of [0,.5,.8,.9,.95,.99,1]){
  r.time=r.state.mergerDuration*fraction;r.fillHoles();r.fillObjects();r.updateCameraFrame();
  assert(r.validateFrameGeometry());const total=r.holeData[3]+r.holeData[7];assert(total<=prior+1e-7);prior=total;
  assert.equal(r.holeData[3],r.holeData[7]);assert([...r.holeData,...r.configCache.horizon,...r.configCache.diskOuter].every(Number.isFinite));
 }
 assert.equal(prior,0);assert(r.cancellationFlat);assert.equal(r.getFocusFrame('primary'),null);assert.equal(r.getFocusFrame('secondary'),null);
 const context=createOpticalContext(r);assert.equal(context.holes.length,0);assert.deepEqual(opticalForce(context,[0,0,0],[1,0,0]),[0,0,0]);
 const saved=snapshotRenderer(r);restoreRenderer(r,saved);assert(r.cancellationFlat);assert(r.validateFrameGeometry());
 if(Renderer===CpuRenderer){
  const capture=()=>{canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}return canvas.takeFrame();};
  const before=capture();r.time+=10;r.fillHoles();r.fillObjects();r.updateCameraFrame();assert.deepEqual(capture(),before,'Flat CPU grid is stationary after cancellation');
 }else{r.render();assert.equal(f.uniforms.get('uWarpFlags').args[3],0,'No compact field remains in submitted GPU uniforms');}
 for(const ratio of [.5,2]){
  r.update({binaryRatio:ratio});r.time=r.state.mergerDuration;r.fillHoles();r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());r.render();
  assert(Math.abs(r.holeData[3]+r.holeData[7]-r.massScale*Math.abs(1-ratio))<1e-6);assert(!r.cancellationFlat);
  const remaining=ratio<1?'primary':'secondary';assert(r.getFocusFrame(remaining));assert.equal(createOpticalContext(r).holes.length,1);
 }
 r.loadScene('merger');r.time=r.state.mergerDuration;r.fillHoles();r.fillObjects();r.updateCameraFrame();assert(r.holeData[3]>0);assert(!r.cancellationFlat,'Ordinary mergers retain their mass');
 assert.deepEqual(errors,[]);r.dispose();
}
console.log('PASS: GPU/CPU mixed cancellation reaches exact stationary flat space, no zero-mass ghosts/NaNs, snapshot restoration, unequal residuals, ordinary positive-mass merger preserved.');
