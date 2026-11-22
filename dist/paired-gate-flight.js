// Fit each local transfer before inverting the far mouth into the Ellis chart.
// Equal chart distances on opposite sides can correspond to very different
// physical distances. The flight clock and the picture therefore have
// separate cumulative distance tables, sampled on the same continuous path.
import {buildTransferCurve,transferCurvePoint,transferCurveDerivative,transferCurveFraction,sampleTransferCurve,estimateTransfer,sampleTransferAtDistance,transferPlayback,transferEase} from './travel-math.js';
import {limitedCrew,oneGravityRadius} from './orbit-clearance.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {bridgeWorldLayout} from './proxima-gate-layout.js';
import {bridgeConformal,bridgeResearchGateStage} from './bridge-math.js';

const mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]);
const norm=p=>Math.hypot(...p);
export const isBridgeGate=id=>['bridge-throat','bridge-earth-gate','bridge-proxima-gate'].includes(id);
export function bridgeOrbit(r,far=false,craftId,radiusMeters){
 const b=r.configCache.bridgeRadius*REFERENCE_RG_METERS,plane=r.configCache.primaryBasis,craft=r.objects.find(o=>o.id===(craftId||r.bridgeObjectId));
 const world=bridgeWorldLayout(far,r.sceneId);
 const distance=world.distance*b,R=radiusMeters||r.flightSequences?.[craft?.id]?.nodes.find(n=>n.targetId===(far?'bridge-far-world':'bridge-near-world'))?.radiusMeters||Math.max(oneGravityRadius(craft?.type,world.massSolar)*world.radius*b/world.radiusMeters,world.radius*b*1.04+2*(craft?r.objectRadius(craft)*REFERENCE_RG_METERS:0)),factor=far?b*b/(4*(distance*distance-R*R)):1;
 const physicalRadiusMeters=R*world.radiusMeters/(world.radius*b),speed=limitedCrew(craft?.type)?Math.sqrt(1.32712440018e20*world.massSolar/physicalRadiusMeters):R*factor*.12;return {chartRadius:R,center:mul(plane[2],distance*factor),radius:R*factor,speed,localRadiusMeters:physicalRadiusMeters,physicalRadiusMeters:limitedCrew(craft?.type)?physicalRadiusMeters:undefined,plane,far};
}
// A throat point is a fixed point of inversion. The derivative across the
// throat reflects the radial component of a local tangent. Choose its normal
// to bisect the incoming and outgoing directions so velocity is continuous.
export function bridgeTangentContacts(r,id,departFar,startRadius,endRadius,axisGate=false,startPoint=null){
 const b=r.configCache.bridgeRadius*REFERENCE_RG_METERS,axes=r.configCache.primaryBasis;
 const start=bridgeOrbit(r,departFar,id,startRadius),end=bridgeOrbit(r,!departFar,id,endRadius);
 const localContact=(orbit,g,departing)=>{
  const D=bridgeWorldLayout(orbit.far,r.sceneId).distance,R=orbit.chartRadius/b;
  const dz=g[1]-D,angle=Math.atan2(dz,g[0])+(departing!==orbit.far?1:-1)*Math.acos(Math.min(1,R/Math.hypot(g[0],dz)));
  const p=[R*Math.cos(angle),D+R*Math.sin(angle)],v=departing?sub(g,p):sub(p,g);
  const chart=orbit.far?mul(p,.25/dot(p,p)):p;
  return {dir:mul(v,1/norm(v)),phase:Math.atan2(chart[1]-dot(orbit.center,axes[2])/b,chart[0])};
 };
 // After manual flight, the recovery brake ends at an arbitrary rest point.
 // Match that actual line to the receiving tangent in the same way.
 const fixed=startPoint&&[dot(startPoint,axes[0])/b,dot(startPoint,axes[2])/b];
 const localFixed=fixed&&departFar?mul(fixed,.25/dot(fixed,fixed)):fixed;
 let point=[0,.5];
 for(let i=0;!axisGate&&i<24;i++){
  const inbound=localFixed?sub(point,localFixed):localContact(start,point,true).dir;
  const normal=sub(localContact(end,point,false).dir,mul(inbound,1/norm(inbound)));
  const next=mul(normal,.5/norm(normal));
  if(norm(sub(next,point))<1e-13)break;
  point=next;
 }
 return {gate:add(mul(axes[0],point[0]*b),mul(axes[2],point[1]*b)),departure:localContact(start,point,true).phase,arrival:localContact(end,point,false).phase};
}
export function pairedGatePart(from,to,b,far,metersPerChartMeter,initialSpeed,finalSpeed){
 const transform=p=>far?mul(p,b*b/(4*dot(p,p))):p;
 const derivative=(p,v)=>far?mul(sub(v,mul(p,2*dot(p,v)/dot(p,p))),b*b/(4*dot(p,p))):v;
 const a=transform(from.position),z=transform(to.position),line=sub(z,a);
 const local=[a,add(a,mul(line,1/3)),add(a,mul(line,2/3)),z];
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
 const coastLength=finalSpeed>0?.025*lengthMeters:0,burn=estimateTransfer(lengthMeters-coastLength,'shuttle',1,{flipCoast:true,initialSpeed,finalSpeed});
 if(burn.error)return {plan:burn};
 const coastSeconds=finalSpeed>0?coastLength/finalSpeed:4,beta=finalSpeed/299792458,tailRate=Math.sqrt(1-beta*beta);
 const coastLag=coastSeconds*beta*beta/(1+tailRate),plan={...burn,distanceMeters:lengthMeters,
  coordinateSeconds:burn.coordinateSeconds+coastSeconds,properSeconds:burn.properSeconds+coastSeconds-coastLag,dilationSeconds:burn.dilationSeconds+coastLag};
 return {...curve,points,cumulative,plan,burn,coastSeconds,coastLag,impulse:false,warpFactor:0,initialSpeed};
}

