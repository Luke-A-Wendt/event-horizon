import {warpStudyId} from './warp-studies.js';
import {warpYawCommand} from './flight-dynamics.js';
import {PROTECTED_CLOCK_RATE,tickAtClockRate} from './object-clocks.js';
import {accumulateCrewExposure} from './crew-load.js';
import {proximityOrbits} from './proximity-orbits.js';
import {effectiveWarpRadius} from './warp-physics.js';
import {limitedCrew,oneGravityRadius} from './orbit-clearance.js';
import {HALF_TURN_SECONDS} from './travel-math.js';
// Editable flight queues and a bounded optical-chart wormhole itinerary.
// These are cinematic routes with analytic clocks, not an N-body solver.
import {parkedOrbitGeometry,parkedCameraFraming} from './orbit-path.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {bridgeWorldLayout,PROXIMA_GATE_SCENE_ID} from './proxima-gate-layout.js';
import {isBridgeGate,pairedGatePart,pairedGatePhase} from './paired-gate-flight.js';
import {bridgeConformal,bridgeIsotropicRadius,bridgeProperRadius,bridgeRayStep,bridgeTrackLoadG} from './bridge-math.js';
import {makeCapture,levelTurn,routeState,routePathSamples,guideRouteCamera,travelCraft} from './travel-routes.js';
import {estimateTransfer,buildTransferCurve,orbitTransferPath,sampleTransferCurve,transferCurvePoint,transferCurveDerivative,transferCurveFraction,sampleTransferAtDistance,sampleTransfer,TRANSFER_WALL_SECONDS,transferEase} from './travel-math.js';
import {orthonormalFrame,warpForSpeed,warpVelocity} from './flight-dynamics.js';
import {arcPlaybackFraction} from './travel-math.js';
import {contactPlaybackClock,contactPlaybackProgress} from './contact-playback.js';
import {ensureParkingPlaylist,setFlightSequence,advanceFlightSequences,beginSequenceOrbitWait,BRIDGE_PARKING_SECONDS} from './flight-sequence.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1)),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const findBody=(r,key)=>key==='primary'&&r.state.blackHole?r.getFocusFrame('primary'):r.objects.find(o=>o.catalogId===key||(o.name||'').toLowerCase()===String(key).toLowerCase());
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const isWorld=id=>id==='bridge-near-world'||id==='bridge-far-world';
function blendDirection(a,b,t){const d=clamp(dot(a,b),-1,1);if(d>.999)return unit(add(mul(a,1-t),mul(b,t)));const angle=Math.acos(d),axis=d<-.999?unit(cross(a,Math.abs(a[1])<.8?[0,1,0]:[1,0,0])):unit(sub(b,mul(a,d)));return add(mul(a,Math.cos(angle*t)),mul(axis,Math.sin(angle*t)));}
export function manualDriveEligibility(r,id){const c=r.objects.find(o=>o.id===id);return {allowed:!!c&&['shuttle','enterprise'].includes(c.type),reason:c&&['shuttle','enterprise'].includes(c.type)?'':'Select a spacecraft.'};}
function bridgeOrbit(r,far=false,craftId,radiusMeters){
 const b=r.configCache.bridgeRadius*REFERENCE_RG_METERS,plane=r.configCache.primaryBasis,craft=r.objects.find(o=>o.id===(craftId||r.bridgeObjectId));
 const world=bridgeWorldLayout(far,r.sceneId);
 const distance=world.distance*b,R=radiusMeters||r.flightSequences?.[craft?.id]?.nodes.find(n=>n.targetId===(far?'bridge-far-world':'bridge-near-world'))?.radiusMeters||Math.max(oneGravityRadius(craft?.type,world.massSolar)*world.radius*b/world.radiusMeters,world.radius*b*1.04+2*(craft?r.objectRadius(craft)*REFERENCE_RG_METERS:0)),factor=far?b*b/(4*(distance*distance-R*R)):1;
 const physicalRadiusMeters=R*world.radiusMeters/(world.radius*b),speed=limitedCrew(craft?.type)?Math.sqrt(1.32712440018e20*world.massSolar/physicalRadiusMeters):R*factor*.12;return {center:mul(plane[2],distance*factor),radius:R*factor,speed,localRadiusMeters:physicalRadiusMeters,physicalRadiusMeters:limitedCrew(craft?.type)?physicalRadiusMeters:undefined,plane,far};
}
function orbitPose(orbit,phase){const {center,radius,plane}=orbit,radial=add(mul(plane[0],Math.cos(phase)),mul(plane[2],Math.sin(phase))),forward=unit(add(mul(plane[0],Math.sin(phase)),mul(plane[2],-Math.cos(phase))));return {position:add(center,mul(radial,radius)),basis:[unit(cross(plane[1],forward)),plane[1],forward]};}
function waypointPose(r,id,forward,heading){
 const b=r.configCache.bridgeRadius*REFERENCE_RG_METERS,plane=r.configCache.primaryBasis,far=id==='bridge-far-world',radius=isBridgeGate(id)?b*.5:bridgeIsotropicRadius((far?-6:6)*b,b);
 const direction=Number.isFinite(heading)?add(mul(plane[0],-Math.sin(heading*Math.PI/180)),mul(plane[2],Math.cos(heading*Math.PI/180))):forward;
 return {position:mul(plane[2],radius),basis:orthonormalFrame([cross(plane[1],direction),plane[1],direction])};
}
function setBridgePose(r,craft,pose){r.lastGeometryTime=null;craft.drivePosition=mul(pose.position,1/REFERENCE_RG_METERS);craft.driveBasis=pose.basis.map(v=>[...v]);if(craft.flight){craft.flight.position=[...pose.position];craft.flight.basis=pose.basis.map(v=>[...v]);}}
export function bridgeTravelTargets(r,options={}){
 if(!r.state.bridge||!travelCraft(r,options))return [];
 const b=r.configCache.bridgeRadius,axis=r.configCache.primaryBasis[2],worlds=r.state.bridgeSurfaces,earth=r.state.bridgeWorlds==='earth-proxima';
 const paired=r.sceneId===PROXIMA_GATE_SCENE_ID,nearWorld=bridgeWorldLayout(false,r.sceneId),farWorld=bridgeWorldLayout(true,r.sceneId);
 const near=worlds?nearWorld.distance*b:bridgeIsotropicRadius(6*b,b),far=worlds?b/(4*farWorld.distance):bridgeIsotropicRadius(-6*b,b);
 const gate=(id,name,side)=>({id,name,type:'waypoint',side,position:mul(axis,b*.5),radius:0,waypoint:true});
 return [{id:'bridge-near-world',name:worlds?(earth||paired?'Earth':'Caladan'):r.sceneId==='bridge-nebulae'?'Fire waypoint':'Near-side space',type:worlds?'planet':'waypoint',side:'near',position:mul(axis,near),radius:worlds?nearWorld.radius*b:0,waypoint:!worlds},
 ...(paired?[gate('bridge-earth-gate','Earth gate','near')]:[gate('bridge-throat','Wormhole throat','throat')]),
 {id:'bridge-far-world',name:worlds?(paired?'Proxima Centauri':earth?'Proxima Centauri b':'Arakas'):r.sceneId==='bridge-nebulae'?'Ice waypoint':'Far-side space',type:paired?'star':worlds?'planet':'waypoint',side:'far',position:mul(axis,far),radius:worlds?farWorld.radius*b/(4*farWorld.distance**2):0,waypoint:!worlds},
 ...(paired?[gate('bridge-proxima-gate','Proxima gate','far')]:[])].map(t=>({...t,label:t.name,virtual:true}));
}
export function bridgeParkingOrbit(r,id){
 const p=r.bridgeParking?.[id];if(!r.state.bridge||!p||!isWorld(p.targetId)||!r.state.bridgeSurfaces||r.objects.find(o=>o.id===id)?.flight?.orbitHold===false)return null;
 const orbit=bridgeOrbit(r,p.targetId==='bridge-far-world',id),pose=orbitPose(orbit,p.phase),throat=r.configCache.bridgeRadius*REFERENCE_RG_METERS,world=bridgeWorldLayout(orbit.far,r.sceneId),scale=world.radiusMeters/(world.radius*throat);
 // Bridge "worlds" set the route speed/length scale; there is no separate
 // planetary gravitational field in the Ellis metric. This track is guided.
 const k=mul(sub(orbit.center,pose.position),1/(orbit.radius*orbit.radius));
 const requiredSupportG=bridgeTrackLoadG(pose.position,pose.basis[2],k,throat,scale,orbit.speed);
 return {center:mul(orbit.center,1/REFERENCE_RG_METERS),radius:orbit.radius/REFERENCE_RG_METERS,localRadiusMeters:orbit.localRadiusMeters,physicalRadiusMeters:orbit.physicalRadiusMeters,circularSpeedMetersPerSecond:orbit.speed,basis:orbit.plane,phase:p.phase,targetId:p.targetId,requiredSupportG};
}
export function configureAutopilot(r,preset){
 r.autopilot=null;r.flightSequences={};r.bridgeParking={};
 const craft=r.objects.find(o=>['shuttle','enterprise'].includes(o.type));if(!craft)return null;
 if(r.state.bridge){
  r.state.bridgeTravel=false;r.state.warp=false;r.warpObjectId=null;craft.warpEnabled=false;const id='bridge-near-world',pose=r.state.bridgeSurfaces?orbitPose(bridgeOrbit(r,false,craft.id),-Math.PI/2):waypointPose(r,id,mul(r.configCache.primaryBasis[2],-1));
  setBridgePose(r,craft,pose);r.bridgeParking[craft.id]={targetId:id,phase:-Math.PI/2};
  const paired=preset.id===PROXIMA_GATE_SCENE_ID;
  const stops=paired?['bridge-near-world','bridge-earth-gate','bridge-far-world','bridge-proxima-gate']:r.state.bridgeSurfaces?['bridge-near-world','bridge-throat','bridge-far-world','bridge-throat']:['bridge-near-world','bridge-far-world'];
  const nodes=stops.map(targetId=>({targetId,...(paired&&isWorld(targetId)?{extraLaps:1}:{}),warpFactor:craft.type==='enterprise'?0:1}));setFlightSequence(r,craft.id,nodes,{loop:true});
 }else if(warpStudyId(preset.id)==='warp-excursion'){
  const m=r.massScale,b=r.configCache.primaryBasis,near=r.configCache.horizon[0]+r.objectRadius(craft)*effectiveWarpRadius(r.state.warpFactor)*1.2+.18*m;
  const far=Math.max(near+3*m,craft.radius*m),axis=add(mul(b[0],Math.cos(craft.phase)),mul(b[2],Math.sin(craft.phase)));
  const stops=[['Outer turnaround',far],['Horizon approach',near]].map(([name,radius])=>{
   const [x,y,z]=mul(add(mul(axis,radius),mul(b[1],craft.height*m*.2)),REFERENCE_RG_METERS);
   return r.addChildObject('space','waypoint',{name,x,y,z});
  });
  const first=stops[0];Object.assign(craft,{placement:'local',parentId:'space',referenceId:null,x:first.x,y:first.y,z:first.z,waypointHoldId:first.id,waypointHoldBasis:orthonormalFrame([cross(b[1],mul(axis,-1)),b[1],mul(axis,-1)])});
  const cruiseWarp=r.state.warpFactor;r.state.warpFactor=0;
  r.selectedId=craft.id;r.refreshConfiguration();
  setFlightSequence(r,craft.id,stops.map(stop=>({targetId:stop.id,kind:'waypoint',warpFactor:cruiseWarp})),{loop:true});
 }else if(preset.autopilot){
  // The previous scene may have packed a different hole (or none).
  // Resolve the physical primary for these stops before deriving either radius.
  if(preset.autopilot.destinations.some(s=>(s.target||s)==='primary'))r.fillHoles();
  const nodes=[];
  for(const stop of preset.autopilot.destinations){
   const body=findBody(r,stop.target||stop);if(!body)continue;
   const node={targetId:body.id,...(stop.extraLaps!==undefined?{extraLaps:stop.extraLaps}:{})};
   if(craft.type==='enterprise'&&preset.autopilot.transferProperSeconds>0)node.transferProperSeconds=preset.autopilot.transferProperSeconds;
   if(craft.type==='enterprise'&&preset.autopilot.cruiseWarpLimit)node.warpFactor=preset.autopilot.cruiseWarpLimit;
   if(stop.radiusMeters>0)node.radiusMeters=stop.radiusMeters;
   if(stop.recovery)node.radiusMeters=proximityOrbits(r,craft,body)[stop.recovery];
   nodes.push(node);
  }
  if(nodes.length<2)return null;
  if(preset.autopilot.startAtFirstOrbit)r.setOrbitRadiusMeters(craft.id,nodes[0].radiusMeters);
  setFlightSequence(r,craft.id,nodes,{loop:true,restartOnLoop:preset.id==='nasa-shuttle',legacyRadii:preset.autopilot.legacyRadii??(preset.id!=='solar-system')});
 }else{
  // Natural parking orbits are visible playlist items too. Leave the scene's
  // existing orbital clock untouched until another destination is appended.
  for(const vehicle of r.objects)ensureParkingPlaylist(r,vehicle);
  return null;
 }
 const q=r.flightSequences[craft.id];if(!q)return null;q.active=true;beginSequenceOrbitWait(r,q);r.navigationModes??={};r.navigationModes[craft.id]='auto';
 const targets=new Map(r.getTravelTargets({craftId:craft.id}).map(o=>[o.id,o]));
 r.autopilot={enabled:true,engaged:true,kind:r.state.bridge?'bridge':warpStudyId(preset.id)==='warp-excursion'?'waypoint':'orbital',craftId:craft.id,destinations:q.nodes.map(n=>({id:n.targetId,name:targets.get(n.targetId)?.name||n.targetId})),at:0,next:1,waitSeconds:q.waitSeconds,inFlight:false,phase:craft.waypointHoldId?'At waypoint':'Parking orbit',legsCompleted:0,error:''};return r.autopilot;
}
export function autopilotState(r){
 const m=r.dockingMission,q=m?.playlist&&r.flightSequences?.[m.craftId];
 if(q)return {enabled:q.active,engaged:q.active,kind:'orbital',craftId:m.craftId,phase:m.sample?.phase||'Rendezvous',targetName:r.objectById.get(m.stationId)?.name||'Station',waitSeconds:0,legsCompleted:q.legsCompleted,error:q.error||''};
 const a=r.autopilot;if(!a)return null;return {enabled:a.enabled,engaged:a.enabled,kind:a.kind,craftId:a.craftId,phase:r.transfer?.phaseName||a.phase,targetName:a.destinations[a.next]?.name||'',waitSeconds:Math.max(0,a.waitSeconds||0),legsCompleted:a.legsCompleted,error:a.error||''};}
