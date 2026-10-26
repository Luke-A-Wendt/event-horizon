// A bounded-cost clock comparison with a distant, stationary reference.
// Exterior Schwarzschild lapse × local special-relativistic clock rate.
// A spinning compact body's supplied horizon defines an axial Kerr lapse
// proxy, ignoring latitude and frame dragging. Multiple sources multiply lapse
// factors; this is not an exact many-body solution. Extended-body interiors
// use the surface potential approximation.
export const CLOCK_LIGHT_SPEED=299792458;
export const CLOCK_SOLAR_GM=1.32712440018e20;
export const CLOCK_TYPES=Object.freeze(['astronaut','shuttle','iss']);
export const supportsObjectClock=type=>CLOCK_TYPES.includes(type);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function createObjectClock(){return {coordinateSeconds:0,lagSeconds:0,coordinateCompensation:0,lagCompensation:0};}

export function clockRate({id=null,positionMeters=[0,0,0],velocityMetersPerSecond=[0,0,0],sources=[]}={}){
 let gravityLossRate=0,horizonLimit=false;
 if(finiteVector(positionMeters))for(const source of sources){
  if(source.id===id||!(source.massSolar>0)||!Number.isFinite(source.massSolar)||!finiteVector(source.positionMeters))continue;
  const distance=Math.hypot(...positionMeters.map((v,i)=>v-source.positionMeters[i])),compact=Number.isFinite(source.horizonMeters)&&source.horizonMeters>0;
  const surface=Math.max(0,Number(source.radiusMeters)||0),radius=Math.max(distance,compact?0:surface,1e-30);
  const schwarzschild=2*CLOCK_SOLAR_GM*source.massSolar/(CLOCK_LIGHT_SPEED*CLOCK_LIGHT_SPEED),horizon=compact?source.horizonMeters:schwarzschild;
  if(compact&&distance<=horizon*(1+1e-8))horizonLimit=true;
  // a²=r_+(r_s-r_+); Δ/(r²+a²) vanishes at r_+ while retaining
  // the correct first-order 1-r_s/r behavior far from a spinning hole.
  const a2=compact?Math.max(0,horizon*(schwarzschild-horizon)):0;
  const u=clamp(schwarzschild/(radius+a2/radius),0,1),root=Math.sqrt(1-u),loss=u/(1+root);
  // 1 - sqrt(1-u), evaluated without subtracting nearly equal numbers.
  gravityLossRate+=loss*(1-gravityLossRate);
 }
 const speed=finiteVector(velocityMetersPerSecond)?Math.hypot(...velocityMetersPerSecond):0;
 const beta=Math.min(1-8*Number.EPSILON,speed/CLOCK_LIGHT_SPEED),beta2=beta*beta;
 const kinematicLossRate=beta2/(1+Math.sqrt((1-beta)*(1+beta)));
 const lossRate=horizonLimit?1:clamp(gravityLossRate+kinematicLossRate-gravityLossRate*kinematicLossRate,0,1);
 const properRate=horizonLimit?0:Math.max(0,(1-gravityLossRate)*(1-kinematicLossRate));
 return {properRate,lossRate,rateFactor:properRate>0?1/properRate:Infinity,horizonLimit,gravityLossRate,kinematicLossRate};
}

function accumulate(clock,key,compensationKey,increment){
 const previous=Number.isFinite(clock[key])?clock[key]:0,correction=Number.isFinite(clock[compensationKey])?clock[compensationKey]:0;
 const y=increment-correction,next=previous+y;
 if(!Number.isFinite(next))return;
 clock[compensationKey]=(next-previous)-y;clock[key]=next;
}
export function advanceObjectClock(clock,seconds,rate){
 if(!clock||!Number.isFinite(seconds)||seconds<=0)return clock;
 accumulate(clock,'coordinateSeconds','coordinateCompensation',seconds);
 accumulate(clock,'lagSeconds','lagCompensation',seconds*clamp(Number(rate?.lossRate)||0,0,1));
 return clock;
}
export function objectClockReading(clock,rate={},metadata={}){
 const coordinateSeconds=Math.max(0,Number(clock?.coordinateSeconds)||0),lagSeconds=Math.max(0,Math.min(coordinateSeconds,Number(clock?.lagSeconds)||0));
 return {...metadata,coordinateSeconds,lagSeconds,properSeconds:coordinateSeconds-lagSeconds,...rate};
}

const superscripts={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
const durationUnits=[[1e-9,'ns'],[1e-6,'μs'],[1e-3,'ms'],[1,'s'],[60,'min'],[3600,'h'],[86400,'d'],[31557600,'yr']];
export function formatClockDuration(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';if(seconds===0)return '0 ns';
 let index=0;while(index<durationUnits.length-1&&seconds>=durationUnits[index+1][0])index++;
 while(index<durationUnits.length-1&&Number((seconds/durationUnits[index][0]).toPrecision(2))*durationUnits[index][0]>=durationUnits[index+1][0])index++;
 const [divisor,unit]=durationUnits[index],scaled=seconds/divisor;
 if(scaled>=1e4||scaled<.01){const [m,e]=scaled.toExponential(1).split('e');return m+' × 10'+String(Number(e)).split('').map(c=>superscripts[c]).join('')+' '+unit;}
 return Number(scaled.toPrecision(2)).toLocaleString(undefined,{minimumSignificantDigits:2,maximumSignificantDigits:2,useGrouping:false})+' '+unit;
}
