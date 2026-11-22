import {sceneCruiseWarp} from './config.js';
import {edgeKerrMetric,kerrCircularState} from './kerr-transfer.js';
import {warpForSpeed} from './flight-dynamics.js';
import {resolveOrbitLaps,validExtraLaps} from './orbit-laps.js';
import {tickAtClockRate,createObjectClock,PROTECTED_CLOCK_RATE} from './object-clocks.js';
import {stopMinimumMeters,oneGravityRadius,limitedCrew} from './orbit-clearance.js';
// User-authored route queues use the same commands as the preset demonstrations.
// Only one leg is planned at a time; no work scales with the simulated trip time.
import {orbitalTangentLeg,sequencePlaneHeight} from './travel-routes.js';
import {arcPlaybackFraction} from './travel-math.js';
import {turnDuration,attitudeAngle,blendAttitude} from './flight-attitude.js';
import {bridgeWorldLayout} from './proxima-gate-layout.js';
import {isBridgeGate,bridgeTangentContacts} from './paired-gate-flight.js';
import {REFERENCE_RG_METERS} from './objects.js';
const RG=REFERENCE_RG_METERS;
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const craftFor=(r,id)=>{const ids=id?[id]:[r.selectedId,r.focusId,r.driveId];return ids.map(key=>r.objects.find(o=>o.id===key&&['shuttle','enterprise'].includes(o.type))).find(Boolean);};
// Viewing time for a complete revolution. The physical orbital clock is integrated separately.
export const SEQUENCE_ORBIT_SECONDS=24;
const SEQUENCE_LEG_SECONDS=10;
// Use the same angular pacing on planetary parking arcs in either wormhole chart.
export const BRIDGE_PARKING_SECONDS=SEQUENCE_ORBIT_SECONDS;
const TAU=2*Math.PI;
const blank=craftId=>({craftId,nodes:[],loop:false,active:false,index:0,waitSeconds:0,inFlight:false,legsCompleted:0,advanceCount:1,orbitWait:null,holding:false,error:''});
// A parked Auto vehicle has a real orbit item even if it was added in the
// editor or its last queued destination was removed.
function stopRadius(r,craft,id,target,legacy=false){
 if(target.waypoint)return undefined;
 if(r.state.bridge)return (r.getNavigationWaypoints(craft.id).find(n=>n.id===id)?.radius||0)*RG*(id==='bridge-far-world'?4*bridgeWorldLayout(true,r.sceneId).distance**2:1)*1.04+2*r.objectRadius(craft)*RG;
 if(craft.parentId===id&&craft.placement==='orbit')return craft.orbitMeters||craft.radius*r.massScale*RG;
 if(legacy){const leg=orbitalTangentLeg(r,id,{craftId:craft.id});if(leg.arrivalRadius>0)return leg.arrivalRadius;}
 const f=r.getFocusFrame(id);return Math.max(1,Math.max(f?.horizonRadius||0,f?.physicalRadius||f?.radius||0)*1.1*RG,(f?.physicalRadius||f?.radius||0)*RG+r.objectRadius(craft)*RG);
}
function assignLaps(r,nodes){
 return resolveOrbitLaps(nodes,id=>{const f=r.getFocusFrame(id);return f?.collapsed||['hole','blackhole','whitehole'].includes(f?.type);});
}
// Old files and automatic stops omit the override. Resolve them against the
// restored objects (including compact remnants), not against a stale preset.
function restoreLapDefaults(r,q){
 if(q?.nodes.some(n=>n.extraLaps===undefined&&(!n.kind||n.kind==='orbit'))){
  if(q.nodes.some(n=>!n.kind)){const targets=new Map(r.getTravelTargets({craftId:q.craftId}).map(t=>[t.id,t]));for(const n of q.nodes)if(!n.kind)n.kind=targets.get(n.targetId)?.waypoint?'waypoint':'orbit';}
  assignLaps(r,q.nodes);
 }
}
export function ensureParkingPlaylist(r,craft){
 if(!craft||craft.hullModel==='janusPod'||!['shuttle','enterprise'].includes(craft.type)||r.navigationModes?.[craft.id]==='manual'||r.transfer?.craftId===craft.id)return null;
 const existing=r.flightSequences?.[craft.id],id=parkedAt(r,craft);
 if(r.dockingMission?.craftId===craft.id)return existing||null;
 if(existing?.nodes.length&&!(existing.holding&&existing.nodes.length===1&&id&&id!==existing.nodes[0].targetId))return existing;
 if(!id)return null;
 const target=r.getTravelTargets({craftId:craft.id}).find(t=>t.id===id);
 if(!target||(target.waypoint&&existing&&!existing.nodes.length)||(!target.waypoint&&!r.state.bridge&&craft.placement!=='orbit'))return null;
 r.navigationModes??={};r.navigationModes[craft.id]='auto';r.flightSequences??={};
 return r.flightSequences[craft.id]={...blank(craft.id),active:true,holding:true,nodes:assignLaps(r,[{targetId:id,...(craft.type==='enterprise'?{warpFactor:r.state.warpFactor}:{}),kind:target.waypoint?'waypoint':'orbit',...(!target.waypoint?{radiusMeters:stopRadius(r,craft,id,target)}:{})}])};
}
export function flightSequenceState(r,id){
 const craft=craftFor(r,id),q=craft&&(ensureParkingPlaylist(r,craft)||r.flightSequences?.[craft.id]);restoreLapDefaults(r,q);const result=clone(q||blank(craft?.id||id||null));if(craft&&q?.active&&!r.transfer?.active){result.orbitalAccelerationG=orbitalPathGravityUnits(r,craft);if(parkedAt(r,craft))result.orbitalSpeed=q.orbitWait?.speedMetersPerSecond??(craft.waypointHoldId?0:r.state.bridge?(r.getBridgeParkingOrbit(craft.id)?.circularSpeedMetersPerSecond||0):Math.sqrt(1.32712440018e20*r.parentMassSolar(craft)/(craft.orbitMeters||craft.radius*r.massScale*RG)));}return result;
}
// Edits are cheap: retain the current leg unless its destination/commands
// change. A changed current item is replanned from the live vehicle state.
const legKey=(nodes,index,loop,bridge)=>{const first=nodes[index],leg=isBridgeGate(first?.targetId)?[first,nodes[index+1]||(loop?nodes[0]:null)]:[first];return JSON.stringify(leg.map(n=>n?[n.targetId,n.kind,n.port??null,n.radiusMeters??null,n.warpFactor??1,n.transferProperSeconds??null,bridge?n.heading??null:null]:null));};
export function setFlightSequence(r,id,nodes,options={}){
 const craft=craftFor(r,id);if(!craft||!Array.isArray(nodes)||nodes.length>64)return false;
 const targets=new Map(r.getTravelTargets({craftId:craft.id}).map(o=>[o.id,o]));
 if(nodes.some(n=>!n||!targets.has(n.targetId)||n.kind!==undefined&&!['orbit','waypoint','dock'].includes(n.kind)||n.warpFactor!==undefined&&(!Number.isFinite(n.warpFactor)||n.warpFactor<0||n.warpFactor>=10)||n.heading!==undefined&&(!Number.isFinite(n.heading)||Math.abs(n.heading)>360)))return false;
 if(nodes.some(n=>{const berth=targets.get(n.targetId).dockable;return berth?(n.kind!==undefined&&n.kind!=='dock'||n.port!==undefined&&!['south','north'].includes(n.port)||['radiusMeters','extraLaps','transferProperSeconds','heading','warpFactor'].some(k=>n[k]!==undefined)):(n.kind==='dock'||n.port!==undefined);}))return {error:'Choose a Meridian station port for docking, or an orbit for a celestial body.'};
 if(nodes.some(n=>n.transferProperSeconds!==undefined&&(craft.type!=='enterprise'||!Number.isFinite(n.transferProperSeconds)||n.transferProperSeconds<=0)))return false;
 if(nodes.some(n=>n.extraLaps!==undefined&&(!validExtraLaps(n.extraLaps)||targets.get(n.targetId).waypoint)))return {error:'Full orbits must be a whole number from 0 to 99 on an orbital stop.'};
 const old=r.flightSequences?.[craft.id];
 r.fillHoles();r.fillObjects();
 const cruiseLimit=craft.type==='enterprise'?sceneCruiseWarp(r.sceneId):null;
 const normalized=nodes.map(n=>targets.get(n.targetId).dockable?{targetId:n.targetId,kind:'dock',port:n.port||'south'}:({targetId:n.targetId,kind:targets.get(n.targetId).waypoint?'waypoint':'orbit',...(n.extraLaps!==undefined?{extraLaps:n.extraLaps}:{}),...(n.defaultExtraLaps!==undefined?{defaultExtraLaps:n.defaultExtraLaps}:{}),...(!targets.get(n.targetId).waypoint?{radiusMeters:n.radiusMeters??stopRadius(r,craft,n.targetId,targets.get(n.targetId),options.legacyRadii)}:{}),...(cruiseLimit?{warpFactor:Math.min(cruiseLimit,Math.max(.1,n.warpFactor??cruiseLimit))}:n.warpFactor!==undefined?{warpFactor:n.warpFactor}:{}),...(!cruiseLimit&&n.transferProperSeconds!==undefined?{transferProperSeconds:n.transferProperSeconds}:{}),...(n.heading!==undefined?{heading:n.heading}:{})}));
 for(const [i,n] of normalized.entries())if(n.kind==='orbit'&&nodes[i].radiusMeters===undefined&&limitedCrew(craft.type)){
  const world=bridgeWorldLayout(n.targetId==='bridge-far-world',r.sceneId);
  const floor=r.state.bridge?oneGravityRadius(craft.type,world.massSolar)*world.radius*r.configCache.bridgeRadius*RG/world.radiusMeters:oneGravityRadius(craft.type,r.getFocusFrame(n.targetId)?.massSolar);
  n.radiusMeters=Math.max(floor,n.radiusMeters);
 }
 assignLaps(r,normalized);
 const parked=parkedAt(r,craft);
 // Preserve a leg already underway or the currently occupied stop, but never
 // insert the current body into an explicitly edited list: reaching its first
 // destination may require a one-off departure from outside the playlist.
 if(normalized.some(n=>n.radiusMeters!==undefined&&(!Number.isFinite(n.radiusMeters)||n.radiusMeters<=0)))return false;
 for(const [i,n] of normalized.entries()){
  if(nodes[i].radiusMeters===undefined||old?.nodes.some(prev=>prev.targetId===n.targetId&&prev.radiusMeters===n.radiusMeters)||!n.radiusMeters)continue;
  if(!r.state.bridge){const minimum=stopMinimumMeters(r,craft,n.targetId);
   if(n.radiusMeters<minimum||n.radiusMeters>1e17)return {error:'Choose a circle radius of at least '+(minimum/1000)+' km for vehicle clearance, and below 100 trillion km.'};
  }else if(n.radiusMeters>=bridgeWorldLayout(n.targetId==='bridge-far-world',r.sceneId).distance*r.configCache.bridgeRadius*RG)return {error:'Choose a parking orbit that fits between the planet and the bridge.'};
 }
 // A radius edit of a unique occupied stop moves that orbit. A second orbit
 // of the same body is a separate destination, not an edit to the first.
 const occupiedMatches=n=>n.targetId===parked;
 const currentStop=normalized.filter(occupiedMatches).length===1&&normalized.find(occupiedMatches),oldStop=old?.nodes?.filter(occupiedMatches).length===1&&old.nodes.find(occupiedMatches);
 if(!r.state.bridge&&!r.transfer?.active&&currentStop?.radiusMeters&&oldStop&&currentStop.radiusMeters!==oldStop.radiusMeters){
  const result=r.setOrbitRadiusMeters(craft.id,currentStop.radiusMeters);if(!result)return false;currentStop.radiusMeters=result.radiusMeters;
 }
 const previous=old?.nodes?.[old.index],matchesPrevious=n=>sameStop(n,previous);
 // An append continues past already played items. A replacement starts at
 // its first item even if the craft happens to sit at its new *last* item.
 let cursor=0;
 if(old?.inFlight){
  cursor=matchesPrevious(normalized[old.index])?old.index:Math.max(0,normalized.findIndex(matchesPrevious));
 }else if(old&&parked){
  const occupied=isOccupied(r,craft,previous,parked)?old.index:old.nodes.findIndex(n=>isOccupied(r,craft,n,parked));
  if(occupied>=0&&old.nodes.slice(0,occupied+1).every((n,i)=>sameStop(n,normalized[i])))cursor=occupied;
 }
 const index=Number.isInteger(options.index)?options.index:cursor;
 const q={...blank(craft.id),orbitRadii:{...old?.orbitRadii},nodes:normalized,loop:options.loop===undefined?!!old?.loop:!!options.loop,index:Math.max(0,Math.min(index,Math.max(0,normalized.length-1))),legsCompleted:old?.legsCompleted||0};
 // Replaying the authored proximity study is a timeline cut, not a return
 // flight. Ordinary edited itineraries still use ordinary loop transfers.
 if(options.restartOnLoop||(old?.restartOnLoop&&normalized.length===old.nodes.length&&normalized.every((n,i)=>sameStop(n,old.nodes[i])))){
  q.restartOnLoop=true;q.replayPhase=old?.replayPhase??r.currentPhase(craft);
 }
 r.flightSequences??={};r.flightSequences[craft.id]=q;
 // The docking pilot flies the currently committed contact. The queue remains
 // editable; the next departure is always looked up from the latest queue.
 const mission=r.dockingMission?.craftId===craft.id&&r.dockingMission;
 if(mission){
  const sameBerth=n=>n?.kind==='dock'&&n.targetId===mission.stationId&&n.port===(mission.side<0?'south':'north');
  if(!Number.isInteger(options.index)&&sameBerth(previous)){
   const i=sameBerth(normalized[old.index])?old.index:normalized.findIndex(sameBerth);q.index=Math.max(0,i);
  }
  q.active=!!nodes.length&&(options.active??!!old?.active);q.inFlight=q.active&&mission.phase!=='docked';
  if(q.active)mission.playlist=true;
  q.holding=q.active&&mission.phase==='docked'&&sameBerth(q.nodes[q.index])&&(q.nodes.length===1||!q.loop&&q.index===q.nodes.length-1);
  q.pendingAtContact=q.active&&!sameBerth(q.nodes[q.index]);syncLegacy(r,q);return flightSequenceState(r,craft.id);
 }
 if(!nodes.length){stopFlightSequence(r,craft.id);if(r.transfer?.craftId===craft.id)r.cancelTravel();return flightSequenceState(r,craft.id);}
 const running=options.active??old?.active;
 if(running){
  q.active=true;
  const unchanged=old&&legKey(old.nodes,old.index,old.loop,r.state.bridge)===legKey(q.nodes,q.index,q.loop,r.state.bridge);
  if(r.transfer?.active&&r.transfer.craftId===craft.id&&unchanged&&!old?.pendingAtContact){q.inFlight=true;q.advanceCount=old.advanceCount||1;syncLegacy(r,q);}
  else if(!r.state.bridge&&r.transfer?.active&&r.transfer.craftId===craft.id){
   // A new straight line cannot depart a moving point in an arbitrary
   // direction without an impulse. Finish the committed leg; route edits
   // take effect from that circle's actual incoming contact.
   q.inFlight=true;q.pendingAtContact=true;q.index=0;q.advanceCount=0;syncLegacy(r,q);
  }
  else if(old?.pointTurn&&unchanged&&old.nodes[old.index]?.heading===q.nodes[q.index]?.heading&&q.loop===old.loop&&parked===stationaryStop(r,craft)){q.index=old.index;q.inFlight=!!old.inFlight;q.advanceCount=old.advanceCount||1;q.readyLeg=clone(old.readyLeg);q.pointTurn=clone(old.pointTurn);q.waitSeconds=old.waitSeconds;syncLegacy(r,q);}
  else if(old?.orbitWait&&old.nodes.length===normalized.length&&old.nodes.every((n,i)=>sameStop(n,normalized[i])&&n.warpFactor===normalized[i].warpFactor&&n.transferProperSeconds===normalized[i].transferProperSeconds&&n.heading===normalized[i].heading)&&parked===old.orbitWait.targetId&&(!r.state.bridge?nextIndex(r,craft,q,parked)===old.index:q.loop===old.loop)){
   q.index=old.index;q.orbitWait=clone(old.orbitWait);q.waitSeconds=old.waitSeconds;
   const next=nextIndex(r,craft,q,parked),stop=next>=0?departureStop(r,craft,q,parked,next):null;
   if(stop&&(stop.extraLaps||0)!==(q.orbitWait.extraLaps||0))retimeOrbitWait(q,stop.extraLaps||0);
   syncLegacy(r,q);
  }
  else{
   const paused=r.state.paused;
   if(!r.transfer?.active&&parkedAt(r,craft)&&beginSequenceOrbitWait(r,q)){syncLegacy(r,q);}
   else if(!launch(r,q)&&q.error&&old){r.flightSequences[craft.id]=old;old.error=q.error;syncLegacy(r,old);}
   r.state.paused=paused;
  }
 }else if(r.autopilot?.craftId===craft.id)r.autopilot.enabled=false;
 return flightSequenceState(r,craft.id);
}
// Capture the pending destination before dropping the old arc/leg geometry.
export function suspendForDrive(r,craft){
 const q=ensureParkingPlaylist(r,craft)||r.flightSequences?.[craft.id];
 if(q?.active&&!q.inFlight&&!q.holding){
  const at=parkedAt(r,craft),next=at&&nextIndex(r,craft,q,at);
  if(Number.isInteger(next)&&next>=0)q.index=next;
 }
 stopFlightSequence(r,craft.id);
 if(q){q.departureArcSeconds=0;q.departureLapComplete=false;q.pendingAtContact=false;q.advanceCount=1;}
}
export function stopFlightSequence(r,id){
 const craft=craftFor(r,id),q=craft&&r.flightSequences?.[craft.id];if(q){q.active=false;q.inFlight=false;q.waitSeconds=0;q.orbitWait=null;q.pointTurn=null;q.readyLeg=null;q.holding=false;q.resumeOnPlay=false;}
 if(r.autopilot&&(!id||r.autopilot.craftId===id)){r.autopilot.enabled=false;r.autopilot.phase='Auto · coasting';}
 return !!q;
}
function parkedAt(r,craft){
 if(!craft)return null;
 if(r.state.bridge)return !craft.flight||craft.flight.orbitHold?r.bridgeParking?.[craft.id]?.targetId:null;
 if(craft.waypointHoldId&&r.driveId!==craft.id)return craft.waypointHoldId;
 return craft.placement==='orbit'&&(craft.flight?.orbitHold||r.driveId!==craft.id)?craft.parentId:null;
}
// Queued stops traverse their CCW contact arc, with only this craft's orbital
// phase sped up for display. Keplerian velocities and clock estimates retain
// their existing physical approximation; the rest of the system is untouched.
function parkedPhase(r,craft){
 const targetId=parkedAt(r,craft);if(!targetId)return null;
 if(r.state.bridge){const parking=r.bridgeParking?.[craft.id];return r.state.bridgeSurfaces&&['bridge-near-world','bridge-far-world'].includes(targetId)?{targetId,phase:parking.phase,direction:-1}:null;}
 if(craft.placement!=='orbit'||craft.motion&&craft.motion!=='orbit'||!(r.parentMassSolar?.(craft)>0))return null;
 const phase=r.currentPhase(craft);return Number.isFinite(phase)?{targetId,phase,direction:-1}:null;
}
// In an open bridge the near and far stops are fixed chart points. They
// have no scene-object waypoint ID, but their traveler still turns at rest.
function stationaryStop(r,craft){
 return r.state.bridge?(!r.state.bridgeSurfaces?parkedAt(r,craft):null):craft?.waypointHoldId;
}
function orbitalPathGravityUnits(r,craft){
 if(!parkedAt(r,craft))return null;
 if(craft.waypointHoldId||r.state.bridge&&!parkedPhase(r,craft))return 0;
 if(r.state.bridge){const orbit=r.getBridgeParkingOrbit?.(craft.id);return orbit?.radius>0?orbit.circularSpeedMetersPerSecond**2/((orbit.physicalRadiusMeters||orbit.radius*RG)*9.80665):null;}
 // Rate of turning of the chart velocity, distinct from the accelerometer.
 // A Kerr geodesic and a guided warp circle need not obey Newton's GM/r².
 const radius=craft.orbitMeters||craft.radius*r.massScale*RG;
 const omega=r.orbitalOmega(craft)*299792458/(18*RG);
 return radius>0&&Number.isFinite(omega)?radius*omega*omega/9.80665:null;
}
const radiusMatches=(a,b)=>Math.abs(a-b)<=Math.max(.001,32*Number.EPSILON*Math.max(a,b));
const sameStop=(a,b)=>!!a&&!!b&&a.targetId===b.targetId&&(a.kind||'orbit')===(b.kind||'orbit')&&a.port===b.port&&(a.radiusMeters===b.radiusMeters||radiusMatches(a.radiusMeters,b.radiusMeters));
function isOccupied(r,craft,node,at){
 if(!node||node.kind==='dock'||node.targetId!==at)return false;
 if(!node.radiusMeters||r.state.bridge)return true;
 return radiusMatches(node.radiusMeters,craft.orbitMeters||craft.radius*r.massScale*RG);
}
function nextIndex(r,craft,q,at){
 let i=q.index;
 for(let count=0;count<q.nodes.length;count++){
  if(!isOccupied(r,craft,q.nodes[i],at))return i;
  if(i+1<q.nodes.length)i++;else if(q.loop)i=0;else break;
 }
 return -1;
}
// The cursor usually points to the next destination. Walk backwards from it
// to find the occupied occurrence, including repeated stops at different radii.
function departureStop(r,craft,q,at,next){
 for(let step=1;step<=q.nodes.length;step++){
  const i=(next-step+q.nodes.length)%q.nodes.length;if(!q.loop&&i>=next)break;
  if(isOccupied(r,craft,q.nodes[i],at))return q.nodes[i];
 }
 return q.nodes.find(n=>isOccupied(r,craft,n,at))||null;
}
function orbitTiming(base,extra,seconds){
 return {baseSweepRadians:base,extraLaps:extra,sweepRadians:base+TAU*extra,wallSeconds:(base>0?Math.max(4,seconds*base/TAU):0)+seconds*extra};
}
// Editing a lap count while the craft is already circling must not replay the
// part it has flown or move the departure tangent. Choose the next reachable
// contact if the shortened sequence would have departed in the past.
function retimeOrbitWait(q,requested){
 const w=q.orbitWait,done=w.sweepRadians*(w.arcFraction||0),base=w.baseSweepRadians??w.sweepRadians;
 const laps=Math.max(requested,Math.ceil((done-base)/TAU-1e-12)),timing=orbitTiming(base,laps,SEQUENCE_ORBIT_SECONDS);
 const secondsPerRadian=w.durationSeconds/w.sweepRadians;
 Object.assign(w,timing,{extraLaps:requested,durationSeconds:timing.sweepRadians*secondsPerRadian});
 const fraction=timing.sweepRadians?Math.min(1,done/timing.sweepRadians):1;
 let lo=0,hi=1;for(let i=0;i<40;i++){const mid=(lo+hi)*.5;if(arcPlaybackFraction(mid)<fraction)lo=mid;else hi=mid;}
 w.arcFraction=fraction;w.progress=fraction===0||fraction===1?fraction:(hi+lo)*.5;w.elapsed=w.wallSeconds*w.progress;q.waitSeconds=w.wallSeconds-w.elapsed;
}
function applyParkingWarp(r,q,craft,at,orbit){
 if(orbit&&craft.type==='enterprise'&&!r.state.bridge){
  const stop=q.nodes.find((n,i)=>i===q.index&&isOccupied(r,craft,n,at))||q.nodes.find(n=>isOccupied(r,craft,n,at));
  // Timed legs enter and leave the circle at its tangent velocity. Keep the
  // protected warp speed and the physical arc clock consistent at contact.
  const meters=craft.orbitMeters||craft.radius*r.massScale*RG;
  const warp=(stop?.transferProperSeconds||sceneCruiseWarp(r.sceneId))?warpForSpeed(Math.sqrt(1.32712440018e20*r.parentMassSolar(craft)/meters)):stop?.warpFactor;
  if(warp!==undefined&&(r.state.warpFactor!==warp||r.warpObjectId!==craft.id)){
   const phase=r.currentPhase(craft);craft.phase=phase;craft.epoch=r.time;
   craft.warpEnabled=r.state.warp=true;r.warpObjectId=craft.id;r.state.warpScenario='orbit';r.state.warpFactor=warp;
   r.refreshConfiguration();r.lastGeometryTime=null;r.fillObjects();
  }
 }
}
export function beginSequenceOrbitWait(r,q){
 const craft=craftFor(r,q.craftId),at=parkedAt(r,craft),orbit=craft&&parkedPhase(r,craft);restoreLapDefaults(r,q);
 q.departureArcSeconds=0;q.waitSeconds=0;q.orbitWait=null;q.pointTurn=null;q.readyLeg=null;
 if(!at)return false;
 applyParkingWarp(r,q,craft,at,orbit);
 if(beginArrivalTurn(r,q,craft))return true;
 const next=nextIndex(r,craft,q,at);if(next<0)return hold(r,q);
 if(q.nodes[next].kind==='dock'){q.index=next;return false;}
 const duration=r.state.bridge?BRIDGE_PARKING_SECONDS:SEQUENCE_ORBIT_SECONDS;
 // The terminal stop has a lap and no outgoing trajectory. In particular,
 // do not ask the flight planner for a fictional last-to-first burn.
 if(q.restartOnLoop&&q.loop&&next===0&&orbit&&isOccupied(r,craft,q.nodes.at(-1),at)){
  q.index=q.nodes.length-1;
  const stop=q.nodes[q.index],timing=orbitTiming(0,stop.extraLaps??1,duration),rate=r.clockRateForObject(craft);
  const meters=stop.radiusMeters,speed=rate?.speedMetersPerSecond??Math.sqrt(1.32712440018e20*r.parentMassSolar(craft)/meters);
  q.holding=false;q.orbitWait={replayAfterLap:true,targetId:at,destinationId:at,startPhase:orbit.phase,lastPhase:orbit.phase,unwrappedPhase:orbit.phase,direction:orbit.direction,elapsed:0,progress:0,...timing,speedMetersPerSecond:speed,orbitalAccelerationG:orbitalPathGravityUnits(r,craft),clockRate:rate,durationSeconds:timing.sweepRadians/(rate?.coordinateAngularSpeed||speed/meters)/(rate?.rateFactor||1),leg:null};q.waitSeconds=timing.wallSeconds;return true;
 }
 let sweep=TAU,leg=null;
 if(r.state.bridge){
  if(!orbit){
   if(!stationaryStop(r,craft))return false;
   const targets=r.getTravelTargets({craftId:craft.id});
   const from=targets.find(n=>n.id===at),to=targets.find(n=>n.id===q.nodes[next].targetId);
   if(!from||!to)return false;
   const offset=to.position.map((v,i)=>v-from.position[i]),distance=Math.hypot(...offset);
   q.index=next;
   return distance>0&&beginPointTurn(r,q,craft,offset.map(v=>v/distance));
  }
  const local=r.getBridgeParkingOrbit(craft.id),axis=r.configCache.primaryBasis,gate=axis[2].map(v=>v*r.configCache.bridgeRadius*.5),delta=gate.map((v,i)=>v-local.center[i]),project=a=>delta.reduce((n,v,i)=>n+v*a[i],0);
  const x=project(axis[0]),z=project(axis[2]);
  const goal=q.nodes[next],far=at==='bridge-far-world',other=q.nodes[next+1]||(q.loop?q.nodes[0]:null);
  const dest=isBridgeGate(goal.targetId)?other:goal;
  const tangent=craft.type==='shuttle'&&(!dest||dest.targetId!==at);
  const angle=tangent?bridgeTangentContacts(r,craft.id,far,undefined,dest?.radiusMeters,dest?.kind!=='orbit').departure:Math.atan2(z,x)+Math.acos(Math.min(1,local.radius/Math.hypot(x,z)));
  sweep=((orbit.phase-angle)%TAU+TAU)%TAU;
 }else{
  if(!orbit&&!craft.waypointHoldId)return false;
  r.enablePlanarRouteChart?.(craft.id);const target=q.nodes[next];
  r.fillHoles();r.fillObjects();q.orbitRadii??={};
  if(orbit)q.orbitRadii[at]=craft.orbitMeters||craft.radius*r.massScale*RG;
  const planeHeightMeters=sequencePlaneHeight(r,craft,[at,...q.nodes.filter(n=>n.kind!=='dock').map(n=>n.targetId)]);
  if(!Number.isFinite(planeHeightMeters)){q.active=false;q.error='The fixed waypoints and parking clearances must share the same flight plane. Move a waypoint into the route plane.';return true;}
  leg=orbitalTangentLeg(r,target.targetId,{craftId:craft.id,orbitRadii:{...q.orbitRadii,[target.targetId]:target.radiusMeters},planeHeightMeters});
  if(!leg||leg.error){q.active=false;q.error=leg?.error||'These destinations have no clear common tangent.';return true;}
  if(target.kind==='orbit')q.orbitRadii[target.targetId]=leg.arrivalRadius;
  q.index=next;
  if(!orbit){
   q.readyLeg=leg;
   return beginPointTurn(r,q,craft,leg.tangent);
  }
  // A radius burn can start anywhere on the circle. Only the requested
  // complete laps precede it; there is no straight-line departure contact.
  sweep=leg.radiusTransfer?0:((orbit.phase-leg.departurePhase)%TAU+TAU)%TAU;
  const height=leg.departureHeightMeters;if(craft.routeParkingHeightMeters!==height||(craft.orbitMeters?craft.heightMeters!==height:craft.height!==height/(r.massScale*RG))){
   craft.routeParkingHeightMeters=height;
   craft.heightMeters=height;craft.height=height/(r.massScale*RG);r.refreshConfiguration();r.fillObjects();
  }
 }
 if(sweep<1e-10||TAU-sweep<1e-10)sweep=0;
 const stop=departureStop(r,craft,q,at,next),timing=orbitTiming(sweep,stop?.extraLaps||0,duration);sweep=timing.sweepRadians;
 if(!sweep){q.readyLeg=leg;return false;}
 const bridge=r.state.bridge?r.getBridgeParkingOrbit(craft.id):null,meters=bridge?(bridge.physicalRadiusMeters||bridge.radius*RG):(craft.orbitMeters||craft.radius*r.massScale*RG),metric=edgeKerrMetric(r,craft,craft.parentId),speed=metric?kerrCircularState(metric,meters).speed:bridge?bridge.circularSpeedMetersPerSecond:Math.sqrt(1.32712440018e20*r.parentMassSolar(craft)/meters);
 const node=q.nodes[next],following=q.nodes[next+1]||(q.loop?q.nodes[0]:null),via=r.state.bridge&&isBridgeGate(node.targetId)&&following?.kind==='orbit',dest=via?following:node;
 const preview=r.previewTravel(dest.targetId,{craftId:craft.id,tangentLeg:leg,warpFactor:dest.warpFactor??sceneCruiseWarp(r.sceneId)??1,transferProperSeconds:dest.transferProperSeconds,viaThroat:!!via,throatHeading:via?node.heading:undefined,throatWarpFactor:via?node.warpFactor:undefined});
 const rate=craft.type==='enterprise'?PROTECTED_CLOCK_RATE:r.clockRateForObject(craft);
 q.holding=false;q.orbitWait={radiusChange:!!leg?.radiusTransfer,speedMetersPerSecond:speed,clockRate:rate?{crewLoadG:rate.crewLoadG,rateFactor:rate.rateFactor,gravityFactor:rate.gravityFactor,gravityExcess:rate.gravityExcess,kinematicExcess:rate.kinematicExcess}:null,blockedReason:leg?.escapeShortfall>1?preview?.error||'Departure blocked: insufficient thrust for this straight transfer.':null,destinationId:dest.targetId,transferSeconds:preview?.properSeconds||0,transferCoordinateSeconds:preview?.coordinateSeconds,transferDilationSeconds:preview?.estimatedDilationSeconds,transferDistanceMeters:preview?.distanceMeters,durationSeconds:speed>0?sweep/(rate?.coordinateAngularSpeed||speed/meters)/(rate?.rateFactor||1):null,targetId:orbit.targetId,lastPhase:orbit.phase,unwrappedPhase:orbit.phase,startPhase:orbit.phase,direction:orbit.direction,elapsed:0,progress:0,...timing,orbitalAccelerationG:orbitalPathGravityUnits(r,craft),leg};q.waitSeconds=timing.wallSeconds;return true;
}
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Use the shortest signed turn in the route plane. The point never moves
// during alignment; reversing the route may need no turn after a retroburn.
function beginArrivalTurn(r,q,craft){
 const at=stationaryStop(r,craft),node=q.nodes[q.index];if(!at||q.pendingAtContact||node?.targetId!==at||!Number.isFinite(node.heading))return false;
 const plane=r.configCache.primaryBasis,h=node.heading*Math.PI/180,desired=plane[2].map((v,i)=>v*Math.cos(h)-plane[0][i]*Math.sin(h));
 if(!beginPointTurn(r,q,craft,desired))return false;
 q.pointTurn.arrival=true;return true;
}
function beginPointTurn(r,q,craft,desired){
 const plane=r.configCache.primaryBasis,up=plane[1],from=(r.state.bridge?craft.driveBasis:craft.waypointHoldBasis)||r.getFocusFrame(craft.id).frame,forward=from[2],to=[cross(up,desired),up,desired];
 const x=dot(forward,plane[0]),z=dot(forward,plane[2]),length=Math.hypot(x,z);
 const start=length>1e-9?plane[0].map((v,i)=>(x*v+z*plane[2][i])/length):[...desired];
 const side=cross(up,start),sine=dot(desired,side),cosine=dot(desired,start);
 // At exact opposition either sign is valid; use one stable half-turn.
 const angle=Math.abs(sine)<1e-12&&cosine<0?Math.PI:Math.atan2(sine,cosine);
 const duration=turnDuration(attitudeAngle(from,to));if(duration===0)return false;
 q.holding=false;q.pointTurn={up:[...up],start,side,angle,from:from.map(v=>[...v]),to,elapsed:0,wallSeconds:duration};
 q.waitSeconds=q.pointTurn.wallSeconds;return true;
}
function advancePointTurn(r,q,dt){
 const t=q.pointTurn,craft=craftFor(r,q.craftId);if(!t||!stationaryStop(r,craft)){q.pointTurn=null;q.waitSeconds=0;return false;}
 const elapsed=Math.min(t.wallSeconds,t.elapsed+dt);
 // The ship is resting at this waypoint: its turn has a 1:1 playback interval.
 // Consume only this slice, even if the rest of the frame starts the next leg.
 if(craft.clock){tickAtClockRate(craft.clock,elapsed-t.elapsed,craft.type==='enterprise'?PROTECTED_CLOCK_RATE:r.clockRateForObject(craft));r.transferClockObjectId=craft.id;}
 t.elapsed=elapsed;const u=t.elapsed/t.wallSeconds,a=t.angle*arcPlaybackFraction(u);
 const planar=t.start.map((v,i)=>v*Math.cos(a)+t.side[i]*Math.sin(a)),basis=t.from&&t.to?blendAttitude(t.from,t.to,arcPlaybackFraction(u)):[cross(t.up,planar),t.up,planar],forward=basis[2];
 if(r.state.bridge){
  const plane=r.configCache.primaryBasis,yaw=Math.atan2(dot(forward,plane[0]),dot(forward,plane[2]));
  r.bridgeParking[craft.id].heading=-yaw*180/Math.PI;
  if(craft.flight){craft.flight.headingAngle=craft.flight.headingTarget=yaw;craft.flight.angularVelocity=t.angle*30*u*u*(1-u)*(1-u)/t.wallSeconds;}
 }else craft.waypointHoldBasis=basis;
 craft.driveBasis=basis.map(v=>[...v]);if(craft.flight)craft.flight.basis=basis.map(v=>[...v]);
 r.lastGeometryTime=null;r.fillObjects();q.waitSeconds=Math.max(0,t.wallSeconds-t.elapsed);if(q.waitSeconds>1e-8)return true;
 q.pointTurn=null;return false;
}
function advanceOrbitWait(r,q,dt){
 const wait=q.orbitWait,craft=craftFor(r,q.craftId);if(!wait||!craft)return false;
 const orbit=parkedPhase(r,craft);if(!orbit||orbit.targetId!==wait.targetId){q.orbitWait=null;q.waitSeconds=0;return false;}
 if(craft.driveReturn?.attitudeOnly)craft.driveReturn.elapsed+=Math.min(Math.max(0,dt),wait.wallSeconds-wait.elapsed);
 const seconds=wait.wallSeconds;wait.elapsed=Math.min(seconds,wait.elapsed+Math.max(0,dt));wait.progress=seconds?wait.elapsed/seconds:1;
 const fraction=arcPlaybackFraction(wait.progress),delta=Math.max(0,fraction-(wait.arcFraction||0));wait.arcFraction=fraction;
 // Older saved warp circuits have no per-arc clock rate.
 const rate=craft.type==='enterprise'?PROTECTED_CLOCK_RATE:wait.clockRate;
 if(rate&&craft.clock){tickAtClockRate(craft.clock,delta*wait.durationSeconds,rate);r.transferClockObjectId=craft.id;}
 wait.lastPhase=wait.unwrappedPhase=wait.startPhase+wait.direction*wait.sweepRadians*fraction;
 if(!r.state.bridge){craft.phase=wait.lastPhase;craft.epoch=r.time;r.lastGeometryTime=null;}
 q.waitSeconds=Math.max(0,seconds-wait.elapsed);
 if(q.waitSeconds>1e-9)return true;
 if(wait.replayAfterLap){
  // Leave the scene, its controls and camera selection intact. Rewind just
  // the shuttle and its instruments; no flight time elapses across the cut.
  const first=q.nodes[0];craft.orbitMeters=first.radiusMeters;craft.radius=first.radiusMeters/(r.massScale*RG);
  craft.phase=q.replayPhase;craft.epoch=r.time;craft.clock=createObjectClock();
  delete craft.flight;delete craft.driveReturn;delete craft.driveBasis;delete craft.drivePosition;
  r.lastTransfer=null;r.transferClockObjectId=craft.id;r.parkedCamera=null;r.lastGeometryTime=null;
  q.index=0;q.legsCompleted=0;q.departureLapComplete=false;q.orbitRadii={};r.refreshConfiguration();r.fillObjects();
  beginSequenceOrbitWait(r,q);if(q.orbitWait)q.orbitWait.replayOpening=true;
  r.updateCameraFrame();return true;
 }
 if(wait.blockedReason){
  // Keep flying the inner circle; a rejected burn must never teleport the
  // ship or count as a completed leg. Changing the playlist can try again.
  hold(r,q);q.error=wait.blockedReason;return true;
 }
 q.departureArcSeconds=wait.durationSeconds||0;q.readyLeg=wait.leg;q.departureLapComplete=true;q.orbitWait=null;q.waitSeconds=0;return false;
}
function syncLegacy(r,q){
 const targets=new Map(r.getTravelTargets({craftId:q.craftId}).map(o=>[o.id,o]));
 r.autopilot=Object.assign(r.autopilot||{},{enabled:q.active,engaged:q.active,kind:r.state.bridge?'bridge':'orbital',craftId:q.craftId,destinations:q.nodes.map(n=>({id:n.targetId,name:targets.get(n.targetId)?.name||n.targetId})),at:Math.max(0,q.index-1),next:q.index,waitSeconds:q.waitSeconds,inFlight:q.inFlight,phase:r.transfer?.phaseName||(q.holding?(parkedPhase(r,craftFor(r,q.craftId))?'Orbiting':'At waypoint'):q.pointTurn?'Aligning at waypoint':q.active?'Parking orbit':'Auto · coasting'),legsCompleted:q.legsCompleted,error:q.error});
}
function hold(r,q){const craft=craftFor(r,q.craftId);applyParkingWarp(r,q,craft,parkedAt(r,craft),parkedPhase(r,craft));q.active=true;q.inFlight=false;q.holding=true;q.waitSeconds=0;q.orbitWait=null;q.pointTurn=null;q.readyLeg=null;q.error='';syncLegacy(r,q);return true;}
function launch(r,q,rejoin=false){
 const craft=craftFor(r,q.craftId);if(!craft||!q.nodes.length)return false;
 const at=parkedAt(r,craft);let attempts=0;
 while(isOccupied(r,craft,q.nodes[q.index],at)&&attempts++<q.nodes.length){if(q.index+1<q.nodes.length)q.index++;else if(q.loop)q.index=0;else return hold(r,q);}
 if(attempts>=q.nodes.length)return hold(r,q);
 const node=q.nodes[q.index],next=q.nodes[q.index+1]||(q.loop?q.nodes[0]:null);
 if(node.kind==='dock'){
  const started=r.startDocking(craft.id,node.targetId,node.port||'south',{fromSequence:true});
  q.active=q.inFlight=!!started;q.holding=false;q.advanceCount=1;q.error=started?'':r.lastDockingError||'Unable to rendezvous with this station.';q.readyLeg=null;q.departureArcSeconds=0;
  syncLegacy(r,q);return !!started;
 }
 const bridgePair=r.state.bridge&&isBridgeGate(node.targetId)&&next&&['bridge-near-world','bridge-far-world'].includes(next.targetId);
 const target=bridgePair?next:node;
 const commands={rejoin,orbitRadii:{[target.targetId]:target.radiusMeters},craftId:q.craftId,warpFactor:target.warpFactor??node.warpFactor??sceneCruiseWarp(r.sceneId)??1,transferProperSeconds:target.transferProperSeconds,heading:target.heading,throatHeading:bridgePair?node.heading:undefined,throatWarpFactor:bridgePair?node.warpFactor:undefined,viaThroat:!!bridgePair,fromSequence:true,sequenceManaged:true,...(q.readyLeg?{wallSeconds:SEQUENCE_LEG_SECONDS,tangentLeg:q.readyLeg,orbitRadii:{...q.orbitRadii,[target.targetId]:target.radiusMeters},planeHeightMeters:q.readyLeg.planeHeightMeters}:r.state.bridge&&q.departureLapComplete?{wallSeconds:10}:{})};
 const result=r.startTravel(target.targetId,commands);if(r.transfer?.active)r.transfer.departureArcSeconds=q.departureArcSeconds||0;q.departureArcSeconds=0;
 q.departureLapComplete=false;q.readyLeg=null;
 if(!result||result.error){q.active=false;q.inFlight=false;q.error=String(result?.error||(!r.state.bridge&&r.lastTravelError)||r.previewTravel?.(target.targetId,commands)?.error||'This route is not available from the current position.').slice(0,300);syncLegacy(r,q);return false;}
 q.inFlight=true;q.holding=false;q.advanceCount=bridgePair?2:1;q.error='';syncLegacy(r,q);return true;
}
export function startFlightSequence(r,id,{rejoin=false}={}){
 const craft=craftFor(r,id),q=craft&&r.flightSequences?.[craft.id];if(!q?.nodes.length)return false;
 for(const other of Object.values(r.flightSequences||{}))if(other.craftId!==craft.id&&other.active)stopFlightSequence(r,other.craftId);
 r.navigationModes??={};r.navigationModes[craft.id]='auto';
 if(r.dockingMission?.craftId===craft.id){
  const m=r.dockingMission;m.playlist=true;q.active=true;q.resumeOnPlay=false;q.inFlight=m.phase!=='docked';q.holding=false;q.error='';syncLegacy(r,q);return true;
 }
 const paused=r.state.paused;q.active=true;q.resumeOnPlay=false;q.waitSeconds=0;q.inFlight=false;q.orbitWait=null;q.holding=false;q.error='';
 if(!r.transfer?.active&&beginSequenceOrbitWait(r,q)){syncLegacy(r,q);return !q.error;}
 const result=launch(r,q,rejoin);r.state.paused=paused;return result;
}
export function advanceFlightSequences(r,dt){
 if(r.state.paused||r.dockingMission||!(dt>0))return false;
 const queues=Object.values(r.flightSequences||{}),q=queues.find(q=>q.active&&!q.holding);
 if(!q){const pending=queues.find(q=>q.resumeOnPlay&&q.nodes.length&&r.navigationModes?.[q.craftId]!=='manual');return pending?startFlightSequence(r,pending.craftId):false;}
 if(r.navigationModes?.[q.craftId]==='manual'){stopFlightSequence(r,q.craftId);return false;}
 if(r.transfer?.active){syncLegacy(r,q);return false;}
 if(q.holding)return false;
 if(q.pointTurn?.arrival){
  if(advancePointTurn(r,q,dt)){syncLegacy(r,q);return false;}
  // Initial or edited stop was already parked. Re-evaluate its following
  // item now that we face the requested heading exactly.
  if(!q.inFlight&&beginSequenceOrbitWait(r,q)){syncLegacy(r,q);return false;}
 }
 if(q.inFlight){
  // Terminal heading is a stationary maneuver. It should consume real
  // screen time before the next item starts or the final point is held.
  if(beginArrivalTurn(r,q,craftFor(r,q.craftId))){syncLegacy(r,q);return false;}
  q.inFlight=false;q.legsCompleted++;if(!q.pendingAtContact)q.index+=q.advanceCount||1;else{
   // The current contact is the transient departure of the revised route;
   // never insert a removed stop permanently into the user's new cycle.
   q.pendingAtContact=false;
  }q.advanceCount=1;
  if(q.index>=q.nodes.length){if(q.loop)q.index%=q.nodes.length;else{q.index=q.nodes.length-1;return hold(r,q);}}
  // Every orbital stop is an orbit item, including a finite playlist's
  // intermediate destinations. Waypoints continue without an artificial orbit.
  if(beginSequenceOrbitWait(r,q)){syncLegacy(r,q);return false;}
 }
 if(q.orbitWait){if(advanceOrbitWait(r,q,dt)){syncLegacy(r,q);return false;}}
 else if(q.pointTurn){if(advancePointTurn(r,q,dt)){syncLegacy(r,q);return false;}}
 else if(q.waitSeconds>0){q.waitSeconds=Math.max(0,q.waitSeconds-dt);syncLegacy(r,q);return false;}
 const paused=r.state.paused,result=launch(r,q);r.state.paused=paused;return result;
}

// Keep editable queues serializable when a craft or destination is removed.
export function reconcileFlightSequences(r){
 const crafts=new Set(r.objects.filter(o=>['shuttle','enterprise'].includes(o.type)).map(o=>o.id));
 for(const field of ['flightSequences','navigationModes','bridgeParking'])for(const id of Object.keys(r[field]||{}))if(!crafts.has(id))delete r[field][id];
 for(const q of Object.values(r.flightSequences||{})){const eligible=new Set(r.getTravelTargets({craftId:q.craftId}).map(o=>o.id)),nodes=q.nodes.filter(n=>eligible.has(n.targetId));if(nodes.length!==q.nodes.length){q.nodes=nodes;q.active=false;q.inFlight=false;q.index=Math.min(q.index,Math.max(0,nodes.length-1));q.waitSeconds=0;q.orbitWait=null;q.holding=false;q.error='A destination was removed. Review the remaining stops.';if(r.autopilot?.craftId===q.craftId)syncLegacy(r,q);}}
 if(r.autopilot&&!crafts.has(r.autopilot.craftId))r.autopilot=null;
}
