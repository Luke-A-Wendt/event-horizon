import {isDriveCraft} from './objects.js';
// Locators and picking use only the optical chart belonging to the displayed
// frame. Previous projections seed the solver; they never smooth its anchors.
import {dysonShellHit} from './dyson.js';
import {dysonCanopyHit} from './dyson-preview.js';
import { SHKADOV_AXIS, shkadovHit } from './shkadov.js';
import { SCENE_PRESETS, holeDisplayName } from './config.js';
import { createOpticalContext, projectLensedPoint, projectShadow, directProjection, hasWeakOpticalField, projectDirectVisible, prepareDirectOcclusion } from './optical-projection.js';
import { installScenePicking } from './scene-picking.js';
import { annotationLabelContext,annotationLabelVisible } from './object-taxonomy.js';
import { captureTransferPath, renderTransferPath } from './transfer-path.js';
import { REFERENCE_RG_METERS } from './objects.js';
import { AU_METERS } from './solar-catalog.js';
import { bridgeWorldLayout,PROXIMA_GATE_SCENE_ID,PROXIMA_GATE_MOON } from './proxima-gate-layout.js';
import { bridgeWorldSphere, bridgeFlatWorldSphere } from './bridge-glsl.js';
import { bridgeRayDistance } from './bridge-math.js';
import { annotationMotion, projectVelocity, velocityGlyph } from './velocity-arrows.js';
import { studyReplayOpacity } from './study-replay.js';
import { metricSpeed } from './metric-units.js';
const sceneNames=new Map(SCENE_PRESETS.map(s=>[s.id,s]));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const overlaps=(a,b,pad=0)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
const vector=v=>Array.from(v||[0,0,0]);
const bodyLabel=b=>b.name||b.label||({planet:'Planet',moon:'Moon',star:'Star',astronaut:'Astronaut',shuttle:'NASA Meridian',heritageShuttle:'NASA Shuttle',enterprise:'NASA Warp Explorer',iss:'ISS',habitat:'NASA Garden Station',classicEnterprise:'Starship Enterprise',probe:'Luminous probe',waypoint:'Waypoint'}[b.type]||b.type);
import {SCENE_ORIGIN,originLabelVisible} from './scene-origin.js';
const priority=(body,focusId)=>body.id===focusId?1e6:body.collapsed?9e5:body.type==='star'?500:body.type==='planet'?400:body.type==='moon'?200:300;
const stableSort=(a,b)=>b.priority-a.priority||b.sizeClass-a.sizeClass||String(a.id).localeCompare(String(b.id));

