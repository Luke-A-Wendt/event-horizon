// Station rendezvous in physical metres and distant-frame seconds. The final
// corridor is defined in the nonspinning hub frame, never in the spinning rim.
import {contactScreenSeconds} from './contact-playback.js';
import {rimTurnCommand} from './meridian-rcs.js';
import {HABITAT_DOCK_FACE_UNITS,HABITAT_HUB_RADIUS_UNITS,HABITAT_FLOOR_UNITS} from './habitat-spin.js';
import {MERIDIAN_DOCK_TIP_STOWED,MERIDIAN_DOCK_STROKE} from './meridian-port.js';
const G=9.80665,C=299792458,TAU=2*Math.PI,Z=[0,0,0];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,v)=>a.map(x=>x*v);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=v=>Math.hypot(...v),unit=(v,alt=[1,0,0])=>len(v)>1e-12?mul(v,1/len(v)):alt,project=(v,n)=>sub(v,mul(n,dot(v,n)));
const id=[[1,0,0],[0,1,0],[0,0,1]],mix=(a,b,f)=>add(a,mul(sub(b,a),f));
const easeIn=u=>u*u*u*(10+u*(-15+6*u)),S=u=>u<=.5?easeIn(u):1-easeIn(1-u),V=u=>30*u*u*(1-u)*(1-u),A=u=>60*u*(1-u)*(1-2*u);
export function dockTimeFactor(velocity){const b=clamp(len(velocity)/C);return Math.sqrt((1-b)*(1+b));}
function rotate(v,axis,a){const c=Math.cos(a),s=Math.sin(a);return add(add(mul(v,c),mul(cross(axis,v),s)),mul(axis,dot(axis,v)*(1-c)));}
function face(nose,ref=id){
 const f=unit(nose,ref[2]),right=unit(project(ref[0],f),unit(cross(ref[1],f),unit(cross(Math.abs(f[1])<.85?[0,1,0]:[0,0,1],f))));
 return [right,cross(f,right),f];
}
// Rotate the whole triad, including at a 180-degree braking flip. Then recover
// any roll difference, so both endpoint bases are reproduced without a snap.
function turn(a,b,u,eased=true){
 if(u<=0)return a;if(u>=1)return b;
 const w=eased?S(u):u,d=clamp(dot(a[2],b[2]),-1,1),axis=unit(cross(a[2],b[2]),a[0]),theta=Math.acos(d),z=rotate(a[2],axis,theta*w),r=rotate(a[0],axis,theta*w),end=rotate(a[0],axis,theta);
 const sin=dot(cross(end,b[0]),b[2]),cos=clamp(dot(end,b[0]),-1,1),roll=cos<0&&Math.abs(sin)<1e-9?Math.PI:Math.atan2(sin,cos),x=unit(rotate(r,z,w*roll));
 return [x,unit(cross(z,x)),unit(z)];
}
export function dockingPortGeometry(station,craftRadiusMeters){
 const b=station.basis||id,side=station.side<0?-1:1,n=mul(b[1],side),radius=station.radiusMeters;
 const basis=face(mul(n,-1),b),tip=(MERIDIAN_DOCK_TIP_STOWED+MERIDIAN_DOCK_STROKE)*craftRadiusMeters;
 const portPosition=add(station.position,mul(n,HABITAT_DOCK_FACE_UNITS*radius));
 const contact=add(portPosition,mul(n,tip)),corridor=Math.max(460,(1-HABITAT_DOCK_FACE_UNITS)*radius+craftRadiusMeters,12*craftRadiusMeters),offset=Math.min(corridor*.045,2*craftRadiusMeters);
 return {basis,normal:n,side,portPosition,contact,tip,corridor,offset};
}
export function dockingCloseDuration(station,craftRadiusMeters){return Math.max(180,1.875*dockingPortGeometry(station,craftRadiusMeters).corridor/1.65);}
export function sampleDockingClose(station,craftRadiusMeters,progress,direction='dock'){
 const u=direction==='hold'?1:direction==='undock'?1-clamp(progress):clamp(progress),sign=direction==='undock'?-1:1,T=dockingCloseDuration(station,craftRadiusMeters);
 const {basis,normal,contact,corridor,offset,tip}=dockingPortGeometry(station,craftRadiusMeters);
 const v=clamp(u/.76),remaining=corridor*(1-S(u)),lateral=offset*(1-S(v)),position=add(add(contact,mul(normal,remaining)),mul(basis[0],lateral));
 const relative=mul(add(mul(normal,-corridor*V(u)),mul(basis[0],-offset*V(v)/.76)),sign/T);
 const kinematic=mul(add(mul(normal,-corridor*A(u)),mul(basis[0],-offset*A(v)/(.76*.76))),1/(T*T)),o=circular(station),thrust=sub(kinematic,gravityDifference(o,sub(position,station.position))),extension=S(clamp((u-.66)/.23));
 // Final contact has zero closing speed/acceleration. The tube finishes
 // extending before contact and stays extended throughout separation of the seals.
 const range=remaining+(1-extension)*(tip-MERIDIAN_DOCK_TIP_STOWED*craftRadiusMeters);
 return {position,velocity:add(station.velocity||Z,relative),basis,acceleration:add(station.acceleration||(o?mul(o.r,-(o.omega**2)):Z),kinematic),properAcceleration:thrust,extension,
  rcs:direction==='hold'?Z:basis.map(axis=>clamp(dot(axis,thrust)/.012,-1,1)),mainThrustG:0,docking:true,
  phase:direction==='hold'?'Docked':direction==='undock'?'Undocking':u>.89?'Soft capture':'Docking approach',
  rangeMeters:Math.hypot(range,lateral),relativeSpeed:len(relative),radiusMeters:craftRadiusMeters};
}
export function dockingStandOff(station,craftRadiusMeters){return sampleDockingClose(station,craftRadiusMeters,0);}

