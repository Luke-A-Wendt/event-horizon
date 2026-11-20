// Planned stop-to-stop transfers in a snapshot of the scene. These do not
// preview from the live ship or start, stop, or otherwise edit its itinerary.
import {sceneCruiseWarp} from './config.js';
import {estimateTransfer} from './travel-math.js';
import {warpForSpeed} from './flight-dynamics.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {SOLAR_MASS_KG} from './solar-catalog.js';
import {sequencePlaneHeight,summarizePlannedRoute} from './travel-routes.js';
import {bridgePlaylistLeg} from './autopilot.js';
import {bridgeWorldLayout} from './proxima-gate-layout.js';
import {edgeOrbitName} from './proximity-orbits.js';


const RG=REFERENCE_RG_METERS;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const scaled=(a,s)=>a.map(x=>x*s);
const diff=(a,b)=>a.map((x,i)=>x-b[i]);
const positive=x=>Number.isFinite(x)&&x>0?x:null;
const chartBodies=new Set(['planet','moon','planetoid','asteroid','star','blackhole','whitehole']);
const empty={properSeconds:null,coordinateSeconds:null,dilationSeconds:null,distanceMeters:null,peakSpeed:null};

// Snapshot in chart units. In particular subtract the source system's anchor
// BEFORE converting to metres or placing the ship on its departure circle.
function snapshot(r,craft,targets){
 const up=r.configCache.primaryBasis[1],parent=r.getFocusFrame(craft.parentId);
 const chartY=parent?dot(parent.position,up):0;
 const frames=new Map(),objects=new Map(r.objects.map(o=>[o.id,o]));
 function put(f){
  if(!f||frames.has(f.id))return;
  let position=[...f.position];
  if(r.routeChartY==null&&objects.has(f.id)&&chartBodies.has(f.type)){
   const adjust=chartY-(r.tourClearances?.get(f.id)||0)-dot(position,up);
   position=position.map((x,i)=>x+adjust*up[i]);
  }
  frames.set(f.id,{...f,position});
 }
 for(const f of r.objectFrames)put(f);
 for(const id of new Set([...targets.map(t=>t.id),'primary','secondary',craft.id]))put(r.getFocusFrame(id));
 const sources=r.clockSources(),items=targets;
 const chartFrames=r.objectFrames.map(f=>frames.get(f.id)).filter(Boolean);
 // Only mass sources are sampled by the transfer clocks; ring and vehicle
 // meshes are not obstacles. Avoid copying the full scene's render state.
 const obstacles=chartFrames.filter(f=>f.massSolar>0);
 return {frames,up,sources,obstacles,items};
}

