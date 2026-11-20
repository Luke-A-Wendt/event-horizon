import {warpStudyId} from './warp-studies.js';
import {edgeKerrMetric,kerrCircularState} from './kerr-transfer.js';
import {cameraRelative} from './camera-framing.js';
import {effectiveWarpRadius} from './warp-physics.js';
// Orbital guides share the transfer's optical overlay. Geometry is sampled
// around the observer, so a close view stays smooth without a huge orbit mesh.
import {REFERENCE_RG_METERS} from './objects.js';
const RG=REFERENCE_RG_METERS;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const TAU=2*Math.PI,wrap=a=>(a%TAU+TAU)%TAU;

export function parkedOrbitGeometry(r,craftId){
 const object=r.objects?.find(o=>o.id===craftId),craft=r.getFocusFrame?.(craftId);
 const transfer=r.transfer?.active&&r.transfer.craftId===craftId?r.transfer:null,radiusBurn=transfer?.radiusTransfer;
 if(!craft||!['shuttle','enterprise'].includes(craft.type)||transfer&&!radiusBurn||!radiusBurn&&r.driveId===craftId&&!object?.flight?.orbitHold)return null;
 const bridge=r.getBridgeParkingOrbit?.(craftId);
 if(r.state?.bridge&&!bridge)return null;
 const parent=bridge?{id:bridge.targetId,position:bridge.center,velocity:[0,0,0],radius:r.getNavigationWaypoints?.(craftId)?.find(o=>o.id===bridge.targetId)?.radius||0}:r.getFocusFrame?.(object?.parentId);
 if(!parent||!bridge&&(!(parent.massSolar>0)||object?.placement!=='orbit'||(object?.motion&&object.motion!=='orbit')))return null;
 // An elevated circle has the same fixed normal as its disk, not the
 // angular momentum normal of a radius measured to the unelevated body.
 const normal=unit(bridge?.basis?.[1]||r.configCache?.primaryBasis?.[1]||[0,1,0]);
 const relative=sub(craft.position,parent.position),height=dot(relative,normal);
 const orbitCenter=add(parent.position,mul(normal,height)),radial=sub(relative,mul(normal,height));
 const radius=bridge?.radius||Math.hypot(...radial);
 if(!(radius>0))return null;
 let u=bridge?.basis?.[0]||r.configCache?.primaryBasis?.[0]||[1,0,0];u=sub(u,mul(normal,dot(u,normal)));
 if(Math.hypot(...u)<.01)u=cross(normal,Math.abs(normal[2])<.9?[0,0,1]:[1,0,0]);u=unit(u);
 const v=unit(cross(normal,u)),phase=wrap(Math.atan2(dot(radial,v),dot(radial,u))),radiusMeters=radius*RG,center=mul(orbitCenter,RG),length=TAU*radiusMeters;
 const sampleAtDistance=distance=>{const a=distance/radiusMeters;return add(center,mul(add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),radiusMeters));};
 const outward=unit(radial),tangent=unit(cross(normal,outward));
 // Use cos(d)-1 = -2 sin²(d/2). A short arc remains measurable beside the
 // shuttle even when both the body centre and absolute phase are enormous.
 const offsetAtAngle=d=>add(mul(outward,-2*radiusMeters*Math.sin(d/2)**2),mul(tangent,radiusMeters*Math.sin(d)));
 const metric=edgeKerrMetric(r,object,parent.id);
 return {craftId,parentId:parent.id,parentRadius:(parent.radius||0)*RG,parentCenter:mul(parent.position,RG),circularSpeedMetersPerSecond:metric?kerrCircularState(metric,radiusMeters).speed:Math.sqrt(1.32712440018e20*Math.max(0,parent.massSolar||0)/radiusMeters),tangent,parentType:parent.type,craft,center,radius:radiusMeters,normal,u,v,phase,length,currentDistance:phase*radiusMeters,radial:outward,sampleAtDistance,offsetAtAngle};
}

