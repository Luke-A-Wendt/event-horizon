import { RAIN_TWIST_GAIN, RAIN_PRIMITIVES_GLSL } from './geometry-rain.js';
// A lensed coordinate guide, not a material fabric or a spatial embedding.
// Schwarzschild admits spatially flat Painleve–Gullstrand slices. Their radial
// free-fall flow motivates the moving markers below. The spin cue and binary
// superposition are illustrations, not an exact Kerr/binary coordinate chart.
export const GRID_DISPLAY_FLOW = 2;
// The orbital integrator advances world coordinates in units with c = 18.
// Weak-field tracer motion uses that SAME clock, never a separate animation rate.
export const ORBITAL_WORLD_SPEED = 18;
export function weakGridFlowWindow(radius, mass) {
 return mass>0&&radius>0 ? 12*Math.sqrt(radius*radius*radius/mass)/ORBITAL_WORLD_SPEED : 0;
}
export function weakGridMaterialRadius(radius, mass, time) {
 return Math.pow(Math.pow(Math.max(0,radius),1.5)+1.5*ORBITAL_WORLD_SPEED*Math.sqrt(2*Math.max(0,mass))*Math.max(0,time),2/3);
}
export function weakGridTracerRadius(label, mass, time) {
 const remaining=Math.pow(Math.max(0,label),1.5)-1.5*ORBITAL_WORLD_SPEED*Math.sqrt(2*Math.max(0,mass))*Math.max(0,time);
 return remaining>0?Math.pow(remaining,2/3):0;
}

// Public numerical counterparts support independent conservation/limit checks.
export function gridMaterialRadius(radius, time, speed = GRID_DISPLAY_FLOW) {
  return Math.pow(Math.pow(Math.max(radius, 0), 1.5) + 1.5 * Math.SQRT2 * speed * Math.max(time, 0), 2 / 3);
}
export function gridOutflowLabel(radius, time, speed = GRID_DISPLAY_FLOW) {
  const label=Math.pow(Math.max(radius,0),1.5)-1.5*Math.SQRT2*speed*Math.max(time,0);
  return Math.sign(label)*Math.pow(Math.abs(label),2/3);
}
export function gridInfallVelocity(radius, speed = GRID_DISPLAY_FLOW) {
  return -speed * Math.sqrt(2 / Math.max(radius, Number.MIN_VALUE));
}
export function gridSpinAngularRate(radius, spin) {
  return 2 * spin / (1 + Math.pow(Math.max(radius, 0), 3));
}

// Subdivide the existing Cartesian line, concentrating vertices near the
// material label that currently maps to the horizon. Off-center cameras keep
// the same world anchor. The far field retains the inexpensive coarse mesh.
export function compactGridLineSamples(extent,count,fixed,alongCenter,mass,horizon,time,outflow=false){
 const radius=Math.max(horizon/mass,0),flow=(outflow?-1:1)*1.5*Math.SQRT2*GRID_DISPLAY_FLOW*time;
 const shell=mass*Math.cbrt((radius**1.5+flow)**2),reach=shell+8*mass;
 const positions=[];
 const addSpan=(a,b,depth)=>{
  const lo=alongCenter+a,hi=alongCenter+b,near=Math.hypot(fixed,Math.max(0,lo,-hi));
  if(near<reach&&depth<5&&b-a>Math.max(.12*mass,(near-shell)*.20)){const mid=(a+b)*.5;addSpan(a,mid,depth+1);addSpan(mid,b,depth+1);}
  else positions.push(a);
 };
 for(let i=-count;i<count;i++)addSpan(i*extent/count,(i+1)*extent/count,0);
 positions.push(extent);return positions;
}