// A station-relative circular formation: two objects on the same circular
// orbit retain their angular separation. Insert behind the station; the jets,
// not a fictitious speed difference on the same orbit, close the last km.
function circular(s){
 if(!s.parentPosition||!s.parentVelocity)return null;
 const r=sub(s.position,s.parentPosition),v=sub(s.velocity||Z,s.parentVelocity),R=len(r),L=cross(r,v),omega=len(L)/(R*R);
 return R>(s.parentRadiusMeters||0)&&Number.isFinite(omega)&&omega>1e-10?{r,v,R,h:unit(L),omega}:null;
}
// The ferry waits on the station orbit for the tangent pointing toward
// the next system; choose the arrival anomaly the same way. Both trims
// then run away from (or toward) the local planet on the clear side.
export function ferryTangentWait(s,direction){
 const o=circular(s);if(!o)return 0;
 const f=unit(o.v),goal=unit(project(direction,o.h),f);
 const angle=Math.atan2(dot(o.h,cross(f,goal)),dot(f,goal));
 return ((angle+TAU)%TAU)/o.omega;
}
export function dockingOrbitDuration(s){const o=circular(s);return o?Math.PI/o.omega:0;}
function formation(s,craft,o,dt=0){
 const {r,v,R,h,omega}=o,angle=-Math.min(.16,((s.ferry?1.55:3.2)*s.radiusMeters+2*craft)/R);
 const rr=rotate(r,h,omega*dt),vv=rotate(v,h,omega*dt);
 // Evaluate R*(cos(theta)-1) without subtracting two planetary positions.
 const offset=q=>add(mul(q,-2*Math.sin(angle/2)**2),mul(cross(h,q),Math.sin(angle)));
 const dr=offset(rr),dv=offset(vv),basis=face(add(vv,dv),[h,rr,vv]);
 return {dr,dv,rr,basis};
}
export function sampleDockingOrbit(s,craft){
 const o=circular(s);if(!o)return dockingStandOff(s,craft);
 const k=formation(s,craft,o);
 return {position:add(s.position,k.dr),velocity:add(s.velocity,k.dv),basis:k.basis,acceleration:add(s.acceleration||mul(o.r,-(o.omega**2)),mul(k.dr,-(o.omega**2))),properAcceleration:Z,extension:0,rcs:Z,rcsTorque:Z,mainThrustG:0,docking:false,phase:'Matched circular orbit',rangeMeters:len(k.dr),relativeSpeed:len(k.dv),radiusMeters:craft};
}
export function dockingAcquireDuration(s,craft){
 const o=circular(s);if(!o)return 0;
 return Math.max(240,1.875*((s.ferry?1.55:3.2)*s.radiusMeters+2*craft)/3);
}
function directionArc(from,to,u){
 const axis=cross(from,to),d=clamp(dot(from,to),-1,1);
 if(d>.999999999)return unit(mix(from,to,u));
 return rotate(from,unit(axis,unit(cross(from,Math.abs(from[0])<.8?[1,0,0]:[0,1,0]))),Math.acos(d)*u);
}
export function sampleDockingAcquire(s,craft,progress,reverse=false){
 const u=clamp(reverse?1-progress:progress),o=circular(s);if(!o)return dockingStandOff(s,craft);
 const gate=dockingStandOff(s,craft),T=dockingAcquireDuration(s,craft),gateOffset=sub(gate.position,s.position);
 // Cross the station's equatorial plane OUTSIDE the habitat, then enter the
 // axial corridor. Interpolate direction on a sphere, never cut a chord
 // through the rotating rim/spokes. Work with km-scale offsets throughout:
 // second-differencing absolute heliocentric positions loses precision.
 // Interpolate against a single orbital triad at the maneuver midpoint.
 // Re-solving a shortest turn from a moving triad every frame changes its
 // roll branch at ±π; the former Neptune release visibly rolled over in one frame.
 const sign=reverse?-1:1,mid=formation(s,craft,o,(.5-u)*T*sign).basis;
 function at(dt){
  const v=clamp(u+(reverse?-dt:dt)/T),f=S(v),k=formation(s,craft,o,dt),ds=len(k.dr),de=len(gateOffset);
  const q=mul(directionArc(unit(k.dr),unit(gateOffset),f),ds+(de-ds)*f);
  const drift=(v-.5)*T*sign*o.omega*(1-f);
  return {q,basis:turn(mid,gate.basis,v).map(axis=>rotate(axis,o.h,drift))};
 }
 const h=.125,k=at(0),before=at(-h),after=at(h),dv=mul(sub(after.q,before.q),.5/h),da=mul(add(sub(after.q,k.q),sub(before.q,k.q)),1/(h*h));
 const gravity=gravityDifference(o,k.q),force=sub(da,gravity);
 const basis=k.basis,velocity=u===0?sampleDockingOrbit(s,craft).velocity:u===1?gate.velocity:add(s.velocity,dv);
 return {position:u===1?gate.position:add(s.position,k.q),velocity,acceleration:add(s.acceleration||mul(o.r,-(o.omega**2)),da),properAcceleration:force,basis,rcs:basis.map(n=>clamp(dot(n,force)/.04,-1,1)),rcsTorque:rimTurnCommand(before.basis,basis,after.basis,h),mainThrustG:0,extension:0,docking:true,phase:reverse?'Rim jets · clearing hub':'Rim jets · acquiring hub',rangeMeters:len(k.q),relativeSpeed:len(dv),radiusMeters:craft};
}
// Difference of the local gravitational field and that at the station: this
// support term disappears in circular free fall, but not at a fixed axial offset.
function gravityDifference(o,offset){
 if(!o)return Z;
 const r2=add(o.r,offset),q=o.R/len(r2);
 return mul(add(mul(offset,q**3),mul(o.r,Math.expm1(3*Math.log(q)))),-(o.omega**2));
}
// New rendezvous use the same endpoint-angle pacing as ordinary transfers.
// Give EACH engine-off attitude change its own wall time; an interplanetary
// transfer also includes two local planet-clearance legs with their own flips.
const playbackCache=new WeakMap();
export const DOCKING_EDGE_RATE=40/6; // SI seconds per screen second at a stage handoff (the docked clock rate).
export function dockingStageElapsed(duration,wallSeconds,u){
 if(u<=0)return 0;if(u>=1)return duration;
 const tangent=Math.min(DOCKING_EDGE_RATE*wallSeconds, duration*1.5);
 return duration*u*u*(3-2*u)+tangent*u*(1-u)*(1-2*u);
}
// Spend the extra viewing time while the hull slews between the orbital
// tangent and hub axis. Zero endpoint slope of S preserves the neighboring
// stages' clock rates; ship motion and proper time use the original SI path.
export function dockingAttitudeElapsed(duration,baseSeconds,wallSeconds,progress){
 if(progress<=0||progress>=1)return duration*clamp(progress);
 const extra=wallSeconds-baseSeconds;
 if(extra<=0)return dockingStageElapsed(duration,wallSeconds,progress);
 const wall=progress*wallSeconds;
 let lo=0,hi=1;
 for(let i=0;i<32;i++){
  const x=(lo+hi)/2,physical=dockingStageElapsed(duration,baseSeconds,x);
  if(x*baseSeconds+extra*S(physical/duration)<wall)lo=x;else hi=x;
 }
 return dockingStageElapsed(duration,baseSeconds,(lo+hi)/2);
}
export function dockingAcquisitionScreenTime(station,craft){
 const a=sampleDockingOrbit(station,craft).basis,b=dockingStandOff(station,craft).basis;
 return 3*Math.acos(clamp((a.reduce((n,axis,i)=>n+dot(axis,b[i]),0)-1)/2,-1,1));
}
function turnSeconds(a,b){
 const angle=Math.acos(clamp((a.reduce((n,axis,i)=>n+dot(axis,b[i]),0)-1)/2,-1,1));
 return angle<.01 ? .4 : 3.2+2*angle/Math.PI;
}
// Build once per flight. Allocate the short ferry shot by observable angular
// motion (planet bearings, limb growth, and rigid-body rotation), so most of
// the compressed interplanetary distance can pass while its sky looks steady.
function ferryPlayback(plan){
 const physical=[0],screen=[0],worlds=[plan.playback.departureWorld,plan.playback.arrivalWorld];
 let epoch=0;
 const sample=(leg,t)=>{
  const p=legSample(leg,t),sky=worlds.map(w=>{
   const d=sub(add(w.position,mul(w.velocity,epoch+t-w.epoch)),p.position);
   return {dir:unit(d),limb:Math.asin(clamp(w.radius/len(d)))};
  });
  return {basis:p.basis,sky};
 };
 // The powered transfer gets ten seconds, including its two short velocity
 // trims. The tangent coasts at both ends give the planets time to grow.
 for(const [index,leg] of plan.legs.entries()){
  const segments=index===2?[[leg.hold+leg.burn,2],[leg.hold+leg.burn+leg.coast,2.5],[leg.T,2]]:[[leg.T,leg.coastOnly?2.65:index===3?3:1.25]];
  let t0=0,prev=sample(leg,0);
  for(const [end,seconds] of segments){
   const weight=[],time=[];let total=0;
   const cuts=leg.coastOnly?[end]:[leg.hold,leg.hold+leg.burn,leg.hold+leg.burn+leg.coast,leg.T-leg.hold,leg.T].filter(t=>t>t0&&t<=end);
   for(const bound of cuts){
    const start=t0;
    for(let k=1;k<=48;k++){
     const t=start+(bound-start)*(.5-.5*Math.cos(Math.PI*k/48)),p=sample(leg,t);
     const angle=Math.acos(clamp((prev.basis.reduce((v,a,i)=>v+dot(a,p.basis[i]),0)-1)/2,-1,1));
     const sky=p.sky.reduce((v,s,i)=>Math.max(v,1.7*Math.min(1,Math.max(s.limb,prev.sky[i].limb)/.009)*Math.acos(clamp(dot(s.dir,prev.sky[i].dir),-1,1)),2.8*Math.abs(s.limb-prev.sky[i].limb)),0);
     total+=Math.max(angle,sky)+.08*(t-t0)/leg.T;
     weight.push(total);time.push(epoch+t);t0=t;prev=p;
    }
   }
   const base=screen.at(-1);
   weight.forEach((w,i)=>{screen.push(base+seconds*w/total);physical.push(time[i]);});
  }
  epoch+=leg.T;
 }
 return {screen,physical,total:screen.at(-1)};
}
function dockingPlayback(plan){
 if(playbackCache.has(plan))return playbackCache.get(plan);
 if(plan.playback.ferry){const clock=ferryPlayback(plan);playbackCache.set(plan,clock);return clock;}
 const spans=[],keys=plan.playback,N=plan.legs.length,main=plan.legs.indexOf(plan.legs.reduce((a,b)=>a.T>b.T?a:b));
 let total=0,epoch=0;
 for(const [i,p] of plan.legs.entries()){
  const first=i===0,last=i===N-1;
  // The deep-space leg starts/ends only eight planetary radii outside
  // the parking circle. A planet is still large there; do not turn off
  // the encounter clock at the artificial gateway.
  const start=first?keys.departureRadius:i===main?8*keys.departureRadius:0,end=last?keys.arrivalRadius:i===main?8*keys.arrivalRadius:0;
  const nearStart=first?keys.departureStationRadius:0,nearEnd=last?keys.arrivalStationRadius:0;
  const t=[0,p.hold,p.hold+p.burn,p.hold+p.burn+p.coast,p.T-p.hold,p.T];
  const burn=i===main?5:2.5;
  const span=[turnSeconds(p.a.basis,p.boost),burn,turnSeconds(p.boost,p.brake),burn,turnSeconds(p.brake,p.b.basis)];
  const w=[0];for(const dt of span)w.push(w.at(-1)+dt);
  const speeds=span.map((v,j)=>(t[j+1]-t[j])/v),slope=j=>Math.min(speeds[j-1]??DOCKING_EDGE_RATE,speeds[j]??DOCKING_EDGE_RATE);
  // Continuous, monotone rate even between a compressed burn and a slow flip.
  function physical(x){
   const wall=x*w[5];let j=0;while(j<4&&wall>w[j+1])j++;
   const u=clamp((wall-w[j])/span[j]),h=t[j+1]-t[j];
   return t[j]+u*((1-u)*(1-u)*span[j]*slope(j)+u*((3-2*u)*h+(u-1)*span[j]*slope(j+1)));
  }
  // Arc length in the translating parent frame, rather than heliocentric
  // distance: the whole parking system travels with the ship on a local leg.
  const leaving=i===main?p.v0:first?p.v1:p.v0,entering=i===main?p.v1:leaving;
  const begins=[0],ends=[0],times=[0],sky=[0];let before=p.a.position;
  // New intercepts also budget the measured change in apparent direction and
  // angular radius. Moving targets can sweep sideways even late on a straight
  // braking leg, when the old distance-only encounter clock barely changes.
  const views=[keys.departureWorld,keys.arrivalWorld].filter(Boolean);
  function view(world,point,time){
   const d=sub(add(world.position,mul(world.velocity,epoch+time-world.epoch)),point),range=len(d);
   return {direction:unit(d),angle:Math.asin(clamp(world.radius/Math.max(world.radius,range)))};
  }
  let oldViews=views.map(w=>view(w,before,0));
  for(let k=1;k<=128;k++){
   // Short segments at each contact resolve the slow initial acceleration
   // on a two-week cruise without repeatedly sampling the solver at runtime.
   const time=p.T*(.5-.5*Math.cos(Math.PI*k/128)),now=legSample(p,time).position;
   const dx=sub(now,before),dt=time-times.at(-1);for(const [arr,v] of [[begins,leaving],[ends,entering]])arr.push(arr.at(-1)+len(sub(dx,mul(v,dt))));
   const newViews=views.map(w=>view(w,now,time));
   const exposure=newViews.reduce((v,current,j)=>{
    const last=oldViews[j],strength=clamp(Math.max(current.angle,last.angle)/.004);
    return Math.max(v,strength*(Math.acos(clamp(dot(current.direction,last.direction),-1,1))+Math.abs(current.angle-last.angle)));
   },0);
   sky.push(sky.at(-1)+3.5*exposure);oldViews=newViews;
   times.push(time);before=now;
  }
  const L=begins.at(-1),E=ends.at(-1);
  function extra(time){
   let lo=0,hi=128;while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<time)lo=mid;else hi=mid;}
   const f=(time-times[lo])/(times[hi]-times[lo]),d=begins[lo]+(begins[hi]-begins[lo])*f,e=E-ends[lo]-(ends[hi]-ends[lo])*f;
   const leave=contactScreenSeconds(d,start)+contactScreenSeconds(d*d/Math.max(1,L),nearStart);
   const enter=contactScreenSeconds(E,end)-contactScreenSeconds(e,end)+contactScreenSeconds(E,nearEnd)-contactScreenSeconds(e*e/Math.max(1,E),nearEnd);
   return leave+enter+sky[lo]+(sky[hi]-sky[lo])*f;
  }
  const wall=w[5]+extra(p.T);
  spans.push({wall,epoch,physical,w:w[5],extra});
  total+=wall;epoch+=p.T;
 }
 const out={spans,total};playbackCache.set(plan,out);return out;
}
export function dockingTransitScreenSeconds(plan){return plan?.playback?dockingPlayback(plan).total:26;}
// A short physical turn is otherwise unobservable alongside a days-long burn.
// This monotone playback map does not change the route, velocities or onboard time.
export function dockingTransitElapsed(plan,screenFraction){
 const f=clamp(screenFraction);if(!plan?.profile||!plan.legs?.length||f===0||f===1)return (plan?.duration||0)*f;
 if(plan.playback){
  const timeline=dockingPlayback(plan);let wall=f*timeline.total;
  if(timeline.screen){
   const {screen,physical}=timeline;let lo=0,hi=screen.length-1;
   while(hi-lo>1){const mid=(lo+hi)>>1;if(screen[mid]<wall)lo=mid;else hi=mid;}
   return physical[lo]+(physical[hi]-physical[lo])*(wall-screen[lo])/(screen[hi]-screen[lo]);
  }
  for(const s of timeline.spans){
   if(wall>s.wall&&s!==timeline.spans.at(-1)){wall-=s.wall;continue;}
   let a=0,b=1;
   for(let i=0;i<36;i++){
    const x=(a+b)/2,t=s.physical(x);
    if(x*s.w+s.extra(t)<wall)a=x;else b=x;
   }
   return s.epoch+s.physical((a+b)/2);
  }
 }
 // Preserve the physical time of an in-progress flight from an older file.
 const N=plan.legs.length,main=plan.legs.reduce((i,l,j,arr)=>l.T>arr[i].T?j:i,0),weights=plan.legs.map((_,j)=>j===main?1-(N-1)*.12:.12);
 let offset=0,wall=0,j=0;
 while(j+1<N&&f>wall+weights[j]){offset+=plan.legs[j].T;wall+=weights[j++];}
 const p=plan.legs[j],u=clamp((f-wall)/weights[j]),times=[0,p.hold,p.hold+p.burn,p.hold+p.burn+p.coast,p.T-p.hold,p.T],stops=[0,.045,.445,.555,.955,1];
 let i=0;while(i<4&&u>stops[i+1])i++;
 const z=(u-stops[i])/(stops[i+1]-stops[i]);
 return offset+times[i]+(times[i+1]-times[i])*z;
}

