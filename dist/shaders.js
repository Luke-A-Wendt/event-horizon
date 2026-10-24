import { createCraftGLSL } from './craft-glsl.js';
import { warpFieldGLSL, WARP_TRACE_GLSL } from './warp-glsl.js';
import { coordinateGridGLSL } from './grid-glsl.js';
import { bridgeGLSL } from './bridge-glsl.js';
import { COCKPIT_GLSL } from './cockpit-glsl.js';
// All visual assets and ray integration are generated on the visitor's GPU.
// The metric-inspired ray and emission fields are educational approximations.
export const VERTEX = `
attribute vec2 aPosition;
void main(){gl_Position=vec4(aPosition,0.0,1.0);}
`;

// Cold-start compilation must not parse spacecraft unions or the warp integrator.
// Feature variants are created on demand; normal modes never compile Ultra's
// 768-step loop or its extra turbulence octaves.
const SPHERE_GLSL = `
struct CraftSurface { float t; vec3 normal; vec3 albedo; float material; };
vec4 ellipsoidHit(vec3 ro,vec3 rd,vec3 center,vec3 radii){
 vec3 q=(ro-center)/radii,d=rd/radii;
 // Cross-product form avoids subtracting two almost equal squared distances.
 vec3 perpendicular=cross(q,d);
 float a=dot(d,d),b=dot(q,d),h=a-dot(perpendicular,perpendicular);
 if(!(a>0.0&&h>=0.0))return vec4(0,0,0,-1);
 float root=sqrt(h),t=(-b-root)/a;if(t<0.0)t=(-b+root)/a;
 return vec4(unit((ro+rd*t-center)/(radii*radii)),t);
}
CraftSurface craftHit(vec3 ro,vec3 rd,float maximum,float type){
 vec4 hit=ellipsoidHit(ro,rd,vec3(0),vec3(1));
 CraftSurface s;s.t=hit.w>=0.0?hit.w:maximum+max(.001,abs(maximum)*.00001);s.normal=hit.xyz;s.albedo=vec3(.7,.76,.8);s.material=0.0;return s;
}
vec3 shadeCraft(CraftSurface s,vec3 hit,vec3 rd,vec3 light,vec3 environment){return s.albedo*(.1+.9*max(0.0,dot(s.normal,light)));}
`;
const NO_WARP_GLSL = `
bool localWarpPass(){return false;}
vec3 warpWorldForce(vec3 p,vec3 d){return vec3(0);}
vec4 warpWorldAppearance(vec3 p,vec3 previous,float dt){return vec4(0);}
`;
const NO_WARP_TRACE_GLSL = `
void warpLocalTrace(vec3 original,out vec3 direction,out vec3 emission,out float transmission,out bool hitShip){direction=original;emission=vec3(0);transmission=1.0;hitShip=false;}
`;
const NO_GRID_GLSL = `
vec4 coordinateGridSegment(vec3 start,vec3 end,float travelled,float pixelAngle){return vec4(0);}
vec4 coordinateGridEscape(vec3 start,vec3 direction,float travelled,float pixelAngle){return vec4(0);}
`;
export function createFragment({ultra=false,photo=false,photoSteps=3072,craft=false,craftMask=15,warp=false,grid=false,bridge=false,probe=false}={}) {
 const photoBudget=[1024,1536,3072].includes(photoSteps)?photoSteps:3072;
 craft=craft||warp||bridge;
 craftMask=(Number.isInteger(craftMask)?craftMask:15)&15;
 if(warp||bridge)craftMask|=8;
 return `
precision highp float;
uniform vec2 uResolution,uPhotoOffset,uPhotoJitter;
uniform vec4 uRayViewport,uBridge;
uniform mat4 uInverseProjection;
uniform int uProjectionMode;
uniform float uWhiteHole;
uniform vec3 uBridgeSkyColor;
uniform vec4 uBridgeSkyParams;
uniform float uBridgeOtherNebula;
uniform int uCockpitMode;
${photo?'uniform float uPhotoDetail;':''}
uniform float uTime,uExposure,uDistance,uYaw,uPitch,uLookYaw,uLookPitch,uMass,uBounds,uStars,uDetail;
uniform vec3 uPrimaryAxis,uSecondaryAxis;
uniform vec2 uSpin,uHorizon,uIsco,uDiskOuter;
uniform vec4 uHoles[2];
uniform vec4 uFlags,uFlags2,uDiskParams,uNebulaParams,uJets,uTidal;
uniform vec3 uDiskColor,uNebulaColor,uJetColor,uStarColor;
uniform int uSpectrum,uBinary,uSteps,uObjectCount;
uniform vec4 uObjects[12],uColors[12];
uniform float uLuminosities[12];
uniform vec2 uHeadings[12];
uniform vec3 uObserver,uForward,uRight,uUp;
uniform int uInspectIndex,uHideObjectIndex,uWarpObjectIndex;
uniform vec3 uInspectCamera,uInspectForward,uInspectRight,uInspectUp;
uniform vec3 uWarpCenter,uWarpAxis,uWarpObserver;
uniform vec2 uWarpGridOffset,uWarpGridRotation;
uniform float uWarpRadius,uWarpStrength,uWarpThickness;
uniform vec4 uWarpFlags;
const float PI=3.141592653589793;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
 float n=noise(p)*.67+noise(p*2.03)*.33;
 if(uDetail>.5)n=n*.88+noise(p*4.07)*.12;
 if(uDetail>1.5)n=n*.94+noise(p*8.11)*.06;
 return n;
}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 unit(vec3 v){return v/max(length(v),1e-20);}
vec3 axisFor(int k){return k==0?uPrimaryAxis:uSecondaryAxis;}
float spinFor(int k){return k==0?uSpin.x:uSpin.y;}
float horizonFor(int k){return k==0?uHorizon.x:uHorizon.y;}
float iscoFor(int k){return k==0?uIsco.x:uIsco.y;}
float outerFor(int k){return k==0?uDiskOuter.x:uDiskOuter.y;}

// A consistent local frame is shared by each disc, its matter velocity and jets.
vec3 localPoint(vec3 p,vec3 axis){
 vec3 helper=abs(axis.z)<.9?vec3(0,0,1):vec3(1,0,0);
 vec3 x=unit(cross(axis,helper)),z=cross(x,axis);
 return vec3(dot(p,x),dot(p,axis),dot(p,z));
}

// Bands are source-class false-color responses, not a global RGB filter.
vec3 thermalPalette(float temperature){
 float t=clamp(temperature,0.0,1.0);
 vec3 cold=mix(vec3(.06,.015,.19),vec3(.65,.06,.23),smoothstep(.05,.45,t));
 return mix(cold,mix(vec3(1,.34,.055),vec3(1,.95,.63),smoothstep(.65,1.0,t)),smoothstep(.40,.75,t));
}
vec3 surfaceSpectrum(vec3 visible,float illumination,float heat,float metallic){
 if(uSpectrum==0)return visible;
 float l=clamp(illumination,0.0,1.0),emissivity=mix(.92,.38,clamp(metallic,0.0,1.0));
 if(uSpectrum==1){
  float temperature=clamp(.22+heat*.45+l*.22,0.0,1.0);
  return thermalPalette(temperature)*(.18+.55*emissivity+.14*l)+visible*.025;
 }
 // Cold surfaces do not become X-ray emitters. A weak scattered component
 // preserves their occulting silhouette against the hot background.
 float reflected=dot(visible,vec3(.2126,.7152,.0722));
 // Radio/mm is dominated by magnetized plasma, not ordinary painted metal,
 // glass or planetary rock. Gamma rays likewise have no reflected-light view.
 if(uSpectrum==3)return vec3(.16,.28,.36)*(.0003+reflected*.002)*(.2+heat*.3+l*.5);
 if(uSpectrum==4)return vec3(.24,.16,.34)*(.000015+reflected*.00004);
 return vec3(.16,.28,.48)*(.0015+reflected*.009)*(0.12+l*.88);
}
vec3 stellarSpectrum(vec3 visible,float granulation){
 if(uSpectrum==0)return visible;
 if(uSpectrum==1)return thermalPalette(.74+granulation*.10)*(.58+.25*granulation);
 if(uSpectrum==3)return vec3(.34,.22,.20)*(.003+.006*pow(granulation,3.0));
 if(uSpectrum==4)return vec3(.30,.23,.45)*(.00015+.00025*pow(granulation,6.0));
 // Optical photospheres are faint in X-rays; this small emission represents
 // unresolved magnetically heated coronae, not the visible surface color.
 return vec3(.20,.50,.95)*(.025+.065*pow(granulation,3.0));
}
float detailedFbm(vec3 p){
 float n=fbm(p);
 if(uDetail>1.5)n=n*.97+noise(p*16.23)*.03;
 ${ultra?'if(uDetail>2.5)n=n*.985+noise(p*32.51)*.015;':''}
 return n;
}


${photo?`
// Resolving a large PNG is not enough: still mode evaluates additional spatial
// frequencies. Frequencies above the ray's pixel footprint fade to their mean.
// Every sample is deterministic in world coordinates, including across tiles.
float photoOctaves(vec3 p,float footprint){
 float sum=0.0,total=0.0,amplitude=.55,frequency=1.0;
 for(int octave=0;octave<7;octave++){
  if(float(octave)>3.0+uPhotoDetail)break;
  float visible=1.0-smoothstep(.20,.65,footprint*frequency);
  sum+=(noise(p*frequency)-.5)*amplitude*visible;total+=amplitude;
  frequency*=2.07;amplitude*=.54;
 }
 return .5+sum/max(total,.001);
}
vec3 photoPlasma(vec3 q,float radius,float orbit,float footprint){
 // Cartesian advection has no atan branch seam. Differential rotation shears
 // the eddies into azimuthal ribbons without adding regular concentric stripes.
 vec2 plane=q.xz;plane=rot(orbit*.13+log(max(radius,.1))*.35)*plane;
 // Heating is coherent through the shallow disc column. Independent noise
 // in every integration layer would average away the small-scale structure.
 vec3 p=vec3(plane.x,plane.y,q.y*.15);
 vec3 curl=vec3(noise(p*.75+13.1),noise(p*.75+31.7),noise(p*.75+57.3))-.5;
 float large=photoOctaves(p*.72+curl*.65,footprint*.72);
 float folded=photoOctaves(p*5.7+curl*2.1+vec3(large),footprint*5.7);
 float fine=photoOctaves(p*39.0+vec3(folded*3.0),footprint*39.0);
 float sheets=pow(max(0.0,1.0-abs(folded-.5)*2.0),7.0);
 float wisps=smoothstep(.36,.70,large)*(.45+.55*sheets);
 return vec3(clamp(.78+2.8*(large-.5)+.9*(fine-.5),.12,1.70),sheets,wisps);
}
`:''}

vec3 skyWithNebula(vec3 direction,vec4 nebulaParams,vec3 nebulaColor){
 vec3 dir=unit(direction),c=vec3(.0008,.0014,.0025);
 vec2 uv=vec2(atan(dir.z,dir.x)/(2.0*PI)+.5,asin(clamp(dir.y,-1.0,1.0))/PI+.5);
 if(uFlags2.x>.5){
  float dust=detailedFbm(dir*4.0+vec3(3.2,8.1,1.4));
  float band=exp(-pow((dir.y+.19*dir.x-.15*dir.z)*2.8,2.0));
  float backgroundBand=uSpectrum==2?.07:(uSpectrum==1?1.7:1.0);
  vec3 milkyWay=(vec3(.014,.019,.032)*band*dust*dust+vec3(.018,.010,.028)*pow(dust,4.0)*band);
  if(uSpectrum==1)milkyWay=mix(vec3(.06,.012,.025),vec3(.22,.065,.018),dust)*band*pow(dust,3.0);
  if(uSpectrum==2)milkyWay=vec3(.005,.015,.03)*pow(dust,7.0)*band;
  if(uSpectrum==3){milkyWay=mix(vec3(.016,.008,.024),vec3(.035,.021,.008),dust)*band*dust*dust;backgroundBand=.7;}
  if(uSpectrum==4){milkyWay=vec3(.024,.009,.039)*pow(dust,8.0)*band;backgroundBand=.15;}
  c+=milkyWay*backgroundBand;
  for(int j=0;j<3;j++){
   if(j==2&&uDetail<.5)break;
   float n=320.0+float(j)*210.0;
   vec2 p=uv*vec2(n*2.0,n),cell=floor(p),q=fract(p)-.5;
   float h=hash(cell+float(j)*93.1);
   q-=vec2(hash(cell+11.7),hash(cell+67.9))*.7-.35;
   float rad=.025+.055*hash(cell+5.9),pix=max(.018,n/uResolution.y*.45);
   float star=1.0-smoothstep(rad,rad+pix,length(q));
   float halo=exp(-length(q)*16.0)*.15;
   float gate=step(1.0-(.007+float(j)*.0005)*uStars,h);
   vec3 tint=mix(vec3(.53,.71,1.0),vec3(1.0,.82,.57),hash(cell+21.0));
   float bandWeight=1.0;
   if(uSpectrum==1){tint=mix(vec3(.9,.24,.08),vec3(1,.77,.35),hash(cell+21.0));bandWeight=.4+hash(cell+21.0)*.65;}
   if(uSpectrum==2){tint=vec3(.32,.65,1.0);bandWeight=hash(cell+43.0)>.978?1.7:.006;}
   if(uSpectrum==3){tint=mix(vec3(.24,.68,.90),vec3(1,.48,.15),hash(cell+21.0));bandWeight=hash(cell+43.0)>.987?.9:.002;}
   if(uSpectrum==4){tint=vec3(.70,.48,1);bandWeight=hash(cell+43.0)>.997?1.4:.0001;}
   c+=tint*(star+halo)*gate*(.18+pow(hash(cell+3.8),6.0)*1.25)*bandWeight;
  }
 }
 if(nebulaParams.z>0.0){
  vec3 nd=dir;nd.xz=rot(nebulaParams.w)*nd.xz;
  float scl=max(.2,nebulaParams.y),shape=nebulaParams.x;
  vec3 cloudPosition=nd*(3.3*scl)+vec3(2,6,1);
  float n=detailedFbm(cloudPosition);
  if(uDetail>1.5){vec3 warp=vec3(noise(cloudPosition+7.1),noise(cloudPosition+19.3),noise(cloudPosition+31.8));n=mix(n,detailedFbm(cloudPosition+warp*.75),.45);}
  float cloud=pow(n,3.0)*(.3+.7*exp(-pow(nd.y*2.7+.4*nd.x,2.0)));
  if(shape>.5&&shape<1.5){
   float angular=acos(clamp(dot(nd,unit(vec3(.2,.15,-1))),-1.0,1.0));
   float shell=exp(-pow((angular-.75/sqrt(scl))*(8.0+scl*3.0),2.0));
   cloud=shell*(.15+n*.85)+.06*n;
  }else if(shape>1.5&&shape<2.5){
   float ridges=pow(1.0-abs(noise(nd*7.0*scl+vec3(n*3.0))-0.5)*2.0,7.0);
   cloud=ridges*(.2+.8*n)*.7;
  }else if(shape>2.5){
   float phi=atan(nd.z,nd.x),lat=asin(clamp(nd.y,-1.0,1.0));
   float arms=pow(.5+.5*cos(phi*3.0+lat*12.0*scl+n*4.0),5.0);
   cloud=arms*exp(-lat*lat*3.0)*(.15+n*.6);
  }
  float filaments=pow(1.0-abs(noise(cloudPosition*5.0+vec3(n*2.0))-.5)*2.0,5.0);
  vec3 nebulaHue=mix(nebulaColor*.65,vec3(.7,.85,1),pow(n,5.0));
  float bandWeight=1.0;
  if(uDetail>1.5){cloud*=.70+.65*filaments;nebulaHue=mix(nebulaHue,nebulaColor*vec3(1.25,.85,1.35),filaments*.22);}
  ${ultra?'if(uDetail>2.5){float lace=pow(noise(cloudPosition*19.0+vec3(n)),3.0);cloud*=.87+.60*lace;}':''}
  ${photo?`
  float angularFootprint=.83/max(uResolution.y,1.0);
  float fineCloud=photoOctaves(cloudPosition*9.0+vec3(n*3.0),angularFootprint*3.3*scl*9.0);
  float laceCloud=photoOctaves(cloudPosition*60.0+vec3(fineCloud),angularFootprint*3.3*scl*60.0);
  float veins=pow(1.0-abs(fineCloud-.5)*2.0,8.0);
  cloud*=.50+1.25*veins+.55*(laceCloud-.5);
  nebulaHue=mix(nebulaHue,nebulaColor*1.3+vec3(.12,.16,.23),clamp(veins*.24+laceCloud*.12,0.0,.4));
  `:''}
  if(uSpectrum==1){nebulaHue=thermalPalette(.25+n*.55);bandWeight=2.6;cloud*=.5+1.5*n;}
  if(uSpectrum==2){nebulaHue=mix(vec3(.09,.22,.75),vec3(.50,.82,1.0),filaments);bandWeight=.20;cloud*=pow(1.0-n,2.0)*5.0;}
  // Ionized gas and synchrotron filaments can be radio bright. Ordinary cold
  // dust is not itself a gamma-ray emitter: only sparse energized knots remain.
  if(uSpectrum==3){nebulaHue=mix(vec3(.15,.045,.22),vec3(.48,.24,.08),filaments);bandWeight=.65;cloud*=.35+filaments*.9;}
  if(uSpectrum==4){nebulaHue=vec3(.48,.23,.72);bandWeight=.008;cloud*=pow(filaments,5.0)*pow(1.0-n,2.0);}
  // Dust extinction exposes luminous edges instead of uniformly bright fog.
  if(uSpectrum==0)c*=exp(-cloud*nebulaParams.z*.7);
  c+=nebulaHue*cloud*nebulaParams.z*bandWeight*.85;
 }
 return c;
}

vec3 sky(vec3 direction){return skyWithNebula(direction,vec4(uNebulaParams.xy,uNebulaParams.z*uFlags2.y,uNebulaParams.w),uNebulaColor);}

${warp?warpFieldGLSL({grid}):NO_WARP_GLSL}

${grid?coordinateGridGLSL({warp}):NO_GRID_GLSL}

vec3 force(vec3 p,vec3 v){
 if(uFlags.z<.5)return vec3(0);
 vec3 total=warpWorldForce(p,v);
 if(uWarpFlags.w<.5)return total;
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  vec3 q=p-uHoles[k].xyz;float m=uHoles[k].w;
  float rr=max(dot(q,q),m*m*.05),r=sqrt(rr);
  vec3 angular=cross(q,v);
  total-=3.0*m*dot(angular,angular)*q/(rr*rr*r);
  // Illustrative gravitomagnetic term. It vanishes exactly for zero spin.
  total+=spinFor(k)*.23*m*m*cross(axisFor(k),v)/(rr*r);
 }
 return total;
}

vec4 discAt(vec3 p,vec3 previous,vec3 tangent,float dt){
 if(uFlags.y<.5||uWarpFlags.w<.5)return vec4(0);
 vec3 color=vec3(0);float alpha=0.0;
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  float m=uHoles[k].w,inner=iscoFor(k),outer=outerFor(k)/m;
  if(outer<inner+.06)continue;
  vec3 axis=axisFor(k),q0=localPoint(previous-uHoles[k].xyz,axis),q1=localPoint(p-uHoles[k].xyz,axis);
  vec3 q=(q0+q1)*.5;float sampleDt=dt;
  if(q0.y*q1.y<0.0){
   q=mix(q0,q1,q0.y/(q0.y-q1.y));
   ${photo?'sampleDt=dt;':'sampleDt=max(dt,.14*m*uDiskParams.y/max(abs(dot(unit(tangent),axis)),.12));'}
  }
  float r=length(q.xz)/m;
  if(r<inner||r>outer)continue;
  float thick=.075*uDiskParams.y*(1.0+r*.06)*m;
  if(abs(q.y)>thick*5.0)continue;
  float angle=-atan(q.z,q.x),orbit=uTime*(1.2+spinFor(k)*.5)/pow(max(r*.35,.1),1.5);
  vec3 tex=vec3(q.x/m,-q.z/m,r*.5);tex.xy=rot(orbit*.4)*tex.xy;
  float turbulence=detailedFbm(tex*1.9);
  if(uDetail>1.5){
   vec3 shear=vec3(cos(angle*3.0-orbit),sin(angle*3.0-orbit),sin(r*.7+orbit*.2));
   turbulence=mix(turbulence,detailedFbm(tex*3.7+shear*.7),.38);
  }
  float streak=.68+.20*sin(r*23.0+sin(angle*6.0-orbit)*.7+turbulence*5.0);
  streak*=.72+.28*sin(angle*23.0-orbit*7.0+r*3.0+turbulence*6.0);
  if(uDetail>1.5){float threads=.5+.5*sin(r*83.0+angle*4.0+orbit*1.3+turbulence*9.0);streak*=.80+.40*threads;}
  ${ultra?'if(uDetail>2.5){float eddy=pow(.5+.5*sin(angle*47.0-orbit*11.0+r*9.0+turbulence*17.0),4.0);streak*=.82+.58*eddy;}':''}
  ${photo?`
  float footprint=max(.00003,length(p-uObserver)/max(m,1e-12)*.83/max(uResolution.y,1.0));
  vec3 plasma=photoPlasma(vec3(q.x,q.y,q.z)/m,r,orbit,footprint);
  turbulence=mix(turbulence,plasma.x*.58,.7);
  // Keep broad Keplerian structure, replace unresolved regular rings with
  // advected, multi-scale emissivity. Added detail is spatial, not a sharpen filter.
  streak=mix(streak,.32+plasma.x*.54+plasma.y*.40,.82);
  `:''}
  float edge=min(.55,(outer-inner)*.18),fade=min(3.5,(outer-inner)*.55);
  float rim=smoothstep(inner,inner+max(.01,edge),r)*(1.0-smoothstep(outer-fade,outer,r));
  float radial=pow(inner/r,1.7),hot=clamp(radial*.9+.10,0.0,1.0);
  float vertical=exp(-abs(q.y)/thick);
  ${ultra?'if(uDetail>2.5&&q0.y*q1.y>=0.0){vertical=(exp(-abs(q0.y)/thick)+4.0*vertical+exp(-abs(q1.y)/thick))/6.0;}':''}
  float density=vertical*rim*(.5+turbulence)*streak*uDiskParams.z;
  ${photo?'density*=.62+.8*plasma.x;':''}
  // Two editable procedural emission studies, sampled along the same bent rays
  // as every other disc. Their structure is world-space, not a screen overlay.
  float ribbon=0.0,ribbonFine=0.0;
  if(uDiskParams.x>5.5){
   // Long sheared arcs: cylindrical coordinates keep the noise continuous at
   // the angular seam while its radial drift prevents ruler-spaced rings.
   vec2 flowAngle=vec2(cos(angle),sin(angle));flowAngle=rot(r*.12-orbit*.10)*flowAngle;
   float drift=noise(vec3(r*.38,flowAngle*2.2)+vec3(1.7,4.3,8.1));
   float arcStrength=smoothstep(.22,.72,noise(vec3(r*.23,flowAngle*3.5)+vec3(12.2,3.1,6.4)));
   float sheetPhase=r*1.05+drift*5.4+.55*sin(angle*3.0+r*.36-orbit*.19);
   float pixelWidth=length(p-uObserver)/max(m,1e-12)*.83/max(uResolution.y,1.0);
   float lineWidth=clamp(.45+pixelWidth*2.5,.45,.9);
   ribbon=exp(-pow(sin(sheetPhase)/lineWidth,2.0))*(.16+1.15*arcStrength);
   if(uDetail>.5)ribbonFine=exp(-pow(sin(r*3.4+drift*8.1+angle*.35-orbit*.22)/max(lineWidth,.5),2.0))*.14*arcStrength;
   ${ultra||photo?'if(uDetail>2.5)ribbonFine+=exp(-pow(sin(r*7.3+drift*13.0+sin(angle*7.0-orbit)) / max(lineWidth,.5),2.0))*.06*arcStrength;':''}
   density=vertical*rim*uDiskParams.z*(.10+.36*ribbon+ribbonFine)*(.75+.4*turbulence);
  }else if(uDiskParams.x>4.5){
   density*=.75+.55*smoothstep(.2,.8,turbulence);
  }
  float absorb=1.0-exp(-density*sampleDt/max(thick,.001)*.95);
  vec3 hue=mix(vec3(.62,.15,.026),vec3(1,.57,.19),smoothstep(.15,.5,hot));
  hue=mix(hue,vec3(1,.91,.73),smoothstep(.4,1.0,hot));
  // Color is an editable emission palette, not a solved chemical spectrum.
  hue*=mix(vec3(1),uDiskColor/vec3(1,.839,.604),.65);
  if(uDiskParams.x>.5&&uDiskParams.x<1.5)hue=mix(uDiskColor*vec3(1,.28,.4),vec3(1,.82,.83),hot);
  else if(uDiskParams.x>1.5&&uDiskParams.x<2.5)hue=mix(uDiskColor*vec3(.47,.63,1),vec3(.82,.91,1),hot);
  else if(uDiskParams.x>2.5&&uDiskParams.x<3.5)hue=mix(uDiskColor*.23,uDiskColor*.9,hot);
  else if(uDiskParams.x>3.5&&uDiskParams.x<4.5)hue=mix(uDiskColor*.45,mix(uDiskColor,vec3(1),.65),hot);
  else if(uDiskParams.x>5.5)hue=mix(uDiskColor*vec3(.12,.30,1.15),mix(uDiskColor,vec3(.25,.70,1),.4),clamp(ribbon*.65+ribbonFine+hot*.2,0.0,1.0));
  else if(uDiskParams.x>4.5)hue=mix(uDiskColor*vec3(.45,.9,1.25),vec3(.92,.98,1),smoothstep(.08,.75,hot)*.75+.2);
  vec3 localV=localPoint(tangent,axis),orbital=unit(vec3(q.z,0,-q.x));
  float beta=min(.65,sqrt(1.0/max(r,2.0)));
  float doppler=1.0/(1.0+beta*dot(orbital,unit(localV)));
  float redshift=sqrt(max(.05,1.0-2.0/max(r,2.1)));
  float spectral=1.0;
  if(uSpectrum==1){spectral=.15+2.5*pow(1.0-hot,1.2);hue=mix(uDiskColor,vec3(1,.32,.10),.55);if(uDiskParams.x>2.5&&uDiskParams.x<3.5)spectral*=1.7;}
  if(uSpectrum==2){spectral=.025+5.0*pow(hot,5.0);hue=mix(vec3(.20,.30,.95),vec3(.78,.95,1),hot);if(uDiskParams.x>2.5&&uDiskParams.x<4.5)spectral*=.12;}
  if(uSpectrum==3){spectral=.20+1.7*pow(hot,.7);hue=mix(vec3(.24,.025,.10),vec3(1,.58,.17),sqrt(hot));if(uDiskParams.x>2.5&&uDiskParams.x<4.5)spectral*=.18;}
  // Illustrative energetic inner corona; gamma emission is localized, not a
  // false-color copy of the entire optical disc or its cold outer dust.
  if(uSpectrum==4){spectral=.0004+2.4*pow(hot,9.0)*pow(turbulence,2.0);hue=mix(vec3(.40,.10,.72),vec3(.92,.84,1),hot);if(uDiskParams.x>2.5&&uDiskParams.x<4.5)spectral*=.015;}
  vec3 emit=hue*(.58+radial*2.4)*pow(doppler,2.8)*redshift*spectral;
  if(uDiskParams.x>5.5)emit*=.8+2.0*ribbon+.8*ribbonFine;
  else if(uDiskParams.x>4.5)emit*=3.4+.9*turbulence;
  ${photo?`// Local turbulent heating survives optically thick sight lines.
  emit*=.25+1.25*pow(plasma.x,1.5)+.22*plasma.y;
  emit=mix(emit,emit*vec3(1.08,.97,.84),plasma.z*.22);`:''}
  color+=emit*absorb*(1.0-alpha);alpha+=(1.0-alpha)*absorb;
 }
 return vec4(color,alpha);
}

// Integral of a Gaussian across this already-bent ray segment. Evaluating
// only its midpoint can miss a narrow jet entirely on Low/Medium or at a
// grazing angle; segment coverage keeps the lensed beam continuous.
float jetErf(float x){
 float a=abs(x),t=1.0/(1.0+.3275911*a);
 return sign(x)*(1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*exp(-a*a));
}
float jetGaussianSegment(vec2 start,vec2 end,float width){
 vec2 delta=end-start;float d2=dot(delta,delta),w2=width*width;
 if(d2<1e-8*w2)return exp(-dot((start+end)*.5,(start+end)*.5)/w2);
 float center=-dot(start,delta)/d2,scale=sqrt(d2)/width;
 vec2 closest=start+delta*center;
 return max(0.0,exp(-dot(closest,closest)/w2)*.886226925/scale*(jetErf(scale*(1.0-center))-jetErf(-scale*center)));
}
vec3 jetField(vec3 previous,vec3 next,float dt){
 if(uFlags.w<.5||uWarpFlags.w<.5)return vec3(0);
 vec3 sum=vec3(0);
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  float m=max(uHoles[k].w,1e-12);
  vec3 start=localPoint(previous-uHoles[k].xyz,axisFor(k))/m,end=localPoint(next-uHoles[k].xyz,axisFor(k))/m;
  vec2 delta=end.xz-start.xz;
  float closest=clamp(-dot(start.xz,delta)/max(dot(delta,delta),1e-10),0.0,1.0);
  vec3 q=mix(start,end,closest);float y=abs(q.y),r=length(q.xz),cone=.12+y*.065*uJets.x;
  // Reject negligible off-axis contributions before exponentials; this is
  // especially important when mobile rays traverse a large empty jet volume.
  float widest=.12+max(abs(start.y),abs(end.y))*.065*uJets.x;
  if(r>widest*5.0)continue;
  float coverage=jetGaussianSegment(start.xz,end.xz,cone);
  float core=coverage*smoothstep(horizonFor(k)/m,3.8,y)*exp(-y*.095/max(uJets.y,.1));
  float stream=.65+.35*sin(y*3.0-uTime*4.0);
  float bandWeight=uSpectrum==2?2.4:(uSpectrum==1?.22:1.0);
  vec3 hue=mix(uJetColor*.7,vec3(.88,.96,1),exp(-r*3.0)*.3);
  if(uSpectrum==1)hue=thermalPalette(.32+.35*exp(-r/cone));
  if(uSpectrum==2)hue=mix(vec3(.12,.22,1),vec3(.65,.94,1),exp(-r*r/(cone*cone)));
  if(uSpectrum==3){hue=mix(vec3(.06,.48,.76),vec3(1,.48,.12),exp(-y*.10));bandWeight=3.2;stream=.85+.15*stream;}
  if(uSpectrum==4){hue=mix(vec3(.42,.10,.95),vec3(.92,.85,1),stream);bandWeight=4.8*exp(-y*.12/max(uJets.y,.1))*pow(stream,4.0);}
  sum+=hue*core*stream*dt/m*.65*uJets.z*bandWeight;
 }
 return sum;
}

${probe?`
// A finite emissive halo is a visual light-scattering model, not a larger body.
// Integrating its Gaussian along each bent segment prevents tiny physical
// probes from flickering when a coarse step crosses the entire glow at once.
vec3 probeEmissionRay(vec3 ro,vec3 direction,float segmentLength,float luminosity,vec3 tint){
 float lum=clamp(luminosity,1.0,100000000.0),radius=2.0+2.0*sqrt(sqrt(lum));
 float along=dot(ro,direction),closest=clamp(-along,0.0,segmentLength);
 vec3 nearest=ro+direction*closest;
 if(dot(nearest,nearest)>radius*radius*36.0)return vec3(0);
 vec3 offAxis=cross(ro,direction);float perpendicular=dot(offAxis,offAxis);
 float coverage=max(0.0,.886226925*exp(-perpendicular/(radius*radius))*(jetErf((along+segmentLength)/radius)-jetErf(along/radius)));
 vec3 hue=tint;float band=1.0;
 if(uSpectrum==1){hue=mix(vec3(.6,.08,.025),vec3(1,.43,.09),dot(tint,vec3(.333)));band=.48;}
 if(uSpectrum==2){hue=vec3(.25,.55,1);band=.018;}
 if(uSpectrum==3){hue=vec3(.32,.45,.55);band=.003;}
 if(uSpectrum==4){hue=vec3(.55,.32,.75);band=.00001;}
 return hue*coverage*(.11*sqrt(lum))*band;
}
vec3 probeEmissionSegment(vec3 previous,vec3 next){
 vec3 sum=vec3(0),segment=next-previous;float distance=length(segment);
 if(distance<1e-20)return sum;
 vec3 direction=segment/distance;
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;
  if(uColors[j].a<.5||uColors[j].a>1.5||j==uInspectIndex||j==uHideObjectIndex)continue;
  float size=max(uObjects[j].w,1e-20);
  sum+=probeEmissionRay((previous-uObjects[j].xyz)/size,direction,distance/size,uLuminosities[j],uColors[j].rgb);
 }
 return sum;
}
vec3 probeInspectorEmission(vec2 uv,float fov){
 if(uInspectIndex<0)return vec3(0);
 vec3 tint=vec3(0);float luminosity=1.0,type=-1.0;
 for(int j=0;j<12;j++){if(j==uInspectIndex){tint=uColors[j].rgb;type=uColors[j].a;luminosity=uLuminosities[j];}}
 if(type<.5||type>1.5)return vec3(0);
 vec3 eye=vec3(uv*fov,-1.0);
 if(uProjectionMode==1){vec2 ndc=uv*vec2(2.0*uResolution.y/uResolution.x,2.0);eye=(uInverseProjection*vec4(ndc,-1.0,1.0)).xyz;}
 vec3 ray=unit(uInspectRight*eye.x+uInspectUp*eye.y-uInspectForward*eye.z);
 return probeEmissionRay(uInspectCamera,ray,length(uInspectCamera)+16.0*(2.0+2.0*sqrt(sqrt(luminosity))),luminosity,tint);
}
`:''}

vec3 whiteHoleEmission(vec3 p,float dt){
 if(uWhiteHole<.5||uWarpFlags.w<.5)return vec3(0);
 float r=length(p-uHoles[0].xyz)/max(uMass,1e-12),h=uHorizon.x/max(uMass,1e-12);
 // This optically thin outflow is an illustrative source assignment. A white
 // hole is a time orientation of a solution, not a required white spectrum.
 float shell=exp(-(r-h)*.72)*smoothstep(h,h+.3,r);
 float pulse=.62+.38*sin(r*4.0-uTime*3.0);
 vec3 hue=uSpectrum==2?vec3(.3,.62,1):uSpectrum==1?thermalPalette(.6):vec3(.72,.87,1);
 float bandWeight=1.0;
 if(uSpectrum==3){hue=vec3(.8,.35,.12);bandWeight=.55;}
 if(uSpectrum==4){hue=vec3(.7,.4,1);bandWeight=.025*pow(pulse,4.0);}
 return hue*shell*pulse*.08*dt/max(uMass,1e-12)*bandWeight;
}

vec4 debris(vec3 p,float dt){
 if(uFlags2.z<.5||uWarpFlags.w<.5)return vec4(0);
 vec3 q=localPoint(p-uHoles[0].xyz,uPrimaryAxis)/uMass;
 float r=length(q.xz),angle=atan(q.z,q.x),starR=uTidal.x/uMass;
 float lane=exp(-(1.0-cos(angle-uTidal.y+(starR-r)*.55))*85.0)*exp(-q.y*q.y*8.0/max(uTidal.w,.1));
 float env=smoothstep(2.2,3.5,r)*(1.0-smoothstep(starR,starR+2.0,r));
 float pulse=.6+.4*sin(r*9.0-uTime*5.0+angle*5.0);
 float density=lane*env*pulse*dt/uMass*(.55+uTidal.z*.65)*uTidal.w;
 vec3 hue=uStarColor*vec3(2.5,1.6,.8);
 float bandWeight=uSpectrum==2?1.9:(uSpectrum==1?.32:1.0);
 if(uSpectrum==2)hue=vec3(.55,1.4,2.5);
 if(uSpectrum==1)hue=thermalPalette(.48+.2*pulse);
 if(uSpectrum==3){hue=mix(vec3(.15,.07,.3),vec3(.95,.38,.12),pulse);bandWeight=.65;}
 if(uSpectrum==4){hue=vec3(.65,.35,1);bandWeight=.08*pow(pulse,4.0)*exp(-max(0.0,r-3.0)*.35);}
 return vec4(hue*density*bandWeight,min(density*.2,.7));
}

${craft?createCraftGLSL({mask:craftMask,photo}):SPHERE_GLSL}
${craft&&(craftMask&2)?COCKPIT_GLSL:''}

vec3 craftFrame(vec3 p,vec2 heading){
 vec3 q=localPoint(p,uPrimaryAxis);
 return vec3(-heading.x*q.x-heading.y*q.z,q.y,heading.y*q.x-heading.x*q.z);
}
vec3 craftWorld(vec3 p,vec2 heading){
 vec3 helper=abs(uPrimaryAxis.z)<.9?vec3(0,0,1):vec3(1,0,0),x=unit(cross(uPrimaryAxis,helper)),z=cross(x,uPrimaryAxis);
 vec3 local=vec3(-heading.x*p.x+heading.y*p.z,p.y,-heading.y*p.x-heading.x*p.z);
 return x*local.x+uPrimaryAxis*local.y+z*local.z;
}
${warp?WARP_TRACE_GLSL.replaceAll('__WARP_TRACE_STEPS__',photo?'384':ultra?'192':'96').replaceAll('__WARP_TRACE_BUDGET__',photo?'384':ultra?'192':'96'):NO_WARP_TRACE_GLSL}

vec3 rayFromFrame(vec3 forward,vec3 right,vec3 up,vec2 uv,float fov){
 vec3 eye=vec3(uv*fov,-1.0);
 if(uProjectionMode==1){vec2 ndc=uv*vec2(2.0*uResolution.y/uResolution.x,2.0);eye=(uInverseProjection*vec4(ndc,-1.0,1.0)).xyz;}
 return unit(right*eye.x+up*eye.y-forward*eye.z);
}
vec4 inspector(vec2 uv,float fov){
 if(uInspectIndex<0||localWarpPass())return vec4(0);
 vec4 tint=vec4(0);vec2 heading=vec2(1,0);float luminosity=1.0;
 for(int j=0;j<12;j++){if(j==uInspectIndex){tint=uColors[j];heading=uHeadings[j];luminosity=uLuminosities[j];}}
 vec3 ro=uInspectCamera,rd=rayFromFrame(uInspectForward,uInspectRight,uInspectUp,uv,fov);
 if(tint.a>2.5){
  CraftSurface surface=craftHit(ro,rd,10000.0,tint.a);
  float normalSize=dot(surface.normal,surface.normal);
  if(!(surface.t>=0.0&&surface.t<=10000.0&&normalSize>.5&&normalSize<1.5))return vec4(0);
  vec3 light=unit(vec3(-.4,.85,.65)),reflection=craftWorld(reflect(rd,surface.normal),heading);
  vec3 color=shadeCraft(surface,ro+rd*surface.t,rd,light,sky(reflection));
  color=surfaceSpectrum(color,max(dot(surface.normal,light),0.0),surface.material>19.5?.72:.35,(surface.material>4.5&&surface.material<5.5)?.98:.5);
  return vec4(color,1);
 }
 vec4 hit=ellipsoidHit(ro,rd,vec3(0),vec3(1));if(!(hit.w>=0.0&&hit.w<1e20))return vec4(0);
 vec3 normal=hit.xyz,color=tint.rgb;
 if(tint.a>1.5){float granulation=noise(normal*9.0+uTime*.1);color=stellarSpectrum(color*(2.5+granulation*1.1),granulation);}
 else if(tint.a>.5){color*=1.3+.6*noise(normal*6.0);color=surfaceSpectrum(color,max(dot(normal,unit(vec3(-.4,.85,.65))),0.0),.35,.6);${probe?'color*=max(1.0,luminosity);':''}}
 else {float land=fbm(normal*4.0),light=max(0.0,dot(normal,unit(vec3(-.4,.85,.65))));color=mix(color,color*vec3(.7,1.1,.65),smoothstep(.49,.56,land));color=mix(color,vec3(.8,.86,.9),smoothstep(.64,.74,land)*.7);color=color*(.12+light*.95)+vec3(.08,.22,.4)*pow(1.0-max(0.0,dot(normal,-rd)),3.0);color=surfaceSpectrum(color,light,.12+.14*land,.05);}
 return vec4(color,1);
}

vec4 objectHit(vec3 p,vec3 previous,vec3 tangent,out float fraction){
 vec3 segment=p-previous;float segmentLength=max(length(segment),1e-20);vec3 rd=segment/segmentLength;
 // A numerical distance sentinel alone is unsafe: adding .001 can round back
 // to segmentLength at astronomical scales and turn a miss into an opaque hit.
 float nearest=segmentLength;bool found=false;vec3 closestColor=vec3(0);fraction=1.0;
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;
  if(j==uHideObjectIndex||j==uInspectIndex||(localWarpPass()&&j==uWarpObjectIndex))continue;
  vec4 obj=uObjects[j];if(obj.w<=1e-20)continue;
  vec3 ro=(previous-obj.xyz)/obj.w,offAxis=cross(ro,rd);
  float b=dot(ro,rd),disc=1.0-dot(offAxis,offAxis);
  if(!(disc>=0.0))continue;
  float root=sqrt(disc),enter=-b-root,leave=-b+root,maximum=min(segmentLength,nearest)/obj.w;
  if(!(leave>=0.0&&enter<=maximum&&maximum<1e30))continue;
  float type=uColors[j].a,t=max(0.0,enter);vec3 color=uColors[j].rgb,normal;
  if(type>2.5){
   vec2 heading=uHeadings[j];
   // Trace the model from its nearby bounding-sphere entry. Primitive quadratics
   // otherwise subtract enormous, nearly equal values for metre-sized craft.
   float shiftedAlong=max(b,-root-.01),advance=shiftedAlong-b;
   vec3 localOrigin=craftFrame(cross(rd,offAxis)+rd*shiftedAlong,heading),localDirection=craftFrame(rd,heading);
   float localMaximum=min(maximum-advance,2.1);
   CraftSurface surface=craftHit(localOrigin,localDirection,localMaximum,type);
   float normalSize=dot(surface.normal,surface.normal);
   if(!(surface.t>=0.0&&surface.t<=localMaximum&&normalSize>.5&&normalSize<1.5))continue;
   t=surface.t+advance;normal=surface.normal;vec3 hit=localOrigin+localDirection*surface.t;
   vec3 light=unit(craftFrame(uHoles[0].xyz-obj.xyz+uPrimaryAxis*1.7*uMass,heading));
   vec3 reflection=craftWorld(reflect(localDirection,surface.normal),heading);
   color=shadeCraft(surface,hit,localDirection,light,sky(reflection));
   color=surfaceSpectrum(color,max(dot(surface.normal,light),0.0),surface.material>19.5?.72:.35,(surface.material>4.5&&surface.material<5.5)?.98:.5);
  }else{
   if(t<.000001)t=leave;if(!(t>=0.0&&t<=maximum))continue;
   normal=unit(cross(rd,offAxis)+rd*(enter>=.000001?-root:root));
   if(type>1.5){float n=noise(normal*9.0+uTime*.1);color=stellarSpectrum(color*(2.5+n*1.1),n);}
   else if(type>.5){color*=1.3+.6*noise(normal*6.0);color=surfaceSpectrum(color,max(dot(normal,unit(uHoles[0].xyz-obj.xyz)),0.0),.35,.6);${probe?'color*=max(1.0,uLuminosities[j]);':''}}
   else{
    float detail=fbm(normal*4.0+float(j)),land=smoothstep(.49,.56,detail);
    color=mix(color,color*vec3(.7,1.1,.65),land);color=mix(color,vec3(.76,.84,.87),smoothstep(.64,.74,detail)*.7);
    float cloud=pow(noise(normal*13.0+vec3(uTime*.03,0,0)),8.0);color=mix(color,vec3(.9),cloud*.8);
    float light=max(dot(normal,unit(uHoles[0].xyz-obj.xyz+vec3(0,1.7*uMass,0))),0.0);
    float atmosphere=pow(1.0-max(dot(normal,-unit(tangent)),0.0),3.0);
    color=color*(.045+light*.95)+vec3(.13,.42,.8)*atmosphere*.35;
    color=surfaceSpectrum(color,light,.12+.14*detail,.05);
   }
  }
  nearest=t*obj.w;closestColor=color;found=true;
 }
 if(found){fraction=clamp(nearest/segmentLength,0.0,1.0);return vec4(closestColor,1);}
 return vec4(0);
}


vec3 horizonOverlay(vec3 camera,vec3 original,vec3 right,vec3 up,float pixelAngle){
 if(uFlags2.w<.5||uWarpFlags.w<.5)return vec3(0);
 vec3 sum=vec3(0);
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  vec3 toward=uHoles[k].xyz-camera;float forward=dot(toward,original);
  if(forward<=0.0)continue;
  float impact=length(cross(toward,original));
  float width=max(uHoles[k].w*.015,length(toward)*pixelAngle*1.3);
  float rim=1.0-smoothstep(width,width*2.0,abs(impact-horizonFor(k)));
  float angle=atan(dot(original,up),dot(original,right));
  float dash=smoothstep(-.2,.2,sin(angle*36.0));
  sum+=vec3(.08,.64,.96)*rim*dash*.8;
 }
 return sum;
}

${bridge?bridgeGLSL({ultra,photo,photoSteps:photoBudget,probe}):''}
void main(){
 vec2 uv=(gl_FragCoord.xy-uRayViewport.xy+uPhotoOffset+uPhotoJitter-.5*uResolution)/uResolution.y;
 vec3 camera=uObserver,forward=unit(uForward),right=unit(uRight),up=unit(uUp);
 float fov=.83*max(1.0,1.35*uResolution.y/uResolution.x);
 ${craft&&(craftMask&2)?'if(uCockpitMode==1&&uProjectionMode==0)fov=max(fov,1.25);':''}
 vec3 original=rayFromFrame(forward,right,up,uv,fov),v=original,p=camera,color=vec3(0);
 ${craft&&(craftMask&2)?`if(uCockpitMode==1){
  vec3 localRay=rayFromFrame(uInspectForward,uInspectRight,uInspectUp,uv,fov);
  vec4 cabin=shuttleCockpit(uInspectCamera,localRay,vec3(0));
  if(cabin.a>.5){
   vec3 interior=surfaceSpectrum(cabin.rgb,.65,.28,.25);
   interior=pow(vec3(1)-exp(-max(interior*uExposure,vec3(0))),vec3(.92));
   interior*=1.0-.22*smoothstep(.35,1.3,length(uv));gl_FragColor=vec4(interior,1);return;
  }
 }`:''}
 float trans=1.0,nearRadius=100000.0,travelled=0.0;
 float pixelAngle=uProjectionMode==1?length(rayFromFrame(forward,right,up,uv+vec2(0,1.0/uResolution.y),fov)-original):fov/uResolution.y;
 bool swallowed=false,object=false,miss=false,localWarp=localWarpPass();
 vec4 inspected=vec4(0);if(uInspectIndex>=0)inspected=inspector(uv,fov);
 if(inspected.a>.5){color=inspected.rgb;object=true;miss=true;}
 ${bridge?`if(uBridge.x>.5){
  if(!object)color=bridgeTrace(camera,original,pixelAngle);
  ${probe?'color+=probeInspectorEmission(uv,fov);':''}
  color=pow(vec3(1)-exp(-max(color*uExposure,vec3(0))),vec3(.92));
  color*=1.0-.22*smoothstep(.35,1.3,length(uv));gl_FragColor=vec4(color,1);return;
 }`:''}
 vec3 warpColor=vec3(0);float warpTrans=1.0;bool warpObject=false;
 if(!object&&localWarp){
  warpLocalTrace(original,v,warpColor,warpTrans,warpObject);
  if(warpObject){color=warpColor;object=true;miss=true;}
  else if(uWarpFlags.w<.5)miss=true;
 }
 // Only integrate the compact near field. Far observers skip empty space;
 // rays missing it take the sky fast path instead of exhausting ray steps.
 if(!miss&&!object&&length(camera)>uBounds){
  float b=dot(camera,v),c=dot(camera,camera)-uBounds*uBounds,disc=b*b-c;
  if(disc<0.0)miss=true;
  else{float enter=-b-sqrt(max(0.0,disc));if(enter<0.0)miss=true;else p=camera+v*max(0.0,enter-uMass*.03);}
 }
 if(!miss&&uFlags.x>.5){
  vec4 entryGrid=coordinateGridSegment(camera,p,0.0,pixelAngle);
  color+=trans*entryGrid.rgb;trans*=1.0-entryGrid.a;travelled=length(p-camera);
 }
 if(!miss){
  for(int i=0;i<${photo?photoBudget:ultra?768:288};i++){
   if(i>=uSteps)break;
   float closest=100000.0,stepLimit=max(.000001,uBounds*.06);
   for(int k=0;k<2;k++){
    if(uWarpFlags.w<.5)break;
    if(k==1&&uBinary==0)break;
    float r=length(p-uHoles[k].xyz),m=uHoles[k].w;
    closest=min(closest,r);nearRadius=min(nearRadius,r/m);
    if(r<horizonFor(k)){swallowed=true;break;}
    float h=max(r*.065,.045*m)*320.0/float(uSteps);
    h=min(h,max(${photo?'.002':'.018'}*m,(r-horizonFor(k))*.35));
    stepLimit=min(stepLimit,h);
   }
   if(swallowed)break;
   if(length(p)>uBounds+uMass*.05&&dot(p,v)>0.0)break;
   if(uWarpFlags.x>.5&&!localWarp){
    float wr=length(p-uWarpCenter)/max(uWarpRadius,1e-20);
    if(wr<2.8)stepLimit=min(stepLimit,uWarpRadius*clamp(.022+abs(wr-1.0)*.12,.022,.18)*288.0/float(uSteps));
   }
   float dt=stepLimit;
   vec3 previous=p,a=force(p,v),midV=v+a*dt*.5,midP=p+v*dt*.5;
   v+=force(midP,midV)*dt;p+=midV*dt;
   float hitFraction=1.0;vec4 obj=vec4(0);
   if(uObjectCount>0)obj=objectHit(p,previous,v,hitFraction);
   p=mix(previous,p,hitFraction);dt*=hitFraction;
   if(uFlags.x>.5){
    vec4 grid=coordinateGridSegment(previous,p,travelled,pixelAngle);
    color+=trans*grid.rgb;trans*=1.0-grid.a;travelled+=length(p-previous);
   }
   vec3 sampleP=(p+previous)*.5;
   vec4 d=discAt(p,previous,v,dt);color+=trans*d.rgb;trans*=1.0-d.a;
   color+=trans*jetField(previous,p,dt);
   ${probe?'color+=trans*probeEmissionSegment(previous,p);':''}
   color+=trans*whiteHoleEmission(sampleP,dt);
   vec4 tail=debris(sampleP,dt);color+=trans*tail.rgb;trans*=1.0-tail.a;
   vec4 warp=warpWorldAppearance(p,previous,dt);color+=trans*warp.rgb;trans*=1.0-warp.a;
   if(obj.a>.5){color+=trans*obj.rgb;object=true;break;}
   if(trans<.015)break;
  }
 }
 if(!swallowed&&!object){
  if(uFlags.x>.5){vec4 grid=coordinateGridEscape(p,unit(v),travelled,pixelAngle);color+=trans*grid.rgb;trans*=1.0-grid.a;}
  color+=sky(unit(v))*trans;
 }
 if(!swallowed&&!object&&uFlags.y>.5&&uWarpFlags.w>.5){float glow=exp(-abs(nearRadius-3.05)*2.2)*.045;vec3 glowHue=uSpectrum==2?vec3(.3,.6,1):uSpectrum==1?vec3(.6,.12,.035):uSpectrum==3?vec3(.95,.35,.08):uSpectrum==4?vec3(.06,.015,.09):vec3(1,.56,.22);color+=glowHue*glow;}
 if(!warpObject&&localWarp&&inspected.a<.5)color=warpColor+warpTrans*color;
 ${probe?'color+=probeInspectorEmission(uv,fov);':''}

 color*=uExposure;color=vec3(1)-exp(-max(color,vec3(0)));color=pow(color,vec3(.92));
 float vignette=1.0-.22*smoothstep(.35,1.3,length(uv));
 color=color*vignette+horizonOverlay(camera,original,right,up,fov/uResolution.y);
 gl_FragColor=vec4(color,1);
}
`;
}

export const FRAGMENT=createFragment();
