import assert from 'node:assert/strict';
import {attitudeAngle,blendAttitude,handoffAttitude,TURN_SECONDS,turnDuration} from '../dist/flight-attitude.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),eq=(x,y)=>assert(Math.abs(x-y)<1e-8,x+' != '+y);
const I=[[1,0,0],[0,1,0],[0,0,1]];
const turn=a=>[[Math.cos(a),0,-Math.sin(a)],I[1],[Math.sin(a),0,Math.cos(a)]];
// Half-turn with roll: a rigid hull must keep its handedness and never swap
// the roll axis as the braking orientation passes through the antipode.
const b=[[-1,0,0],[0,0,1],[0,1,0]];
eq(attitudeAngle(I,b),Math.PI);let last=I;
for(let i=1;i<=90;i++){const f=blendAttitude(I,b,i/90);
 for(let x=0;x<3;x++)for(let y=0;y<3;y++)eq(dot(f[x],f[y]),x===y?1:0);
 eq(attitudeAngle(last,f),Math.PI/90);last=f;}
assert(turnDuration(.01)>=2);
// The next orbital tangent moves past the initial 180° heading. Fix the
// choice of yaw at contact so it cannot reverse in the middle of the slew.
const state={attitudeOnly:true,elapsed:0,basis:turn(Math.PI)};
last=handoffAttitude(state,I);for(let i=1;i<=120;i++){state.elapsed=i/40;const goal=turn(state.elapsed*.4);
 const frame=handoffAttitude(state,goal);assert(attitudeAngle(frame,last)<.065);last=frame;}
eq(attitudeAngle(last,turn(.4*TURN_SECONDS)),0);
const make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const r=make(),copy=make();
try{
 r.loadScene('shuttle-earth-moon-loop');r.sceneLoad=null;r.state.paused=false;
 const craft=r.objects.find(o=>o.type==='shuttle');let contact=false,alignSeconds=0;
 for(let i=0;i<3500;i++){const active=r.transfer;r.advanceChartStages(1/30);r.fillObjects();
  if(r.transfer?.phaseName==='Aligning for orbit'){
   alignSeconds+=1/30;
   eq(craft.flight.thrust,0);
   eq(craft.flight.speed,r.transfer.finalSpeed);
  }
  if(active&&!r.transfer&&craft.driveReturn?.attitudeOnly){
   contact=true;
   eq(dot(r.getFocusFrame(craft.id).frame[2],active.tangent),1);
   break;
  }
 }
 assert(alignSeconds>4,'The return to prograde receives its own presentation time before orbit capture');
 assert(contact,'Ordinary shuttle preserves its prograde insertion attitude');
 for(let i=0;i<30;i++)r.advanceChartStages(1/30);
 r.fillObjects();assert(craft.driveReturn.referenceBasis);const elapsed=craft.driveReturn.elapsed;
 assert(elapsed>=.99&&elapsed<1.05);const here=r.getFocusFrame(craft.id).frame;
 r.state.paused=true;r.lastTime=1000;for(let n=1;n<=25;n++)r.advanceSimulation(1000+n*40);
 eq(craft.driveReturn.elapsed,elapsed);
 const saved=parseScene(serializeScene(r));restoreRenderer(copy,saved);copy.fillObjects();
 eq(attitudeAngle(here,copy.getFocusFrame(craft.id).frame),0);
 console.log('PASS: multi-second rigid yaw/roll, a moving retrograde-to-prograde handoff, paused and saved arrival poses.');
}finally{r.dispose();copy.dispose();}
