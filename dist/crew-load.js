// Required proper acceleration in a locally nonrotating (ZAMO) frame of
// one Kerr source. An exact result for the specified stationary circular
// worldline; a local polar-velocity model, not an integrated GR trajectory,
// for the cinematic transfer. The radial coordinate is Boyer–Lindquist r.
const c=299792458,g0=9.80665;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export function compactTrackLoadG(source,position,vPhi,motion=null){
 const d=position.map((v,i)=>v-source.positionMeters[i]),r=Math.hypot(...d);
 const a=Math.max(-1,Math.min(1,source.spinParameter||0)),q=Math.sqrt((1-a)*(1+a)),rg=source.horizonMeters/(1+q);
 if(!(r>0&&rg>0))return 0;
 const x=r/rg,C=source.spinAxis?Math.max(-1,Math.min(1,dot(d,source.spinAxis)/r)):0,S=Math.sqrt((1-C)*(1+C));
 const gap=Math.max((r-source.horizonMeters)/rg,Number.EPSILON*x),D=gap*(gap+2*q),F=x*x+a*a*C*C;
 const L=x*x+a*a,A=L*F+2*x*a*a*S*S,w=2*a*x/A,alpha=Math.sqrt(F*D/A),h3=Math.sqrt(A/F)*S;
 const invH1=Math.sqrt(D/F),invH2=1/Math.sqrt(F),Ax=(2*x*F+2*x*L+2*a*a*S*S)/A,At=-2*a*a*D*S*C/A;
 const Fx=2*x/F,Ft=-2*a*a*S*C/F,Dx=2*(gap+q)/D;
 // Directional derivatives in the spatial orthonormal basis. For fixed
 // local azimuthal speed beta the radial/polar part reduces to gamma²
 // (grad ln(alpha) - beta² grad ln(h_phi) + beta h_phi/alpha grad omega).
 const gradAlpha=[.5*invH1*(Fx+Dx-Ax),.5*invH2*(Ft-At)];
 const gradH3=[.5*invH1*(Ax-Fx),invH2*(.5*(At-Ft)+(S>1e-12?C/S:0))];
 const twist=[h3/alpha*invH1*w*(1/x-Ax),-h3/alpha*invH2*w*At];
 const vRho=motion?.radialVelocity||0,v=[vRho*S,vRho*C,vPhi],beta=Math.hypot(...v)/c;
 if(beta>=1||!Number.isFinite(beta))return null;
 const gamma=1/Math.sqrt((1-beta)*(1+beta)),fac=c*c/(rg*g0);
 if(!motion){
  return gamma*gamma*fac*Math.hypot(...gradAlpha.map((v,i)=>v-(vPhi/c)**2*gradH3[i]+vPhi/c*twist[i]));
 }
 // a^a = du^a/dtau + Gamma^a_bc u^b u^c. Build only the nonzero
 // commutators of the ZAMO tetrad; this avoids subtracting nearly equal
 // time/azimuth metric terms near the horizon.
 const U=[gamma,...v.map(s=>gamma*s/c)],lower=[-gamma,...U.slice(1)],K=[0,0,0,0];
 function comm(k,i,j,z){const h=lower[k]*z;K[i]+=h*U[j];K[j]-=h*U[i];}
 for(let j=0;j<2;j++){
  const i=j+1;comm(0,i,0,-gradAlpha[j]);comm(3,i,0,twist[j]);comm(3,i,3,-gradH3[j]);
 }
 comm(1,1,2,.5*invH2*Ft);comm(2,1,2,-.5*invH1*Fx);
 const rho=motion.radius||r*S,dRho=motion.radialAcceleration+(motion.tangentialVelocity**2)/rho;
 const dPhi=motion.tangentialAcceleration-vRho*motion.tangentialVelocity/rho;
 const thetaDot=v[1]*invH2/rg;
 const dv=[dRho*S+vRho*C*thetaDot,dRho*C-vRho*S*thetaDot,dPhi];
 const dGamma=gamma**3*dot(v,dv)/(c*c);
 const spatial=K.slice(1).map((z,i)=>z*fac+(gamma*dGamma*v[i]+gamma*gamma*dv[i])/g0);
 // Transform spatial four-acceleration to the instantaneous rest frame.
 const nh=beta?v.map(s=>s/(beta*c)):[0,0,0],parallel=dot(spatial,nh);
 return Math.hypot(...spatial.map((s,i)=>s-parallel*nh[i]),parallel/gamma);
}

