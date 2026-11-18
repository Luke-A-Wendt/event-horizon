import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parkedOrbitGeometry,parkedCameraFraming,captureParkedOrbit} from '../dist/orbit-path.js';
import {fixture} from './render-fixture.mjs';
const render=new BlackHoleRenderer(fixture({width:900,height:650}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
try{
 render.loadScene('shuttle-earth-moon-loop');render.sceneLoad=null;render.state.paused=false;
 const craft=render.objects.find(o=>o.type==='shuttle'),p=craft.parentId,a=craft.orbitMeters,b=a*1.35;
 render.setFlightSequence(craft.id,[{targetId:p,radiusMeters:a,extraLaps:1},{targetId:p,radiusMeters:b,extraLaps:2}],{loop:true,active:true});
 let time=0,departures=0,arrivals=0,wasFlying=false,samples=0;
 render.now=()=>time*1000;
 for(let i=0;i<1200&&arrivals<2;i++){
  const q=render.flightSequences[craft.id];
  if(q.orbitWait){
   assert(q.orbitWait.radiusChange);
   assert.equal(q.orbitWait.baseSweepRadians,0);
   assert.equal(q.orbitWait.sweepRadians,2*Math.PI*(arrivals===0?1:2));
   if(!i)assert.equal(captureParkedOrbit(render,craft.id).kind,'orbit','No straight chord is shown during a radius-change stop');
  }
  time+=.05;render.advanceChartStages(.05);render.fillHoles();render.fillObjects();render.updateCameraFrame();
  const flying=!!render.transfer;
  if(flying){
   assert(render.transfer.radiusTransfer);assert.equal(render.transfer.wallSeconds,10);
   assert(render.parkedCamera&&!render.parkedCamera.released,'Orbital guide remains in control');
   const orbit=parkedOrbitGeometry(render,craft.id),desired=parkedCameraFraming(render,orbit).eye;
   assert(dot(render.cameraFrame.forward,desired)<-.9999,'Sightline stays on the same orbital limb during both burns');
   assert(Math.abs(dot(render.cameraFrame.right,orbit.normal))<1e-6,'Screen stays level through the retrograde nose flip');
   samples++;if(!wasFlying)departures++;
  }else if(wasFlying){arrivals++;assert(render.parkedCamera,'Camera stays on the next circle');}
  wasFlying=flying;
 }
 assert.equal(departures,2);assert.equal(arrivals,2);assert(samples>=395);
 console.log('PASS: exact full laps, ten-second bidirectional radius burns and continuous level limb camera');
}finally{render.dispose();}
