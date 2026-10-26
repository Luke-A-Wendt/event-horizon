/* Frenet–Serret kinematics for an explicitly prescribed craft worldline.
 * SI speed/curvature/torsion; this does not solve a self-consistent warp metric. */
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const FLIGHT_LIGHT_SPEED=299792458;
export const FLIGHT_WARP_MAX=9.9999;
export const FLIGHT_WARP_RATE=.45;
// Standard gravity is an educational acceleration unit, not a claim about
// the real Space Shuttle's propulsion or sustained acceleration capability.
export const FLIGHT_STANDARD_GRAVITY=9.80665;
export const SHUTTLE_THRUST_MAX_G=10;
export const SHUTTLE_THRUST_STEP_G=.5;
export function shuttleThrustSetting(value){return Math.round(clamp(Number(value)||0,0,SHUTTLE_THRUST_MAX_G)/SHUTTLE_THRUST_STEP_G)*SHUTTLE_THRUST_STEP_G;}
const WARP_NINE_SPEED=9**(10/3),WARP_SPEED_CAP=199516;
// Below nine this is the familiar TNG reference convention. The finite
// interpolation above nine is a display choice, never a canonical speed law
// or the infinite-velocity limit at W=10.
export function speedForWarp(factor){const w=clamp(Number(factor)||0,0,FLIGHT_WARP_MAX);return FLIGHT_LIGHT_SPEED*(w<=9?w**(10/3):WARP_NINE_SPEED*Math.exp((w-9)/.9999*Math.log(WARP_SPEED_CAP/WARP_NINE_SPEED)));}
export function warpForSpeed(speed){const ratio=Math.max(0,Number(speed)||0)/FLIGHT_LIGHT_SPEED;return ratio<=WARP_NINE_SPEED?ratio**.3:clamp(9+.9999*Math.log(ratio/WARP_NINE_SPEED)/Math.log(WARP_SPEED_CAP/WARP_NINE_SPEED),9,FLIGHT_WARP_MAX);}
export function flightControlRates(flight,options={}){
 const warp=options.warp===true,v=Math.max(0,Number(flight.speed)||0),scale=Math.max(v,warp?FLIGHT_LIGHT_SPEED:60);
 const factor=warpForSpeed(v),dw=FLIGHT_WARP_RATE;
 const speedRate=warp?(factor<=9?FLIGHT_LIGHT_SPEED*(10/3)*factor**(7/3):v*Math.log(WARP_SPEED_CAP/WARP_NINE_SPEED)/.9999)*dw:Math.max(Math.max(1,options.lengthMeters||100)*.4,v*1.5);
 return {warpRate:warp?dw:0,speedRate,curvatureRate:.08/scale,torsionRate:.06/scale,maxCurvature:.65/scale,maxTorsion:.50/scale};
}
export function orthonormalFrame(frame){const T=unit(frame[2]),guess=frame[1],N0=guess.map((v,i)=>v-T[i]*dot(guess,T)),N=unit(Math.hypot(...N0)>1e-10?N0:cross(T,Math.abs(T[1])<.9?[0,1,0]:[1,0,0])),B=unit(cross(N,T));return [B,unit(cross(T,B)),T];}
function rotate(v,axis,angle){const c=Math.cos(angle),s=Math.sin(angle),d=dot(axis,v),q=cross(axis,v);return v.map((x,i)=>x*c+q[i]*s+axis[i]*d*(1-c));}
export function integrateFrenet(flight,dt,input={},options={}){
 dt=clamp(Number(dt)||0,0,1);if(dt===0)return flight;const maxSpeed=options.maxSpeed||speedForWarp(FLIGHT_WARP_MAX),controlled=options.controlled===true;
 const rates=flightControlRates(flight,options);
 if(options.warp===true){if(input.speed)flight.speed=speedForWarp(warpForSpeed(flight.speed)+(input.speed||0)*rates.warpRate*dt);}
 else flight.speed=clamp((flight.speed||0)+(input.speed||0)*rates.speedRate*dt,0,maxSpeed);
 const nextRates=flightControlRates(flight,options);
 flight.curvature=(flight.curvature||0)+(input.curvature||0)*nextRates.curvatureRate*dt;
 flight.torsion=(flight.torsion||0)+(input.torsion||0)*nextRates.torsionRate*dt;
 // Interactive steering uses bounded angular rates, not ship-sized circles
// at thousands of c. Pure kinematics callers retain their exact κ and τ.
 if(controlled){flight.curvature=clamp(flight.curvature,-nextRates.maxCurvature,nextRates.maxCurvature);flight.torsion=clamp(flight.torsion,-nextRates.maxTorsion,nextRates.maxTorsion);}
 let frame=orthonormalFrame(flight.basis),position=[...flight.position];
 // Closed-form constant-control helix integral. It remains bounded work even
 // at large v*kappa, with no frame-dependent iteration or lost path length.
 const [N,B,T]=frame,w=T.map((v,i)=>v*flight.torsion+B[i]*flight.curvature),wn=Math.hypot(...w),ds=flight.speed*dt;
 if(wn>1e-30){const axis=w.map(v=>v/wn),theta=wn*ds,angle=theta%(2*Math.PI),parallel=dot(axis,T),q=cross(axis,T),sin=Math.sin(angle),oneMinusCos=2*Math.sin(angle*.5)**2;position=position.map((v,i)=>v+axis[i]*parallel*ds+(T[i]-axis[i]*parallel)*sin/wn+q[i]*oneMinusCos/wn);frame=frame.map(v=>rotate(v,axis,angle));}
 else position=position.map((v,i)=>v+T[i]*ds);
 flight.position=position;flight.basis=orthonormalFrame(frame);flight.travelCompression=1;return flight;
}
export function predictedFlightPath(flight,length,segments=20){const p={...flight,position:[...flight.position],basis:flight.basis.map(v=>[...v]),speed:Math.max(1,length),curvature:flight.curvature,torsion:flight.torsion},points=[[...p.position]];for(let i=0;i<segments;i++){integrateFrenet(p,1/segments,{}, {lengthMeters:1,maxSpeed:Math.max(1,length)});points.push([...p.position]);}return points;}

