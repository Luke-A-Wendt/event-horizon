// Clock telemetry only: active wall seconds are the traveler's proper time τ.
// Static Schwarzschild lapse plus proper-thrust rapidity. The Kerr horizon is
// shifted into a Schwarzschild comparison radius; multiple lapse factors and
// curved/turning paths are inexpensive visual approximations, not solved GR.
export const CLOCK_LIGHT_SPEED=299792458;
export const CLOCK_SOLAR_GM=1.32712440018e20;
export const CLOCK_HORIZON_EPSILON=1e-6;
export const CLOCK_MAX_SECONDS=1e300;
const MAX_RAPIDITY=300,MAX_RATE=1e150;
export const compactExteriorRadius=(horizon,bodyRadius=0)=>horizon*(1+CLOCK_HORIZON_EPSILON)+2*Math.max(0,bodyRadius);
export const CLOCK_TYPES=Object.freeze(['astronaut','shuttle','iss']);
export const supportsObjectClock=type=>CLOCK_TYPES.includes(type);
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const boundedRate=v=>Math.max(1,Math.min(MAX_RATE,Number.isFinite(v)?v:MAX_RATE));
const rapidity=clock=>finiteVector(clock?.rapidityVector)?clock.rapidityVector:[0,0,0];
const gamma=eta=>Math.cosh(Math.min(MAX_RAPIDITY,Math.hypot(...eta)));
const gammaExcess=eta=>2*Math.sinh(Math.min(MAX_RAPIDITY,Math.hypot(...eta))*.5)**2;
export function createObjectClock(){return {properSeconds:0,coordinateSeconds:0,lagSeconds:0,properCompensation:0,coordinateCompensation:0,lagCompensation:0,rapidityVector:[0,0,0]};}
export function clockRate({id=null,positionMeters=[0,0,0],bodyRadiusMeters=0,rapidityVector=[0,0,0],sources=[]}={}){
 let gravityFactor=1,gravityExcess=0,horizonLimit=false;
 if(finiteVector(positionMeters))for(const source of sources){
  if(source.id===id||!(source.massSolar>0)||!Number.isFinite(source.massSolar)||!finiteVector(source.positionMeters))continue;
  const distance=Math.hypot(...positionMeters.map((v,i)=>v-source.positionMeters[i])),compact=Number.isFinite(source.horizonMeters)&&source.horizonMeters>0;
  const rs=2*CLOCK_SOLAR_GM*source.massSolar/(CLOCK_LIGHT_SPEED*CLOCK_LIGHT_SPEED),horizon=compact?source.horizonMeters:rs;
  // At a Kerr horizon use δ=r-r_+, and r_comparison=r_s+δ. For spin=0
  // this is exactly sqrt(1-r_s/r)^-1; factoring δ avoids cancellation.
  const radius=compact?distance:Math.max(distance,Number(source.radiusMeters)||0),minimumGap=Math.max(horizon*CLOCK_HORIZON_EPSILON,compact?2*Math.max(0,bodyRadiusMeters):0,1e-30);
  const gap=Math.max(radius-horizon,minimumGap);
  if(compact&&distance<=horizon)horizonLimit=true;
  const potential=rs/gap,factor=Math.sqrt(1+potential),excess=potential/(factor+1);
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
 return {...metadata,coordinateSeconds,properSeconds,lagSeconds:Number.isFinite(clock?.lagSeconds)?Math.max(0,clock.lagSeconds):Math.max(0,coordinateSeconds-properSeconds),...rate};
}
const readableNumber=new Intl.NumberFormat('en-US',{minimumSignificantDigits:2,maximumSignificantDigits:2});
const rounded=value=>Number(value.toPrecision(2));
function readableMagnitude(value){
 const n=rounded(value);
 for(const [scale,label] of [[1e12,'trillion'],[1e9,'billion'],[1e6,'million']])if(n>=scale&&n<1e15)return readableNumber.format(n/scale)+' '+label;
 return n>=1e15||n>0&&n<.001?value.toExponential(1).replace('e+','e'):readableNumber.format(n);
}
export function formatClockRate(factor){return !Number.isFinite(factor)||factor<0?'—':readableMagnitude(factor)+'×';}
export function formatClockDuration(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';if(seconds===0)return '0 s';
 const units=[[1e-15,'fs'],[1e-12,'ps'],[1e-9,'ns'],[1e-6,'µs'],[.001,'ms'],[1,'s'],[60,'min'],[3600,'h'],[86400,'d'],[31557600,'yr']];
 let index=0;while(index<units.length-1&&seconds>=units[index+1][0])index++;
 while(index<units.length-1&&rounded(seconds/units[index][0])>=units[index+1][0]/units[index][0])index++;
 const [scale,label]=units[index];return readableMagnitude(seconds/scale)+' '+label;
}