export function coordinateGridGLSL({ warp = false, anomaly = false, lensedGrid = false, derivatives = false } = {}) {
  return `
// A single, continuous sheet. The binary orbit lies in the world XZ plane;
// using its plane rather than the primary spin plane keeps BOTH centers on it.
// Spin axes are normalized once by the CPU; avoid normalizing per ray step.
vec3 coordinateGridNormal(){return uBinary==1?vec3(0,1,0):uPrimaryAxis;}
vec3 coordinateGridChart(vec3 p){return uBinary==1?p:localPoint(p,uPrimaryAxis);}
// CPU double precision splits the world anchor into an exact coarse cell
// index and a small residual. The ray and intersection remain render-relative.
// Fine grids never evaluate fract() on astronomical coordinates.
uniform vec4 uGridAnchor;
uniform vec2 uGridHigh;
uniform float uGridFlowWindow;
uniform vec4 uRainOrigin; // rebased center xyz, launch radius (zero outside the three rain studies)
uniform vec4 uRainFlow;   // surface label, surface radius / launch radius, radial phase, launch azimuth
uniform vec4 uRainKerr;  // signed spin, M/launch radius, launch time primitive, launch Cartesian azimuth primitive
float coordinateGridScale(){return max(uGridAnchor.w,1e-20);}
float coordinateGridSheet(vec3 p){return dot(p,coordinateGridNormal())-uGridAnchor.z;}

// Return (1+x)^(2/3)-1 without subtracting nearly equal large radii.
// The series is essential in the asymptotically flat field, including t=0.
float gridRadialDelta(float radius,float flow){
 float x=flow/max(radius*sqrt(radius),1e-30);
 if(abs(x)<.02)return x*(.666666667+x*(-.111111111+x*.049382716));
 float label=1.0+x;return sign(label)*pow(abs(label),.666666667)-1.0;
}

${anomaly?'vec2 anomalyStrokeJacobian=vec2(1.0);':''}
vec3 coordinateGridCoordinates(vec3 p,float weakFlowTime){
 vec3 displaced=p;float stretch=1.0;
 ${anomaly?`
 // Estimate the chart's actual local Jacobian once per sheet crossing. A
 // fixed global stretch smears even the undisturbed grid into broad ribbons.
 vec3 offset=anomalyGridOffset(p);
 vec3 gy=coordinateGridNormal(),gx=unit(cross(gy,abs(gy.z)>.9?vec3(1,0,0):vec3(0,0,1))),gz=cross(gx,gy);
 float delta=max(coordinateGridScale()*.018,1e-18);
 vec2 dx=coordinateGridChart(gx+(anomalyGridOffset(p+gx*delta)-offset)/delta).xz;
 vec2 dz=coordinateGridChart(gz+(anomalyGridOffset(p+gz*delta)-offset)/delta).xz;
 anomalyStrokeJacobian=clamp(sqrt(dx*dx+dz*dz),vec2(.35),vec2(12.0));
 displaced+=offset;`:''}
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;
  if(k==1&&uBinary==0)break;
  if(uHoles[k].w<=0.0)continue;
  float m=max(uHoles[k].w,1e-12);
  vec3 relative=(p-uHoles[k].xyz)/m;
  float r=max(length(relative),max(horizonFor(k)/m,1e-3));
  // The material label R is constant on a radially falling marker:
  // R^(3/2)=r^(3/2)+(3/2)*sqrt(2)*s*t, dr/dt=-s*sqrt(2/r).
  float flow=(whiteFor(k)>.5?-1.0:1.0)*${(1.5 * Math.SQRT2 * GRID_DISPLAY_FLOW).toFixed(9)}*max(uTime,0.0);
  float delta=gridRadialDelta(r,flow),expansion=1.0+delta,material=r*expansion;
  float angle=-2.0*spinFor(k)*uTime/(1.0+r*r*r);
  float c=cos(angle),s=sin(angle);vec3 axis=axisFor(k);
  vec3 rotationDelta=relative*(c-1.0)+cross(axis,relative)*s+axis*dot(axis,relative)*(1.0-c);
  displaced+=(relative*delta+rotationDelta*expansion)*m;
  // Outgoing labels pass through zero as new markers emerge. Account
  // for their radial Jacobian as well as angular stretch so this continuous
  // chart does not alias into a bright unresolved ring at that boundary.
  float radialStretch=sqrt(r/max(abs(material),.0001));
  stretch=max(stretch,max(abs(expansion),radialStretch)*(1.0+min(abs(angle)*3.0,8.0)));
 }
 if(uMetricOptions.y>0.0&&uWarpFlags.w>.5&&uBinary==1&&uHoles[0].w>0.0&&uHoles[1].w>0.0){
  // An amplified retarded quadrupole strain cue, NOT numerical relativity.
  // The plus/cross pattern stretches perpendicular directions oppositely;
  // its bounded envelope leaves the distant reference chart flat.
  vec3 center=(uHoles[0].xyz+uHoles[1].xyz)*.5;
  float scale=max(uHoles[0].w+uHoles[1].w,1e-12);
  vec3 q=(p-center)/scale;float radius=length(q.xz);
  float separation=length(uHoles[1].xyz-uHoles[0].xyz)/scale;
  float phase=2.0*(atan(uHoles[1].z-uHoles[0].z,uHoles[1].x-uHoles[0].x)-radius*.35*uMetricOptions.z);
  float front=smoothstep(.5,2.0,radius)*(1.0-smoothstep(32.0,96.0,radius));
  float strain=min(.32,uMetricOptions.y*.24)*front/(1.0+radius*.09)*min(1.0,separation*.5);
  vec2 wave=mat2(cos(phase),sin(phase),sin(phase),-cos(phase))*q.xz*strain;
  displaced+=vec3(wave.x,0,wave.y)*scale;
  stretch=max(stretch,1.0+strain*(1.0+radius*.7*uMetricOptions.z));
 }
 ${warp ? `
 // The tiny ship field deforms the same world-anchored coordinates. It does
 // not spawn a second world plane or a patch with a visible boundary.
 if(uWarpFlags.x>.5&&uWarpObjectIndex>=0&&!localWarpPass()&&uWarpRadius>1e-20){
  vec3 relative=(p-uWarpCenter)/uWarpRadius;
  float radius=length(relative);
  // warpShape already tends exponentially to zero; this guard only skips
  // values below float precision, avoiding exp work over the far field.
  if(radius<20.0){
   vec3 axis=unit(uWarpAxis);float shape=warpShape(radius).x;
   displaced+=axis*(.20*uWarpStrength*dot(relative,axis)*shape*uWarpRadius);
   stretch=max(stretch,1.0+.20*uWarpStrength*shape);
  }
 }
 ` : ''}
 if(uWarpFlags.w<.5){
  // Radial free-fall chart labels use the exact clock conversion of orbitalOmega:
  // q=r/scale, m=M/scale, dq/dt=-(18/scale)*sqrt(2m/q).
  // This coordinate flow is not a changing gravitational field or material drag.
  float scale=coordinateGridScale();
  for(int j=0;j<12;j++){
   if(j>=uObjectCount)break;float type=uColors[j].a;if(type>.5&&!(type>1.5&&type<2.5))continue;
   float m=max(0.0,uBodyMasses[j]/4300000.0)/scale;
   vec3 relative=(p-uObjects[j].xyz)/scale;float r=max(length(relative),max(uObjects[j].w/scale,.00001));
   float flowTime=${ORBITAL_WORLD_SPEED.toFixed(1)}*max(weakFlowTime,0.0)/scale;
   float delta=gridRadialDelta(r,1.5*sqrt(2.0*m)*flowTime),expansion=1.0+delta;
   displaced+=relative*delta*scale;
   // Tangential and radial Jacobians keep moving lines antialiased at every zoom.
   stretch=max(stretch,max(expansion,inversesqrt(max(expansion,.0001))));
  }
 }
 vec3 chart=coordinateGridChart(displaced)/coordinateGridScale();
 return vec3(chart.x+uGridAnchor.x,chart.z+uGridAnchor.y,stretch);
}

float coordinateGridLines(vec2 point,float spacing,vec2 width){
 // uGridHigh contains integer multiples of 1024 base cells. Reducing it
 // modulo this power-of-two spacing preserves the world anchor at every LOD.
 float baseSpacing=.75/uGridDensity.x;
 vec2 phase=mod(uGridHigh,vec2(floor(spacing/baseSpacing+.5)))*baseSpacing;
 vec2 cell=abs(fract((point+phase)/spacing+.5)-.5)*spacing;
 vec2 lines=1.0-smoothstep(width,width*2.0,cell);
 return max(lines.x,lines.y);
}

vec4 coordinateGridStroke(vec3 coordinates,vec3 direction,float travelled,float pixelAngle){
 float incidence=abs(dot(direction,coordinateGridNormal()));
 float footprint=max(.0015,travelled*pixelAngle/coordinateGridScale());
 // Project each coordinate direction separately. A scalar 1/cos incidence
 // footprint incorrectly expands transverse strokes into huge bright columns
 // near the horizon, even though only the depth direction is foreshortened.
 vec2 slope=coordinateGridChart(direction).xz/max(incidence,.035);
 vec2 axisFootprint=footprint*coordinates.z*sqrt(vec2(1.0)+slope*slope)${anomaly?'*anomalyStrokeJacobian':''};
 float projected=max(axisFootprint.x,axisFootprint.y);
 // Adjacent dyadic grids share every other line. Cross-fading preserves a
 // connected, readable far plane without switching to a separate patch.
 float baseSpacing=.75/uGridDensity.x;
 float minPixels=max(6.0,18.0/uGridDensity.x);
 float level=max(0.0,log2(max(1.0,projected*minPixels/baseSpacing)));
 float spacing=baseSpacing*exp2(floor(level));
 vec2 width=max(vec2(.0045/uGridDensity.x),axisFootprint*.48);
 float fine=coordinateGridLines(coordinates.xy,spacing,width);
 float coarse=coordinateGridLines(coordinates.xy,spacing*2.0,width);
 float line=mix(fine,coarse,smoothstep(.12,.88,fract(level)));
 float major=coordinateGridLines(coordinates.xy,spacing*4.0,width*1.25);
 float fade=smoothstep(.012,.075,incidence);
 float intensity=(line*.44+major*.18)*fade*(uSpectrum==5?1.35:1.0);
 // Diagnostic markings keep one consistent color in all spectral views.
 // They are annotations rather than a source of electromagnetic emission.
 return vec4(vec3(.095,.45,.73)*intensity,intensity*.08);
}

${lensedGrid?`
// Different winding orders image different places on the SAME rectangular
// sheet. Keep the material coordinate at each actual crossing until the rays
// have reconverged, so neighbouring fragments can measure its lensed footprint.
vec4 gridFirst=vec4(0),gridSecond=vec4(0),gridThird=vec4(0);
vec3 gridGain=vec3(0);
bool useLensedGrid(){return uSpectrum==5&&uWarpFlags.w>.5&&uBinary==0&&uRainOrigin.w<=0.0&&uMetricOptions.w<.5;}
void recordGridCrossing(vec3 coordinates,vec3 direction,float travelled,float pixelAngle){
 float cosine=abs(dot(direction,coordinateGridNormal()));
 vec2 slope=coordinateGridChart(direction).xz/max(.035,cosine);
 vec2 reference=max(vec2(.0015),travelled*pixelAngle/coordinateGridScale()*coordinates.z*sqrt(vec2(1)+slope*slope));
 vec4 hit=vec4(coordinates.xy,reference);float gain=smoothstep(.012,.075,cosine);
 if(gridFirst.z<=0.0){gridFirst=hit;gridGain.x=gain;}
 else if(gridSecond.z<=0.0){gridSecond=hit;gridGain.y=gain;}
 else if(gridThird.z<=0.0){gridThird=hit;gridGain.z=gain;}
}
// Periodic box integral, in cells. Even when a pixel spans several strokes,
// its value is the covered area rather than an arbitrary on/off point sample.
vec2 gridIntegral(vec2 x,vec2 duty){return floor(x)*duty+clamp(fract(x)-.5*(1.0-duty),vec2(0),duty);}
float filteredGridLines(vec2 chart,float spacing,vec2 halfWidth,vec2 footprint){
 float base=.75/uGridDensity.x;
 vec2 phase=mod(uGridHigh,vec2(floor(spacing/base+.5)))*base;
 vec2 p=fract((chart+phase)/spacing+.5),w=clamp(footprint/spacing,vec2(.002),vec2(64.0));
 vec2 duty=clamp(2.0*halfWidth/spacing,vec2(.002),vec2(.30));
 vec2 cover=clamp((gridIntegral(p+.5*w,duty)-gridIntegral(p-.5*w,duty))/w,0.0,1.0);
 return cover.x+cover.y-cover.x*cover.y;
}
float lensedLayer(vec4 hit,float gain,float order){
 // Unconditional quad derivatives: do not request them from inside a ray
 // loop whose step count or sheet-crossing iteration varies across pixels.
 vec2 footprint=${derivatives?'abs(dFdx(hit.xy))+abs(dFdy(hit.xy))':'hit.zw*(1.0+order*order*10.0)'};
 if(hit.z<=0.0||gain<=0.0)return 0.0;
 float base=.75/uGridDensity.x,nominal=max(hit.z,hit.w);
 float level=max(0.0,log2(max(1.0,nominal*max(6.0,18.0/uGridDensity.x)/base)));
 float spacing=base*exp2(floor(level));
 vec2 halfWidth=max(vec2(.006/uGridDensity.x),hit.zw*.66);
 float fine=filteredGridLines(hit.xy,spacing,halfWidth,footprint);
 float coarse=filteredGridLines(hit.xy,2.0*spacing,halfWidth,footprint);
 float major=filteredGridLines(hit.xy,4.0*spacing,halfWidth*1.25,footprint);
 return gain*(.44*mix(fine,coarse,smoothstep(.12,.88,fract(level)))+.18*major)*1.35;
}
vec4 resolveLensedGrid(){
 float a=lensedLayer(gridFirst,gridGain.x,0.0),b=lensedLayer(gridSecond,gridGain.y,1.0),c=lensedLayer(gridThird,gridGain.z,2.0);
 float light=a+(1.0-.08*a)*(b+(1.0-.08*b)*c);
 return vec4(vec3(.095,.45,.73)*light,.08*light);
}`:''}

// Eulerian sampling of the very same Lagrangian material lines used for the
// falling marker. The radial label advances linearly in r^(3/2); the angular
// label subtracts the accumulated twist along that particular falling ray.
${RAIN_PRIMITIVES_GLSL}
vec4 rainGridAt(vec3 p,vec3 direction,float travelled,float pixelAngle){
 vec2 xy=coordinateGridChart((p-uRainOrigin.xyz)/uRainOrigin.w).xz;
 float r=length(xy),h=r*sqrt(r),end=uRainFlow.x;
 if(r<uRainFlow.y||r<1e-6)return vec4(0);
 float twist=0.0,dRadial=1.5*sqrt(r),angleStretch=0.0;
 if(uRainKerr.x!=0.0){
  float mu=uRainKerr.y/r,u=uRainKerr.x*mu,b=1.0+u*u,w=sqrt(2.0*mu/b);
  h=rainRadial(r,uRainKerr.x*uRainKerr.y)/uRainKerr.z;
  twist=${RAIN_TWIST_GAIN.toFixed(1)}*(uRainKerr.w-rainPsi(sqrt(mu),uRainKerr.x));
  dRadial/=uRainKerr.z*sqrt(b);
  angleStretch=${RAIN_TWIST_GAIN.toFixed(1)}*abs(u)*w/(b*(1.0+w));
 }
 float density=clamp(uGridDensity.x,.25,4.0);
 float rings=2.0*max(1.0,floor(2.0*density+.5)),spokes=4.0*max(2.0,floor(5.0*density+.5));
 float radial=((h-end)/(1.0-end)+uRainFlow.z)*rings;
 float angular=(atan(xy.y,xy.x)-uRainFlow.w-twist)*spokes/(2.0*PI);
 // Conservative area footprints analytically suppress unresolved distant rings.
 float incidence=abs(dot(direction,coordinateGridNormal()));
 float pixel=max(1e-5,travelled*pixelAngle/max(incidence,.14)/uRainOrigin.w);
 float dr=max(1e-5,dRadial*rings/(1.0-end)*pixel);
 float da=max(1e-5,spokes/(2.0*PI*r)*(1.0+angleStretch)*pixel);
 vec2 d=abs(fract(vec2(radial,angular)+.5)-.5);
 vec2 w=clamp(vec2(dr,da)*.7,vec2(.004),vec2(.4));
 vec2 line=(1.0-smoothstep(w*.2,w*1.65,d))*(1.0-smoothstep(.45,1.25,vec2(dr,da)));
 // Brighter junctions give the eye individual points of material to follow:
 // in a spinning field their tracks curve, while a stationary core stays put.
 float bead=(1.0-smoothstep(1.0,2.25,length(d/max(w,vec2(.012)))))*line.x*line.y;
 // The angular circumference contracts while radial separations grow on the
 // way in. At large radius this leaves excess rings per pixel: progressively
 // keep the major material rings and let the rest of the field fall quiet.
 float nearField=1.0-smoothstep(1.10,2.6,r);
 float major=1.0-smoothstep(.20,.48,abs(fract(radial*.5+.5)-.5)*2.0);
 float ringInk=mix(.15+.55*major,1.0,nearField);
 float fieldFade=mix(.38,1.0,1.0-smoothstep(1.4,3.75,r));
 float strength=(max(line.x*.68*ringInk,line.y*.48)+.46*bead*ringInk)*fieldFade;
 // Follow one material spoke and its repeating launch shell. This makes the
 // angular deflection legible even when most of it occurs near the horizon.
 float spoken=abs(fract(angular/spokes+.5)-.5)*spokes;
 float shell=abs(fract(radial/rings+.5)-.5)*rings;
 float extent=1.0-smoothstep(1.05,1.42,r);
 float ref=max((1.0-smoothstep(.18,.48,spoken))*line.y,
               (1.0-smoothstep(.18,.48,shell))*line.x);
 float incidenceFade=smoothstep(.025,.14,incidence);
 vec3 ink=vec3(.115,.52,.82)*strength+vec3(.13,.32,.26)*(ref*extent);
 return vec4(ink*incidenceFade,strength*.075*incidenceFade);
}

vec4 coordinateGridAt(vec3 p,vec3 direction,float travelled,float pixelAngle){
 if(uRainOrigin.w>0.0)return rainGridAt(p,direction,travelled,pixelAngle);
 ${warp?`float nativeWeight=1.0;
 if(uWarpGridLocalPatch>.5&&uWarpFlags.x>.5&&uWarpFlags.z>.5&&uWarpStrength>0.0&&uWarpRadius>0.0){
  // Blend at this actual sheet crossing. A body grid can also lie far below
  // the ship's orbit, so suppress its strokes through the nearer patch.
  float localRadius=length(p-uWarpCenter)/uWarpRadius;
  nativeWeight=1.0-max(warpPatchWeight(localRadius),warpPatchCoverage);
  if(nativeWeight<=0.0)return vec4(0);
 }`:'const float nativeWeight=1.0;'}
 // Do not illuminate coordinate marks inside a capture surface.
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;
  if(k==1&&uBinary==0)break;
  if(uHoles[k].w<=0.0)continue;
  if(uMetricOptions.w<.5&&length(p-uHoles[k].xyz)<=horizonFor(k))return vec4(0);
 }
 if(uWarpFlags.w<.5&&uGridFlowWindow!=0.0){
  // Two finite material charts replenish tracers without a visible reset.
  // A chart is replaced only at zero opacity, with zero opacity derivative.
  // Both charts follow identical infall velocities and the shared scene clock.
  float windowLength=abs(uGridFlowWindow);
  float period=uGridFlowWindow<0.0?12.0:windowLength;
  float phase=mod(max(uTime,0.0),period)/period;
  float other=fract(phase+.5),weight=pow(sin(phase*PI),2.0);
  vec3 a=coordinateGridCoordinates(p,phase*windowLength);
  vec3 b=coordinateGridCoordinates(p,other*windowLength);
  return nativeWeight*(coordinateGridStroke(a,direction,travelled,pixelAngle)*weight+
         coordinateGridStroke(b,direction,travelled,pixelAngle)*(1.0-weight));
 }
 vec3 chart=coordinateGridCoordinates(p,uTime);
 ${lensedGrid?'if(useLensedGrid()){recordGridCrossing(chart,direction,travelled,pixelAngle);return vec4(0);}':''}
 return nativeWeight*coordinateGridStroke(chart,direction,travelled,pixelAngle);
}

// Called only on the renderer's already-integrated (and object-clipped) ray.
// No extra ray march, Newton solve, or per-pixel grid overlay is required.
vec4 coordinateGridSegment(vec3 start,vec3 end,float travelled,float pixelAngle){
 if(uFlags.x<.5)return vec4(0);
 float a=coordinateGridSheet(start),b=coordinateGridSheet(end);
 if(a*b>0.0||abs(a-b)<1e-14)return vec4(0);
 float fraction=a/(a-b);
 // Half-open segments prevent a crossing on a step boundary being drawn twice.
 if(fraction<=.000001||fraction>1.0)return vec4(0);
 vec3 delta=end-start;float distance=length(delta);
 if(distance<1e-14)return vec4(0);
 return coordinateGridAt(start+delta*fraction,delta/distance,travelled+distance*fraction,pixelAngle);
}

${lensedGrid?`
vec4 curvedGridSegment(vec3 start,vec3 end,vec3 initial,vec3 finalTangent,float travelled,float pixelAngle){
 float a=coordinateGridSheet(start),b=coordinateGridSheet(end);
 if(a*b>0.0||abs(a-b)<1e-14)return vec4(0);
 float x=a/(a-b);if(x<=.000001||x>1.0)return vec4(0);
 vec3 delta=end-start,ca=initial-delta,cb=delta-finalTangent,hit,tangent;
 // Hermite dense output: refine the sheet intersection within this actual
 // curved ray step. A linear interpolation leaves kinks on coarse tiers.
 for(int j=0;j<3;j++){
  vec3 c=mix(ca,cb,x);
  hit=start+x*(delta+(1.0-x)*c);
  tangent=delta+(1.0-2.0*x)*c+x*(1.0-x)*(cb-ca);
  float slope=dot(tangent,coordinateGridNormal());
  if(j<2&&abs(slope)>1e-12)x=clamp(x-coordinateGridSheet(hit)/slope,0.0,1.0);
 }
 return coordinateGridAt(hit,unit(tangent),travelled+length(hit-start),pixelAngle);
}`:''}
// The ray solver uses a finite integration volume. Its asymptotic straight
// continuation intersects the SAME unbounded sheet, preserving its far field.
vec4 coordinateGridEscape(vec3 start,vec3 direction,float travelled,float pixelAngle){
 if(uFlags.x<.5)return vec4(0);
 float denominator=dot(direction,coordinateGridNormal());
 if(abs(denominator)<1e-7)return vec4(0);
 float distance=-coordinateGridSheet(start)/denominator;
 if(distance<=max(1e-12,coordinateGridScale()*.000001))return vec4(0);
 return coordinateGridAt(start+direction*distance,direction,travelled+distance,pixelAngle);
}
`;
}

export const COORDINATE_GRID_GLSL = coordinateGridGLSL({ warp: true });