// A Shuttle uses special-relativistic thrust in a local inertial reference
// frame. This deliberately omits gravitational clock shifts and frame transport.
// Its forward unit vector is interpreted in the instantaneously comoving frame
// related to the scene frame by a rotation-free boost; attitude remains a simple
// planar control, not a full relativistic rigid-body attitude solver.
const SUBLUMINAL_SPEED=FLIGHT_LIGHT_SPEED*(1-8*Number.EPSILON);
const c2=FLIGHT_LIGHT_SPEED*FLIGHT_LIGHT_SPEED;
function finiteVelocity(flight,T=flight.basis[2]){
 const v=flight.velocity?.length===3&&flight.velocity.every(Number.isFinite)?[...flight.velocity]:T.map(x=>x*Math.max(0,Number(flight.speed)||0));
 const speed=Math.hypot(...v);return speed>SUBLUMINAL_SPEED?v.map(x=>x/speed*SUBLUMINAL_SPEED):v;
}
function properVelocity(v){const beta=Math.min(1-8*Number.EPSILON,Math.hypot(...v)/FLIGHT_LIGHT_SPEED),gamma=1/Math.sqrt((1-beta)*(1+beta));return v.map(x=>x*gamma);}
function ordinaryVelocity(u){const gamma=Math.hypot(1,...u.map(x=>x/FLIGHT_LIGHT_SPEED)),v=u.map(x=>x/gamma),speed=Math.hypot(...v);return speed>SUBLUMINAL_SPEED?v.map(x=>x/speed*SUBLUMINAL_SPEED):v;}
// du/dt for a supplied proper-acceleration vector (u = gamma v).
function properImpulse(u,a){const gamma=Math.hypot(1,...u.map(x=>x/FLIGHT_LIGHT_SPEED)),projection=dot(u,a)/(c2*gamma*(gamma+1));return a.map((x,i)=>x/gamma+u[i]*projection);}
function coordinateAcceleration(v,a){const beta=Math.min(1-8*Number.EPSILON,Math.hypot(...v)/FLIGHT_LIGHT_SPEED),invGamma=Math.sqrt((1-beta)*(1+beta)),projection=dot(v,a)/c2;return a.map((x,i)=>invGamma*invGamma*(x-v[i]*projection/(1+invGamma)));}
export function shuttleRelativity(flight){
 const velocity=finiteVelocity(flight),speed=Math.hypot(...velocity),beta=speed/FLIGHT_LIGHT_SPEED,invGamma=Math.sqrt(Math.max(0,(1-beta)*(1+beta))),properAcceleration=shuttleThrustSetting(flight.thrust)*FLIGHT_STANDARD_GRAVITY,vector=coordinateAcceleration(velocity,flight.basis[2].map(x=>x*properAcceleration));
 return {velocity,speed,beta,lorentzFactor:1/Math.max(invGamma,1e-15),properAcceleration,coordinateAcceleration:Math.hypot(...vector),coordinateAccelerationVector:vector};
}
function clockLagRate(velocity){const b=Math.min(1,Math.hypot(...velocity)/FLIGHT_LIGHT_SPEED),b2=b*b;return b2/(1+Math.sqrt(Math.max(0,(1-b)*(1+b))));}
function addClockValue(flight,key,compensationKey,increment){const y=increment-(flight[compensationKey]||0),before=flight[key]||0,total=before+y;flight[compensationKey]=(total-before)-y;flight[key]=total;}
function advanceFlightClocks(flight,dt,lag=0){
 addClockValue(flight,'coordinateTimeSeconds','coordinateTimeCompensation',dt);
 // Accumulate the small difference directly instead of subtracting two nearly
 // equal clock readings. At ordinary Shuttle speeds it can be nanoseconds.
 addClockValue(flight,'timeLagSeconds','timeLagCompensation',Math.max(0,Math.min(dt,lag)));
}
export function resetFlightClocks(flight){flight.coordinateTimeSeconds=0;flight.timeLagSeconds=0;flight.coordinateTimeCompensation=0;flight.timeLagCompensation=0;}

