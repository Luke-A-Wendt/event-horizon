import {contactPlaybackProgress} from './contact-playback.js';
import {sampleKerrRadius} from './kerr-transfer.js';
// Bounded moving-start transfer estimates in a local flat reference frame.
// Shuttle: 1 g proper acceleration, reverse thrust halfway, then 1 g braking.
// NASA Warp Explorer: fictional clock protection and a smooth selected-warp ramp.
import {speedForWarp,warpForSpeed,FLIGHT_WARP_MAX} from './flight-dynamics.js';
// Gravity and moving-target corrections belong to the scene controller.
export const TRANSFER_LIGHT_SPEED=299792458;
export const TRANSFER_GRAVITY=9.80665;
const MAX_DISTANCE=1e100;
const clamp01=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const c=TRANSFER_LIGHT_SPEED,a=TRANSFER_GRAVITY,clockScale=c/a;
function sinhExcess(x){
 // sinh(x)-x loses all significant digits for ordinary short Shuttle trips.
 if(Math.abs(x)<.02){const x2=x*x;return x*x2*(1/6+x2*(1/120+x2*(1/5040+x2*(1/362880+x2/39916800))));}
 return Math.sinh(x)-x;
}
const speedAt=eta=>Math.min(c*(1-8*Number.EPSILON),c*Math.tanh(eta));
const rapidityFor=v=>Math.atanh(Math.min(1-8*Number.EPSILON,Math.max(0,Number(v)||0)/c));
const gammaExcess=eta=>2*Math.sinh(eta*.5)**2;
export function minimumTransferDistance(initialSpeed=0,finalSpeed=0){return c*c/a*Math.abs(gammaExcess(rapidityFor(initialSpeed))-gammaExcess(rapidityFor(finalSpeed)));}
export function estimateTransfer(distanceMeters,type='shuttle',requestedWarp=1,options={}){
 const requested=Math.max(0,Math.min(MAX_DISTANCE,Number.isFinite(distanceMeters)?distanceMeters:0));
 const initialSpeed=Math.max(0,Number(options.initialSpeed)||0),finalSpeed=Math.max(0,Number(options.finalSpeed)||0);
 if(type==='enterprise'){
  if(options.cruiseWarpLimit>0&&requested>0){
   // A speed-limited Auto cruise uses the same integrated endpoints as a
   // timed cruise, but solves for trip duration instead of peak speed.
   const warp=Math.min(options.cruiseWarpLimit,Math.max(.1,requestedWarp??options.cruiseWarpLimit));
   const cruiseSpeed=speedForWarp(warp),rampFraction=.20,mean=(1-rampFraction)*cruiseSpeed+.5*rampFraction*(initialSpeed+finalSpeed);
   const T=requested/mean;
   return {type,distanceMeters:requested,properSeconds:T,coordinateSeconds:T,dilationSeconds:0,peakSpeed:Math.max(cruiseSpeed,initialSpeed,finalSpeed),peakRapidity:0,accelerationMetersPerSecondSquared:0,warpFactor:warp,initialSpeed,finalSpeed,cruiseSpeed,rampFraction};
  }
  if(!options.rejoin&&options.transferProperSeconds>0&&Number.isFinite(options.transferProperSeconds)&&requested>0){
   // The warp bubble's protected clock runs at chart time. Two equal smooth
   // ramps each average their endpoint speeds; solve their distance integral
   // plus the intervening coast for the cruise speed, not just distance / time.
   const T=options.transferProperSeconds,mean=requested/T;
   const rampFraction=Math.min(.3,mean/(initialSpeed+finalSpeed||mean));
   const cruiseSpeed=(mean-.5*rampFraction*(initialSpeed+finalSpeed))/(1-rampFraction);
   if(cruiseSpeed>speedForWarp(FLIGHT_WARP_MAX))return {error:'This trip time is too short for the ship’s maximum warp.'};
   return {type,distanceMeters:requested,properSeconds:T,coordinateSeconds:T,dilationSeconds:0,peakSpeed:Math.max(initialSpeed,cruiseSpeed,finalSpeed),peakRapidity:0,accelerationMetersPerSecondSquared:0,warpFactor:warpForSpeed(cruiseSpeed),initialSpeed,finalSpeed,cruiseSpeed,rampFraction};
  }
  if(options.rejoin){
   // A nearby recovery needn't reach interstellar speed. An initial speed
   // above warp eight is inherited and reduced, never clipped at takeover.
   const cruise=Math.min(speedForWarp(8),Math.max(initialSpeed,finalSpeed,requested/8));
   const mean=.15*(initialSpeed+finalSpeed)+.70*cruise,seconds=mean>0?requested/mean:0;
   return {type,distanceMeters:requested,properSeconds:seconds,coordinateSeconds:seconds,dilationSeconds:0,peakSpeed:Math.max(initialSpeed,cruise,finalSpeed),peakRapidity:0,accelerationMetersPerSecondSquared:0,warpFactor:warpForSpeed(cruise),initialSpeed,finalSpeed,rejoinCruise:cruise};
  }
  const warpFactor=Math.max(.1,Math.min(FLIGHT_WARP_MAX,Number(requestedWarp)||1)),peak=speedForWarp(warpFactor);
  // Positive Bernstein speed controls preserve both endpoint velocities and
  // give an analytic distance integral. Rest-to-rest is the old quintic ease.
  const center=Math.max(0,(peak-.3125*(initialSpeed+finalSpeed))/.375),velocityControls=[initialSpeed,initialSpeed,center,finalSpeed,finalSpeed],average=(2*initialSpeed+center+2*finalSpeed)/5;
  const seconds=requested/Math.max(1,average);
  return {type,distanceMeters:requested,properSeconds:seconds,coordinateSeconds:seconds,dilationSeconds:0,peakSpeed:requested?Math.max(peak,initialSpeed,finalSpeed):0,peakRapidity:0,accelerationMetersPerSecondSquared:0,warpFactor,initialSpeed,finalSpeed,velocityControls};
 }
 // For a straight leg the body rotates with the engine off. A short
 // coasting distance is included in the clocks, symmetrically about the
 // speed-matching flip point. Near the stopping limit that distance shrinks.
 // Reach the circular speed before contact, with enough proper time for the
 // attitude jets to turn the braking hull prograde on the incoming tangent.
 // If a very short hop needs all its distance to brake, turn after capture.
 if(options.parkingArrival&&finalSpeed>0&&finalSpeed<c){
  const gamma=Math.cosh(rapidityFor(finalSpeed)),turnSeconds=8;
  const duration=turnSeconds*gamma,coastMeters=duration*finalSpeed;
  if(requested-coastMeters>minimumTransferDistance(initialSpeed,finalSpeed)){
   const approach=estimateTransfer(requested-coastMeters,type,requestedWarp,{...options,parkingArrival:false});
   if(approach.downRapidity>1e-12&&approach.coast){
    const lag=turnSeconds*gammaExcess(approach.finalRapidity);
    return {...approach,parkingApproach:approach,parkingCoast:{meters:coastMeters,seconds:duration,properSeconds:turnSeconds,viewSeconds:4.5,lag},
     distanceMeters:requested,properSeconds:approach.properSeconds+turnSeconds,coordinateSeconds:approach.coordinateSeconds+duration,dilationSeconds:approach.dilationSeconds+lag};
   }
  }
 }
 if(options.flipCoast&&requested>0){
  const minimum=minimumTransferDistance(initialSpeed,finalSpeed);
  if(requested<minimum-Math.max(1e-8,16*Number.EPSILON*minimum))return {error:'Insufficient distance to match parking speed at 1g.',minimumDistanceMeters:minimum};
  const coast=Math.max(0,(requested-minimum)*.018);
  if(coast>Math.max(1e-9,requested*1e-13)){
   const burnPlan=estimateTransfer(requested-coast,'shuttle',requestedWarp,{initialSpeed,finalSpeed});
   const peak=sampleTransfer(burnPlan,burnPlan.upRapidity/(burnPlan.upRapidity+burnPlan.downRapidity));
   const coastT=coast/burnPlan.peakSpeed,coastTau=coastT/Math.cosh(burnPlan.peakRapidity),coastLag=coastTau*gammaExcess(burnPlan.peakRapidity);
   return {...burnPlan,burnPlan,peak,coast,coastT,coastTau,coastLag,distanceMeters:requested,properSeconds:burnPlan.properSeconds+coastTau,coordinateSeconds:burnPlan.coordinateSeconds+coastT,dilationSeconds:burnPlan.dilationSeconds+coastLag};
  }
 }
 // Integrate two constant-proper-acceleration rapidity intervals. The planner
 // lengthens too-short paths to the stopping distance instead of teleporting
 // away a moving ship's kinetic state. cosh(eta)-1 avoids low-speed loss.
 const initialRapidity=rapidityFor(initialSpeed),finalRapidity=rapidityFor(finalSpeed),minimumDistanceMeters=minimumTransferDistance(initialSpeed,finalSpeed),distance=Math.max(requested,minimumDistanceMeters),g0=gammaExcess(initialRapidity),gf=gammaExcess(finalRapidity);
 const peakRapidity=2*Math.asinh(Math.sqrt(Math.max(0,(distance*a/(c*c)+g0+gf)*.25))),upRapidity=Math.max(0,peakRapidity-initialRapidity),downRapidity=Math.max(0,peakRapidity-finalRapidity),properSeconds=clockScale*(upRapidity+downRapidity),coordinateSeconds=clockScale*(2*Math.sinh(peakRapidity)-Math.sinh(initialRapidity)-Math.sinh(finalRapidity)),dilationSeconds=clockScale*(2*sinhExcess(peakRapidity)-sinhExcess(initialRapidity)-sinhExcess(finalRapidity));
 return {type:'shuttle',distanceMeters:distance,properSeconds,coordinateSeconds:Math.max(0,coordinateSeconds),dilationSeconds:Math.max(0,dilationSeconds),peakSpeed:speedAt(peakRapidity),peakRapidity,initialRapidity,finalRapidity,upRapidity,downRapidity,initialSpeed:speedAt(initialRapidity),finalSpeed:speedAt(finalRapidity),minimumDistanceMeters,accelerationMetersPerSecondSquared:a,warpFactor:0};
}
function scalarBezier(values,u){const q=[...values];for(let n=q.length-1;n>0;n--)for(let i=0;i<n;i++)q[i]+=(q[i+1]-q[i])*u;return q[0];}
// Inverse-dynamics spiral in the scene's fixed parking plane. Choose a smooth
// radius and positive circular *tangential* speed. The radial velocity and
// both components of acceleration come from differentiating that same path.
// This is a powered Newtonian trajectory, not an impulsive Hohmann transfer.
const SPIRAL_BINS=96;
const spiralEase=u=>u*u*u*(10+u*(-15+6*u));
const spiralSlope=u=>30*u*u*(1-u)*(1-u);
const spiralCurvature=u=>60*u*(1-u)*(1-2*u);
function spiralKinematics(p,u){
 const L=p.logRatio,lr=u<=.5?L*spiralEase(u):-L*spiralEase(1-u);
 const r=u<=.5?p.ra*Math.exp(lr):p.rb*Math.exp(lr);
 const vt=Math.sqrt(p.mu/r),T=p.coordinateSeconds,k=L*spiralSlope(u)/T,vr=r*k;
 const radialDrive=r*(k*k+L*spiralCurvature(u)/(T*T)),tangential=.5*vt*k;
 const g=p.mu/(r*r),e=p.height/r,atten=Math.exp(-1.5*Math.log1p(e*e));
 // In an elevated plane maintaining the reference circle already needs
 // support: Newtonian gravity points to the body, not to the circle's center.
 const steadyRadial=g*Math.expm1(-1.5*Math.log1p(e*e)),steadyNormal=g*e*atten;
 return {r,vt,vr,omega:vt/r,speed:Math.hypot(vr,vt),radialDrive,tangential,steadyRadial,steadyNormal,g};
}
const lagRate=v=>{const b=v/c;return b*b/(1+Math.sqrt((1-b)*(1+b)));};
// Integrated angle, actual path length, and SR clock deficit. Accumulate the
// deficit directly rather than subtracting almost equal clocks at low speeds.
function spiralIntegral(p,u0,u1){
 const mid=(u0+u1)/2,half=(u1-u0)/2,dx=half*.7745966692414834;
 const f0=spiralKinematics(p,mid-dx),fm=spiralKinematics(p,mid),f1=spiralKinematics(p,mid+dx);
 const w=(u1-u0)*p.coordinateSeconds/18;
 return [w*(5*(f0.omega+f1.omega)+8*fm.omega),w*(5*(f0.speed+f1.speed)+8*fm.speed),w*(5*(lagRate(f0.speed)+lagRate(f1.speed))+8*lagRate(fm.speed))];
}
export function circularRadiusPlan(ra,rb,mu,height=0){
 if(!(ra>0&&rb>0&&mu>0&&ra!==rb&&Number.isFinite(height)))return {error:'A radius change needs two distinct circular orbits.'};
 const v0=Math.sqrt(mu/ra),v1=Math.sqrt(mu/rb);
 if(!(Math.max(v0,v1)<c))return {error:'This circular track would require a speed at or above light speed.'};
 const rel=(rb-ra)/ra,logRatio=Math.abs(rel)<.5?Math.log1p(rel):Math.log(rb/ra);
 const p={type:'shuttle',radiusTransfer:true,ra,rb,mu,height,logRatio,initialSpeed:v0,finalSpeed:v1,warpFactor:0,outward:rb>ra,accelerationMetersPerSecondSquared:a,coordinateSeconds:1};
 const floorRadius=Math.min(ra,rb),z=Math.abs(height),steadyBound=r=>{
  const e=z/r,h=mu/(r*r),alpha=-1.5*Math.log1p(e*e);
  return Math.hypot(h*Math.expm1(alpha),mu*z/Math.hypot(r,z)**3);
 };
 const feasible=steadyBound(floorRadius)<a;
 // Bound each time derivative over every bin, rather than merely sampling the
 // peak thrust. |S''| <= 10/sqrt(3); S' is monotone on either side of 1/2.
 // If the steady parking demand is itself over budget, keep the diagnostic
 // flythrough available; its required support remains visible and uncapped.
 let T=1;
 for(let i=0;i<SPIRAL_BINS;i++){
  const u0=i/SPIRAL_BINS,u1=(i+1)/SPIRAL_BINS,lo=spiralKinematics(p,u0),hi=spiralKinematics(p,u1);
  const rmax=Math.max(lo.r,hi.r),rmin=Math.min(lo.r,hi.r),vt=Math.max(lo.vt,hi.vt);
  const k=Math.abs(logRatio)*Math.max(spiralSlope(u0),spiralSlope(u1));
  const K=Math.max(Math.abs(spiralCurvature(u0)),Math.abs(spiralCurvature(u1)),...[.5-1/(2*Math.sqrt(3)),.5+1/(2*Math.sqrt(3))].filter(x=>x>u0&&x<u1).map(x=>Math.abs(spiralCurvature(x))));
  const B=.5*vt*k,A=rmax*(k*k+Math.abs(logRatio)*K),available=feasible?a-steadyBound(rmin):a;
  const b=B/available,ar=A/available;
  T=Math.max(T,Math.sqrt(.5*(b*b+Math.hypot(b*b,2*ar))),rmax*k/Math.sqrt((c-vt)*(c+vt)));
 }
 p.coordinateSeconds=T*(1+1e-9);p.nominallyFeasible=feasible;
 const rows=p.spiralTable=[[0,0,0]];
 for(let i=0;i<SPIRAL_BINS;i++){const d=spiralIntegral(p,i/SPIRAL_BINS,(i+1)/SPIRAL_BINS),last=rows[i];rows.push(d.map((v,j)=>last[j]+v));}
 const end=rows.at(-1);p.distanceMeters=end[1];p.dilationSeconds=end[2];p.properSeconds=p.coordinateSeconds-end[2];return p;
}
// Reserve a short real circular coast on each side of a conventional radius
// change. The attitude jets can turn the hull as the ship continues orbiting.
export function radiusSlewPlan(spiral){
 const seconds=4,entry=sampleCircularRadius(spiral,0),exit=sampleCircularRadius(spiral,1);
 // Holding a displaced plane during engine-off alignment requires side jets.
 // The close-approach controller rates those jets at 0.012 m/s² per axis.
 if(Math.max(entry.requiredSupportG,exit.requiredSupportG)*a>.012)return {error:'This elevated circle requires more station-keeping thrust than the attitude jets can supply during alignment. Choose a larger radius or a lower flight plane.'};
 const coast=(s)=>({angle:seconds*s.tangentialVelocity/s.radius,distance:seconds*s.tangentialVelocity,lag:seconds*lagRate(s.tangentialVelocity)});
 const first=coast(entry),last=coast(exit);
 return {...spiral,spiral,coastSeconds:seconds,first,last,coordinateSeconds:spiral.coordinateSeconds+2*seconds,
  properSeconds:spiral.properSeconds+2*seconds-first.lag-last.lag,dilationSeconds:spiral.dilationSeconds+first.lag+last.lag,
  distanceMeters:spiral.distanceMeters+first.distance+last.distance};
}
function sampleRadiusSlew(p,u){
 const seconds=u*p.coordinateSeconds,T=p.spiral.coordinateSeconds,dt=p.coastSeconds;
 const inner=clamp01((seconds-dt)/T),entry=clamp01(seconds/dt),exit=clamp01((seconds-dt-T)/dt);
 const s=sampleCircularRadius(p.spiral,inner);
 s.angle+=entry*p.first.angle+exit*p.last.angle;
 s.distanceMeters+=entry*p.first.distance+exit*p.last.distance;
 s.dilationSeconds+=entry*p.first.lag+exit*p.last.lag;
 s.coordinateSeconds=seconds;s.properSeconds=seconds-s.dilationSeconds;
 s.distanceFraction=clamp01(s.distanceMeters/p.distanceMeters);s.fraction=clamp01(s.properSeconds/p.properSeconds);
 // During each coast only the steady support of an elevated parking plane
 // is needed. On an ordinary central orbit the main engine is off.
 s.burnFraction=inner;
 if(seconds<=dt||seconds>=T+dt){
  s.slew=seconds<=dt?entry:1-exit;
  s.phase=seconds<=dt?'Orienting for radius change':'Aligning with parking orbit';
 }
 return s;
}
export function sampleCircularRadius(p,fraction){
 if(p.spiral)return sampleRadiusSlew(p,clamp01(fraction));
 if(p.kerr)return sampleKerrRadius(p,fraction);
 const u=clamp01(fraction),m=spiralKinematics(p,u),i=Math.min(SPIRAL_BINS,Math.floor(u*SPIRAL_BINS)),u0=i/SPIRAL_BINS,base=p.spiralTable[i];
 const d=u===u0?base:spiralIntegral(p,u0,u).map((v,j)=>v+base[j]);
 const [angle,distance,lag]=d,t=p.coordinateSeconds*u,tau=t-lag;
 const radialThrust=m.radialDrive+m.steadyRadial,normalThrust=m.steadyNormal,requiredSupportG=Math.hypot(radialThrust,m.tangential,normalThrust)/a;
 const ar=m.radialDrive-m.g,at=m.tangential;
 return {angle,radius:m.r,properSeconds:tau,coordinateSeconds:t,dilationSeconds:lag,fraction:clamp01(tau/p.properSeconds),distanceFraction:clamp01(distance/p.distanceMeters),distanceMeters:distance,
  speedMetersPerSecond:m.speed,radialVelocity:m.vr,tangentialVelocity:m.vt,radialAcceleration:ar,tangentialAcceleration:at,radialThrust,tangentialThrust:at,normalThrust,steadySupportRadial:m.steadyRadial,steadySupportNormal:m.steadyNormal,maneuverRadialThrust:m.radialDrive,
  radialAccelerationG:ar/a,tangentialAccelerationG:at/a,accelerationG:Math.hypot(ar,at)/a,requiredSupportG,rapidity:rapidityFor(m.speed),lorentzFactor:Math.cosh(rapidityFor(m.speed)),
  accelerationSign:Math.sign(at),turnAngle:0,commandedThrustG:Math.min(1,requiredSupportG),
  phase:p.outward?'Raising orbit':'Lowering orbit',phaseIndex:p.outward?1:3};
}
function circularSampleAt(p,fraction,key,total){
 if(fraction===0||fraction===1)return sampleCircularRadius(p,fraction);
 let lo=0,hi=1;for(let i=0;i<45;i++){const u=(lo+hi)/2;if(sampleCircularRadius(p,u)[key]<fraction*total)lo=u;else hi=u;}
 return sampleCircularRadius(p,(lo+hi)/2);
}
function parkingCoastSample(plan,progress){
 const u=clamp01(progress),burn=plan.parkingApproach,coast=plan.parkingCoast;
 const properSeconds=burn.properSeconds+coast.properSeconds*u,remainingFraction=(1-u)*coast.meters/plan.distanceMeters;
 return {fraction:properSeconds/plan.properSeconds,distanceFraction:1-remainingFraction,remainingFraction,
  distanceMeters:plan.distanceMeters-(1-u)*coast.meters,speedMetersPerSecond:plan.finalSpeed,
  properSeconds,coordinateSeconds:burn.coordinateSeconds+coast.seconds*u,dilationSeconds:burn.dilationSeconds+coast.lag*u,
  rapidity:plan.finalRapidity,lorentzFactor:Math.cosh(plan.finalRapidity),accelerationSign:0};
}
export function sampleTransfer(plan,fraction){
 const u=clamp01(fraction),distance=plan?.distanceMeters||0;
 if(plan?.radiusTransfer)return circularSampleAt(plan,u,'properSeconds',plan.properSeconds);
 if(!(distance>0))return {fraction:u,distanceFraction:u,distanceMeters:0,speedMetersPerSecond:u===0?plan?.initialSpeed||0:plan?.finalSpeed||0,properSeconds:0,coordinateSeconds:0,dilationSeconds:0,rapidity:0,lorentzFactor:1,accelerationSign:0};
 if(plan.parkingApproach){
  const burn=plan.parkingApproach,elapsed=u*plan.properSeconds;
  if(elapsed>=burn.properSeconds)return parkingCoastSample(plan,u===1?1:(elapsed-burn.properSeconds)/plan.parkingCoast.properSeconds);
  const sample=sampleTransfer(burn,elapsed/burn.properSeconds);
  return {...sample,fraction:u,distanceFraction:sample.distanceMeters/distance};
 }
 if(plan.burnPlan){
  const proper=u*plan.properSeconds,peak=plan.peak,coastElapsed=proper-peak.properSeconds,after=coastElapsed>=plan.coastTau;
  if(coastElapsed>0&&!after){const f=coastElapsed/plan.coastTau,x=peak.distanceMeters+plan.coast*f;return {...peak,fraction:u,distanceFraction:x/distance,distanceMeters:x,properSeconds:proper,coordinateSeconds:peak.coordinateSeconds+plan.coastT*f,dilationSeconds:peak.dilationSeconds+plan.coastLag*f,accelerationSign:0};}
  const sample=sampleTransfer(plan.burnPlan,(proper-(after?plan.coastTau:0))/plan.burnPlan.properSeconds),x=u===1?distance:sample.distanceMeters+(after?plan.coast:0);
  return {...sample,fraction:u,distanceFraction:x/distance,distanceMeters:x,properSeconds:proper,coordinateSeconds:sample.coordinateSeconds+(after?plan.coastT:0),dilationSeconds:sample.dilationSeconds+(after?plan.coastLag:0)};
 }
 if(plan.type==='enterprise'){
  if(plan.cruiseSpeed!==undefined||plan.rejoinCruise!==undefined){
   // Analytic integral of a seventh-degree speed ramp. Four zero powers at
   // rest make even the displayed warp factor (proportional to v^0.3) smooth.
   const cruise=plan.cruiseSpeed??plan.rejoinCruise,T=plan.coordinateSeconds,span=plan.rampFraction??.3;
   const ramp=(t,v)=>{const s=t**4*(35+t*(-84+t*(70-20*t))),integral=t**5*(7+t*(-14+t*(10-2.5*t)));
    return [v+(cruise-v)*s,span*T*(v*t+(cruise-v)*integral)];};
   let speed,x,remaining,sign=0;
   if(u<span){[speed,x]=ramp(u/span,plan.initialSpeed);sign=Math.sign(cruise-plan.initialSpeed);}
   else if(u>1-span){[speed,remaining]=ramp((1-u)/span,plan.finalSpeed);x=distance-remaining;sign=Math.sign(plan.finalSpeed-cruise);}
   else{speed=cruise;x=T*(span*.5*(plan.initialSpeed+cruise)+(u-span)*cruise);}
   return {fraction:u,distanceFraction:clamp01(x/distance),remainingFraction:remaining===undefined?1-x/distance:remaining/distance,distanceMeters:x,speedMetersPerSecond:speed,properSeconds:u*T,coordinateSeconds:u*T,dilationSeconds:0,rapidity:0,lorentzFactor:1,accelerationSign:sign};
  }
  const velocity=plan.velocityControls||[0,0,plan.peakSpeed*8/3,0,0],integral=[0];for(const v of velocity)integral.push(integral.at(-1)+v/velocity.length);
  const distanceFraction=u===0?0:u===1?1:scalarBezier(integral,u)/(integral.at(-1)||1),seconds=u*plan.coordinateSeconds;
  return {fraction:u,distanceFraction,distanceMeters:distance*distanceFraction,speedMetersPerSecond:scalarBezier(velocity,u),properSeconds:seconds,coordinateSeconds:seconds,dilationSeconds:0,rapidity:0,lorentzFactor:1,accelerationSign:u===0||u===.5||u===1?0:u<.5?1:-1};
 }
 const eta0=plan.initialRapidity||0,etaf=plan.finalRapidity||0,up=plan.upRapidity??plan.peakRapidity,total=up+(plan.downRapidity??plan.peakRapidity),elapsed=u*total,outward=elapsed<=up,rapidity=Math.max(0,outward?eta0+elapsed:plan.peakRapidity-(elapsed-up));
 const initialGamma=gammaExcess(eta0),finalGamma=gammaExcess(etaf),x=outward?c*c/a*(gammaExcess(rapidity)-initialGamma):distance-c*c/a*(gammaExcess(rapidity)-finalGamma),distanceFraction=u===0?0:u===1?1:Math.max(0,Math.min(1,x/distance));
 const localCoordinate=clockScale*(Math.sinh(rapidity)-Math.sinh(outward?eta0:etaf)),localDifference=clockScale*(sinhExcess(rapidity)-sinhExcess(outward?eta0:etaf));
 return {fraction:u,distanceFraction,distanceMeters:distance*distanceFraction,speedMetersPerSecond:u===0?plan.initialSpeed||0:u===1?plan.finalSpeed||0:speedAt(rapidity),properSeconds:u*plan.properSeconds,coordinateSeconds:outward?localCoordinate:plan.coordinateSeconds-localCoordinate,dilationSeconds:Math.max(0,outward?localDifference:plan.dilationSeconds-localDifference),rapidity,lorentzFactor:Math.cosh(rapidity),accelerationSign:u===0||u===1?0:outward?1:-1};
}