const frac=.36;
function legTime(relativeDistance,deltaSpeed,cap=G*.97){
 // pi/(2*b*(1-b)) times distance/T² for smooth half-cosine velocity
 // ramps; include room for unequal parking velocities and an engine-off turn.
 return Math.max(30,Math.sqrt(8.5*Math.max(0,relativeDistance)/cap)+4.9*deltaSpeed/cap+30);
}
export function makeLegacyDockingLeg(a,b,T,close=false){
 const hold=Math.min(35,T*.05),active=T-2*hold,burn=frac*active,coast=active-2*burn;
 const v0=a.velocity||Z,v1=b.velocity||Z,start=add(a.position,mul(v0,hold)),end=sub(b.position,mul(v1,hold)),vPeak=mul(sub(sub(end,start),mul(add(v0,v1),burn*.5)),1/(active-burn));
 const vup=sub(vPeak,v0),vdown=sub(v1,vPeak),boost=face(vup,a.basis),brake=face(vdown,boost),p1=add(start,mul(add(v0,vPeak),burn*.5)),p2=add(p1,mul(vPeak,coast));
 return {a,b,T,hold,burn,coast,v0,v1,start,end,vPeak,vup,vdown,boost,brake,p1,p2,close};
}
function legacyLegSample(p,t){
 const {a,b,T,hold,burn,coast,v0,v1,start,end,vPeak,vup,vdown,boost,brake,p1,p2}=p;
 let position,velocity,acceleration=Z,basis,phase;
 function ramp(o,v,q,t,orientation){
  const u=clamp(t/burn),ang=Math.PI*u;
  position=add(add(o,mul(v,t)),mul(q,(t-burn*Math.sin(ang)/Math.PI)*.5));
  velocity=add(v,mul(q,.5*(1-Math.cos(ang))));acceleration=mul(q,.5*Math.PI*Math.sin(ang)/burn);basis=orientation;
 }
 if(t<=hold){position=add(a.position,mul(v0,t));velocity=v0;basis=turn(a.basis,boost,t/hold);phase='Departure alignment';}
 else if(t<hold+burn){ramp(start,v0,vup,t-hold,boost);phase='Transfer burn';}
 else if(t<hold+burn+coast){const z=t-hold-burn;position=add(p1,mul(vPeak,z));velocity=vPeak;basis=turn(boost,brake,z/coast);phase='Coasting turn';}
 else if(t<T-hold){ramp(p2,vPeak,vdown,t-hold-burn-coast,brake);phase='Braking burn';}
 else{position=add(b.position,mul(v1,t-T));velocity=v1;basis=turn(brake,b.basis,(t-(T-hold))/hold);phase='Rendezvous alignment';}
 if(t<=0){position=a.position;velocity=v0;basis=a.basis;}if(t>=T){position=b.position;velocity=v1;basis=b.basis;}
 return {position,velocity,basis,acceleration,phase};
}
// The long transfer is a finite slew between two near-rectangular burns.
// Each burn changes the FULL velocity vector; the peak velocity is solved
// from its integrated displacement. The two burn lengths split the required
// delta-v: neither endpoint's orbital velocity is discarded on arrival.
export function makeDockingLeg(a,b,T,coastOnly=false){
 if(coastOnly)return {a,b,T,v0:a.velocity,v1:b.velocity,vPeak:a.velocity,peakAcceleration:0,coastOnly};

 const hold=Math.min(35,T*.04),coast=Math.min(90,T*.08),active=T-2*hold-coast;
 const v0=a.velocity||Z,v1=b.velocity||Z,start=add(a.position,mul(v0,hold)),end=sub(b.position,mul(v1,hold));
 const edge=B=>Math.min(2,B*.04);
 function solution(B){
  const D=active-B,peak=mul(sub(sub(end,start),add(mul(v0,B*.5),mul(v1,D*.5))),1/(active*.5+coast));
  const up=sub(peak,v0),down=sub(v1,peak);
  return {D,peak,up,down,au:len(up)/(B-edge(B)),ad:len(down)/(D-edge(D))};
 }
 let lo=active*1e-8,hi=active-lo;
 for(let i=0;i<36;i++){const m=(lo+hi)*.5,q=solution(m);if(q.au>q.ad)lo=m;else hi=m;}
 const burn=.5*(lo+hi),q=solution(burn),boost=face(q.up,a.basis),brake=face(q.down,boost);
 const gammaMax=1/Math.max(1e-12,dockTimeFactor([Math.max(len(v0),len(q.peak),len(v1)),0,0]));
 const p1=add(start,mul(add(v0,q.peak),burn*.5)),p2=add(p1,mul(q.peak,coast));
 return {a,b,T,hold,coast,burn,braking:q.D,v0,v1,start,end,vPeak:q.peak,vup:q.up,vdown:q.down,boost,brake,p1,p2,peakAcceleration:Math.max(q.au,q.ad)*gammaMax**3,profile:'flip1g'};
}
function legSample(p,t){
 if(p.coastOnly){
  // Slew as the planet sweeps past, with zero angular speed at both contacts.
  const u=clamp(t/p.T),a=p.coastOnly==='arrival'?1-Math.atan(5*(1-u))/Math.atan(5):Math.atan(5*u)/Math.atan(5);
  const edge=.08,x=Math.min(a,1-a),v=(x<edge?x*x/(2*edge):x-edge/2)/(1-edge);
  return {position:t>=p.T?p.b.position:add(p.a.position,mul(p.v0,t)),velocity:p.v0,basis:turn(p.a.basis,p.b.basis,a<.5?v:1-v,false),acceleration:Z,phase:'Tangent coast'};
 }

 if(!p.profile)return legacyLegSample(p,t);
 const {a,b,T,hold,coast,burn,braking,v0,v1,start,vPeak,vup,vdown,boost,brake,p1,p2}=p;
 let position,velocity,acceleration=Z,basis,phase;
 // Integrate a unit plateau with symmetric, linear, two-second valve ramps.
 function fire(o,v,dv,B,t,frame){
  const h=Math.min(2,B*.04),x=Math.min(t,B-t),area=B-h;
  const vInt=x<h?x*x/(2*h):x-h/2,pInt=x<h?x*x*x/(6*h):.5*x*(x-h)+h*h/6;
  const rising=t<=B/2;
  position=add(add(o,mul(v,t)),mul(dv,(rising?pInt:area*(B/2-x)+pInt)/area));
  velocity=add(v,mul(dv,(rising?vInt:area-vInt)/area));
  acceleration=mul(dv,clamp(x/h)/area);basis=frame;
 }
 if(t<=hold){position=add(a.position,mul(v0,t));velocity=v0;basis=turn(a.basis,boost,t/hold);phase='Departure alignment';}
 else if(t<hold+burn){fire(start,v0,vup,burn,t-hold,boost);phase=p.peakAcceleration>.99*G?'1g departure burn':'Departure burn';}
 else if(t<hold+burn+coast){const z=t-hold-burn;position=add(p1,mul(vPeak,z));velocity=vPeak;basis=turn(boost,brake,z/coast);phase=dot(boost[2],brake[2])<-.98?'Flip · engines off':'Coasting · velocity match';}
 else if(t<T-hold){fire(p2,vPeak,vdown,braking,t-hold-burn-coast,brake);phase=p.peakAcceleration>.99*G?'1g braking burn':'Braking burn';}
 else{position=add(b.position,mul(v1,t-T));velocity=v1;basis=turn(brake,b.basis,(t-(T-hold))/hold);phase='Insertion alignment';}
 if(t<=0){position=a.position;velocity=v0;basis=a.basis;}if(t>=T){position=b.position;velocity=v1;basis=b.basis;}
 return {position,velocity,acceleration,basis,phase};
}
// Root-find for an ACTUAL moving arrival, not a duration fitted to a nominal
// distance. At the accepted epoch each vector pulse just fits the 1g budget.
function burnDuration(make,guess){
 let a=.01,b=Math.max(6,guess),v=make(b);
 for(let i=0;v.peakAcceleration>G&&i<30;i++){b*=1.6;v=make(b);}
 if(!Number.isFinite(v.peakAcceleration)||v.peakAcceleration>G)throw new RangeError('No subluminal 1g intercept is available.');
 for(let i=0;i<44;i++){const m=.5*(a+b),q=make(m);if(q.peakAcceleration>G)a=m;else b=m;}
 return b;
}
function planetGuide(state,station,dir,arrival){
 if(!station?.parentPosition||!station.parentRadiusMeters)return null;
 const radial=sub(state.position,station.parentPosition),r=len(radial),R=station.parentRadiusMeters;
 if(!(r>0&&r<9*R))return null;
 const pv=station.parentVelocity||Z,relv=sub(state.velocity,pv),sign=arrival?-1:1;
 // An orbital departure and insertion run on the local velocity tangent.
 // Integrate translation of the primary separately from that local line.
 const tangent=unit(relv,unit(project(dir,radial.map(n=>n/r)),dir));
 const step=8*R,T=legTime(step,len(relv)),basis=face(tangent,state.basis);
 const position=add(add(state.position,mul(tangent,sign*step)),mul(pv,sign*T));
 return {T,state:{position,velocity:pv,basis}};
}
// The two planetary systems have different transverse velocities. Match each
// one outside the near-body region with a finite powered trim, so the deep-
// space boost, coast, and retroburn can share one straight inertial line.
function cruiseTrim(gateway,arrival){
 const {velocity,basis,position}=gateway;
 const T=Math.max(60,len(velocity)*2/G+120),sign=arrival?-1:1;
 const end={velocity:Z,basis,position:add(position,mul(velocity,sign*.5*T))};
 return {T,state:end};
}
// Conservative envelopes for an operated vehicle, not an intersection with
// an invisible sphere enclosing the empty center of the station. The corridor
// immediately outside each axial mating face must remain usable.
function unsafeStationPoint(point,station,craftRadius){
 const v=sub(point,station.position),b=station.basis||id,radial=Math.hypot(dot(v,b[0]),dot(v,b[2])),axial=Math.abs(dot(v,b[1])),R=station.radiusMeters;
 const halfWidth=.5*craftRadius,halfLength=.86*craftRadius;
 return Math.hypot(Math.max(0,radial-halfWidth),Math.max(0,axial-halfLength))<HABITAT_HUB_RADIUS_UNITS*R&&axial<HABITAT_DOCK_FACE_UNITS*R+halfLength||
  radial<.976*R+halfWidth&&radial>.773*R-halfWidth&&axial<.088*R+halfLength||
  // Station spin phase is immaterial to its two ports. Avoid the entire thin
  // swept envelope of the spokes instead of threading a moving spoke.
  radial<HABITAT_FLOOR_UNITS*R+halfWidth&&axial<.036*R+halfLength;
}
function shortRoute(start,initial){
 // The pressurized hub is not a through passage. To change axial sides locally,
 // leave the near face axially, cross the wheel plane outside the ring, and
 // return above the other face. Only rim jets are available in this branch.
 let dt=0,at=initial;
 const w=at.basis||id,local0=sub(start.position,at.position).map((_,i)=>dot(sub(start.position,at.position),w[i]));
 const range=at.radiusMeters*1.5+start.radiusMeters,side0=Math.sign(local0[1])||Math.sign(dot(sub(start.velocity,at.velocity||Z),w[1]))||at.side,side1=at.side<0?-1:1;
 const nodes=[local0],gate=dockingStandOff(at,start.radiusMeters),local1=w.map(axis=>dot(sub(gate.position,at.position),axis));
 const dv=len(sub(start.velocity,at.velocity||Z)),push=q=>{if(len(sub(q,nodes[nodes.length-1]))>1e-4)nodes.push(q);};
 const egress=Math.max(range,Math.abs(local0[1])),plane=Math.hypot(local0[0],local0[2]);
 if(side0!==side1){
  push([local0[0],side0*egress,local0[2]]);
  const sc=Math.max(range,plane),xx=plane>1e-5?local0[0]/plane*sc:sc,zz=plane>1e-5?local0[2]/plane*sc:0;
  push([xx,side0*egress,zz]);push([xx,side1*range,zz]);push([local1[0],side1*range,local1[2]]);
 }else if(Math.abs(local0[1])<range&&plane>.15*at.radiusMeters){
  push([local0[0],side0*range,local0[2]]);push([local1[0],side1*range,local1[2]]);
 }
 push(local1);if(nodes.length===1)nodes.push(local1);
 const spans=nodes.slice(1).map((q,i)=>{const D=len(sub(q,nodes[i])),T=Math.max(10,1.875*D/3.5,Math.sqrt(8*D/.08)+(i===0?7*dv/.08:0));dt+=T;return T;});
 const relativeVelocity=w.map(n=>dot(sub(start.velocity,at.velocity||Z),n));
 const plan={local:true,nodes,spans,duration:dt,localTurnSeconds:dt*.18,station:at,start,relativeVelocity,craftRadius:start.radiusMeters};
 // Refuse a fast, poorly placed manual intercept if depleting that momentum
 // would cross hardware before the rim jets can bend the path clear.
 for(let j=0,t=0;j<spans.length;j++){
  for(let k=1;k<=64;k++){
   const o=sampleDockingTransitRaw(plan,t+spans[j]*k/64,at);
   if(unsafeStationPoint(o.position,at,start.radiusMeters))throw new RangeError('This approach crosses the station. Back away from the hull and match the station’s velocity first.');
  }
  t+=spans[j];
 }
 return plan;
}
// Coast along the orbital tangent while slewing, then blend the inherited
// transverse orbital velocity into the rectilinear cruise with a single burn.
// The two trim displacements are trapezoidal velocity integrals. Subtracting
// them before choosing the cruise heading yields an exactly collinear midleg.
function ferryTransfer(start,origin,predictArrival){
 const V=150000,trim=(V+100000)/(.80*G)+120;
 const coast=(pose,world)=>6*world.parentRadiusMeters/len(sub(pose.velocity,world.parentVelocity));
 const leave=coast(start,origin),a=add(start.position,mul(start.velocity,leave));
 function solve(T,all=false){
  const transferEnd=leave+2*trim+T;
  let arrival=predictArrival(transferEnd),end=sampleDockingOrbit(arrival,start.radiusMeters),enter=coast(end,arrival);
  // The ferry stations follow circular planet-fixed tracks, so the duration
  // of the final local tangent is independent of orbital phase.
  arrival=predictArrival(transferEnd+enter);end=sampleDockingOrbit(arrival,start.radiusMeters);
  const b=sub(end.position,mul(end.velocity,enter));
  const h=unit(sub(sub(b,a),mul(add(start.velocity,end.velocity),trim/2))),v=mul(h,V);
  const boost=face(sub(v,start.velocity),start.basis),retro=face(mul(h,-1),boost);
  const entry={position:a,velocity:start.velocity,basis:boost},exit={position:b,velocity:end.velocity,basis:face(sub(end.velocity,v),retro)};
  const p={position:add(a,mul(add(start.velocity,v),trim/2)),velocity:v,basis:face(h,boost)};
  const q={position:sub(b,mul(add(end.velocity,v),trim/2)),velocity:v,basis:retro};
  const cruise=makeDockingLeg(p,q,T);
  if(!all)return cruise;
  return {legs:[makeDockingLeg(start,entry,leave,'departure'),makeDockingLeg(entry,p,trim),cruise,makeDockingLeg(q,exit,trim),makeDockingLeg(exit,end,enter,'arrival')],target:end,arrival};
 }
 const guess=legTime(len(sub(predictArrival(0).position,start.position)),0);
 let T=burnDuration(t=>solve(t),guess);
 const pass=solve(T,true);
 const wait=ferryTangentWait(pass.arrival,sub(pass.target.position,start.position));
 T+=wait;
 const {legs,target,arrival}=solve(T,true),duration=legs.reduce((s,l)=>s+l.T,0);
 if(legs.some(l=>l.peakAcceleration>G*1.00001))throw new RangeError('Ferry intercept exceeds available thrust.');
 const world=(s,epoch)=>({position:s.parentPosition,velocity:s.parentVelocity,radius:s.parentRadiusMeters,epoch});
 return {profile:'flip1g',legs,target,duration,craftRadius:start.radiusMeters,playback:{ferry:true,departureRadius:origin.parentRadiusMeters,arrivalRadius:arrival.parentRadiusMeters,
  departureStationRadius:origin.radiusMeters,arrivalStationRadius:arrival.radiusMeters,departureWorld:world(origin,0),arrivalWorld:world(arrival,duration)}};
}

