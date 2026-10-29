import { ANOMALY_GLSL } from './anomaly-glsl.js';
import { DYSON_GLSL } from './dyson-glsl.js';
import { createCraftGLSL } from './craft-glsl.js';
import { warpFieldGLSL, WARP_TRACE_GLSL } from './warp-glsl.js';
import { coordinateGridGLSL } from './grid-glsl.js';
import { bridgeGLSL } from './bridge-glsl.js';
import { TIDAL_STREAM_GLSL } from './tidal-stream.js';

import { planetMaterialGLSL } from './planet-glsl.js';
import { METRIC_GLSL } from './metric-glsl.js';
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
export function createFragment({anomaly=false,ultra=false,photo=false,photoSteps=3072,craft=false,craftMask=15,warp=false,grid=false,bridge=false,probe=false,stellar=false,rings=false,bodyGravity=false,planetary=false,attachments=false,dyson=false,diagnostics=false,derivatives=false,derivativeExtension=false,objectSlots=12}={}) {
 const slots=[2,4,6,8,12].includes(objectSlots)?objectSlots:12;
 const photoBudget=[1024,1536,3072].includes(photoSteps)?photoSteps:3072;
 craft=craft||warp||bridge;
 craftMask=(Number.isInteger(craftMask)?craftMask:15)&31;
 // A bridge can carry any supported traveler. Only a warp field intrinsically
 // requires Enterprise geometry; do not compile an unused ship for the bridge.
 if(warp)craftMask|=8;
 return `
${derivativeExtension?'#extension GL_OES_standard_derivatives : enable':''}
precision highp float;
uniform vec2 uResolution,uPhotoOffset,uPhotoJitter;
uniform vec4 uRayViewport,uBridge;
uniform mat4 uInverseProjection;
uniform int uProjectionMode;
uniform float uWhiteHole;
uniform vec3 uBridgeSkyColor,uBridgeGridAxis,uBridgeStage,uBridgeBubbleAxis;
uniform vec4 uBridgeBubble;
uniform vec4 uBridgeSkyParams;
uniform float uBridgeOtherNebula;
uniform int uCockpitMode;
${photo?'uniform float uPhotoDetail;':''}
uniform float uStellarTime,uTime,uExposure,uDistance,uYaw,uPitch,uLookYaw,uLookPitch,uMass,uBounds,uStars,uDetail;
uniform vec3 uPrimaryAxis,uSecondaryAxis;
uniform vec2 uSpin,uHorizon,uIsco,uDiskOuter;
uniform vec4 uHoles[2];
uniform vec4 uFlags,uFlags2,uDiskParams,uNebulaParams,uJets,uTidal;
uniform vec3 uDiskColor,uNebulaColor,uJetColor,uStarColor,uDiskSecondaryColor,uJetSecondaryColor;
uniform vec4 uDiskSecondaryParams,uJetSecondaryParams;
uniform vec4 uMetricOptions,uSceneOptions,uFlightMetrics;
uniform vec2 uJetStructure;
uniform int uSpectrum,uBinary,uSteps,uObjectCount,uGravityCount;
uniform vec4 uObjects[12],uColors[12],uBodyParams[12];
uniform float uBodyMasses[12];
uniform vec4 uBodyOpacity[3];
uniform int uTransparentBodies;
uniform vec4 uBodyShape[12];
uniform vec2 uBridgeStars;
uniform vec4 uSkyParams;
uniform float uLuminosities[12];
uniform vec2 uHeadings[12];
uniform vec3 uObserver,uForward,uRight,uUp;
uniform int uInspectIndex,uHideObjectIndex,uWarpObjectIndex,uDriveIndex;
uniform vec3 uDriveRight,uDriveUp,uDriveForward;
uniform vec3 uInspectCamera,uInspectForward,uInspectRight,uInspectUp;
uniform vec3 uWarpCenter,uWarpAxis,uWarpObserver;
uniform vec2 uWarpGridOffset,uWarpGridRotation;
uniform float uWarpRadius,uWarpStrength,uWarpThickness;
uniform vec4 uWarpFlags,uWarpMotion;
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
float bodyOpacity(int j){
 if(uSpectrum==5)return 1.0;
 // Constant uniform indices keep the packed opacity data portable to WebGL1.
 vec4 values=j<4?uBodyOpacity[0]:j<8?uBodyOpacity[1]:uBodyOpacity[2];
 vec4 choose=vec4(1)-step(vec4(.5),abs(vec4(0,1,2,3)-mod(float(j),4.0)));
 return dot(values,choose);
}
bool sceneTransparent(){return uSpectrum!=5&&uTransparentBodies>0;}
vec3 unit(vec3 v){return v/max(length(v),1e-20);}
vec3 axisFor(int k){return k==0?uPrimaryAxis:uSecondaryAxis;}
float spinFor(int k){return k==0?uSpin.x:uSpin.y;}
float horizonFor(int k){return k==0?uHorizon.x:uHorizon.y;}
float iscoFor(int k){return k==0?uIsco.x:uIsco.y;}
float outerFor(int k){return k==0?uDiskOuter.x:uDiskOuter.y;}
float whiteFor(int k){return k==0?uWhiteHole:uSceneOptions.x;}

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
 if(uSpectrum==5)return vec3(0);
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
vec3 stellarSpectrum(vec3 visible,float granulation,float style){
 if(uSpectrum==5)return vec3(0);
 if(uSpectrum==0)return visible;
 // A TZO is observed through an opaque, cool supergiant envelope. The
 // hidden neutron-star core is not an exposed X-ray or gamma-ray source.
 if(style>6.5&&style<7.5){
  if(uSpectrum==1)return thermalPalette(.57+granulation*.13)*(1.1+.45*granulation);
  if(uSpectrum==3)return vec3(.34,.22,.20)*(.002+.003*granulation);
  if(uSpectrum==4)return vec3(.30,.23,.45)*.00001;
  return vec3(.20,.50,.95)*(.0004+.0006*granulation);
 }
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

// A bounded non-trigonometric hash avoids correlated low bits in large sin()
// arguments on mobile drivers. Independent layers use different sky rotations.
float starHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.x+p.y)*p.z);}
${warp?`
// Each original sky layer follows a one-to-one radial angular flow.
// Layer renewal happens only at zero opacity, staggered across the existing
// layers. Zero phase is exactly the ordinary sky, with no folded-pole rings.
vec4 warpStarSampleDirection(vec3 direction,float layer){
 if(uWarpMotion.w<.5||uBridge.x>.5)return vec4(direction,1);
 float initial=.25+.25*layer,phase=fract(uWarpMotion.x+initial),shift=(phase-initial)*3.0;
 float k=exp(-shift),mu=clamp(dot(direction,uDriveForward),-1.0,1.0);
 float denominator=max(1e-6,1.0+mu+k*k*(1.0-mu));
 float mapped=(1.0+mu-k*k*(1.0-mu))/denominator;
 vec3 sampleDirection=uDriveForward*mapped+(direction-uDriveForward*mu)*(2.0*k/denominator);
 // Wider high-speed renewal fades span several frames even near 15 Hz.
 float edge=mix(.10,.18,smoothstep(.05,.65,uWarpMotion.y));
 float visibility=smoothstep(0.0,edge,phase)*(1.0-smoothstep(1.0-edge,1.0,phase));
 return vec4(unit(sampleDirection),visibility);
}
float warpStarElongation(){
 if(uWarpMotion.w<.5||uBridge.x>.5)return 0.0;
 // Stretch begins between warp 2 and 3, then grows gently on a logarithmic
 // scale. The vehicle's actual speed is not altered by this display mapping.
 float beta=max(0.0,uWarpMotion.z);
 return smoothstep(10.07937,38.94074,beta)*clamp(log(1.0+beta/38.94074)/8.542,0.0,1.0);
}
`:''}
vec3 skyWithEnvironmentChart(vec3 direction,vec3 starRay,vec4 nebulaParams,vec3 nebulaColor,float starDensity,float brightness,float variety){
 if(uSpectrum==5)return vec3(0);
 vec3 dir=unit(direction),c=vec3(.0008,.0014,.0025);
 // The isolated pilot sky fades diffuse clouds with the smoothed star
 // motion, before recognizable streaking. No extra texture/noise samples.
 ${warp?'float skyHaze=uWarpMotion.w>.5&&uBridge.x<.5?1.0-smoothstep(0.0,.006,uWarpMotion.y):1.0;':'float skyHaze=1.0;'}
 nebulaParams.z*=skyHaze;
 vec2 uv=vec2(atan(dir.z,dir.x)/(2.0*PI)+.5,asin(clamp(dir.y,-1.0,1.0))/PI+.5);
 if(starDensity>0.0){
  if(skyHaze>0.0){
  float dust=detailedFbm(dir*4.0+vec3(3.2,8.1,1.4));
  float band=exp(-pow((dir.y+.19*dir.x-.15*dir.z)*2.8,2.0));
  float backgroundBand=uSpectrum==2?.07:(uSpectrum==1?1.7:1.0);
  vec3 milkyWay=(vec3(.014,.019,.032)*band*dust*dust+vec3(.018,.010,.028)*pow(dust,4.0)*band);
  if(uSpectrum==1)milkyWay=mix(vec3(.06,.012,.025),vec3(.22,.065,.018),dust)*band*pow(dust,3.0);
  if(uSpectrum==2)milkyWay=vec3(.005,.015,.03)*pow(dust,7.0)*band;
  if(uSpectrum==3){milkyWay=mix(vec3(.016,.008,.024),vec3(.035,.021,.008),dust)*band*dust*dust;backgroundBand=.7;}
  if(uSpectrum==4){milkyWay=vec3(.024,.009,.039)*pow(dust,8.0)*band;backgroundBand=.15;}
  c+=milkyWay*backgroundBand*skyHaze;
  }
  ${warp?'float elongation=warpStarElongation();':''}
  for(int j=0;j<3;j++){
   if(j==2&&uDetail<.5)break;
   ${warp?'vec4 starChart=warpStarSampleDirection(starRay,float(j));vec3 sd=starChart.xyz;float starOpacity=starChart.w;':'vec3 sd=starRay;float starOpacity=1.0;'}sd.xz=rot(float(j)*1.934)*sd.xz;sd.xy=rot(float(j)*.791)*sd.xy;
   vec2 suv=vec2(atan(sd.z,sd.x)/(2.0*PI)+.5,asin(clamp(sd.y,-1.0,1.0))/PI+.5);
   float n=277.0+float(j)*223.7;
   vec2 p=suv*vec2(n*2.0,n),cell=floor(p),q=fract(p);
   vec3 seed=vec3(cell,float(j)*37.31);
   float h=starHash(seed),temperature=starHash(seed+17.81);
   q-=vec2(starHash(seed+11.7),starHash(seed+67.9));
   float rad=.018+.075*pow(starHash(seed+5.9),3.0),pix=max(.014,n/uResolution.y*.35);
   float star=1.0-smoothstep(rad,rad+pix,length(q));
   float halo=exp(-length(q)*22.0)*.10;
   ${warp?`if(elongation>0.00001){
    vec3 axis=uDriveForward;axis.xz=rot(float(j)*1.934)*axis.xz;axis.xy=rot(float(j)*.791)*axis.xy;
    float horizontal=max(length(sd.xz),.025),projection=dot(axis,sd);
    vec2 flow=vec2((sd.x*axis.z-sd.z*axis.x)/(horizontal*horizontal),(axis.y-projection*sd.y)/horizontal);
    flow/=max(length(flow),.00001);
    float across=dot(q,vec2(-flow.y,flow.x)),along=dot(q,flow);
    float width=max(.018,rad*.6+pix*.75),lengthSigma=width+.25*elongation+.10*smoothstep(.05,.65,uWarpMotion.y);
    float gaussian=exp(-.5*(across*across/(width*width)+along*along/(lengthSigma*lengthSigma)));
    // A soft edge window prevents clipped rectangular tails at a seed cell.
    vec2 edge=min(fract(p),1.0-fract(p));float taper=smoothstep(0.0,.055,edge.x)*smoothstep(0.0,.055,edge.y);
    float blend=smoothstep(10.07937,38.94074,uWarpMotion.z);
    star=mix(star,gaussian*taper*1.7,blend);halo=mix(halo,gaussian*.13*taper,blend);
   }`:''}
   float gate=step(1.0-(.0065+float(j)*.0007)*starDensity*max(.08,sqrt(1.0-sd.y*sd.y)),h);
   vec3 tint=mix(vec3(.42,.64,1),vec3(1,.55,.24),temperature);
   tint=mix(vec3(.85,.9,1),tint,clamp(variety,0.0,1.0));
   float bandWeight=1.0;
   if(uSpectrum==1){tint=mix(vec3(.9,.24,.08),vec3(1,.77,.35),temperature);bandWeight=.4+temperature*.65;}
   if(uSpectrum==2){tint=vec3(.32,.65,1.0);bandWeight=starHash(seed+43.0)>.978?1.7:.006;}
   if(uSpectrum==3){tint=mix(vec3(.24,.68,.90),vec3(1,.48,.15),temperature);bandWeight=starHash(seed+43.0)>.987?.9:.002;}
   if(uSpectrum==4){tint=vec3(.70,.48,1);bandWeight=starHash(seed+43.0)>.997?1.4:.0001;}
   c+=tint*(star+halo)*gate*(.10+pow(starHash(seed+3.8),8.0)*3.2)*bandWeight*brightness*starOpacity;
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

vec3 skyWithEnvironment(vec3 direction,vec4 parameters,vec3 tint,float density,float brightness,float variety){return skyWithEnvironmentChart(direction,unit(direction),parameters,tint,density,brightness,variety);}
${warp?`
vec3 skyForWarpTravel(vec3 direction,vec3 original){
 // Only the open-space cinematic star chart unfolds toward the camera rays.
 // This keeps a readable cone inside the bubble. Diffuse clouds fade with
 // motion; every non-isolated scene retains ordinary traced optical directions.
 float unfold=uWarpMotion.w>.5&&uBridge.x<.5?smoothstep(10.07937,38.94074,uWarpMotion.z):0.0;
 vec3 stars=unit(mix(direction,original,unfold));
 return skyWithEnvironmentChart(direction,stars,vec4(uNebulaParams.xy,uNebulaParams.z*uFlags2.y,uNebulaParams.w),uNebulaColor,uFlags2.x>.5?uStars:0.0,uSkyParams.x,uSkyParams.y);
}
`:''}
vec3 skyWithNebula(vec3 direction,vec4 parameters,vec3 tint){return skyWithEnvironment(direction,parameters,tint,uFlags2.x>.5?uStars:0.0,uSkyParams.x,uSkyParams.y);}
vec3 sky(vec3 direction){return skyWithNebula(direction,vec4(uNebulaParams.xy,uNebulaParams.z*uFlags2.y,uNebulaParams.w),uNebulaColor);}

${warp?warpFieldGLSL({grid}):NO_WARP_GLSL}

${anomaly?ANOMALY_GLSL:''}
${grid?coordinateGridGLSL({warp,anomaly}):NO_GRID_GLSL}

vec3 force(vec3 p,vec3 v){
 if(uFlags.z<.5||uMetricOptions.w>.5)return vec3(0);
 vec3 total=warpWorldForce(p,v)${anomaly?'+anomalyForce(p,v)':''};
 ${bodyGravity?`for(int j=0;j<12;j++){
  if(j>=uGravityCount)break;float type=uColors[j].a;if(type>.5&&!(type>1.5&&type<2.5))continue;
  float mass=uBodyMasses[j]/4300000.0;if(mass<=0.0)continue;
  vec3 q=p-uObjects[j].xyz;float rr=max(dot(q,q),uObjects[j].w*uObjects[j].w),r=sqrt(max(rr,1e-30));
  vec3 angular=cross(q,v);total-=3.0*mass*dot(angular,angular)*q/max(rr*rr*r,1e-30);
 }`:''}
 if(uWarpFlags.w<.5)return total;
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  vec3 q=p-uHoles[k].xyz;float m=uHoles[k].w;if(m<=0.0)continue;
  float rr=max(dot(q,q),m*m*.05),r=sqrt(rr);
  vec3 angular=cross(q,v);
  total-=3.0*m*dot(angular,angular)*q/(rr*rr*r);
  // Illustrative gravitomagnetic term. It vanishes exactly for zero spin.
  total+=spinFor(k)*.23*m*m*cross(axisFor(k),v)/(rr*r);
 }
 return total;
}

vec4 discAt(vec3 p,vec3 previous,vec3 tangent,float dt){
 if(uSpectrum==5||(uFlags.y<.5&&uDiskSecondaryParams.w<.5)||uWarpFlags.w<.5)return vec4(0);
 vec3 color=vec3(0);float alpha=0.0;
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  if((k==0?uFlags.y:uDiskSecondaryParams.w)<.5)continue;
  vec4 diskParams=k==0?uDiskParams:uDiskSecondaryParams;vec3 diskColor=k==0?uDiskColor:uDiskSecondaryColor;
  float m=uHoles[k].w;if(m<=0.0)continue;float inner=iscoFor(k),outer=outerFor(k)/m;
  if(outer<inner+.06)continue;
  vec3 axis=axisFor(k),q0=localPoint(previous-uHoles[k].xyz,axis),q1=localPoint(p-uHoles[k].xyz,axis);
  vec3 q=(q0+q1)*.5;float sampleDt=dt;
  if(q0.y*q1.y<0.0){
   q=mix(q0,q1,q0.y/(q0.y-q1.y));
   ${photo?'sampleDt=dt;':'sampleDt=max(dt,.14*m*diskParams.y/max(abs(dot(unit(tangent),axis)),.12));'}
  }
  float r=length(q.xz)/m;
  if(r<inner||r>outer)continue;
  float thick=.075*diskParams.y*(1.0+r*.06)*m;
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
  float density=vertical*rim*(.5+turbulence)*streak*diskParams.z;
  ${photo?'density*=.62+.8*plasma.x;':''}
  // Two editable procedural emission studies, sampled along the same bent rays
  // as every other disc. Their structure is world-space, not a screen overlay.
  float ribbon=0.0,ribbonFine=0.0;
  if(diskParams.x>5.5){
   // Long sheared arcs: cylindrical coordinates keep the noise continuous at
   // the angular seam while its radial drift prevents ruler-spaced rings.
   vec2 flowAngle=vec2(cos(angle),sin(angle));flowAngle=rot(r*.12-orbit*.10)*flowAngle;
   float drift=noise(vec3(r*.38,flowAngle*2.2)+vec3(1.7,4.3,8.1));
   float arcStrength=smoothstep(.22,.72,noise(vec3(r*.23,flowAngle*3.5)+vec3(12.2,3.1,6.4)));
   float sheetPhase=r*1.05+drift*5.4+.55*sin(angle*3.0+r*.36-orbit*.19);
   float pixelWidth=length(p-uObserver)/max(m,1e-12)*.83/max(uResolution.y,1.0);
   float lineWidth=clamp(.45+pixelWidth*2.5,.45,.9);
   ribbon=exp(-pow(sin(sheetPhase)/lineWidth,2.0))*(.16+1.15*arcStrength);
   if(uDetail>.5)ribbonFine=exp(-pow(sin(r*3.4+drift*8.1+sin(angle)*.35-orbit*.22)/max(lineWidth,.5),2.0))*.14*arcStrength;
   ${ultra||photo?'if(uDetail>2.5)ribbonFine+=exp(-pow(sin(r*7.3+drift*13.0+sin(angle*7.0-orbit)) / max(lineWidth,.5),2.0))*.06*arcStrength;':''}
   density=vertical*rim*diskParams.z*(.10+.36*ribbon+ribbonFine)*(.75+.4*turbulence);
  }else if(diskParams.x>4.5){
   density*=.75+.55*smoothstep(.2,.8,turbulence);
  }
  float absorb=1.0-exp(-density*sampleDt/max(thick,.001)*.95);
  vec3 hue=mix(vec3(.62,.15,.026),vec3(1,.57,.19),smoothstep(.15,.5,hot));
  hue=mix(hue,vec3(1,.91,.73),smoothstep(.4,1.0,hot));
  // Color is an editable emission palette, not a solved chemical spectrum.
  hue*=mix(vec3(1),diskColor/vec3(1,.839,.604),.65);
  if(diskParams.x>.5&&diskParams.x<1.5)hue=mix(diskColor*vec3(1,.28,.4),vec3(1,.82,.83),hot);
  else if(diskParams.x>1.5&&diskParams.x<2.5)hue=mix(diskColor*vec3(.47,.63,1),vec3(.82,.91,1),hot);
  else if(diskParams.x>2.5&&diskParams.x<3.5)hue=mix(diskColor*.23,diskColor*.9,hot);
  else if(diskParams.x>3.5&&diskParams.x<4.5)hue=mix(diskColor*.45,mix(diskColor,vec3(1),.65),hot);
  else if(diskParams.x>5.5)hue=mix(diskColor*vec3(.12,.30,1.15),mix(diskColor,vec3(.25,.70,1),.4),clamp(ribbon*.65+ribbonFine+hot*.2,0.0,1.0));
  else if(diskParams.x>4.5)hue=mix(diskColor*vec3(.45,.9,1.25),vec3(.92,.98,1),smoothstep(.08,.75,hot)*.75+.2);
  if((k==0?uSceneOptions.z:uSceneOptions.w)>.5)hue=diskColor*(.35+1.1*hot)+vec3(.07)*pow(hot,8.0);
  if((k==0?uSceneOptions.z:uSceneOptions.w)>1.5)hue=(.52+.48*cos(6.28318530718*(vec3(0,.333,.667)+r*.11-sin(angle)*.12-orbit*.025)))*(.55+hot);
  vec3 localV=localPoint(tangent,axis),orbital=unit(vec3(q.z,0,-q.x));
  float beta=min(.65,sqrt(1.0/max(r,2.0)));
  float doppler=1.0/(1.0+beta*dot(orbital,unit(localV)));
  float redshift=sqrt(max(.05,1.0-2.0/max(r,2.1)));
  float spectral=1.0;
  if(uSpectrum==1){spectral=.15+2.5*pow(1.0-hot,1.2);hue=mix(diskColor,vec3(1,.32,.10),.55);if(diskParams.x>2.5&&diskParams.x<3.5)spectral*=1.7;}
  if(uSpectrum==2){spectral=.025+5.0*pow(hot,5.0);hue=mix(vec3(.20,.30,.95),vec3(.78,.95,1),hot);if(diskParams.x>2.5&&diskParams.x<4.5)spectral*=.12;}
  if(uSpectrum==3){spectral=.20+1.7*pow(hot,.7);hue=mix(vec3(.24,.025,.10),vec3(1,.58,.17),sqrt(hot));if(diskParams.x>2.5&&diskParams.x<4.5)spectral*=.18;}
  // Illustrative energetic inner corona; gamma emission is localized, not a
  // false-color copy of the entire optical disc or its cold outer dust.
  if(uSpectrum==4){spectral=.0004+2.4*pow(hot,9.0)*pow(turbulence,2.0);hue=mix(vec3(.40,.10,.72),vec3(.92,.84,1),hot);if(diskParams.x>2.5&&diskParams.x<4.5)spectral*=.015;}
  vec3 emit=hue*(.58+radial*2.4)*pow(doppler,2.8)*redshift*spectral;
  if(diskParams.x>5.5)emit*=.8+2.0*ribbon+.8*ribbonFine;
  else if(diskParams.x>4.5)emit*=3.4+.9*turbulence;
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
 if(uSpectrum==5||(uFlags.w<.5&&uJetSecondaryParams.w<.5)||uWarpFlags.w<.5)return vec3(0);
 vec3 sum=vec3(0);
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;
  if((k==0?uFlags.w:uJetSecondaryParams.w)<.5)continue;
  vec4 jetParams=k==0?uJets:uJetSecondaryParams;vec3 jetColor=k==0?uJetColor:uJetSecondaryColor;
  float m=uHoles[k].w;if(m<=0.0)continue;
  vec3 start=localPoint(previous-uHoles[k].xyz,axisFor(k))/m,end=localPoint(next-uHoles[k].xyz,axisFor(k))/m;
  vec2 delta=end.xz-start.xz;
  float closest=clamp(-dot(start.xz,delta)/max(dot(delta,delta),1e-10),0.0,1.0);
  vec3 q=mix(start,end,closest);float y=abs(q.y),r=length(q.xz),cone=.12+y*.065*jetParams.x;
  // Reject negligible off-axis contributions before exponentials; this is
  // especially important when mobile rays traverse a large empty jet volume.
  float widest=.12+max(abs(start.y),abs(end.y))*.065*jetParams.x;
  if(r>widest*5.0)continue;
  float coverage=jetGaussianSegment(start.xz,end.xz,cone);
  float core=coverage*smoothstep(horizonFor(k)/m,3.8,y)*exp(-y*.095/max(jetParams.y,.1));
  float stream=.65+.35*sin(y*3.0-uTime*4.0);
  float structure=k==0?uJetStructure.x:uJetStructure.y;
  if(structure>.5&&structure<1.5)stream=.12+1.65*pow(.5+.5*cos(y*1.35-uTime*2.3),8.0);
  if(structure>1.5){
   float phase=q.y*1.5-uTime*2.0;vec2 helix=vec2(cos(phase),sin(phase))*cone*.72;
   coverage=jetGaussianSegment(start.xz-helix,end.xz-helix,cone*.43)+jetGaussianSegment(start.xz+helix,end.xz+helix,cone*.43)*.75;
   core=coverage*smoothstep(horizonFor(k)/m,3.8,y)*exp(-y*.095/max(jetParams.y,.1));
  }
  float bandWeight=uSpectrum==2?2.4:(uSpectrum==1?.22:1.0);
  vec3 hue=mix(jetColor*.7,vec3(.88,.96,1),exp(-r*3.0)*.3);
  if(uSpectrum==1)hue=thermalPalette(.32+.35*exp(-r/cone));
  if(uSpectrum==2)hue=mix(vec3(.12,.22,1),vec3(.65,.94,1),exp(-r*r/(cone*cone)));
  if(uSpectrum==3){hue=mix(vec3(.06,.48,.76),vec3(1,.48,.12),exp(-y*.10));bandWeight=3.2;stream=.85+.15*stream;}
  if(uSpectrum==4){hue=mix(vec3(.42,.10,.95),vec3(.92,.85,1),stream);bandWeight=4.8*exp(-y*.12/max(jetParams.y,.1))*pow(stream,4.0);}
  sum+=hue*core*stream*dt/m*.65*jetParams.z*bandWeight;
 }
 return sum;
}

${probe?`
// A finite emissive halo is a visual light-scattering model, not a larger body.
// Integrating its Gaussian along each bent segment prevents tiny physical
// probes from flickering when a coarse step crosses the entire glow at once.
vec3 probeEmissionRay(vec3 ro,vec3 direction,float segmentLength,float luminosity,vec3 tint){
 if(uSpectrum==5)return vec3(0);
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
  if(uColors[j].a<.5||uColors[j].a>1.5||(j==uInspectIndex&&!sceneTransparent())||j==uHideObjectIndex)continue;
  float size=max(uObjects[j].w,1e-20);
  sum+=probeEmissionRay((previous-uObjects[j].xyz)/size,direction,distance/size,uLuminosities[j],uColors[j].rgb)*bodyOpacity(j);
 }
 return sum;
}
vec3 probeInspectorEmission(vec2 uv,float fov){
 if(uInspectIndex<0||sceneTransparent()${dyson?'||true':''})return vec3(0);
 vec3 tint=vec3(0);float luminosity=1.0,type=-1.0;
 for(int j=0;j<12;j++){if(j==uInspectIndex){tint=uColors[j].rgb;type=uColors[j].a;luminosity=uLuminosities[j];}}
 if(type<.5||type>1.5)return vec3(0);
 vec3 eye=vec3(uv*fov,-1.0);
 if(uProjectionMode==1){vec2 ndc=uv*vec2(2.0*uResolution.y/uResolution.x,2.0);eye=(uInverseProjection*vec4(ndc,-1.0,1.0)).xyz;}
 vec3 ray=unit(uInspectRight*eye.x+uInspectUp*eye.y-uInspectForward*eye.z);
 return probeEmissionRay(uInspectCamera,ray,length(uInspectCamera)+16.0*(2.0+2.0*sqrt(sqrt(luminosity))),luminosity,tint);
}
`:''}

// Visible illustrative boundary source, shared by primary and nested whites.
// Geometry retains this source while all discs, jets and sky remain suppressed.
vec3 whiteBoundaryEmission(vec3 offset,float dt,float mass,float horizon){
 if(mass<=0.0||horizon<=0.0)return vec3(0);
 float r=length(offset)/max(mass,1e-20),h=horizon/max(mass,1e-20);
 float shell=exp(-(r-h)*.72)*smoothstep(h,h+.3,r);
 float pulse=.62+.38*sin(r*4.0-uTime*3.0);
 vec3 hue=uSpectrum==2?vec3(.3,.62,1):uSpectrum==1?thermalPalette(.6):vec3(.72,.87,1);
 float bandWeight=1.0;
 if(uSpectrum==3){hue=vec3(.8,.35,.12);bandWeight=.55;}
 if(uSpectrum==4){hue=vec3(.7,.4,1);bandWeight=.025*pow(pulse,4.0);}
 return hue*shell*pulse*.08*dt/max(mass,1e-20)*bandWeight;
}
vec3 whiteHoleEmission(vec3 p,float dt){
 if(uWarpFlags.w<.5)return vec3(0);vec3 sum=vec3(0);
 for(int k=0;k<2;k++){
  if(k==1&&uBinary==0)break;if(whiteFor(k)<.5)continue;
  sum+=whiteBoundaryEmission(p-uHoles[k].xyz,dt,uHoles[k].w,horizonFor(k));
 }return sum;
}

${TIDAL_STREAM_GLSL}
vec4 debris(vec3 p,float dt){
 if(uSpectrum==5||uFlags2.z<.5||uWarpFlags.w<.5)return vec4(0);
 vec3 q=localPoint(p-uHoles[0].xyz,uPrimaryAxis)/uMass;
 float r=length(q.xz),angle=atan(q.z,q.x),starR=uTidal.x/uMass;
 float horizon=horizonFor(0)/uMass,progress=(starR-r)/max(starR-horizon,.1);
 float bend=tidalStreamBend(progress,uSpin.x);
 // The encounter advances toward decreasing polar angle: positive near-star
 // bend is a lagging wake, followed by inward, spin-dependent fallback.
 float lane=exp(-(1.0-cos(angle-uTidal.y-bend))*85.0)*exp(-q.y*q.y*8.0/max(uTidal.w,.1));
 float env=smoothstep(horizon,horizon+max(.12,horizon*.12),r)*(1.0-smoothstep(starR,starR+.2,r));
 float pulse=.6+.4*sin(r*9.0+uTime*5.0+angle*5.0);
 float density=lane*env*pulse*dt/uMass*(.55+uTidal.z*.65)*uTidal.w;
 vec3 hue=uStarColor*vec3(2.5,1.6,.8);
 float bandWeight=uSpectrum==2?1.9:(uSpectrum==1?.32:1.0);
 if(uSpectrum==2)hue=vec3(.55,1.4,2.5);
 if(uSpectrum==1)hue=thermalPalette(.48+.2*pulse);
 if(uSpectrum==3){hue=mix(vec3(.15,.07,.3),vec3(.95,.38,.12),pulse);bandWeight=.65;}
 if(uSpectrum==4){hue=vec3(.65,.35,1);bandWeight=.08*pow(pulse,4.0)*exp(-max(0.0,r-3.0)*.35);}
 return vec4(hue*density*bandWeight,min(density*.2,.7));
}


vec3 bodyLight(vec3 position){
 vec3 light=uHoles[0].xyz-position+vec3(0,1.7*uMass,0);
 ${bodyGravity?`float closest=1e30;for(int j=0;j<12;j++){if(j>=uObjectCount)break;if(uColors[j].a>1.5&&uColors[j].a<2.5){vec3 candidate=uObjects[j].xyz-position;float d=dot(candidate,candidate);if(d>1e-24&&d<closest){closest=d;light=candidate;}}}`:''}
 return unit(light);
}
// Material-attached graticule: evaluated at the same ray/surface intersection
// as the body, so foreground clipping and lensing cannot detach the grid.
vec3 metricSurfaceGrid(vec3 point,vec3 normal,vec3 rd){
 if(uMetricOptions.x<.5&&uSpectrum!=5)return vec3(0);
 vec3 n=unit(point);float longitude=atan(n.z,n.x),latitude=asin(clamp(n.y,-1.0,1.0));
 vec2 bands=sin(vec2(longitude*6.0,latitude*6.0));
 ${derivatives?'vec2 width=max(vec2(.018),fwidth(bands)*1.15);':'vec2 width=vec2(.045);'}
 vec2 lines=vec2(1)-smoothstep(width,width*2.0,abs(bands));
 // Meridians converge at the poles; fade only the unresolved intersection.
 lines.x*=smoothstep(.03,.16,length(n.xz));
 float line=max(lines.x,lines.y),facing=.45+.55*max(dot(normal,-rd),0.0);
 return vec3(.20,.63,.94)*line*facing;
}
// Neutral solid geometry material, evaluated on the traced surface itself.
// Camera-relative fill makes the sphere legible without inventing a luminous star.
vec3 geometrySurface(vec3 normal,vec3 rd){
 vec3 light=unit(uUp*.65-uRight*.45-rd*.85);
 float diffuse=max(dot(normal,light),0.0),facing=max(dot(normal,-rd),0.0);
 return vec3((.14+.64*diffuse)*(.86+.14*facing));
}
// A focused sphere must not use the straight precision-inspector overlay when
// a resolvable field bends its rays. Weak catalogs keep their analytic fast path.
bool geometryFieldTrace(float type){
 return uSpectrum==5&&(type<.5||(type>1.5&&type<2.5))&&uFlags.z>.5&&uMetricOptions.w<.5&&(uBridge.x>.5||uGravityCount>0||uWarpFlags.w>.5||uWarpFlags.x>.5);
}
// Quasi-static Schwarzschild transfer for the compact-star teaching model.
// At a distant observer, g=sqrt(1-2rg/R), bolometric intensity scales as g^4.
// It is not a time-dependent radiative-transfer or rotating-star solution.
float stellarTransfer(float massSolar,float radius){
 float g2=clamp(1.0-2.0*(massSolar/4300000.0)/max(radius,1e-20),0.0,1.0);
 return g2*g2;
}
vec3 stellarObserved(vec3 color,float massSolar,float radius){
 float transfer=stellarTransfer(massSolar,radius);
 if(uSpectrum==0){float g=pow(transfer,.25);color*=mix(vec3(1.0,.20,.025),vec3(1),g);}
 return color*transfer;
}
vec3 bodySurface(vec3 normal,vec3 rd,vec3 tint,float type,vec4 properties,vec3 lightDirection){
 if(type>1.5&&type<2.5&&properties.z<0.0)return properties.x>8.5?vec3(.12,.18,.23):vec3(0);
 if(uSpectrum==5)return geometrySurface(normal,rd);
 vec3 n=normal;n.xz=rot(uTime*.07*properties.w)*n.xz;
 float grain=fbm(n*9.0+vec3(0,(type>1.5&&type<2.5?uStellarTime:uTime)*.015,0)),light=max(dot(normal,lightDirection),0.0);
 if(type>1.5&&type<2.5){
  bool tzo=properties.x>6.5&&properties.x<7.5;
  float spots=smoothstep(.64,.79,fbm(n*4.1+vec3(7.3,1.8,2.2)))*clamp(properties.y,0.0,1.0);
  if(tzo)spots=smoothstep(.48,.73,fbm(n*2.3+vec3(7.3,1.8,2.2)))*clamp(properties.y,0.0,1.0);
  float cells=.6+.4*noise(n*(tzo?7.0:properties.x> .5&&properties.x<1.5?18.0:36.0));
  vec3 emission=tint*(1.8+1.1*grain+.35*cells)*(1.0-spots*.88);
  if(tzo){grain=fbm(n*3.8+vec3(0,uStellarTime*.006,0));emission=tint*(.95+1.25*grain+.45*cells)*(1.0-spots*.7)*(.52+.48*pow(max(dot(normal,-rd),0.0),.35));}
  else if(properties.x>2.5)emission*=1.3;
  return stellarSpectrum(emission,grain,properties.x)*(1.0-.18*spots);
 }
 float detail=fbm(n*4.0),land=smoothstep(.49,.56,detail);
 vec3 surface=tint;
 if(properties.x>.5&&properties.x<1.5){
  float bands=.5+.5*sin(n.y*42.0+noise(n*5.0)*5.0);
  float storm=exp(-pow(length((n.xy-vec2(.35,-.2))*vec2(1.0,2.3))*.9,2.0)*12.0);
  surface=mix(tint*.42,tint*1.3,bands)*(.84+.16*noise(n*24.0));surface=mix(surface,tint*vec3(1.4,.6,.4),storm*.7);
 }else if(properties.x>1.5&&properties.x<2.5){
  float cracks=pow(1.0-abs(noise(n*19.0)-.5)*2.0,18.0);
  surface=mix(tint,vec3(.87,.94,1),.45+detail*.35)*(1.0-cracks*.4);
 }else if(properties.x>2.5){
  // A global ocean: animated capillary bands and a tight water glint,
  // without rocky continents masquerading as a tidal water surface.
  float wave=.5+.5*sin(n.y*91.0+n.x*27.0+noise(n*15.0)*5.0+uTime*.14);
  surface=tint*(.48+.38*detail+.14*wave);
  vec3 halfVector=unit(lightDirection-rd);
  float glint=pow(max(dot(normal,halfVector),0.0),110.0);
  surface+=vec3(.62,.84,1.0)*glint*1.3;
  surface=mix(surface,vec3(.63,.84,.91),pow(wave,24.0)*.035);
 }else{
  float craters=pow(max(0.0,1.0-abs(noise(n*28.0)-.48)*10.0),4.0);
  surface=tint*(.55+detail*.65)*(1.0-craters*.22);
 }
 float atmosphere=pow(1.0-max(dot(normal,-rd),0.0),3.0);
 // The accretion environment supplies broad fill on the ocean's night side.
 // Keep a dark terminator while preserving water texture against a bright disc.
 float ambient=type<.5&&properties.x>2.5&&properties.x<3.5?.14:.045;
 surface=surface*(ambient+light*(1.0-ambient))+(properties.x> .5?vec3(.13,.32,.6)*atmosphere*.22:vec3(0));
 return surfaceSpectrum(surface,light,.12+.14*detail,.05);
}
${planetary?planetMaterialGLSL({photo}):''}
${rings?`
vec4 annulusHit(vec3 ro,vec3 rd,vec3 tint,float type,vec4 properties,float maximum){
 if(abs(rd.y)<1e-8)return vec4(0,0,0,-1);
 float t=-ro.y/rd.y;
 if(t<.0000001||t>maximum)return vec4(0,0,0,-1);
 vec3 hit=ro+rd*t;float radius=length(hit.xz);
 if(radius<properties.y||radius>1.0)return vec4(0,0,0,-1);
 float angle=atan(hit.z,hit.x)+uTime*.02;
 float particle=noise(vec3(hit.x*73.0,hit.z*73.0,properties.x*11.0));
 float grain=type>7.5?particle:.72+.28*particle;
 if(type>7.5&&grain<.82)return vec4(0,0,0,-1);
 float bands=.2+.8*(noise(vec3(radius*43.0,2,7))*.45+noise(vec3(radius*137.0,4,1))*.35+noise(vec3(radius*463.0,7,3))*.2);
 // Cassini-like gap is a physical radial gap, not transparent planet paint.
 if(type<7.5&&radius>.858&&radius<.883)return vec4(0,0,0,-1);
 if(type<7.5&&bands<.08)return vec4(0,0,0,-1);
 vec3 material=properties.x<.5?vec3(.55,.39,.23):properties.x<1.5?vec3(.73,.88,1):vec3(.55,.62,.67);
 vec3 color=tint*material*(.55+.7*grain)*mix(.65,1.0,bands);
 return vec4(surfaceSpectrum(color,.7,properties.x<1.5?.1:.3,properties.x>1.5?.9:.1),t);
}
`:''}
${stellar?`
vec3 coronaRay(vec3 ro,vec3 rd,float maximum,vec3 tint,vec4 properties){
 if(uSpectrum==5)return vec3(0);
 float t=clamp(-dot(ro,rd),0.0,maximum),r=length(ro+rd*t);
 if(r<.98||r>4.0||properties.z<=0.0)return vec3(0);
 vec3 point=ro+rd*t;float loops=.6+.4*sin(atan(point.z,point.x)*7.0+uStellarTime*.13+point.y*4.0);
 float emission=exp(-max(0.0,r-1.0)*3.2)*(.3+.7*loops*loops)*properties.z;
 float coverage=min(maximum,2.0)*.6;
 vec3 hue=tint;float weight=.32;
 if(uSpectrum==1){hue=thermalPalette(.78);weight=.10;}
 if(uSpectrum==2){hue=vec3(.2,.65,1.5);weight=1.1;}
 if(uSpectrum==3){hue=vec3(.9,.22,.08);weight=.18;}
 if(uSpectrum==4){hue=vec3(.6,.25,1);weight=.015*pow(loops,7.0);}
 // Cool envelope / wind cue only; no hard emission leaks from the core.
 if(properties.x>6.5&&properties.x<7.5){if(uSpectrum==1)weight=.35;if(uSpectrum==2)weight=.0005;if(uSpectrum==3)weight=.015;if(uSpectrum==4)weight=.000005;}
 return hue*emission*coverage*weight;
}
vec3 stellarEmissionSegment(vec3 first,vec3 last){
 vec3 delta=last-first;float lengthWorld=length(delta);if(lengthWorld<=1e-20)return vec3(0);vec3 direction=delta/lengthWorld,sum=vec3(0);
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;if(uColors[j].a<1.5||uColors[j].a>2.5||j==uHideObjectIndex||(j==uInspectIndex${dyson?'&&false':''}&&!sceneTransparent()&&2.0*(uBodyMasses[j]/4300000.0)/max(uObjects[j].w,1e-20)<=.01))continue;
  vec4 body=uObjects[j],params=uBodyParams[j];float radius=max(body.w,1e-20);
  if(params.z<0.0){if(params.x>8.5)sum+=whiteBoundaryEmission((first+last)*.5-body.xyz,lengthWorld,uBodyMasses[j]/4300000.0,radius);continue;}
  if(uSpectrum==5)continue;
  sum+=coronaRay((first-body.xyz)/radius,direction,lengthWorld/radius,uColors[j].rgb,params)*stellarTransfer(uBodyMasses[j],radius)*bodyOpacity(j);
  if(uWarpFlags.w>.5&&params.z>0.0){
   for(int k=0;k<2;k++){
    if(k==1&&uBinary==0)break;
    vec3 offset=body.xyz-uHoles[k].xyz;float separation=length(offset);
    float tidalRadius=radius*pow(max(1.0,uHoles[k].w*4300000.0/max(uBodyMasses[j],.000001)),.3333333);
    float strength=clamp(pow(tidalRadius/max(separation,1e-20),3.0)*.2,0.0,1.0)*params.z;
    if(strength<.003)continue;
    vec3 axis=axisFor(k);float width=max(radius*.35,separation*.012);
    // Closest ray point to the hole-star segment gives a bounded local sample.
    float t=clamp(dot(body.xyz-first,direction),0.0,lengthWorld);
    vec3 q=first+direction*t-uHoles[k].xyz;float along=clamp(dot(q,unit(offset)),0.0,separation);
    vec3 radial=offset*(along/max(separation,1e-20));
    float bend=-tidalStreamBend((separation-along)/max(separation-horizonFor(k),1e-20),spinFor(k));
    vec3 target=radial*cos(bend)+cross(axis,radial)*sin(bend)+axis*dot(axis,radial)*(1.0-cos(bend));
    float d=length(q-target)/width;float density=exp(-d*d)*strength*smoothstep(horizonFor(k),horizonFor(k)*1.15,along)*(1.0-smoothstep(separation-radius,separation,along));
    float pulse=.65+.35*sin(along/max(width,1e-20)*2.0+uTime*2.0);
    vec3 hue=uColors[j].rgb*1.4;float weight=1.0;
    if(uSpectrum==1){hue=thermalPalette(.65);weight=.3;}if(uSpectrum==2){hue=vec3(.25,.7,1.5);weight=1.5;}if(uSpectrum==3){hue=vec3(.9,.3,.12);weight=.5;}if(uSpectrum==4){hue=vec3(.7,.3,1);weight=.025;}
    sum+=hue*density*pulse*min(2.0,lengthWorld/width)*weight;
   }
  }
 }
 return sum;
}
vec3 stellarInspectorEmission(vec2 uv,float fov){
 if(uInspectIndex<0||sceneTransparent())return vec3(0);
 for(int j=0;j<12;j++){if(j==uInspectIndex&&uColors[j].a>1.5&&uColors[j].a<2.5){
  vec3 eye=vec3(uv*fov,-1.0);if(uProjectionMode==1){vec2 ndc=uv*vec2(2.0*uResolution.y/uResolution.x,2.0);eye=(uInverseProjection*vec4(ndc,-1.0,1.0)).xyz;}
  vec3 ray=unit(uInspectRight*eye.x+uInspectUp*eye.y-uInspectForward*eye.z);
  if(2.0*(uBodyMasses[j]/4300000.0)/max(uObjects[j].w,1e-20)>.01)return vec3(0);
  return coronaRay(uInspectCamera,ray,length(uInspectCamera)+4.0,uColors[j].rgb,uBodyParams[j])*stellarTransfer(uBodyMasses[j],uObjects[j].w);
 }}return vec3(0);
}
`:''}

${craft?createCraftGLSL({mask:craftMask,photo}):SPHERE_GLSL}


vec3 craftFrame(vec3 p,vec2 heading){
 vec3 q=localPoint(p,uPrimaryAxis);
 return vec3(-heading.x*q.x-heading.y*q.z,q.y,heading.y*q.x-heading.x*q.z);
}
vec3 craftWorld(vec3 p,vec2 heading){
 vec3 helper=abs(uPrimaryAxis.z)<.9?vec3(0,0,1):vec3(1,0,0),x=unit(cross(uPrimaryAxis,helper)),z=cross(x,uPrimaryAxis);
 vec3 local=vec3(-heading.x*p.x+heading.y*p.z,p.y,-heading.y*p.x-heading.x*p.z);
 return x*local.x+uPrimaryAxis*local.y+z*local.z;
}
vec4 surfaceProfile(vec4 params,vec4 shape,float type){return type<.5?vec4(floor(params.x/4.0),shape.w,params.y,params.z):vec4(0,shape.w,0,0);}
vec3 planetFrame(vec3 direction,vec4 profile){
 vec3 q=localPoint(direction,uPrimaryAxis);q.yz=rot(profile.y)*q.yz;q.xz=rot(profile.z)*q.xz;return q;
}
vec3 planetWorld(vec3 direction,vec4 profile){
 vec3 q=direction;q.xz=rot(-profile.z)*q.xz;q.yz=rot(-profile.y)*q.yz;
 vec3 helper=abs(uPrimaryAxis.z)<.9?vec3(0,0,1):vec3(1,0,0),x=unit(cross(uPrimaryAxis,helper)),z=cross(x,uPrimaryAxis);
 return x*q.x+uPrimaryAxis*q.y+z*q.z;
}
// Two analytic spheres form the only composite water body. Their union has
// a spherical rock core and a smooth, localized near-side water surface.
// Connected ray intervals merge before selecting a surface, including exits.
vec4 waterCapHit(vec3 ro,vec3 rd,vec3 shape){
 vec3 capCenter=vec3(shape.z,0,0),q=ro-capCenter;
 float ba=dot(ro,rd),bb=dot(q,rd),ha=shape.x*shape.x-dot(cross(ro,rd),cross(ro,rd)),hb=shape.y*shape.y-dot(cross(q,rd),cross(q,rd));
 bool a=ha>=0.0,b=hb>=0.0;vec2 ra=vec2(-ba-sqrt(max(0.0,ha)),-ba+sqrt(max(0.0,ha))),rb=vec2(-bb-sqrt(max(0.0,hb)),-bb+sqrt(max(0.0,hb)));
 float t=-1.0;vec3 center=vec3(0);
 if(a&&b&&max(ra.x,rb.x)<=min(ra.y,rb.y)){
  bool entering=min(ra.x,rb.x)>=0.0;
  t=entering?min(ra.x,rb.x):max(ra.y,rb.y);
  if(entering?rb.x<ra.x:rb.y>ra.y)center=capCenter;
 }else{
  float ta=a?(ra.x>=0.0?ra.x:ra.y):-1.0,tb=b?(rb.x>=0.0?rb.x:rb.y):-1.0;
  if(ta>=0.0)t=ta;if(tb>=0.0&&(t<0.0||tb<t)){t=tb;center=capCenter;}
 }
 return t>=0.0?vec4(unit(ro+rd*t-center),t):vec4(0,0,0,-1);
}
vec4 planetShapeHit(vec3 ro,vec3 rd,vec3 shape,float kind){
 if(kind>2.5)return waterCapHit(ro,rd,shape);
 shape=max(shape,vec3(.01));
 if(kind>.5&&kind<1.5){
  vec4 a=ellipsoidHit(ro,rd,vec3(-shape.x*.38,0,0),shape*vec3(.62,.88,.88));
  vec4 b=ellipsoidHit(ro,rd,vec3(shape.x*.53,0,0),shape*vec3(.47,.68,.68));
  return a.w>=0.0&&(b.w<0.0||a.w<b.w)?a:b;
 }
 return ellipsoidHit(ro,rd,vec3(0),shape);
}
vec3 planetShade(vec3 localHit,vec3 shape,vec3 normal,vec3 rd,vec3 tint,float type,vec4 properties,vec4 profile,vec3 light){
 if(type>1.5&&type<2.5&&properties.z<0.0)return bodySurface(normal,rd,tint,type,properties,light);
 vec3 point=unit(localHit/shape);
 if(profile.w>2.5){
  vec3 capPoint=localHit-vec3(shape.z,0,0);
  bool water=abs(length(capPoint)-shape.y)<abs(length(localHit)-shape.x);
  point=unit(water?capPoint:localHit);properties.x=water?3.0:0.0;
  tint=water?vec3(.025,.25,.46):tint*.7;profile.x=0.0;
 }
 vec3 grid=metricSurfaceGrid(point,normal,rd);
 if(uSpectrum==5)return geometrySurface(normal,rd);
 ${planetary?'if(type<.5&&profile.x>.5)return grid+namedPlanetSurface(point,normal,rd,tint,properties,profile,light);':''}
 return grid+bodySurface(normal,rd,tint,type,properties,light)+(profile.w>2.5&&properties.x<.5&&uSpectrum==0?tint*.16:vec3(0));
}
${rings?`
vec3 ringPlanetShadow(vec3 color,vec3 worldHit,vec4 ring){
 // Only a co-centered parent planet can cast this bounded analytic shadow.
 // This runs for visible ring pixels, with no secondary ray marching.
 vec3 light=bodyLight(ring.xyz);
 for(int k=0;k<12;k++){
  if(k>=uObjectCount)break;
  if(uColors[k].a>.5||distance(uObjects[k].xyz,ring.xyz)>ring.w*.001)continue;
  vec4 parent=uObjects[k],profile=surfaceProfile(uBodyParams[k],uBodyShape[k],uColors[k].a);
  vec3 shape=max(uBodyShape[k].xyz,vec3(.01));
  vec3 localOrigin=planetFrame((worldHit-parent.xyz)/max(parent.w,1e-20),profile),localRay=planetFrame(light,profile);
  if(profile.w>2.5){if(waterCapHit(localOrigin,localRay,shape).w>=0.0)color*=.055;continue;}
  vec3 q=localOrigin/shape,v=localRay/shape;
  float along=dot(q,v)/dot(v,v);
  if(along>=0.0)continue;
  float closest=length(q-v*along);
  color*=mix(.055,1.0,smoothstep(.965,1.015,closest));
 }
 return color;
}
`:''}
${dyson?DYSON_GLSL:''}
${diagnostics?METRIC_GLSL:`
vec3 diagnosticSegment(vec3 a,vec3 b,float travelled,float pixelAngle){return vec3(0);}
vec3 flightGuideSegment(vec3 a,vec3 b,float travelled,float pixelAngle){return vec3(0);}
`}
${warp?WARP_TRACE_GLSL.replaceAll('__WARP_TRACE_STEPS__',photo?'384':ultra?'192':'96').replaceAll('__WARP_TRACE_BUDGET__',photo?'384':ultra?'192':'96'):NO_WARP_TRACE_GLSL}

vec3 rayFromFrame(vec3 forward,vec3 right,vec3 up,vec2 uv,float fov){
 vec3 eye=vec3(uv*fov,-1.0);
 if(uProjectionMode==1){vec2 ndc=uv*vec2(2.0*uResolution.y/uResolution.x,2.0);eye=(uInverseProjection*vec4(ndc,-1.0,1.0)).xyz;}
 return unit(right*eye.x+up*eye.y-forward*eye.z);
}
vec4 astronomicalInspector(vec3 worldRay,vec4 focus){
 vec3 relativeEye=uObserver-focus.xyz;
 float nearest=1e30,ringNearest=1e30,ringAlpha=1.0;vec3 solidColor=vec3(0),ringColor=vec3(0);bool solid=false,ringFound=false;
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;if(j==uHideObjectIndex)continue;
  float type=uColors[j].a;if(type>8.5)continue;${rings?'if(type>2.5&&type<6.5)continue;':'if(type>2.5)continue;'}
  vec4 obj=uObjects[j],profile=surfaceProfile(uBodyParams[j],uBodyShape[j],uColors[j].a);if(type>1.5&&type<2.5&&uBodyParams[j].z<0.0)obj.w*=max(1.0,-uBodyParams[j].z);float radius=max(obj.w,1e-20);
  vec3 origin=(focus.xyz-obj.xyz+relativeEye)/radius;
  vec3 localOrigin=planetFrame(origin,profile),localRay=planetFrame(worldRay,profile);
  ${rings?`if(type>6.5&&type<8.5){
   vec4 ring=annulusHit(localOrigin,localRay,uColors[j].rgb,type,uBodyParams[j],1e24);
   float distance=ring.w*radius;
   if(ring.w>=0.0&&distance<ringNearest){ringNearest=distance;ringColor=ringPlanetShadow(ring.rgb,uObserver+worldRay*distance,obj);ringFound=true;
    float density=.3+.7*noise(vec3(length((localOrigin+localRay*ring.w).xz)*137.0,4,1));
    ringAlpha=type>7.5?clamp(uBodyParams[j].w*.2,.01,.12):clamp(1.0-exp(-max(0.0,uBodyParams[j].w)*(.55+density*1.8)/max(.12,abs(localRay.y))),0.0,.985);
   }continue;
  }`:''}
  vec3 shape=max(uBodyShape[j].xyz,vec3(.01));vec4 hit=planetShapeHit(localOrigin,localRay,shape,profile.w);
  float distance=hit.w*radius;if(!(hit.w>=0.0&&distance<nearest))continue;
  vec3 normal=unit(planetWorld(hit.xyz,profile)),point=unit((localOrigin+localRay*hit.w)/shape),color=uColors[j].rgb;
  if(type>.5&&type<1.5){color*=1.3+.6*noise(point*6.0);color=surfaceSpectrum(color,max(dot(normal,bodyLight(obj.xyz)),0.0),.35,.6);${probe?'color*=max(1.0,uLuminosities[j]);':''}}
  else color=planetShade(localOrigin+localRay*hit.w,shape,normal,worldRay,color,type,uBodyParams[j],profile,bodyLight(obj.xyz));
  if(type>1.5&&type<2.5&&uBodyParams[j].z>=0.0&&uSpectrum!=5)color=stellarObserved(color,uBodyMasses[j],radius);
  nearest=distance;solidColor=color;solid=true;
 }
 if(uMetricOptions.x>.5){float end=solid?nearest:max(focus.w*6.0,length(relativeEye)+focus.w*5.0);solidColor+=diagnosticSegment(uObserver,uObserver+worldRay*end,0.0,.83/uResolution.y);}
 if(ringFound&&ringNearest<nearest)return vec4(mix(solid?solidColor:sky(worldRay),ringColor,ringAlpha),1);
 return solid?vec4(solidColor,1):vec4(0);
}
vec4 inspector(vec2 uv,float fov){
 if(uInspectIndex<0||localWarpPass()||sceneTransparent()${dyson?'||true':''})return vec4(0);
 vec4 tint=vec4(0),properties=vec4(0),focus=vec4(0);vec3 localLight=unit(vec3(-.4,.85,.65));vec2 heading=vec2(1,0);float luminosity=1.0,focusMass=0.0;
 for(int j=0;j<12;j++){if(j==uInspectIndex){tint=uColors[j];focus=uObjects[j];properties=uBodyParams[j];heading=uHeadings[j];luminosity=uLuminosities[j];focusMass=uBodyMasses[j];localLight=unit(craftFrame(bodyLight(uObjects[j].xyz),heading));}}
 vec3 ro=uInspectCamera,rd=rayFromFrame(uInspectForward,uInspectRight,uInspectUp,uv,fov);
 if(geometryFieldTrace(tint.a))return vec4(0);
 if(tint.a>1.5&&tint.a<2.5&&(properties.z<0.0||2.0*(focusMass/4300000.0)/max(focus.w,1e-20)>.01))return vec4(0);
 if(tint.a<2.5${rings?'||(tint.a>6.5&&tint.a<8.5)':''})return astronomicalInspector(rayFromFrame(uForward,uRight,uUp,uv,fov),focus);
 if(tint.a>2.5){
  CraftSurface surface=craftHit(ro,rd,10000.0,tint.a);
  float normalSize=dot(surface.normal,surface.normal);
  if(!(surface.t>=0.0&&surface.t<=10000.0&&normalSize>.5&&normalSize<1.5))return vec4(0);
  vec3 light=unit(vec3(-.4,.85,.65)),reflection=craftWorld(reflect(rd,surface.normal),heading);
  vec3 color=shadeCraft(surface,ro+rd*surface.t,rd,light,sky(reflection));
  color=surfaceSpectrum(color,max(dot(surface.normal,light),0.0),surface.material>19.5?.72:.35,(surface.material>4.5&&surface.material<5.5)?.98:.5);
  if(uSpectrum==5)color=vec3(.52,.88,1.35)*(1.0-smoothstep(.13,.32,abs(dot(surface.normal,rd))));
  return vec4(color,1);
 }
 return vec4(0);
}

// TZO cutaway: the true 12-km core is unresolved at this envelope scale.
// This centered .22R luminous marker is deliberately enlarged, never a physical
// sphere or an additional gravitating mass. Only the envelope's opacity exposes it.
vec4 tzoCutaway(vec3 ro,vec3 rd,vec3 envelope,float opacity){
 float along=-dot(ro,rd),impact=length(cross(ro,rd));
 float reveal=1.0-opacity,glow=exp(-impact*impact/0.16)*reveal;
 vec3 illumination=vec3(.19,.31,.85)*glow*1.8;
 if(uSpectrum==1)illumination=vec3(.8,.23,.08)*glow*.8;
 if(uSpectrum==3)illumination=vec3(.12,.32,.48)*glow*.55;
 if(uSpectrum==4)illumination=vec3(.45,.22,.72)*glow*.32;
 float rim=pow(clamp(impact,0.0,1.0),5.0)*reveal*sqrt(opacity);
 vec3 rimColor=vec3(4.0,1.0,.18);
 if(uSpectrum==1)rimColor=vec3(2.5,.7,.15);
 if(uSpectrum==2)rimColor=vec3(.1,.3,.7);
 if(uSpectrum==3)rimColor=vec3(.12,.35,.4);
 if(uSpectrum==4)rimColor=vec3(.2,.1,.35);
 vec3 haze=envelope*opacity+illumination+rimColor*rim;
 float coreRadius=.22,disc=coreRadius*coreRadius-impact*impact;
 if(disc>=0.0&&along>=0.0){
  vec3 point=(ro+rd*(along-sqrt(disc)))/coreRadius;
  float grain=fbm(point*8.0+vec3(0,uStellarTime*.02,0));
  vec3 core=mix(vec3(.25,.35,.95),vec3(1.5,1.7,2.1),smoothstep(.25,.68,grain))*(1.3+.8*max(dot(unit(point),-rd),0.0));
  if(uSpectrum==1)core=vec3(1.3,.56,.28)*(1.0+grain);
  if(uSpectrum==2)core=vec3(.25,.65,1.6)*(1.3+grain);
  if(uSpectrum==3)core=vec3(.15,.65,.95)*(.7+grain);
  if(uSpectrum==4)core=vec3(.75,.35,1.2)*(.7+grain);
  return vec4(haze+core*reveal,1.0);
 }
 float a=max(opacity,glow*.32);
 return vec4(haze/max(a,.0001),a);
}

vec4 objectHit(vec3 p,vec3 previous,vec3 tangent,out float fraction,inout float transparentMask){
 vec3 segment=p-previous;float segmentLength=max(length(segment),1e-20);vec3 rd=segment/segmentLength;
 // A numerical distance sentinel alone is unsafe: adding .001 can round back
 // to segmentLength at astronomical scales and turn a miss into an opaque hit.
 float nearest=segmentLength,closestAlpha=1.0;int closestIndex=-1;bool found=false;vec3 closestColor=vec3(0);fraction=1.0;
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;
  if(j==uHideObjectIndex||(j==uInspectIndex${dyson?'&&false':''}&&!sceneTransparent()&&!geometryFieldTrace(uColors[j].a)&&!(uColors[j].a>1.5&&uColors[j].a<2.5&&(uBodyParams[j].z<0.0||2.0*(uBodyMasses[j]/4300000.0)/max(uObjects[j].w,1e-20)>.01)))||(localWarpPass()&&j==uWarpObjectIndex))continue;
  if(uColors[j].a>8.5&&uColors[j].a<10.5||uColors[j].a>12.5${dyson?'':'||uColors[j].a>10.5&&uColors[j].a<11.5'})continue;
  vec4 obj=uObjects[j];if(obj.w<=1e-20)continue;if(uColors[j].a>1.5&&uColors[j].a<2.5&&uBodyParams[j].z<0.0)obj.w*=max(1.0,-uBodyParams[j].z);
  vec3 ro=(previous-obj.xyz)/obj.w,offAxis=cross(ro,rd);
  float b=dot(ro,rd),disc=1.0-dot(offAxis,offAxis);
  if(!(disc>=0.0))continue;
  float root=sqrt(disc),enter=-b-root,leave=-b+root,maximum=min(segmentLength,nearest)/obj.w;
  if(!(leave>=0.0&&enter<=maximum&&maximum<1e30))continue;
  float type=uColors[j].a,t=max(0.0,enter),alpha=type<6.5||type>10.5?bodyOpacity(j):1.0;vec3 color=uColors[j].rgb,normal;
  bool cutaway=${stellar?'type>1.5&&type<2.5&&uBodyParams[j].x>6.5&&uBodyParams[j].x<7.5&&uBodyParams[j].z>=0.0&&uSpectrum!=5&&alpha<.999':'false'};
  if(alpha<=0.0&&!cutaway)continue;
  if(transparentMask>0.0&&mod(floor(transparentMask/exp2(float(j))),2.0)>.5)continue;
  ${dyson?`if(type>10.5&&type<11.5){
   vec4 hit=dysonSurfaceHit(ro,rd,maximum,uBodyParams[j].x);if(hit.w<0.0)continue;
   t=hit.w;normal=hit.xyz;color=dysonShade(normal,rd,uBodyParams[j],color);
  }else `:''}${rings?`if(type>6.5&&type<8.5){
   vec3 localOrigin=planetFrame(ro,surfaceProfile(uBodyParams[j],uBodyShape[j],type)),localDirection=planetFrame(rd,surfaceProfile(uBodyParams[j],uBodyShape[j],type));
   vec4 ring=annulusHit(localOrigin,localDirection,color,type,uBodyParams[j],maximum);
   if(ring.w<0.0)continue;t=ring.w;color=ringPlanetShadow(ring.rgb,previous+rd*t*obj.w,obj);
   float density=.3+.7*noise(vec3(length((localOrigin+localDirection*t).xz)*137.0,4,1));
   alpha=type>7.5?clamp(uBodyParams[j].w*.2,.01,.12):clamp(1.0-exp(-max(0.0,uBodyParams[j].w)*(.55+density*1.8)/max(.12,abs(localDirection.y))),0.0,.985);
  }else `:''}if(type>2.5){
   vec2 heading=uHeadings[j];
   // Trace the model from its nearby bounding-sphere entry. Primitive quadratics
   // otherwise subtract enormous, nearly equal values for metre-sized craft.
   float shiftedAlong=max(b,-root-.01),advance=shiftedAlong-b;
   vec3 origin=cross(rd,offAxis)+rd*shiftedAlong;
   vec3 localOrigin=j==uDriveIndex?vec3(dot(origin,uDriveRight),dot(origin,uDriveUp),dot(origin,uDriveForward)):craftFrame(origin,heading),localDirection=j==uDriveIndex?vec3(dot(rd,uDriveRight),dot(rd,uDriveUp),dot(rd,uDriveForward)):craftFrame(rd,heading);
   float localMaximum=min(maximum-advance,2.1);
   CraftSurface surface=craftHit(localOrigin,localDirection,localMaximum,type);
   float normalSize=dot(surface.normal,surface.normal);
   if(!(surface.t>=0.0&&surface.t<=localMaximum&&normalSize>.5&&normalSize<1.5))continue;
   t=surface.t+advance;normal=surface.normal;vec3 hit=localOrigin+localDirection*surface.t;
   vec3 lightWorld=uHoles[0].xyz-obj.xyz+uPrimaryAxis*1.7*uMass;
   vec3 light=unit(j==uDriveIndex?vec3(dot(lightWorld,uDriveRight),dot(lightWorld,uDriveUp),dot(lightWorld,uDriveForward)):craftFrame(lightWorld,heading));
   vec3 reflected=reflect(localDirection,surface.normal),reflection=j==uDriveIndex?uDriveRight*reflected.x+uDriveUp*reflected.y+uDriveForward*reflected.z:craftWorld(reflected,heading);
   color=shadeCraft(surface,hit,localDirection,light,sky(reflection));
   color=surfaceSpectrum(color,max(dot(surface.normal,light),0.0),surface.material>19.5?.72:.35,(surface.material>4.5&&surface.material<5.5)?.98:.5);
   if(uSpectrum==5)color=vec3(.52,.88,1.35)*(1.0-smoothstep(.13,.32,abs(dot(surface.normal,localDirection))));
   normal=j==uDriveIndex?uDriveRight*normal.x+uDriveUp*normal.y+uDriveForward*normal.z:craftWorld(normal,heading);
  }${bodyGravity||probe?`else{
   vec4 profile=surfaceProfile(uBodyParams[j],uBodyShape[j],type);vec3 shape=max(uBodyShape[j].xyz,vec3(.01));
   float shiftedAlong=max(b,-root-.01),advance=shiftedAlong-b;
   vec3 origin=cross(rd,offAxis)+rd*shiftedAlong;
   vec3 localOrigin=planetFrame(origin,profile),localDirection=planetFrame(rd,profile);
   vec4 hit=planetShapeHit(localOrigin,localDirection,shape,profile.w);t=hit.w+advance;
   if(!(hit.w>=0.0&&t>=0.0&&t<=maximum))continue;
   normal=unit(planetWorld(hit.xyz,profile));vec3 point=unit((localOrigin+localDirection*hit.w)/shape);
   if(type>.5&&type<1.5){color*=1.3+.6*noise(normal*6.0);color=surfaceSpectrum(color,max(dot(normal,unit(uHoles[0].xyz-obj.xyz)),0.0),.35,.6);${probe?'color*=max(1.0,uLuminosities[j]);':''}}
   else color=planetShade(localOrigin+localDirection*hit.w,shape,normal,rd,color,type,uBodyParams[j],profile,bodyLight(obj.xyz));
   if(type>1.5&&type<2.5&&uBodyParams[j].z>=0.0&&uSpectrum!=5)color=stellarObserved(color,uBodyMasses[j],obj.w);
  }`:''}
  if((type<6.5||type>11.5)&&alpha<.999){
   // Blend the first surface encountered: entry from outside, exit from inside.
   // The per-ray mask prevents repeated blends without discarding inside views.
   if(cutaway){vec4 interior=tzoCutaway(ro,rd,color,alpha);color=interior.rgb;alpha=interior.a;}
  }
  nearest=t*obj.w;closestColor=color;closestAlpha=alpha;closestIndex=j;found=true;
 }
 if(found){
  // Exactly one opacity layer per body per ray. A numeric world-space nudge
  // alone can round back onto an astronomical surface and repeatedly blend it.
  if(closestAlpha<.999)transparentMask+=exp2(float(closestIndex));
  fraction=clamp(nearest/segmentLength,0.0,1.0);return vec4(closestColor,closestAlpha);
 }
 return vec4(0);
}

${attachments?`
// Stellar discs and jets are leaf attachments with their own physical extent.
// Their bounded analytic segment tests share lensing and foreground clipping.
vec4 attachmentEmissionSegment(vec3 a,vec3 b,float pixelAngle){
 if(uSpectrum==5)return vec4(0);
 vec3 color=vec3(0);float alpha=0.0,worldLength=length(b-a);
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;float kind=uColors[j].a;if(kind<8.5||kind>10.5)continue;
  vec4 body=uObjects[j],params=uBodyParams[j];float radius=max(body.w,1e-20);
  vec4 profile=vec4(0,uBodyShape[j].w,0,0);
  vec3 first=planetFrame((a-body.xyz)/radius,profile),last=planetFrame((b-body.xyz)/radius,profile);
  vec3 delta=last-first;float nearest=clamp(-dot(first,delta)/max(dot(delta,delta),1e-30),0.0,1.0);
  if(length(first+delta*nearest)>1.05)continue;
  vec3 tint=uColors[j].rgb,emission=vec3(0);float opacity=0.0;
  if(kind<9.5){
   if(first.y*last.y>0.0||abs(delta.y)<1e-12)continue;
   float fraction=-first.y/delta.y;if(fraction<=.000001||fraction>1.0)continue;
   vec3 q=first+delta*fraction;float r=length(q.xz),inner=clamp(uBodyShape[j].x,.015,.94);
   if(r<inner||r>1.0)continue;
   float width=max(.006,length(a-uObserver)*pixelAngle/radius*1.5);
   if(uSpectrum==5){float ring=max(1.0-smoothstep(width,width*2.0,abs(r-inner)),1.0-smoothstep(width,width*2.0,abs(r-1.0)));emission=vec3(.32,.77,1.2)*ring;}
   else{
    float hot=pow(inner/max(r,inner),.75),angle=atan(q.z,q.x)-uTime*(1.0+params.w)/max(.1,pow(r,1.5));
    float flow=.40+.60*noise(vec3(q.xz*29.0,angle*.25));
    float ribbon=.40+.60*pow(.5+.5*sin(r*47.0+sin(angle*4.0)*2.0),3.0);
    if(params.x>5.5)flow*=ribbon;
    opacity=clamp((1.0-exp(-max(.01,params.z)*flow*.8/max(.2,abs(unit(delta).y))))*smoothstep(inner,inner+.035,r)*(1.0-smoothstep(.94,1.0,r)),0.0,.95);
    if(uBodyShape[j].z>1.5)tint=.52+.48*cos(6.28318530718*(vec3(0,.333,.667)+r*2.2-sin(angle)*.12));
    emission=tint*(.45+hot*2.0)*opacity;
    if(uSpectrum==1)emission=thermalPalette(.2+.7*hot)*opacity;
    if(uSpectrum==2)emission=vec3(.2,.64,1.3)*pow(hot,5.0)*opacity;
    if(uSpectrum==3)emission=vec3(.9,.28,.1)*hot*.4*opacity;
    if(uSpectrum==4)emission=vec3(.7,.2,1)*pow(hot,8.0)*.035*opacity;
   }
  }else if(uSpectrum!=5){
   vec3 q=first+delta*nearest;float height=abs(q.y),width=.025+height*.16*max(.1,params.x);
   float coverage=jetGaussianSegment(first.xz,last.xz,width);
   float density=coverage*smoothstep(.04,.12,height)*(1.0-smoothstep(.75,1.0,height))*max(0.0,params.z);
   float pulse=.55+.45*sin(height*29.0-uTime*3.0);
   emission=tint*density*pulse*min(2.0,worldLength/radius/width)*.3;
   if(uSpectrum==1)emission=thermalPalette(.5)*density*.05;
   if(uSpectrum==2)emission=vec3(.2,.6,1.2)*density*.65;
   if(uSpectrum==3)emission=vec3(.9,.32,.1)*density*.8;
   if(uSpectrum==4)emission=vec3(.7,.25,1.1)*density*pow(pulse,4.0)*.35;
  }
  color+=(1.0-alpha)*emission;alpha+=(1.0-alpha)*opacity;
 }
 return vec4(color,alpha);
}
`:''}

${craft?`
// Small analytic exhaust volumes. Their world segments follow the same bent
// rays as spacecraft; the inspection pass uses the precise local ship chart.
vec3 thrusterRay(vec3 ro,vec3 rd,float maximum){
 if(uFlightMetrics.w<.5||uSpectrum==5)return vec3(0);
 float thrust=uFlightMetrics.x,steer=uFlightMetrics.y,power=abs(thrust),light=0.0;
 for(int engine=0;engine<4;engine++){
  vec3 base,axis;float strength;
  if(engine<3){base=vec3((float(engine)-1.0)*.10,engine==1?.065:-.045,thrust>=0.0?-.79:.76);axis=vec3(0,0,thrust>=0.0?-1.0:1.0);strength=power;}
  else {base=vec3(steer>=0.0?-.145:.145,.035,.52);axis=vec3(steer>=0.0?-1.0:1.0,0,0);strength=abs(steer)*.65;}
  if(strength<.001)continue;
  float extent=engine<3?.18+.70*strength:.14+.07*strength;
  vec3 center=base+axis*extent*.45,delta=center-ro;
  float t=clamp(dot(delta,rd),0.0,maximum);vec3 point=ro+rd*t-base;
  float along=dot(point,axis),width=(engine<3?.025:.008)+clamp(along/extent,0.0,1.0)*(engine<3?.10:.027);
  float radial=length(point-axis*along);
  float plume=exp(-radial*radial/(width*width))*smoothstep(-.025,.015,along)*(1.0-smoothstep(extent*.25,extent,along));
  light+=plume*strength*(1.8+.18*sin(uFlightMetrics.z*37.0+along*80.0));
 }
 vec3 hue=uSpectrum==1?vec3(1,.28,.07):uSpectrum==2?vec3(.12,.25,.6)*.12:uSpectrum==3?vec3(.3,.13,.12)*.03:uSpectrum==4?vec3(.2,.06,.3)*.003:vec3(.25,.65,1.4);
 return hue*light;
}
vec3 thrusterInspectorEmission(vec2 uv,float fov){
 if(uDriveIndex<0||uDriveIndex!=uInspectIndex||uFlightMetrics.w<.5||abs(uFlightMetrics.x)+abs(uFlightMetrics.y)<.001)return vec3(0);
 vec3 ro=uInspectCamera,rd=rayFromFrame(uInspectForward,uInspectRight,uInspectUp,uv,fov);
 CraftSurface surface=craftHit(ro,rd,10000.0,4.0);float maximum=dot(surface.normal,surface.normal)>.5?surface.t:10000.0;
 return thrusterRay(ro,rd,maximum);
}
vec3 thrusterSegment(vec3 from,vec3 to){
 if(uFlightMetrics.w<.5||uDriveIndex<0||uDriveIndex==uInspectIndex)return vec3(0);
 vec4 body=vec4(0);for(int j=0;j<12;j++){if(j==uDriveIndex)body=uObjects[j];}
 if(body.w<=0.0)return vec3(0);vec3 delta=to-from;float lengthWorld=length(delta);if(lengthWorld<=0.0)return vec3(0);
 vec3 rd=delta/lengthWorld,relative=(from-body.xyz)/body.w;
 if(length(cross(relative,rd))>2.0)return vec3(0);
 vec3 ro=vec3(dot(relative,uDriveRight),dot(relative,uDriveUp),dot(relative,uDriveForward));rd=vec3(dot(rd,uDriveRight),dot(rd,uDriveUp),dot(rd,uDriveForward));
 return thrusterRay(ro,rd,lengthWorld/body.w);
}
`:''}

${bridge?bridgeGLSL({ultra,photo,photoSteps:photoBudget,probe,attachments,bodyGravity}):''}
void main(){
 vec2 uv=(gl_FragCoord.xy-uRayViewport.xy+uPhotoOffset+uPhotoJitter-.5*uResolution)/uResolution.y;
 vec3 camera=uObserver,forward=unit(uForward),right=unit(uRight),up=unit(uUp);
 float fov=.83*max(1.0,1.35*uResolution.y/uResolution.x);

 vec3 original=rayFromFrame(forward,right,up,uv,fov),v=original,p=camera,color=vec3(0),metricColor=vec3(0);
 float trans=1.0,nearRadius=100000.0,travelled=0.0,transparentMask=0.0;
 float pixelAngle=uProjectionMode==1?length(rayFromFrame(forward,right,up,uv+vec2(0,1.0/uResolution.y),fov)-original):fov/uResolution.y;
 bool swallowed=false,object=false,miss=false,localWarp=${bridge?'false':'localWarpPass()'};
 vec4 inspected=vec4(0);if(uInspectIndex>=0)inspected=inspector(uv,fov);
 if(inspected.a>.5){color=inspected.rgb;object=true;miss=true;}
 ${bridge?`
  if(!object)color=bridgeTrace(camera,original,pixelAngle);
  ${probe?'color+=probeInspectorEmission(uv,fov);':''}
 ${stellar?'color+=stellarInspectorEmission(uv,fov);':''}
 ${craft?'color+=thrusterInspectorEmission(uv,fov);':''}
  color=pow(vec3(1)-exp(-max(color*uExposure,vec3(0))),vec3(.92));
  color*=1.0-.22*smoothstep(.35,1.3,length(uv));gl_FragColor=vec4(color,1);return;
 `:`
 vec3 warpColor=vec3(0);float warpTrans=1.0;bool warpObject=false;
 if(!object&&localWarp){
  warpLocalTrace(original,v,warpColor,warpTrans,warpObject);
  if(warpObject){color=warpColor;object=true;miss=true;}
  else if(uWarpFlags.w<.5${anomaly?'&&uAnomalyCount==0':''})miss=true;
 }
 // Only integrate the compact near field. Far observers skip empty space;
 // rays missing it take the sky fast path instead of exhausting ray steps.
 if(!miss&&!object&&length(camera)>uBounds){
  float b=dot(camera,v),c=dot(camera,camera)-uBounds*uBounds,disc=b*b-c;
  if(disc<0.0)miss=true;
  else{float enter=-b-sqrt(max(0.0,disc));if(enter<0.0)miss=true;else p=camera+v*max(0.0,enter-(uWarpFlags.w>.5?uMass*.03:uBounds*.00001));}
 }
 if(!miss&&uFlags.x>.5){
  vec4 entryGrid=coordinateGridSegment(camera,p,0.0,pixelAngle);
  color+=trans*entryGrid.rgb;trans*=1.0-entryGrid.a;travelled=length(p-camera);
 }
 if(!miss){
  for(int i=0;i<${photo?photoBudget:ultra?768:288};i++){
   if(i>=uSteps)break;
   float closest=100000.0,stepLimit=max(.000001,uBounds*.06);
   ${anomaly?'stepLimit=anomalyStepLimit(p,stepLimit);':''}
   for(int k=0;k<2;k++){
    if(uWarpFlags.w<.5)break;
    if(k==1&&uBinary==0)break;
    float r=length(p-uHoles[k].xyz),m=uHoles[k].w;if(m<=0.0)continue;
    closest=min(closest,r);nearRadius=min(nearRadius,r/m);
    if(r<horizonFor(k)&&uMetricOptions.w<.5){
     swallowed=true;break;
    }
    float h=max(r*.065,.045*m)*320.0/float(uSteps);
    h=min(h,max(${photo?'.002':'.018'}*m,abs(r-horizonFor(k))*.35));
    if(uMetricOptions.w>.5)h=max(h,m*.065);
    stepLimit=min(stepLimit,h);
   }
   if(swallowed)break;
   ${bodyGravity?`for(int j=0;j<12;j++){if(j>=uGravityCount)break;if(uBodyMasses[j]<=0.0)continue;
    float distance=length(p-uObjects[j].xyz),radius=max(uObjects[j].w,1e-20);
    stepLimit=min(stepLimit,max(radius*.02,distance*.08)*288.0/float(uSteps));
   }`:''}
   // Physical-size scenes cannot use the unused black-hole mass as an escape
   // margin: it can be millions of times larger than the entire near field.
   if(length(p)>uBounds+(uWarpFlags.w>.5?uMass*.05:uBounds*.00001)&&dot(p,v)>0.0)break;
   if(uWarpFlags.x>.5&&!localWarp){
    float wr=length(p-uWarpCenter)/max(uWarpRadius,1e-20);
    if(wr<2.8)stepLimit=min(stepLimit,uWarpRadius*clamp(.022+abs(wr-1.0)*.12,.022,.18)*288.0/float(uSteps));
   }
   // Weak-field catalogs have straight rays at this pixel footprint. One
   // analytic segment still intersects every selected surface/transparent ring;
   // another segment continues behind a ring. No empty-space marching is needed.
   if(uGravityCount==0&&uWarpFlags.w<.5&&uWarpFlags.x<.5${anomaly?'&&uAnomalyCount==0':''})stepLimit=max(stepLimit,length(p)+uBounds*2.1);
   float dt=stepLimit;
   vec3 previous=p,a=force(p,v),midV=v+a*dt*.5,midP=p+v*dt*.5;
   v+=force(midP,midV)*dt;p+=midV*dt;
   float hitFraction=1.0;vec4 obj=vec4(0);
   if(uObjectCount>0)obj=objectHit(p,previous,v,hitFraction,transparentMask);
   p=mix(previous,p,hitFraction);dt*=hitFraction;
   metricColor=max(metricColor,trans*diagnosticSegment(previous,p,travelled,pixelAngle));
   if(uFlags.x>.5){
    vec4 grid=coordinateGridSegment(previous,p,travelled,pixelAngle);
    color+=trans*grid.rgb;trans*=1.0-grid.a;travelled+=length(p-previous);
   }
   vec3 sampleP=(p+previous)*.5;
   ${attachments?'vec4 attachment=attachmentEmissionSegment(previous,p,pixelAngle);color+=trans*attachment.rgb;trans*=1.0-attachment.a;':''}
   vec4 d=discAt(p,previous,v,dt);color+=trans*d.rgb;trans*=1.0-d.a;
   color+=trans*jetField(previous,p,dt);
   ${probe?'color+=trans*probeEmissionSegment(previous,p);':''}
   ${craft?'color+=trans*thrusterSegment(previous,p);':''}
   ${stellar?'color+=trans*stellarEmissionSegment(previous,p);':''}
   color+=trans*whiteHoleEmission(sampleP,dt);
   vec4 tail=debris(sampleP,dt);color+=trans*tail.rgb;trans*=1.0-tail.a;
   vec4 warp=warpWorldAppearance(p,previous,dt);color+=trans*warp.rgb;trans*=1.0-warp.a;
   if(obj.a>0.0){color+=trans*obj.rgb*obj.a;trans*=1.0-obj.a;if(obj.a>.999){object=true;break;}p+=unit(v)*max(1e-12,length(p)*1e-7);}
   if(trans<.015)break;
  }
 }
 if(!swallowed&&!object){
  if(uFlags.x>.5&&!(localWarp&&uWarpFlags.w<.5${anomaly?'&&uAnomalyCount==0':''})){vec4 grid=coordinateGridEscape(p,unit(v),travelled,pixelAngle);color+=trans*grid.rgb;trans*=1.0-grid.a;}
  color+=${warp?'skyForWarpTravel(unit(v),original)':'sky(unit(v))'}*trans;
 }
 if(uSpectrum!=5&&!swallowed&&!object&&uFlags.y>.5&&uWarpFlags.w>.5){float glow=exp(-abs(nearRadius-3.05)*2.2)*.045;vec3 glowHue=uSpectrum==2?vec3(.3,.6,1):uSpectrum==1?vec3(.6,.12,.035):uSpectrum==3?vec3(.95,.35,.08):uSpectrum==4?vec3(.06,.015,.09):vec3(1,.56,.22);color+=glowHue*glow;}
 if(!warpObject&&localWarp&&inspected.a<.5)color=warpColor+warpTrans*color;
 ${probe?'color+=probeInspectorEmission(uv,fov);':''}
 ${stellar?'color+=stellarInspectorEmission(uv,fov);':''}
 ${craft?'color+=thrusterInspectorEmission(uv,fov);':''}

 // Capture and white-hole emission use the same traced rays as Visible light.
 // No artificial cyan capture contour is composited over Geometry mode.
 color+=metricColor;
 color*=uExposure;color=vec3(1)-exp(-max(color,vec3(0)));color=pow(color,vec3(.92));
 float vignette=1.0-.22*smoothstep(.35,1.3,length(uv));
 color=color*vignette;
 gl_FragColor=vec4(color,1);
 `}
}
`.replaceAll('[12]',`[${slots}]`).replaceAll('j<12',`j<${slots}`).replaceAll('k<12',`k<${slots}`);
}

export const FRAGMENT=createFragment();
