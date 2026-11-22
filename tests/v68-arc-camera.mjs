import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {transferCurveDerivative} from '../dist/travel-math.js';
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),unit=a=>a.map(v=>v/Math.hypot(...a));
const r=new BlackHoleRenderer(fixture({width:420,height:760}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
r.loadScene('shuttle-earth-moon-loop');r.state.paused=false;r.sceneLoad=null;
const craft=r.objects.find(o=>o.type==='shuttle'),up=r.configCache.primaryBasis[1];
let straightSamples=0,arrivals=0,arcSamples=0,previous=null,wasFlying=false;
for(let i=0;i<24000&&arrivals<2;i++){
 const now=1000+1000*i/60;r.now=()=>now;r.advanceSimulation(now);r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const view=r.cameraFrame,c=r.getFocusFrame(craft.id),eye=unit(sub(view.observer,c.position));
 assert(Math.abs(dot(view.right,up))<1e-5,'Screen horizontal is level to origin plane');assert(dot(eye,up)>.035,'Eye stays above the hull');
 if(r.transfer?.active){const t=r.transfer,f=t.elapsed/t.wallSeconds,along=unit(transferCurveDerivative(t.points,t.curveParameter));
  if(f>.15&&f<.85){assert(dot(view.forward,along)>.998&&dot(view.forward,up)<-.025,'Gentle downward gaze keeps the destination close to center through the flip');assert(dot(eye,up)>.12,'Raised aft view shows top of hull');assert(dot(eye,along)<-.97,'Camera stays aft even while braking');straightSamples++;}
 }else{
  const body=r.getFocusFrame(craft.parentId),ray=sub(body.position,view.observer),distance=dot(ray,view.forward),miss=Math.hypot(...ray.map((x,j)=>x-distance*view.forward[j]));
  assert(dot(view.right,ray)<0,'Body on left');assert(Math.abs(miss/body.radius-1)<.003,'Centered sightline grazes physical limb');arcSamples++;
 }
 if(previous&&wasFlying!==!!r.transfer?.active){assert(dot(previous,view.forward)>.999,'No angular snap at contact');if(wasFlying)arrivals++;}
 previous=[...view.forward];wasFlying=!!r.transfer?.active;
}
assert(arrivals>=2&&straightSamples>500&&arcSamples>150);r.dispose();console.log('PASS: two parking arcs, both handoffs, raised forward gaze on both burns, stable level camera over an Earth–Moon return trip');
