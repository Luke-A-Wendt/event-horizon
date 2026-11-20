// Hull-frame propulsion commands for every NASA Warp Explorer. The visible
// bubble can be a stationary protective shield, which consumes no cruise trim.
import {warpYawCommand} from './flight-dynamics.js';
import {bridgeJourney} from './bridge-math.js';
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
function angularDemand(fn,t){
 const h=.02,a=fn(t-h),b=fn(t),c=fn(t+h);
 return warpYawCommand((wrap(c-b)-wrap(b-a))/(h*h));
}
export function explorerYawJet(r,craft){
 const turn=r.flightSequences?.[craft.id]?.pointTurn;
 if(turn?.wallSeconds>0){
  const u=Math.min(1,Math.max(0,turn.elapsed/turn.wallSeconds));
  return warpYawCommand(turn.angle*60*u*(1-u)*(1-2*u)/turn.wallSeconds**2);
 }
 if(r.driveId===craft.id&&craft.flight)return craft.flight.orbitHold?0:craft.flight.visualJet||0;
 if(r.state.bridge&&craft.id===r.bridgeObjectId){
  if(r.state.bridgeTravel===false||r.state.bridgeLifecycle!=='open-transit-close')return 0;
  return angularDemand(t=>bridgeJourney(t,r.configCache.bridgeRadius,'open-transit-close').headingAngle||0,r.bridgeTime);
 }
 if(!r.state.warp||craft.id!==r.warpObjectId)return 0;
 if(r.sceneId==='gravity-anomaly'){
  const field=r.objects.find(o=>o.type==='anomaly'),scale=field&&r.objectRadius(field)*.25;
  if(!(scale>0))return 0;
  const phase=r.warpTravelWorld/scale,rate=r.warpSpeedWorld()/scale;
  // Yaw of the actual Lissajous flight tangent, differentiated in time.
  return angularDemand(t=>Math.atan2(.55*Math.sin(phase+t*rate),.70*Math.cos(2*(phase+t*rate))),0);
 }
 if(r.state.warpScenario==='excursion')return angularDemand(t=>Math.PI*.5*Math.tanh(8*Math.sin(t*.16)),r.time);
 // Straight cruise and a free circular parking orbit have no changing yaw rate.
 return 0;
}

// A straight tangent carries no hull yaw rate. At the circular segment its
// rate is nonzero: the bow jets ease the hull into that turn, then counterfire
// before the next tangent. Integrate a smoothstep rate envelope in actual arc
// fraction (the onboard clock advances linearly with it, unlike video time).
export function warpArcSteering(wait){
 const sweep=wait.sweepRadians,x=Math.max(0,Math.min(1,wait.arcFraction||0));
 if(!(sweep>1e-8)||x<=0||x>=1)return {offset:0,jet:0};
 const w=Math.min(.12,.16/sweep),dir=-Math.sign(wait.direction||-1),out=x>.5,v=(out?1-x:x)/w;
 // ∫smoothstep = u³ − u⁴/2. Normalize so heading meets both tangents exactly.
 const area=v<1?w*v*v*v*(1-v*.5):(out?1-x:x)-w/2;
 const f=area/(1-w),angle=out?1-f:f;
 // The tiny mean torque on a long arc is supplied by short normal firings:
 // show duty within the commanded spin-up/down rather than a glowing jet
 // throughout the middle of an orbit where the hull spins freely.
 const jet=v>=1?0:dir*(out?-1:1)*4*v*(1-v);
 return {offset:dir*sweep*(angle-x),jet};
}