export const GATE_LEG_SECONDS=21;

// Measure the two aperture contacts on the planned worldline. Spend the same
// viewing time on the moving gate as on the original research bridge. The
// physical position, engine, clock and metric continue to share one sample.
export function timeGateTransition(part,b){
 const stageAt=u=>{
  const fraction=gateFlightSample(part,u,false,true).fraction;
  return bridgeResearchGateStage(sampleTransferCurve(part,fraction).position,b).open;
 };
 const opening=stageAt(0)<stageAt(1);
 function contact(full){
  let lo=0,hi=1;
  for(let i=0;i<24;i++){
   const mid=(lo+hi)*.5,open=stageAt(mid);
   const passed=opening?(full?open===1:open>0):(full?open===0:open<1);
   if(passed)hi=mid;else lo=mid;
  }
  return (lo+hi)*.5*GATE_LEG_SECONDS;
 }
 const start=contact(false),end=contact(true),extra=Math.max(0,3.5-(end-start));
 if(end-start>.001&&extra>0)part.apertureTime={start,end,extra};
}

function gateFlightProgress(part,seconds){
 const clock=part.apertureTime;
 if(!clock||seconds<=clock.start)return seconds/GATE_LEG_SECONDS;
 const {start,end,extra}=clock;
 if(seconds>=end+extra)return (seconds-extra)/GATE_LEG_SECONDS;
 // Invert a monotone smoothstep dilation. Its end slopes match the flight
 // clock on both sides, so approaching the gate never introduces a speed cut.
 let lo=0,hi=1;
 for(let i=0;i<22;i++){
  const u=(lo+hi)*.5;
  if(start+(end-start)*u+extra*u*u*(3-2*u)<seconds)lo=u;else hi=u;
 }
 return (start+(end-start)*(lo+hi)*.5)/GATE_LEG_SECONDS;
}
export function pairedGatePhase(route,progress){
 const first=route.parts[0],two=route.parts.length===2;
 const firstSeconds=GATE_LEG_SECONDS+(first.apertureTime?.extra||0);
 const total=firstSeconds+(two?GATE_LEG_SECONDS+(route.parts[1].apertureTime?.extra||0):0);
 const seconds=progress*total,second=two&&seconds>=firstSeconds,part=second?route.parts[1]:first;
 const u=gateFlightProgress(part,second?seconds-firstSeconds:seconds);
 return gateFlightSample(part,Math.max(0,Math.min(1,u)),second,route.waypoint||two&&!second);
}
function gateFlightSample(part,u,second,approachingGate){
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
  second,fraction,physical,sample,turn,phase:coast>0?(approachingGate?'Approaching gate':'Entering orbit'):second&&u<.10?'Passing through gate':shot.phase,
  thrust:coast>0?0:shot.commandedThrustG,hold:0};
}