// Time spent on camera is independent of the physical 1 g clock.
export const TRANSFER_WALL_SECONDS=10;
export const HALF_TURN_SECONDS=3;
export const transferEase=x=>{const u=clamp01(x);return u*u*u*(10+u*(-15+6*u));};
export const TRANSFER_PHASES=['Leaving orbit','Accelerating','Flip and burn','Decelerating','Entering orbit'];
const shots=[0,.29,.39,.61,.71,1];
// Cache a small monotone distance-vs-viewing-time spline. On each orbital
// spiral its timing mixes distance and actual changes in tangent: equal
// lengths take more screen time in tight bends than on the uncoiling tail.
function playbackClock(route){
 const hasCurve=route.arc&&route.points,dep=route.points?.departureEndParameter??0,arr=route.points?.arrivalStartParameter??1;
 const first=hasCurve?transferCurveFraction(route,dep):.08,last=hasCurve?transferCurveFraction(route,arr):.92,span=last-first;
 const plan=route.plan,peak=plan?.type==='shuttle'&&plan.upRapidity+plan.downRapidity>0?sampleTransfer(plan,plan.upRapidity/(plan.upRapidity+plan.downRapidity)).distanceFraction:.5;
 const middle=Math.max(first+.05*span,Math.min(last-.05*span,peak)),halfFlip=Math.min(.035*span,(middle-first)*.5,(last-middle)*.5);
 const knots=[[0,0]];
 function spiral(u0,u1,time0,time1,d0,d1){
  if(!hasCurve||u1<=u0||d1<=d0){knots.push([time1,d1]);return;}
  const samples=[];let angle=0,prev=vectorUnit(transferCurveDerivative(route.points,u0));
  for(let i=1;i<=24;i++){const u=u0+(u1-u0)*i/24,tangent=vectorUnit(transferCurveDerivative(route.points,u));angle+=Math.acos(Math.max(-1,Math.min(1,vectorDot(prev,tangent))));prev=tangent;samples.push([angle,transferCurveFraction(route,u)]);}
  for(let i=0;i<samples.length;i++){const [turn,d]=samples[i],f=(d-d0)/(d1-d0),weight=angle>.001?.62*turn/angle+.38*f:f;knots.push(i===23?[time1,d1]:[time0+(time1-time0)*weight,d]);}
 }
 spiral(0,dep,0,shots[1],0,first);
 knots.push([shots[2],middle-halfFlip],[.5,middle],[shots[3],middle+halfFlip],[shots[4],last]);
 spiral(arr,1,shots[4],1,last,1);
 for(let i=0;i<knots.length;i++){const p=knots[i],lo=knots[i-1],hi=knots[i+1],l=lo?(p[1]-lo[1])/(p[0]-lo[0]):0,h=hi?(hi[1]-p[1])/(hi[0]-p[0]):0;
  p[2]=!lo?h:!hi?l:l*h>0?2*l*h/(l+h):0;}
 // Join the on-screen speed of a preceding/following playlist lap. Limit the
 // endpoint slope to the monotonic range when a destination is exceptionally close.
 if(route.orbitLapSeconds>0&&route.arc?.at(-1)>0){
  const scale=2*Math.PI*route.wallSeconds/(route.orbitLapSeconds*route.arc.at(-1));
  for(const [i,j,radius] of [[0,1,route.departureOrbitRadius],[knots.length-1,knots.length-2,route.orbitRadiusMeters]]){
   const p=knots[i],other=knots[j],secant=(p[1]-other[1])/(p[0]-other[0]);if(radius>0)p[2]=Math.max(0,Math.min(radius*scale,secant*2));}
 }
 return knots;
}
// Both adjacent pieces have zero presentation derivative at contact, but
// progress is strictly increasing on the open interval. The ship never
// stops in the physical model. Quintic easing also matches acceleration.
export const arcPlaybackFraction=transferEase;
function straightPlayback(route,progress){
 const u=clamp01(progress),p=route.plan,warp=p?.type==='enterprise';
 if(warp&&(p.cruiseSpeed!==undefined||p.rejoinCruise!==undefined)){
  // The neighboring playlist arc eases its presentation rate to zero at
  // contact. Match that slope on the timed warp leg without stopping the
  // physical ship or changing its arrival speed, proper time or ETA.
  const t=route.endpointClock?transferEase(u):u;
  const sample=sampleTransfer(p,t),sign=sample.accelerationSign;
  return {sample,phaseIndex:sign>0?1:sign<0?3:2,phaseProgress:u,phase:sign>0?'Warp acceleration':sign<0?'Slowing down':'Warp cruise',distanceFraction:sample.distanceFraction,remainingFraction:sample.remainingFraction,commandedThrustG:0,turnAngle:0};
 }
 if(warp)return {phaseIndex:u<.5?1:3,phaseProgress:u,phase:u<.5?'Warp acceleration':'Slowing down',distanceFraction:transferEase(u),remainingFraction:transferEase(1-u),commandedThrustG:0,turnAngle:0};
 if(p.parkingApproach){
  const burn=p.parkingApproach,coast=p.parkingCoast,join=TRANSFER_WALL_SECONDS/(TRANSFER_WALL_SECONDS+coast.viewSeconds);
  if(u>=join){
   const phaseProgress=(u-join)/(1-join),elapsed=phaseProgress*phaseProgress*(3-2*phaseProgress),sample=parkingCoastSample(p,elapsed);
   return {sample,phase:'Aligning for orbit',phaseIndex:4,phaseProgress,distanceFraction:sample.distanceFraction,
    remainingFraction:sample.remainingFraction,commandedThrustG:0,turnAngle:Math.PI*(1-transferEase(elapsed))};
  }
  const shot=straightPlayback({plan:burn},u/join),remaining=(coast.meters+shot.remainingFraction*burn.distanceMeters)/p.distanceMeters;
  return {...shot,distanceFraction:shot.distanceFraction*burn.distanceMeters/p.distanceMeters,remainingFraction:remaining};
 }
 if(!p.coast&&(p.upRapidity<1e-13||p.downRapidity<1e-13)){
  const braking=p.upRapidity<p.downRapidity;
  return {phaseIndex:braking?3:1,phaseProgress:u,phase:braking?'Decelerating':'Accelerating',distanceFraction:transferEase(u),remainingFraction:transferEase(1-u),commandedThrustG:u>=1?0:1,turnAngle:braking?Math.PI:0};
 }
 const peak=p.peak||sampleTransfer(p,p.upRapidity/Math.max(1e-30,p.upRapidity+p.downRapidity));
 const x0=clamp01(peak.distanceMeters/p.distanceMeters),dx=clamp01((p.coast||0)/p.distanceMeters);
 const width=HALF_TURN_SECONDS/TRANSFER_WALL_SECONDS,a=(1-width)/2,b=(1+width)/2,m=dx/(b-a),phaseIndex=u<a?1:u<b?2:3;
 // Quintic Hermite edges meet the linear coast with equal first and
 // second derivatives. During that coast the attitude rotates smoothly
 // around scene up but the direction of motion remains constant.
 const h=t=>t*(1-t)**3*(1+3*t);
 // On interplanetary legs even a tiny fraction of L can span hundreds of
 // kilometres in the last rendered frame. Stretch near-contact screen time;
 // the remap becomes the identity (through second derivative) at the coast.
 const depth=.9*Math.min(1,p.distanceMeters/1e10),contact=t=>t*(1-depth*(1-t)**4*(1+4*t));
 let x,remaining;
 if(u<a){const t=contact(u/a);x=x0*transferEase(t)-a*m*h(1-t);}
 else if(u<b)x=x0+(u-a)*m;
 else {const t=contact((1-u)/(1-b));remaining=clamp01((1-x0-dx)*transferEase(t)-(1-b)*m*(1-t)*t**3*(4-3*t));x=1-remaining;}
 return {phaseIndex,phaseProgress:phaseIndex===1?u/a:phaseIndex===2?(u-a)/(b-a):(u-b)/(1-b),phase:TRANSFER_PHASES[phaseIndex],distanceFraction:clamp01(x),remainingFraction:remaining??1-clamp01(x),commandedThrustG:u>=1||phaseIndex===2?0:1,turnAngle:Math.PI*transferEase((u-a)/(b-a))};
}
export function transferPlayback(route,progress){
 if(route.endpointClock)progress=contactPlaybackProgress(route.endpointClock,progress,u=>baseTransferPlayback(route,u));
 return baseTransferPlayback(route,progress);
}
function baseTransferPlayback(route,progress){
 if(route.straight||route.plan?.burnPlan)return straightPlayback(route,progress);
 const u=clamp01(progress),phaseIndex=u<shots[1]?0:u<shots[2]?1:u<shots[3]?2:u<shots[4]?3:4,phaseProgress=(u-shots[phaseIndex])/(shots[phaseIndex+1]-shots[phaseIndex]);
 const knots=route.playbackClock??=playbackClock(route);let lo=0,hi=knots.length-1;while(hi-lo>1){const mid=(hi+lo)>>1;if(knots[mid][0]<=u)lo=mid;else hi=mid;}
 const a=knots[lo],b=knots[hi],w=b[0]-a[0],t=(u-a[0])/w,v=1-t,dx=b[1]-a[1],x=a[1]+t*(t*(3-2*t)*dx+v*(v*a[2]-t*b[2])*w);
 const warp=(route.craftType||route.type||route.plan?.type)==='enterprise',turnAngle=Math.PI*(transferEase((u-shots[2])/(shots[3]-shots[2]))+transferEase((u-shots[4])/(1-shots[4])));
 return {phaseIndex,phaseProgress,phase:warp?['Leaving orbit','Warp acceleration','Cruising','Slowing down','Entering orbit'][phaseIndex]:TRANSFER_PHASES[phaseIndex],distanceFraction:u===1?1:Math.max(a[1],Math.min(b[1],x)),commandedThrustG:warp||u>=1||phaseIndex===2?0:1,turnAngle:warp?0:turnAngle};
}
// Invert the cheap analytic clock profile, so reshaping presentation time does
// not change the total estimated onboard/reference duration or SR difference.
export function sampleTransferAtDistance(plan,fraction,remainingFraction=1-fraction){
 const d=clamp01(fraction);if(plan?.radiusTransfer)return circularSampleAt(plan,d,'distanceMeters',plan.distanceMeters);if(d===0||remainingFraction<=0||!plan?.distanceMeters)return sampleTransfer(plan,d);
 if(plan.parkingApproach){
  const remaining=remainingFraction*plan.distanceMeters,coast=plan.parkingCoast,burn=plan.parkingApproach;
  if(remaining<=coast.meters)return parkingCoastSample(plan,1-remaining/coast.meters);
  const sample=sampleTransferAtDistance(burn,d*plan.distanceMeters/burn.distanceMeters,(remaining-coast.meters)/burn.distanceMeters);
  return {...sample,fraction:sample.properSeconds/plan.properSeconds,distanceFraction:d,remainingFraction};
 }
 if(plan.burnPlan){
  const x=d*plan.distanceMeters,start=plan.peak.distanceMeters,after=x>=start+plan.coast;
  if(after){
   const tail=remainingFraction*plan.distanceMeters/plan.burnPlan.distanceMeters,burn=sampleTransferAtDistance(plan.burnPlan,1-tail,tail);
   const proper=burn.properSeconds+plan.coastTau;
   return {...burn,fraction:proper/plan.properSeconds,distanceFraction:d,distanceMeters:x,properSeconds:proper,coordinateSeconds:burn.coordinateSeconds+plan.coastT,dilationSeconds:burn.dilationSeconds+plan.coastLag};
  }
  const proper=x>=start?plan.peak.properSeconds+(x-start)/plan.coast*plan.coastTau:sampleTransferAtDistance(plan.burnPlan,x/plan.burnPlan.distanceMeters).properSeconds;
  return {...sampleTransfer(plan,proper/plan.properSeconds),distanceFraction:d,distanceMeters:x};
 }
 if(plan.type==='enterprise'){let lo=0,hi=1;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(sampleTransfer(plan,mid).distanceFraction<d)lo=mid;else hi=mid;}return {...sampleTransfer(plan,(lo+hi)/2),distanceFraction:d,distanceMeters:d*plan.distanceMeters};}
 const eta0=plan.initialRapidity||0,etaf=plan.finalRapidity||0,up=plan.upRapidity??plan.peakRapidity,down=plan.downRapidity??plan.peakRapidity,peakDistance=c*c/a*(gammaExcess(plan.peakRapidity)-gammaExcess(eta0)),x=d*plan.distanceMeters,outward=x<=peakDistance;
 const g=(outward?gammaExcess(eta0)+x*a/(c*c):gammaExcess(etaf)+remainingFraction*plan.distanceMeters*a/(c*c)),eta=2*Math.asinh(Math.sqrt(Math.max(0,g)*.5)),elapsed=outward?eta-eta0:up+plan.peakRapidity-eta;
 return {...sampleTransfer(plan,elapsed/Math.max(1e-30,up+down)),distanceFraction:d,distanceMeters:x};
}
// de Casteljau evaluates cubic legacy curves and degree-seven orbit blends.
// A single numeric workspace avoids thousands of tiny temporary arrays per
// transfer frame. Evaluation is synchronous; returned vectors own their data.
let curveWorkspace=new Float64Array(24);
function evaluateCurve(points,t,derivative=false){
 const n=points.length-(derivative?1:0),size=n*3;if(curveWorkspace.length<size)curveWorkspace=new Float64Array(size);const q=curveWorkspace;
 for(let i=0;i<n;i++)for(let j=0;j<3;j++)q[i*3+j]=derivative?n*(points[i+1][j]-points[i][j]):points[i][j];
 for(let k=n-1;k>0;k--)for(let i=0;i<k;i++)for(let j=0;j<3;j++){const at=i*3+j;q[at]+=(q[at+3]-q[at])*t;}
 return [q[0],q[1],q[2]];
}
function compositeSegment(points,t){const n=points.segments.length,u=clamp01(t)*n,index=Math.min(n-1,Math.floor(u));return {points:points.segments[index],t:u-index,scale:n};}
export function transferCurvePoint(points,t){if(points.segments){const part=compositeSegment(points,t);return evaluateCurve(part.points,part.t);}return evaluateCurve(points,t);}
export function transferCurveDerivative(points,t){if(points.segments){const part=compositeSegment(points,t);return evaluateCurve(part.points,part.t,true).map(v=>v*part.scale);}return evaluateCurve(points,t,true);}
// The local departure/insertion legs are clothoids: curvature changes linearly
// with distance from circular-orbit curvature 1/R to zero. Five-point quadrature
// is used only while planning; runtime follows cached quintic polynomial pieces.
// Each leg turns between one and two revolutions and ends tangent to the transit leg.
const vectorAdd=(a,b)=>a.map((v,i)=>v+b[i]),vectorSub=(a,b)=>a.map((v,i)=>v-b[i]),vectorScale=(a,s)=>a.map(v=>v*s),vectorDot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),vectorUnit=a=>vectorScale(a,1/(Math.hypot(...a)||1));
function quinticPose(p0,p1,v0,v1,a0,a1){return [p0,vectorAdd(p0,vectorScale(v0,.2)),vectorAdd(vectorAdd(p0,vectorScale(v0,.4)),vectorScale(a0,.05)),vectorAdd(vectorSub(p1,vectorScale(v1,.4)),vectorScale(a1,.05)),vectorSub(p1,vectorScale(v1,.2)),p1];}
function spiralLeg(start,center,forward,toward){
 const radial=vectorSub(start,center),radius=Math.hypot(...radial),tangent=vectorUnit(forward),inward=vectorUnit(vectorSub(vectorScale(radial,-1),vectorScale(tangent,-vectorDot(radial,tangent))));
 if(!(radius>0))return null;
 if(Math.abs(vectorDot(vectorUnit(radial),tangent))>.05){
  // A moon's inertial velocity includes the motion of its parent planet.
  // Keep that exact departure tangent, but turn within the local parking
  // clearance before handing off to an orbital spiral. A system-sized first
  // control handle would otherwise cut through the moon before bending away.
  const outward=vectorUnit(radial),projection=vectorSub(tangent,vectorScale(outward,vectorDot(tangent,outward))),side=Math.hypot(...projection)>1e-8?vectorUnit(projection):vectorUnit(Math.abs(outward[1])<.9?[-outward[2],0,outward[0]]:[0,outward[2],-outward[1]]),angle=.12,nextRadius=radius*1.12,nextRadial=vectorAdd(vectorScale(outward,Math.cos(angle)),vectorScale(side,Math.sin(angle))),next=vectorAdd(center,vectorScale(nextRadial,nextRadius)),nextTangent=vectorAdd(vectorScale(side,Math.cos(angle)),vectorScale(outward,-Math.sin(angle))),initialLength=radius*.035,finalLength=radius*.15;
  const connector=quinticPose(start,next,vectorScale(tangent,initialLength),vectorScale(nextTangent,finalLength),[0,0,0],vectorScale(nextRadial,-finalLength*finalLength/nextRadius)),rest=spiralLeg(next,center,nextTangent,toward);
  return rest?{...rest,segments:[connector,...rest.segments],turn:rest.turn+angle}:null;
 }
 const desired=vectorUnit(vectorSub(toward,start));let turn=Math.atan2(vectorDot(desired,inward),vectorDot(desired,tangent));if(turn<0)turn+=Math.PI*2;turn=Math.min(Math.PI*3.6,Math.PI*2+turn);
 const length=2*radius*turn,count=16,ds=length/count,segments=[];
 const pose=s=>{const angle=s/radius-s*s/(2*radius*length),sn=Math.sin(angle),cs=Math.cos(angle);return {t:vectorAdd(vectorScale(tangent,cs),vectorScale(inward,sn)),n:vectorAdd(vectorScale(inward,cs),vectorScale(tangent,-sn)),k:(1-s/length)/radius};};
 let position=[...start];for(let i=0;i<count;i++){const lo=i*ds,hi=(i+1)*ds,mid=(lo+hi)*.5,half=ds*.5,step=[0,0,0];for(let j=0;j<5;j++){const direction=pose(mid+half*GAUSS_X[j]).t;for(let k=0;k<3;k++)step[k]+=direction[k]*GAUSS_W[j]*half;}const next=vectorAdd(position,step),a=pose(lo),b=pose(hi);segments.push(quinticPose(position,next,vectorScale(a.t,ds),vectorScale(b.t,ds),vectorScale(a.n,a.k*ds*ds),vectorScale(b.n,b.k*ds*ds)));position=next;}
 return {segments,end:position,tangent:pose(length).t,turn};
}
export function orbitTransferPath({start,end,startCenter,startTangent,endCenter,endTangent,lift=[0,0,0]}){
 const departure=startCenter?spiralLeg(start,startCenter,startTangent,end):null,arrival=endCenter?spiralLeg(end,endCenter,vectorScale(endTangent,-1),start):null,p0=departure?.end||start,p1=arrival?.end||end,t0=departure?.tangent||startTangent,t1=arrival?vectorScale(arrival.tangent,-1):endTangent,delta=vectorSub(p1,p0),handle=Math.hypot(...delta)*.65;
 // Zero endpoint curvature makes this middle blend C2 in arc length at both
 // clothoid joins, even when the two orbital planes are inclined differently.
 const middle=[p0,vectorAdd(p0,vectorScale(t0,handle/7)),vectorAdd(p0,vectorScale(t0,2*handle/7)),vectorAdd(vectorAdd(p0,vectorScale(delta,.28)),lift),vectorAdd(vectorAdd(p0,vectorScale(delta,.72)),lift),vectorSub(p1,vectorScale(t1,2*handle/7)),vectorSub(p1,vectorScale(t1,handle/7)),p1];
 const departureCount=departure?.segments.length||0,arrivalCount=arrival?.segments.length||0,count=departureCount+1+arrivalCount;
 return {segments:[...(departure?.segments||[]),middle,...(arrival?.segments.slice().reverse().map(segment=>segment.slice().reverse())||[])],departureEndParameter:departureCount/count,arrivalStartParameter:(departureCount+1)/count,departureTurns:(departure?.turn||0)/(Math.PI*2),arrivalTurns:(arrival?.turn||0)/(Math.PI*2)};
}
const curvePoint=transferCurvePoint,curveDerivative=transferCurveDerivative;
// Five-point Gaussian quadrature and three bounded Newton iterations eliminate
// the velocity steps from linearly interpolating a sparse arc-length table.
const GAUSS_X=[0,-.5384693101056831,.5384693101056831,-.906179845938664,.906179845938664],GAUSS_W=[.5688888888888889,.4786286704993665,.4786286704993665,.2369268850561891,.2369268850561891];
function curveLength(p,lo,hi){const half=(hi-lo)*.5,mid=(hi+lo)*.5;let n=0;for(let i=0;i<5;i++)n+=GAUSS_W[i]*Math.hypot(...curveDerivative(p,mid+half*GAUSS_X[i]));return n*half;}
export function buildTransferCurve(points){const arc=[0],segments=points.segments?points.segments.length*8:64;for(let i=0;i<segments;i++)arc.push(arc[i]+curveLength(points,i/segments,(i+1)/segments));return {points,arc,length:arc.at(-1)};}
export function sampleTransferCurve(curve,fraction){
 const u=clamp01(fraction),arc=curve.arc,n=arc.length-1,total=arc[n],distance=u*total;let low=0,high=n;
 while(high-low>1){const mid=(low+high)>>1;if(arc[mid]<=distance)low=mid;else high=mid;}
 const lo=low/n,hi=high/n,span=arc[high]-arc[low];let t=span>0?lo+(hi-lo)*(distance-arc[low])/span:lo;
 for(let i=0;i<3;i++){const speed=Math.hypot(...curveDerivative(curve.points,t));if(speed>0)t=Math.max(lo,Math.min(hi,t-(arc[low]+curveLength(curve.points,lo,t)-distance)/speed));}
 if(u===0)t=0;if(u===1)t=1;const tangent=curveDerivative(curve.points,t),length=Math.hypot(...tangent)||1;
 return {position:curvePoint(curve.points,t),tangent:tangent.map(v=>v/length),parameter:t};
}

// Exact partial arc length within one cached interval; useful for a magnified
// path overlay where even a tiny fraction of an AU would miss the spacecraft.
export function transferCurveFraction(curve,parameter){const t=clamp01(parameter),n=curve.arc.length-1,i=Math.min(n-1,Math.floor(t*n)),total=curve.arc[n];return total>0?(curve.arc[i]+curveLength(curve.points,i/n,t))/total:0;}
