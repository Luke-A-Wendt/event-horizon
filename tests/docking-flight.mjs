import assert from 'node:assert/strict';
import {dockingPortGeometry,dockingStandOff,dockingCloseDuration,sampleDockingClose,createDockingTransit,sampleDockingTransit,makeDockingLeg,dockingTransitElapsed,dockingOrbitDuration,sampleDockingOrbit,dockingAcquireDuration,sampleDockingAcquire} from '../dist/docking-flight.js';
import {HABITAT_DOCK_FACE_UNITS,HABITAT_HUB_RADIUS_UNITS,HABITAT_AIRLOCK_RADIUS_UNITS} from '../dist/habitat-spin.js';
import {MERIDIAN_DOCK_TIP_STOWED,MERIDIAN_DOCK_STROKE} from '../dist/meridian-port.js';
const B=[[1,0,0],[0,1,0],[0,0,1]],add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),len=a=>Math.hypot(...a);
const near=(a,b,tol=1e-6,message='')=>assert(len(sub(a,b))<=tol,message+' '+JSON.stringify(a)+' != '+JSON.stringify(b));
const craftRadius=37.24/1.72,stationRadius=1000/.92,AU=149597870700;
function orbit(r,w,u){return {p:[r*Math.cos(u),0,r*Math.sin(u)],v:[-w*r*Math.sin(u),0,w*r*Math.cos(u)]};}
function source(mars,t,side){
 const h=orbit((mars?1.524:1)*AU,2*Math.PI/((mars?687:365.25)*86400),(mars?1.7:.1)+2*Math.PI*t/((mars?687:365.25)*86400)),
 R=mars?3389500:6371000,ro=R+(mars?340:430)*1000,w=Math.sqrt((mars?4.282837e13:3.986e14)/(ro*ro*ro)),m=orbit(ro,w,(mars?.5:2)+t*w);
 return {position:add(h.p,m.p),velocity:add(h.v,m.v),basis:B,side,radiusMeters:stationRadius,parentPosition:h.p,parentRadiusMeters:R,parentVelocity:h.v,id:mars?'mars':'earth'};
}
// Each flat annulus ends on the sphere: the seal neither protrudes into
// space nor sits at the base of an inaccessible socket.
assert(Math.abs(Math.hypot(HABITAT_DOCK_FACE_UNITS,HABITAT_AIRLOCK_RADIUS_UNITS)-HABITAT_HUB_RADIUS_UNITS)<1e-12);
for(const side of [-1,1]){
 const s=source(false,0,side),T=dockingCloseDuration(s,craftRadius);let previous=Infinity,prevExt=0;
 for(let i=0;i<=200;i++){
  const u=i/200,q=sampleDockingClose(s,craftRadius,u),back=sampleDockingClose(s,craftRadius,1-u,'undock');
  assert.equal(q.mainThrustG,0);assert(q.rangeMeters<=previous+.0000001);assert(q.extension>=prevExt);assert(q.relativeSpeed<=1.66);previous=q.rangeMeters;prevExt=q.extension;
  near(q.position,back.position,.00001);near(sub(q.velocity,s.velocity),sub(s.velocity,back.velocity));assert.equal(q.basis[2][1],-side);
  if(u>.985)assert(q.relativeSpeed<.02);
  if(i>0&&i<200){
   const h=.001,der=mul(sub(sampleDockingClose(s,craftRadius,u+h).position,sampleDockingClose(s,craftRadius,u-h).position),1/(2*h*T));
   near(der,sub(q.velocity,s.velocity),1e-4);
  }
 }
 const dock=sampleDockingClose(s,craftRadius,1,'hold'),tip=add(dock.position,mul(dock.basis[2],(MERIDIAN_DOCK_TIP_STOWED+MERIDIAN_DOCK_STROKE)*craftRadius));
 near(tip,add(s.position,mul(B[1],side*HABITAT_DOCK_FACE_UNITS*stationRadius)),1e-5,'coincident actual contact planes');
 assert.equal(dock.extension,1);assert.equal(dock.rangeMeters,0);assert.equal(dock.relativeSpeed,0);near(dock.rcs,[0,0,0]);near(dock.velocity,s.velocity);
}
let elapsed=0,phase=0;
for(const outbound of [true,false,true]){
 const departure=source(!outbound,elapsed,outbound?1:-1),at=t=>source(outbound,elapsed+t,outbound?-1:1),start=dockingStandOff(departure,craftRadius),plan=createDockingTransit(start,at,{departureStation:departure});
 assert(plan.duration>24*3600&&plan.duration<30*86400);assert.equal(plan.legs.length,3);assert.deepEqual(structuredClone(plan),plan);
 const first=sampleDockingTransit(plan,0,at(0)),end=sampleDockingTransit(plan,plan.duration,at(plan.duration)),gate=sampleDockingOrbit(at(plan.duration),craftRadius);
 near(first.position,start.position);near(first.velocity,start.velocity);near(end.position,gate.position,.001);near(end.velocity,gate.velocity);near(end.basis[2],gate.basis[2]);
 let peak=0;const ticks=4000;
 for(let i=0;i<=ticks;i++){const t=i/ticks*plan.duration,tf=at(t),q=sampleDockingTransit(plan,t,tf);
  assert(len(sub(q.position,tf.parentPosition))>tf.parentRadiusMeters,'avoids destination planet');
  const origin=source(!outbound,elapsed+t,departure.side);assert(len(sub(q.position,origin.parentPosition))>origin.parentRadiusMeters,'avoids departure planet');
  peak=Math.max(peak,q.mainThrustG);assert(q.mainThrustG<=1.0001,'1g thrust cap '+q.mainThrustG);
  assert(Math.abs(q.relativeSpeed-len(sub(tf.velocity,q.velocity)))<1e-6);
  if(q.mainThrustG>1e-8)assert(dot(q.basis[2],q.properAcceleration)/len(q.properAcceleration)>.9999999,'main engines burn through the thrust axis');
 }
 assert(peak>.999,'sustained one-g transfer');
 const leg=plan.legs[1],startLeg=plan.legs[0].T;
 for(const burnTime of [leg.hold+leg.burn*.25,leg.hold+leg.burn*.75,leg.hold+leg.burn+leg.coast+leg.braking*.5]){
  const sample=sampleDockingTransit(plan,startLeg+burnTime);assert(sample.mainThrustG>.999&&sample.mainThrustG<=1,'true 1g transfer and braking cruise');
 }
 const flip=sampleDockingTransit(plan,startLeg+leg.hold+leg.burn+leg.coast*.5);
 assert.equal(flip.mainThrustG,0); assert.match(flip.phase,/Flip/);assert(dot(leg.boost[2],leg.brake[2])<-.995);
 let previous=-1;for(let f=0;f<=100;f++){const t=dockingTransitElapsed(plan,f/100);assert(t>previous);previous=t;}
 assert.equal(dockingTransitElapsed(plan,1),plan.duration);
 const e0=plan.duration,Torb=dockingOrbitDuration(at(e0)),Ta=dockingAcquireDuration(at(e0),craftRadius);
 assert(Torb>1000&&Torb<6000);
 for(let i=0;i<=40;i++){
  const ts=at(e0+i*Torb/40),q=sampleDockingOrbit(ts,craftRadius);
  near([len(sub(q.position,ts.parentPosition))],[len(sub(ts.position,ts.parentPosition))],.0001);
  near([len(sub(q.velocity,ts.parentVelocity))],[len(sub(ts.velocity,ts.parentVelocity))],.000001);near(q.properAcceleration,[0,0,0]);assert.equal(q.mainThrustG,0);
 }
 const begin=e0+Torb;
 let peakJets=0;
 for(let i=0;i<=120;i++){
  const u=i/120,t=begin+u*Ta,ts=at(t),q=sampleDockingAcquire(ts,craftRadius,u);
  peakJets=Math.max(peakJets,len(q.rcs));assert.equal(q.mainThrustG,0);
  const d=sub(q.position,ts.position);assert(len(d)>.975*stationRadius+craftRadius,'acquisition clears outer rim');
  if(i===0||i===120){
   const endpoint=i===0?sampleDockingOrbit(ts,craftRadius):dockingStandOff(ts,craftRadius);near(q.position,endpoint.position,1e-5);near(q.velocity,endpoint.velocity,1e-5);near(q.basis[2],endpoint.basis[2],1e-6);
  }else {
   const h=.1,qa=sampleDockingAcquire(at(t-h),craftRadius,u-h/Ta),qb=sampleDockingAcquire(at(t+h),craftRadius,u+h/Ta);
   near(mul(sub(qb.position,qa.position),1/(2*h)),q.velocity,.005,'d/dt of moving station acquisition');
  }
 }
 assert(peakJets>.1,'rim jets accelerate and brake on hub approach');
 for(const u of [0,.12,.55,.95,1]){
  const t=begin+u*Ta,station=at(t),rev=sampleDockingAcquire(station,craftRadius,u,true);
  assert.equal(rev.mainThrustG,0);
  if(!u||u===1){const ref=u?sampleDockingOrbit(station,craftRadius):dockingStandOff(station,craftRadius);near(rev.position,ref.position,.001);near(rev.velocity,ref.velocity,1e-5);}
  else {const h=.2,qa=sampleDockingAcquire(at(t-h),craftRadius,u-h/Ta,true),qb=sampleDockingAcquire(at(t+h),craftRadius,u+h/Ta,true);near(mul(sub(qb.position,qa.position),1/(2*h)),rev.velocity,.005,'moving-frame RCS egress velocity');}
 }
 let join=0;
 for(let i=0;i<plan.legs.length;i++){
  const leg=plan.legs[i];assert.deepEqual(makeDockingLeg(leg.a,leg.b,leg.T),leg);
  for(const k of [leg.hold,leg.hold+leg.burn,leg.hold+leg.burn+leg.coast,leg.T-leg.hold,leg.T]){
   const h=.01,t=join+k;if(t>=plan.duration)continue;
   const l=sampleDockingTransit(plan,t-h),r=sampleDockingTransit(plan,t+h);
   assert(len(sub(l.velocity,r.velocity))<.21);near(l.basis[2],r.basis[2],1e-4,'continuous orientation across joined phases');
  }join+=leg.T;
 }
 elapsed+=plan.duration+2*dockingCloseDuration(at(plan.duration),craftRadius)+600;phase++;
}
assert.equal(phase,3);
const s=source(false,0,-1),opposite=dockingStandOff(s,craftRadius),live=t=>source(false,t,1),local=createDockingTransit(opposite,live);
assert(local.local);assert.deepEqual(structuredClone(local),local);
for(let i=0;i<=1000;i++){
 const t=i/1000*local.duration,station=live(t),q=sampleDockingTransit(local,t,station),p=sub(q.position,station.position);
 assert.equal(q.mainThrustG,0);if(Math.abs(p[1])<stationRadius*.25)assert(Math.hypot(p[0],p[2])>stationRadius+craftRadius,'wheel-plane crossing stays outside the rim');
}
near(sampleDockingTransit(local,local.duration,live(local.duration)).position,dockingStandOff(live(local.duration),craftRadius).position,1e-4);
console.log('PASS docking: both axial ports and telescoping interfaces coincide, jet-only reversible closing path, 1g moving Earth–Mars intercepts, smooth burn flips/joins, both planets cleared, matched half-laps and rim-only ingress/egress clear the rotating wheel.');
const cur=live(0),run=o=>createDockingTransit({...dockingStandOff(cur,craftRadius),...o},live);
assert.throws(()=>run({position:cur.position}),/clearance/);
// The enlarged equatorial shoulder includes locations that used to be free
// space beside the narrower ellipsoid, above the spokes.
assert.throws(()=>run({position:add(cur.position,[.145*cur.radiusMeters,.065*cur.radiusMeters,0])}),/clearance/);
assert.throws(()=>run({position:add(cur.position,mul(B[0],.9*cur.radiusMeters))}),/clearance/);
assert.throws(()=>run({position:cur.parentPosition}),/planetary surface/);
assert.throws(()=>run({velocity:add(cur.velocity,[0,0,15])}),/15 m\/s/);
const off=run({position:add(dockingStandOff(cur,craftRadius).position,[3,9,-6]),velocity:add(cur.velocity,[.3,0,0])});
assert(off.local&&off.duration>0);
console.log('PASS local capture rejects solid-body starts and unsafe closing speeds; clears mild staging misalignment using only RCS.');
