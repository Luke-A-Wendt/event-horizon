// Recover circular four-acceleration from what the player actually sees: the
// rendered world positions, increments of distant clock time, and the Kerr
// metric. A zero on the HUD by itself would not establish free fall.
import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {fixture} from './render-fixture.mjs';

const C=299792458,G0=9.80665,dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const renderer=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
try{
 renderer.loadScene('nasa-shuttle');renderer.sceneLoad=null;renderer.state.paused=false;renderer.lastTime=1000;
 const ship=renderer.objects.find(o=>o.type==='shuttle'),nodes=renderer.getFlightSequence(ship.id).nodes,rg=renderer.massScale*RG;
 const a=renderer.state.spin,axes=renderer.configCache.primaryBasis,states=[],burnPeaks=[],physicalChecks=new Map();
 let previous=null;
 for(let i=1;i<=1000;i++){
  renderer.advanceSimulation(1000+100*i);renderer.fillHoles();renderer.fillObjects();
  const frame=renderer.getFocusFrame(ship.id),clock=renderer.getObjectClock(ship.id);
  const displacement=frame.position.map((v,j)=>(v-renderer.holeData[j])*RG);
  const radius=Math.hypot(...displacement),x=radius/rg,e=Math.atan2(dot(displacement,axes[0]),dot(displacement,axes[2]));
  const stage=renderer.transfer?'burn':nodes.findIndex(n=>Math.abs(radius-n.radiusMeters)<radius*1e-9);
  if(stage!==states.at(-1)){
   states.push(stage);
   if(stage==='burn')burnPeaks.push(0);
   if(states.length===8)break; // final stop teleports straight back to the opening orbit.
  }
  assert(clock.highGExposureSeconds===0&&clock.extremeGExposureSeconds===0,'No lethal exposure from gravity or the route reset');
  assert(Number.isFinite(clock.crewLoadG)&&clock.crewLoadG>=0&&clock.crewLoadG<=1,'Accelerometer must respect the physical engine budget');
  if(stage==='burn')burnPeaks[burnPeaks.length-1]=Math.max(burnPeaks.at(-1),clock.crewLoadG);
  else{
   assert(stage>=0&&Number.isInteger(stage));
   assert.equal(clock.crewLoadG,0,'No support on a freely orbiting stop');
   assert(Math.abs(dot(displacement,axes[1]))<radius*1e-10,'Rendered coast must be in the equatorial plane of the physical orbit, not a displaced parallel circle');
   const angle=previous&&Math.atan2(Math.sin(e-previous.e),Math.cos(e-previous.e));
   if(previous?.stage===stage&&angle>.06){
    const dt=clock.coordinateSeconds-previous.t,dtau=clock.properSeconds-previous.tau;
    const w=angle/(C*dt/rg),u0=dt/dtau,D=x*x-2*x+a*a;
    // a_r = -(u^t)^2 / 2 * d_r (g_tt + 2 Ω g_tφ + Ω² g_φφ).
    // Convert the covector to invariant norm through sqrt(g^rr), then to g.
    const gradient=-2/x**2+4*a*w/x**2+(2*x-2*a*a/x**2)*w*w;
    const invariantG=.5*u0*u0*Math.abs(gradient)*Math.sqrt(D)/x*C*C/(rg*G0);
    assert(invariantG<.002,'Path and clocks must reconstruct a geodesic: '+invariantG+'g at '+x+'M');
    assert(Math.abs(u0-clock.rateFactor)<2e-7,'Distant/onboard clock increments must describe this same orbit');
    physicalChecks.set(stage,(physicalChecks.get(stage)||0)+1);
   }
  }
  previous={e,t:clock.coordinateSeconds,tau:clock.properSeconds,stage};
 }
 assert.deepEqual(states,[0,'burn',1,'burn',2,'burn',3,0]);
 assert(burnPeaks.every(x=>x>.5)&&burnPeaks.length===3,'Coast fix did not suppress real thrust');
 assert(physicalChecks.size===4&&[...physicalChecks.values()].every(n=>n>=8));
 console.log('PASS: all four rendered laps and live clock increments independently reconstruct zero proper acceleration, all three burns produce real thrust, and replay incurs no g-load.');
}finally{renderer.dispose();}