function ordinaryLeg(r,craft,nodes,chart,from,to,radial){
 const start=nodes[from],dest=nodes[to],origin=chart.frames.get(start.targetId),body=chart.frames.get(dest.targetId),ship=chart.frames.get(craft.id);
 if(!origin||!body||!ship)return {error:'This stop is no longer in the scene.'};
 const point=origin.type==='waypoint';
 if(start.targetId===dest.targetId&&(point||start.radiusMeters===dest.radiusMeters))
  return {properSeconds:0,coordinateSeconds:0,dilationSeconds:0,distanceMeters:0,peakSpeed:null,description:'Same stop; no transfer is needed.'};
 if(!point&&!(start.radiusMeters>0))return {error:'The departure parking radius is not available.'};

 const simCraft={...craft,parentId:point?'space':start.targetId,placement:point?'fixed':'orbit',motion:point?'fixed':'orbit',
  waypointHoldId:point?start.targetId:null,orbitMeters:start.radiusMeters,flight:null,routeParkingHeightMeters:0};
 const local=new Map();
 const frame=id=>{
  if(!local.has(id)){const f=chart.frames.get(id);local.set(id,f?{...f,position:diff(f.position,origin.position)}:null);}
  return local.get(id);
 };
 const objects=r.objects.map(o=>o.id===craft.id?simCraft:o),lens=r.objectRadius.bind(r);
 const sourceFrames=chart.sources.map(s=>{
  const f=frame(s.id);
  return {...s,positionMeters:f?scaled(f.position,RG):diff(s.positionMeters,scaled(origin.position,RG))};
 });
 const simulation={sceneId:r.sceneId,geometryRevision:r.geometryRevision,massScale:r.massScale,
  objects,state:r.state,configCache:r.configCache,driveId:null,transfer:null,
  getFocusFrame:frame,objectRadius:lens,objectFrames:chart.obstacles.map(f=>frame(f.id)),
  fillHoles(){},fillObjects(){},clockSources:()=>sourceFrames,
  travelTargetCache:{key:[craft.id,r.geometryRevision,objects.length].join(':'),items:chart.items}};
 // Start with a neutral altitude for sequencePlaneHeight, not the ship's live
 // position (it may be several light-years from this visit).
 local.set(craft.id,{...ship,position:point?[0,0,0]:scaled(radial,start.radiusMeters/RG)});
 const height=sequencePlaneHeight(simulation,simCraft,nodes.map(n=>n.targetId));
 if(!Number.isFinite(height))return {error:'These stops do not share a flight plane with enough parking clearance.'};
 if(!point)local.get(craft.id).position=local.get(craft.id).position.map((x,i)=>x+chart.up[i]*height/RG);
 return summarizePlannedRoute(simulation,dest.targetId,{craftId:craft.id,planeHeightMeters:height,
  orbitRadii:{[dest.targetId]:dest.radiusMeters},warpFactor:dest.warpFactor??sceneCruiseWarp(r.sceneId)??1,transferProperSeconds:dest.transferProperSeconds});
}

// A future station intercept depends on orbital phase at departure. Use the
// separation now only as an explicitly labelled cruise scale; never mistake
// a station's hub or its host planet's center for a parking orbit.
function dockingLeg(r,from,to){
 const a=r.getFocusFrame(from.targetId),b=r.getFocusFrame(to.targetId);
 if(!a||!b)return {error:'This stop is no longer in the scene.'};
 const parent=n=>n.kind==='dock'?r.objects.find(o=>o.id===n.targetId)?.parentId:n.targetId;
 if(from.targetId===to.targetId)return {localLabel:'Port maneuver',description:'A local docking visit. Timing depends on clearance and port selection; no interplanetary burn is needed.'};
 if(parent(from)===parent(to))return {localLabel:'Orbital rendezvous',description:'Local transfer at the same primary. Timing depends on the departure orbit, station phase and port approach.'};
 const distance=Math.hypot(...diff(b.position,a.position))*RG;
 const {properSeconds,coordinateSeconds,dilationSeconds,peakSpeed}=estimateTransfer(distance,'shuttle',1,{flipCoast:true});
 return {properSeconds,coordinateSeconds,dilationSeconds,peakSpeed,distanceMeters:distance,cruiseEstimate:true,
  description:'Straight-line 1g cruise estimate at the current separation, starting and ending at rest. Excludes target motion, orbital arcs, docking and gravitational clock loss.'};
}

