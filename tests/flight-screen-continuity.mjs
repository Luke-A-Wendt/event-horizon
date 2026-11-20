import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Sample the scene the way normal playback does, including the exact frame
// that switches from one controller to the next. A comparison of endpoint
// poses alone misses a planet filling the whole view in the preceding frame.
const hz=30,step=1/hz,clamp=x=>Math.max(-1,Math.min(1,x)),degrees=180/Math.PI;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const angle=(a,b)=>Math.acos(clamp(dot(a,b)))*degrees;
const relativeRotation=(a,b)=>Math.acos(clamp((a.reduce((s,v,i)=>s+dot(v,b[i]),0)-1)/2))*degrees;
function skyFromShip(ship,body){
 const v=sub(body.position,ship.position),d=Math.hypot(...v);
 return {size:2*degrees*Math.asin(Math.min(1,body.radius/d)),direction:v.map(x=>x/d)};
}
for(const [scene,worlds,legs=2] of [
 ['shuttle-earth-moon-loop',['Earth','Moon']],['shuttle-earth-mars-loop',['Earth','Mars']],
 ['earth-vulcan',['Earth','Vulcan']],['earth-mars-station-ferry',['Earth','Neptune']],
 ['shuttle-sgra-direct',['Earth'],3],['nasa-shuttle',[],3],
]){
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 try{
  r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
  const ship=r.objects.find(o=>o.type==='shuttle'||o.type==='enterprise'),planets=worlds.map(n=>r.objects.find(o=>o.name===n));
  const ferry=!!r.dockingMission;let last,orbitArrivals=0,wheelSweep=0,maxSize=0,maxTurn=0;
  let sawDeepSpiral=false;const ports=[],resolved=new Set(),closeStart=new Map();
  for(let i=0;i<600*hz;i++){
   const time=i*step,now=1000+time*1000;r.now=()=>now;
   if(i)r.advanceSimulation(now);r.fillHoles();r.fillObjects();r.updateCameraFrame();
   const f=r.getFocusFrame(ship.id),sky=planets.map(p=>skyFromShip(f,r.getFocusFrame(p.id))),sizes=sky.map(w=>w.size);
   const m=r.dockingMission,phase=m?.phase??(r.transfer?'transfer':'orbit');
   const wheel=m&&r.getFocusFrame(m.stationId).frame[0],rotation=f.frame.map(v=>[...v]);
   if(r.transfer?.plan?.viewAzimuth!==undefined)sawDeepSpiral=true;
   if(!ferry&&r.transfer?.progress>.5){
    const k=planets.findIndex(p=>p.id===r.transfer.targetId);
    // For these regular routes the tracked camera should still center the
    // approaching planet while it grows from a small disk to 40° across.
    if(k>=0&&sizes[k]>=3&&sizes[k]<=40){
     const frame=r.cameraFrame,body=r.getFocusFrame(planets[k].id),q=sub(sub(body.position,frame.eyeOrigin||frame.observer),frame.eyeOffset||[0,0,0]);
     const {width,height}=r.canvas.getBoundingClientRect(),aspect=width/height,hf=.415*Math.max(1,1.35/aspect),z=dot(q,frame.forward);
     assert(z>0&&Math.abs(dot(q,frame.right))<=hf*aspect*z&&Math.abs(dot(q,frame.up))<=hf*z,`${scene}: ${worlds[k]} missing from the arrival camera`);
    }
   }
   if(last){
    const turn=relativeRotation(last.rotation,rotation),delta=Math.max(0,...sizes.map((v,k)=>Math.abs(v-last.sizes[k])));
    maxSize=Math.max(maxSize,delta);maxTurn=Math.max(maxTurn,turn);
    assert(turn<6,`${scene} ${last.phase} → ${phase} at ${time.toFixed(2)}s: hull rotated ${turn.toFixed(2)}° in one frame`);
    assert(delta<2.5,`${scene} ${last.phase} → ${phase} at ${time.toFixed(2)}s: planetary diameter changed ${delta.toFixed(2)}° in one frame`);
    for(let k=0;k<sizes.length;k++){
     if(Math.max(sizes[k],last.sizes[k])>=3){
      const bearingStep=angle(sky[k].direction,last.sky[k].direction);
      assert(bearingStep<7,`${scene} ${phase} at ${time.toFixed(2)}s: visible ${worlds[k]} moved ${bearingStep.toFixed(2)}° in one frame`);
     }
     if(last.sizes[k]<5&&sizes[k]>=5)closeStart.set(k,time);
     if(last.sizes[k]<55&&sizes[k]>=55&&closeStart.has(k)){
      const approachWindow=time-closeStart.get(k);
      assert(approachWindow>=2,`${scene}: ${worlds[k]} grew from 5° to 55° across in ${approachWindow.toFixed(2)}s`);
      resolved.add(worlds[k]);closeStart.delete(k);
     }
    }
    if(ferry){
     if(phase==='orbit'&&last.phase!=='orbit')wheelSweep=0;
     if(wheel&&m.stationId===last.station&&['orbit','acquire','approach'].includes(last.phase)&&last.wheel)wheelSweep+=angle(wheel,last.wheel);
     if(phase==='docked'&&last.phase!=='docked'){
      assert(wheelSweep>1&&wheelSweep<3*360,`${scene}: ring turned ${(wheelSweep/360).toFixed(2)} times during rendezvous`);
      ports.push(m.stationId);if(ports.length===3)break;
     }
    }else if(!r.transfer&&last.phase==='transfer'&&++orbitArrivals===legs)break;
   }
   last={rotation,sizes,sky,phase,wheel:wheel&&[...wheel],station:m?.stationId};
  }
  if(ferry){assert.equal(ports.length,3);assert.notEqual(ports[0],ports[1]);assert.equal(ports[0],ports[2]);}
  else assert.equal(orbitArrivals,legs);
  if(scene==='nasa-shuttle')assert(sawDeepSpiral,'Inner Kerr migration is exercised');
  assert.deepEqual([...resolved].sort(),[...worlds].sort(),`${scene}: expected a resolved approach at both ends`);
  console.log(`PASS: ${scene} playback at ${hz} fps, max/frame ${maxSize.toFixed(2)}° planet diameter, ${maxTurn.toFixed(2)}° hull rotation.`);
 }finally{r.dispose();}
}
