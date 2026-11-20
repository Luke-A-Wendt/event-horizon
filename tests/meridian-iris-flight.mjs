import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

// Fly the catalog routes on the same presentation clock that advances the
// playlist, orbit geometry and aperture. Distances are in world chart units.
function flight(scene){
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.loadScene(scene);r.sceneLoad=null;r.state.paused=false;
 let now=1000;r.lastTime=now;r.fillHoles();r.fillObjects();
 const id=r.objects.find(o=>o.type==='shuttle').id,star=r.objects.find(o=>o.type==='star');
 function sample(){
  const f=r.getFocusFrame(id),xyz=star?r.getFocusFrame(star.id).position:r.holeData;
  return {closure:f.irisClosure,range:Math.hypot(...f.position.map((v,i)=>v-xyz[i])),slot:f.index};
 }
 return {r,sample,tick(){r.advanceSimulation(now+=100);r.fillObjects();return sample();}};
}
const solar=flight('solar-system'),sun=solar.sample(),start=sun.range;
assert.equal(sun.closure,1,'already in near-Sun orbit at scene load');
let prev=sun,interior=[],froze=false;
for(let i=0;i<1200&&prev.closure>0;i++){
 const s=solar.tick();
 assert(s.closure<=prev.closure+1e-7&&prev.closure-s.closure<.2,'continuous withdrawal on departure');
 if(s.closure>.1&&s.closure<.9){
  interior.push(s.range);
  if(!froze){
   solar.r.state.paused=true;
   assert.equal(solar.tick().closure,s.closure,'pausing mid-withdrawal freezes the mechanism');
   solar.r.state.paused=false;
   const photo=solar.r.beginPhotoCapture();
   const packed=photo.uniforms.find(u=>u.name==='uBodyParams[0]').args[0];
   assert(Math.abs(packed[s.slot*4]-s.closure)<1e-6,'photograph contains the exact partially open aperture');
   assert.equal(solar.tick().closure,s.closure,'still capture cannot advance the motor');
   solar.r.endPhotoCapture();froze=true;
  }
 }
 prev=s;
}
assert(interior.length>=8&&interior.at(-1)>interior[0]&&interior[0]>start);
assert.equal(prev.closure,0,'garden open by Mercury');solar.r.dispose();

const edge=flight('nasa-shuttle');
prev=edge.sample();assert.equal(prev.closure,0,'distant orbit starts open');
let closing=[],protectedOrbit=false,replayed=false,reopened=false;
for(let i=0;i<5000;i++){
 const s=edge.tick();
 assert(Math.abs(s.closure-prev.closure)<.2,'closing, opening and instantaneous route replay keep the blade motion continuous');
 if(!protectedOrbit&&s.closure>.05&&s.closure<.95)closing.push(s);
 if(s.closure===1)protectedOrbit=true;
 if(protectedOrbit&&s.range>prev.range*10){
  assert(prev.closure>.99&&s.closure>.7,'the ship jumps to the opening orbit but the shield cannot teleport open');
  replayed=true;
 }
 if(replayed&&s.closure===0){reopened=true;break;}
 prev=s;
}
assert(closing.length>=8&&closing.at(-1).range<closing[0].range*.8,'blades sweep shut as the ship actually approaches the disc');
assert(protectedOrbit&&replayed&&reopened,'disc orbit and outer orbit have the appropriate fully settled states');
edge.r.dispose();
console.log('Meridian iris: solar departure, disc approach, route replay, pause and still capture passed.');