const LY_METERS=9460730472580800;
const plainRange=new Intl.NumberFormat('en-US',{minimumSignificantDigits:2,maximumSignificantDigits:2});
const superscript=n=>String(n).replace(/[-0-9]/g,c=>c==='-'?'⁻':'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]);
export function formatDestinationDistance(meters){
 if(!Number.isFinite(meters)||meters<0)return '';
 const [unit,scale]=meters>=LY_METERS?['ly',LY_METERS]:meters>=AU_METERS*.1?['AU',AU_METERS]:meters>=1000?['km',1000]:['m',1];
 if(unit==='AU'||unit==='ly')return plainRange.format(meters/scale)+' '+unit;
 const [mantissa,exponent]=(meters/scale).toExponential(1).split('e');
 return mantissa+'×10'+superscript(Number(exponent))+' '+unit;
}
function destinationReadout(r,craft,ship,dest,trip){
 if(!ship?.position||!dest?.position)return '';
 const b=r.configCache?.bridgeRadius,bridge=r.state.bridge&&b>0;
 const park=!trip&&bridge?r.getBridgeParkingOrbit?.(craft.id):null;
 // An elevated parking circle has its own cylindrical radius. Do not substitute
 // the distance to the camera, or the slant range to the body's equatorial plane.
 const radius=trip?.radiusTransfer?trip.orbitRadius:park?.targetId===dest.id?park.localRadiusMeters:
  !trip&&!bridge&&craft.parentId===dest.id&&craft.placement==='orbit'&&(!craft.motion||craft.motion==='orbit')?(craft.orbitMeters??craft.radius*r.massScale*REFERENCE_RG_METERS):null;
 const orbit=Number.isFinite(radius)&&radius>0;
 const local=bridge&&r.state.bridgeSurfaces?bridgeWorldLayout(Math.hypot(...ship.position)<b*.5,r.sceneId):null;
 const meters=orbit?radius:bridge?bridgeRayDistance(ship.position,dest.navigationPosition||dest.position,b)*(local?local.radiusMeters/(local.radius*b):REFERENCE_RG_METERS):
  Math.hypot(...ship.position.map((x,i)=>x-dest.position[i]))*REFERENCE_RG_METERS;
 const distance=formatDestinationDistance(meters);
 return distance?(orbit?'Orbit radius · ':'Destination · ')+distance:'';
}
// The Guild vessel has no autopilot waypoint catalog. Its planets are optical
// surfaces; locate them in the same chart that the submitted frame draws.
function guildWorldLabels(r,optics){
 const b=optics.bridgeRadius,axis=r.configCache.primaryBasis[2],eye=r.cameraFrame.observer;
 const stage=r.getBridgeStage(),closed=stage.open<.001;
 const localFar=closed?stage.far:Math.hypot(...eye)<b*.5*(r.cpu?1:optics.bridgeScale);
 const ends=closed||r.cpu?[localFar]:[false,true];
 return ends.map(far=>{
  const sphere=far&&closed?bridgeFlatWorldSphere(eye,b,axis):bridgeWorldSphere(far,b,axis);
  const scale=!closed&&!r.cpu&&far!==stage.far?optics.bridgeScale**2:1;
  return {id:far?'bridge-far-world':'bridge-near-world',name:far?'Arakas':'Caladan',type:'planet',bridgeSurface:true,localWorld:far===localFar,position:sphere.center.map(x=>x*scale),radius:sphere.radius*scale};
 });
}
// Navigation stores both mouths in one metric chart. Labels follow the visible
// surfaces, including the inverse projection of the far system on a closed gate.
function proximaRouteLabels(r,optics,targets){
 const stage=r.getBridgeStage(),closed=stage.open<.001,b=optics.bridgeRadius;
 const visibleSide=stage.far?'far':'near',axis=r.configCache.primaryBasis[2];
 const labels=[];
 for(const target of targets){
  const far=target.side==='far',gate=target.waypoint;
  if(target.side!==visibleSide&&(gate||closed||r.cpu))continue;
  if(gate){labels.push(target);continue;}
  const layout=bridgeWorldLayout(far,r.sceneId);
  const sphere=closed&&far?bridgeFlatWorldSphere(r.cameraFrame.observer,b,axis,layout):bridgeWorldSphere(far,b,axis,layout);
  const scale=!closed&&!r.cpu&&far!==stage.far?optics.bridgeScale**2:1;
  labels.push({...target,bridgeSurface:true,navigationPosition:target.position,position:sphere.center.map(x=>x*scale),radius:sphere.radius*scale});
 }
 if(!stage.far){
  const moon=bridgeWorldSphere(false,b,axis,PROXIMA_GATE_MOON);
  labels.push({id:'bridge-earth-moon',name:'Moon',type:'moon',virtual:true,bridgeSurface:true,position:moon.center,radius:moon.radius});
 }
 return labels;
}
export function captureAnnotationFrame(renderer){
 if(!renderer?.cameraFrame||renderer.xr?.active)return null;
 const s=renderer.displayState?.()||renderer.state,frame=renderer.cameraFrame,optics=createOpticalContext(renderer),{aspect,fov,width,height}=optics;
 // GPU packing intentionally drops subpixel bodies. Logical positions remain
 // available for tiny locators and picks without cloning the full scene graph.
 const labelContext=annotationLabelContext(renderer);
 const fleet=renderer.sceneId==='shuttle-space'?new Set(renderer.objects.filter(isDriveCraft).map(o=>o.id)):null;
 const travelCraft=[renderer.selectedId,...(fleet?[]:[renderer.driveId]),renderer.focusId].map(id=>renderer.objects?.find(o=>o.id===id&&['shuttle','enterprise'].includes(o.type))).find(Boolean),autoCraft=travelCraft&&(renderer.getNavigationState?.(travelCraft.id)?.mode||'auto')==='auto',travelCraftId=autoCraft?travelCraft.id:null;
 const bridgePod=travelCraft?.hullModel==='janusPod'&&s.annotations?renderer.getJanusBridge?.(travelCraft.id):null;
 const queue=travelCraftId&&renderer.flightSequences?.[travelCraftId],trip=renderer.transfer;
 const craftTrip=trip?.active&&trip.craftId===travelCraftId?trip:null;
 const gateApproach=craftTrip?.pairedGate&&craftTrip.progress<.5;
 const nextGate=gateApproach?(renderer.getBridgeStage().far?'bridge-proxima-gate':'bridge-earth-gate'):null;
 const destinationId=bridgePod?(bridgePod.active||bridgePod.auto?bridgePod.destinationId:null):s.annotations&&travelCraftId?(nextGate||craftTrip?.targetId||queue?.orbitWait?.targetId||queue?.nodes?.[queue.index]?.targetId)||null:null;
 let virtual=s.annotations?(renderer.getNavigationWaypoints?.(travelCraft?.id)||[]):[];
 if(s.annotations&&s.bridge&&s.bridgeSurfaces&&renderer.sceneId===PROXIMA_GATE_SCENE_ID)virtual=proximaRouteLabels(renderer,optics,virtual);
 const guildWorlds=s.annotations&&s.bridge&&s.bridgeSurfaces&&s.bridgeTravelerType==='heighliner'&&s.bridgeWorlds==='caladan'?guildWorldLabels(renderer,optics):[];
 virtual.push(...guildWorlds);
 if(s.annotations&&originLabelVisible(renderer))virtual.push(SCENE_ORIGIN);
 const source=[...(renderer.objectFrames||[]),...virtual.filter(o=>Array.isArray(o.position)&&!(renderer.objectFrames||[]).some(b=>b.id===o.id)).map(o=>({...o,virtual:true,labelEligible:true,index:-1,radius:o.radius||0}))],weak=hasWeakOpticalField(optics),straight=weak||!optics.lensing||optics.cpu||optics.interior,defer=!s.annotations&&!s.velocityArrows&&!straight;
 if(weak){const packed=new Map(optics.bodies.map(b=>[b.id,b]));optics.occluders=source.filter(b=>b.type!=='waypoint'&&!b.virtual&&!b.surfaceCulled&&!['ring','belt','disk','jets','anomaly'].includes(b.type)).map(b=>({...packed.get(b.id),id:b.id,index:b.index,center:b.position.map((v,i)=>v-optics.origin[i]),radius:b.radius}));}
 const candidates=[],openSurfaces=[];
 for(const body of source){
  // A ring or mirror's bounding disc contains empty sky. Keep the real shape
  // with the submitted camera, even when its curvature center is offscreen.
  if(straight&&(body.catalogId==='ringworld'||body.catalogId==='shkadov-mirror')&&!(body.id===renderer.focusId&&renderer.focusMode==='onboard'))openSurfaces.push({id:body.id,type:body.type,catalogId:body.catalogId,name:bodyLabel(body),position:vector(body.position),radius:body.radius});
  if((body.type==='waypoint'&&!s.annotations)||['ring','belt','disk','jets','anomaly'].includes(body.type)||body.id===renderer.focusId&&renderer.focusMode==='onboard')continue;
  const labelEligible=fleet?.has(body.id)||!!body.gridRelativeVelocity||body.id===destinationId||body.type==='waypoint'||!!body.virtual||annotationLabelVisible(body,labelContext);
  // Unlabelled subpixel catalog bodies remain in the tree/map. Only rendered
  // surfaces need picking anchors; avoid projecting hundreds of hidden moons.
  if((s.annotations||s.velocityArrows)&&!labelEligible&&!(body.index>=0)&&body.id!==renderer.focusId)continue;
  const p=directProjection(body.position,frame,aspect,fov);if(!p)continue;
  const radius=body.radius/Math.max(p.z,1e-30)/fov,margin=straight?.035:.35;
  if(Math.abs(p.x)>aspect*(.5+margin)+radius||Math.abs(p.y)>.5+margin+radius)continue;
  candidates.push({id:body.id,body,labelEligible,priority:body.id===destinationId?2e6:body.gridRelativeVelocity?1.5e6:priority(body,renderer.focusId),sizeClass:Math.floor(Math.log2(Math.max(.25,radius*height)))});
 }
 candidates.sort(stableSort);
 const motions=new Map();
 const bodies=(straight||defer?candidates:candidates.slice(0,6)).map(({body,priority,sizeClass,labelEligible})=>{
  const row={id:body.id,labelEligible,index:body.index,type:body.type,virtual:!!body.virtual||body.type==='waypoint',waypoint:!!body.waypoint||body.type==='waypoint',name:bodyLabel(body),position:vector(body.position),radius:body.radius,collapsed:!!body.collapsed,horizonRadius:body.horizonRadius||0,innerHorizonRadius:body.innerHorizonRadius||0,singularityRadius:body.singularityRadius||0,priority,sizeClass};
  // The curvature center of the stellar sail is the star, not a point on the sail.
  if(body.catalogId==='shkadov-mirror')row.position=body.position.map((v,i)=>v+body.radius*SHKADOV_AXIS[i]);
  if(body.rainChart&&s.spectrum==='geometry')row.locatorBead=true;
  if(body.bridgeSurface)row.bridgeSurface=true;
  if(!row.virtual&&(s.velocityArrows||body.gridRelativeVelocity)){
   const motion=annotationMotion(body,renderer);
   if(motion){motions.set(row.id,motion);if(motion.grid)row.velocityDetail=metricSpeed(motion.speed,3)+' relative to grid';}
  }
  return row;
 });
 const holes=[];if(s.blackHole)for(let j=0;j<(s.binary?2:1);j++){const mass=renderer.holeData[j*4+3],spin=j?s.secondarySpin:s.spin;if(!(mass>0))continue;holes.push({id:j?'secondary':'primary',name:holeDisplayName(s,j,sceneNames.get(renderer.sceneId)),type:'hole',position:Array.from(renderer.holeData.slice(j*4,j*4+3)),radius:renderer.configCache.horizon[j],horizonRadius:renderer.configCache.horizon[j],innerHorizonRadius:mass*(1-Math.sqrt(Math.max(0,1-spin*spin))),singularityRadius:Math.abs(spin)*mass,collapsed:true,priority:(j?'secondary':'primary')===destinationId?2e6:9e5,sizeClass:100});}
 if(!s.lensing&&bodies.some(b=>b.locatorBead))for(const h of holes)h.chartHorizon=true;
 if(s.velocityArrows)for(let k=0;k<holes.length;k++){
  const body=holes[k],v=renderer.holeVelocities?.[body.id==='secondary'?1:0];
  if(v)motions.set(body.id,annotationMotion({...body,velocity:v},renderer));
 }
 const entities=[...holes,...bodies].sort((a,b)=>b.priority-a.priority||String(a.id).localeCompare(String(b.id)));
 const poseKey=JSON.stringify([optics.observer,optics.forward,optics.right,optics.up,optics.origin,optics.holes,optics.bodies,optics.gravityCount,optics.steps,optics.warp,optics.anomalies,optics.anomalies?.length?optics.anomalyTime:0,optics.bridge,optics.interior,optics.lensing,optics.cpuLensing,optics.inspectIndex,optics.hideIndex,aspect,fov,width,height,entities.map(b=>[b.id,b.position,b.radius])]);
 const saved=renderer.annotationSolvedPose,cache=renderer.annotationProjectionSeeds||(renderer.annotationProjectionSeeds=new Map());
 const same=saved?.key===poseKey?new Map(saved.values.map(b=>[b.id,b])):null;
 if(!same&&!defer&&straight&&optics.occluders.length>32&&entities.length*optics.occluders.length>=4096)prepareDirectOcclusion(optics);
 for(const body of entities){
  if(defer){body.anchor=null;body.directAnchor=directProjection(body.position,frame,aspect,fov);continue;}
  const old=same?.get(body.id);if(old){body.anchor=old.anchor?{...old.anchor}:null;body.screenRadius=old.screenRadius;continue;}
  body.anchor=body.collapsed&&!optics.interior?projectShadow(optics,body):straight?projectDirectVisible(optics,body.position,body.id):projectLensedPoint(optics,body.position,{id:body.id,index:body.index,radius:body.radius,seed:cache.get(body.id)});
  if(!body.anchor&&body.locatorBead&&straight&&!s.lensing){
   // At contact the center can be just behind the limb, yet the drawn 6px
   // bead still has a visible flank. Anchor only to a ray that sees it.
   const center=directProjection(body.position,frame,aspect,fov);
   if(center)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const span=Math.max(body.radius,6*center.z*fov/height)*.8;
    const flank=body.position.map((v,i)=>v+span*(dx*frame.right[i]+dy*frame.up[i]));
    body.anchor=projectDirectVisible(optics,flank,body.id);if(body.anchor)break;
   }
  }
  if(!body.anchor&&body.bridgeSurface){
   // In chase view the Heighliner can eclipse the center of a larger disk.
   // Pick a visible flank instead of drawing the leader through its hull.
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const flank=body.position.map((x,i)=>x+body.radius*.72*(dx*frame.right[i]+dy*frame.up[i]));
    body.anchor=straight?projectDirectVisible(optics,flank,body.id):projectLensedPoint(optics,flank,{id:body.id,radius:body.radius});
    if(body.anchor)break;
   }
  }
  if(!body.anchor&&body.virtual&&!body.bridgeSurface)body.anchor=directProjection(body.position,frame,aspect,fov);
  if(body.anchor){cache.set(body.id,{x:body.anchor.x,y:body.anchor.y});body.screenRadius=Math.max(body.locatorBead?6/height:0,body.anchor.radius||body.radius/body.anchor.z/fov);}
 }
 // The exact-pose cache is safe even for omitted markers; deterministic work
 // limits avoid intermittent markers caused by browser scheduling deadlines.
 if(!defer)renderer.annotationSolvedPose={key:poseKey,values:entities.map(b=>({id:b.id,anchor:b.anchor?{...b.anchor}:null,screenRadius:b.screenRadius}))};
 // Solve direction tips only after the label/picking budget has been served.
 if(s.velocityArrows)for(const body of entities){
  const motion=motions.get(body.id);
  if(body.anchor&&motion?.speed>0)body.arrow=projectVelocity(motion,body,frame,optics,straight);
 }
 if(cache.size>128){const ids=new Set(entities.map(b=>b.id));for(const id of cache.keys())if(!ids.has(id))cache.delete(id);}
 // With labels off, expensive inverse projections run only when the user taps.
 // The retained chart is from this submitted image, never the live controller.
 const pickOptics=defer?{...optics,origin:vector(optics.origin),observer:vector(optics.observer),forward:vector(optics.forward),right:vector(optics.right),up:vector(optics.up),bodies:optics.bodies.map(b=>({...b,center:vector(b.center),axis:vector(b.axis),...(b.waterCap?{waterCap:{...b.waterCap,direction:vector(b.waterCap.direction)}}:{}),...(b.shapeAxes?{shapeAxes:vector(b.shapeAxes),shapeBasis:b.shapeBasis.map(vector)}:{})})),holes:optics.holes.map(b=>({...b,center:vector(b.center),axis:vector(b.axis)})),warp:optics.warp?{...optics.warp,center:vector(optics.warp.center),axis:vector(optics.warp.axis)}:null,occluders:undefined,budget:{...optics.budget}}:null;
 // Keep a navigation bearing independent of the optical visibility budget.
 const dest=destinationId&&(source.find(b=>b.id===destinationId)||holes.find(b=>b.id===destinationId));
 const destinationBearing=dest?{id:dest.id,name:bodyLabel(dest),type:dest.type,position:vector(dest.position),detail:bridgePod?'Bridge endpoint':destinationReadout(renderer,travelCraft,source.find(b=>b.id===travelCraftId),dest,craftTrip)}:null;
 const local=guildWorlds.find(x=>x.localWorld);
 const localWorldBearing=local?{id:local.id,name:local.name,type:'planet',virtual:true,position:local.position}:null;
 return {kind:'annotation-frame',lineupIds:fleet?[...fleet]:null,...(openSurfaces.length?{openSurfaces}:{}),replayShade:studyReplayOpacity(renderer),localWorldBearing,velocityArrows:!!s.velocityArrows,destinationBearing,destinationId,transferPath:s.annotations&&s.plannedPath?captureTransferPath(renderer,optics):null,driveId:renderer.driveId||null,travelCraftId,bridgePod:!!bridgePod,travelTargetIds:bridgePod?[...bridgePod.targets.map(t=>t.id),...(fleet||[])]:travelCraftId&&s.annotations?(renderer.getTravelTargets?.({craftId:travelCraftId})||[]).map(t=>t.id):null,annotations:!!s.annotations,cpu:!!renderer.cpu,sceneRevision:renderer.sceneRevision,time:renderer.time,focusId:renderer.focusId,cameraFrame:{observer:vector(frame.observer),forward:vector(frame.forward),right:vector(frame.right),up:vector(frame.up)},objectFrames:bodies,holes,pickOptics,projection:{aspect,fov,width,height,rays:optics.budget.rays,steps:optics.budget.iterations,limited:optics.budget.limited,weak},interiorView:optics.interior,geometry:s.spectrum==='geometry'};
}

