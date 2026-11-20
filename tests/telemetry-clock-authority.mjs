import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {CLOCK_LIGHT_SPEED as c,createObjectClock} from '../dist/object-clocks.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),a+' vs '+b);
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 r.loadScene('shuttle-space');r.sceneLoad=null;const body=r.objects.find(o=>o.type==='shuttle');
 r.setNavigationMode(body.id,'manual');r.update({paused:false,speed:2});r.lastTime=1000;
 body.clock=createObjectClock();body.flight.thrust=0;body.flight.velocity=[.8*c,0,0];body.flight.speed=.8*c;
 const reading=()=>r.getObjectClock(body.id);
 near(reading().rateFactor,5/3);
 r.advanceSimulation(1100);
 const q=reading();near(q.speedMetersPerSecond,.8*c);near(q.rateFactor,5/3);
 near(q.coordinateSeconds,.2);near(q.properSeconds,.12);near(q.lagSeconds,.08);
 r.state.paused=true;r.advanceSimulation(1300);near(reading().lagSeconds,q.lagSeconds);
 r.loadScene('warp-lab');const warp=r.objects.find(o=>o.type==='enterprise');r.sceneLoad=null;r.setNavigationMode(warp.id,'manual');r.setFlightPower(5);r.update({paused:false,speed:2});r.lastTime=2000;
 r.advanceSimulation(2100);const cabin=r.getObjectClock(warp.id);
 near(cabin.rateFactor,1);near(cabin.properSeconds,.2);near(cabin.coordinateSeconds,cabin.properSeconds);near(cabin.lagSeconds,0);
 near(r.getFlightState().properTimeSeconds,cabin.properSeconds);
 r.state.paused=true;r.advanceSimulation(2300);near(r.getObjectClock(warp.id).properSeconds,cabin.properSeconds);

 for(const [scene,type] of [['solar-system','shuttle'],['radiant-descent','astronaut']]){
  r.loadScene(scene);r.sceneLoad=null;const main=r.objects.find(o=>o.type===type);
  const companion=r.addChildObject('space','heritageShuttle',{x:9e17,y:0,z:0});
  r.state.paused=false;r.state.speed=1;r.lastTime=1000;
  r.focusTarget(companion.id,'track');
  for(let i=1;i<=15;i++)r.advanceSimulation(1000+100*i);
  const primary=r.getObjectClock(main.id),secondary=r.getObjectClock(companion.id);
  assert(primary.coordinateSeconds>0);near(secondary.coordinateSeconds,primary.coordinateSeconds);
  near(secondary.properSeconds,secondary.coordinateSeconds/secondary.rateFactor);
  if(scene==='radiant-descent'){
   for(let i=16;i<=510;i++)r.advanceSimulation(1000+100*i);
   const frozen=r.getObjectClock(companion.id).properSeconds;r.advanceSimulation(52100);
   near(r.getObjectClock(companion.id).properSeconds,frozen);
  }
 }
}finally{r.dispose()}
console.log('PASS: HUD rate uses actual shuttle velocity, manual proper time and lag agree with the same motion, pause and warp protection.');