export function playlistRouteModel(host,vehicle,sequence){
 const r=host.delegate||host,craft=r.objects.find(o=>o.id===vehicle.id)||vehicle;
 const nodes=sequence.nodes||[],loop=!!sequence.loop;
 if(!nodes.length)return {stops:[],legs:[],loop};
 const targets=r.getTravelTargets({craftId:craft.id}),byId=new Map(targets.map(t=>[t.id,t])),objects=new Map(r.objects.map(o=>[o.id,o]));
 const stops=nodes.map((n,index)=>{
  const id=n.targetId,t=byId.get(id),f=r.getFocusFrame(id),o=objects.get(id),bridgeWorld=r.state.bridge&&t?.virtual&&!t.waypoint;
  const world=bridgeWorld&&bridgeWorldLayout(t.side==='far',r.sceneId);
  const waypoint=n.kind==='waypoint'||t?.waypoint,dock=n.kind==='dock';
  const radii=nodes.filter(k=>k.targetId===id&&k.radiusMeters>0).map(k=>k.radiusMeters);
  const visit=!waypoint&&new Set(radii).size>1?edgeOrbitName(r,craft,id,n.radiusMeters,radii):'';
  const name=t?.name||o?.name||f?.label||id;
  const horizon=!waypoint&&f?.collapsed?positive((f.horizonRadius||f.radius)*RG):null;
  const orbit=positive(n.radiusMeters);
  return {index,targetId:id,name:visit?name+' · '+visit:name,kind:dock?'dock':waypoint?'waypoint':'orbit',port:dock?n.port:null,stationOrbit:dock?positive(o?.orbitMeters):null,stationParent:dock?objects.get(o?.parentId)?.name:null,
   massKg:waypoint?null:positive((bridgeWorld?world.massSolar:f?.massSolar??o?.massSolar)*SOLAR_MASS_KG),
   radiusMeters:waypoint||horizon?null:bridgeWorld?world.radiusMeters:positive(o?.radiusMeters?o.radiusMeters*(o.scale||1):(f?.physicalRadius||f?.radius)*RG),
   horizonRadiusMeters:horizon,dataNote:o?.dataNote||'',radiusEstimated:!!o?.radiusEstimated,massEstimated:!!o?.massEstimated,orbitRadiusMeters:bridgeWorld&&orbit?orbit*world.radiusMeters/(world.radius*r.configCache.bridgeRadius*RG):orbit};
 });
 if(sequence.propulsion==='bridge'){
  const legs=[];
  for(let i=0;nodes.length>1&&i<(loop?nodes.length:nodes.length-1);i++){
   const j=(i+1)%nodes.length,same=nodes[i].targetId===nodes[j].targetId,radiusChange=same&&nodes[i].radiusMeters!==nodes[j].radiusMeters,point=nodes[i].kind==='waypoint'||nodes[j].kind==='waypoint';
   legs.push({fromIndex:i,toIndex:j,localLabel:radiusChange?'Local warp':same?'Same location':point?'Waypoint transfer':'Bridge exchange',description:radiusChange?'Gradually change parking radius under local warp.':same?'Remain here for the next visit.':point?'Nearby positions are matched under local warp. For a distant waypoint Janus opens its bridge.':'The bridge opens at the cabin and exchanges the local frames. The pod does not fly the intervening distance.'});
  }
  return {stops,legs,loop};
 }
 const legs=[],chart=!r.state.bridge&&nodes.length>1?snapshot(r,craft,targets):null;
 let radial=r.configCache.primaryBasis[0];
 for(let i=0;nodes.length>1&&i<(loop&&!sequence.restartOnLoop?nodes.length:nodes.length-1);i++){
  const j=(i+1)%nodes.length,p=r.state.bridge?bridgePlaylistLeg(r,craft,sequence,i,j):nodes[i].kind==='dock'||nodes[j].kind==='dock'?dockingLeg(r,nodes[i],nodes[j]):ordinaryLeg(r,craft,nodes,chart,i,j,radial);
  radial=p.arrivalRadial||r.configCache.primaryBasis[0];
  if(p.flyThroughThroat)for(const k of [i,j])if(stops[k].kind==='waypoint')stops[k].flyThrough=true;
  const {arrivalRadial,flyThroughThroat,...leg}=p;
  const finite=!p.error&&[p.properSeconds,p.coordinateSeconds,p.distanceMeters,p.dilationSeconds].every(x=>Number.isFinite(x)&&x>=0);
  if(craft.type==='enterprise'&&finite&&leg.maxWarp==null)leg.maxWarp=warpForSpeed(leg.peakSpeed||0);
  legs.push({fromIndex:i,toIndex:j,...empty,...(finite||p.localLabel?leg:{error:p.error||'The planner could not calculate a finite estimate for this transfer.'})});
 }
 return {stops,legs,loop};
}