export function captureParkedOrbit(r,craftId){
 const orbit=parkedOrbitGeometry(r,craftId);if(!orbit)return null;
 const distance=Math.max(orbit.craft.radius*2,r.cameraFrame?.observer?Math.hypot(...cameraRelative(orbit.craft.position,r.cameraFrame)):0),step=Math.min(.035,distance*RG/orbit.radius*.045);
 // Draw only the arc actually flown in a multi-body cycle, then extend its
 // outgoing tangent to the next arrival. A lone orbital stop retains a circle.
 const wait=r.flightSequences?.[craftId]?.orbitWait;
 if(wait?.leg&&!wait.leg.radiusTransfer&&Number.isFinite(wait.sweepRadians)&&Array.isArray(wait.leg.start)&&Array.isArray(wait.leg.end)){
  const total=Math.max(0,wait.sweepRadians),done=Math.max(0,Math.min(total,(wait.unwrappedPhase-wait.startPhase)*wait.direction)),sweep=Math.min(TAU,total);
  // Every complete lap covers precisely the same circle. Draw it once, ending
  // at the real departure contact even while the ship is still on an earlier lap.
  const swept=total>TAU?sweep-(total-done)%TAU:done;
  const angles=new Set([-swept,0,sweep-swept]);for(let i=1;i<48;i++)angles.add(sweep*i/48-swept);
  for(let a=step,n=0;a<sweep&&n<60;a*=1.26,n++)for(const sign of [-1,1]){const d=sign*a;if(d>-swept&&d<sweep-swept)angles.add(d);}
  const sorted=[...angles].sort((a,b)=>a-b),points=sorted.map(d=>orbit.sampleAtDistance((orbit.phase+d)*orbit.radius)),pathOffsets=sorted.map(orbit.offsetAtAngle),distances=sorted.map(d=>(total-sweep+swept+d)*orbit.radius);
  const {start,end}=wait.leg,delta=sub(end,start),length=Math.hypot(...delta),arcLength=total*orbit.radius,contact=pathOffsets.at(-1);
  points[points.length-1]=[...start]; // analytic contact shared by arc and flight
  const fractions=new Set([1]);for(let i=1;i<24;i++)fractions.add(i/24);
  for(let x=distance*RG*.075/Math.max(1,length),n=0;x>0&&x<.08&&n<38;n++,x*=1.65)fractions.add(x);
  for(const t of [...fractions].sort((a,b)=>a-b)){const d=mul(delta,t);points.push(t===1?[...end]:add(start,d));pathOffsets.push(add(contact,d));distances.push(arcLength+t*length);}
  return {craftId,kind:'arc-transfer',pathPoints:points,pathOffsets,pathDistances:distances,pathLengthMeters:arcLength+length,orbit};
 }
 const angles=new Set(Array.from({length:65},(_,i)=>i*TAU/64-orbit.phase));angles.add(0);
 // Sample signed angular offsets; do not round a tiny angle onto a large phase.
 for(let a=step,n=0;a<Math.PI&&n<60;a*=1.26,n++)for(const sign of [-1,1]){const d=sign*a;angles.add(d< -orbit.phase?d+TAU:d>TAU-orbit.phase?d-TAU:d);}
 const ordered=[...angles].sort((a,b)=>a-b),points=ordered.map(d=>orbit.sampleAtDistance((orbit.phase+d)*orbit.radius));
 return {craftId,kind:'orbit',pathPoints:points,pathAngles:ordered,pathOffsets:ordered.map(orbit.offsetAtAngle),pathDistances:ordered.map(d=>(orbit.phase+d)*orbit.radius),pathLengthMeters:orbit.length,orbit};
}

