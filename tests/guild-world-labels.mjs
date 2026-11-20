import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {captureAnnotationFrame,installAnnotations} from '../dist/annotations.js';
import {bridgeFlatWorldSphere,bridgeWorldSphere} from '../dist/bridge-glsl.js';

for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:1000,height:700}),cpu=Renderer===CpuRenderer,canvas=cpu?new CpuCommandCanvas():f.canvas;
 if(cpu)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('bridge-planets');r.update({annotations:true});
 let layer;
 document.createElementNS=()=>layer={style:{},setAttribute(){},innerHTML:'',remove(){}};
 const overlay=installAnnotations({append(){},getBoundingClientRect:canvas.getBoundingClientRect},()=>r);
 for(const [time,far] of [[0,false],[40,true],[84,false]]){
  r.time=r.bridgeTime=r.bridgeTravelTime=time;r.fillObjects();r.updateCameraFrame();
  assert.equal(r.getBridgeStage().open,0);assert.equal(r.getBridgeStage().far,far);
  const id=far?'bridge-far-world':'bridge-near-world',name=far?'Arakas':'Caladan';
  let snapshot=captureAnnotationFrame(r);assert.equal(snapshot.travelCraftId,null);
  assert.equal(snapshot.localWorldBearing.name,name);overlay.update(snapshot);
  assert.match(layer.innerHTML,new RegExp('data-object-marker="'+id+'"'));
  assert(!layer.innerHTML.includes('data-object-marker="bridge-'+(far?'near':'far')+'-world"'),'closed gate hides the opposite chart');
  // Aim an unobstructed camera at the visible planetary disk in each chart.
  const b=r.configCache.bridgeRadius,axis=r.configCache.primaryBasis[2],observer=far?[b*.1,0,0]:[b*2,0,0];
  const sphere=far?bridgeFlatWorldSphere(observer,b,axis):bridgeWorldSphere(false,b,axis);
  let forward=sphere.center.map((x,i)=>x-observer[i]),d=Math.hypot(...forward);forward=forward.map(x=>x/d);
  r.cameraFrame={...r.cameraFrame,observer,eyeOrigin:null,eyeOffset:null,forward,up:[0,1,0],right:[forward[2],0,-forward[0]]};r.annotationOptics=null;
  snapshot=captureAnnotationFrame(r);const anchor=snapshot.objectFrames.find(o=>o.id===id)?.anchor;assert(anchor);
  assert(Math.hypot(anchor.x,anchor.y)<1e-8);overlay.update(snapshot);
  assert.match(layer.innerHTML,new RegExp('>'+name+'</text>'));assert(!layer.innerHTML.includes('Off screen'));
 }
 r.update({annotations:false});const off=captureAnnotationFrame(r);overlay.update(off);
 assert.equal(off.localWorldBearing,null);assert(!off.objectFrames.some(x=>x.bridgeSurface));assert.equal(layer.style.display,'none');
 overlay.dispose();r.dispose();
}
console.log('PASS: Caladan and Arakas labels follow the local chart, camera and display toggle on CPU and GPU.');
