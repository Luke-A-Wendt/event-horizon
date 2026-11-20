import {metricNumber} from './metric-units.js';
import {accumulateCrewExposure} from './crew-load.js';
// Clock telemetry is integrated over the subject’s modeled journey, independent of camera time.
// The clock reference is at infinity. Use the Kerr lapse for an observer
// rotating with the local inertial frame; independent sources multiply as
// an approximation. A prescribed spacecraft velocity is relative to that frame.
export const CLOCK_LIGHT_SPEED=299792458;
export const CLOCK_SOLAR_GM=1.32712440018e20;
export const CLOCK_HORIZON_EPSILON=16*Number.EPSILON;
export const CLOCK_MAX_SECONDS=1e300;
const MAX_RAPIDITY=300,MAX_RATE=1e150;
export const compactExteriorRadius=(horizon,bodyRadius=0)=>horizon*(1+CLOCK_HORIZON_EPSILON)+2*Math.max(0,bodyRadius);
export const CLOCK_TYPES=Object.freeze(['astronaut','shuttle','iss','habitat']);
export const supportsObjectClock=type=>CLOCK_TYPES.includes(type);
// Extra crewed models carry timepieces without inheriting Shuttle collision or guidance rules.
export const hasOnboardClock=type=>supportsObjectClock(type)||['enterprise','classicEnterprise','heritageShuttle','heighliner'].includes(type);
export const PROTECTED_CLOCK_RATE=Object.freeze({protectedClock:true,rateFactor:1,gravityFactor:1,kinematicFactor:1,properRate:1,lossRate:0,gravityExcess:0,kinematicExcess:0,gravityLossRate:0,kinematicLossRate:0,crewLoadG:0});
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const boundedRate=v=>Math.max(1,Math.min(MAX_RATE,Number.isFinite(v)?v:MAX_RATE));
const rapidity=clock=>finiteVector(clock?.rapidityVector)?clock.rapidityVector:[0,0,0];
const gamma=eta=>Math.cosh(Math.min(MAX_RAPIDITY,Math.hypot(...eta)));
const gammaExcess=eta=>2*Math.sinh(Math.min(MAX_RAPIDITY,Math.hypot(...eta))*.5)**2;
// Display a Newtonian field-plus-command estimate in the scene's Cartesian axes.
// It is not an accelerometer reading: the crew in an unpowered orbit is weightless.
export function crewAccelerationG(position,sources,thrust=[0,0,0],self=null){
 const net=thrust.slice();
 for(const source of sources){
  if(source.id===self||!(source.massSolar>0))continue;
  const d=source.positionMeters.map((p,i)=>p-position[i]),r=Math.max(1,Math.hypot(...d),source.radiusMeters||0);
  const factor=CLOCK_SOLAR_GM*source.massSolar/(9.80665*r*r*r);
  for(let i=0;i<3;i++)net[i]+=d[i]*factor;
 }
 return Math.hypot(...net);
}
// For circular motion, v_coordinate=r*dphi/dt and v_local=v_coordinate/lapse.
// Where the authored angular speed is not timelike, use it instead as a local
// prescribed speed. Such near-horizon tracks are not circular geodesics.
export function circularClockRate(rate,coordinateSpeed,useLocalSpeed=false){
 const b=Math.abs(coordinateSpeed)/CLOCK_LIGHT_SPEED,local=b*rate.gravityFactor;
 const prescribed=useLocalSpeed||local>=1,beta=Math.min(1-8*Number.EPSILON,prescribed?b:local);
 const eta=Math.atanh(beta),excess=2*Math.sinh(.5*eta)**2,kinematicFactor=1+excess;
 const rateFactor=boundedRate(rate.gravityFactor*kinematicFactor),properRate=1/rateFactor;
 return {...rate,localSpeedMetersPerSecond:beta*CLOCK_LIGHT_SPEED,rateFactor,properRate,lossRate:1-properRate,kinematicFactor,kinematicExcess:excess,kinematicLossRate:1-1/kinematicFactor,orbitalClock:true,prescribedSpeedFallback:!useLocalSpeed&&prescribed,localSpeedPrescribed:useLocalSpeed};
}
// Outside the Schwarzschild ISCO, r*dphi/dt=sqrt(GM/r) describes a
// geodesic. Between 6M and 4M blend to the authored local speed before
// reaching the photon orbit. Kerr parking paths use a prescribed ZAMO speed.
// Their coordinate angular rate includes both lapse and frame dragging.
export function compactCircularClockRate(rate,speed,source,position){
 const d=position.map((v,i)=>v-source.positionMeters[i]),r=Math.max(source.horizonMeters,Math.hypot(...d));
 const spin=Math.min(1,Math.abs(source.spinParameter||0)),rg=source.horizonMeters/(1+Math.sqrt((1-spin)*(1+spin))),x=r/rg,m=1/x,a=spin*m;
 const axis=source.spinAxis,cos=axis?Math.min(1,Math.abs(d.reduce((z,v,i)=>z+v*axis[i],0)/r)):0,sin=Math.sqrt((1-cos)*(1+cos));
 const geodesic=spin===0?Math.max(0,Math.min(1,(x-4)*.5)):0,blend=geodesic*geodesic*(3-2*geodesic);
 const local=speed*(1+blend*(rate.gravityFactor-1)),clock=circularClockRate(rate,local,true);
 // sqrt(g_phi_phi)/r and omega*r/c from the Kerr 3+1 metric.
 const sigma=1+(a*cos)**2,area=(1+a*a)*sigma+2*m*a*a*sin*sin;
 const circumferential=r*Math.sqrt(area/sigma)*sin;
 const drag=2*m*a/area*CLOCK_LIGHT_SPEED/r*Math.sign(source.spinParameter||0);
 const coordinateOmega=sin>1e-12?drag+local/(rate.gravityFactor*circumferential):0;
 return {...clock,coordinateAngularSpeed:Math.abs(coordinateOmega)};
}
export function tickAtClockRate(clock,seconds,rate){
 if(!(seconds>0))return;
 accumulateCrewExposure(clock,seconds,rate.crewLoadG);
 const excess=rate.gravityExcess+rate.gravityFactor*rate.kinematicExcess;
 accumulate(clock,'properSeconds','properCompensation',seconds);
 accumulate(clock,'coordinateSeconds','coordinateCompensation',seconds*rate.rateFactor);
 accumulate(clock,'lagSeconds','lagCompensation',seconds*excess);
}
// Integrate the exact elapsed intervals from two samples of the same geodesic.
// Lag comes from its own integral rather than subtracting near-equal clock totals.
export function tickFreefallInterval(clock,before,after){
 if(!clock||!before||!after)return;
 const proper=after.properSeconds-before.properSeconds,coordinate=after.coordinateSeconds-before.coordinateSeconds,lag=after.lagSeconds-before.lagSeconds;
 if(proper<0||coordinate<0||!(coordinate>0||proper>0)||!Number.isFinite(coordinate+proper+lag))return;
 accumulate(clock,'properSeconds','properCompensation',proper);
 accumulate(clock,'coordinateSeconds','coordinateCompensation',coordinate);
 accumulate(clock,'lagSeconds','lagCompensation',Math.max(0,lag));
 accumulateCrewExposure(clock,proper,0);
}
// Manual motion advances in the local inertial frame. Use the same interval
// and velocity quadrature as the position integrator; add the gravitational
// lapse separately. Never subtract two lifetime totals to recover a tiny lag.
export function tickDriveClock(clock,step,rate){
 const local=step.localSeconds,kinetic=step.kinematicLag,proper=local-kinetic,gravity=local*rate.gravityExcess;
 accumulate(clock,'properSeconds','properCompensation',proper);
 accumulate(clock,'coordinateSeconds','coordinateCompensation',local+gravity);
 accumulate(clock,'lagSeconds','lagCompensation',kinetic+gravity);
 accumulateCrewExposure(clock,proper,rate.crewLoadG);
}
export function createObjectClock(){return {properSeconds:0,coordinateSeconds:0,lagSeconds:0,highGExposureSeconds:0,extremeGExposureSeconds:0,properCompensation:0,coordinateCompensation:0,lagCompensation:0,rapidityVector:[0,0,0]};}
export function clockRate({id=null,positionMeters=[0,0,0],bodyRadiusMeters=0,rapidityVector=[0,0,0],sources=[]}={}){
 let gravityFactor=1,gravityExcess=0,horizonLimit=false;
 if(finiteVector(positionMeters))for(const source of sources){
  if(source.id===id||!(source.massSolar>0)||!Number.isFinite(source.massSolar)||!finiteVector(source.positionMeters))continue;
  const dx=positionMeters[0]-source.positionMeters[0],dy=positionMeters[1]-source.positionMeters[1],dz=positionMeters[2]-source.positionMeters[2];
  const distance=Math.hypot(dx,dy,dz),compact=Number.isFinite(source.horizonMeters)&&source.horizonMeters>0;
  const rs=2*CLOCK_SOLAR_GM*source.massSolar/(CLOCK_LIGHT_SPEED*CLOCK_LIGHT_SPEED);
  let potential;
  if(compact){
   // Kerr ZAMO: alpha²=Sigma*Delta/A. Use 1/alpha² - 1 directly so
   // sub-nanosecond lags in the weak field survive. Factor Delta into
   // (r-r+)(r-r-) to retain precision one representable step outside r+.
   const h=source.horizonMeters,spin=Math.min(1,Math.abs(source.spinParameter||0)),q=Math.sqrt((1-spin)*(1+spin));
   const rg=h/(1+q),rawGap=distance-h;
   if(rawGap<=0)horizonLimit=true;
   const gap=rawGap>0?rawGap:Math.max(h*Number.EPSILON,2*Math.max(0,bodyRadiusMeters),1e-30);
   const r=rawGap>0?distance:h+gap,m=rg/r,a=spin*m,axis=source.spinAxis;
   const cos=axis&&distance>0?Math.max(-1,Math.min(1,(dx*axis[0]+dy*axis[1]+dz*axis[2])/distance)):0;
   const delta=(gap/r)*(gap/r+2*m*q);
   potential=2*m*(1+a*a)/((1+(a*cos)**2)*delta);
  }else{
   const radius=Math.max(distance,Number(source.radiusMeters)||0);
   potential=rs/Math.max(radius-rs,rs*Number.EPSILON,1e-30);
  }
  const factor=Math.sqrt(1+potential),excess=potential/(factor+1);
  gravityExcess=Math.min(MAX_RATE,gravityExcess+excess+gravityExcess*excess);gravityFactor=boundedRate(1+gravityExcess);
 }
 const kinematicFactor=gamma(finiteVector(rapidityVector)?rapidityVector:[0,0,0]),rateFactor=boundedRate(gravityFactor*kinematicFactor),properRate=1/rateFactor;
 const kinematicExcess=gammaExcess(finiteVector(rapidityVector)?rapidityVector:[0,0,0]);
 return {rateFactor,gravityFactor,gravityExcess,kinematicFactor,kinematicExcess,properRate,lossRate:1-properRate,horizonLimit,gravityLossRate:1-1/gravityFactor,kinematicLossRate:1-1/kinematicFactor};
}
function accumulate(clock,key,compensationKey,increment){
 const previous=Math.max(0,Number(clock[key])||0),correction=Number.isFinite(clock[compensationKey])?clock[compensationKey]:0;
 const y=increment-correction,next=previous+y;
 if(!Number.isFinite(next)||next>=CLOCK_MAX_SECONDS){clock[key]=CLOCK_MAX_SECONDS;clock[compensationKey]=0;return;}
 clock[compensationKey]=(next-previous)-y;clock[key]=next;
}
// Straight constant proper acceleration integrates analytically. A turn uses
// a bounded three-point quadrature of the vector-rapidity approximation.
export function advanceObjectClock(clock,seconds,rate={},accelerationVector=[0,0,0]){
 if(!clock||!Number.isFinite(seconds)||seconds<=0)return clock;
 const initial=[...rapidity(clock)],a=finiteVector(accelerationVector)?accelerationVector:[0,0,0],magnitude=Math.hypot(...a),delta=a.map(v=>v*seconds/CLOCK_LIGHT_SPEED),next=initial.map((v,i)=>v+delta[i]);
 const norm=Math.hypot(...next);if(norm>MAX_RAPIDITY)for(let i=0;i<3;i++)next[i]*=MAX_RAPIDITY/norm;
 const midpoint=initial.map((v,i)=>(v+next[i])*.5),startGamma=gamma(initial);
 let averageGammaExcess=(gammaExcess(initial)+4*gammaExcess(midpoint)+gammaExcess(next))/6;
 if(magnitude>0){
  const direction=a.map(v=>v/magnitude),x=initial.reduce((sum,v,i)=>sum+v*direction[i],0),transverse=initial.reduce((sum,v,i)=>sum+(v-x*direction[i])**2,0),d=next.reduce((sum,v,i)=>sum+(v-initial[i])*direction[i],0);
  if(transverse<1e-20){const half=d*.5,sinhcExcess=Math.abs(half)<1e-3?half*half/6+half**4/120+half**6/5040:Math.sinh(half)/half-1,coshExcess=2*Math.sinh((x+half)*.5)**2;averageGammaExcess=coshExcess+sinhcExcess+coshExcess*sinhcExcess;}
 }
 const gravity=Number.isFinite(rate.gravityFactor)?rate.gravityFactor:boundedRate(rate.rateFactor||1)/startGamma,gravityExcess=Number.isFinite(rate.gravityExcess)?rate.gravityExcess:Math.max(0,gravity-1),averageExcess=Math.min(MAX_RATE,gravityExcess+gravity*averageGammaExcess),averageRate=boundedRate(1+averageExcess);
 accumulate(clock,'properSeconds','properCompensation',seconds);
 accumulate(clock,'coordinateSeconds','coordinateCompensation',seconds*averageRate);
 clock.rapidityVector=next;
 // Integrate the excess directly: subtracting two nearly equal lifetime clocks
 // would erase nanosecond differences during ordinary shuttle burns.
 accumulate(clock,'lagSeconds','lagCompensation',seconds*averageExcess);
 return clock;
}
export function objectClockReading(clock,rate={},metadata={}){
 const coordinateSeconds=Math.max(0,Number(clock?.coordinateSeconds)||0),properSeconds=Math.max(0,Number(clock?.properSeconds)||0);
 return {...metadata,highGExposureSeconds:clock?.highGExposureSeconds||0,extremeGExposureSeconds:clock?.extremeGExposureSeconds||0,coordinateSeconds,properSeconds,lagSeconds:Number.isFinite(clock?.lagSeconds)?Math.max(0,clock.lagSeconds):Math.max(0,coordinateSeconds-properSeconds),...rate};
}
const readableNumber=new Intl.NumberFormat('en-US',{minimumSignificantDigits:2,maximumSignificantDigits:2});
const rounded=value=>Number(value.toPrecision(2));
function readableMagnitude(value){
 const n=rounded(value);
 return n>=1e6||n>0&&n<.001?metricNumber(value,2):readableNumber.format(n);
}
export function formatClockRate(factor){
 if(!Number.isFinite(factor)||factor<=0)return '—';
 if(factor>1&&factor<1.0005)return '≈ 1×';
 if(factor>1.1&&factor<1.105)return '> 1.10×';
 if(factor>1&&factor<2)return metricNumber(factor,4)+'×';
 if(factor>=1e15)return metricNumber(factor,3)+':1';
 for(const [scale,suffix] of [[1e12,'T'],[1e9,'B'],[1e6,'M']])if(factor>=scale)return metricNumber(factor/scale,3)+suffix+'×';
 return readableMagnitude(factor)+'×';
}
// A stopwatch, not a rounded duration: preserve a visible tick even on multi-day trips.
export function formatProperClock(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';
 const whole=Math.floor(seconds),days=Math.floor(whole/86400);
 if(days>=365250)return formatClockDuration(seconds);
 const pad=n=>String(n).padStart(2,'0'),h=pad(Math.floor(whole/3600)%24),m=pad(Math.floor(whole/60)%60),s=pad(whole%60);
 const date=days>360?Math.floor(days/360)+'y '+(days%360)+'d ':days?days+' d ':'';
 return date+h+':'+m+':'+s+(days?'':'.'+Math.min(9,Math.floor(seconds*10)-whole*10));
}
export function formatClockDuration(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';if(seconds===0)return '0 s';
 const units=[[1e-15,'fs'],[1e-12,'ps'],[1e-9,'ns'],[1e-6,'µs'],[.001,'ms'],[1,'s'],[60,'min'],[3600,'h'],[86400,'d'],[31557600,'yr'],[31557600e3,'kyr'],[31557600e6,'Myr'],[31557600e9,'Gyr']];
 let index=0;while(index<units.length-1&&seconds>=units[index+1][0])index++;
 while(index<units.length-1&&rounded(seconds/units[index][0])>=units[index+1][0]/units[index][0])index++;
 const [scale,label]=units[index];return readableMagnitude(seconds/scale)+' '+label;
}
