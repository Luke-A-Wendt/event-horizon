import {SCENE_PRESETS} from '../dist/config.js';
import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';

const LY=299792458*31557600,PC=3.085677581491367e16,C=299792458,G=9.80665;
const near=(a,b,tol,label)=>assert(Number.isFinite(a)&&Math.abs(a/b-1)<tol,label+': '+a+' vs '+b);
const make=()=>new BlackHoleRenderer(fixture({width:390,height:700}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
const bench=d=>{const gamma=1+G*d/(2*C*C),eta=Math.acosh(gamma);return {proper:2*C/G*eta,distant:2*C/G*Math.sinh(eta),peak:C*Math.tanh(eta)};};
for(const [id,L,targets] of [
 ['shuttle-proxima-direct',4.2465*LY,['Earth',/Proxima.*d/i,/Proxima.*b/i]],
 ['shuttle-sgra-direct',8277*PC,['Earth','primary','primary']]
]){
 const r=make(),clone=make();
 try{
  if(id==='shuttle-sgra-direct')r.loadScene('shuttle-proxima-direct'); // Switching from a scene with no hole must resolve the new primary.
  r.loadScene(id);r.sceneLoad=null;r.state.paused=false;assert.equal(r.sceneId,id);
  assert.equal(r.state.bridge,false);assert.equal(r.state.warp,false);
  const craft=r.objects.find(o=>o.type==='shuttle'),q=r.flightSequences[craft.id];
  assert(q?.active&&q.loop,id+' must run a loop');assert.equal(q.nodes.length,targets.length);
  const names=q.nodes.map(n=>n.targetId==='primary'?'primary':r.objectById.get(n.targetId)?.name);
  targets.forEach((t,i)=>typeof t==='string'?assert.equal(names[i],t):assert.match(names[i],t));
  assert.equal(craft.parentId,q.nodes[0].targetId);
  const solar=r.objectById.get(craft.parentId).parentId;
  assert.deepEqual(r.objects.filter(o=>o.parentId===solar).map(o=>o.name),['Earth']);
  const outbound=r.getFocusFrame(q.nodes[1].targetId),here=r.getFocusFrame(craft.id);
  const baseline=Math.hypot(...outbound.position.map((v,i)=>v-here.position[i]))*REFERENCE_RG_METERS;
  near(baseline,L,.00001,id+' uncompressed separation');
  const saved=parseScene(serializeScene(r));restoreRenderer(clone,saved);clone.fillHoles();clone.fillObjects();
  const restored=clone.getFocusFrame(q.nodes[1].targetId),restoredCraft=clone.getFocusFrame(craft.id);
  near(Math.hypot(...restored.position.map((v,i)=>v-restoredCraft.position[i]))*REFERENCE_RG_METERS,baseline,1e-8,id+' save/reload separation');
  const visited=[],spectra=[];let sawDrive=false,sawFlip=false,sawLag=false,midSave=false;
  for(let i=0;i<10000&&visited.length<q.nodes.length+1;i++){
   const t=r.transfer;r.advanceChartStages(.05);assert(!q.error,id+': '+q.error);
   if(!t&&r.transfer){const p=r.transfer;
    if(p.distanceMeters>L/2){
     const reference=bench(p.distanceMeters);
     near(p.distanceMeters,L,.00001,id+' transfer length');near(p.plan.accelerationMetersPerSecondSquared,G,1e-12,id+' proper thrust');
     // Initial/terminal orbital speeds and the short unpowered flip make this a
     // near-rest-to-rest trip. Their contribution is small, but not exactly zero.
     near(p.properSeconds,reference.proper,.005,'onboard ETA');
     near(p.coordinateSeconds,reference.distant,.005,'distant ETA');near(p.plan.peakSpeed,reference.peak,.005,'peak speed');
     assert(p.dilationSeconds>0);spectra.push([p.properSeconds/31557600,p.coordinateSeconds/31557600]);
    }
   }
   if(id==='shuttle-sgra-direct'&&t?.radiusChange&&r.transfer){
    const sample=r.getObjectClock(craft.id);assert(Number.isFinite(sample.crewLoadG)&&sample.crewLoadG<=1+1e-8,'The default Galactic recovery spiral fits the 1g capability');
   }
   if(t?.active&&r.transfer&&t.distanceMeters>L/2){
    const f=craft.flight;assert(f.speed<C&&f.speed>=0);sawDrive||=Math.abs(f.thrust)===1;sawFlip||=t.phaseIndex===2&&f.thrust===0;
    const obs=r.getObjectClock(craft.id);sawLag||=obs.rateFactor>1.5;assert(Number.isFinite(obs.coordinateSeconds+obs.properSeconds+obs.rateFactor));
    if(!midSave&&t.progress>.4){parseScene(serializeScene(r));midSave=true;}
   }
   if(t&&!r.transfer){
    visited.push(craft.parentId);assert.equal(craft.parentId,q.nodes[visited.length%q.nodes.length].targetId,'land at the next queued orbit');
    near(craft.orbitMeters,t.orbitRadiusMeters,1e-9,'arrival radius');
    if(craft.parentId==='primary'){
     const mu=r.getFocusFrame('primary').massSolar*1.32712440018e20,R=q.nodes[2].radiusMeters,inner=q.nodes[1].radiusMeters;
     const work=(a,b)=>mu*.5*(1/a-1/b),chord=(a,b)=>Math.sqrt((b-a)*(b+a));
     near(mu/(R*R+(craft.routeParkingHeightMeters||0)**2),G,1e-10,'outer orbit has a 1g field at its actual centre distance');
     assert(inner<R&&inner>3*r.getFocusFrame('primary').horizonRadius*REFERENCE_RG_METERS,'inner orbit outside Schwarzschild ISCO');
     assert(work(inner,R)<=G*chord(inner,R)&&work(inner-1.1,R)>G*chord(inner-1.1,R),'closest feasible inner radius, to one metre');
     const f=r.getObjectClock(craft.id);
     assert(Number.isFinite(f.crewLoadG)&&f.crewLoadG<=1,'Scheduled Sagittarius A* parking orbit stays inside the 1g support budget');
     if(!t.tangentLeg.concentric){
      near(f.minimumReturnG,work(inner,R)/(G*chord(inner,R)),1e-10,'live minimum escape vs independent specific-energy difference');
      assert(f.minimumReturnG<=1,'no false escape warning at the feasible inner radius');
     }else{
      assert(t.radiusChange,'A same-body recovery follows the radius maneuver');
      assert(t.endpointClock.wallSeconds>10&&t.wallSeconds>=t.endpointClock.wallSeconds,'Outward radius change allows extra viewing time near both circles');
      near(t.plan.initialSpeed,Math.sqrt(mu/inner),1e-8,'inner departure speed');near(t.plan.finalSpeed,Math.sqrt(mu/R),1e-8,'outer arrival speed');
      const actual=r.getFocusFrame(craft.id).position.map(x=>x*REFERENCE_RG_METERS);
      assert(Math.hypot(...actual.map((v,i)=>v-t.tangentLeg.end[i]))<.1,'no position discontinuity on arrival at outer recovery orbit');
     }
    }
    if(t.distanceMeters>L/2){
     near(t.properElapsedSeconds,t.properSeconds,1e-8,'onboard clock vs forecast');near(t.coordinateElapsedSeconds,t.coordinateSeconds,1e-10,'distant clock vs forecast');
    }
   }
  }
  assert.equal(visited.length,q.nodes.length+1,id+' loop must leave Earth again');assert(sawDrive&&sawFlip&&sawLag&&midSave);
  if(id==='shuttle-sgra-direct'){
   r.loadScene(id);r.sceneLoad=null;r.state.paused=false;
   const ship=r.objects.find(o=>o.type==='shuttle'),q=r.flightSequences[ship.id],stops=q.nodes.map(n=>({...n}));
   stops[1].radiusMeters-=2; // The straight-return benchmark does not gate a guided spiral.
   assert(!r.setFlightSequence(ship.id,stops,{loop:true})?.error);
   let sawWarning=false,recovered=false;
   for(let i=0;i<2000&&!recovered;i++){
    const before=r.transfer;r.advanceChartStages(.05);
    assert(!r.flightSequences[ship.id].error);
    if(before&&!r.transfer){
     if(before.radiusChange)recovered=true;
     else if(ship.parentId==='primary')sawWarning=r.getObjectClock(ship.id).minimumReturnG>1;
    }
   }
   assert(sawWarning&&recovered,'A close custom stop shows the threshold and still completes the slower spiral');
   near(ship.orbitMeters,stops[2].radiusMeters,1e-11,'recovered outer radius');
  }
  console.log(id+': '+names.join(' → ')+' → Earth; first long leg '+spectra[0].map(x=>x.toFixed(3)).join(' / ')+' years onboard / distant.');
 }finally{r.dispose();clone.dispose();}
}
assert(!SCENE_PRESETS.some(p=>p.id==='bridge-earth-proxima'),'No wormhole shortcut in the gallery');
assert.deepEqual(SCENE_PRESETS.filter(p=>p.title.startsWith('Earth to Proxima')).map(p=>p.id),['shuttle-proxima-direct','warp-proxima-direct']);
