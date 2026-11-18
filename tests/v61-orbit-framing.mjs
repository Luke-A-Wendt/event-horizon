import './fixtures/shuttle-bridge.mjs';
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parkedOrbitGeometry,parkedCameraFraming} from '../dist/orbit-path.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';
for(const scene of ['solar-system','warp-orbit','shuttle-earth-moon-loop','test-shuttle-bridge'])for(const [width,height] of [[1280,776],[390,676]]){
 const r=new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene(scene);
 const c=r.objects.find(o=>['shuttle','enterprise'].includes(o.type));assert(c);r.focusTarget(c.id,'track');r.updateCameraFrame();
 const orbit=parkedOrbitGeometry(r,c.id);assert(orbit,scene);const fit=parkedCameraFraming(r,orbit);assert(fit.distance>=1.15);assert(r.parkedCamera,scene);
 const view=r.cameraFrame,toParent=(orbit.parentCenter||orbit.center).map((v,i)=>v/RG-view.observer[i]),length=Math.hypot(...toParent),dot=toParent.reduce((n,v,i)=>n+v*view.forward[i],0)/length;
 const depth=dot*length,miss=Math.sqrt(Math.max(0,length*length-depth*depth)),shadow=orbit.parentRadius/RG*(r.state.lensing&&['hole','blackhole','whitehole'].includes(orbit.parentType)?2.7:1);if(scene==='warp-orbit'){
  const delta=orbit.craft.position.map((v,i)=>v-view.observer[i]),project=axis=>axis.reduce((n,v,i)=>n+v*delta[i],0),z=project(view.forward);
  const wall=r.warpEnvelope(orbit.craft).radius*orbit.craft.radius*1.18,pixelScale=height/fit.fov;
  // The tangent rays to the shell give exact projected extrema even off-axis.
  function bounds(axis){const u=project(axis),q=wall*Math.sqrt(z*z+u*u-wall*wall);return [-q,q].map(k=>(u*z+k)/(z*z-wall*wall)*pixelScale);}
  for(const [axis,size] of [[view.right,width],[view.up,height]]){
   const [a,b]=bounds(axis);assert(a>-.48*size&&b<.48*size,'entire off-axis wall fits with margin');
  }
  const holeX=toParent.reduce((n,v,i)=>n+v*view.right[i],0)/depth*pixelScale/width,shipX=project(view.right)/z*pixelScale/width;
  assert(holeX<-.10&&holeX>-.40&&shipX>.08&&shipX<.25,'shadow to left and Enterprise to right');
  assert((bounds(view.up)[1]-bounds(view.up)[0])>.47*Math.min(width,height),'bubble remains prominent');
 }else{assert(fit.distance<16);assert(Math.abs(miss/shadow-1)<1e-4,scene+' limb centered');}
 assert(toParent.reduce((n,v,i)=>n+v*view.right[i],0)<0,scene+' planet left');assert(r.maxFocusDistance()>=r.target.focusDistance);
 r.rotate(.2,0);r.updateCameraFrame();assert(r.parkedCamera.released);r.dispose();
}
console.log('PASS close limb and full warp field orbit compositions for Shuttle/Enterprise, planets/black holes/bridge worlds, desktop/mobile and manual override');
