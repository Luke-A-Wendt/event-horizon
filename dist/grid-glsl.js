// A lensed coordinate guide, not a material fabric or a spatial embedding.
// Schwarzschild admits spatially flat Painleve–Gullstrand slices. Their radial
// free-fall flow motivates the moving markers below. The spin cue and binary
// superposition are illustrations, not an exact Kerr/binary coordinate chart.
export const GRID_DISPLAY_FLOW = 2;

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
float coordinateGridSheet(vec3 p){return dot(p-uHoles[0].xyz,coordinateGridNormal());}

vec3 coordinateGridCoordinates(vec3 p){
 vec3 displaced=p;float stretch=1.0;
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  float m=max(uHoles[k].w,1e-12);
  vec3 relative=(p-uHoles[k].xyz)/m;
  float r=max(length(relative),max(horizonFor(k)/m,1e-3));
  // The material label R is constant on a radially falling marker:
  // R^(3/2)=r^(3/2)+(3/2)*sqrt(2)*s*t, dr/dt=-s*sqrt(2/r).
  float label=r*sqrt(r)+(uWhiteHole>.5?-1.0:1.0)*${(1.5 * Math.SQRT2 * GRID_DISPLAY_FLOW).toFixed(9)}*max(uTime,0.0);
  // Signed labels continue supplying new outward-flowing markers at the
  // white-hole horizon. Negative labels are coordinates, not negative radii.
  float material=sign(label)*pow(abs(label),.666666667);
  float expansion=material/r;
  float angle=-2.0*spinFor(k)*uTime/(1.0+r*r*r);
  float c=cos(angle),s=sin(angle);vec3 axis=axisFor(k);
  vec3 rotated=relative*c+cross(axis,relative)*s+axis*dot(axis,relative)*(1.0-c);
  displaced+=(rotated*expansion-relative)*m;
  // Outgoing labels pass through zero as new markers emerge. Account
  // for their radial Jacobian as well as angular stretch so this continuous
  // chart does not alias into a bright unresolved ring at that boundary.
  float radialStretch=sqrt(r/max(abs(material),.0001));
  stretch=max(stretch,max(abs(expansion),radialStretch)*(1.0+min(abs(angle)*3.0,8.0)));
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
 vec3 chart=coordinateGridChart(displaced)/max(uMass,1e-12);
 return vec3(chart.x,chart.z,stretch);
}

float coordinateGridLines(vec2 point,float spacing,vec2 width){
 vec2 cell=abs(fract(point/spacing+.5)-.5)*spacing;
 vec2 lines=1.0-smoothstep(width,width*2.0,cell);
 return max(lines.x,lines.y);
}

vec4 coordinateGridAt(vec3 p,vec3 direction,float travelled,float pixelAngle){
 // A segment can cross the plane inside a horizon before the integrator's
 // next capture check. Explicitly reject it to keep the shadow fully black.
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  if(length(p-uHoles[k].xyz)<=horizonFor(k))return vec4(0);
 }
 vec3 coordinates=coordinateGridCoordinates(p);
 float incidence=abs(dot(direction,coordinateGridNormal()));
 float footprint=max(.0015,travelled*pixelAngle/max(uMass,1e-12));
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
 float intensity=(line*.44+major*.18)*fade;
 // Diagnostic markings keep one consistent color in all spectral views.
 // They are annotations rather than a source of electromagnetic emission.
 return vec4(vec3(.095,.45,.73)*intensity,intensity*.08);
}

// Called only on the renderer's already-integrated (and object-clipped) ray.
// No extra ray march, Newton solve, or per-pixel grid overlay is required.
vec4 coordinateGridSegment(vec3 start,vec3 end,float travelled,float pixelAngle){
 if(uFlags.x<.5||uWarpFlags.w<.5)return vec4(0);
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
 if(uFlags.x<.5||uWarpFlags.w<.5)return vec4(0);
 float denominator=dot(direction,coordinateGridNormal());
 if(abs(denominator)<1e-7)return vec4(0);
 float distance=-coordinateGridSheet(start)/denominator;
 if(distance<=max(1e-7,uMass*.000001))return vec4(0);
 return coordinateGridAt(start+direction*distance,direction,travelled+distance,pixelAngle);
}
`;
}

export const COORDINATE_GRID_GLSL = coordinateGridGLSL({ warp: true });
