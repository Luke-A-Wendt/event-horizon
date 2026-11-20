// Equatorial timelike Kerr geodesic (G=M=c=1 internally): an unpowered
// particle released at rest relative to a locally nonrotating observer at r0.
// Lz=Q=0, E=alpha(r0); dt/dtau=E/alpha² and dphi/dt is the ZAMO drag.
// Local speed is relative to that observer, not the Boyer–Lindquist dr/dt.
const c=299792458,bins=96,cache=new Map();
const nodes=[.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const weights=[.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];

function state(p,w){
 const {a,a2,x0,gap0,root,sep,E,k,H0}=p;
 const t=Math.tanh(w),delta=gap0/Math.cosh(w)**2,x=root+delta,inner=sep+delta;
 const H=x*x+a2+2*a2/x,D=delta*inner,alpha=Math.sqrt(D/H);
 // E²H−Δ vanishes at release. Factor it rather than subtracting nearly equal values.
 const B=k*x-4*a2/(x0*H0)+2*E*E*a2/(x*x0),diff=gap0*t*t*B;
 const uRadial=-Math.sqrt(diff)/x,omega=2*a/(x*H);
 const gamma=E/alpha,q=gamma/alpha;
 const kinExcess=(diff/D)/(1+gamma);
 const gravExcess=(2*(x+a2/x)/H)/((1+alpha)*alpha);
 // dr/dw and dr/dtau both vanish at release; their ratio here is regular there.
 const tauW=2*delta*x/Math.sqrt(gap0*B);
 // Polar chart acceleration describes the plotted curve, never felt load.
 const Hp=2*x-2*a2/(x*x),logQp=Hp/H-2*(x-1)/D,vr=uRadial/q;
 const ur2=diff/(x*x),rTT=((1-k*x-E*E*a2/(x*x))/(x*x)-ur2/x-ur2*logQp)/(q*q);
 return {x,delta,alpha,gamma,q,uRadial,omega,tauW,kinExcess,gravExcess,
  chartRadial:rTT-x*omega*omega,chartTangential:vr*omega*(1-x*Hp/H),
  beta:Math.min(1,Math.sqrt(diff/H)/E),drW:-2*delta*t,
  lagW:tauW*(gravExcess+kinExcess/alpha),phiW:tauW*q*omega};
}
function integrals(p,lo,hi){
 const mid=(lo+hi)/2,d=(hi-lo)/2,v=[0,0,0];
 if(d===0)return v;
 for(let n=0;n<4;n++)for(const sign of [-1,1]){
  const y=state(p,mid+sign*d*nodes[n]),k=d*weights[n];
  v[0]+=k*y.tauW;v[1]+=k*y.lagW;v[2]+=k*y.phiW;
 }
 return v;
}
function plan(rg,a,start,end){
 if(!(rg>0&&Number.isFinite(rg)&&Number.isFinite(a)&&Math.abs(a)<=1&&start>end&&Number.isFinite(start)&&Number.isFinite(end)))return null;
 const d=Math.sqrt((1-a)*(1+a)),root=1+d,x0=start/rg;
 // Keep the exterior gap as a difference in SI units before normalizing.
 const gap0=(start-root*rg)/rg,gap1=(end-root*rg)/rg;
 if(!(gap1>0&&gap0>gap1))return null;
 const a2=a*a,H0=x0*x0+a2+2*a2/x0,E=Math.sqrt(gap0*(gap0+2*d)/H0);
 const p={a,a2,x0,root,sep:2*d,gap0,E,k:2*(x0+a2/x0)/H0,H0,W:Math.acosh(Math.sqrt(gap0/gap1)),rows:[[0,0,0]]};
 for(let i=0;i<bins;i++){
  const inc=integrals(p,p.W*i/bins,p.W*(i+1)/bins);
  p.rows.push(inc.map((value,n)=>value+p.rows[i][n]));
 }
 return p;
}

// This angle is the camera guide's apparent-capture approximation, evaluated
// with atan2 so its slope stays regular through the photon-sphere radius.
function limb(r){return Math.atan2(Math.sqrt(27*r),(r-3)*Math.sqrt(r+6));}
function visualPace(p,f){
 if(!p.visual){
  const theta0=limb(p.x0),thetaSpan=Math.max(1e-20,limb(state(p,p.W).x)-theta0),logSpan=2*Math.log(Math.cosh(p.W));
  const az=Math.abs(p.rows[bins][2]),azScale=Math.max(1,az),radSpan=p.gap0*(Math.tanh(p.W)**2),weight=.79+.21*az/azScale;
  // Give the long radial approach, growth of the shadow, and near-horizon
  // sweep some screen time. None of the weights enter the geodesic or clocks.
  p.visual=p.rows.map((row,i)=>{
   const w=p.W*i/bins,y=state(p,w),x=y.x,t=Math.tanh(w);
   const P=(.5*p.gap0*t*t/radSpan+.2*(limb(x)-theta0)/thetaSpan+.09*2*Math.log(Math.cosh(w))/logSpan+.21*Math.abs(row[2])/azScale)/weight;
   const limbSlope=-Math.sqrt(27*x)*(x*x+3*x+9)/(x*Math.sqrt(x+6)*(x*x*x+54));
   const dP=(-.5*y.drW/radSpan+.2*limbSlope*y.drW/thetaSpan+.18*t/logSpan+.21*Math.abs(y.phiW)/azScale)/weight;
   return [i===0?0:i===bins?1:P,dP];
  });
 }
 if(f<=0)return [0,0];if(f>=1)return [1,0];
 const ramp=.065,top=1/(1-ramp),end=Math.min(f,1-f),angle=Math.PI*end/ramp;
 const tail=end<ramp?top*(end-ramp*Math.sin(angle)/Math.PI)/2:top*(end-ramp/2);
 const target=f<=.5?tail:1-tail,rate=end<ramp?top*(1-Math.cos(angle))/2:top;
 const table=p.visual;let low=0,high=bins;
 while(high-low>1){const mid=(low+high)>>1;if(table[mid][0]<target)low=mid;else high=mid;}
 // Invert a cubic with the physical derivatives at adjacent cached samples.
 // Its continuous slope avoids jumps in apparent speed at table boundaries.
 const step=p.W/bins,A=table[low][0],D=table[high][0]-A,b=table[low][1]*step,c=3*D-2*b-table[high][1]*step,d=b+table[high][1]*step-2*D;
 let u=Math.min(1,Math.max(0,(target-A)/D)),l=0,h=1;
 for(let i=0;i<20;i++){
  const diff=u*(b+u*(c+d*u))-(target-A);
  if(Math.abs(diff)<1e-15*D)break;
  if(diff<0)l=u;else h=u;
  const next=u-diff/(b+u*(2*c+3*d*u));u=next>l&&next<h?next:(l+h)/2;
 }
 return [(low+u)/bins,rate/(bins*(b+u*(2*c+3*d*u)))];
}

export function sampleEquatorialFreefall(rgMeters,spin,startRadiusMeters,endRadiusMeters,fraction,pace='default'){
 const key=[rgMeters,spin,startRadiusMeters,endRadiusMeters].join(':');
 let p=cache.get(key);
 if(!p){p=plan(rgMeters,spin,startRadiusMeters,endRadiusMeters);if(!p)return null;
  if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(key,p);}
 if(!Number.isFinite(fraction))return null;
 // Playback is a reparameterization, not coordinate or proper time. This
 // resolves the exterior approach while keeping the release and cutoff finite.
 const f=Math.min(1,Math.max(0,fraction));
 // Cosine ramps in the playback parameter leave zero camera velocity at the
 // freeze. Do not change the physical, incoming local speed or clock there.
 const up=.65,down=.08,top=1/(1-(up+down)/2);
 let s,ds;
 if(pace==='visual'){[s,ds]=visualPace(p,f);}
 else if(f<up){const angle=Math.PI*f/up;s=top*(f-up*Math.sin(angle)/Math.PI)/2;ds=top*(1-Math.cos(angle))/2;}
 else if(f<=1-down){s=top*(f-up/2);ds=top;}
 else{const tail=1-f,angle=Math.PI*tail/down;s=1-top*(tail-down*Math.sin(angle)/Math.PI)/2;ds=top*(1-Math.cos(angle))/2;}
 const w=p.W*s,dw=p.W*ds;
 const y=state(p,w),i=Math.min(bins-1,Math.floor(s*bins));
 const cum=f===1?p.rows[bins]:integrals(p,p.W*i/bins,w).map((v,n)=>v+p.rows[i][n]);
 const seconds=rgMeters/c,properSeconds=cum[0]*seconds,lagSeconds=cum[1]*seconds;
 return {radiusMeters:f===0?startRadiusMeters:f===1?endRadiusMeters:y.x*rgMeters,azimuth:cum[2],
  properSeconds,lagSeconds,coordinateSeconds:properSeconds+lagSeconds,
  properSecondsPerFraction:y.tauW*seconds*dw,radialMetersPerFraction:y.drW*rgMeters*dw,azimuthPerFraction:y.phiW*dw,
  radialAcceleration:y.chartRadial*c/seconds,tangentialAcceleration:y.chartTangential*c/seconds,
  speedMetersPerSecond:y.beta*c,radialSpeedMetersPerSecond:y.uRadial/y.q*c,angularVelocity:y.omega/seconds,
  kinematicFactor:y.gamma,kinematicExcess:y.kinExcess,gravityFactor:1/y.alpha,gravityExcess:y.gravExcess,
  rateFactor:y.q,properRate:1/y.q,crewLoadG:0,feltParallel:0,feltPerp:0};
}
