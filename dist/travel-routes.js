import {cameraRelative} from './camera-framing.js';
import {SCENE_ORIGIN} from './scene-origin.js';
import {HALF_TURN_SECONDS} from './travel-math.js';
import {clockHullMeters,stopMinimumMeters,orbitClearance,oneGravityRadius} from './orbit-clearance.js';
import {parkedOrbitGeometry,parkedCameraFraming,limbForward,AUTO_EYE_ELEVATION} from './orbit-path.js';
// Guided travel is a bounded cinematic transfer, not an N-body rendezvous solver.
// Physical trip clocks advance through an analytic profile independently of the ten-second presentation clock.
import {REFERENCE_RG_METERS,OBJECT_CLASS} from './objects.js';
import {clockRate,compactExteriorRadius} from './object-clocks.js';
import {circularRadiusPlan,sampleCircularRadius,estimateTransfer,minimumTransferDistance,sampleTransfer,sampleTransferAtDistance,transferPlayback,TRANSFER_WALL_SECONDS,transferEase,transferCurvePoint,transferCurveDerivative,transferCurveFraction} from './travel-math.js';
import {orthonormalFrame,warpVelocity,warpForSpeed} from './flight-dynamics.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
// Anchor at the nearer endpoint: blending two interstellar coordinates adds
// another round of world-scale quantization to a shuttle-sized displacement.
const mix=(a,b,t)=>t<=.5?a.map((v,i)=>v+(b[i]-v)*t):b.map((v,i)=>v+(a[i]-v)*(1-t));
function directionMix(a,b,t){const d=Math.max(-1,Math.min(1,dot(a,b)));if(d>.999)return unit(mix(a,b,t));const angle=Math.acos(d),n=d<-.999?unit(cross(a,Math.abs(a[1])<.8?[0,1,0]:[1,0,0])):unit(sub(b,mul(a,d)));return add(mul(a,Math.cos(angle*t)),mul(n,Math.sin(angle*t)));}
const physical=f=>(f.physicalRadius||f.radius||0)*REFERENCE_RG_METERS;
export function travelCraft(r,options={}){const eligible=id=>r.objects.find(o=>o.id===id&&['shuttle','enterprise'].includes(o.type));return options.craftId!==undefined?eligible(options.craftId):eligible(r.transfer?.craftId)||eligible(r.selectedId)||eligible(r.focusId)||eligible(r.driveId);}
export function travelTargets(r,options={}){
 const craft=travelCraft(r,options);if(!craft||r.state.bridge)return [];
 const key=[craft.id,r.geometryRevision,r.objects.length].join(':');if(r.travelTargetCache?.key===key)return r.travelTargetCache.items;
 const nodes=r.getObjectTree(),byId=new Map(nodes.map(n=>[n.id,n])),objects=new Map(r.objects.map(o=>[o.id,o])),mass=id=>id==='primary'?r.state.mass*1e6:id==='secondary'?r.state.mass*1e6*r.state.binaryRatio:id==='planet'?r.state.planetMass*3e-6:id==='tidalStar'?1:r.objectMassSolar(objects.get(id)||{}),descendants=new Set([craft.id]),queue=[craft.id];while(queue.length){const node=byId.get(queue.pop());for(const id of node?.children||[]){descendants.add(id);queue.push(id);}}
 const candidates=nodes.filter(n=>n.id!=='space'&&!descendants.has(n.id)&&n.canAdd&&OBJECT_CLASS[n.type]>=OBJECT_CLASS[craft.type]&&mass(n.id)>0);
 const items=candidates.filter(n=>OBJECT_CLASS[n.type]>OBJECT_CLASS[craft.type]||r.canParentObject(craft.type,n.id,craft.id).ok).map(n=>({id:n.id,name:n.label,label:n.label,type:n.type}));
 for(const n of nodes)if(n.type==='waypoint')items.push({id:n.id,name:n.label,label:n.label,type:n.type,waypoint:true});
 items.push(SCENE_ORIGIN);r.travelTargetCache={key,items};return items;
}
function targetInfo(r,id,options){return travelTargets(r,options).find(n=>n.id===id);}
const MU=1.32712440018e20,RG=REFERENCE_RG_METERS;
// Waypoints are fixed in the origin frame. Circles can share an elevated
// navigation plane, but moving a marker onto it would miss the actual stop.
const planeTolerance=(a,b)=>Math.max(.002,32*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)));
const planeError='The fixed waypoints and parking clearances must share one flight plane. Move the waypoint into the route plane.';
export function sequencePlaneHeight(r,craft,targetIds){
 const up=r.configCache.primaryBasis[1];let clearance=-Infinity,fixed=null,coordinateScale=0;
 for(const id of new Set([...(craft.waypointHoldId?[craft.waypointHoldId]:[]),...targetIds])){
  const body=r.getFocusFrame(id);if(!body)continue;
  const height=dot(body.position,up)*RG;coordinateScale=Math.max(coordinateScale,Math.hypot(...body.position)*RG);
  if(body.type==='waypoint'){
   if(fixed!==null&&Math.abs(fixed-height)>planeTolerance(coordinateScale,height))return NaN;
   fixed=height;
  }else clearance=Math.max(clearance,height+orbitClearance(r,craft,id)*RG);
 }
 if(fixed!==null)return Number.isFinite(clearance)&&fixed+planeTolerance(coordinateScale,clearance)<clearance?NaN:fixed;
 const parked=parkedOrbitGeometry(r,craft.id);if(parked)clearance=Math.max(clearance,dot(parked.center,up));return Number.isFinite(clearance)?clearance:0;
}
// The forward common tangent keeps both centres on the left. Its reverse
// direction is a different common tangent, not the same line driven backwards.
export function directedExternalTangent(A,ra,B,rb,up){
 const delta=sub(B,A),flat=sub(delta,mul(up,dot(delta,up))),D=Math.hypot(...flat);
 if(D<=Math.abs(ra-rb)+1e-6||!(D>0))return {error:'The parking circles have no distinct external tangent.'};
 const e=mul(flat,1/D),k=(ra-rb)/D,n=add(mul(e,k),mul(cross(e,up),Math.sqrt((1-k)*(1+k)))),tangent=unit(cross(up,n));
 return {start:add(A,mul(n,ra)),end:add(B,mul(n,rb)),radial:n,tangent,length:D*Math.sqrt((1-k)*(1+k))};
}
// Two concentric circles have no common external tangent. The prescribed
// chord touches the inner circle and crosses the outer one. The chosen
// prograde branch leaves the centre on the pilot's left at inner contact.
// Minimum work per unit mass along the direct tangent back to the outer
// circular orbit, in standard gravities. This is a route-specific lower bound.
export function minimumReturnG(mu,r,R){
 return mu>0&&r>0&&R>r?mu/(2*9.80665*r*R)*Math.sqrt((R-r)/(R+r)):0;
}
// Invert the same direct-return work test used by the planner and readout.
// For fixed R the bound decreases strictly with r. Keep the feasible side
// of the bracket and round outward to a metre so reconstructed contacts
// don't exceed the threshold by an ulp.
export function closestReturnOrbit(mu,R,floor,limitG=1){
 if(!(mu>0&&R>0&&floor>0&&limitG>0))throw new RangeError('Invalid recovery orbit');
 if(floor>=R||minimumReturnG(mu,floor,R)<=limitG)return floor;
 let lo=floor,hi=R;
 for(let i=0;i<56;i++){const mid=lo+(hi-lo)*.5;if(minimumReturnG(mu,mid,R)>limitG)lo=mid;else hi=mid;}
 return Math.min(R,Math.ceil(hi*(1+32*Number.EPSILON)));
}
export function concentricChord(center,ra,rb,up,departureRadial){
 const outward=rb>ra,ratio=Math.min(ra,rb)/Math.max(ra,rb),sin=Math.sqrt((1-ratio)*(1+ratio)),length=Math.max(ra,rb)*sin;
 const t=unit(cross(up,departureRadial)),arrivalRadial=unit(add(mul(departureRadial,ratio),mul(t,sin)));
 const tangent=outward?t:unit(cross(up,arrivalRadial));
 return {concentric:true,start:add(center,mul(departureRadial,ra)),end:add(center,mul(arrivalRadial,rb)),radial:departureRadial,departureTangent:t,arrivalRadial,tangent,arrivalTangent:unit(cross(up,arrivalRadial)),length};
}
// Rotate only body-local axes; adding a chart origin is the final operation.
export function circularRadiusPose(leg,sample){
 const cs=Math.cos(sample.angle),sn=Math.sin(sample.angle),radial=add(mul(leg.radial,cs),mul(leg.departureTangent,sn)),tangent=add(mul(leg.departureTangent,cs),mul(leg.radial,-sn));
 const velocity=add(mul(radial,sample.radialVelocity),mul(tangent,sample.tangentialVelocity));
 return {radial,tangent,forward:unit(velocity),p:add(leg.orbitCenter,mul(radial,sample.radius))};
}
// Check the actual arc, not its endpoint chord (or an entire annulus).
// Each subdivision bounds the spiral by its monotone angle and radius.
function circularRadiusObstacle(leg,o){
 const delta=sub(o.center,leg.orbitCenter),height=dot(delta,leg.normal),q=sub(delta,mul(leg.normal,height)),D=Math.hypot(...q);
 if(Math.abs(height)>=o.limit)return false;
 const planarLimit=Math.sqrt((o.limit-height)*(o.limit+height)),phi=Math.atan2(dot(q,leg.departureTangent),dot(q,leg.radial)),tau=2*Math.PI;
 const p=leg.radiusPlan,sample=u=>sampleCircularRadius(p,u);
 const wraps=x=>Math.atan2(Math.sin(x),Math.cos(x));
 const inside=s=>Math.hypot(s.radius-D,2*Math.sqrt(s.radius*D)*Math.sin(wraps(s.angle-phi)/2))<planarLimit;
 function hit(a,b,lo,hi,depth){
  const r0=Math.min(a.radius,b.radius),r1=Math.max(a.radius,b.radius),radialGap=Math.max(0,r0-D,D-r1);
  if(radialGap>=planarLimit)return false;
  // If the bearing is not spanned, the nearer interval endpoint bounds
  // the angular part of d²=(r-D)²+4rD sin²(delta/2) from below.
  const angle=phi+tau*Math.ceil((a.angle-phi)/tau);
  const halfSine=angle<=b.angle?0:Math.min(Math.abs(Math.sin(wraps(a.angle-phi)/2)),Math.abs(Math.sin(wraps(b.angle-phi)/2)));
  if(Math.hypot(radialGap,2*Math.sqrt(r0*D)*halfSine)>=planarLimit)return false;
  if(inside(a)||inside(b))return true;
  if(depth>=24)return true; // Tangent within numerical tolerance.
  const mid=(lo+hi)/2,m=sample(mid);return hit(a,m,lo,mid,depth+1)||hit(m,b,mid,hi,depth+1);
 }
 return hit(sample(0),sample(1),0,1,0);
}
function circularRadiusLeg(center,ra,rb,mu,normal,radial,height){
 const plan=circularRadiusPlan(ra,rb,mu,height);if(plan.error)return plan;
 const departureTangent=unit(cross(normal,radial)),leg={radiusTransfer:true,radiusChange:true,concentric:true,normal,radial,departureTangent,orbitCenter:center,radiusPlan:plan};
 const last=circularRadiusPose(leg,sampleCircularRadius(plan,1));
 return {...leg,start:add(center,mul(radial,ra)),end:last.p,arrivalRadial:last.radial,tangent:departureTangent,arrivalTangent:last.forward,length:plan.distanceMeters};
}
export function orbitalTangentLeg(r,id,options={},restStart=null){
 const craft=travelCraft(r,options),target=r.getFocusFrame(id),ship=craft&&r.getFocusFrame(craft.id);if(!target||!ship)return {error:'The selected body or vehicle is unavailable.'};
 const plane=r.configCache.primaryBasis,up=plane[1],parked=parkedOrbitGeometry(r,craft.id),manual=r.driveId===craft.id&&!craft.flight?.orbitHold;
 const waypoint=target.type==='waypoint',fromPoint=craft.waypointHoldId&&(!manual||!craft.flight?.speed)?craft.waypointHoldId:null;
 if(fromPoint===id)return {error:'Already at this waypoint.'};
 const concentric=parked?.parentId===id;
 if(concentric&&!(options.orbitRadii?.[id]>0))return {error:'Already at this parking orbit.'};
 const from=restStart||(parked?parked.parentCenter:manual?[...craft.flight.position]:mul(ship.position,RG)),center=mul(target.position,RG),shipRadius=physical(ship),mu=MU*Math.max(0,target.massSolar||0);
 const rawSpeed=restStart?0:manual?(craft.flight.speed||0):(parked?.circularSpeedMetersPerSecond||0),initialSpeed=Math.min(craft.type==='shuttle'?299792458*(1-8*Number.EPSILON):Infinity,Math.abs(rawSpeed));
 const floor=Math.max(1.2*physical(target)+2*shipRadius,4*(target.horizonRadius||0)*RG,shipRadius*8,1),ceiling=Math.max(floor,Math.hypot(...sub(center,from))*.08),remember=options.orbitRadii?.[id];
 // A manual handoff uses the vehicle's measured velocity, not its nose or
 // its old orbital parent. Finish this braking leg before turning onto a
 // new line; the physical stopping distance can be appreciable near c.
 const rejoin=options.rejoin&&manual;
 if(rejoin&&!restStart&&initialSpeed>0){
  const velocity=craft.type==='enterprise'?warpVelocity(craft.flight):mul(unit(craft.flight.velocity),initialSpeed);
  const cap=makeCapture(craft.type,from,velocity,unit(velocity),Math.hypot(...sub(center,from)),craft.flight.basis[2],up);
  const leg=orbitalTangentLeg(r,id,options,cap.stop);if(leg.error)return leg;
  cap.alignT=angleBetween(cap.retro,leg.tangent)/.65;
  cap.properSeconds+=cap.alignT;cap.coordinateSeconds+=cap.alignT;
  return {...leg,capture:cap};
 }
 const queue=r.flightSequences?.[craft.id]?.nodes;
 const H=rejoin?(waypoint?dot(center,up):sequencePlaneHeight(r,craft,queue?.length?[id,...queue.map(node=>node.targetId)]:[id])):options.planeHeightMeters!==undefined?options.planeHeightMeters:parked?sequencePlaneHeight(r,craft,[parked.parentId,id]):dot(from,up);
 if(!Number.isFinite(H))return {error:planeError};
 const hA=H-dot(from,up),hB=H-dot(center,up),tol=planeTolerance(H,Math.max(Math.hypot(...from),Math.hypot(...center)));
 const radius=waypoint?0:remember>0?Math.max(remember,stopMinimumMeters(r,craft,id,hB)):Math.max(oneGravityRadius(craft.type,target.massSolar),craft.type==='shuttle'&&initialSpeed>0?Math.max(floor,Math.min(ceiling,mu/(initialSpeed*initialSpeed))):floor);
 if(!rejoin&&((!parked&&Math.abs(hA)>tol)||(waypoint&&Math.abs(hB)>tol)))return {error:planeError};
 const A=parked?add(from,mul(up,hA)):from,B=waypoint?center:add(center,mul(up,hB)),ra=parked?.radius||0;
 if(!waypoint&&hB+tol<orbitClearance(r,craft,id)*RG)return {error:'The current flight plane is below this destination’s parking clearance.'};
 if(concentric&&Math.abs(ra-radius)<=Math.max(.001,32*Number.EPSILON*ra))return {error:'Already at this parking radius.'};
 // If a stopped manual craft is inside the requested circle, too close
 // to gain the arrival speed at 1g, or below the safe parking plane, no
 // straight tangent can join it. Fly out to a real stationary staging
 // point first; the normal tangent then departs from that point at rest.
 if(rejoin&&!waypoint){
  const flat=sub(sub(from,B),mul(up,dot(sub(from,B),up))),D=Math.hypot(...flat);
  const finalSpeed=Math.sqrt(mu/radius),runway=craft.type==='shuttle'?minimumTransferDistance(0,finalSpeed):0;
  if(Math.abs(hA)>tol||D<=radius+tol||Math.sqrt(Math.max(0,(D-radius)*(D+radius)))<runway){
   const clearance=physical(target)+shipRadius;
   const radial=D>1e-6?unit(flat):plane[0];
   const stage=add(B,mul(radial,Math.max(D,Math.hypot(radius*1.05,runway*1.05),clearance*1.05)));
   const delta=sub(stage,from),length=Math.hypot(...delta);
   if(!(length>0))return {error:'No clearance to rejoin the selected orbit.'};
   return {rejoinStage:true,waypoint:true,start:from,end:stage,length,tangent:unit(delta),radial,departureRadius:0,arrivalRadius:0,initialSpeed:0,finalSpeed:0,center,arrivalPhase:0};
  }
 }
 const destinationDelta=sub(center,from),pointDistance=Math.hypot(...destinationDelta);
 const line=rejoin&&waypoint?{start:from,end:center,length:pointDistance,radial:plane[0],tangent:pointDistance?mul(destinationDelta,1/pointDistance):[...craft.flight.basis[2]]}:concentric&&craft.type==='shuttle'?circularRadiusLeg(A,ra,radius,mu,up,parked.radial,hA):concentric?concentricChord(A,ra,radius,up,mul(parked.radial,-1)):directedExternalTangent(A,ra,B,radius,up);
 // An unparked vehicle has a velocity independent of its nose. An arbitrary
 // destination cannot be reached by instantly redirecting that vector. First
 // brake along the actual velocity; from the stop there is a true tangent.
 if(manual&&!restStart&&initialSpeed>0){
  const velocity=craft.type==='shuttle'?[...craft.flight.velocity]:warpVelocity(craft.flight),direction=unit(velocity);
  if(line.error||Math.hypot(...sub(direction,line.tangent))>1e-9){
   if(Math.abs(dot(direction,up))>1e-8)return {error:'The vehicle is moving out of the route plane. Stop in the plane before starting this route.'};
   const cap=makeCapture(craft.type,from,velocity,direction,Math.hypot(...sub(B,A)),craft.flight.basis[2],up);
   const outgoing=orbitalTangentLeg(r,id,{...options,planeHeightMeters:H,orbitRadii:{...options.orbitRadii,[id]:radius}},cap.stop);
   if(outgoing.error)return outgoing;
   cap.alignT=Math.abs(Math.atan2(dot(cross(cap.retro,outgoing.tangent),up),dot(cap.retro,outgoing.tangent)))/.65;
   cap.properSeconds+=cap.alignT;cap.coordinateSeconds+=cap.alignT;
   return {...outgoing,capture:cap};
  }
 }
 if(line.error)return line;
 const phase=Math.atan2(dot(line.radial,plane[2]),dot(line.radial,plane[0])),finalSpeed=waypoint?0:Math.sqrt(mu/radius);
 if(!concentric&&craft.type==='shuttle'&&line.length+1e-4<minimumTransferDistance(initialSpeed,finalSpeed))return {error:'This tangent is too short for the Shuttle to match parking speed at 1g.'};
 const arrivalPhase=line.arrivalRadial?Math.atan2(dot(line.arrivalRadial,plane[2]),dot(line.arrivalRadial,plane[0])):phase;
 return {...line,waypoint,sourceId:parked?.parentId||fromPoint||null,targetId:id,departurePhase:phase,arrivalPhase,departureRadius:ra,arrivalRadius:radius,planeHeightMeters:H,departureHeightMeters:hA,arrivalHeightMeters:hB,initialSpeed,finalSpeed,center};
}
// A finite moving-start acquisition, only for a manual coast misaligned
// with a new leg. The coast allows a real turn to retrograde; braking at
// constant proper 1g (or a bounded warp ramp) finishes at exactly zero.
const angleBetween=(a,b)=>Math.atan2(Math.hypot(...cross(a,b)),dot(a,b));
export function makeCapture(type,start,velocity,direction,range,attitude,up){
 const speed=Math.hypot(...velocity),warp=type==='enterprise',retro=warp?[...attitude]:mul(direction,-1);
 const angle=angleBetween(attitude,retro),coastT=warp?0:Math.abs(angle)/.65;
 const beta=warp?0:Math.min(1-8*Number.EPSILON,speed/299792458),invGamma=Math.sqrt((1-beta)*(1+beta)),coastTau=coastT*invGamma,coastLag=coastT*beta*beta/(1+invGamma);
 const coast=coastT*speed,braking=warp?Math.min(range*.06,speed*.5):minimumTransferDistance(speed,0),brakeTime=warp?2*braking/speed:null;
 const brake=warp?{type,initialSpeed:speed,finalSpeed:0,peakSpeed:speed,distanceMeters:braking,properSeconds:brakeTime,coordinateSeconds:brakeTime,dilationSeconds:0,velocityControls:[speed,speed,speed,speed,0,0,0,0]}:estimateTransfer(braking,type,1,{initialSpeed:speed,finalSpeed:0});
 const length=coast+braking,stop=add(start,mul(direction,length));
 return {start:[...start],stop,velocity,direction,retro,coast,coastT,coastTau,coastLag,brake,length,speed,angle,properSeconds:coastTau+brake.properSeconds,coordinateSeconds:coastT+brake.coordinateSeconds,dilationSeconds:coastLag+brake.dilationSeconds};
}
const captureFraction=r=>r.capture?r.capture.viewSeconds/r.wallSeconds:0;
export function levelTurn(from,to,up,t){
 // Planar turns keep scene up. A pilot can also hand back a pitched
 // heading: rotate on the actual great circle, including at the endpoints.
 if(Math.abs(dot(from,up))+Math.abs(dot(to,up))>1e-9)return directionMix(from,to,transferEase(t));
 const angle=Math.atan2(dot(cross(from,to),up),dot(from,to))*transferEase(t);
 return unit(add(mul(from,Math.cos(angle)),mul(cross(up,from),Math.sin(angle))));
}
function guidedSample(t,progress,up){
 if(t.radiusTransfer){
  const sample=sampleCircularRadius(t.plan,progress),pose=circularRadiusPose(t.tangentLeg,sample);
  t.orbitRadial=pose.radial;t.orbitRadius=sample.radius;
  const drive=add(add(mul(pose.radial,sample.radialThrust),mul(pose.tangent,sample.tangentialThrust)),mul(up,sample.normalThrust));
  // Blend the parking attitude into the finite-vector burn for viewing. Drive
  // handoff always inherits the path velocity, independent of nose direction.
  const acquire=transferEase(Math.min(progress,1-progress)/.07);
  const facing=Math.hypot(...drive)>1e-12?directionMix(pose.tangent,unit(drive),acquire):pose.tangent;
  return {sample,playback:sample,...pose,facing,fraction:progress};
 }
 // At the non-tangent departure from an outer circle, let the pilot see
 // the nose slew before ignition. This is a presentation hold at contact:
 // no simulated path length or onboard travel time elapses during it.
 const prep=(t.prepSeconds||0)/t.wallSeconds;
 if(prep>0&&progress<prep){
  const v=progress/prep,facing=levelTurn(t.initialBasis[2],t.tangent,up,v);
  return {playback:{phase:'Aligning for descent',phaseIndex:0,turnAngle:0,commandedThrustG:0},sample:sampleTransfer(t.plan,0),fraction:0,p:[...t.points[0]],forward:t.tangent,facing};
 }
 if(prep>0)progress=(progress-prep)/(1-prep);
 const c=t.capture,captureViewFraction=captureFraction(t);
 if(!c||progress>=captureViewFraction){
  const u=c?(progress-captureViewFraction)/(1-captureViewFraction):progress,playback=transferPlayback(t,u),sample=playback.sample??sampleTransferAtDistance(t.plan,playback.distanceFraction),x=sample.distanceFraction;
  if(c){sample.properSeconds+=c.properSeconds;sample.coordinateSeconds+=c.coordinateSeconds;sample.dilationSeconds+=c.dilationSeconds;}
  return {playback,sample,fraction:x,p:mix(t.points[0],t.points[1],x),forward:t.tangent};
 }
 const u=progress/captureViewFraction,coastEnd=c.turnSeconds/c.viewSeconds,brakeEnd=(c.turnSeconds+(c.brakeViewSeconds||1.5))/c.viewSeconds;
 let facing,forward=c.direction,sample,x,phase,thrust=0;
 if(u<coastEnd){
  const v=u/coastEnd;x=c.coast*v;facing=levelTurn(t.initialBasis[2],c.retro,up,v);phase='Turning to brake';sample={...sampleTransfer(c.brake,0),coordinateSeconds:c.coastT*v,properSeconds:c.coastTau*v,dilationSeconds:c.coastLag*v};
 }else if(u<brakeEnd){
  const v=transferEase((u-coastEnd)/(brakeEnd-coastEnd));sample=sampleTransfer(c.brake,v);x=c.coast+sample.distanceMeters;facing=c.retro;phase=t.craftType==='enterprise'?'Reducing warp':'Braking to rest';thrust=t.craftType==='shuttle'?1:0;
  sample.coordinateSeconds+=c.coastT;sample.properSeconds+=c.coastTau;sample.dilationSeconds+=c.coastLag;
 }else{
  const v=(u-brakeEnd)/(1-brakeEnd);forward=levelTurn(c.direction,t.tangent,up,v);facing=levelTurn(c.retro,t.tangent,up,v);phase='Aligning at rest';x=c.length;
  sample={...sampleTransfer(c.brake,1),coordinateSeconds:c.coordinateSeconds-c.alignT*(1-v),properSeconds:c.properSeconds-c.alignT*(1-v),dilationSeconds:c.dilationSeconds,speedMetersPerSecond:0,rapidity:0};
 }
 return {playback:{phase,phaseIndex:3,commandedThrustG:thrust,turnAngle:0},sample,fraction:0,captureDistance:x,p:add(c.start,mul(c.direction,x)),forward,facing};
}
function gravityTimelineAt(rows,time){
 let lo=0,hi=rows.length-1;
 while(hi-lo>1){const i=(hi+lo)>>1;if(rows[i][0]<=time)lo=i;else hi=i;}
 const [t0,g0]=rows[lo],[t1,g1]=rows[hi],u=Math.max(0,Math.min(1,(time-t0)/(t1-t0||1)));
 return g0+u*(g1-g0);
}
function planRoute(r,id,options={}){
 const craft=travelCraft(r,options),item=targetInfo(r,id,options);if(!item||!craft)return {error:'Select a Shuttle or Enterprise, then choose an orbitable destination.'};
 r.fillHoles();r.fillObjects();const leg=options.tangentLeg||orbitalTangentLeg(r,id,options);if(leg.error)return leg;
 const ship=r.getFocusFrame(craft.id),shipRadius=physical(ship),manual=r.driveId===craft.id&&!craft.flight?.orbitHold,{start,end,length,initialSpeed,finalSpeed,center,tangent}=leg;
 const initialBasis=(manual?craft.flight.basis:ship.frame).map(v=>[...v]),capture=leg.capture,initialVelocity=capture?.velocity||(manual?(craft.type==='enterprise'?warpVelocity(craft.flight):[...craft.flight.velocity]):mul(tangent,initialSpeed)),points=[start,end],arc=[0,length];
 const bodies=[...r.objectFrames,...(r.state.blackHole?[r.getFocusFrame('primary'),...(r.state.binary?[r.getFocusFrame('secondary')]:[])]:[])].filter(Boolean);
 const obstacles=bodies.filter(body=>body.id!==craft.id&&body.massSolar>0&&!['disk','jets','ring','belt','dyson','anomaly'].includes(body.type)).map(body=>({
  id:body.id,name:body.name||'another body',center:mul(body.position,RG),limit:body.collapsed?compactExteriorRadius((body.horizonRadius||body.radius)*RG,clockHullMeters(r,craft,shipRadius)):physical(body)+shipRadius
 }));
 const blocked=(pos,dir,len)=>obstacles.find(body=>{
  const rel=sub(body.center,pos),along=Math.min(len,Math.max(0,dot(rel,dir)));
  return Math.hypot(...sub(rel,mul(dir,along)))<body.limit;
 });
 const brakeObstacle=capture&&blocked(capture.start,capture.direction,capture.length);
 if(brakeObstacle)return {error:'Braking along the current velocity would intersect '+brakeObstacle.name+'. Steer clear before setting this course.'};
 const obstacle=leg.radiusTransfer?obstacles.find(o=>circularRadiusObstacle(leg,o)):blocked(start,tangent,length);
 if(obstacle){
  if(leg.radiusTransfer)return {error:'The circular transfer region intersects '+obstacle.name+'. Choose another parking radius.'};
  if(options.rejoin&&!leg.rejoinStage&&!options.usedClearanceStage){
   // The departure world can hide the destination after a manual coast.
   // Test both sides in the route plane. Accept a staging point only if
   // BOTH the approach and the true onward parking tangent clear all bodies.
   const up=r.configCache.primaryBasis[1],flat=sub(tangent,mul(up,dot(up,tangent))),axis=Math.hypot(...flat)>1e-8?unit(flat):r.configCache.primaryBasis[0],side=unit(cross(up,axis));
   const middle=add(obstacle.center,mul(up,dot(sub(start,obstacle.center),up)));
   let best;
   for(const margin of [1.15,1.5,2.5,4]){
    for(let j=0;j<24;j++){
     const angle=j*Math.PI/12,offset=add(mul(axis,Math.cos(angle)),mul(side,Math.sin(angle)));
     const stage=add(middle,mul(offset,margin*obstacle.limit)),delta=sub(stage,start),len=Math.hypot(...delta),direction=unit(delta);
     if(len<=1e-4||blocked(start,direction,len))continue;
     const onward=orbitalTangentLeg(r,id,options,stage);
     if(onward.error||onward.rejoinStage||blocked(onward.start,onward.tangent,onward.length))continue;
     const score=len+onward.length;
     if(!best||score<best.score)best={score,stage,direction,len};
    }
    if(best)break;
   }
   if(best){
    const stageCapture=capture?{...capture}:null;
    if(stageCapture){const t=angleBetween(stageCapture.retro,best.direction)/.65,dt=t-stageCapture.alignT;stageCapture.alignT=t;stageCapture.coordinateSeconds+=dt;stageCapture.properSeconds+=dt;}
    return planRoute(r,id,{...options,tangentLeg:{...leg,rejoinStage:true,clearanceStage:true,capture:stageCapture,waypoint:true,end:best.stage,length:best.len,tangent:best.direction,finalSpeed:0,arrivalRadius:0}});
   }
  }
  return {error:'The straight tangent would intersect '+obstacle.name+'. Choose another stop or parking radius.'};
 }
 const plan=leg.radiusPlan?{...leg.radiusPlan}:estimateTransfer(length,craft.type,options.warpFactor??1,{initialSpeed,finalSpeed,flipCoast:craft.type==='shuttle',rejoin:!!options.rejoin,transferProperSeconds:options.transferProperSeconds});if(plan.error)return plan;
 let gravityLag=0;
 if(craft.type==='shuttle'){
  const sources=r.clockSources(),gravity=positionMeters=>Math.max(0,clockRate({id:craft.id,positionMeters,bodyRadiusMeters:shipRadius,sources}).gravityExcess||0);
  const integrate=(profile,from,to,n)=>{let previous=0;for(let i=1;i<=n;i++){const next=sampleTransfer(profile,i/n),mid=sampleTransfer(profile,(i-.5)/n);gravityLag+=(next.coordinateSeconds-previous)*gravity(mix(from,to,mid.distanceFraction));previous=next.coordinateSeconds;}};
  if(capture){const brakeStart=add(capture.start,mul(capture.direction,capture.coast));gravityLag+=capture.coastT*gravity(mix(capture.start,brakeStart,.5))+capture.alignT*gravity(capture.stop);integrate(capture.brake,brakeStart,capture.stop,8);}
  if(leg.radiusTransfer){
   // Gauss quadrature with bins clustered near both endpoints: the lapse
   // can change by orders of magnitude in the final metres of a deep pass.
   const source=sources.find(o=>o.id===id),close=source?.horizonMeters>0&&Math.hypot(Math.min(plan.ra,plan.rb),plan.height)<source.horizonMeters*1.02;
   const rows=plan.gravityTimeline=[[0,0]],steps=close?288:48,xi=Math.sqrt(3/5);
   const at=u=>gravity(circularRadiusPose(leg,sampleCircularRadius(plan,u)).p);
   let prevU=0;
   for(let i=1;i<=steps;i++){
    const u=.5*(1-Math.cos(Math.PI*i/steps)),mid=(prevU+u)*.5,du=(u-prevU)*.5;
    gravityLag+=du*plan.coordinateSeconds*(5*(at(mid-xi*du)+at(mid+xi*du))+8*at(mid))/9;
    rows.push([u*plan.coordinateSeconds,gravityLag]);prevU=u;
   }
  }else if(length>1e15&&!capture){
   // With years of travel per display second a single render sample can
   // overweight the gravity at arrival. Forecast and playback instead share
   // a small cumulative quadrature in ship time, concentrated near the ends.
   const rows=plan.gravityTimeline=[[0,0]],bins=48;let prevTime=0,prevU=0;
   for(let i=1;i<=bins;i++){
    const u=(1-Math.cos(Math.PI*i/bins))*.5,next=sampleTransfer(plan,u),mid=sampleTransfer(plan,(prevU+u)*.5);
    gravityLag+=(next.coordinateSeconds-prevTime)*gravity(mix(start,end,mid.distanceFraction));
    rows.push([next.coordinateSeconds,gravityLag]);prevTime=next.coordinateSeconds;prevU=u;
   }
  }else integrate(plan,start,end,16);
 }
 const pathParameters=Array.from({length:25},(_,i)=>i/24),pathFractions=pathParameters,pathBasePoints=pathParameters.map(u=>leg.radiusTransfer?circularRadiusPose(leg,sampleCircularRadius(plan,u)).p:mix(start,end,u));
 if(capture){capture.turnSeconds=HALF_TURN_SECONDS*Math.abs(capture.angle)/Math.PI;capture.brakeViewSeconds=craft.type==='enterprise'?3:1.5;capture.viewSeconds=capture.turnSeconds+capture.brakeViewSeconds+HALF_TURN_SECONDS*Math.acos(Math.max(-1,Math.min(1,dot(capture.retro,tangent))))/Math.PI;}
 const prepSeconds=leg.concentric&&!leg.radiusTransfer?HALF_TURN_SECONDS*Math.acos(Math.min(1,Math.max(-1,dot(leg.departureTangent,tangent))))/Math.PI:0;
 return {radiusTransfer:!!leg.radiusTransfer,radiusChange:!!leg.radiusTransfer,straight:!leg.radiusTransfer,straightLeg:!leg.radiusTransfer,rejoinOptions:leg.rejoinStage?{usedClearanceStage:!!leg.clearanceStage||!!options.usedClearanceStage,craftId:craft.id,rejoin:true,fromSequence:true,sequenceManaged:true,orbitRadii:options.orbitRadii,warpFactor:options.warpFactor}:null,prepSeconds,capture,waypoint:leg.waypoint,tangentLeg:leg,departureOrbitRadius:leg.departureRadius,initialBasis,initialVelocity,initialSpeed:capture?.speed??initialSpeed,finalSpeed,craftId:craft.id,craftType:craft.type,type:craft.type,warpFactor:plan.warpFactor,wallSeconds:TRANSFER_WALL_SECONDS+prepSeconds+(capture?.viewSeconds||0),targetId:id,targetName:item.name,targetMassSolar:r.getFocusFrame(id).massSolar||0,mode:craft.type==='shuttle'?'1g':'Warp '+Number(plan.warpFactor.toFixed(2)),coordinateSeconds:plan.coordinateSeconds+gravityLag+(capture?.coordinateSeconds||0),properSeconds:plan.properSeconds+(capture?.properSeconds||0),distanceMeters:length+(capture?.length||0),orbitRadiusMeters:leg.arrivalRadius,dilationSeconds:plan.dilationSeconds+gravityLag+(capture?.dilationSeconds||0),estimatedDilationSeconds:plan.dilationSeconds+gravityLag+(capture?.dilationSeconds||0),pathPoints:capture?[capture.start,...pathBasePoints]:pathBasePoints,pathParameters,pathBasePoints,pathFractions,plan,points,arc,center,offset:sub(end,center),phase:leg.arrivalPhase,tangent};
}
// A numerical forecast for the itinerary inspector. Skip visual path sampling,
// and retain the modelled clock deficit even when the two totals round alike.
export function summarizePlannedRoute(r,id,options){
 const route=planRoute(r,id,options);if(route.error)return route;
 const {properSeconds,coordinateSeconds,dilationSeconds,distanceMeters,plan}=route;
 let peakSpeed=plan.peakSpeed;
 if(plan.radiusTransfer||plan.velocityControls){
  // Include radial motion on a spiral and endpoint speed on a warp ramp:
  // the maximum need not fall at an endpoint or at exactly half the trip.
  const sample=plan.radiusTransfer?sampleCircularRadius:sampleTransfer,speed=u=>sample(plan,u).speedMetersPerSecond;
  let best=0,maximum=speed(0);for(let i=1;i<=64;i++){const v=speed(i/64);if(v>maximum){maximum=v;best=i;}}
  let a=Math.max(0,(best-1)/64),b=Math.min(1,(best+1)/64);
  for(let i=0;i<24;i++){const l=(2*a+b)/3,h=(a+2*b)/3;if(speed(l)>speed(h))b=h;else a=l;}
  peakSpeed=Math.max(plan.initialSpeed,plan.finalSpeed,speed((a+b)/2));
 }
 return {properSeconds,coordinateSeconds,dilationSeconds,distanceMeters,peakSpeed,
  arrivalRadial:route.tangentLeg.arrivalRadial||route.tangentLeg.radial,
  description:plan.radiusTransfer?'Powered circular radius change.':route.craftType==='enterprise'?'Warp transfer with a protected onboard clock.':'1g transfer with a flip and braking burn.'};
}
// Global orbit context plus magnified samples around the ship. A physical-size
// Shuttle is only tens of metres across while transfers span AU: global samples
// alone produce a chord that can miss the visible vehicle by kilometres.
export function routePathSamples(route,r){
 if(route.radiusTransfer){
  const leg=route.tangentLeg,plan=route.plan,u=route.curveParameter||0,here=sampleCircularRadius(plan,u),origin=circularRadiusPose(leg,here);
  const span=physical(r.getFocusFrame(route.craftId)||{})*(r.camera?.focusDistance||6);
  // Limit a multi-revolution spiral to the adjacent turns rather than drawing
  // enormous chords through its centre. Add precision samples around the ship.
  const angleAt=x=>sampleCircularRadius(plan,x).angle;
  const bound=target=>{let a=0,b=1;for(let j=0;j<36;j++){const x=(a+b)/2;if(angleAt(x)<target)a=x;else b=x;}return (a+b)/2;};
  const limit=2*Math.PI,lo=here.angle>limit?bound(here.angle-limit):0,hi=angleAt(1)>here.angle+limit?bound(here.angle+limit):1;
  const samples=new Set([lo,u,hi]);for(let i=1;i<128;i++)samples.add(lo+(hi-lo)*i/128);
  const eps=1e-6,v=sampleCircularRadius(plan,Math.min(1,u+eps)),w=sampleCircularRadius(plan,Math.max(0,u-eps)),du=Math.min(1,u+eps)-Math.max(0,u-eps);
  const localLength=Math.hypot(v.radius-w.radius,here.radius*(v.angle-w.angle))/du;
  for(let d=Math.max(1,span*.02)/Math.max(1,localLength),j=0;j<48&&d<hi-lo;j++,d*=1.65)for(const x of [u-d,u+d])if(x>lo&&x<hi)samples.add(x);
  const sorted=[...samples].sort((a,b)=>a-b);
  route.pathOffsets=sorted.map(x=>{const s=sampleCircularRadius(plan,x),d=s.angle-here.angle;return add(mul(origin.radial,(s.radius-here.radius)-2*s.radius*Math.sin(d/2)**2),mul(origin.tangent,s.radius*Math.sin(d)));});
  return route.pathOffsets.map(o=>add(origin.p,o));
 }
 if(route.straightLeg){
  // Keep signed offsets around the shuttle. On a Galactic leg even t + 1m/L
  // can round back to t; never add that small offset to a distant position
  // or to a large travelled distance before projecting the guide.
  const L=route.tangentLeg.length,T=route.tangent,c=route.capture,x=(route.curveParameter||0)*L;
  const braking=!!c&&(route.progress||0)<captureFraction(route),k=c?(braking?(route.captureDistance||0):c.length):0;
  const position=route.currentPosition||c?.start||route.points[0],ship=r.getFocusFrame(route.craftId);
  const span=Math.max(1,physical(ship||{})*(r.camera?.focusDistance||6)),points=[],offsets=[];
  function segment(start,end,along,back,ahead,shift,active,skipStart){
   const length=back+ahead,near=new Set([-back,ahead]);for(let j=1;j<24;j++)near.add(length*j/24-back);
   if(active){near.add(0);for(const factor of [.02,.05,.1,.2,.35,.5,.75,1,1.5,2,3,4,6,8,12,16,24,32,64,128,256,512,1024]){
    const d=factor*span;if(d<back)near.add(-d);if(d<ahead)near.add(d);
   }}
   for(const d of [...near].sort((a,b)=>a-b)){
    if(skipStart&&d===-back)continue;
    const local=add(shift,mul(along,d));offsets.push(local);
    points.push(active&&d===0?[...position]:d===-back?[...start]:d===ahead?[...end]:add(position,local));
   }
  }
  const zero=[0,0,0];
  if(c)segment(c.start,c.stop,c.direction,k,c.length-k,braking?zero:mul(T,-x),braking,false);
  segment(route.points[0],route.points[1],T,x,(1-(route.curveParameter||0))*L,braking?mul(c.direction,c.length-k):zero,!braking,!!c);
  route.pathOffsets=offsets;return points;
 }
 if(!route.pathParameters){route.pathParameters=Array.from({length:129},(_,i)=>i/128);route.pathBasePoints=route.pathParameters.map(u=>transferCurvePoint(route.points,u));route.pathFractions=route.pathParameters.map(u=>transferCurveFraction(route,u));}
 const current=route.curveParameter||0,position=route.currentPosition||transferCurvePoint(route.points,0),ship=r.getFocusFrame(route.craftId),physicalRadius=r.state?.bridge?(ship?.radius||0)*REFERENCE_RG_METERS:physical(ship||{radius:0}),span=Math.max(1,physicalRadius*(r.focusId===route.craftId?Math.max(1,r.camera?.focusDistance||6):6)),derivative=Math.max(1,Math.hypot(...transferCurveDerivative(route.points,current))),drift=route.targetDrift||[0,0,0];
 const entries=route.pathParameters.map((parameter,i)=>({parameter,index:i}));
 entries.push({parameter:current,index:-1});for(const factor of [.02,.05,.1,.2,.35,.5,.75,1,1.5,2,3,4,6,8,12,16,24,32,64,128,256,512,1024])for(const sign of [-1,1]){const parameter=Math.max(0,Math.min(1,current+sign*factor*span/derivative));if(parameter!==current)entries.push({parameter,index:-1});}
 entries.sort((a,b)=>a.parameter-b.parameter);const samples=[];let previous=-1;
 const pointAt=parameter=>{if(parameter===current)return [...position];const point=transferCurvePoint(route.points,parameter);if(!drift.some(Boolean))return point;const fraction=transferCurveFraction(route,parameter),factor=transferEase(fraction);return point.map((v,i)=>v+drift[i]*factor);};
 for(const {parameter,index}of entries){if(parameter===previous)continue;previous=parameter;const point=parameter===current?[...position]:index>=0?route.pathBasePoints[index].map((v,i)=>v+drift[i]*transferEase(route.pathFractions[index])):pointAt(parameter);samples.push({parameter,point});}
 // Refine only the nearby magnified curve. A bounded screen-error estimate
 // prevents sharp polygonal corners without retessellating an AU-long path.
 const observer=r.cameraFrame?.observer?.map(v=>v*REFERENCE_RG_METERS)||position,height=Math.min(1080,r.canvas?.height||650),pixelScale=height/.83,result=[];let remaining=64;
 const refine=(a,b,depth=0)=>{const parameter=(a.parameter+b.parameter)*.5,near=Math.min(Math.hypot(...sub(a.point,position)),Math.hypot(...sub(b.point,position)));if(remaining>0&&depth<6&&near<span*128){const point=pointAt(parameter),distance=Math.max(span*.1,Math.hypot(...sub(point,observer))),error=Math.hypot(...sub(point,mix(a.point,b.point,.5)))*pixelScale/distance;if(error>.35){remaining--;const m={parameter,point};refine(a,m,depth+1);refine(m,b,depth+1);return;}}result.push(b.point);};
 result.push(samples[0].point);for(let i=1;i<samples.length;i++)refine(samples[i-1],samples[i]);return result;
}
export function previewRoute(r,id,options={}){const p=planRoute(r,id,options);if(p.error)return p;
 // A preview may precede the departure tangent. Anchor the proposed line to
 // its real contact, not to the ship until the intervening arc has been flown.
 const orbit=parkedOrbitGeometry(r,p.craftId);let shift=[0,0,0];
 if(orbit){
  const radial=p.tangentLeg.radial,delta=Math.atan2(dot(orbit.normal,cross(orbit.radial,radial)),dot(orbit.radial,radial));
  shift=add(orbit.offsetAtAngle(delta),mul(orbit.normal,p.tangentLeg.planeHeightMeters-dot(orbit.center,orbit.normal)));
 }
 p.pathPoints=routePathSamples(p,r);p.pathAnchor=[...r.getFocusFrame(p.craftId).position];
 if(orbit)p.pathOffsets=p.pathOffsets.map(v=>add(v,shift));
 const {plan,points,arc,center,offset,phase,tangent,pathFractions,pathParameters,pathBasePoints,...preview}=p;return preview;}