// x and y are camera-plane offsets (vertical field of view included).
export function openSurfacePick(body,camera,x,y){
 const d=camera.forward.map((v,i)=>v+x*camera.right[i]+y*camera.up[i]),norm=Math.hypot(...d);
 const ray=d.map(n=>n/norm),origin=camera.observer.map((n,i)=>(n-body.position[i])/body.radius);
 let hit;
 if(body.catalogId==='shkadov-mirror')hit=shkadovHit(origin,ray);
 else{
  hit=dysonShellHit(origin,ray,0,Infinity,true);
  hit=dysonCanopyHit(origin,ray,0,hit?.t??Infinity)||hit;
 }
 return hit?hit.t*body.radius/norm:null;
}

export function installAnnotations(scene,getRenderer,options={}){
 const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');
 layer.setAttribute('aria-label','Object labels and velocity arrows');layer.setAttribute('role','img');layer.setAttribute('class','scene-annotations');layer.setAttribute('preserveAspectRatio','none');
 layer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden';layer.style.display='none';scene.append(layer);
 let openPick=null,previousKey='',hits=[],labelHits=[],placements=new Map(),visibleIds=new Set(),lastRevision=null,pendingProjection=null,hasTransferPath=false,hasVelocityArrows=false;
 const bounds=()=>{const sr=scene.getBoundingClientRect(),canvas=options.getSurface?.()||scene.querySelector?.('#universe')||scene.querySelector?.('canvas'),r=canvas?.getBoundingClientRect?.()||sr;return {left:r.left||0,top:r.top||0,width:Math.max(1,r.width),height:Math.max(1,r.height),offsetX:(r.left||0)-(sr.left||0),offsetY:(r.top||0)-(sr.top||0)};};
 function hide(clear=false){layer.style.display='none';previousKey='';labelHits=[];if(clear){hasTransferPath=hasVelocityArrows=false;hits=[];openPick=null;pendingProjection=null;gestures.cancel();}}
 function setStatus(stats){if(stats?.renderFailed||stats?.vrActive){hide(true);return;}if(stats?.annotations===false&&!hasTransferPath&&!hasVelocityArrows)hide();}
 function pick(clientX,clientY){const rect=bounds(),x=clientX-rect.left,y=clientY-rect.top;if(x<0||y<0||x>rect.width||y>rect.height)return null;const label=labelHits.find(h=>x>=h.box.x&&x<=h.box.x+h.box.w&&y>=h.box.y&&y<=h.box.y+h.box.h);if(label)return {...label.body,hit:'label'};
  if(pendingProjection){const {entities,optics,solved}=pendingProjection;const c={...optics,occluders:[...optics.holes,...optics.bodies],budget:{...optics.budget,rays:0,iterations:0,limited:false,deadline:Infinity}},score=b=>{const a=b.directAnchor;if(!a)return Infinity;return Math.max(0,Math.hypot(rect.width*.5+a.x/c.aspect*rect.width-x,rect.height*.5-a.y*rect.height-y)-b.radius/a.z/c.fov*rect.height);},chosen=[...entities.filter(b=>b.type==='hole'),...entities.filter(b=>b.type!=='hole').sort((a,b)=>score(a)-score(b)||String(a.id).localeCompare(String(b.id))).slice(0,6)].sort((a,b)=>score(a)-score(b));
   for(const body of chosen){if(solved.has(body.id)||c.budget.limited)continue;const anchor=body.collapsed&&!c.interior?projectShadow(c,body):projectLensedPoint(c,body.position,{id:body.id,index:body.index,radius:body.radius});solved.add(body.id);if(!anchor)continue;hits.push({body:{...body,anchor},x:rect.width*.5+anchor.x/c.aspect*rect.width,y:rect.height*.5-anchor.y*rect.height,z:anchor.z,radius:(anchor.radius||body.radius/anchor.z/c.fov)*rect.height});}
  }
  let candidates=hits;
  if(openPick){
   candidates=hits.filter(h=>!openPick.bodies.some(b=>b.id===h.body.id));
   const dx=(x/rect.width-.5)*openPick.aspect*openPick.fov,dy=(.5-y/rect.height)*openPick.fov;
   for(const body of openPick.bodies){const z=openSurfacePick(body,openPick.camera,dx,dy);if(z!==null)candidates.push({body,x,y,z,radius:0});}
  }
  return candidates.map(h=>({...h,distance:Math.hypot(x-h.x,y-h.y)})).filter(h=>h.distance<=Math.max(9,h.radius)).sort((a,b)=>(a.distance<=a.radius?0:1)-(b.distance<=b.radius?0:1)||a.z-b.z||a.distance-b.distance).map(h=>({...h.body,hit:'body'}))[0]||null;
 }
 const gestures=installScenePicking(scene,pick,{getFocusId:()=>getRenderer()?.focusId,...options});
 function update(value){
  if(!value||value.renderFailed){hide(true);return;}
  // Live delivery never asks the controller for its newer camera or positions.
  const r=value.kind==='annotation-frame'?value:captureAnnotationFrame(getRenderer());if(!r?.cameraFrame){hide(true);return;}
  const rect=bounds(),{width,height}=rect,aspect=r.projection?.aspect||width/height,fov=r.projection?.fov||.83,mobile=width<600;
  if(lastRevision!==r.sceneRevision){placements.clear();visibleIds.clear();gestures.cancel();lastRevision=r.sceneRevision;}
  const travelTargets=!r.lineupIds&&r.travelCraftId?new Set(r.travelTargetIds||[]):null;
  // A destination marker still belongs to its world point. Move just its label
  // around the instruments, including when they are collapsed or resized.
  const instrument=(r.annotations||r.velocityArrows)&&scene.querySelector?.('#sceneMetrics');
  const panel=instrument?.id==='sceneMetrics'&&instrument.getBoundingClientRect?.();
  const rail=panel&&panel.width>0&&panel.height>0?{x:panel.left-rect.left,y:panel.top-rect.top,w:panel.width,h:panel.height}:null;
  const obstructions=r.lineupIds?['.scene-heading','.viewport-dock','#viewportScenes'].map(selector=>scene.querySelector?.(selector)?.getBoundingClientRect?.()).filter(b=>b?.width>0&&b?.height>0).map(b=>({x:b.left-rect.left,y:b.top-rect.top,w:b.width,h:b.height})):[];
  const key=JSON.stringify([rect,rail,obstructions,r]);if(key===previousKey)return;previousKey=key;
  Object.assign(layer.style,{left:rect.offsetX+'px',top:rect.offsetY+'px',width:width+'px',height:height+'px'});layer.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const entities=[...(r.objectFrames||[]),...(r.holes||[])],screen=a=>a?{x:width*.5+a.x/aspect*width,y:height*.5-a.y*height,z:a.z}:null;pendingProjection=r.pickOptics?{entities,optics:r.pickOptics,solved:new Set()}:null;
  openPick=r.openSurfaces?.length?{bodies:r.openSurfaces,camera:r.cameraFrame,aspect,fov}:null;
  hits=[];labelHits=[];hasVelocityArrows=!!r.velocityArrows;const pathMarkup=renderTransferPath(r.transferPath,width,height,aspect);hasTransferPath=!!pathMarkup;const labels=[],out=pathMarkup?[pathMarkup]:[],boxes=rail?[rail,...obstructions]:obstructions;
  const teaching=entities.some(b=>b.locatorBead);
  for(const body of entities){
   const p=screen(body.anchor);if(!p)continue;const pixelRadius=(body.screenRadius||body.radius/p.z/fov)*height;if(!Number.isFinite(p.x+p.y+pixelRadius))continue;
   hits.push({body,x:p.x,y:p.y,z:p.z,radius:pixelRadius});
   if(r.lineupIds?.includes(body.id)&&pixelRadius<Math.min(width,height)*.45){
    const a=Math.max(8,Math.min(pixelRadius*.76,width*.15));boxes.push({x:p.x-a,y:p.y-a,w:2*a,h:2*a});
   }
   if(teaching&&(body.locatorBead||body.type==='star'||body.type==='hole')&&pixelRadius<Math.min(width,height)*.32){
    const a=pixelRadius+3;boxes.push({x:p.x-a,y:p.y-a,w:2*a,h:2*a});
   }
   if(r.velocityArrows){
    const glyph=velocityGlyph(body,p,pixelRadius,{width,height,mobile});
    if(glyph){out.push(glyph.svg);if(body.velocityDetail)boxes.push(...glyph.boxes);}
   }
   if(!r.annotations||body.labelEligible===false||travelTargets&&!travelTargets.has(body.id)&&!body.waypoint||p.x<3||p.x>width-3||p.y<3||p.y>height-3)continue;
   const id=body.id,destination=id===r.destinationId,base={body,id,p,destination,text:body.name||bodyLabel(body),detail:r.lineupIds?.includes(id)?'1× inspect · 2× drive':destination?(r.destinationBearing?.detail||'Destination'):travelTargets?.has(body.id)?(r.bridgePod?'Tap bridge · double-tap exchange':'Tap preview · double-tap Go'):body.collapsed?(body.chartHorizon?'Event horizon':r.cpu?'Shadow · CPU schematic':'Lensed shadow'):(mobile?body.velocityDetail?.replace(' relative to grid',' vs grid'):body.velocityDetail)||'',radius:pixelRadius,priority:body.priority??priority(body,r.focusId),sizeClass:body.sizeClass??Math.floor(Math.log2(Math.max(.25,pixelRadius))),color:'#9bcbe4',shadow:body.collapsed};
   if(destination&&body.collapsed&&r.interiorView)labels.push(base);
   if(!body.collapsed||!r.interiorView){labels.push(base);continue;}
   for(const [value,color,inner] of [[body.horizonRadius,'#a6dcf3',false],[body.innerHorizonRadius,'#edca8b',true]]){if(!(value>body.horizonRadius*.001))continue;const radius=value/Math.max(p.z,1e-20)/fov*height;labels.push({...base,destination:false,priority:Math.min(base.priority,9e5),id:id+(inner?':inner':':outer'),p:{...p,x:clamp(p.x+(inner?-1:1)*radius*.7,12,width-12),y:clamp(p.y+(inner?1:-1)*radius*.7,12,height-12)},text:inner?'Inner horizon · r−':'Event horizon · r+',detail:'Coordinate geometry cutaway',radius:0,color,boundary:true,inner});}
   labels.push({...base,destination:false,priority:Math.min(base.priority,9e5),id:id+':singularity',text:body.singularityRadius>body.horizonRadius*.001?'Ring singularity':'Point singularity',detail:'Coordinate geometry cutaway',radius:0,color:'#f3b3c4',singularity:true});
  }
  // A missed optical solution is not a lost destination. Use its bearing,
  // without making an occluded body hittable or reusing a previous frame.
  for(const dest of [r.destinationBearing,r.localWorldBearing])if(r.annotations&&dest&&!labels.some(l=>l.id===dest.id)){
   const local=dest===r.localWorldBearing;
   const f=r.cameraFrame,v=dest.position.map((x,i)=>x-f.observer[i]),dot=a=>a.reduce((sum,x,i)=>sum+x*v[i],0);
   const z=dot(f.forward),right=dot(f.right),up=dot(f.up);
   let x=right,y=-up;
   const inset=12,halfW=Math.max(1,width/2-inset),halfH=Math.max(1,height/2-inset);
   if(z>1e-20){x=x/z/fov*height;y=y/z/fov*height;}
   if(z<=1e-20||Math.abs(x)>halfW||Math.abs(y)>halfH){
    if(Math.hypot(x,y)<1e-15*Math.max(1,Math.abs(z))){x=0;y=1;}
    const k=Math.max(Math.abs(x)/halfW,Math.abs(y)/halfH)||1;x/=k;y/=k;
   }else if(local)continue; // On-screen but optically occluded.
   labels.push({body:dest,id:dest.id,p:{x:width/2+x,y:height/2+y,z},destination:!local,text:dest.name,detail:local?'Off screen':dest.detail||'Destination',radius:0,priority:2e6,sizeClass:0,color:'#9bcbe4'});
  }
  if(!r.annotations&&!hasTransferPath&&!r.velocityArrows){hide();return;}layer.style.display='block';
  // Hysteresis affects which label and which corner wins, never the anchor.
  labels.sort((a,b)=>b.priority-a.priority||(b.sizeClass+(visibleIds.has(b.id)?1:0))-(a.sizeClass+(visibleIds.has(a.id)?1:0))||String(a.id).localeCompare(String(b.id)));
  const nextVisible=new Set();let count=0;
  for(const item of labels){
   const {p}=item;out.push(`<circle data-object-marker="${esc(item.body.id)}" cx="${p.x}" cy="${p.y}" r="${item.radius<2?2.6:2.2}" fill="${item.color}" opacity=".8"/>`);
   if(count>=(mobile?8:14))continue;
   const font=(mobile?11:12)+(item.destination?2:0),text=item.text.length>27?item.text.slice(0,26)+'…':item.text,detail=item.detail||'',w=clamp(Math.max(text.length*font*.57,detail.length*(item.destination?11*.61:9.6*.56))+22,75,mobile?190:240),h=detail?42:27,offset=clamp(item.radius+16,26,Math.min(height*.25,160));
   const alternatives=[];for(const distance of [offset,offset+34,offset+68])alternatives.push({x:p.x+distance*.65,y:p.y-distance-h*.5},{x:p.x-distance*.65-w,y:p.y-distance-h*.5},{x:p.x+distance*.65,y:p.y+distance-h*.5},{x:p.x-distance*.65-w,y:p.y+distance-h*.5});
   if(rail&&(item.destination||item.body.velocityDetail))alternatives.push({x:p.x-w/2,y:rail.y-h-8},{x:rail.x+rail.w+8,y:p.y-h/2},{x:p.x-w/2,y:rail.y+rail.h+8});
   const previous=placements.get(item.id),indices=alternatives.map((_,i)=>i);if(previous!==undefined&&previous<alternatives.length){indices.splice(indices.indexOf(previous),1);indices.unshift(previous);}
   let box,chosen;for(const i of indices){const c=alternatives[i],candidate={x:clamp(c.x,10,Math.max(10,width-w-10)),y:clamp(c.y,Math.min(76,height*.18),Math.max(76,height-42-h)),w,h};if(!boxes.some(other=>overlaps(candidate,other,i===previous?0:5))){box=candidate;chosen=i;break;}}
   // In portrait a passing tracer can be pinned between the core and HUD.
   // Keep its value visible in the nearest free slot, with the leader attached.
   if(!box&&(item.body.locatorBead||r.lineupIds?.includes(item.id))){
    let best=Infinity;const y0=Math.min(76,height*.18),y1=Math.max(y0,height-42-h),x1=Math.max(10,width-w-10);
    for(let yi=0;yi<=10;yi++)for(let xi=0;xi<=6;xi++){
     const probe={x:10+(x1-10)*xi/6,y:y0+(y1-y0)*yi/10,w,h},distance=Math.hypot(probe.x+w/2-p.x,probe.y+h/2-p.y);
     if(distance<best&&!boxes.some(other=>overlaps(probe,other,3))){box=probe;best=distance;}
    }
   }
   if(!box)continue;
   boxes.push(box);placements.set(item.id,chosen);nextVisible.add(item.id);count++;labelHits.push({box,body:item.body});
   const edgeX=box.x>p.x?box.x:box.x+w,edgeY=box.y+h*.5,dx=edgeX-p.x;
   out.push(`<g class="annotation-label" data-object-id="${esc(item.body.id)}" ${item.boundary?`data-boundary-label="${item.inner?'inner':'outer'}"`:item.singularity?'data-singularity-label="true"':item.shadow?'data-shadow-label="true"':''}><path d="M${p.x} ${p.y}C${p.x+dx*.35} ${p.y} ${edgeX-dx*.25} ${edgeY} ${edgeX} ${edgeY}" fill="none" stroke="${item.color}" stroke-opacity=".8" stroke-width="1.2"/><rect x="${box.x}" y="${box.y}" width="${w}" height="${h}" rx="6" fill="#071320" fill-opacity="${item.destination?1:.9}" stroke="${item.color}" stroke-opacity="${item.destination?.95:.55}"/><text x="${box.x+11}" y="${box.y+18}" fill="#e9f5fb" font-family="system-ui,sans-serif" font-size="${font}" font-weight="${item.destination?900:650}">${esc(text)}</text>${detail?`<text x="${box.x+11}" y="${box.y+33}" fill="${item.color}" font-family="system-ui,sans-serif" font-size="${item.destination?11:9.6}" font-weight="${item.destination?800:400}">${esc(detail)}</text>`:''}</g>`);
  }
  visibleIds=nextVisible;for(const id of placements.keys())if(!labels.some(b=>b.id===id))placements.delete(id);
  layer.innerHTML=out.join('');
 }
 return {update,setStatus,pick,dispose(){gestures.dispose();layer.remove();hits=[];labelHits=[];placements.clear();}};
}
