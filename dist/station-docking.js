// Meridian's docking pilot. All worldline samples use SI units; only the
// renderer adapter converts the ephemeris chart and advances presentation time.
import {hullType,REFERENCE_RG_METERS} from './objects.js';
import {FLIGHT_LIGHT_SPEED,FLIGHT_STANDARD_GRAVITY} from './flight-dynamics.js';
import {paceHabitatWheel} from './habitat-spin.js';
import {tickAtClockRate} from './object-clocks.js';
import {sampleDockingClose,dockingCloseDuration,createDockingTransit,sampleDockingTransit,dockingTransitElapsed,dockingTransitScreenSeconds,dockingStageElapsed,dockingAttitudeElapsed,dockingAcquisitionScreenTime,dockingOrbitDuration,ferryTangentWait,sampleDockingOrbit,dockingAcquireDuration,sampleDockingAcquire} from './docking-flight.js';

const RG=REFERENCE_RG_METERS,C=FLIGHT_LIGHT_SPEED,G=FLIGHT_STANDARD_GRAVITY;
const T=18*RG/C,TAU=2*Math.PI,Z=[0,0,0];
const mul=(a,s)=>a.map(x=>x*s),add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const transform=(b,v)=>b[0].map((_,i)=>b[0][i]*v[0]+b[1][i]*v[1]+b[2][i]*v[2]);
const norm=v=>Math.hypot(...v),copyBasis=b=>b.map(v=>[...v]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const secondsOnScreen={approach:16,docked:6,undock:12,transit:26,orbit:12,acquire:10,depart:10,departOrbit:18};
const labels={approach:'Docking approach',docked:'Docked',undock:'Undocking',transit:'Station rendezvous',orbit:'Phasing along station orbit',acquire:'Matching the hub',depart:'Clearing the hub',departOrbit:'Coasting to departure'};

// Shared by the drawing code and the intercept predictor. Return the derivative
// of exactly the same eccentric anomaly, including the orbital-plane rotation.
export function keplerOffset(g,phase){
 const mean=((phase%TAU)+TAU)%TAU,e=g.e,rr=g.semiMajor;let a=mean;
 for(let i=0;e>0&&i<7;i++)a-=(a-e*Math.sin(a)-mean)/(1-e*Math.cos(a));
 const c=Math.cos(a),s=Math.sin(a),w=-g.omega/(1-e*c);
 const rotate=(x,z)=>transform(g.basis,[x*g.periCos-z*g.periSin,0,x*g.periSin+z*g.periCos]);
 return {position:add(rotate((c-e)*rr,s*g.minorRatio*rr),g.height),velocity:rotate(-s*rr*w,c*g.minorRatio*rr*w)};
}

// Predict the live station independently of the camera and without ever
// fast-forwarding the actual scene to probe a possible intercept.
function predict(r,id,sec,cache){
 if(cache.has(id))return cache.get(id);
 const f=r.getFocusFrame(id);if(!f)return null;
 const obj=r.objectById.get(id),base=f.position,baseV=f.velocity||Z,delta=sec/T;
 const answer={position:add(base,mul(baseV,delta)),velocity:[...baseV]};cache.set(id,answer);
 if(obj){
  let dx=[0,0,0],dv=[0,0,0];
  const term=(o,weight)=>{
   if(!o)return;
   const g=r.orbitGeometryById.get(o.id),a=r.currentPhase(o);
   const before=keplerOffset(g,a),after=keplerOffset(g,a-g.omega*delta);
   dx=add(dx,mul(sub(after.position,before.position),weight));dv=add(dv,mul(sub(after.velocity,before.velocity),weight));
  };
  const parent=r.getFocusFrame(obj.parentId),p=parent&&predict(r,obj.parentId,sec,cache);
  if(obj.placement==='orbit'&&p){
   dx=sub(p.position,parent.position);dv=sub(p.velocity,parent.velocity||Z);
   term(obj,1);
   if(obj.orbitBarycenter){const pair=r.orbitPairs.get(obj.parentId);if(pair)term(pair,r.orbitGeometryById.get(pair.id).pairRatio);}
  }
  if(obj.placement==='local'&&!obj.referenceId)dx=mul(baseV,delta);
  const pair=r.orbitPairs.get(obj.id);if(pair)term(pair,-r.orbitGeometryById.get(pair.id).pairRatio);
  if(r.routeChartY!=null&&['planet','moon','planetoid','asteroid','star','blackhole','whitehole'].includes(obj.type)){const n=r.configCache.primaryBasis[1];dx=sub(dx,mul(n,dot(dx,n)));dv=sub(dv,mul(n,dot(dv,n)));}
  answer.position=add(base,dx);answer.velocity=add(baseV,dv);
 }
 return answer;
}
function endpoint(r,id,side,seconds=0){
 const o=r.objectById.get(id),f=r.frameById.get(id);if(!o||!f||o.type!=='habitat')return null;
 const cache=new Map(),p=predict(r,id,seconds,cache),parent=r.getFocusFrame(o.parentId),parentPose=parent&&predict(r,o.parentId,seconds,cache);
 return {id,side,ferry:r.dockingMission?.ferry,position:mul(p.position,RG),velocity:mul(p.velocity,C/18),basis:copyBasis(f.habitatHubFrame||f.frame),radiusMeters:r.objectRadius(o)*RG,...(parent&&parentPose&&parent.radius>0?{parentPosition:mul(parentPose.position,RG),parentVelocity:mul(parentPose.velocity,C/18),parentRadiusMeters:parent.radius*RG}:{})};
}
function shipState(r,o){
 const f=r.frameById.get(o.id),isDriven=r.driveId===o.id&&o.flight&&!o.flight.orbitHold,par=r.getFocusFrame(o.parentId);
 return {position:mul(f.position,RG),velocity:isDriven?[...o.flight.velocity]:mul(f.velocity||Z,C/18),basis:copyBasis(f.frame),radiusMeters:r.objectRadius(o)*RG,...(par?.radius>0?{parentPosition:mul(par.position,RG),parentVelocity:mul(par.velocity||Z,C/18),parentRadiusMeters:par.radius*RG}:{})};
}
function claim(r,o,m){
 const follow=r.focusMode==='track'&&r.focusId===o.id&&!r.parkedCamera?.released;
 const entry=follow&&r.cameraFrame&&r.getFocusFrame(o.id);
 if(entry){
  const frame=r.cameraFrame,back=mul(frame.forward,-1);
  m.cameraView={basis:[frame.right.slice(),frame.up.slice(),back],distance:r.camera.focusDistance,phase:'entry',time:0,duration:0};
 }
 if(r.transfer?.active)r.cancelTravel();
 if(!m.playlist)r.stopFlightSequence(o.id);
 if(!m.playlist&&r.autopilot){r.autopilot.enabled=false;r.autopilot.engaged=false;}
 r.setFreeDrive(o.id,true,{guidance:true});r.navigationModes[o.id]='auto';
 o.flight.orbitHold=false;o.flight.thrust=0;o.flight.brakeSpeed=false;o.flight.visualJet=0;delete o.driveReturn;delete o.waypointHoldId;delete o.waypointHoldBasis;
 r.flightInput={speed:0,curvature:0,torsion:0};r.dockingMission=m;if(follow)r.cameraGuide='dock-ferry';r.dockingCoastId=null;r.lastDockingError='';
}
function stage(r,m,phase,plan=null){
 const ferry=(m.ferry||r.sceneId==='earth-mars-station-ferry')&&m.playlist;
 if(ferry)m.ferry=true;else delete m.ferry;
 const e=endpoint(r,m.stationId,m.side),o=r.objectById.get(m.craftId);
 if(!e||!o)return false;
 const radius=r.objectRadius(o)*RG;
 m.phase=phase;m.paced=true;m.elapsed=m.wallElapsed=0;m.startSceneTime=r.time;m.duration=phase==='transit'?plan.duration:phase==='orbit'?dockingOrbitDuration(e):phase==='departOrbit'?2*dockingOrbitDuration(e):phase==='acquire'||phase==='depart'?dockingAcquireDuration(e,radius):phase==='docked'?40:dockingCloseDuration(e,radius);
 m.viewSeconds=phase==='transit'?dockingTransitScreenSeconds(plan):secondsOnScreen[phase];
 if(ferry&&phase!=='transit'){
  const times={approach:5,undock:5,acquire:5,depart:5,docked:1.3,orbit:2.8,departOrbit:2.8};
  m.viewSeconds=times[phase];
  if(phase==='orbit'||phase==='departOrbit')m.duration=dockingOrbitDuration(e)*.42;
  if(phase==='orbit'){
   const q=r.flightSequences[m.craftId];
   const index=q?.nodes.findIndex(n=>n.targetId===m.stationId);
   const dest=index>=0?q.nodes[(index+1)%q.nodes.length]:null;
   if(dest?.kind==='dock'&&dest.targetId!==m.stationId){
    // Divide the local arc on either side of the hub visit. This avoids a
    // redundant full revolution when the release is just past the tangent.
    const visit=2*(dockingCloseDuration(e,radius)+dockingAcquireDuration(e,radius))+40;
    const local=endpoint(r,m.stationId,m.side,visit),other=endpoint(r,dest.targetId,m.side,visit);
    if(other)m.duration=Math.max(dockingOrbitDuration(e)*.06,.5*ferryTangentWait(local,sub(other.position,local.position)));
   }
  }
 }else if(phase==='acquire'||phase==='depart')m.viewSeconds+=dockingAcquisitionScreenTime(e,radius);
 m.plan=plan;
 return true;
}
function writePose(r,m,s){
 const o=r.objectById.get(m.craftId),f=o.flight;
 m.sample=s;f.position=[...s.position];f.velocity=[...s.velocity];f.speed=norm(f.velocity);f.basis=copyBasis(s.basis);f.orbitHold=false;f.thrust=s.docking?0:s.mainThrustG;
 f.headingAngle=f.headingTarget=Math.atan2(f.basis[2][0],f.basis[2][2]);f.angularVelocity=0;f.visualJet=0;
 o.drivePosition=mul(s.position,1/RG);o.driveBasis=copyBasis(f.basis);r.lastGeometryTime=null;
}
function sample(r,m){
 const e=endpoint(r,m.stationId,m.side),o=r.objectById.get(m.craftId);if(!e||!o)return false;
 const f=Math.min(1,m.elapsed/m.duration);
 const radius=r.objectRadius(o)*RG;
 const s=m.phase==='transit'?sampleDockingTransit(m.plan,m.elapsed,e):['orbit','departOrbit'].includes(m.phase)?sampleDockingOrbit(e,radius):['acquire','depart'].includes(m.phase)?sampleDockingAcquire(e,radius,f,m.phase==='depart'):sampleDockingClose(e,radius,f,m.phase==='approach'?'dock':m.phase==='undock'?'undock':'hold');
 writePose(r,m,s);return true;
}
function endMission(r,m){
 r.dockingMission=null;r.dockingCoastId=m.craftId;r.lastGeometryTime=null;
 const o=r.objectById?.get(m.craftId);
 if(o?.flight){r.navigationModes[o.id]='manual';o.flight.thrust=0;o.flight.angularVelocity=0;o.flight.visualJet=0;o.flight.orbitHold=false;}
}
function planTo(r,start,id,side,departure){
 return createDockingTransit(start,dt=>endpoint(r,id,side,dt),{departureStation:departure,ferry:r.dockingMission?.ferry});
}
function fail(r,msg){r.lastDockingError=msg;return false;}
export function startDock(r,craftId,stationId,port,{fromSequence=false}={}){
 r.fillHoles();r.fillObjects();
 const o=r.objectById.get(craftId),side=port==='south'?-1:1,e=endpoint(r,stationId,side);
 if(hullType(o)!=='shuttle'||!e||!['north','south'].includes(port))return fail(r,'Select Meridian and an upper or lower station port.');
 if(r.dockingMission)return fail(r,'Finish or leave the current docking maneuver first.');
 if(r.state.bridge)return fail(r,'This docking pilot requires a station outside the wormhole chart.');
 // Reject an impossible start before taking control. No pose or clock is reset.
 const start=shipState(r,o);let plan;try{plan=planTo(r,start,stationId,side,null);}catch(error){return fail(r,error instanceof RangeError?error.message:'A safe station intercept could not be planned.');}
 if(!plan||!(plan.duration>0)||!Number.isFinite(plan.duration))return fail(r,'No clear rendezvous from this position. Move away from the station or the planetary surface and try again.');
 const m={craftId,stationId,side,playlist:fromSequence,loop:false,route:[],index:0};claim(r,o,m);stage(r,m,'transit',plan);sample(r,m);if(!fromSequence)r.state.paused=false;return true;
}
export function startFerry(r,preset){
 if(preset.id!=='earth-mars-station-ferry')return;
 const lookup=key=>r.objects[preset.objects.findIndex(x=>x.key===key)],o=lookup('ferry-shuttle'),definition=preset.flightSequence;if(!o||!definition?.nodes?.length)return;
 r.fillHoles();r.fillObjects();
 const nodes=definition.nodes.map(({targetKey,...n})=>({...n,targetId:lookup(targetKey)?.id}));
 const result=r.setFlightSequence(o.id,nodes,{loop:definition.loop,active:false});
 if(!result||result.error)return;
 const q=r.flightSequences[o.id],first=q.nodes[0],side=first.port==='north'?1:-1;
 const m={craftId:o.id,stationId:first.targetId,side,playlist:true,loop:false,route:[],index:0};
 // Begin already inserted in the first station's orbit. Subsequent visits,
 // including the return to Earth, perform the complete transfer from release.
 claim(r,o,m);stage(r,m,dockingOrbitDuration(endpoint(r,m.stationId,side))>0?'orbit':'approach');
 if(m.phase==='orbit')m.viewSeconds=5; // First insertion starts on the circle, without an incoming tangent.
 sample(r,m);
 r.startFlightSequence(o.id);r.fillObjects();
}
export function releaseDock(r,id){
 const m=r.dockingMission;if(!m||m.craftId!==id||m.phase!=='docked')return fail(r,'The shuttle must be docked before releasing the latch.');
 if(m.playlist)r.stopFlightSequence(id);m.playlist=false;stage(r,m,'undock');sample(r,m);r.state.paused=false;return true;
}
export function cancelDock(r,id){
 const m=r.dockingMission;if(!m||m.craftId!==id)return false;
 if(m.phase==='docked')return releaseDock(r,id);
 if(m.phase==='undock'){if(m.playlist)r.stopFlightSequence(id);m.playlist=false;return true;}
 if((m.sample?.extension||0)>0)return fail(r,'The docking tube is extended. Finish capture, then undock to take control.');
 if(m.playlist)r.stopFlightSequence(id);endMission(r,m);return true;
}
// The mission describes only the current physical contact. All decisions
// about where to go after it come from the editable, ordinary flight queue.
function following(q,m){
 if(!m.playlist||!q?.active||!q.nodes?.length)return -1;
 const same=n=>n?.kind==='dock'&&n.targetId===m.stationId&&(n.port==='north'?1:-1)===m.side;
 if(!same(q.nodes[q.index]))return q.index;
 for(let j=1;j<q.nodes.length;j++){let i=q.index+j;if(i>=q.nodes.length){if(!q.loop)break;i%=q.nodes.length;}if(!same(q.nodes[i]))return i;}
 return -1;
}
function clearDeparture(r,m,node){
 if(!node||node.kind==='dock')return true;
 const model=r.previewTravel(node.targetId,{craftId:m.craftId,rejoin:true,orbitRadii:{[node.targetId]:node.radiusMeters},sequenceManaged:true});
 return model&&!model.error;
}
function next(r,m){
 const q=r.flightSequences?.[m.craftId],o=r.objectById.get(m.craftId);
 if(m.phase==='transit'){
  const orbit=m.plan?.profile==='flip1g'&&dockingOrbitDuration(endpoint(r,m.stationId,m.side))>0;
  stage(r,m,orbit?'orbit':'approach');
 }else if(m.phase==='orbit'){stage(r,m,'acquire');}
 else if(m.phase==='acquire'){stage(r,m,'approach');}
 else if(m.phase==='approach'){
  stage(r,m,'docked');
  if(m.playlist&&q?.active){q.legsCompleted++;q.inFlight=false;q.pendingAtContact=false;q.holding=following(q,m)<0;}
 }else if(m.phase==='docked'){
  if(following(q,m)<0)return false;
  q.holding=false;q.inFlight=true;stage(r,m,'undock');
 }else{
  const i=following(q,m);
  if(i<0){if (m.playlist&&q?.active)r.stopFlightSequence(m.craftId);endMission(r,m);return false;}
  const node=q.nodes[i];
  // A remote burn must start clear of the hardware. Back out of the
  // axial corridor under rim jets, then regain the unpowered orbital track.
  if(m.phase==='undock'&&(node.kind!=='dock'||node.targetId!==m.stationId)&&dockingOrbitDuration(endpoint(r,m.stationId,m.side))>0){
   stage(r,m,'depart');sample(r,m);return true;
  }
  if(m.phase==='depart'&&node.kind==='dock'&&node.targetId!==m.stationId&&m.ferry){
   stage(r,m,'departOrbit');
   const local=endpoint(r,m.stationId,m.side),nextStation=endpoint(r,node.targetId,node.port==='south'?-1:1);
   m.duration=Math.max(dockingOrbitDuration(local)*.07,ferryTangentWait(local,sub(nextStation.position,local.position)));
   sample(r,m);return true;
  }
  if(m.phase==='depart'&&node.kind!=='dock'&&!clearDeparture(r,m,node)){
   // The ordinary route brakes along the live velocity before rejoining its
   // plane. Wait on the real circular orbit for a clear tangent, up to one lap.
   stage(r,m,'departOrbit');sample(r,m);return true;
  }
  q.index=i;q.pendingAtContact=false;q.inFlight=true;q.holding=false;
  if(node.kind!=='dock'){
   endMission(r,m);r.dockingCoastId=null;
   return r.startFlightSequence(m.craftId,{rejoin:true});
  }
  const old=endpoint(r,m.stationId,m.side),start=shipState(r,o),side=node.port==='north'?1:-1;
  let plan;try{plan=planTo(r,start,node.targetId,side,old);}catch(error){r.lastDockingError=error.message;}
  if(!plan||!Number.isFinite(plan.duration)||!(plan.duration>0)){
   r.stopFlightSequence(m.craftId);endMission(r,m);q.error=r.lastDockingError||'No safe station intercept. Shuttle released at stand-off.';return fail(r,q.error);
  }
  m.stationId=node.targetId;m.side=side;stage(r,m,'transit',plan);
 }
 sample(r,m);return true;
}
// Brief easing at either end keeps the orbital pan nearly uniform while
// matching a gentle start and finish at a tangential departure or capture.
function orbitProgress(u){
 const edge=.04;
 const x=Math.min(u,1-u),v=x<edge?x*x/(2*edge):x-edge/2;
 return u<.5?v/(1-edge):1-v/(1-edge);
}
export function advanceDock(r,viewSeconds){
 let remaining=viewSeconds;
 for(let join=0;remaining>1e-12&&join<16&&r.dockingMission;join++){
  const m=r.dockingMission,o=r.objectById.get(m.craftId);
  if(!o||!r.objectById.has(m.stationId)){endMission(r,m);break;}
  const q=r.flightSequences?.[m.craftId],hold=m.phase==='docked'&&following(q,m)<0;
  if(m.phase==='docked'&&m.playlist&&q?.active)q.holding=hold;
  const wall=m.wallElapsed??(m.elapsed*m.viewSeconds/m.duration);
  const step=hold?remaining:Math.min(remaining,Math.max(0,m.viewSeconds-wall));
  if(step>0){
   m.wallElapsed=wall+step;const progress=Math.min(1,m.wallElapsed/m.viewSeconds);
   const elapsed=hold?m.elapsed+step*m.duration/m.viewSeconds:m.phase==='transit'&&m.plan?.profile==='flip1g'?dockingTransitElapsed(m.plan,progress):m.paced&&(m.phase==='acquire'||m.phase==='depart')?dockingAttitudeElapsed(m.duration,m.ferry?1.5:secondsOnScreen[m.phase],m.viewSeconds,progress):m.ferry&&(m.phase==='orbit'||m.phase==='departOrbit')?m.duration*orbitProgress(progress):m.paced?dockingStageElapsed(m.duration,m.viewSeconds,progress):progress*m.duration;
   const dt=Math.max(0,elapsed-m.elapsed);m.elapsed=elapsed;r.time=m.startSceneTime+m.elapsed/T;
   r.fillHoles();r.fillObjects();sample(r,m);r.fillObjects();const sources=r.clockSources();
   for(const actor of r.clockActors){
    const before=actor.clock.properSeconds,rate=r.clockRateForObject(actor,sources);
    if(Number.isFinite(rate.properRate)&&rate.properRate>0)tickAtClockRate(actor.clock,dt*rate.properRate,rate);
    if(actor.type==='habitat')paceHabitatWheel(actor,before,step,r.getHabitatSpin(actor.id));
   }
   if(r.hasHabitat)r.habitatClockRevision=(r.habitatClockRevision||0)+1;
   remaining-=step;
  }
  if(m.phase==='departOrbit'&&m.wallElapsed<m.viewSeconds-1e-9&&Math.floor(m.wallElapsed*2)>Math.floor(wall*2)){
   const n=q?.nodes?.[following(q,m)];if(n&&n.kind!=='dock'&&clearDeparture(r,m,n)){if(!next(r,m))break;continue;}
  }
  if(hold||m.wallElapsed<m.viewSeconds-1e-9)break;
  if(!next(r,m))break;
 }
}
export function dockStatus(r,id){
 const m=r.dockingMission,s=m?.sample;if(!m||!s||id&&id!==m.craftId)return null;
 return {craftId:m.craftId,stationId:m.stationId,stationName:r.objectById?.get(m.stationId)?.name||'Station',phase:m.phase,label:labels[m.phase],rcsOnly:!!s.docking,detail:s.phase,port:m.side<0?'south':'north',gapMeters:s.rangeMeters,relativeSpeed:s.relativeSpeed,extension:s.extension,rcs:[...s.rcs],mainThrust:m.phase==='transit'?s.mainThrustG:0,canUndock:m.phase==='docked',automaticDeparture:m.phase==='docked'&&following(r.flightSequences?.[m.craftId],m)>=0,loop:!!(m.playlist&&r.flightSequences?.[m.craftId]?.loop),elapsed:m.elapsed,duration:m.duration,remainingSeconds:Math.max(0,m.duration-m.elapsed)};
}
export function dockClock(r,o,rate){
 const m=r.dockingMission,s=m?.sample;if(!s||o.id!==m.craftId)return null;
 const v=norm(s.velocity);
 // In strong fields the coordinate velocity of the hub is not its locally
 // measured velocity. Close to the hub, start from its own physical clock.
 const hub=m.stationId&&r.objectById.get(m.stationId),near=s.docking&&r.state.blackHole&&hub?r.clockRateForObject(hub):null;
 const local=near&&Number.isFinite(near.speedMetersPerSecond)?Math.max(0,near.speedMetersPerSecond+v-norm(mul(r.frameById.get(hub.id).velocity||Z,C/18))):v;
 const beta=clamp(local/C,0,1-Number.EPSILON),gamma=1/Math.sqrt((1-beta)*(1+beta)),excess=beta*beta*gamma*gamma/(gamma+1),factor=rate.gravityFactor*gamma;
 const thrust=norm(s.properAcceleration)/G,load=Number.isFinite(near?.crewLoadG)&&near.crewLoadG>1e-7&&thrust<1e-8?near.crewLoadG:thrust;
 return {...rate,kinematicFactor:gamma,kinematicExcess:excess,kinematicLossRate:excess/gamma,rateFactor:factor,properRate:1/factor,lossRate:1-1/factor,distantSpeedMetersPerSecond:v,speedMetersPerSecond:local,crewLoadG:load,requiredSupportG:load,accelerationG:norm(s.acceleration)/G,accelerationMode:load>1e-7?'thrust':'coast',model:'Station rendezvous · prescribed transfer and hub-relative proximity flight'};
}
