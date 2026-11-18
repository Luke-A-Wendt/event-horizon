// Exercise the same navigation command and frame clock used by the mode buttons.
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
const norm=v=>Math.hypot(...v),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const close=(a,b,absolute=.001)=>assert(norm(sub(a,b))<=Math.max(absolute,3e-14*norm(b)),JSON.stringify({actual:a,expected:b}));
for(const type of ['shuttle','enterprise']){
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.loadScene(type==='shuttle'?'shuttle-space':'warp-lab');r.sceneLoad=null;r.state.paused=false;
 const c=r.objects.find(o=>o.type===type),pos=r.getFocusFrame(c.id).position.map(v=>v*RG);
 const span=type==='shuttle'?5e8:2e17;
 function mark(name,x,z){return r.addChildObject('space','waypoint',{name,x:pos[0]+x,y:pos[1],z:pos[2]+z}).id;}
 const a=mark('Alpha',span,0),b=mark('Bravo',span,span),d=mark('Delta',0,span);
 r.selectedId=c.id;r.focusTarget(c.id,'track');r.setNavigationMode(c.id,'auto');
 const plan=[a,b,d].map(targetId=>({targetId,warpFactor:2}));r.setFlightSequence(c.id,plan,{active:true,loop:false});
 let now=1000;r.lastTime=now;
 const tick=()=>{now+=50;r.advanceSimulation(now);r.fillObjects();};
 const until=(f,msg)=>{for(let i=0;i<1300&&!f();i++)tick();assert(f(),msg+' '+JSON.stringify(r.flightSequences[c.id]&&[r.flightSequences[c.id].index,r.flightSequences[c.id].error,r.transfer?.targetId,r.transfer?.phaseName]));};
 until(()=>r.transfer?.targetId===b&&r.transfer.progress>.25,'reach second item before toggling');
 const cursor=r.flightSequences[c.id].index;
 function toDrive(){
  const speed=c.flight.speed,velocity=[...c.flight.velocity],p=[...c.flight.position];
  r.setNavigationMode(c.id,'manual');assert(!r.transfer);assert(!c.flight.orbitHold);assert.equal(c.flight.thrust,0);close(c.flight.position,p);close(c.flight.velocity,velocity);assert(speed>0);
  for(let i=0;i<6;i++)tick();
  close(c.flight.velocity,velocity);close(c.flight.position,p.map((x,i)=>x+velocity[i]*.3),Math.max(1,norm(velocity)*1e-6));
 }
 function toAuto(){
  const p=[...c.flight.position],v=[...c.flight.velocity];
  r.setNavigationMode(c.id,'auto');assert.equal(r.getNavigationState(c.id).mode,'auto');close(c.flight.position,p);close(c.flight.velocity,v);
  assert.equal(r.flightSequences[c.id].index,cursor);assert.deepEqual(r.getFlightSequence(c.id).nodes.map(n=>n.targetId),[a,b,d]);return v;
 }
 toDrive();let v=toAuto();
 // Interrupt while recovering; a second handoff must restart from the live state.
 for(let i=0;i<4;i++)tick();toDrive();v=toAuto();
 let minimum=norm(v),braking=false,warpSamples=[],previous=c.flight.speed;
 for(let i=0;i<1200&&c.waypointHoldId!==b&&r.transfer?.targetId!==d;i++){
  tick();if(r.transfer)assert.equal(r.transfer.targetId,b,'Resume Bravo, not the first or last item');
  if(c.flight){const speed=c.flight.speed;
   if(type==='shuttle'&&speed<previous-.001&&minimum>1&&speed>1&&dot(c.flight.velocity,v)/(speed*norm(v))>.99999)braking=true;
   minimum=Math.min(minimum,speed);previous=speed;
   if(type==='enterprise')warpSamples.push(r.state.warpFactor||0);
  }
 }
 assert(c.waypointHoldId===b||r.transfer?.targetId===d,'failed to rejoin '+type+': '+JSON.stringify([r.getFlightSequence(c.id).index,r.getFlightSequence(c.id).error,r.transfer?.targetId,r.transfer?.phaseName]));
 if(type==='shuttle'){assert(braking,'Brake along incoming velocity');assert(minimum<1,'Reach rest');}
 else{const peak=Math.max(...warpSamples);assert(peak<=8.000001&&peak>7.99,'Cap the long recovery at warp 8');assert(warpSamples.filter(w=>w>7.99).length>3,'Coast at cruise');const i=warpSamples.indexOf(peak);assert(warpSamples.slice(0,i).filter(w=>w>2.1&&w<7.9).length>3);assert(warpSamples.slice(i).filter(w=>w>2.1&&w<7.9).length>3);}
 until(()=>r.flightSequences[c.id].holding,'finish remaining playlist');assert.equal(c.waypointHoldId,d);assert.equal(c.flight.speed,0);r.dispose();
}
// A one-item orbit must be reacquired; the old parent ID alone does not mean
// the coasting craft is still parked on that circle.
{
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene('shuttle-earth-moon-loop');r.sceneLoad=null;r.state.paused=false;
 const c=r.objects.find(o=>o.type==='shuttle'),earth=r.objects.find(o=>o.name==='Earth');
 r.setFlightSequence(c.id,[{targetId:earth.id}],{loop:false,active:true});
 const radius=r.getFlightSequence(c.id).nodes[0].radiusMeters;
 r.setNavigationMode(c.id,'manual');let t=1000;r.lastTime=t;const tick=()=>{r.advanceSimulation(t+=50);r.fillObjects();};for(let i=0;i<12;i++)tick();
 r.setNavigationMode(c.id,'auto');assert(!r.getFlightSequence(c.id).holding,'Do not confuse previous parent with current orbit');
 for(let i=0;i<800&&!r.getFlightSequence(c.id).holding;i++)tick();
 assert(r.getFlightSequence(c.id).holding,r.getFlightSequence(c.id).error||'Failed to reacquire Earth');assert.equal(c.parentId,earth.id);assert.equal(c.orbitMeters,radius);r.dispose();
}
// In a chart-based interstellar scene the orbiting bodies are parked for
// presentation; an abrupt change of ephemeris time can move Earth across the
// shuttle's inertial path before the pilot can even switch back.
{
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});r.loadScene('shuttle-proxima-direct');r.sceneLoad=null;r.state.paused=false;
 const c=r.objects.find(o=>o.type==='shuttle');let t=1000;r.lastTime=t;const tick=()=>{r.advanceSimulation(t+=60);r.fillObjects();};
 for(let i=0;i<14;i++)tick();
 const dest=r.getFlightSequence(c.id).nodes[r.getFlightSequence(c.id).index].targetId;
 r.setNavigationMode(c.id,'manual');for(let i=0;i<6;i++)tick();r.setNavigationMode(c.id,'auto');
 assert.equal(r.transfer?.targetId,dest,r.getFlightSequence(c.id).error);r.dispose();
}
console.log('PASS: inertial handoffs, capture and same-destination resume, Enterprise warp ramps/cruise, and reacquisition of a terminal orbit.');