export function createDockingTransit(startCraft,stationAtArrival,options={}){
 const start={...startCraft,basis:startCraft.basis||id,velocity:startCraft.velocity||Z},now=stationAtArrival(0),initial=dockingStandOff(now,start.radiusMeters);
 for(const body of [start,options.departureStation,now]){
  if(body?.parentPosition&&body.parentRadiusMeters>0&&len(sub(start.position,body.parentPosition))<body.parentRadiusMeters+.86*start.radiusMeters)throw new RangeError('Clear the planetary surface before requesting a station approach.');
 }
 if(unsafeStationPoint(start.position,now,start.radiusMeters))throw new RangeError('The shuttle is inside the station clearance envelope. Start outside the hub, rim and spoke plane.');
 if(len(sub(start.position,now.position))<Math.max(6000,12*now.radiusMeters)){
  if(len(sub(start.velocity,now.velocity||Z))>=15)throw new RangeError('Match the station’s velocity to less than 15 m/s before starting a close approach.');
  return shortRoute(start,now);
 }
 if(options.ferry&&options.departureStation&&circular(options.departureStation)&&circular(now))return ferryTransfer(start,options.departureStation,stationAtArrival);
 const direction=unit(sub(initial.position,start.position)),dep=planetGuide(start,options.departureStation||start,direction,false);
 const departure=dep?.state||start,outTrim=len(departure.velocity)>1e-5?cruiseTrim(departure,false):null,op=outTrim?.state||departure;
 const insert=e=>dockingOrbitDuration(e)>0?sampleDockingOrbit(e,start.radiusMeters):dockingStandOff(e,start.radiusMeters);
 const guess=legTime(len(sub(initial.position,start.position)),len(sub(initial.velocity,start.velocity)));
 const arrivalAt=cruise=>{
  let lag=0,epoch=(dep?.T||0)+(outTrim?.T||0)+cruise,station=stationAtArrival(epoch),arr=insert(station),loc=planetGuide(arr,station,direction,true);
  // The gateway's duration is based only on its parent's radius and orbital
  // speed. Resolve the small residual variation for eccentric edited orbits.
  for(let i=0;i<8;i++){const contact=loc?.state||arr,next=(loc?.T||0)+(len(contact.velocity)>1e-5?cruiseTrim(contact,true).T:0);if(i&&Math.abs(next-lag)<1e-5)break;lag=next;station=stationAtArrival(epoch+lag);arr=insert(station);loc=planetGuide(arr,station,direction,true);}
  const contact=loc?.state||arr,inTrim=len(contact.velocity)>1e-5?cruiseTrim(contact,true):null;
  return {arr,loc,inTrim,leg:makeDockingLeg(op,inTrim?.state||contact,cruise)};
 };
 const cruise=burnDuration(T=>arrivalAt(T).leg,guess),{arr,loc,inTrim,leg}=arrivalAt(cruise);
 const legs=[];
 if(dep)legs.push(makeDockingLeg(start,dep.state,dep.T));
 if(outTrim)legs.push(makeDockingLeg(departure,outTrim.state,outTrim.T));
 legs.push(leg);
 if(inTrim)legs.push(makeDockingLeg(inTrim.state,loc?.state||arr,inTrim.T));
 if(loc)legs.push(makeDockingLeg(loc.state,arr,loc.T));
 if(legs.some(l=>Math.max(len(l.vPeak),len(l.v0),len(l.v1))>=C||l.peakAcceleration>G*1.00001))throw new RangeError('No safe 1g station intercept from this orbit.');
 const duration=legs.reduce((n,l)=>n+l.T,0),end=stationAtArrival(duration);
 const world=(s,epoch)=>({position:s.parentPosition,velocity:s.parentVelocity||Z,radius:s.parentRadiusMeters,epoch});
 return {profile:'flip1g',duration,legs,craftRadius:start.radiusMeters,target:arr,playback:{...(dep?{departureWorld:world(options.departureStation||start,0)}:{}),...(loc?{arrivalWorld:world(end,duration)}:{}),departureRadius:dep?(options.departureStation||start).parentRadiusMeters:0,arrivalRadius:loc?now.parentRadiusMeters:0,departureStationRadius:options.departureStation?.radiusMeters||0,arrivalStationRadius:now.radiusMeters}};
}