// Account each proper-time interval once, never a wall-time or display tick.
// A constant-load lap can represent days of onboard time. For changing load,
// interpolate threshold crossings between adjacent samples in that interval.
export function accumulateCrewExposure(clock,seconds,start,end=start){
 if(!clock||!(seconds>0)||!Number.isFinite(seconds))return;
 for(const [key,g,at] of [['highGExposureSeconds',1.5,false],['extremeGExposureSeconds',8,true]]){
  const above=x=>Number.isFinite(x)&&(at?x>=g:x>g);
  if(!above(end)){clock[key]=0;continue;}
  const sustained=above(start),frac=sustained||!Number.isFinite(start)||start===end?1:Math.max(0,Math.min(1,(end-g)/(end-start)));
  clock[key]=Math.min(1e300,(sustained?clock[key]||0:0)+seconds*frac);
 }
}

// A prescribed meridional Kerr track: its azimuth comoves with the locally
// dragged frame (L_z=0). The inputs are the plotted cylindrical coordinates
// and their first and second derivatives in **onboard proper seconds**.
// The two spatial scales convert coordinate rates into physical components
// of 4-velocity, so even a rapidly compressed display implies timelike speed.
export function meridionalClockMotion(source,R,Z,dR=0,dZ=0,ddR=0,ddZ=0){
 const a=source.spinParameter||0,q=Math.sqrt((1-a)*(1+a)),rg=source.horizonMeters/(1+q),r=Math.hypot(R,Z);
 const x=r/rg,C=Z/r,S=R/r,gap=Math.max((r-source.horizonMeters)/rg,Number.EPSILON*x),D=gap*(gap+2*q),F=x*x+a*a*C*C;
 const A=(x*x+a*a)*F+2*x*a*a*S*S,hR=Math.sqrt(F/D),hT=Math.sqrt(F);
 const Fx=2*x/F,Ft=-2*a*a*C*S/F,Dx=2*(gap+q)/D,Ax=(2*x*F+2*x*(x*x+a*a)+2*a*a*S*S)/A,At=-2*a*a*D*S*C/A;
 const gradX=.5*(Fx+Dx-Ax),gradT=.5*(Ft-At),alpha=Math.sqrt(F*D/A);
 // s=cτ/rg and x=r/rg are dimensionless.
 const u=(S*dR+C*dZ)/c,v=(C*dR-S*dZ)/(c*x),du=(S*ddR+C*ddZ)*rg/(c*c)+x*v*v,dv=(C*ddR-S*ddZ)*rg/(x*c*c)-2*u*v/x;
 const ur=hR*u,ut=hT*v,k=Math.hypot(ur,ut),gamma=Math.hypot(1,k),speed=c*(k/gamma);
 const dlogHR=.5*((Fx-Dx)*u+Ft*v),dlogHT=.5*(Fx*u+Ft*v);
 const dur=hR*du+ur*dlogHR,dut=hT*dv+ut*dlogHT;
 // Spatial four-acceleration u^ν∇νu^μ for the reduced diagonal metric
 // (-alpha², F/D, F). The azimuthal covector vanishes because L_z=0.
 const ar=hR*(du+.5*(Fx-Dx)*u*u+Ft*u*v-.5*Fx*D*v*v)+gamma*gamma*gradX/hR;
 const at=hT*(dv+.5*Ft*v*v+Fx*u*v-.5*Ft/D*u*u)+gamma*gamma*gradT/hT;
 const parallel=k?(ar*ur+at*ut)/k:0,perp=k?(ar*ut-at*ur)/k:Math.hypot(ar,at),unit=c*c/(rg*g0);
 const load=unit*Math.hypot(perp,parallel/gamma);
 // The separate trajectory readout is d²(R,Z)/dt² in the plotted meridian
 // for distant clock t, distinct from the accelerated observer's proper load.
 const dt=gamma/alpha,dlogDt=(ur*dur+ut*dut)/(gamma*gamma)-gradX*u-gradT*v;
 const aR=(ddR-dR*dlogDt*c/rg)/(dt*dt*g0),aZ=(ddZ-dZ*dlogDt*c/rg)/(dt*dt*g0);
 return {speedMetersPerSecond:speed,kinematicFactor:gamma,kinematicExcess:k*(k/(1+gamma)),crewLoadG:load,requiredSupportG:load,
  accelerationG:Math.hypot(aR,aZ),radialAccelerationG:S*aR+C*aZ,tangentialAccelerationG:C*aR-S*aZ};
}
