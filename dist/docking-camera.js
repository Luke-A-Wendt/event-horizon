// The travel axis follows inertial velocity on a transfer, velocity relative
// to the hub on final approach, and the local horizon on a circular orbit.
import {attitudeAngle,blendAttitude} from './flight-attitude.js';
import {limbForward} from './orbit-path.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {LIGHT_SPEED} from './stellar-physics.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),scale=(a,k)=>a.map(v=>v*k);
const plus=(a,b)=>a.map((v,i)=>v+b[i]),minus=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>scale(v,1/(Math.hypot(...v)||1));
function view(back,up){
 const sky=Math.abs(dot(up,back))>.999?(Math.abs(back[1])<.8?[0,1,0]:[0,0,1]):up;
 const right=unit(cross(sky,back));return [right,cross(back,right),back];
}
export function updateDockingCamera(r,body){
 const m=r.dockingMission,station=r.getFocusFrame(m.stationId),s=m.sample;
 if(!station||!s)return;
 const parent=r.getFocusFrame(station.parentId),sky=r.configCache.primaryBasis[1];
 const orbital=parent&&['orbit','departOrbit'].includes(m.phase);
 const approach=s.docking||m.phase==='docked',reference=orbital?parent:approach?station:null;
 const velocity=reference?minus(s.velocity,scale(reference.velocity||[0,0,0],LIGHT_SPEED/18)):s.velocity;
 const forward=unit(velocity),eyeOffset=.25,now=m.wallElapsed||0;
 // Scene files store this same stabilized frame in navigation. Resume the
 // interpolated shot from the saved view even halfway through a handoff.
 let prev=m.cameraView;
 if(!prev&&r.focusReferenceFrame?.id===body.id&&r.camera.yaw===0&&r.camera.pitch===0)
  prev={basis:r.focusReferenceFrame.basis,distance:r.camera.focusDistance,phase:m.phase,time:now,duration:m.viewSeconds};
 const axes=station.habitatHubFrame||station.frame,normal=scale(axes[1],m.side);
 const port=view(unit(plus(scale(normal,.85),scale(axes[0],.52))),axes[2]);
 const portDistance=92/(body.radius*REFERENCE_RG_METERS);
 let shot,distance;
 if(orbital&&Math.hypot(...velocity)>.0005){
  const radial=minus(body.position,parent.position);
  const pole=cross(unit(radial),forward),normal=Math.hypot(...pole)>1e-6?unit(pole):sky;
  const up=dot(normal,sky)<0?scale(normal,-1):normal;
  shot=view(scale(limbForward(radial,forward,up,parent.radius),-1),up);distance=6;
 }else if(['approach','docked','undock'].includes(m.phase)){
  // Remain outside the hub face on release. Following the retreat vector
  // from directly behind would put the eye inside the station.
  shot=port;distance=portDistance;
 }else if(Math.hypot(...velocity)>.0005){
  // Near an axial port the travel direction can be nearly vertical. Project
  // a hub axis into the image plane there to keep the wheel legible.
  const hint=approach?station.habitatHubFrame?.[2]||station.frame[2]:sky;
  const skyHint=Math.abs(dot(forward,hint))>.96?(Math.abs(forward[1])<.8?[0,1,0]:[0,0,1]):hint;
  const up=unit(minus(skyHint,scale(forward,dot(forward,skyHint))));
  shot=view(plus(scale(forward,-Math.cos(eyeOffset)),scale(up,Math.sin(eyeOffset))),up);
  distance=approach?4.4:7;
 }else if(prev){
  shot=prev.basis;distance=prev.distance;
 }else{
  const back=unit(plus(body.frame[0],scale(body.frame[1],.45)));
  shot=view(back,body.frame[1]);distance=4.4;
 }
 if(m.phase==='acquire'||m.phase==='depart'){
  const phase=m.wallElapsed/m.viewSeconds,near=m.phase==='acquire'?phase:1-phase,u=Math.min(1,Math.max(0,(near-.65)/.3)),w=u*u*(3-2*u);
  shot=blendAttitude(shot,port,w);distance+=(portDistance-distance)*w;
 }
 if(prev){
  // The same mission sample can be drawn repeatedly, including by a restored
  // worker. Only presentation time consumed since that sample moves the eye.
  const dt=Math.max(0,prev.phase===m.phase?now-prev.time:now+prev.duration-prev.time);
  const angle=attitudeAngle(prev.basis,shot),blend=1-Math.exp(-4*dt);
  shot=blendAttitude(prev.basis,shot,Math.min(blend,dt*.95/Math.max(angle,1e-8)));
  distance=prev.distance+(distance-prev.distance)*blend;
 }
 m.cameraView={basis:shot,distance,phase:m.phase,time:now,duration:m.viewSeconds};
 r.focusReferenceFrame={id:body.id,basis:shot};
 for(const c of [r.camera,r.target])Object.assign(c,{yaw:0,pitch:0,lookYaw:0,lookPitch:0,focusDistance:distance});
}
