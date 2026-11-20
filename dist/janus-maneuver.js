// Short maneuvers are evaluated in one local chart. Never interpolate a pair
// of positions across an intergalactic origin (or through a parent planet).
import {REFERENCE_RG_METERS} from './objects.js';
import {orbitClearance} from './orbit-clearance.js';
import {orthonormalFrame} from './flight-dynamics.js';
import {blendAttitude,turnEase} from './flight-attitude.js';
const RG=REFERENCE_RG_METERS,C=299792458,dtUnits=C/(18*RG);
const xyz=a=>a.map(x=>x*RG);
const get=(r,id)=>r.frameById?.get(id);
const pos=f=>xyz(f.janusLocalPosition||f.position);
const vel=f=>(f?.velocity||[0,0,0]).map(x=>x*C/18);
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const unit=a=>{const len=Math.hypot(...a)||1;return a.map(x=>x/len);};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function targetAt(r,pod,target,rad){
 const host=get(r,target.id);
 if(target.type==='waypoint')return {p:pos(host),v:[0,0,0]};
 const b=r.configCache.primaryBasis,a=r.currentPhase(pod),ca=Math.cos(a),sa=Math.sin(a),g=-r.orbitalOmega({...pod,parentId:target.id,orbitMeters:rad,placement:'orbit'})*dtUnits,
 up=orbitClearance(r,{...pod,parentId:target.id,placement:'orbit',orbitMeters:rad},target.id)*RG;
 return {p:pos(host).map((x,i)=>x+rad*(b[0][i]*ca+b[2][i]*sa)+b[1][i]*up),v:vel(host).map((x,i)=>x+rad*g*(-b[0][i]*sa+b[2][i]*ca))};
}
export function planJanusManeuver(r,pod,p,target,rad){
 if(!target)return false;r.fillObjects();
 const a=get(r,pod.id),b=get(r,target.id);if(!a||!b||b.janusRemote!==a.janusRemote||a.janusChart!==b.janusChart||String(a.janusAddressLy)!==String(b.janusAddressLy))return false;
 const same=p.locationId===target.id&&pod.placement==='orbit'&&target.type!=='waypoint',nearPoint=target.type==='waypoint'||!p.locationId||r.objectById.get(p.locationId)?.type==='waypoint';
 if(!same&&!nearPoint)return false;
 const start=pos(a),dest=targetAt(r,pod,target,rad),distance=dist(start,dest.p);
 const maxRange=Math.max(1e6,Math.min(1e9,(pod.orbitMeters||rad||0)*.2));
 if(!same&&distance>maxRange)return false;
 const curr=p.locationId&&r.objectById.get(p.locationId);
 if(!same&&curr&&curr.type!=='waypoint'){
  // An inward straight-line adjustment must keep its chord outside the body.
  const center=pos(get(r,curr.id)),d=dest.p.map((v,i)=>v-start[i]),c=center.map((v,i)=>v-start[i]),u=Math.max(0,Math.min(1,dot(d,c)/Math.max(1,dot(d,d))));
  if(dist(start.map((v,i)=>v+u*d[i]),center)<r.objectRadius(curr)*RG+5)return false;
 }
 return {start,initialVelocity:vel(a),basis:a.frame.map(v=>[...v]),radius:rad||0,oldRadius:same?pod.orbitMeters:0,seconds:8};
}
export function sampleJanusManeuver(r,pod,p){
 r.fillObjects();const m=p.localLeg,target=r.objectById.get(p.destinationId);if(!m||!target)return;
 const u=Math.min(1,p.elapsed/m.seconds),s=turnEase(u),ds=30*u*u*(1-u)*(1-u)/m.seconds;
 if(m.oldRadius>0){
  const dest=targetAt(r,pod,target,m.oldRadius+(m.radius-m.oldRadius)*s),center=pos(get(r,target.id)),radial=unit(dest.p.map((v,i)=>v-center[i]));
  pod.drivePosition=dest.p.map(v=>v/RG);
  p.localVelocity=dest.v.map((v,i)=>v+(m.radius-m.oldRadius)*ds*radial[i]);p.localYawJet=Math.sin(u*Math.PI)*Math.sign(m.radius-m.oldRadius)*.42;
 }else{
  const end=targetAt(r,pod,target,m.radius),d=end.p.map((v,i)=>v-m.start[i]);
  // Cubic Hermite matches both the departing velocity and the arriving
  // frame. The orientation slews over a few seconds independently of travel.
  const blend=u*u*(3-2*u),dv=6*u*(1-u)/m.seconds;
  // Back the moving target off by its current velocity × elapsed time; its
  // instantaneous ephemeris then yields the correct terminal derivative.
  const frozen=d.map((v,i)=>v-end.v[i]*p.elapsed);
  const path=m.start.map((v,i)=>v+frozen[i]*blend+m.initialVelocity[i]*m.seconds*u*(1-u)*(1-u)+end.v[i]*m.seconds*u*u*(2-u));
  p.localVelocity=frozen.map((v,i)=>v*dv+m.initialVelocity[i]*(1-4*u+3*u*u)+end.v[i]*(4*u-3*u*u));
  const aim=u>.00001?unit(d):m.basis[2];const goal=Math.hypot(...aim)>.1?orthonormalFrame([m.basis[0],m.basis[1],aim]):m.basis;
  pod.drivePosition=path.map(v=>v/RG);pod.driveBasis=blendAttitude(m.basis,goal,turnEase(Math.min(1,p.elapsed/3)));p.localYawJet=Math.sin(Math.min(1,p.elapsed/3)*Math.PI)*Math.sign(dot(aim,m.basis[0]))*.65;
 }
 p.localSpeed=Math.hypot(...p.localVelocity);r.lastGeometryTime=NaN;
}