export function beginRoute(r,id,options={}){
 r.enablePlanarRouteChart?.(options.craftId||r.selectedId);
 const orbit=parkedOrbitGeometry(r,options.craftId||r.selectedId),departureEye=orbit?parkedCameraFraming(r,orbit).eye:null,departureCameraAdjusted=!!r.parkedCamera?.released;
 const departureGuide=r.parkedCamera;
 const route=planRoute(r,id,options);if(route.error){r.lastTravelError=route.error;return false;}r.lastTravelError='';if(r.transfer?.active)cancelRoute(r);const craft=r.objects.find(o=>o.id===route.craftId),autonomous=r.driveId!==craft.id;
 const excursion=r.sceneId==='warp-excursion'&&!!r.excursionFrame?.(r.getFocusFrame(craft.id)),sideGuide=r.cameraGuide,sideDistance=r.camera.focusDistance,sideTarget=r.target.focusDistance;
 if(autonomous&&!r.setFreeDrive(craft.id,true,{guidance:true}))return false;
 if(excursion){r.cameraGuide=sideGuide;r.camera.focusDistance=sideDistance;r.target.focusDistance=sideTarget;}
 // Drive can hold its analytic orbit at zero throttle. Guidance takes over only
 // after Go, from the exact previewed pose, with no loading or respawn.
 const departure=route.capture?.start||route.points[0];delete craft.waypointHoldId;delete craft.waypointHoldBasis;craft.flight.orbitHold=false;craft.flight.position=[...departure];craft.flight.basis=route.initialBasis.map(v=>[...v]);craft.flight.velocity=[...route.initialVelocity];craft.flight.speed=route.initialSpeed;craft.driveBasis=craft.flight.basis.map(v=>[...v]);craft.drivePosition=mul(departure,1/REFERENCE_RG_METERS);
 r.navigationModes??={};r.navigationModes[craft.id]='auto';
 // A destination selected from the map may have changed the viewing target.
 if(r.focusId!==craft.id||r.focusMode!=='track')r.focusTarget(craft.id,'track');
 r.updateCameraFrame();const ship=r.getFocusFrame(craft.id),reference=r.focusReferenceFrame?.id===craft.id?r.focusReferenceFrame.basis:ship.frame,eye=unit(mul(cameraRelative(ship.position,r.cameraFrame),-1));
 if(!excursion)r.cameraGuide=null;r.focusReferenceFrame={id:craft.id,basis:reference.map(v=>[...v])};
 r.transfer={...route,departureEye,cameraAdjusted:departureCameraAdjusted,curveParameter:0,currentPosition:[...departure],currentDistanceFraction:0,targetDrift:[0,0,0],active:true,autonomous,craftId:craft.id,elapsed:0,wallSeconds:route.wallSeconds,progress:0,initialSpeed:route.initialSpeed,parkingSpeed:route.finalSpeed,initialBasis:craft.flight.basis.map(v=>[...v]),cameraBasis:reference.map(v=>[...v]),cameraEye:eye,cameraInitialUp:[...r.cameraFrame.up],cameraAngles:[r.target.yaw,r.target.pitch,r.target.lookYaw,r.target.lookPitch,r.target.focusDistance],sample:sampleTransfer(route.capture?.brake||route.plan,0),gravityLag:0,coordinateElapsedSeconds:0,properElapsedSeconds:0,phaseName:route.capture?(route.capture.turnSeconds?'Turning to brake':craft.type==='shuttle'?'Braking to rest':'Slowing down'):route.radiusTransfer?sampleCircularRadius(route.plan,0).phase:'Leaving orbit',commandedThrustG:route.radiusTransfer?sampleCircularRadius(route.plan,0).commandedThrustG:route.capture?(route.capture.turnSeconds||craft.type!=='shuttle'?0:1):undefined};
 // Keep the circular camera's local orientation and manual offsets across the change of motion authority.
 if(route.radiusTransfer&&departureGuide?.craftId===craft.id)r.parkedCamera=departureGuide;
 if(route.radiusTransfer){r.transfer.orbitRadial=route.tangentLeg.radial;r.transfer.orbitRadius=route.departureOrbitRadius;}
 r.transfer.pathPoints=routePathSamples(r.transfer,r);r.transfer.cameraTarget=mul(route.center,1/REFERENCE_RG_METERS);r.transfer.cameraAimOffset=[0,0,0];r.transfer.cameraPathUp=[...r.cameraFrame.up];r.transfer.cameraGuideBlend=0;r.lastTransfer=null;r.flightInput={speed:0,curvature:0,torsion:0};craft.flight.brakeSpeed=false;craft.flight.brakeTurn=false;r.state.paused=false;
 if(craft.type==='enterprise'){r.state.warp=true;r.warpObjectId=craft.id;r.state.warpScenario=r.sceneId==='warp-excursion'&&route.waypoint?'excursion':'orbit';r.state.warpFactor=warpForSpeed(craft.flight.speed);craft.flight.warpSetting=r.state.warpFactor;for(const o of r.objects)o.warpEnabled=o.id===craft.id;r.refreshConfiguration();}
 return true;
}
// Camera stays in the craft's normal orbit controls. Its default eye follows
// the nearby curve, not the destination or the nose during the braking flip.
export function guideRouteCamera(r,t,craft,position,pathBasis){
 if(r.bridgeHullCamera?.(craft.id))return; // Orbit/look offsets already live in the hull frame.
 if(t.radiusTransfer)return; // The ordinary orbit camera continues through the burn and hull flip.
 if(r.sceneId==='warp-excursion'&&r.excursionFrame?.(r.getFocusFrame(craft.id)))return;

 // Follow the instantaneous trajectory tangent, including during a nose flip.
 // Keep the vanishing point just above center on straight legs.
 const sceneUp=r.configCache?.primaryBasis?.[1]||pathBasis[1],forward=pathBasis[2];
 const level=(along,fallback)=>{const across=cross(sceneUp,along),right=Math.hypot(...across)>1e-8?unit(across):fallback;return [right,unit(cross(along,right)),along];};
 const path=level(forward,pathBasis[0]),toWorld=(frame,v)=>add(add(mul(frame[0],v[0]),mul(frame[1],v[1])),mul(frame[2],v[2]));
 t.cameraFollowEye=mul(forward,-1);t.cameraPathUp=[...sceneUp];
 t.cameraAimOffset=[0,0,0];t.cameraCompositionY=0;t.cameraGuideBlend=1;
 if(r.focusId===craft.id&&r.focusMode==='track'&&r.focusReferenceFrame?.id===craft.id){
  if(!t.cameraPathReference){
   const initial=level(t.capture?.direction||(t.points?unit(transferCurveDerivative(t.points,0)):forward),path[0]),entryForward=t.departureEye?mul(t.departureEye,-1):initial[2],entry=level(entryForward,initial[0]);
   t.cameraPathReference=t.cameraBasis.map(v=>entry.map(axis=>dot(v,axis)));
   t.cameraDepartureDirection=initial.map(axis=>dot(axis,entryForward));
  }
  // Stay slightly above the hull while the optical axis aims along the
 // forward path. The ship sits just below center, away from the vanishing point.
  const duration=t.wallSeconds||10,blend=transferEase(Math.min(1,t.elapsed/(duration*.14))),endBlend=transferEase(Math.max(0,(t.elapsed/duration-.86)/.14));
  const raised=toWorld(path,[0,-Math.sin(AUTO_EYE_ELEVATION),Math.cos(AUTO_EYE_ELEVATION)]);
  let aim=directionMix(toWorld(path,t.cameraDepartureDirection),raised,blend),weight=blend;
  if(endBlend>0&&!t.waypoint){
   if(!t.cameraArrivalDirection){
    if(t.bridgeRoute&&t.orbitRadiusMeters>0&&t.endPose){
     const body=r.getNavigationWaypoints?.(craft.id)?.find(o=>o.id===t.targetId),arrival=t.endPose.basis[2];
     if(body)t.cameraArrivalDirection=limbForward(mul(cross(arrival,sceneUp),t.orbitRadiusMeters),arrival,sceneUp,body.radius*REFERENCE_RG_METERS);
    }else if(t.tangent&&t.center){
     const target=r.getFocusFrame(t.targetId);
     if(target)t.cameraArrivalDirection=limbForward(sub(transferCurvePoint(t.points,1),t.center),t.tangentLeg?.arrivalTangent||t.tangent,sceneUp,(target.radius||0)*REFERENCE_RG_METERS*(r.state.lensing&&['hole','blackhole','whitehole'].includes(target.type)?2.7:1));
    }
   }
   if(t.cameraArrivalDirection){aim=directionMix(aim,t.cameraArrivalDirection,endBlend);weight*=1-endBlend;}
  }
  const body=r.getFocusFrame?.(craft.id);
  if(body)t.cameraAimOffset=mul(path[1],Math.sin(AUTO_EYE_ELEVATION-.045)*weight*(r.camera?.focusDistance||0)*body.radius);
  if(t.cameraAngles&&r.target&&[r.target.yaw,r.target.pitch,r.target.lookYaw,r.target.lookPitch,r.target.focusDistance].some((v,i)=>Math.abs(v-t.cameraAngles[i])>1e-6))t.cameraAdjusted=true;
  const relative=level(aim,path[0]);
  r.focusReferenceFrame.basis=t.cameraPathReference.map(v=>toWorld(relative,v));
 }
}

