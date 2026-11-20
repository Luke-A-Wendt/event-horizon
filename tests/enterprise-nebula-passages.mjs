import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {hullType,OBJECT_KIND} from '../dist/objects.js';
import {createOpticalContext} from '../dist/optical-projection.js';

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture(),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false,deferProgram:true});
 try{
  for(const id of ['warp-cruise','bridge-nebulae']){
   r.loadScene(id);r.sceneLoad=null;r.state.paused=false;
   const c=r.objects.find(o=>o.type==='enterprise');assert.equal(c.name,'USS Enterprise');
   r.fillObjects();r.updateCameraFrame();assert.equal(r.shaderFeatures().craftMask,64);
   const frame=r.getFocusFrame(c.id);assert.equal(r.colorData[frame.index*4+3],OBJECT_KIND.classicEnterprise);
   const ship=parseScene(serializeScene(r)).objects.find(o=>o.id===c.id);assert.equal(hullType(ship),'classicEnterprise');assert.equal(ship.name,c.name);
   if(id==='warp-cruise'){assert.equal(r.warpObjectId,c.id);assert.equal(r.state.warpFactor,4);assert(r.state.nebulaVolume&&r.state.warp);r.lastTime=1000;r.advanceSimulation(1100);assert(r.warpTravelWorld>0);continue;}
   r.update({bridgeTravelerType:r.state.bridgeTravelerType});assert.equal(hullType(c),'classicEnterprise','Reapplying UI settings preserves the authored hull');
   const q=r.flightSequences[c.id];assert(q.loop);assert.equal(r.bridgeObjectId,c.id);
   const checks=()=>{r.fillObjects();r.updateCameraFrame();assert.equal(r.getBridgeStage().open,1);assert.equal(r.getBridgeStage().hardware,false);assert.equal(r.shaderFeatures().bridgeHardware,false);const optics=createOpticalContext(r);if(!r.cpu)assert(optics.bridge);assert.equal(optics.bridgeScale,1);};
   checks();assert.equal(r.getBridgeStage().far,false);
   const reached=[];
   for(let i=0;i<1700&&reached.length<2;i++){
    const t=r.transfer;r.advanceChartStages(.1);checks();assert(!q.error,q.error);
    if(t&&r.transfer!==t)reached.push([t.targetId,r.getBridgeStage().far]);
   }
   assert.deepEqual(reached,[['bridge-far-world',true],['bridge-near-world',false]],'A permanent aperture through the optical chart in both directions');
   for(const model of ['enterprise','classicEnterprise']){assert.equal(hullType(r.setBridgeTraveler(model)),model);r.updateCameraFrame();const f=r.getFocusFrame(c.id);assert.equal(r.colorData[f.index*4+3],OBJECT_KIND[model],'The live body must change along with the traveler selector');}
  }
 }finally{r.dispose();}
}
console.log('PASS: classic Enterprise GPU/CPU hull and save file, warp 4 magenta cruise, Fire–Ice–Fire playlist with a permanently open optical throat.');
