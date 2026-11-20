import {planJanusManeuver,sampleJanusManeuver} from './janus-maneuver.js';
// A Janus jump exchanges two small comoving neighbourhoods. The itinerary
// names places, never a path connecting galaxies in one floating-point chart.
import {REFERENCE_RG_METERS} from './objects.js';
import {janusLapSample,janusScheduledRate,advanceJanusChart,syncJanusLocal} from './janus-local.js';
import {orbitClearance} from './orbit-clearance.js';
import {setJanusChart} from './janus-charts.js';
const RG=REFERENCE_RG_METERS;
const DWELL=7.5, CHARGE=3.2, SETTLE=2.2;
const duration=stage=>stage==='orbit'?DWELL:stage==='charge'?CHARGE:SETTLE;
const body=(r,id)=>r.objectById?.get(id)||r.objects.find(o=>o.id===id);
const pad=o=>['planet','moon','star','planetoid','asteroid','waypoint'].includes(o?.type);
const canTarget=(r,id,craft)=>{const o=body(r,id);if(!pad(o))return false;for(let p=o;p;p=body(r,p.parentId))if(p.id===craft)return false;return true;};
const coordinates=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e12);
const galactic=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=5e10);
const desc=(r,id)=>body(r,id)?.name||'Local space';
const nowBody=(r,o)=>o.placement==='orbit'&&(!o.flight||o.flight.orbitHold||r.driveId!==o.id)&&pad(body(r,o.parentId))?o.parentId:o.waypointHoldId||null;
const normalTime=t=>((t%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
function lapSeconds(r,pod){
 const sample=janusLapSample(r,pod),rate=janusScheduledRate(r);
 return sample?.simulatorPeriod>0&&rate>0?sample.simulatorPeriod/rate:DWELL;
}
const lapCount=(p,i)=>p.laps?.[i]??1;
const visitRadius=(r,pod,p,i)=>p.radii?.[i]||ringRadius(r,body(r,p.stops[i]),pod);
const stageSpan=(r,pod,p)=>p.stage==='local'?p.localLeg.seconds:p.stage==='orbit'?orbitSpan(r,pod,p):duration(p.stage);
function orbitSpan(r,pod,p){
 if(!p?.auto)return DWELL;
 if(p.locationId!==p.stops[p.cursor]||!p.locationId)return 0;
 if(body(r,p.locationId)?.type==='waypoint')return 1.2;
 return lapSeconds(r,pod)*lapCount(p,p.cursor);
}
const neg=v=>v.map(x=>-x);
const sky=(chart,xyz)=>chart==='deep'?'deep:'+(xyz||[0,0,0]).join(','):chart||'sol';
function route(r,id,create=false){
 const pod=body(r,id);if(pod?.hullModel!=='janusPod')return null;
 const present=r.janusRoutes?.[id];if(present||!create)return present||null;
 const p={craftId:id,stops:[],cursor:0,auto:false,loop:false,stage:'orbit',elapsed:0,exchanges:0,
  initiatedByAuto:false,sourceId:null,destinationId:null,locationId:nowBody(r,pod),locationName:null,coordinate:null,coordinateName:null,oldOffset:null,lastChart:r.frameById?.get(id)?.janusChart||'sol',addressLy:null,targetAddressLy:null,targetChart:null,home:null};
 (r.janusRoutes??={})[id]=p;return p;
}
export function ensureJanusParking(r,pod){
 if(pod?.hullModel!=='janusPod'||pod.placement!=='orbit'||!pad(body(r,pod.parentId)))return false;
 const p=route(r,pod.id,true);if(p?.stage==='orbit')return syncJanusLocal(r,pod,p);return false;
}
export function setupJanusRoutes(r,preset){
 r.janusRoutes={};const setup=preset.janusRoute;if(!setup){for(const pod of r.objects)if(pod.hullModel==='janusPod')ensureJanusParking(r,pod);return;}
 const craft=r.objects.find(o=>o.catalogId===setup.craftKey);if(!craft)return;
 const stops=setup.destinations.map(key=>r.objects.find(o=>o.catalogId===key)?.id).filter(Boolean);
 const p=route(r,craft.id,true);if(!p||!stops.length)return;
 p.stops=stops;p.laps=stops.map(()=>setup.laps??1);p.cursor=Math.max(0,stops.indexOf(p.locationId));p.radii=stops.map((id,i)=>body(r,id)?.type==='waypoint'?null:i===p.cursor&&id===p.locationId?craft.orbitMeters:ringRadius(r,body(r,id),craft));p.auto=true;p.loop=!!setup.loop;syncJanusLocal(r,craft,p);
}
export function janusTargets(r,id){
 const old=r.janusTargetCache;
 if(old?.id===id&&old.objects===r.objects&&old.count===r.objects.length&&old.revision===r.geometryRevision)return old.items;
 const items=r.objects.filter(o=>canTarget(r,o.id,id)).map(o=>({id:o.id,name:o.name||o.type,label:o.name||o.type,kind:o.type==='waypoint'?'waypoint':'orbit',waypoint:o.type==='waypoint'}));
 r.janusTargetCache={id,objects:r.objects,count:r.objects.length,revision:r.geometryRevision,items};return items;
}
function status(r,pod,p){
 const at=nowBody(r,pod),loc=at||null,currentLabel=loc?desc(r,loc):p?.locationName||'Local space';
 const stage=p?.stage||'orbit', active=stage!=='orbit',timer=p?.elapsed||0,span=p?stageSpan(r,pod,p):DWELL;
 return {craftId:pod.id,stage,progress:Math.min(1,timer/Math.max(1e-10,span)),remainingSeconds:Math.max(0,span-timer),laps:p?.auto&&loc?lapCount(p,p.cursor):0,
  active,auto:!!p?.auto,loop:!!p?.loop,exchanges:p?.exchanges||0,currentId:loc||null,currentLabel,
  currentKind:loc?(body(r,loc)?.type==='waypoint'?'waypoint':'orbit'):p?.locationName?'coordinates':'space',
  sourceId:active?p.sourceId:loc,destinationId:active?p.destinationId:p?.stops[nextIndex(p)]||null,
  sourceLabel:active?desc(r,p.sourceId):currentLabel,destinationLabel:active&&p.coordinate?p.coordinateName:desc(r,active?p.destinationId:p?.stops[nextIndex(p)]),
  targets:p?.home?[...janusTargets(r,pod.id),{id:'janus-departure',label:'First departure point',kind:'waypoint'}]:janusTargets(r,pod.id),
  addressLy:p?.addressLy||null,stops:p?.stops.slice()||[]};
}
export function janusBridgeState(r,id){
 const pod=body(r,id||r.driveId||r.selectedId);return pod?.hullModel==='janusPod'?status(r,pod,route(r,pod.id)):null;
}
function nextIndex(p){
 if(!p?.stops.length)return -1;
 if(p.stops[p.cursor]!==p.locationId)return p.cursor;
 return p.cursor+1<p.stops.length?p.cursor+1:p.loop?0:-1;
}
// One itinerary feeds the bridge, the map, the shared Flight playlist editor
// and the save file. An edit can change the next visit without tearing down a
// bridge that is already exchanging the two surroundings.
export function janusSequence(r,id){
 const pod=body(r,id);if(pod?.hullModel!=='janusPod')return null;
 const p=route(r,id),nodes=(p?.stops||[]).map((targetId,i)=>body(r,targetId)?.type==='waypoint'?{targetId,kind:'waypoint'}:{targetId,kind:'orbit',extraLaps:lapCount(p,i),radiusMeters:visitRadius(r,pod,p,i)});
 return {craftId:id,nodes,index:p?.cursor||0,loop:!!p?.loop,active:!!p?.auto,holding:!p?.auto,legsCompleted:p?.exchanges||0,propulsion:'bridge'};
}
export function setJanusSequence(r,id,nodes,opt={}){
 if(!Array.isArray(nodes)||nodes.length>64||nodes.some(n=>!n||!canTarget(r,n.targetId,id)||n.extraLaps!=null&&(!Number.isInteger(n.extraLaps)||n.extraLaps<0||n.extraLaps>99)))return false;
 const p=route(r,id,true);if(!p)return false;
 const pod=body(r,id);
 if(opt.flyNow&&r.navigationModes?.[id]==='manual')r.setNavigationMode(id,'auto');
 for(const n of nodes)if(n.radiusMeters!=null){
  const t=body(r,n.targetId);if(t.type==='waypoint'||!Number.isFinite(n.radiusMeters)||n.radiusMeters<safeRadius(r,t,pod)||n.radiusMeters>1e17)return {error:'Choose a parking radius above the surface and outside the rings.'};
 }
 const old=p.stops,prior=p.cursor,anchor=(p.stage==='orbit'?p.locationId:p.destinationId)||old[prior],ids=nodes.map(n=>n.targetId);
 // Identical consecutive visits count as separate laps; preserve which copy
 // is being flown when an unrelated row is inserted or removed.
 const occurrence=old.slice(0,prior+1).filter(x=>x===anchor).length;
 const indices=ids.map((x,i)=>x===anchor?i:-1).filter(i=>i>=0);
 p.stops=ids;p.laps=nodes.map(n=>n.extraLaps??1);p.radii=nodes.map(n=>body(r,n.targetId)?.type==='waypoint'?null:n.radiusMeters??(p.locationId===n.targetId&&pod.orbitMeters>0?pod.orbitMeters:ringRadius(r,body(r,n.targetId),pod)));
 p.cursor=indices.length?indices[Math.max(0,Math.min(indices.length-1,occurrence-1))]:Math.min(prior,Math.max(0,ids.length-1));
 p.loop=opt.loop??p.loop;
 if(!ids.length)p.auto=false;
 if(opt.active!=null)p.auto=!!opt.active&&!!ids.length;
 if(!opt.flyNow&&p.stage==='orbit'&&ids[p.cursor]===p.locationId&&pod.placement==='orbit'&&Math.abs(visitRadius(r,pod,p,p.cursor)-pod.orbitMeters)>1)beginGuided(r,p,p.locationId,p.cursor);
 if(opt.flyNow&&ids.length===1&&p.stage==='orbit'){
  const pod=body(r,id);p.locationId=nowBody(r,pod);
  const move=p.locationId!==ids[0]||pod.placement==='orbit'&&Math.abs(visitRadius(r,pod,p,0)-pod.orbitMeters)>1;
  if(move&&!beginGuided(r,p,ids[0],0))return false;
  p.auto=true;r.state.paused=false;
 }
 return janusSequence(r,id);
}
export function setJanusItinerary(r,id,ids,loop){
 return Array.isArray(ids)&&!!setJanusSequence(r,id,ids.map(targetId=>({targetId})),{loop});
}
export function setJanusLoop(r,id,on){const p=route(r,id,true);if(!p)return false;p.loop=!!on;return true;}
export function setJanusAuto(r,id,on){
 const p=route(r,id,true);if(!p||on&&!p.stops.length)return false;
 if(on&&r.navigationModes?.[id]==='manual')r.setNavigationMode(id,'auto');
 if(on&&p.stage==='orbit'){const pod=body(r,id);p.locationId=nowBody(r,pod);if(!p.auto)p.elapsed=0;}p.auto=!!on;return true;
}
export function handJanusToPilot(r,id){
 const p=route(r,id);if(!p)return;
 if((p.initiatedByAuto||p.auto)&&p.stage==='charge')resetStage(p);
 p.auto=false;p.elapsed=p.stage==='orbit'?0:p.elapsed;
}
function resetStage(p){delete p.localLeg;delete p.localSpeed;delete p.localVelocity;delete p.localYawJet;delete p.arrivalRadius;Object.assign(p,{stage:'orbit',elapsed:0,initiatedByAuto:false,sourceId:null,destinationId:null,coordinate:null,coordinateName:null,oldOffset:null,targetAddressLy:null,targetChart:null});}
function begin(r,p,target,manual){
 if(p.stage!=='orbit'||r.transfer?.craftId===p.craftId||r.flightSequences?.[p.craftId]?.active)return false;
 const pod=body(r,p.craftId),recall=target==='janus-departure'&&p.home,deep=target&&galactic(target.addressLy),local=target&&coordinates(target.position);
 if(!recall&&!deep&&!local&&(!canTarget(r,target,pod.id)||target===nowBody(r,pod)))return false;
 if(deep&&p.addressLy?.every((x,i)=>x===target.addressLy[i]))return false;
 p.sourceId=nowBody(r,pod)||p.locationId;p.sourceSky=sky(p.lastChart,p.addressLy);p.destinationId=recall||deep||local?null:target;
 p.coordinate=recall?recall.position.slice():deep?[0,0,0]:local?target.position.slice():null;
 p.targetChart=recall?recall.chart:deep?'deep':local?p.lastChart:null;
 p.targetAddressLy=recall?recall.addressLy?.slice()||null:deep?target.addressLy.slice():local?p.addressLy:null;
 p.coordinateName=recall?'First departure point':deep||local?String(target.label||(deep?'Deep space':'Local coordinates')).slice(0,60):null;
 if(manual)p.auto=false;
 p.stage='charge';p.elapsed=0;p.initiatedByAuto=!manual;syncJanusLocal(r,pod,p);
 return true;
}
export function startJanusExchange(r,id,target){const p=route(r,id,true);return !!p&&begin(r,p,target,true);}
function safeRadius(r,dest,pod){
 const R=r.objectRadius(dest)*RG,rings=r.objects.filter(o=>o.parentId===dest.id&&['ring','disk'].includes(o.type));
 return Math.max(R+12*r.objectRadius(pod)*RG,10,...rings.map(o=>1.20*r.objectRadius(o)*RG));
}
function beginGuided(r,p,targetId,index){
 const pod=body(r,p.craftId),t=body(r,targetId),rad=t.type==='waypoint'?0:visitRadius(r,pod,p,index);
 const m=planJanusManeuver(r,pod,p,t,rad);
 if(m){
  Object.assign(p,{stage:'local',elapsed:0,sourceId:nowBody(r,pod),destinationId:t.id,localLeg:m,arrivalRadius:rad||null,initiatedByAuto:true});
  sampleJanusManeuver(r,pod,p);syncJanusLocal(r,pod,p);return true;
 }
 if(!begin(r,p,targetId,false))return false;
 p.arrivalRadius=rad||null;return true;
}
export function startJanusGo(r,id,targetId){
 const p=route(r,id,true);if(!p||p.stage!=='orbit'||!canTarget(r,targetId,id))return false;
 if(!setJanusSequence(r,id,[{targetId}],{loop:false,flyNow:true}))return false;
 return true;
}
function ringRadius(r,dest,pod){
 const R=r.objectRadius(dest)*RG,rings=r.objects.filter(o=>o.parentId===dest.id&&['ring','disk'].includes(o.type));
 return Math.max(1.7*R,R+12*r.objectRadius(pod)*RG,10,...rings.map(o=>1.20*r.objectRadius(o)*RG));
}
function arrivalPhase(r,pod){
 // Match the longitude and therefore the orbital tangent across the atlas
 // handoff. No need to rotate the pilot, chase camera, or mounted cabin.
 return normalTime(r.currentPhase(pod));
}
function arrivalOffset(r,pod,dest,phase,radius=null){
 if(!dest||dest.type==='waypoint')return [0,0,0];
 const b=r.configCache.primaryBasis,rad=(radius||ringRadius(r,dest,pod))/RG,h=orbitClearance(r,{...pod,orbitMeters:rad*RG},dest.id);
 return b[0].map((x,i)=>(x*Math.cos(phase)+b[2][i]*Math.sin(phase))*rad+b[1][i]*h);
}
export function janusExchangeOptics(r,id){
 const p=r.janusRoutes?.[id];if(!p||p.stage==='orbit'||p.stage==='local')return null;
 const pod=body(r,id),committed=p.stage==='settle',oppositeId=committed?p.sourceId:p.destinationId;
 return {craftId:id,sourceId:p.sourceId,destinationId:p.destinationId,stage:p.stage,progress:Math.min(1,p.elapsed/duration(p.stage)),committed,exchanges:p.exchanges,
 currentSky:sky(p.lastChart,p.addressLy),oppositeSky:committed?p.sourceSky||'sol':sky(p.targetChart||r.frameById.get(oppositeId)?.janusChart||p.lastChart,p.targetAddressLy||r.frameById.get(oppositeId)?.janusAddressLy),
 oppositeId,oppositeOffset:committed?p.oldOffset||[0,0,0]:neg(arrivalOffset(r,pod,body(r,oppositeId),arrivalPhase(r,pod),p.arrivalRadius))};
}
function exchange(r,p){
 const pod=body(r,p.craftId),dest=body(r,p.destinationId),source=body(r,p.sourceId);
 if(!pod||!dest&&!p.coordinate)return false;
 r.fillObjects();const before=r.frameById.get(pod.id),origin=r.frameById.get(source?.id);
 const local=p.stage==='local',phase=arrivalPhase(r,pod),f=r.driveId===pod.id&&pod.flight,attitude=before.frame.map(v=>v.slice());
 p.oldOffset=origin?(origin.janusLocalPosition||origin.position).map((v,i)=>v-(before.janusLocalPosition||before.position)[i]):[0,0,0];
 if(!nowBody(r,pod)&&!p.home){const pos=(before.janusLocalPosition||before.position).map(v=>v*RG);p.home={position:pos,chart:p.lastChart||'sol',addressLy:p.addressLy?.slice()||null};}
 const arrivalChart=dest?r.frameById.get(dest.id)?.janusChart||'sol':p.targetChart||p.lastChart||'sol';
 const destPoint=p.coordinate||(dest.type==='waypoint'?[dest.x,dest.y,dest.z]:null);
 delete pod.drivePosition;delete pod.driveBasis;delete pod.driveReturn;delete pod.driveRestore;delete pod.waypointHoldId;delete pod.waypointHoldBasis;
 Object.assign(pod,{epoch:r.time,phase,parentId:destPoint?'space':dest.id,placement:destPoint?'local':'orbit',referenceId:null,heightMeters:0,height:0,
  motion:'orbit',routeParkingHeightMeters:0,warpEnabled:false});
 if(destPoint){[pod.x,pod.y,pod.z]=destPoint;delete pod.orbitMeters;if(dest?.type==='waypoint'){pod.waypointHoldId=dest.id;pod.waypointHoldBasis=attitude;}}
 else pod.orbitMeters=p.arrivalRadius||ringRadius(r,dest,pod);
 if(r.warpObjectId===pod.id){r.state.warpFactor=0;r.state.warp=false;r.warpObjectId=null;}
 if(f){Object.assign(f,{mode:'impulse',warpSetting:0,thrust:0,orbitHold:!destPoint,brakeSpeed:false,brakeTurn:false,curvature:0,torsion:0,
  velocity:[0,0,0],speed:0,angularVelocity:0,visualJet:0,headingTarget:f.headingAngle||0,basis:attitude});delete f.impulseVelocity;delete f.coastDirection;pod.podPropulsion='impulse';}
 if(p.auto&&f){r.driveId=null;delete pod.flight;}
 p.lastChart=arrivalChart;p.addressLy=arrivalChart==='deep'?(r.frameById.get(dest?.id)?.janusAddressLy||p.targetAddressLy||p.addressLy)?.slice()||null:null;
 setJanusChart(r,dest?.id||arrivalChart);
 r.refreshConfiguration();r.fillObjects();const frame=r.frameById.get(pod.id);
 if(f&&r.driveId===pod.id){f.position=frame.position.map(v=>v*RG);pod.drivePosition=frame.position.slice();pod.driveBasis=attitude;
  if(destPoint)f.velocity=[0,0,0];
  f.escapeAnchor=(dest&&!destPoint?r.frameById.get(dest.id).position:frame.position).map(v=>v*RG);
  f.escapeRadiusMeters=destPoint?Math.max(100,r.objectRadius(pod)*200*RG):pod.orbitMeters*8;
 }
 // Keep the user's view and boom distance. A free camera outside the
 // exchanged neighbourhood remains behind; a tracked view follows the pod.
 r.clockSweepStarts?.delete(pod.id);
 p.locationId=dest?.id||null;p.locationName=p.coordinate?p.coordinateName:null;
 if(local){resetStage(p);syncJanusLocal(r,pod,p);}
 else{p.exchanges++;p.stage='settle';p.elapsed=0;}
 r.lastGeometryTime=null;r.fillObjects();r.updateCameraFrame();return true;
}
export function advanceJanusExchanges(r,seconds){
 if(!(seconds>0)||!Number.isFinite(seconds)||r.state.paused)return;
 for(const p of Object.values(r.janusRoutes||{})){
  const pod=body(r,p.craftId);if(!pod)continue;
  if(!p.auto&&p.stage==='orbit'){advanceJanusChart(r,pod,p,seconds);continue;}
  let left=seconds;
  while(left>0){
   if(!p.auto&&p.stage==='orbit'){advanceJanusChart(r,pod,p,left);break;}
   const d=stageSpan(r,pod,p),step=Math.min(left,Math.max(0,d-p.elapsed));
   advanceJanusChart(r,pod,p,step);left-=step;p.elapsed+=step;
   if(p.stage==='local'){sampleJanusManeuver(r,pod,p);syncJanusLocal(r,pod,p);}
   if(p.elapsed<d-1e-9)break;
   if(p.stage==='charge'||p.stage==='local'){if(!exchange(r,p)){resetStage(p);p.auto=false;}}
   else if(p.stage==='settle'){resetStage(p);syncJanusLocal(r,pod,p);}
   else {const i=nextIndex(p),id=p.stops[i];
    if(i<0){p.auto=false;p.elapsed=0;continue;}
    if(id===p.locationId&&(!pod.orbitMeters||Math.abs(visitRadius(r,pod,p,i)-pod.orbitMeters)<1)){p.cursor=i;p.elapsed=0;
     // A closed list of zero-duration visits has no event to advance to.
     if(!p.stops.some((v,k)=>v!==id||lapCount(p,k)>0)){p.auto=false;}continue;}
    if(!beginGuided(r,p,id,i)){p.auto=false;p.elapsed=0;continue;}p.cursor=i;
   }
  }
 }
}
export function reconcileJanusRoutes(r){
 for(const [id,p] of Object.entries(r.janusRoutes||{})){
  if(body(r,id)?.hullModel!=='janusPod'){delete r.janusRoutes[id];continue;}
  if(p.destinationId&&!canTarget(r,p.destinationId,id)||p.sourceId&&!body(r,p.sourceId)){resetStage(p);p.auto=false;}
  if(p.locationId&&!body(r,p.locationId))p.locationId=null;
  const keep=p.stops.map((s,i)=>canTarget(r,s,id)?i:-1).filter(i=>i>=0);p.laps=keep.map(i=>lapCount(p,i));p.radii=keep.map(i=>p.radii?.[i]??null);p.stops=keep.map(i=>p.stops[i]);p.cursor=Math.min(p.cursor,Math.max(0,p.stops.length-1));if(!p.stops.length)p.auto=false;
 }
}