function rotate(v,axis,sine,cosine){return add(add(mul(v,cosine),mul(cross(axis,v),sine)),mul(axis,dot(axis,v)*(1-cosine)));}
const transform=(basis,v)=>[0,1,2].map(i=>basis[0][i]*v[0]+basis[1][i]*v[1]+basis[2][i]*v[2]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
function viewBasis(eye,up){const forward=mul(eye,-1),raw=cross(forward,up),right=unit(Math.hypot(...raw)>1e-8?raw:cross(forward,Math.abs(forward[1])<.8?[0,1,0]:[1,0,0]));return [right,unit(cross(right,forward)),forward];}
function mappedBasis(local,world){return [0,1,2].map(j=>[0,1,2].map(i=>world[0][i]*local[0][j]+world[1][i]*local[1][j]+world[2][i]*local[2][j]));}
function directionMix(a,b,t){const cosine=clamp(dot(a,b),-1,1);if(cosine>.9999)return unit(mix(a,b,t));let tangent=sub(b,mul(a,cosine));if(Math.hypot(...tangent)<1e-8)tangent=cross(a,Math.abs(a[1])<.8?[0,1,0]:[1,0,0]);tangent=unit(tangent);const angle=Math.acos(cosine)*t;return add(mul(a,Math.cos(angle)),mul(tangent,Math.sin(angle)));}
// Pick the forward sightline on the tangent cone through the craft. A small
// downward pitch places the eye above the hull without moving the body limb
// away from screen center. Keep the side of the cone with body left.
export const AUTO_EYE_ELEVATION=.15;
export function limbForward(bodyRay,orbital,up,bodyRadius){
 const range=Math.hypot(...bodyRay),out=range>0?mul(bodyRay,1/range):unit(cross(orbital,up));
 const tangent=unit(sub(orbital,mul(out,dot(orbital,out)))),ratio=clamp(bodyRadius/Math.max(1e-30,range),0,.999999),inward=mul(out,-Math.sqrt(1-ratio*ratio));
 let down=unit(cross(tangent,out));if(dot(down,up)>0)down=mul(down,-1);
 const pitchMissing=Math.sin(AUTO_EYE_ELEVATION)+dot(add(inward,mul(tangent,ratio)),up),turn=Math.asin(clamp(pitchMissing/Math.max(1e-8,-ratio*dot(down,up)),0,.6));
 return unit(add(inward,mul(add(mul(tangent,Math.cos(turn)),mul(down,Math.sin(turn))),ratio)));
}
export function parkedCameraFraming(r,orbit){
 const rect=r.canvas?.getBoundingClientRect?.()||{width:900,height:650},width=Math.max(1,rect.width),height=Math.max(1,rect.height),aspect=width/height,fov=.83*Math.max(1,1.35/aspect),mobile=width<600;
 const top=Math.min(mobile?150:120,height*.19),bottom=Math.min(mobile?190:170,height*.31),safe=Math.max(height*.12,Math.min(height*.5-top,height-bottom-height*.5,width*.38));
 // Look through the ship tangent to the body's real limb, even when the
 // parking circle is raised for disk clearance. Scene up fixes screen roll.
 const up=r.configCache?.primaryBasis?.[1]||orbit.normal,bodyRay=sub(orbit.craft.position,mul(orbit.parentCenter||orbit.center,1/RG));
 const orbital=unit(cross(orbit.normal,orbit.radial)),bodyRadius=orbit.parentRadius/RG*(r.state.lensing&&['hole','blackhole','whitehole'].includes(orbit.parentType)?2.7:1),forward=limbForward(bodyRay,orbital,up,bodyRadius),eye=mul(forward,-1),right=unit(cross(forward,up));
 // Keep the shadow above Meridian's broad observation deck. Raise the
 // tracking eye progressively as the apparent angular size of the hole grows.
 if(r.sceneId==='nasa-shuttle'&&orbit.craft.type==='shuttle'&&orbit.parentId==='primary'){
  const near=clamp(3*bodyRadius/Math.max(bodyRadius,Math.hypot(...bodyRay)),0,1);
  const pitch=.135+.115*near*near*(3-2*near);
  const level=unit(sub(eye,mul(up,dot(eye,up))));
  const elevated=add(mul(level,Math.cos(pitch)),mul(up,Math.sin(pitch)));
  const distance=Math.max(7,2.8/(aspect*fov));
  return {eye:elevated,up,distance,compositionY:0,targetOffset:mul(up,distance*orbit.craft.radius*.05),width,height,fov};
 }
 // The visible shell extends beyond its characteristic metric radius. Fit
 // its projected silhouette instead of the hull when following the field.
 if(orbit.craft.type==='enterprise'&&r.state.warp&&r.warpObjectId===orbit.craftId&&(r.state.warpFactor>0||r.state.blackHole)){
  const field=r.warpEnvelope?.(orbit.craft)?.radius??effectiveWarpRadius(r.state.warpFactor),radius=field*1.22;
  if(warpStudyId(r.sceneId)==='warp-orbit'){
   // Keep the shadow to port, the craft to starboard, and the upper
   // face of the disk visible. Angular composition adapts to portrait.
   const horizontal=aspect*fov,angle=Math.min(.53,.35*horizontal),centerRay=unit(mul(bodyRay,-1));
   const gaze=unit(add(mul(centerRay,Math.cos(angle)),mul(orbital,Math.sin(angle))));
   const right=unit(cross(gaze,up)),pan=Math.min(.19,.14*horizontal);
   const pixels=Math.min(.34*height,.285*width),distance=radius*Math.hypot(1,height/(fov*pixels))/Math.cos(pan);
   return {eye:mul(gaze,-1),up,distance,compositionY:0,targetOffset:mul(right,-distance*orbit.craft.radius*Math.tan(pan)),width,height,fov};
  }
  const pixels=Math.max(1,Math.min(height*.395,width*.40,height*.5-Math.min(84,height*.18),width*.5-Math.min(62,width*.14)));
  return {eye,up,distance:1.10*radius*Math.hypot(1,height/(fov*pixels)),compositionY:0,targetOffset:[0,0,0],width,height,fov};
 }
 const bounds=orbit.craft.type==='enterprise'?[[-.416,.416],[-.264,.194],[-.921,.921]]:[[-.55,.55],[-.14,.515],[-.87,.86]],corners=[];
 const hull=[];
 if(orbit.craft.type==='shuttle'){
  for(const sign of [-1,1]){hull.push([sign*.55,-.065,-.55],[sign*.10,-.065,-.67],[sign*.11,-.065,.42]);for(const z of [-.77,.12,.64])for(const y of [-.13,.13])hull.push([sign*.14,y,z]);}
  hull.push([0,0,.86],[0,-.05,-.87],[0,.515,-.49],[0,.495,-.65]);
 }else for(const x of bounds[0])for(const y of bounds[1])for(const z of bounds[2])hull.push([x,y,z]);
 for(const point of hull){const p=transform(orbit.craft.frame,point);corners.push([dot(p,right),dot(p,up),dot(p,forward)]);}
 const projection=height/fov,maxWidth=width*.36,maxHeight=Math.min(height*.36,2*safe),fits=d=>{
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const [x,y,z]of corners){const depth=d+z;if(depth<=.05)return false;const sx=projection*x/depth,sy=projection*y/depth;x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);}
  return x1-x0<=maxWidth&&y1-y0<=maxHeight&&Math.max(Math.abs(y0),Math.abs(y1))<safe;
 };
 let lo=1.15,hi=16;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(fits(mid))hi=mid;else lo=mid;}
 // Looking through the craft keeps it centered and places the tangency in the
 // same center pixel. No rescaling of physical geometry is necessary.
 return {eye,up,distance:1.12*hi,compositionY:0,targetOffset:[0,0,0],width,height,fov};
}
// Orbit controls remain centered on the vehicle; the default gaze points at
// the instantaneous path tangent. User gestures release automatic placement.
export function updateParkedCamera(r,focused){
 if(r.transfer?.active&&!(r.transfer.radiusTransfer&&r.transfer.craftId===focused?.id)||r.focusMode!=='track'){r.parkedCamera=null;return null;}
 const orbit=parkedOrbitGeometry(r,focused?.id);if(!orbit){r.parkedCamera=null;return null;}
 if(r.cameraGuide==='warp-side')r.cameraGuide=null;
 const arrival=r.lastTransfer?.phase==='Arrived'&&r.lastTransfer.craftId===focused?.id?r.lastTransfer:null,now=(r.now?.()??globalThis.performance?.now?.()??0)*.001,c=r.camera,target=r.target||c;
 if(!c)return null;
 const input=()=>[target.yaw,target.pitch,target.lookYaw,target.lookPitch,target.focusDistance],localEye=unit([Math.cos(c.pitch)*Math.sin(c.yaw),Math.sin(c.pitch),Math.cos(c.pitch)*Math.cos(c.yaw)]),local=viewBasis(localEye,[0,1,0]);
 if(r.focusReferenceFrame?.id!==focused.id)r.focusReferenceFrame={id:focused.id,basis:focused.frame.map(v=>[...v])};
 let guide=r.parkedCamera;
 if(!guide||guide.craftId!==focused.id||guide.parentId!==orbit.parentId||![guide.radial,guide.cameraAimOffset,guide.cameraPathUp].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))){
  const fit=parkedCameraFraming(r,orbit),preserve=!!arrival?.cameraAimOffset;
  guide=r.parkedCamera={craftId:focused.id,parentId:orbit.parentId,radial:orbit.radial,cameraAimOffset:preserve?[...arrival.cameraAimOffset]:[0,0,0],cameraPathUp:fit.up,cameraGuideBlend:arrival?.cameraGuideBlend??1,cameraCompositionY:fit.compositionY,cameraTargetBody:true,cameraTargetOffset:fit.targetOffset,cameraTargetBlend:preserve?0:1,time:now,released:!!(preserve&&arrival.cameraAdjusted)};
  if(!preserve){r.focusReferenceFrame.basis=mappedBasis(local,viewBasis(fit.eye,fit.up));c.lookYaw=target.lookYaw=0;c.lookPitch=target.lookPitch=0;c.focusDistance=target.focusDistance=fit.distance;}
  guide.input=input();return guide;
 }
 if(guide.input&&input().some((value,i)=>Math.abs(value-guide.input[i])>1e-7))guide.released=true;
 const axis=r.configCache?.primaryBasis?.[1]||orbit.normal,prev=unit(sub(guide.radial,mul(axis,dot(guide.radial,axis)))),next=unit(sub(orbit.radial,mul(axis,dot(orbit.radial,axis)))),cosine=clamp(dot(prev,next),-1,1),sine=dot(axis,cross(prev,next));
 if(Math.abs(sine)>1e-12||cosine<0){r.focusReferenceFrame.basis=r.focusReferenceFrame.basis.map(v=>rotate(v,axis,sine,cosine));guide.cameraAimOffset=rotate(guide.cameraAimOffset,axis,sine,cosine);if(guide.cameraTargetOffset)guide.cameraTargetOffset=rotate(guide.cameraTargetOffset,axis,sine,cosine);}
 const dt=clamp(now-guide.time,0,.1);guide.time=now;
 if(!guide.released&&dt>0){
  const fit=parkedCameraFraming(r,orbit),blend=1-Math.exp(-dt*3),follow=(a,b)=>directionMix(a,b,Math.min(blend,dt*.8/Math.max(.000001,Math.acos(clamp(dot(a,b),-1,1)))));
  // Radius changes continuously on the spiral. Follow its changing limb
  // directly, without the angular lag used when acquiring a new camera pose.
  const eye=r.transfer?.radiusTransfer?fit.eye:follow(transform(r.focusReferenceFrame.basis,localEye),fit.eye),up=fit.up,world=viewBasis(eye,up);
  r.focusReferenceFrame.basis=mappedBasis(local,world);guide.cameraPathUp=up;guide.cameraAimOffset=mul(guide.cameraAimOffset,1-blend);guide.cameraTargetOffset=fit.targetOffset;guide.cameraTargetBlend+=(1-guide.cameraTargetBlend)*blend;guide.cameraCompositionY=(guide.cameraCompositionY??.045/fit.fov)*(1-blend)+fit.compositionY*blend;
  c.focusDistance+=(fit.distance-c.focusDistance)*blend;target.focusDistance=c.focusDistance;
 }
 guide.cameraPathUp=axis;guide.radial=orbit.radial;guide.input=input();return guide;
}