function releaseGuidedAim(r,t){
 if(r.bridgeHullCamera?.(t.craftId))return;
 if(r.sceneId==='warp-excursion'&&r.excursionFrame?.(r.getFocusFrame(t.craftId)))return;
 if(r.focusId!==t.craftId||r.focusMode!=='track'||r.focusReferenceFrame?.id!==t.craftId||!r.cameraFrame)return;
 // Bake the complete guided pose into ordinary orbit/look controls. Solving
 // only the forward vector preserved heading but could jump in camera roll.
 const body=r.getFocusFrame(t.craftId);if(!body)return;
 const frame=r.cameraFrame,c=r.camera,eyeToShip=cameraRelative(body.position,frame),worldEye=unit(mul(eyeToShip,-1)),eye=[Math.cos(c.pitch)*Math.sin(c.yaw),Math.sin(c.pitch),Math.cos(c.pitch)*Math.cos(c.yaw)],baseForward=mul(eye,-1),baseRight=unit(cross(baseForward,Math.abs(baseForward[1])>.9999?[0,0,1]:[0,1,0])),baseUp=cross(baseRight,baseForward);
 const yaw=Math.asin(Math.max(-1,Math.min(1,dot(worldEye,frame.right)))),pitch=Math.atan2(dot(worldEye,frame.up),-dot(worldEye,frame.forward)),horizontal=add(mul(baseForward,Math.cos(yaw)),mul(baseRight,Math.sin(yaw))),forward=add(mul(horizontal,Math.cos(pitch)),mul(baseUp,Math.sin(pitch))),right=add(mul(baseRight,Math.cos(yaw)),mul(baseForward,-Math.sin(yaw))),up=cross(right,forward);
 r.focusReferenceFrame={id:t.craftId,basis:[0,1,2].map(j=>add(add(mul(frame.right,right[j]),mul(frame.up,up[j])),mul(frame.forward,forward[j])))};
 c.lookYaw=r.target.lookYaw=yaw;c.lookPitch=r.target.lookPitch=pitch;c.focusDistance=r.target.focusDistance=Math.hypot(...eyeToShip)/body.radius;
}