function advanceBridgeParking(r,dt){
 if(!r.state.bridge||r.transfer?.active)return;
 for(const [id,park]of Object.entries(r.bridgeParking||{})){
  const craft=r.objects.find(o=>o.id===id);if(!craft||craft.flight&&!craft.flight.orbitHold)continue;
  const previousPhase=park.phase;let pose;
  if(r.state.bridgeSurfaces&&isWorld(park.targetId)){const waiting=r.flightSequences?.[id]?.active&&r.flightSequences[id].orbitWait;park.phase=waiting?waiting.startPhase-waiting.sweepRadians*arcPlaybackFraction(Math.min(1,(waiting.elapsed+dt)/waiting.wallSeconds)):Math.atan2(Math.sin(park.phase-dt*.12),Math.cos(park.phase-dt*.12));pose=orbitPose(bridgeOrbit(r,park.targetId==='bridge-far-world',id),park.phase);}
  else{const forward=craft.flight?.basis[2]||craft.driveBasis?.[2]||mul(r.configCache.primaryBasis[2],-1);pose=waypointPose(r,park.targetId,forward,park.heading);}
  const tangent=pose.basis[2];
  if(r.navigationModes?.[id]==='manual'&&craft.flight?.orbitHold){
   const a=previousPhase-park.phase,co=Math.cos(a),si=Math.sin(a),n=r.configCache.primaryBasis[1];
   pose.basis=craft.flight.basis.map(v=>add(add(mul(v,co),mul(cross(n,v),si)),mul(n,dot(n,v)*(1-co))));
  }
  setBridgePose(r,craft,pose);
  if(craft.flight){const f=craft.flight,speed=r.state.bridgeSurfaces&&isWorld(park.targetId)?bridgeOrbit(r,park.targetId==='bridge-far-world',id).speed:0;f.speed=speed;f.velocity=mul(tangent,speed);f.thrust=0;f.angularVelocity=speed?.12:0;f.warpSetting=0;f.orbitHold=true;}
 }
}
export function advanceAutopilot(r,dt){if(r.state.paused||!(dt>0))return false;const visibleDt=dt>1?.1:dt;advanceBridgeParking(r,visibleDt);return advanceFlightSequences(r,visibleDt);}
function bridgePlan(r,id,options={},departure=null){
 const craft=travelCraft(r,options),target=bridgeTravelTargets(r,options).find(t=>t.id===id);if(!craft||!target)return {error:'Select a spacecraft and a destination.'};
 if(!departure)r.fillObjects();const frame=departure?null:r.getFocusFrame(craft.id);if(!departure&&!frame)return {error:'The spacecraft is unavailable.'};
 const f=!departure&&r.driveId===craft.id?craft.flight:null,start=departure?.pose||{position:f?[...f.position]:mul(frame.position,REFERENCE_RG_METERS),basis:(f?.basis||(r.sceneId===PROXIMA_GATE_SCENE_ID&&craft.driveBasis)||frame.frame).map(v=>[...v])},b=r.configCache.bridgeRadius*REFERENCE_RG_METERS,plane=r.configCache.primaryBasis;
 if(options.rejoin&&craft.type==='shuttle'&&f&&!f.orbitHold&&Math.hypot(...f.velocity)>0){
  const direction=unit(f.velocity),world=bridgeWorldLayout(Math.hypot(...start.position)<b*.5,r.sceneId),scale=r.state.bridgeSurfaces?world.radiusMeters/(world.radius*b):1;
  const c=makeCapture('shuttle',start.position,f.velocity,direction,0,start.basis[2],plane[1]);
  // The generic braking profile measures SI distance; only its drawing is
  // converted to the wormhole's compressed isotropic chart.
  const ds=bridgeRayStep(start.position,direction,b,c.length/scale),end=add(start.position,mul(direction,ds));
  const points=[start.position,end],built=buildTransferCurve(points),turnSeconds=HALF_TURN_SECONDS*c.angle/Math.PI,wallSeconds=turnSeconds+1.5;
  return {craftId:craft.id,craftType:craft.type,type:craft.type,targetId:id,targetName:target.name,waypoint:target.waypoint,mode:'1g · rejoining playlist',
   rejoinBrake:{...c,ds,b,scale,turnSeconds,options:{...options,rejoin:false}},initialSpeed:c.speed,initialThrust:turnSeconds?0:1,wallSeconds,
   startPose:start,endPose:{position:end,basis:orthonormalFrame([start.basis[0],plane[1],c.retro])},parts:[{plan:c.brake}],points,arc:built.arc,length:ds,
   pathPoints:points,distanceMeters:c.length,coordinateSeconds:c.coordinateSeconds,properSeconds:c.properSeconds,dilationSeconds:c.dilationSeconds,estimatedDilationSeconds:c.dilationSeconds};
 }
 const near=Math.hypot(...start.position)>=b*.5,direction=mul(plane[2],isBridgeGate(id)?(near?-1:1):id==='bridge-far-world'?-1:1),endOrbit=r.state.bridgeSurfaces&&isWorld(id)?bridgeOrbit(r,id==='bridge-far-world',craft.id,departure?.endRadius):null,gate=mul(plane[2],b*.5),towardGate=endOrbit?sub(gate,endOrbit.center):null,endPhase=endOrbit&&r.sceneId===PROXIMA_GATE_SCENE_ID?(endOrbit.far?1:-1)*Math.PI/2:endOrbit?Math.atan2(dot(towardGate,plane[2]),dot(towardGate,plane[0]))-Math.acos(Math.min(1,endOrbit.radius/Math.hypot(...towardGate))):0;
 const end=endOrbit?orbitPose(endOrbit,endPhase):waypointPose(r,id,direction,options.heading),fromThroat=Math.hypot(...sub(start.position,mul(plane[2],b*.5)))<b*1e-6,crossing=!isBridgeGate(id)&&!fromThroat&&(options.viaThroat||near!==(id==='bridge-near-world'));
 if(Math.hypot(...sub(start.position,end.position))<Math.max(1e-5,(departure?r.objectRadius(craft):frame.radius)*REFERENCE_RG_METERS*.001))return {error:'Already at this waypoint or orbit.'};
 const throat=waypointPose(r,'bridge-throat',direction,options.throatHeading),stops=crossing?[throat,end]:[end],parts=[];let from=start;
 const pairedGate=crossing&&craft.type==='shuttle'&&r.sceneId===PROXIMA_GATE_SCENE_ID;
 const world=bridgeWorldLayout(!near,r.sceneId);
 const initialSpeed=Math.max(0,departure?.speed??f?.speed??(pairedGate?bridgeOrbit(r,!near,craft.id).speed:0)),warpRejoin=craft.type==='enterprise'&&!!options.rejoin,initialWarp=warpRejoin?8:Number.isFinite(options.warpFactor)?options.warpFactor:1,impulse=craft.type==='enterprise'&&initialWarp===0,scale=r.state.bridgeSurfaces?world.radiusMeters/(world.radius*b):1;
 for(let index=0;index<stops.length;index++){
  const to=stops[index],last=index===stops.length-1,partWarp=!warpRejoin&&crossing&&index===0&&Number.isFinite(options.throatWarpFactor)?options.throatWarpFactor:initialWarp,partImpulse=craft.type==='enterprise'&&partWarp===0,parking=r.bridgeParking?.[craft.id],startOrbit=departure?(index===0?departure.orbit:null):index===0&&(!f||f.orbitHold)&&r.state.bridgeSurfaces&&isWorld(parking?.targetId)?bridgeOrbit(r,parking.targetId==='bridge-far-world',craft.id):null;
  const velocity=index===0&&f?(craft.type==='enterprise'?warpVelocity(f):f.velocity):null;
  const tangent=velocity&&Math.hypot(...velocity)>1e-6?unit(velocity):from.basis[2];
  if(pairedGate){
   const far=index===0?!near:near,layout=bridgeWorldLayout(far,r.sceneId),localScale=layout.radiusMeters/(layout.radius*b);
   const part=pairedGatePart(from,to,b,far,localScale,index===0?initialSpeed:1200,last?endOrbit?.speed||0:1200);
   if(part.plan.error)return part.plan;
   parts.push(part);from=to;continue;
  }
  const handle=Math.hypot(...sub(to.position,from.position))*.30,points=r.state.bridgeSurfaces?{segments:[[from.position,add(from.position,mul(tangent,handle)),sub(to.position,mul(to.basis[2],handle)),to.position]]}:orbitTransferPath({start:from.position,end:to.position,startCenter:startOrbit?.center||null,startTangent:tangent,endCenter:last?endOrbit?.center:null,endTangent:to.basis[2],lift:[0,0,0]}),built=buildTransferCurve(points);
  let properLength=0,previous=transferCurvePoint(points,0);for(let i=1;i<=64;i++){const point=transferCurvePoint(points,i/64),mid=mul(add(previous,point),.5);properLength+=Math.hypot(...sub(point,previous))*bridgeConformal(Math.hypot(...mid),b);previous=point;}
  let plan=estimateTransfer(properLength*scale,partImpulse?'shuttle':craft.type,partWarp,{rejoin:warpRejoin,initialSpeed:index===0?initialSpeed:0,finalSpeed:last&&endOrbit?endOrbit.speed:0});if(plan.minimumDistanceMeters>properLength*scale)plan=estimateTransfer(plan.minimumDistanceMeters*1.001,partImpulse?'shuttle':craft.type,partWarp,{rejoin:warpRejoin,initialSpeed:index===0?initialSpeed:0,finalSpeed:last&&endOrbit?endOrbit.speed:0});
  if(partImpulse){plan.properSeconds=plan.coordinateSeconds;plan.dilationSeconds=0;}
  parts.push({points,arc:built.arc,length:built.length,plan,impulse:partImpulse,warpFactor:partWarp,initialSpeed:index===0?initialSpeed:0});from=to;
 }
 const cinematicBridge=craft.type==='enterprise'&&!r.state.bridgeSurfaces&&crossing&&impulse&&!Number.isFinite(options.throatHeading),wallSeconds=pairedGate?30:cinematicBridge?Math.PI/.12:options.wallSeconds??TRANSFER_WALL_SECONDS;
 // A radial passage is a single leg in signed proper distance l, even
 // though its isotropic chart radius changes scale at the throat. Never
 // insert a second rest-to-rest burn or a chart-speed kink at the crossing.
 const axis=plane[2],r0=dot(start.position,axis),r1=dot(end.position,axis);
 const radialPass=cinematicBridge&&r0>0&&r1>0&&Math.hypot(...sub(start.position,mul(axis,r0)))<1e-9*b&&
  dot(direction,start.basis[2])>1-1e-12&&dot(direction,end.basis[2])>1-1e-12?
  {r0,r1,b,l0:bridgeProperRadius(r0,b),l1:bridgeProperRadius(r1,b)}:null;
 const flyThrough=!pairedGate&&crossing&&craft.type==='shuttle',throughPlan=radialPass?estimateTransfer(Math.abs(radialPass.l1-radialPass.l0)*scale,'shuttle',1,{initialSpeed}):
  flyThrough?estimateTransfer(parts.reduce((n,p)=>n+p.plan.distanceMeters,0),'shuttle',1,{initialSpeed,finalSpeed:parts.at(-1).plan.finalSpeed}):null;
 const peakFraction=flyThrough?sampleTransfer(throughPlan,throughPlan.upRapidity/(throughPlan.upRapidity+throughPlan.downRapidity)).distanceFraction:.5;
 const points={segments:parts.flatMap(p=>p.points.segments)},built=buildTransferCurve(points),alignHold=pairedGate||warpRejoin||cinematicBridge||flyThrough?0:(crossing||id==='bridge-throat')?(crossing?TRANSFER_WALL_SECONDS/10:TRANSFER_WALL_SECONDS/5):0;
 const totals=parts.reduce((a,p)=>({coordinateSeconds:a.coordinateSeconds+p.plan.coordinateSeconds,properSeconds:a.properSeconds+p.plan.properSeconds,dilationSeconds:a.dilationSeconds+p.plan.dilationSeconds}),{coordinateSeconds:alignHold,properSeconds:alignHold,dilationSeconds:0});
 if(throughPlan)Object.assign(totals,{coordinateSeconds:throughPlan.coordinateSeconds,properSeconds:radialPass?throughPlan.coordinateSeconds:throughPlan.properSeconds,dilationSeconds:radialPass?0:throughPlan.dilationSeconds});
 // The two mouths have very different chart scales. Use each planet's
 // *local chart radius*, never its SI radius or its opposite-mouth image.
 const parked=r.bridgeParking?.[craft.id],fromOrbit=departure?departure.orbit:
  r.state.bridgeSurfaces&&isWorld(parked?.targetId)&&(!f||f.orbitHold)?bridgeOrbit(r,parked.targetId==='bridge-far-world',craft.id):null;
 const baseView=flyThrough?Math.max(14,wallSeconds):wallSeconds;
 const contactClock=!pairedGate&&(fromOrbit||endOrbit)?contactPlaybackClock(parts.reduce((n,p)=>n+p.length,0),fromOrbit?.radius||0,endOrbit?.radius||0,baseView):null;
 const pathPoints=departure?[]:Array.from({length:193},(_,i)=>transferCurvePoint(points,i/192));
 return {craftId:craft.id,craftType:craft.type,type:craft.type,mode:craft.type==='shuttle'?'1g · wormhole shortcut':impulse?'Impulse · wormhole shortcut':warpRejoin?'Warp recovery':'Warp '+initialWarp,warpFactor:warpRejoin?Math.max(...parts.map(p=>p.plan.warpFactor)):initialWarp,targetId:id,targetName:target.name,waypoint:target.waypoint,heading:options.heading,wallSeconds:contactClock?.wallSeconds??baseView,contactClock,pairedGate,cinematicBridge,radialPass,flyThrough,throughPlan,peakFraction,distanceMeters:throughPlan?.distanceMeters??parts.reduce((s,p)=>s+p.plan.distanceMeters,0),orbitRadiusMeters:endOrbit?.radius||0,pathPoints,parts,points,arc:built.arc,length:built.length,crossing,fromThroat,impulse,alignHold,endPose:end,endPhase,startPose:start,initialSpeed,initialThrust:f?.thrust||0,coordinateSeconds:totals.coordinateSeconds,properSeconds:totals.properSeconds,dilationSeconds:totals.dilationSeconds,estimatedDilationSeconds:totals.dilationSeconds};
}
// Estimate from the stop's authored departure contact rather than the current
// craft pose. A throat between two worlds belongs to one compound flight.
export function bridgePlaylistLeg(r,craft,sequence,fromIndex,toIndex){
 const nodes=sequence?.nodes||[],len=nodes.length,at=i=>sequence.loop&&len?nodes[(i+len)%len]:nodes[i];
 const from=nodes[fromIndex],to=nodes[toIndex];
 if(!r.state.bridge||!craft||!from||!to)return {error:'Bridge leg unavailable.'};
 let origin=from,destination=to,gate=null,section=-1;
 if(isBridgeGate(to.targetId)&&isWorld(at(toIndex+1)?.targetId)&&isWorld(from.targetId)){
  gate=to;destination=at(toIndex+1);section=0;
 }else if(isBridgeGate(from.targetId)&&isWorld(at(fromIndex-1)?.targetId)&&isWorld(to.targetId)){
  gate=from;origin=at(fromIndex-1);section=1;
 }
 const axis=r.configCache.primaryBasis,b=r.configCache.bridgeRadius*REFERENCE_RG_METERS;
 const orbit=r.state.bridgeSurfaces&&isWorld(origin.targetId)?bridgeOrbit(r,origin.targetId==='bridge-far-world',craft.id,origin.radiusMeters):null;
 const forward=mul(axis[2],origin.targetId==='bridge-near-world'||destination.targetId==='bridge-far-world'?-1:1);
 let pose;
 if(orbit){
  const gateVector=sub(mul(axis[2],b*.5),orbit.center);
  const angle=Math.atan2(dot(gateVector,axis[2]),dot(gateVector,axis[0]))+Math.acos(Math.min(1,orbit.radius/Math.hypot(...gateVector)));
  pose=orbitPose(orbit,r.sceneId===PROXIMA_GATE_SCENE_ID?(orbit.far?1:-1)*Math.PI/2:angle);
 }else pose=waypointPose(r,origin.targetId,forward);
 const initialPark=r.bridgeParking?.[craft.id]?.targetId===origin.targetId&&r.driveId!==craft.id&&!craft.completedTransfer;
 const plan=bridgePlan(r,destination.targetId,{craftId:craft.id,warpFactor:destination.warpFactor??1,heading:destination.heading,viaThroat:!!gate,throatHeading:gate?.heading,throatWarpFactor:gate?.warpFactor},{pose,orbit,endRadius:destination.radiusMeters,speed:initialPark&&r.sceneId!==PROXIMA_GATE_SCENE_ID?0:orbit?.speed||0});
 if(plan.error)return plan;
 const description=gate?'Bridge passage via the throat':plan.crossing?'Bridge crossing':'Bridge approach';
 const total={flyThroughThroat:!!(gate&&(plan.throughPlan||plan.pairedGate)),properSeconds:plan.properSeconds,coordinateSeconds:plan.coordinateSeconds,dilationSeconds:plan.dilationSeconds,distanceMeters:plan.distanceMeters,peakSpeed:plan.throughPlan?.peakSpeed??Math.max(...plan.parts.map(p=>p.plan.peakSpeed)),description};
 if(craft.type==='enterprise'){
  const parts=section<0?plan.parts:plan.parts.slice(section,section+1);
  total.maxWarp=Math.max(0,...parts.map(p=>p.impulse?0:warpForSpeed(plan.throughPlan?.peakSpeed??p.plan.peakSpeed)));
 }
 if(section<0)return total;
 if(plan.throughPlan){
  const frac=plan.radialPass?Math.abs(plan.radialPass.l0/(plan.radialPass.l1-plan.radialPass.l0)):plan.peakFraction;
  const cross=sampleTransferAtDistance(plan.throughPlan,frac);
  for(const key of ['properSeconds','coordinateSeconds','dilationSeconds','distanceMeters']){
   const part=plan.radialPass&&key==='properSeconds'?cross.coordinateSeconds:plan.radialPass&&key==='dilationSeconds'?0:cross[key];
   total[key]=section?Math.max(0,total[key]-part):part;
  }
  return total;
 }
 const part=plan.parts[section]?.plan;
 if(!part)return {error:'The throat is not crossed on this leg.'};
 const hold=section===0?plan.alignHold:0;
 return {...total,properSeconds:part.properSeconds+hold,coordinateSeconds:part.coordinateSeconds+hold,dilationSeconds:part.dilationSeconds,distanceMeters:part.distanceMeters,peakSpeed:part.peakSpeed};
}
export function previewBridgeRoute(r,id,options={}){const plan=bridgePlan(r,id,options);if(plan.error)return plan;const {parts,points,arc,endPose,startPose,...preview}=plan;return preview;}
export function beginBridgeRoute(r,id,options={}){
 const route=bridgePlan(r,id,options);if(route.error)return route;const craft=r.objects.find(o=>o.id===route.craftId),orbit=parkedOrbitGeometry(r,craft.id),departureEye=orbit?parkedCameraFraming(r,orbit).eye:null,camera={camera:clone(r.camera),target:clone(r.target),focusId:r.focusId,focusMode:r.focusMode,focusReferenceFrame:clone(r.focusReferenceFrame)};
 if(r.driveId!==craft.id&&!r.setFreeDrive(craft.id,true,{guidance:true}))return false;
 Object.assign(r,camera);r.transfer=null;setBridgePose(r,craft,route.startPose);craft.flight.orbitHold=false;delete r.bridgeParking?.[craft.id];r.state.bridgeTravel=false;
 r.navigationModes??={};r.navigationModes[craft.id]='auto';r.fillObjects();r.updateCameraFrame();
 const first=sampleTransferAtDistance(route.parts[0].plan,0),sample={...first,coordinateSeconds:0,properSeconds:0,dilationSeconds:0,bridgeProperG:route.rejoinBrake?bridgeTrackLoadG(route.startPose.position,route.rejoinBrake.direction,[0,0,0],route.rejoinBrake.b,route.rejoinBrake.scale,first.speedMetersPerSecond,route.initialThrust):null};
 if(r.focusId===craft.id&&r.focusMode==='track'){const frame=r.getFocusFrame(craft.id);r.focusReferenceFrame={id:craft.id,basis:(r.focusReferenceFrame?.id===craft.id?r.focusReferenceFrame.basis:frame.frame).map(v=>[...v])};}
 r.transfer={...route,departureEye,active:true,bridgeRoute:true,autonomous:true,autopilot:true,elapsed:0,progress:0,phaseName:route.rejoinBrake?(route.rejoinBrake.turnSeconds?'Turning to brake':'Braking to rest'):'Leaving orbit',sample,gravityLag:0,coordinateElapsedSeconds:0,properElapsedSeconds:0,commandedThrustG:craft.type==='shuttle'?route.initialThrust:0,headingDegrees:0,turningSign:0,curveParameter:0,currentPosition:[...route.startPose.position],cameraTarget:mul(route.endPose.position,1/REFERENCE_RG_METERS),initialBasis:route.startPose.basis.map(v=>[...v]),currentDistanceFraction:0};
 const reference=r.focusReferenceFrame?.basis||r.getFocusFrame(craft.id).frame,t=r.transfer;t.cameraBasis=reference.map(v=>[...v]);t.cameraEye=unit(sub(r.cameraFrame.observer,mul(route.startPose.position,1/REFERENCE_RG_METERS)));t.cameraInitialUp=[...r.cameraFrame.up];t.cameraAimOffset=[0,0,0];t.cameraPathUp=[...r.cameraFrame.up];t.cameraGuideBlend=0;t.cameraAngles=[r.target.yaw,r.target.pitch,r.target.lookYaw,r.target.lookPitch,r.target.focusDistance];
 r.lastTransfer=null;r.flightInput={speed:0,curvature:0,torsion:0};r.state.paused=false;return true;
}
function addClock(clock,key,comp,delta){const y=delta-(clock[comp]||0),old=clock[key]||0,n=old+y;clock[comp]=(n-old)-y;clock[key]=n;}
// The two wormhole charts use very different length scales. Allocate view
// time to changes of heading as well as chart distance, separately on each
// side, so the flip still occurs exactly at the throat.
const bridgeViewClocks=new WeakMap();
function bridgePlaybackCurve(part,u){
 let knots=bridgeViewClocks.get(part);
 if(!knots){
  const pts=[[0,0,0]],angle=(a,b)=>Math.acos(clamp(dot(a,b),-1,1)),tangent=x=>unit(transferCurveDerivative(part.points,x));
  let turn=0;
  const addSample=(a,b,ta,tb,depth)=>{const x=(a+b)/2,mid=tangent(x),left=angle(ta,mid),right=angle(mid,tb);
   if(depth<8&&Math.max(left,right)>.04){addSample(a,x,ta,mid,depth+1);addSample(x,b,mid,tb,depth+1);return;}
   turn+=left+right;pts.push([b,turn,transferCurveFraction(part,b)]);
  };
  const n=part.points.segments.length*8;let last=tangent(0);
  for(let i=1;i<=n;i++){const next=tangent(i/n);addSample((i-1)/n,i/n,last,next,0);last=next;}
  for(const p of pts)p[1]=turn>.001?.82*p[1]/turn+.18*p[2]:p[2];
  knots=pts;bridgeViewClocks.set(part,knots);
 }
 let a=0,b=knots.length-1;while(b-a>1){const m=(a+b)>>1;if(knots[m][1]<=u)a=m;else b=m;}
 const x=knots[a],y=knots[b],v=clamp((u-x[1])/Math.max(1e-16,y[1]-x[1])),parameter=x[0]+(y[0]-x[0])*v;
 return transferCurveFraction(part,parameter);
}
function bridgePhase(t,progress){
 if(t.pairedGate)return pairedGatePhase(t,progress);
 if(t.parts[0].plan.rejoinCruise!==undefined){
  const i=Math.min(t.parts.length-1,Math.floor(progress*t.parts.length)),u=progress*t.parts.length-i,sample=sampleTransfer(t.parts[i].plan,u),sign=sample.accelerationSign;
  return {index:i,stage:sign>0?1:sign<0?3:2,local:u,ease:sample.distanceFraction,second:i>0,fraction:sample.distanceFraction,turn:0,phase:sign>0?'Warp acceleration':sign<0?'Slowing down':'Warp cruise',thrust:0,hold:0};
 }
 if(t.flyThrough){
  // One continuous burn/brake profile. The throat is a pass-through constraint,
  // not a second arrival; cinematic chart distances map onto the analytic peak.
  const width=HALF_TURN_SECONDS/(t.contactClock?.baseSeconds??t.wallSeconds),fp=(progress-(1-width)/2)/width,second=progress>=.5,local=second?(progress-.5)*2:progress*2,distance=(Number(second)+transferEase(local))/2;
  // Rotate off the braking attitude while still on the insertion leg;
  // the final orbital tangent is then also the ship's final heading.
  const insertion=(progress-.76)/.24,turn=Math.PI*(transferEase(fp)+transferEase(insertion)),flipping=fp>=0&&fp<=1,aligning=insertion>0;
  return {index:second?1:0,stage:aligning?4:flipping?2:second?3:1,local:aligning?insertion:fp,ease:distance,second,fraction:bridgePlaybackCurve(t.parts[second?1:0],second?(distance-.5)*2:distance*2),turn,phase:aligning?'Aligning for arrival':flipping?'Flip through gate':progress<.12?'Leaving orbit':progress>.88?'Entering orbit':second?'Decelerating':'Accelerating',thrust:flipping||aligning?0:1,hold:0};
 }

 if(t.radialPass){
  const {r0,r1,b,l0,l1}=t.radialPass,distance=.5-.5*Math.cos(Math.PI*progress),l=l0+(l1-l0)*distance;
  const radius=bridgeIsotropicRadius(l,b),gate=.5*b,second=l0*l<=0;
  const fraction=clamp(second?(radius-gate)/(r1-gate):(radius-r0)/(gate-r0));
  return {index:second?1:0,stage:2,local:progress,ease:distance,second,fraction,turn:0,phase:second?'Leaving the bridge':'Approaching the bridge',thrust:0,hold:0};
 }
 if(t.cinematicBridge){const distance=.5-.5*Math.cos(Math.PI*progress),second=distance>=.5;return {index:second?1:0,stage:2,local:progress,ease:distance,second,fraction:second?(distance-.5)*2:distance*2,turn:0,phase:second?'Leaving the bridge':'Approaching the bridge',thrust:0,hold:0};}
 const count=t.crossing?10:5;let clock=progress*count;
 if(t.craftType==='shuttle'&&!t.crossing){
  const view=t.contactClock?.baseSeconds??t.wallSeconds,other=(view-2*HALF_TURN_SECONDS)/3;let left=progress*view;
  for(let i=0;i<5;i++){const duration=i===2||i===4?HALF_TURN_SECONDS:other;if(left<=duration||i===4){clock=i+Math.min(1,left/duration);break;}left-=duration;}
 }
 const index=Math.min(count-1,Math.floor(clock)),local=clock-index,ease=transferEase(local),second=t.crossing&&index>=5,stage=second?index-5:index;
 const ends=second||(!t.crossing&&!t.waypoint)?[0,.06,.48,.52,.94,1]:[0,.06,.48,.52,1,1],rawFraction=ends[stage]+(ends[stage+1]-ends[stage])*ease,fraction=rawFraction<1e-12?0:rawFraction>1-1e-12?1:rawFraction;
 const shuttle=t.craftType==='shuttle',turn=shuttle?(stage<2?0:stage===2?Math.PI*ease:stage===4?Math.PI*(1+ease):Math.PI):0;
 const nearNames=['Leaving orbit','Accelerating','Flip','Decelerating',t.crossing||t.waypoint?'Flip before throat':'Entering orbit'],farNames=['Pass through throat','Accelerating','Flip','Decelerating','Entering orbit'];
 const cruiseNames=['Departing','Accelerating','Cruising','Slowing',t.crossing||t.waypoint?'Aligning at throat':'Entering orbit'],farCruise=['Pass through throat','Accelerating','Cruising','Slowing','Entering orbit'];
 const phase=(shuttle?(second?farNames:nearNames):(second?farCruise:cruiseNames))[stage],thrust=shuttle&&stage!==2&&!(stage===4&&(t.crossing&&!second||t.waypoint))?1:0;
 return {index,stage,local,ease,second,fraction,turn,phase,thrust,hold:!second&&stage===4&&(t.crossing||t.waypoint)?t.alignHold*local:second?t.alignHold:0};
}
function advanceBridgeBrake(r,t,craft,f,dt){
 const c=t.rejoinBrake,turn=t.elapsed<c.turnSeconds,coasting=turn?t.elapsed/c.turnSeconds:1;
 const brake=sampleTransfer(c.brake,turn?0:transferEase((t.elapsed-c.turnSeconds)/1.5));
 const proper=brake.properSeconds+c.coastTau*coasting,coordinate=brake.coordinateSeconds+c.coastT*coasting,lag=brake.dilationSeconds+c.coastLag*coasting;
 const ds=bridgeRayStep(c.start,c.direction,c.b,(c.coast*coasting+brake.distanceMeters)/c.scale),position=add(c.start,mul(c.direction,ds));
 const up=r.configCache.primaryBasis[1],along=turn?levelTurn(t.startPose.basis[2],c.retro,up,coasting):c.retro,old=f.basis[2],basis=orthonormalFrame([t.startPose.basis[0],up,along]);
 setBridgePose(r,craft,{position,basis});f.speed=brake.speedMetersPerSecond;f.velocity=mul(c.direction,f.speed);f.thrust=turn?0:1;f.orbitHold=false;
 const omega=f.angularVelocity||0;f.angularVelocity=dt?Math.atan2(dot(cross(old,along),up),dot(old,along))/dt:0;f.visualJet=clamp((f.angularVelocity-omega)/Math.max(.001,dt),-1,1);
 t.phaseName=turn?'Turning to brake':'Braking to rest';t.commandedThrustG=f.thrust;t.progress=t.elapsed/t.wallSeconds;t.curveParameter=t.currentDistanceFraction=ds/Math.max(1e-100,c.ds);t.currentPosition=position;
 if(craft.clock){for(const [key,comp,delta] of [['coordinateSeconds','coordinateCompensation',coordinate-t.sample.coordinateSeconds],['properSeconds','properCompensation',proper-t.sample.properSeconds],['lagSeconds','lagCompensation',lag-t.sample.dilationSeconds]])addClock(craft.clock,key,comp,Math.max(0,delta));craft.clock.rapidityVector=mul(c.direction,brake.rapidity);}
 const load=bridgeTrackLoadG(position,c.direction,[0,0,0],c.b,c.scale,f.speed,f.thrust);
 accumulateCrewExposure(craft.clock,proper-t.sample.properSeconds,t.sample.bridgeProperG,load);
 t.sample={...brake,properSeconds:proper,coordinateSeconds:coordinate,dilationSeconds:lag,bridgeProperG:load};t.coordinateElapsedSeconds=coordinate;t.properElapsedSeconds=proper;
 guideRouteCamera(r,t,craft,position,orthonormalFrame([basis[0],up,c.direction]));t.pathPoints=routePathSamples(t,r);
 if(t.elapsed>=t.wallSeconds){
  f.speed=0;f.velocity=[0,0,0];f.thrust=0;r.transfer=null;
  const result=beginBridgeRoute(r,t.targetId,c.options);
  if(!result||result.error){const q=r.flightSequences?.[craft.id];if(q){q.active=false;q.inFlight=false;q.error=result?.error||'Unable to rejoin the bridge route.';}return false;}
 }
 return true;
}
export function advanceBridgeAutopilot(r,dt){
 const t=r.transfer;if(!t?.active||!t.bridgeRoute)return false;const craft=r.objects.find(o=>o.id===t.craftId),f=craft?.flight;if(!craft||!f)return false;r.transferClockObjectId=craft.id;
 t.elapsed=Math.min(t.wallSeconds,t.elapsed+Math.max(0,dt));if(t.elapsed>t.wallSeconds-1e-8)t.elapsed=t.wallSeconds;
 if(t.rejoinBrake)return advanceBridgeBrake(r,t,craft,f,dt);
 const progress=t.elapsed/t.wallSeconds,baseProgress=contactPlaybackProgress(t.contactClock,progress,u=>{
  const ph=bridgePhase(t,u),part=t.parts[ph.second?1:0];
  return ((ph.second?t.parts[0].length:0)+part.length*ph.fraction)/t.contactClock.length;
 }),phase=bridgePhase(t,baseProgress),part=t.parts[phase.second?1:0],raw=phase.sample||sampleTransferAtDistance(t.throughPlan||part.plan,t.radialPass?phase.ease:t.flyThrough?(phase.second?t.peakFraction+(1-t.peakFraction)*phase.fraction:t.peakFraction*phase.fraction):phase.fraction),before=!t.throughPlan&&phase.second?t.parts[0].plan:null;
 if(part.impulse){raw.properSeconds=raw.coordinateSeconds;raw.dilationSeconds=0;}
 // This authored curve schedules each chart segment for the camera, separately
 // from the longitudinal clock. Neither a nonzero throttle nor a rotating
 // nose establishes the net proper acceleration of the drawn worldline.
 const restingAtWaypoint=t.alignHold>0&&!phase.second&&phase.stage===4&&phase.fraction===1&&raw.speedMetersPerSecond===0;
 const sample={...raw,bridgeProperG:restingAtWaypoint?0:null,coordinateSeconds:raw.coordinateSeconds+(before?.coordinateSeconds||0)+phase.hold,properSeconds:raw.properSeconds+(before?.properSeconds||0)+phase.hold,dilationSeconds:raw.dilationSeconds+(before?.dilationSeconds||0)};
 const curve=sampleTransferCurve(part,phase.fraction),forward=unit(transferCurveDerivative(part.points,curve.parameter)),up=r.configCache.primaryBasis[1],right=unit(cross(up,forward)),targetAlong=unit(add(mul(forward,Math.cos(phase.turn)),mul(right,Math.sin(phase.turn)))),along=blendDirection(t.initialBasis[2],targetAlong,transferEase(progress/.08)),basis=orthonormalFrame([cross(up,along),up,along]),old=t.sample,previousForward=[...f.basis[2]];
 const consumed=phase.second?t.parts[0].length:0,distanceFraction=(consumed+part.length*phase.fraction)/Math.max(1e-30,t.length),global=sampleTransferCurve(t,distanceFraction);t.curveParameter=global.parameter;t.currentDistanceFraction=distanceFraction;t.currentPosition=[...curve.position];
 setBridgePose(r,craft,{position:curve.position,basis});
 // Follow the local chart leg. A concatenated curve has differently scaled
 // parameter intervals; using those intervals for metre-sized lookahead can
 // jump across the throat even though the positions and tangents agree.
 const whole={points:t.points,arc:t.arc,curveParameter:t.curveParameter,currentDistanceFraction:t.currentDistanceFraction};
 t.points=part.points;t.arc=part.arc;t.curveParameter=curve.parameter;t.currentDistanceFraction=phase.fraction;
 guideRouteCamera(r,t,craft,curve.position,[right,up,forward]);Object.assign(t,whole);
 const priorOmega=f.angularVelocity||0;f.speed=raw.speedMetersPerSecond;f.velocity=mul(forward,f.speed);f.thrust=phase.thrust;f.orbitHold=false;f.brakeSpeed=false;f.angularVelocity=dt>0?Math.atan2(dot(cross(previousForward,along),up),clamp(dot(previousForward,along),-1,1))/dt:0;f.headingAngle=Math.atan2(dot(along,r.configCache.primaryBasis[0]),dot(along,r.configCache.primaryBasis[2]));f.headingTarget=f.headingAngle;
 if(craft.type==='enterprise'){f.warpSetting=warpForSpeed(f.speed);r.state.warpFactor=f.warpSetting;r.state.warp=!part.impulse&&f.warpSetting>0;r.warpObjectId=r.state.warp?craft.id:null;craft.warpEnabled=r.state.warp;}
 const turnFraction=phase.local;
 f.visualJet=craft.type==='enterprise'?warpYawCommand(dt>0?(f.angularVelocity-priorOmega)/dt:0):(phase.stage===2||phase.stage===4)&&turnFraction>0&&turnFraction<1?(turnFraction<.5?1:-1):clamp((f.angularVelocity-priorOmega)/Math.max(.001,dt),-1,1);
 t.progress=progress;t.phaseIndex=phase.index;t.phaseName=phase.phase;t.commandedThrustG=f.thrust;t.headingDegrees=-f.headingAngle*180/Math.PI;t.turningSign=Math.sign(f.angularVelocity);t.sample=sample;t.coordinateElapsedSeconds=sample.coordinateSeconds;t.properElapsedSeconds=sample.properSeconds;
 if(craft.clock&&craft.type==='enterprise')tickAtClockRate(craft.clock,sample.coordinateSeconds-old.coordinateSeconds,PROTECTED_CLOCK_RATE);
 else if(craft.clock&&craft.type==='shuttle'){accumulateCrewExposure(craft.clock,sample.properSeconds-old.properSeconds,old.bridgeProperG,sample.bridgeProperG);for(const [key,comp,delta]of [['coordinateSeconds','coordinateCompensation',sample.coordinateSeconds-old.coordinateSeconds],['properSeconds','properCompensation',sample.properSeconds-old.properSeconds],['lagSeconds','lagCompensation',sample.dilationSeconds-old.dilationSeconds]])addClock(craft.clock,key,comp,Math.max(0,delta));craft.clock.rapidityVector=mul(forward,sample.rapidity);}
 t.pathPoints=routePathSamples(t,r);
 if(progress>=1){
  setBridgePose(r,craft,t.endPose);r.lastTransfer={...routeState(r),active:false,autopilot:false,phase:'Arrived',stage:'Arrived',commandedThrustG:0,turningSign:0};r.transfer=null;craft.completedTransfer=true;f.thrust=0;f.speed=r.state.bridgeSurfaces&&isWorld(t.targetId)?bridgeOrbit(r,t.targetId==='bridge-far-world',craft.id).speed:0;f.velocity=mul(t.endPose.basis[2],f.speed);f.angularVelocity=f.speed?.12:0;f.warpSetting=0;f.orbitHold=true;r.bridgeParking??={};r.bridgeParking[craft.id]={targetId:t.targetId,phase:t.endPhase,...(Number.isFinite(t.heading)?{heading:t.heading}:{})};if(craft.type==='enterprise'){r.state.warp=false;r.warpObjectId=null;craft.warpEnabled=false;}
 }
 return true;
}
