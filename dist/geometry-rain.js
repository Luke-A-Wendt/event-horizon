// Equatorial geodesics dropped from rest at infinity, E=1, Lz=Q=0. Use
// Doran time T (proper time along the rain), Boyer–Lindquist r, and the
// polar angle of ingoing Kerr–Schild Cartesian x,y. Neither speed of the
// plotted coordinates nor curvature of the drawn track measures proper g.
export const RAIN_TWIST_GAIN=6;
const rainLightSpeed=18;
// A bounded polynomial for 3 integral_0^1 dt/[s(1+s)], s=sqrt(1+u*t^4).
// It removes the large-r singularity from the radial time primitive. The
// maximum error is 1e-11 over exterior u=(a/r)^2 in [0,1].
const coeff=[1.499999999991965,-.22499999847051935,.10416659502113843,-.0630994958346985,.04341186733524978,-.03211253622463796,.024611030485136687,-.018625117804909,.012936385269346682,-.00749833167425901,.0032418561121396743,-.0008989192537327519,.00011756607739710051];
function radialIntegral(r,a){
 if(!a)return r**1.5;
 const u=(a/r)**2;let p=0;for(let i=coeff.length-1;i>=0;i--)p=coeff[i]+u*p;
 return r**1.5*(1+u*p);
}
// Gauss–Legendre on x=sqrt(M/r) in [0,1]. For Kerr–Schild Cartesian
// azimuth psi, dpsi/dr = -a*w/[(r²+a²)(1+w)], w=sqrt(2Mr/(r²+a²)).
// This regular expression also applies at r+. It includes the conversion
// from the ingoing oblate azimuth to the Cartesian polar angle.
const abscissa=[.0198550717512319,.101666761293187,.237233795041836,.408282678752175,.591717321247825,.762766204958164,.898333238706813,.980144928248768];
const weights=[.0506142681451881,.111190517226687,.156853322938944,.181341891689181,.181341891689181,.156853322938944,.111190517226687,.0506142681451881];
function psiIntegral(x,spin){
 if(!spin)return 0;
 let sum=0;
 for(let i=0;i<abscissa.length;i++){const k=x*abscissa[i],b=1+(spin*k*k)**2;sum+=weights[i]*k*k/(b*(Math.sqrt(b)+Math.SQRT2*k));}
 return 2*Math.SQRT2*spin*x*sum;
}
export function geometryRainConstants(start,mass,spin){
 return [spin,mass/start,radialIntegral(1,spin*mass/start),psiIntegral(Math.sqrt(mass/start),spin)];
}
export function geometryRainLabel(r,start,mass,spin){
 const a=spin*mass/start;
 return radialIntegral(r/start,a)/radialIntegral(1,a);
}
export function geometryRainRadius(label,start,end,mass,spin){
 if(!spin)return start*label**(2/3);
 const a=spin*mass/start,H=label*radialIntegral(1,a),floor=end/start;
 let r=Math.max(floor,H**(2/3));
 for(let i=0;i<8;i++){const correction=(radialIntegral(r,a)-H)/(1.5*Math.sqrt(r)/Math.hypot(1,a/r));r=Math.max(floor,r-correction);if(Math.abs(correction)<1e-14*r)break;}
 return r*start;
}
export function geometryRainPeriod(startRadius,endRadius,mass,spin=0){
 const a=spin*mass/startRadius;
 return (radialIntegral(1,a)-radialIntegral(endRadius/startRadius,a))*startRadius**1.5/(1.5*rainLightSpeed*Math.sqrt(2*mass));
}
function rainCyclePhase(elapsed,period){
 const cycles=Math.max(0,elapsed)/period,nearest=Math.round(cycles);
 return Math.abs(cycles-nearest)<=Math.min(2e-11,32*Number.EPSILON*Math.max(1,cycles))?0:cycles-Math.floor(cycles);
}
export function geometryRainTwist(radius,startRadius,mass,spin){
 return psiIntegral(Math.sqrt(mass/startRadius),spin)-psiIntegral(Math.sqrt(mass/radius),spin);
}
export function geometryRainPose(elapsed,startRadius,endRadius,mass,spin=0){
 const period=geometryRainPeriod(startRadius,endRadius,mass,spin);
 if(!(period>0)||!Number.isFinite(period))return {radius:startRadius,angle:0,radialSpeed:0,angularSpeed:0,period:Infinity};
 const phase=rainCyclePhase(elapsed,period),last=geometryRainLabel(endRadius,startRadius,mass,spin);
 const radius=geometryRainRadius((1-phase)+phase*last,startRadius,endRadius,mass,spin);
 const a=spin*mass,v=Math.sqrt(2*mass/radius),u=a/radius,q=Math.hypot(1,u),w=v/q;
 const radialSpeed=-rainLightSpeed*v*q,angularSpeed=radialSpeed*u/radius*w/(q*q*(1+w));
 return {radius,angle:geometryRainTwist(radius,startRadius,mass,spin),radialSpeed,angularSpeed,period};
}
// Evaluate the same proper-time & azimuth primitives once at a sheet crossing,
// not in the ray march. The other scenes and zero-spin sheet skip this math.
const f=x=>x.toFixed(16);
export const RAIN_PRIMITIVES_GLSL=`
float rainRadial(float r,float a){
 float u=(a/r)*(a/r),P=${coeff.reduceRight((result,n)=>result?f(n)+'+u*('+result+')':f(n),'')};
 return r*sqrt(r)*(1.0+u*P);
}
float rainAzimuthTerm(float x,float spin){float z=spin*x*x,b=1.0+z*z;return x*x/(b*(sqrt(b)+1.41421356237*x));}
float rainPsi(float x,float spin){return 2.82842712475*spin*x*(${weights.map((v,i)=>f(v)+'*rainAzimuthTerm(x*'+f(abscissa[i])+',spin)').join('+')});}
`;
export function geometryRainChart(r){
 if(r.sceneId!=='geometry-orbit'&&r.sceneId!=='geometry-freefall'&&r.sceneId!=='geometry-freefall-kerr')return null;
 const c=r.objectFrames?.find(o=>o.rainChart)?.rainChart;
 if(!c||!(c.startRadius>c.endRadius&&c.endRadius>0&&c.mass>0))return null;
 const period=geometryRainPeriod(c.startRadius,c.endRadius,c.mass,c.spin);
 return {...c,phase:rainCyclePhase(c.elapsed,period),azimuth:c.azimuth||0};
}
