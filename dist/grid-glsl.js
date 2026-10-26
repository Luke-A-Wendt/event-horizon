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

export function coordinateGridGLSL({ warp = false } = {}) {
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
float coordinateGridScale(){return max(uGridAnchor.w,1e-20);}
float coordinateGridSheet(vec3 p){return dot(p,coordinateGridNormal())-uGridAnchor.z;}

// Return (1+x)^(2/3)-1 without subtracting nearly equal large radii.
// The series is essential in the asymptotically flat field, including t=0.
float gridRadialDelta(float radius,float flow){
 float x=flow/max(radius*sqrt(radius),1e-30);
 if(abs(x)<.02)return x*(.666666667+x*(-.111111111+x*.049382716));
 float label=1.0+x;return sign(label)*pow(abs(label),.666666667)-1.0;
}

vec3 coordinateGridCoordinates(vec3 p,float weakFlowTime){
 vec3 displaced=p;float stretch=1.0;
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;
  if(k==1&&uBinary==0)break;
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
 if(uMetricOptions.y>0.0&&uWarpFlags.w>.5&&uBinary==1){
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
 vec2 phase=mod(uGridHigh,vec2(spacing/.75))*.75;
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
 vec2 axisFootprint=footprint*coordinates.z*sqrt(vec2(1.0)+slope*slope);
 float projected=max(axisFootprint.x,axisFootprint.y);
 // Adjacent dyadic grids share every other line. Cross-fading preserves a
 // connected, readable far plane without switching to a separate patch.
 float level=max(0.0,log2(max(1.0,projected*18.0/.75)));
 float spacing=.75*exp2(floor(level));
 vec2 width=max(vec2(.0045),axisFootprint*.48);
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

vec4 coordinateGridAt(vec3 p,vec3 direction,float travelled,float pixelAngle){
 // Do not illuminate coordinate marks inside a capture surface.
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;
  if(k==1&&uBinary==0)break;
  if(uMetricOptions.w<.5&&length(p-uHoles[k].xyz)<=horizonFor(k))return vec4(0);
 }
 if(uWarpFlags.w<.5&&uGridFlowWindow>0.0){
  // Two finite material charts replenish tracers without a visible reset.
  // A chart is replaced only at zero opacity, with zero opacity derivative.
  // Both charts follow identical infall velocities and the shared scene clock.
  float phase=mod(max(uTime,0.0),uGridFlowWindow)/uGridFlowWindow;
  float other=fract(phase+.5),weight=pow(sin(phase*PI),2.0);
  vec3 a=coordinateGridCoordinates(p,phase*uGridFlowWindow);
  vec3 b=coordinateGridCoordinates(p,other*uGridFlowWindow);
  return coordinateGridStroke(a,direction,travelled,pixelAngle)*weight+
         coordinateGridStroke(b,direction,travelled,pixelAngle)*(1.0-weight);
 }
 return coordinateGridStroke(coordinateGridCoordinates(p,uTime),direction,travelled,pixelAngle);
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
