// Guided travel is a bounded cinematic transfer, not an N-body rendezvous solver.
// Physical trip clocks advance through an analytic profile during ten active wall seconds.
import {REFERENCE_RG_METERS,OBJECT_CLASS} from './objects.js';
import {clockRate} from './object-clocks.js';
import {estimateTransfer,sampleTransfer,TRANSFER_WALL_SECONDS,transferEase,buildTransferCurve,sampleTransferCurve} from './travel-math.js';
import {orthonormalFrame,warpForSpeed} from './flight-dynamics.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
function directionMix(a,b,t){const d=Math.max(-1,Math.min(1,dot(a,b)));if(d>.999)return unit(mix(a,b,t));const angle=Math.acos(d),n=d<-.999?unit(cross(a,Math.abs(a[1])<.8?[0,1,0]:[1,0,0])):unit(sub(b,mul(a,d)));return add(mul(a,Math.cos(angle*t)),mul(n,Math.sin(angle*t)));}
function rotateBasis(basis,from,to){const d=Math.max(-1,Math.min(1,dot(from,to))),raw=cross(from,to),length=Math.hypot(...raw);if(d>1-1e-12)return basis.map(v=>[...v]);const axis=length>1e-10?mul(raw,1/length):unit(cross(from,Math.abs(from[1])<.8?[0,1,0]:[1,0,0])),angle=Math.acos(d),c=Math.cos(angle),sn=Math.sin(angle);return basis.map(v=>add(add(mul(v,c),mul(cross(axis,v),sn)),mul(axis,dot(axis,v)*(1-c))));}
function transportBasis(basis,forward){const rotated=rotateBasis(basis,basis[2],forward);return orthonormalFrame([rotated[0],rotated[1],forward]);}
const physical=f=>(f.physicalRadius||f.radius||0)*REFERENCE_RG_METERS;
export function travelTargets(r){
 const craft=r.objects.find(o=>o.id===r.driveId);if(!craft||r.state.bridge)return [];
 const key=[r.driveId,r.geometryRevision,r.objects.length].join(':');if(r.travelTargetCache?.key===key)return r.travelTargetCache.items;
 const nodes=r.getObjectTree(),byId=new Map(nodes.map(n=>[n.id,n])),objects=new Map(r.objects.map(o=>[o.id,o])),mass=id=>id==='primary'?r.state.mass*1e6:id==='secondary'?r.state.mass*1e6*r.state.binaryRatio:id==='planet'?r.state.planetMass*3e-6:id==='tidalStar'?1:r.objectMassSolar(objects.get(id)||{}),descendants=new Set([craft.id]),queue=[craft.id];while(queue.length){const node=byId.get(queue.pop());for(const id of node?.children||[]){descendants.add(id);queue.push(id);}}
 const candidates=nodes.filter(n=>n.id!=='space'&&!descendants.has(n.id)&&n.canAdd&&OBJECT_CLASS[n.type]>=OBJECT_CLASS[craft.type]&&mass(n.id)>0);
 const items=candidates.filter(n=>OBJECT_CLASS[n.type]>OBJECT_CLASS[craft.type]||r.canParentObject(craft.type,n.id,craft.id).ok).map(n=>({id:n.id,name:n.label,label:n.label,type:n.type}));
 r.travelTargetCache={key,items};return items;
}
function targetInfo(r,id){return travelTargets(r).find(n=>n.id===id);}
function bezier(p,t){const a=mix(p[0],p[1],t),b=mix(p[1],p[2],t),c=mix(p[2],p[3],t);return mix(mix(a,b,t),mix(b,c,t),t);}
function routePoint(route,fraction){return sampleTransferCurve(route,fraction).position;}
function safeRoute(points,obstacles){let last=points[0];for(let i=1;i<=40;i++){const p=bezier(points,i/40),d=sub(p,last),norm=dot(d,d);for(const body of obstacles){const t=norm?Math.max(0,Math.min(1,dot(sub(body.center,last),d)/norm)):0;if(Math.hypot(...sub(add(last,mul(d,t)),body.center))<body.radius)return false;}last=p;}return true;}
function planRoute(r,id){
 const item=targetInfo(r,id),craft=r.objects.find(o=>o.id===r.driveId);if(!item||!craft?.flight)return {error:'Choose an orbitable destination while driving.'};
 r.fillHoles();r.fillObjects();const target=r.getFocusFrame(id),ship=r.getFocusFrame(craft.id);if(!target||!ship)return {error:'That destination is no longer available.'};
 const center=mul(target.position,REFERENCE_RG_METERS),start=[...craft.flight.position],shipRadius=physical(ship),radius=Math.max(2*physical(target)+2*shipRadius,4*(target.horizonRadius||0)*REFERENCE_RG_METERS,shipRadius*8,1);
 const plane=r.configCache.primaryBasis||[[1,0,0],[0,1,0],[0,0,1]],from=sub(start,center),phase=Math.atan2(dot(from,plane[2]),dot(from,plane[0])),offset=add(mul(plane[0],Math.cos(phase)*radius),mul(plane[2],Math.sin(phase)*radius)),end=add(center,offset),tangent=unit(add(mul(plane[0],Math.sin(phase)),mul(plane[2],-Math.cos(phase))));
 const distance=Math.hypot(...sub(end,start)),forward=craft.flight.basis[2],arch=mul(plane[1],distance*.18);
 // An off-plane arc avoids diving through the central plane on cross-system trips.
 if(distance<Math.max(1,shipRadius*.01))return {error:'Already at this parking orbit.'};
 const bodies=[...r.objectFrames,...(r.state.blackHole?[r.getFocusFrame('primary'),...(r.state.binary?[r.getFocusFrame('secondary')]:[])]:[])].filter(Boolean);
 const obstacles=bodies.filter(o=>o.id!==craft.id&&o.massSolar>0&&!['disk','jets','ring','belt','dyson','anomaly'].includes(o.type)).map(o=>({center:mul(o.position,REFERENCE_RG_METERS),radius:Math.max(physical(o),(o.horizonRadius||0)*REFERENCE_RG_METERS*1.02)+shipRadius}));
 let points;for(const factor of [1,2.5,5,-2.5,-5]){const lift=mul(arch,factor),candidate=[start,add(add(start,mul(forward,distance*.18)),lift),add(sub(end,mul(tangent,distance*.18)),lift),end];if(safeRoute(candidate,obstacles)){points=candidate;break;}}
 if(!points)return {error:'No clear approach from here. Move away from the nearby body and try again.'};
 const {arc,length}=buildTransferCurve(points);
 const plan=estimateTransfer(length,craft.type);let gravityLag=0;if(craft.type==='shuttle'){const sources=r.clockSources();let previous=sampleTransfer(plan,0);for(let i=1;i<=16;i++){const next=sampleTransfer(plan,i/16),middle=sampleTransfer(plan,(i-.5)/16),positionMeters=routePoint({points,arc},middle.distanceFraction),rate=clockRate({id:craft.id,positionMeters,bodyRadiusMeters:shipRadius,sources});gravityLag+=(next.coordinateSeconds-previous.coordinateSeconds)*Math.max(0,rate.gravityExcess||0);previous=next;}}
 return {targetId:id,targetName:item.name,mode:craft.type==='shuttle'?'1g':'Warp 1',coordinateSeconds:plan.coordinateSeconds+gravityLag,properSeconds:plan.properSeconds,distanceMeters:length,orbitRadiusMeters:radius,dilationSeconds:plan.dilationSeconds+gravityLag,plan,points,arc,center,offset,phase,tangent};
}
export function previewRoute(r,id){const p=planRoute(r,id);if(p.error)return p;const {plan,points,arc,center,offset,phase,tangent,...preview}=p;return preview;}
export function beginRoute(r,id){
 const route=planRoute(r,id);if(route.error)return false;const craft=r.objects.find(o=>o.id===r.driveId);
 // A destination selected from the map may have changed the viewing target.
 if(r.focusId!==craft.id||r.focusMode!=='track')r.focusTarget(craft.id,'track');
 r.updateCameraFrame();const ship=r.getFocusFrame(craft.id),reference=r.focusReferenceFrame?.id===craft.id?r.focusReferenceFrame.basis:ship.frame,eye=unit(sub(r.cameraFrame.observer,ship.position)),outward=unit(route.offset),arrivalEye=unit(add(mul(outward,Math.cos(.28)),mul(route.tangent,Math.sin(.28))));
 r.cameraGuide=null;r.focusReferenceFrame={id:craft.id,basis:reference.map(v=>[...v])};
 r.transfer={...route,active:true,craftId:craft.id,elapsed:0,wallSeconds:TRANSFER_WALL_SECONDS,progress:0,initialSpeed:craft.flight.speed||0,initialBasis:craft.flight.basis.map(v=>[...v]),cameraBasis:reference.map(v=>[...v]),cameraEye:eye,cameraArrivalEye:arrivalEye,cameraAngles:[r.target.yaw,r.target.pitch,r.target.lookYaw,r.target.lookPitch,r.target.focusDistance],sample:sampleTransfer(route.plan,0),gravityLag:0,coordinateElapsedSeconds:0,properElapsedSeconds:0,phaseName:'Accelerating'};
 r.lastTransfer=null;r.flightInput={speed:0,curvature:0,torsion:0};craft.flight.brakeSpeed=false;craft.flight.brakeTurn=false;r.state.paused=false;
 if(craft.type==='enterprise'){r.state.warp=true;r.warpObjectId=craft.id;r.state.warpScenario='orbit';r.state.warpFactor=0;for(const o of r.objects)o.warpEnabled=o.id===craft.id;r.refreshConfiguration();}
 return true;
}
export function cancelRoute(r){if(!r.transfer?.active)return false;r.lastTransfer={...routeState(r),active:false,phase:'Cancelled'};r.transfer=null;return true;}
export function routeState(r){const t=r.transfer;if(!t?.active)return r.lastTransfer||{active:false};return {active:true,targetId:t.targetId,targetName:t.targetName,mode:t.mode,progress:t.progress,phase:t.phaseName,coordinateElapsedSeconds:t.coordinateElapsedSeconds,properElapsedSeconds:t.properElapsedSeconds,coordinateSeconds:t.coordinateSeconds,properSeconds:t.properSeconds,dilationSeconds:t.sample.dilationSeconds+t.gravityLag,orbitRadiusMeters:t.orbitRadiusMeters};}
function addClock(clock,key,comp,delta){const y=delta-(clock[comp]||0),old=clock[key]||0,n=Math.min(1e300,old+y);clock[comp]=(n-old)-y;clock[key]=n;}
export function advanceRoute(r,dt){
 const t=r.transfer;if(!t?.active)return false;if(t.geometryTime!==r.time){r.fillHoles();r.fillObjects();t.geometryTime=r.time;}const craft=r.objects.find(o=>o.id===t.craftId),f=craft?.flight,target=r.getFocusFrame(t.targetId);if(!f||r.driveId!==t.craftId||!target){cancelRoute(r);return false;}
 r.transferClockObjectId=craft.id;
 t.elapsed=Math.min(t.wallSeconds,t.elapsed+Math.max(0,dt));if(t.elapsed>t.wallSeconds-1e-9)t.elapsed=t.wallSeconds;const progress=t.elapsed/t.wallSeconds,sample=sampleTransfer(t.plan,transferEase(progress)),old=t.sample;
 const curve=sampleTransferCurve(t,sample.distanceFraction),movingCenter=mul(target.position,REFERENCE_RG_METERS),drift=mul(sub(movingCenter,t.center),transferEase(sample.distanceFraction)),p=add(curve.position,drift),forward=curve.tangent;
 // Rotate continuously around the transported up axis for the braking burn.
 // Two smooth half turns avoid an antipodal interpolation choosing a new axis.
 const pathBasis=transportBasis(t.initialBasis,forward),turn=craft.type==='shuttle'?Math.PI*(transferEase((progress-.33)/.30)+transferEase((progress-.74)/.26)):0,along=add(mul(forward,Math.cos(turn)),mul(pathBasis[0],Math.sin(turn))),heading=directionMix(t.initialBasis[2],along,transferEase(progress/.18)),basis=transportBasis(pathBasis,heading);
 // World-stable tracking prevents the Shuttle's braking flip from swinging
 // the observer through 180 degrees. User panning/zoom releases the automatic
 // framing rotation, while preserving that stable reference without a snap.
 const cameraAngles=[r.target.yaw,r.target.pitch,r.target.lookYaw,r.target.lookPitch,r.target.focusDistance];
 if(cameraAngles.some((v,i)=>Math.abs(v-t.cameraAngles[i])>1e-7))t.cameraReleased=true;
 if(!t.cameraReleased&&r.focusId===craft.id&&r.focusMode==='track'&&r.focusReferenceFrame?.id===craft.id){
  const direction=directionMix(t.cameraEye,t.cameraArrivalEye,transferEase(progress));r.focusReferenceFrame.basis=rotateBasis(t.cameraBasis,t.cameraEye,direction);
 }

 f.position=p;f.basis=basis;f.speed=Math.min(craft.type==='shuttle'?299792458*(1-8*Number.EPSILON):Infinity,sample.speedMetersPerSecond+(t.initialSpeed||0)*(1-smooth(progress/.15)));f.velocity=mul(forward,f.speed);f.angularVelocity=0;f.curvature=0;f.torsion=0;f.thrust=craft.type==='shuttle'&&progress>0&&progress<1?1:0;f.brakeSpeed=false;f.travelCompression=1;craft.drivePosition=mul(p,1/REFERENCE_RG_METERS);craft.driveBasis=basis.map(v=>[...v]);
 if(craft.type==='enterprise'){r.state.warpFactor=warpForSpeed(f.speed);f.warpSetting=r.state.warpFactor;f.gridPhase=((f.gridPhase||0)+dt*.12*Math.log1p(f.speed/299792458))%4096;}
 t.progress=progress;t.phaseName=progress<.5?'Accelerating':'Braking';
 if(craft.clock){
  const rendered=r.getFocusFrame(craft.id);if(rendered)rendered.position=[...craft.drivePosition];
  const rate=r.clockRateForObject(craft),extra=Math.max(0,rate.gravityExcess??rate.gravityFactor-1),distant=Math.max(0,sample.coordinateSeconds-old.coordinateSeconds),proper=Math.max(0,sample.properSeconds-old.properSeconds),lag=Math.max(0,sample.dilationSeconds-old.dilationSeconds),gravityLag=extra*distant;
  addClock(craft.clock,'coordinateSeconds','coordinateCompensation',distant+gravityLag);addClock(craft.clock,'properSeconds','properCompensation',proper);addClock(craft.clock,'lagSeconds','lagCompensation',lag+gravityLag);craft.clock.rapidityVector=mul(forward,sample.rapidity);t.gravityLag+=gravityLag;
 }
 t.sample=sample;t.coordinateElapsedSeconds=sample.coordinateSeconds+t.gravityLag;t.properElapsedSeconds=sample.properSeconds;
 if(progress>=1){
  if(!r.canParentObject(craft.type,t.targetId,craft.id).ok){cancelRoute(r);return false;}
  const completed={...routeState(r),active:false,phase:'Arrived'};r.transfer=null;
  craft.parentId=t.targetId;craft.referenceId=null;craft.placement='orbit';craft.motion='orbit';craft.orbitMeters=t.orbitRadiusMeters;craft.radius=t.orbitRadiusMeters/(r.massScale*REFERENCE_RG_METERS);craft.height=0;craft.heightMeters=0;craft.orbitInclination=0;craft.orbitNode=0;craft.argumentPeriapsis=0;craft.orbitReferenceFrame='ecliptic';craft.eccentricity=0;craft.phase=t.phase;craft.epoch=r.time;delete craft.orbitBarycenter;delete craft.barycentric;delete craft.orbitalPeriodSeconds;delete craft.driveRestore;
  if(craft.type==='enterprise'){craft.warpEnabled=false;r.state.warp=false;r.state.warpFactor=0;r.warpObjectId=null;r.state.warpScenario='orbit';}
  r.refreshConfiguration();r.fillObjects();r.setFreeDrive(craft.id,false);r.lastTransfer=completed;r.selectedId=craft.id;r.focusId=craft.id;r.updateCameraFrame();
 }
 return true;
}