function sampleDockingTransitRaw(plan,elapsedSISeconds,liveStation=null){
 const t=clamp(elapsedSISeconds,0,plan.duration);
 if(plan.local){
  const station=liveStation||{...plan.station,position:add(plan.station.position,mul(plan.station.velocity||Z,t))},w=station.basis||id;let tt=t,i=0;
  while(i+1<plan.spans.length&&tt>plan.spans[i])tt-=plan.spans[i++];
  const T=plan.spans[i],u=clamp(tt/T),delta=sub(plan.nodes[i+1],plan.nodes[i]);
  const lift=q=>w.reduce((acc,n,k)=>add(acc,mul(n,q[k])),[0,0,0]);
  let offset=add(plan.nodes[i],mul(delta,S(u))),dv=mul(delta,V(u)/T),da=mul(delta,A(u)/(T*T));
  if(i===0&&u<1){const v=plan.relativeVelocity;
   // Endpoint Hermite term: preserve the starting relative velocity while
   // bringing it to zero with continuous acceleration at the next gate.
   const H=u*(1-u)**3*(1+3*u);
   offset=add(offset,mul(v,T*H));dv=add(dv,mul(v,1-18*u*u+32*u**3-15*u**4));da=add(da,mul(v,(-36*u+96*u*u-60*u**3)/T));
  }
  const throat=dockingStandOff(station,plan.craftRadius),basis=turn(plan.start.basis,throat.basis,clamp(t/(plan.localTurnSeconds||Math.min(90,plan.duration)))),relative=lift(offset),o=circular(station),kinematic=lift(da),thrust=sub(kinematic,gravityDifference(o,relative)),position=add(station.position,relative);
  return {position,velocity:add(station.velocity||Z,lift(dv)),basis,acceleration:add(station.acceleration||(o?mul(o.r,-(o.omega**2)):Z),kinematic),properAcceleration:thrust,rcs:basis.map(n=>clamp(dot(n,thrust)/.08,-1,1)),extension:0,mainThrustG:0,docking:true,phase:'RCS rendezvous',rangeMeters:len(sub(position,station.position)),relativeSpeed:len(dv),radiusMeters:plan.craftRadius};
 }
 let tt=t,p=plan.legs[0];for(const leg of plan.legs){p=leg;if(tt<=p.T||leg===plan.legs.at(-1))break;tt-=p.T;}
 const o=legSample(p,tt);
 if(plan.playback?.ferry&&(p===plan.legs[1]||p===plan.legs[3]))o.phase=p===plan.legs[1]?'Matching transfer velocity':'Matching orbital velocity';
 return {...o,properAcceleration:o.acceleration,extension:0,rcs:[0,0,0],mainThrustG:len(o.acceleration)/G,docking:false,rangeMeters:len(sub(o.position,liveStation?.position||plan.target.position)),relativeSpeed:len(sub(o.velocity,liveStation?.velocity||plan.target.velocity)),radiusMeters:plan.craftRadius};
}

export function sampleDockingTransit(plan,elapsedSISeconds,liveStation=null){
 const t=clamp(elapsedSISeconds,0,plan.duration),o=sampleDockingTransitRaw(plan,t,liveStation);
 if(o.mainThrustG>0)return o; // A powered transfer holds its nose on the burn vector.
 const h=Math.min(.15,t,plan.duration-t);
 if(h>.001)o.rcsTorque=rimTurnCommand(sampleDockingTransitRaw(plan,t-h,liveStation).basis,o.basis,sampleDockingTransitRaw(plan,t+h,liveStation).basis,h);
 return o;
}