export function releaseRouteCamera(r){const guide=r.parkedCamera||r.transfer||r.lastTransfer;if(guide)releaseGuidedAim(r,guide);r.parkedCamera=null;}
export function cancelRoute(r){if(!r.transfer?.active)return false;releaseRouteCamera(r);r.lastTransfer={...routeState(r),active:false,autopilot:false,phase:'Cancelled',stage:'Cancelled'};r.transfer=null;return true;}
export function routeState(r){const t=r.transfer;if(!t?.active)return r.lastTransfer||{active:false};return {active:true,radiusChange:!!t.radiusTransfer,radiusTransfer:!!t.radiusTransfer,departureArcSeconds:t.departureArcSeconds||0,autopilot:true,phaseIndex:t.phaseIndex||0,commandedThrustG:t.commandedThrustG??(t.craftType==='shuttle'?1:0),turningSign:t.turningSign||0,headingDegrees:t.headingDegrees||0,autonomous:t.autonomous,craftId:t.craftId,craftType:t.craftType,type:t.craftType,warpFactor:t.warpFactor,wallSeconds:t.wallSeconds,wallElapsedSeconds:t.elapsed,targetId:t.targetId,targetName:t.targetName,mode:t.mode,progress:t.progress,phase:t.phaseName,stage:t.phaseName,progressPercent:t.progress*100,remainingProperSeconds:Math.max(0,t.properSeconds-t.properElapsedSeconds),coordinateElapsedSeconds:t.coordinateElapsedSeconds,properElapsedSeconds:t.properElapsedSeconds,coordinateSeconds:t.coordinateSeconds,properSeconds:t.properSeconds,estimatedDilationSeconds:t.estimatedDilationSeconds,dilationSeconds:t.sample.dilationSeconds+t.gravityLag,orbitRadiusMeters:t.orbitRadiusMeters,pathPoints:t.pathPoints,pathOffsets:t.pathOffsets,pathLengthMeters:t.distanceMeters,cameraAdjusted:!!t.cameraAdjusted,cameraTarget:t.cameraTarget,cameraAimOffset:t.cameraAimOffset,cameraPathUp:t.cameraPathUp,cameraGuideBlend:t.cameraGuideBlend};}
function addClock(clock,key,comp,delta){const y=delta-(clock[comp]||0),old=clock[key]||0,n=Math.min(1e300,old+y);clock[comp]=(n-old)-y;clock[key]=n;}
export function advanceRoute(r,dt){
 const t=r.transfer;if(!t?.active)return false;if(t.geometryTime!==r.time){r.fillHoles();r.fillObjects();t.geometryTime=r.time;}const craft=r.objects.find(o=>o.id===t.craftId),f=craft?.flight,target=r.getFocusFrame(t.targetId);if(!f||r.driveId!==t.craftId||!target){cancelRoute(r);return false;}
 r.transferClockObjectId=craft.id;
 t.elapsed=Math.min(t.wallSeconds,t.elapsed+Math.max(0,dt));if(t.elapsed>t.wallSeconds-1e-9)t.elapsed=t.wallSeconds;const progress=t.elapsed/t.wallSeconds,shot=guidedSample(t,progress,r.configCache.primaryBasis[1]),{playback,sample,p,forward,fraction}=shot,old=t.sample;
 const curve={parameter:fraction},targetDrift=[0,0,0];r.lastGeometryTime=null;
 t.cameraTarget=[...target.position];t.curveParameter=curve.parameter;t.currentPosition=p;t.captureDistance=shot.captureDistance;t.currentDistanceFraction=sample.distanceFraction;t.targetDrift=targetDrift;t.progress=progress;t.pathPoints=routePathSamples(t,r);
 // Aircraft and camera share a level flight plane. A direction-only
 // transported frame can acquire bank in a curved transfer, even at rest.
 const normal=r.configCache.primaryBasis[1],across=cross(normal,forward),right=Math.hypot(...across)>1e-8?unit(across):(t.pathBasis||t.initialBasis)[0],up=unit(cross(forward,right)),pathBasis=[right,up,forward];t.pathBasis=pathBasis;
 const turn=craft.type==='shuttle'?playback.turnAngle:0,along=add(mul(forward,Math.cos(turn)),mul(pathBasis[0],Math.sin(turn))),basis=orthonormalFrame([sub(mul(pathBasis[0],Math.cos(turn)),mul(forward,Math.sin(turn))),pathBasis[1],along]);
 // Observer alignment yields to manual orbit/zoom; look offsets stay live.
 guideRouteCamera(r,t,craft,p,pathBasis);

 const acquire=t.capture||t.prepSeconds?1:transferEase(progress/.08),desiredAttitude=acquire>=1?basis:orthonormalFrame([directionMix(t.initialBasis[0],basis[0],acquire),directionMix(t.initialBasis[1],basis[1],acquire),directionMix(t.initialBasis[2],basis[2],acquire)]),attitude=shot.facing?orthonormalFrame([pathBasis[0],normal,shot.facing]):desiredAttitude,oldForward=f.basis[2],angle=Math.atan2(dot(cross(oldForward,attitude[2]),attitude[1]),Math.max(-1,Math.min(1,dot(oldForward,attitude[2]))));
 const priorOmega=f.angularVelocity||0;f.position=p;f.basis=attitude;f.speed=Math.min(craft.type==='shuttle'?299792458*(1-8*Number.EPSILON):Infinity,sample.speedMetersPerSecond);f.velocity=mul(forward,f.speed);f.angularVelocity=dt>0?angle/dt:0;f.headingAngle=(f.headingAngle||0)+angle;f.headingTarget=f.headingAngle;f.curvature=f.speed>0?f.angularVelocity/f.speed:0;f.torsion=0;f.thrust=craft.type==='shuttle'?playback.commandedThrustG:0;f.brakeSpeed=false;f.travelCompression=1;craft.drivePosition=mul(p,1/REFERENCE_RG_METERS);craft.driveBasis=f.basis.map(v=>[...v]);
 if(craft.type==='enterprise'){r.state.warpFactor=warpForSpeed(f.speed);f.warpSetting=r.state.warpFactor;f.gridPhase=((f.gridPhase||0)+dt*.12*Math.log1p(f.speed/299792458))%4096;}
 f.visualJet=playback.phaseIndex===2&&Number.isFinite(playback.phaseProgress)?(playback.phaseProgress<.5?1:-1):Math.max(-1,Math.min(1,(f.angularVelocity-priorOmega)/Math.max(.001,dt)));
 t.progress=progress;t.phaseName=playback.phase;t.phaseIndex=playback.phaseIndex;t.commandedThrustG=f.thrust;t.turningSign=Math.abs(f.angularVelocity)>.003?Math.sign(f.angularVelocity):0;t.headingDegrees=-Math.atan2(Math.sin(f.headingAngle),Math.cos(f.headingAngle))*180/Math.PI;
 if(craft.clock){
  const rendered=r.getFocusFrame(craft.id);if(rendered)rendered.position=[...craft.drivePosition];
  if(t.plan.gravityTimeline)sample.guidedGravityLag=gravityTimelineAt(t.plan.gravityTimeline,sample.coordinateSeconds);
  const extra=Number.isFinite(sample.guidedGravityLag)?0:Math.max(0,r.clockRateForObject(craft).gravityExcess||0),distant=Math.max(0,sample.coordinateSeconds-old.coordinateSeconds),proper=Math.max(0,sample.properSeconds-old.properSeconds),lag=Math.max(0,sample.dilationSeconds-old.dilationSeconds),gravityLag=Number.isFinite(sample.guidedGravityLag)?Math.max(0,sample.guidedGravityLag-(old.guidedGravityLag||0)):extra*distant;
  addClock(craft.clock,'coordinateSeconds','coordinateCompensation',distant+gravityLag);addClock(craft.clock,'properSeconds','properCompensation',proper);addClock(craft.clock,'lagSeconds','lagCompensation',lag+gravityLag);craft.clock.rapidityVector=mul(forward,sample.rapidity);t.gravityLag+=gravityLag;
  const required=r.advanceCrewExposure?.(craft,proper,sample);
  // Use the same locally corrected force demand for the engine and the HUD.
  // On an infeasible diagnostic track the installed engine still saturates.
  if(t.radiusTransfer&&Number.isFinite(required))t.commandedThrustG=f.thrust=sample.commandedThrustG=Math.min(1,required);
 }
 t.sample=sample;t.coordinateElapsedSeconds=sample.coordinateSeconds+t.gravityLag;t.properElapsedSeconds=sample.properSeconds;
 if(progress>=1){
  if(t.rejoinOptions){
   // Do not count the temporary staging point in the playlist or reparent
   // the ship there. Swap directly to the final tangent from this rest pose.
   r.transfer=null;f.speed=0;f.velocity=[0,0,0];f.thrust=0;f.warpSetting=0;
   if(beginRoute(r,t.targetId,t.rejoinOptions))return true;
   const q=r.flightSequences?.[craft.id];if(q){q.active=false;q.inFlight=false;q.error=r.lastTravelError;}return false;
  }
  if(!t.waypoint&&!r.canParentObject(craft.type,t.targetId,craft.id).ok){cancelRoute(r);return false;}
  const completed={...routeState(r),active:false,autopilot:false,phase:'Arrived',stage:'Arrived',commandedThrustG:0,turningSign:0};r.transfer=null;craft.completedTransfer=true;
  if(t.waypoint){
   // Detach from the old gravitational parent. Local coordinates are metres
   // relative to the origin; the marker is not a massive orbital parent.
   craft.waypointHoldId=t.targetId;craft.waypointHoldBasis=f.basis.map(v=>[...v]);
   craft.parentId='space';craft.referenceId=null;craft.placement='local';craft.motion='orbit';[craft.x,craft.y,craft.z]=t.points[1];
   f.position=[...t.points[1]];f.speed=0;f.velocity=[0,0,0];f.thrust=0;f.warpSetting=0;f.orbitHold=false;
   f.angularVelocity=0;f.curvature=0;f.torsion=0;if(craft.clock)craft.clock.rapidityVector=[0,0,0];
   delete craft.orbitMeters;delete craft.routeParkingHeightMeters;craft.heightMeters=0;craft.height=0;
  }else{
   // The parked frame now owns the orbital attitude. Do not preserve the
   // time-compressed visual yaw as a real Drive turn command or in a save.
   f.angularVelocity=0;f.curvature=0;f.torsion=0;f.thrust=0;f.visualJet=0;f.headingTarget=f.headingAngle;
   delete craft.waypointHoldId;delete craft.waypointHoldBasis;
   craft.parentId=t.targetId;craft.referenceId=null;craft.placement='orbit';craft.motion='orbit';craft.orbitMeters=t.orbitRadiusMeters;craft.radius=t.orbitRadiusMeters/(r.massScale*REFERENCE_RG_METERS);craft.routeParkingHeightMeters=t.tangentLeg.arrivalHeightMeters;craft.heightMeters=craft.routeParkingHeightMeters;craft.height=craft.heightMeters/(r.massScale*REFERENCE_RG_METERS);craft.orbitInclination=0;craft.orbitNode=0;craft.argumentPeriapsis=0;craft.orbitReferenceFrame='ecliptic';craft.eccentricity=0;craft.phase=t.phase;craft.epoch=r.time;
  }
  delete craft.orbitBarycenter;delete craft.barycentric;delete craft.orbitalPeriodSeconds;delete craft.driveRestore;
  if(craft.type==='enterprise'){const parkingWarp=t.plan.cruiseSpeed!==undefined&&!t.waypoint?warpForSpeed(t.finalSpeed):0;const shield=parkingWarp>0||r.state.blackHole||r.objectFrames.some(body=>body.collapsed);craft.warpEnabled=shield;r.state.warp=shield;r.state.warpFactor=parkingWarp;r.warpObjectId=shield?craft.id:null;r.state.warpScenario=r.sceneId==='warp-excursion'&&t.waypoint?'excursion':'orbit';}
  r.refreshConfiguration();r.fillObjects();r.setFreeDrive(craft.id,false);if(craft.driveReturn){if(!t.radiusTransfer&&(craft.type==='shuttle'||t.tangentLeg?.concentric)&&!t.waypoint)craft.driveReturn.attitudeOnly=true;else delete craft.driveReturn;}r.lastTransfer=completed;r.selectedId=craft.id;r.focusId=craft.id;r.updateCameraFrame();
 }
 return true;
}