export function integratePlanar(flight,dt,input={},options={}){
 dt=clamp(Number(dt)||0,0,1);if(!dt)return flight;
 if(!options.warp)return integrateShuttlePlanar(flight,dt,input);
 advanceFlightClocks(flight,dt);
 if(input.speed)flight.brakeSpeed=false;if(input.curvature)flight.brakeTurn=false;
 if(flight.brakeSpeed){flight.speed=options.warp?speedForWarp(Math.max(0,warpForSpeed(flight.speed)-1.5*dt)):Math.max(0,(flight.speed||0)-Math.max(10,flight.brakeInitialSpeed/2)*dt);if(flight.speed<1e-6){flight.speed=0;flight.brakeSpeed=false;}}
 else if(options.warp){flight.speed=speedForWarp(warpForSpeed(flight.speed)+(input.speed||0)*FLIGHT_WARP_RATE*dt);}
 else flight.speed=clamp((flight.speed||0)+(input.speed||0)*flightControlRates(flight,options).speedRate*dt,0,options.maxSpeed||12000);
 if(flight.brakeTurn){const w=flight.angularVelocity||0;flight.angularVelocity=Math.sign(w)*Math.max(0,Math.abs(w)-.24*dt);if(!flight.angularVelocity)flight.brakeTurn=false;}else flight.angularVelocity=clamp((flight.angularVelocity||0)+(input.curvature||0)*.16*dt,-.65,.65);
 flight.torsion=0;flight.curvature=flight.speed>0?flight.angularVelocity/flight.speed:0;
 const [N,B,T]=orthonormalFrame(flight.basis),w=flight.angularVelocity,a=w*dt;
 const forward=Math.abs(w)>1e-12?Math.sin(a)/w:dt,side=Math.abs(w)>1e-12?2*Math.sin(a*.5)**2/w:0;
 flight.position=flight.position.map((x,i)=>x+flight.speed*(T[i]*forward+N[i]*side));
 flight.basis=[rotate(N,B,a),B,rotate(T,B,a)];flight.travelCompression=1;return flight;
}

