// Fit each local transfer before inverting the far mouth into the Ellis chart.
// Equal chart distances on opposite sides can correspond to very different
// physical distances. The flight clock and the picture therefore have
// separate cumulative distance tables, sampled on the same continuous path.
import {buildTransferCurve,transferCurvePoint,transferCurveDerivative,transferCurveFraction,estimateTransfer,sampleTransferAtDistance,transferPlayback,transferEase} from './travel-math.js';
import {bridgeConformal} from './bridge-math.js';

const mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=p=>Math.hypot(...p);
export const isBridgeGate=id=>['bridge-throat','bridge-earth-gate','bridge-proxima-gate'].includes(id);
export function pairedGatePart(from,to,b,far,metersPerChartMeter,initialSpeed,finalSpeed){
 const transform=p=>far?mul(p,b*b/(4*dot(p,p))):p;
 const derivative=(p,v)=>far?mul(sub(v,mul(p,2*dot(p,v)/dot(p,p))),b*b/(4*dot(p,p))):v;
 const direction=(p,v)=>{const d=derivative(p,v);return mul(d,1/norm(d));};
 const a=transform(from.position),z=transform(to.position),handle=norm(sub(z,a))*.24;
 const local=[a,add(a,mul(direction(from.position,from.basis[2]),handle)),sub(z,mul(direction(to.position,to.basis[2]),handle)),z];
 // Cubic Hermite segments preserve position and tangent through inversion,
 // including at the throat. SI distance uses the conformal metric.
 // Cluster knots at the two contacts, where the projected scale changes
 // fastest, to keep per-frame worker snapshots compact.
 const n=32,segments=[],cumulative=[0];
 let last=a,tangent=transferCurveDerivative(local,0),previousParameter=0;
 for(let i=1;i<=n;i++){
  const t=.5-.5*Math.cos(Math.PI*i/n),handleFraction=(t-previousParameter)/3;
  const p=transferCurvePoint(local,t),v=transferCurveDerivative(local,t),A=transform(last),B=transform(p);
  segments.push([A,add(A,mul(derivative(last,tangent),handleFraction)),sub(B,mul(derivative(p,v),handleFraction)),B]);
  cumulative.push(cumulative[i-1]+norm(sub(p,last))*bridgeConformal(norm(mul(add(last,p),.5)),b)*metersPerChartMeter);
  last=p;tangent=v;previousParameter=t;
 }
 const points={segments},curve=buildTransferCurve(points),lengthMeters=cumulative.at(-1);
 // Leave a short terminal coast to swing from the braking attitude into
 // the forward transit / parking attitude with the engine off.
 const coastLength=.025*lengthMeters,burn=estimateTransfer(lengthMeters-coastLength,'shuttle',1,{flipCoast:true,initialSpeed,finalSpeed});
 if(burn.error)return {plan:burn};
 const coastSeconds=coastLength/finalSpeed,beta=finalSpeed/299792458,tailRate=Math.sqrt(1-beta*beta);
 const coastLag=coastSeconds*beta*beta/(1+tailRate),plan={...burn,distanceMeters:lengthMeters,
  coordinateSeconds:burn.coordinateSeconds+coastSeconds,properSeconds:burn.properSeconds+coastSeconds-coastLag,dilationSeconds:burn.dilationSeconds+coastLag};
 return {...curve,points,cumulative,plan,burn,coastSeconds,coastLag,impulse:false,warpFactor:0,initialSpeed};
}

export function pairedGatePhase(route,progress){
 const second=progress>=.5,part=route.parts[second?1:0],u=second?2*progress-1:2*progress;
 const coast=Math.max(0,Math.min(1,(u-.84)/.16)),shot=transferPlayback({plan:part.burn},Math.min(1,u/.84));
 const coastProgress=transferEase(coast),burnFraction=part.burn.distanceMeters/part.plan.distanceMeters;
 const physical=shot.distanceFraction*burnFraction+coastProgress*(1-burnFraction);
 const sample=sampleTransferAtDistance(part.burn,shot.distanceFraction);
 sample.properSeconds+=coastProgress*(part.coastSeconds-part.coastLag);
 sample.coordinateSeconds+=coastProgress*part.coastSeconds;
 sample.dilationSeconds+=coastProgress*part.coastLag;
 sample.distanceFraction=physical;sample.distanceMeters=part.plan.distanceMeters*physical;
 const table=part.cumulative,distance=physical*table.at(-1);
 let a=0,b=table.length-1;
 while(b-a>1){const m=(a+b)>>1;if(table[m]<=distance)a=m;else b=m;}
 const parameter=(a+(distance-table[a])/(table[b]-table[a]))/(table.length-1);
 const fraction=transferCurveFraction(part,parameter);
 const turn=shot.turnAngle+Math.PI*coastProgress;
 return {index:(second?5:0)+shot.phaseIndex,stage:shot.phaseIndex,local:shot.phaseProgress,ease:physical,
  second,fraction,physical,sample,turn,phase:coast>0?(second?'Entering orbit':'Approaching gate'):second&&u<.10?'Passing through gate':shot.phase,
  thrust:coast>0?0:shot.commandedThrustG,hold:0};
}
