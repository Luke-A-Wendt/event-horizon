// Equatorial test-particle worldlines in Boyer–Lindquist coordinates.
// Metric formulas use G=M=c=1 internally; rg and the public API are SI.
import {REFERENCE_RG_METERS} from './objects.js';
const c=299792458,g=9.80665,BINS=128;
export function edgeKerrMetric(r,craft,parentId){
 return r.sceneId==='nasa-shuttle'&&craft?.type==='shuttle'&&parentId==='primary'&&r.state.blackHole&&!r.state.binary
  ?{rg:r.massScale*REFERENCE_RG_METERS,spin:r.state.spin}:null;
}
function geometry(x,a){
 const x2=x*x,D=x2-2*x+a*a,H=x2+a*a+2*a*a/x,G=x2/D;
 const omega=1/(x*Math.sqrt(x)+a),omegaX=-1.5*Math.sqrt(x)*omega*omega;
 const drag=2*a/(x*H),lapse=Math.sqrt(D/H);
 return {D,H,G,omega,omegaX,lapse,vphi:(omega-drag)*Math.sqrt(H)/lapse};
}
export function kerrCircularState(m,r){
 const z=geometry(r/m.rg,m.spin),gamma=1/Math.sqrt(1-z.vphi*z.vphi);
 return {speed:c*z.vphi,omega:c*z.omega/m.rg,rate:gamma/z.lapse};
}
// Return the same worldline to the animation and the clocks. The radius in
// the playlist is cylindrical; the Kerr coordinates of its centerline are
// r=hypot(rho,z), cos(theta)=z/r. Positive omega is prograde in scene axes.
export function crewParkingCircle(rg,spin,rho,height,isco){
 const r=Math.hypot(rho,height),x=r/rg;
 if(!(r>0&&rho>0&&rg>0))return null;
 if(height===0&&x>=isco)return {...kerrCircularState({rg,spin},rho),freeOrbit:true};
 const cos=height/r,sin=rho/r,a=spin/x,sigma=1+a*a*cos*cos;
 const q=Math.sqrt((1-spin)*(1+spin)),delta=(1-(1+q)/x)*(1-(1-q)/x);
 if(!(delta>0))return null;
 const area=(1+a*a)*sigma+2*a*a*sin*sin/x,alpha=Math.sqrt(sigma*delta/area);
 const hPhi=r*Math.sqrt(area/sigma)*sin,drag=2*spin*c/(rg*x*x*x*area);
 // Supported diagnostic circles inherit the equatorial orbital speed at
 // the same radius (at the ISCO for all smaller radii). Project it onto
 // the parallel of latitude. This continuous, explicitly prescribed local
 // speed is timelike and vanishes on the axis, unlike Ω∝rho^(-3/2).
 const circular=kerrCircularState({rg,spin},Math.max(r,isco*rg));
 const speed=circular.speed*sin,omega=drag+speed*alpha/hPhi;
 return {omega,speed,rate:1/(alpha*Math.sqrt((1-speed/c)*(1+speed/c))),freeOrbit:false};
}
const ease=u=>u**3*(10+u*(-15+6*u));
function at(p,u){
 const m=p.kerr,a=m.spin,L=p.logRatio,r=u<=.5?p.ra*Math.exp(L*ease(u)):p.rb*Math.exp(-L*ease(1-u)),x=r/m.rg;
 const T=p.coordinateSeconds*c/m.rg,k=L*30*u*u*(1-u)*(1-u)/T,s=x*k;
 const sdot=x*(k*k+L*60*u*(1-u)*(1-2*u)/(T*T));
 const {H,D,G,omega,omegaX,lapse,vphi}=geometry(x,a),vr=s*Math.sqrt(G)/lapse;
 const beta2=vr*vr+vphi*vphi,F=lapse*lapse*(1-beta2);
 if(!(F>0))return null;
 const U=1/Math.sqrt(F),gamma=U*lapse,ell=-2*a/x+H*omega,Hp=2*x-2*a*a/(x*x);
 const Gp=G*(2/x-(2*x-2)/D);
 // Circular omega solves g_tt,r + 2 Omega g_tphi,r + Omega² g_phiphi,r=0.
 // This cancellation leaves only radial drift and changing angular momentum.
 const Fdot=-2*ell*omegaX*s-Gp*s*s*s-2*G*s*sdot,Udot=-.5*U*Fdot/F;
 const ellDot=s*(2*a/(x*x)+Hp*omega+H*omegaX);
 const Ar=U*(Udot*G*s+U*(G*sdot+.5*Gp*s*s))/Math.sqrt(G);
 const Ap=U*(Udot*ell+U*ellDot)/Math.sqrt(H);
 // Spatial four-acceleration in the ZAMO tetrad -> ship rest frame by
 // inverse boost, preserving the radial and azimuthal engine components.
 const conv=c*c/m.rg,par=(vr*Ar+vphi*Ap)*gamma/(gamma+1);
 const fr=(Ar-vr*par)*conv,fp=(Ap-vphi*par)*conv,speed=c*Math.sqrt(beta2);
 return {r,chartVr:c*s,chartVphi:r*omega*c/m.rg,vr:c*vr,vt:c*vphi,speed,omega:omega*c/m.rg,proper:1/U,localPath:speed*lapse,
         fr,fp,radialAcceleration:conv*(sdot-x*omega*omega),tangentialAcceleration:conv*s*(2*omega+x*omegaX),load:Math.hypot(fr,fp)/g};
}
function integrate(p,l,h){
 const mid=(l+h)/2,d=(h-l)*Math.sqrt(.6)/2,ys=[at(p,mid-d),at(p,mid),at(p,mid+d)],w=(h-l)*p.coordinateSeconds/18;
 return ['omega','localPath','proper'].map(key=>w*(5*(ys[0][key]+ys[2][key])+8*ys[1][key]));
}
export function kerrRadiusPlan(ra,rb,m){
 if(!(ra>0&&rb>0&&ra!==rb))return {error:'Choose two distinct stable orbital radii.'};
 const rad=ra<rb?ra:rb,x=rad/m.rg;
 if(!(x>1&&1-6/x+8*m.spin/x**1.5-3*(m.spin/x)**2>0))return {error:'This radius is inside the stable circular-orbit limit.'};
 const p={type:'shuttle',radiusTransfer:true,kerr:m,ra,rb,height:0,mu:c*c*m.rg,logRatio:Math.log(rb/ra),initialSpeed:kerrCircularState(m,ra).speed,finalSpeed:kerrCircularState(m,rb).speed,outward:rb>ra,warpFactor:0,nominallyFeasible:true,accelerationMetersPerSecondSquared:g,coordinateSeconds:Math.max(1,Math.sqrt(Math.abs(rb-ra)/g),Math.abs(kerrCircularState(m,ra).speed-kerrCircularState(m,rb).speed)/g)};
 // Increase physical flight time, not thrust. Dense sampling of the smooth
 // polynomial profile, with a 2% operating margin to cover intermediate peaks.
 for(let trial=0;trial<32;trial++){
  let peak=0;for(let i=0;i<=BINS*4;i++){const b=at(p,i/(BINS*4));peak=Math.max(peak,b?.load??Infinity);}
  if(peak<=.98){p.peakThrustG=peak;break;}
  p.coordinateSeconds*=Number.isFinite(peak)?Math.min(3,Math.max(1.015,Math.sqrt(peak/.975))):3;
 }
 if(p.peakThrustG===undefined)return {error:'No timelike transfer within the 1g engine limit was found.'};
 const rows=p.spiralTable=[[0,0,0]];for(let i=0;i<BINS;i++){
  const d=integrate(p,i/BINS,(i+1)/BINS);rows.push(d.map((v,j)=>rows[i][j]+v));
 }
 const end=rows.at(-1);p.distanceMeters=end[1];p.properSeconds=end[2];p.dilationSeconds=p.coordinateSeconds-end[2];return p;
}
export function sampleKerrRadius(p,u){
 u=Math.max(0,Math.min(1,u));const b=at(p,u),i=Math.min(BINS,Math.floor(u*BINS)),row=p.spiralTable[i],time=u*p.coordinateSeconds;
 const [angle,distance,proper]=u===i/BINS?row:integrate(p,i/BINS,u).map((v,j)=>row[j]+v);
 return {chartVr:b.chartVr,chartVphi:b.chartVphi,angle,radius:b.r,coordinateSeconds:time,properSeconds:proper,dilationSeconds:time-proper,distanceMeters:distance,distanceFraction:distance/p.distanceMeters,fraction:proper/p.properSeconds,
  radialVelocity:b.vr,tangentialVelocity:b.vt,speedMetersPerSecond:b.speed,radialThrust:b.fr,tangentialThrust:b.fp,normalThrust:0,requiredSupportG:b.load,commandedThrustG:b.load,steadySupportRadial:0,steadySupportNormal:0,maneuverRadialThrust:b.fr,coordinateClockRate:1/b.proper,
  radialAcceleration:b.radialAcceleration,tangentialAcceleration:b.tangentialAcceleration,radialAccelerationG:b.radialAcceleration/g,tangentialAccelerationG:b.tangentialAcceleration/g,accelerationG:Math.hypot(b.radialAcceleration,b.tangentialAcceleration)/g,
  rapidity:Math.atanh(b.speed/c),lorentzFactor:1/Math.sqrt(1-(b.speed/c)**2),accelerationSign:Math.sign(b.fp),turnAngle:0,phase:p.outward?'Raising orbit':'Lowering orbit',phaseIndex:p.outward?1:3};
}