// Inertial translation and body attitude are independent: turning rotates the
// next proper thrust, not the existing velocity. Analytic rotating-thrust
// integrals retain the low-speed trajectory. Their relativistic boost is
// evaluated at the midpoint; with <=10 g and <=1-second steps, changes in
// rapidity per step are tiny. Work remains bounded, without substep loops.
export function integrateShuttlePlanar(flight,dt,input={}){
 dt=clamp(Number(dt)||0,0,1);if(!dt)return flight;
 if(input.curvature)flight.brakeTurn=false;
 if(flight.brakeSpeed){flight.thrust=0;flight.brakeSpeed=false;}
 flight.thrust=shuttleThrustSetting(flight.thrust);
 if(flight.brakeTurn){const w=flight.angularVelocity||0;flight.angularVelocity=Math.sign(w)*Math.max(0,Math.abs(w)-.24*dt);if(!flight.angularVelocity)flight.brakeTurn=false;}else flight.angularVelocity=clamp((flight.angularVelocity||0)+(input.curvature||0)*.16*dt,-.65,.65);
 const [N,B,T]=orthonormalFrame(flight.basis),w=flight.angularVelocity,x=w*dt,x2=x*x;
 const velocity=finiteVelocity(flight,T),u0=properVelocity(velocity),acceleration=flight.thrust*FLIGHT_STANDARD_GRAVITY;
 const small=Math.abs(x)<1e-3,sinc=small?1-x2/6+x2*x2/120:Math.sin(x)/x,cosc=small?x*(.5-x2/24+x2*x2/720):2*Math.sin(x*.5)**2/x;
 const along=small?.5-x2/24+x2*x2/720:2*Math.sin(x*.5)**2/x2,side=small?x*(1/6-x2/120+x2*x2/5040):(x-Math.sin(x))/x2;
 const half=x*.5,half2=half*half,hsinc=Math.abs(half)<1e-3?1-half2/6+half2*half2/120:Math.sin(half)/half,hcosc=Math.abs(half)<1e-3?half*(.5-half2/24+half2*half2/720):2*Math.sin(half*.5)**2/half;
 const halfImpulse=T.map((v,i)=>acceleration*dt*.5*(v*hsinc+N[i]*hcosc)),midKick=properImpulse(u0,halfImpulse),um=u0.map((v,i)=>v+midKick[i]),vm=ordinaryVelocity(um);
 const impulse=T.map((v,i)=>acceleration*dt*(v*sinc+N[i]*cosc)),kick=properImpulse(um,impulse),u1=u0.map((v,i)=>v+kick[i]);
 // Preserve a coasting vector bit-for-bit instead of repeatedly converting it.
 const nextVelocity=acceleration>0?ordinaryVelocity(u1):velocity;
 const restDisplacement=T.map((v,i)=>acceleration*dt*dt*(v*along+N[i]*side)),correction=coordinateAcceleration(vm,restDisplacement);
 let displacement=velocity.map((v,i)=>v*dt+correction[i]);const distance=Math.hypot(...displacement),maximum=SUBLUMINAL_SPEED*dt;if(distance>maximum)displacement=displacement.map(v=>v/distance*maximum);
 flight.position=flight.position.map((v,i)=>v+displacement[i]);
 advanceFlightClocks(flight,dt,dt*(clockLagRate(velocity)+4*clockLagRate(vm)+clockLagRate(nextVelocity))/6);
 flight.velocity=nextVelocity;flight.speed=Math.hypot(...nextVelocity);flight.torsion=0;flight.curvature=flight.speed>0?w/flight.speed:0;
 flight.basis=[rotate(N,B,x),B,rotate(T,B,x)];flight.travelCompression=1;return flight;
}
