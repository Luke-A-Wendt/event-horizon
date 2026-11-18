// Optional, bounded world-space transport. Noise is evaluated only when the
// integrated ray enters a new distance bin; short gravity steps reuse it.
// 3/4/8/12 bins cover an entire ray, including its straight far continuation.
export function nebulaVolumeGLSL({warp=false,bodyGravity=false,attachments=false,cluster=false,photo=false}={}){return `
uniform vec4 uNebulaVolume,uNebulaVolumeStyle,uNebulaVolumeWorld;
float nebulaVolumeRange(){return max(uNebulaVolumeWorld.w,1e-20)*3.0*max(.25,uNebulaVolume.w);}
bool nebulaVolumeActive(){return uNebulaVolume.x>.5&&(uFlags2.y>.5||(uBridge.x>.5&&uBridgeOtherNebula>.5))&&uNebulaVolume.z>0.0&&uSpectrum!=5;}
float nebulaMaterialDelta(float radius,float flow){
 float x=flow/max(radius*sqrt(radius),1e-30);
 if(abs(x)<.02)return x*(.666666667+x*(-.111111111+x*.049382716));
 return sign(1.0+x)*pow(abs(1.0+x),.666666667)-1.0;
}
vec3 nebulaMaterialPoint(vec3 p){
 vec3 displaced=p;float clock=max(0.0,uTime)*uNebulaVolumeStyle.y;
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;if(k==1&&uBinary==0)break;
  float m=uHoles[k].w;if(m<=0.0)continue;
  vec3 relative=(p-uHoles[k].xyz)/m;float r=max(length(relative),max(horizonFor(k)/m,.001));
  // Same infall/outflow material labels and spin rate as coordinateGridCoordinates.
  float flow=(whiteFor(k)>.5?-1.0:1.0)*4.242640687*clock;
  float expansion=1.0+nebulaMaterialDelta(r,flow),angle=-2.0*spinFor(k)*clock/(1.0+r*r*r);
  vec3 axis=axisFor(k);float c=cos(angle),s=sin(angle);
  vec3 rotated=relative*c+cross(axis,relative)*s+axis*dot(axis,relative)*(1.0-c);
  displaced+=(rotated*expansion-relative)*m;
 }
 ${bodyGravity&&!cluster?`if(uWarpFlags.w<.5){for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;float type=uColors[j].a;if(type>.5&&!(type>1.5&&type<2.5))continue;
  float m=max(0.0,uBodyMasses[j]/4300000.0);if(m<=0.0)continue;
  vec3 relative=p-uObjects[j].xyz;float r=max(length(relative),max(uObjects[j].w,1e-20));
  displaced+=relative*nebulaMaterialDelta(r,1.5*sqrt(2.0*m)*18.0*clock);
 }}`:''}
 ${cluster?`for(int j=0;j<24;j++){
  if(j>=uClusterCount)break;vec3 q=p-uClusterBodies[j].xyz;
  float radius=max(length(q),uClusterBodies[j].w*1.02),m=uClusterParams[j].x,flow=mod(clock,240.0)*.5;
  float fall=pow(pow(radius,1.5)+1.5*sqrt(2.0*m)*flow,.666666667)-radius;
  float weight=1.0/(1.0+radius/max(m*24.0,1e-12));
  displaced+=q/radius*(m*2.0+fall)*weight+cross(uClusterAxes[j].xyz,q/radius)*uClusterParams[j].y*m*weight;
 }`:''}
 vec3 chart=displaced/max(uNebulaVolumeWorld.w,1e-20)+uNebulaVolumeWorld.xyz;
 ${warp?`if(uWarpFlags.x>.5&&uWarpFlags.w<.5&&uWarpRadius>1e-20){
  // The isolated ship uses exactly the grid's world phase and orientation.
  vec3 q=warpFrame((p-uWarpCenter)/uWarpRadius);vec2 o=uWarpGridRotation;
  vec2 phase=mod(uWarpGridOffset+vec2(2048.0),4096.0)-vec2(2048.0);
  vec2 plane=mat2(o.x,o.y,-o.y,o.x)*q.xz+phase;
  chart=vec3(plane.x,q.y,plane.y)*(uWarpRadius/max(uNebulaVolumeWorld.w,1e-20));
 }`:''}
 return chart;
}
float nebulaCavity(vec3 p){
 float clear=1.0;
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;if(k==1&&uBinary==0)break;
  float m=uHoles[k].w;if(m<=0.0)continue;vec3 relative=p-uHoles[k].xyz;
  clear*=smoothstep(max(horizonFor(k)*2.5,m*6.0),max(horizonFor(k)*4.5,m*11.0),length(relative));
  if(k==0?uFlags.y>.5:uDiskSecondaryParams.w>.5){
   vec3 q=localPoint(relative,axisFor(k));float outer=outerFor(k),thickness=(k==0?uDiskParams.y:uDiskSecondaryParams.y)*m;
   float disc=(1.0-smoothstep(outer*.88,outer*1.22,length(q.xz)))*(1.0-smoothstep(max(m*2.0,thickness*1.5),max(m*5.0,thickness*3.0),abs(q.y)));
   clear*=1.0-disc;
  }
 }
 ${bodyGravity||attachments?`for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;float type=uColors[j].a,radius=max(uObjects[j].w,1e-20),distance=length(p-uObjects[j].xyz);
  if(type>1.5&&type<2.5&&uBodyParams[j].z<0.0)clear*=smoothstep(radius*3.0,radius*5.5,distance);
  if(type>8.5&&type<9.5)clear*=smoothstep(radius*1.05,radius*1.45,distance);
 }`:''}
 ${cluster?`for(int j=0;j<24;j++){
  if(j>=uClusterCount)break;float radius=max(uClusterBodies[j].w*3.0,uClusterParams[j].w*1.15);
  clear*=smoothstep(radius,radius*1.4,length(p-uClusterBodies[j].xyz));
 }`:''}
 return clear;
}
// Cache stores extinction and two morphology values. Color remains separate
// so the two bridge charts immediately retain their own warm/cool palettes.
vec4 nebulaVolumeField(vec3 p,bool other){
 vec4 params=other?uBridgeSkyParams:uNebulaParams;
 vec3 q=nebulaMaterialPoint(p);if(other)q=vec3(-q.z,q.y,-q.x)+vec3(17.3,2.1,9.8);
 q.xz=rot(params.w)*q.xz;q*=max(.2,params.y)*max(.25,uNebulaVolumeStyle.x)*1.6;
 vec3 point=q+vec3(2,6,1);
 if(uBridge.x>.5&&uNebulaMulticolor.x<.5){
  vec3 primary=other?uBridgeSkyColor:uNebulaColor;float peak=max(.001,max(primary.r,max(primary.g,primary.b)));
  float warm=smoothstep(.70,.90,(primary.r-max(primary.g,primary.b))/peak),cold=smoothstep(.65,.85,(primary.b-max(primary.r,primary.g))/peak);
  // Three existing noise evaluations become rising plumes or layered frost.
  point*=mix(vec3(1),vec3(1.2,.42,1.2),warm);point.y-=max(0.0,uTime)*uNebulaVolumeStyle.y*.035*warm;
  point*=mix(vec3(1),vec3(.8,1.5,.8),cold);
 }
 float broad=noise(point*.73),folded=noise(point*1.61+vec3(broad*.9));
 float n=broad*.62+folded*.38,fine=noise(point*4.1+vec3(folded*1.6));
 // Sparse billows have truly empty intervals between them. A ridged noise
 // contour made a luminous cellular web and filled every direction with haze.
 float threshold=uNebulaVolume.y<.5?.52:uNebulaVolume.y>1.5?.39:.46;
 float body=smoothstep(threshold,.76,n),filaments=smoothstep(.28,.74,fine);
 float cloud=body*body*(.30+.70*filaments);
 if(uNebulaVolume.y<.5)cloud*=.75;
 else if(uNebulaVolume.y>1.5)cloud*=1.35;
 // Existing backdrop morphology also shapes the finite 3D cloud field.
 if(params.x>.5&&params.x<1.5){float shell=exp(-pow((length(q-vec3(.2,.15,-1)) -1.6)*1.45,2.0));cloud*=.10+shell*1.9;}
 else if(params.x>1.5&&params.x<2.5)cloud*=.18+filaments*1.65;
 else if(params.x>2.5){float arms=.5+.5*cos(atan(q.z,q.x)*3.0+q.y*2.5+n*4.0);cloud*=.10+pow(arms,3.0)*1.8;}
 // Soft cavities keep horizons, photon rings and emitting discs readable.
 float density=cloud*nebulaCavity(p)*uNebulaVolume.z*max(0.0,params.z)*(other?uBridgeOtherNebula:uFlags2.y)*1.4;
 return vec4(density,n,filaments,clamp(.5+(broad-folded)*2.8,0.0,1.0));
}
vec3 nebulaVolumeTint(vec4 field,bool other){
 vec3 primary=other?uBridgeSkyColor:uNebulaColor;
 vec3 palette=nebulaCloudTint(primary,field.w,field.z);
 // Keep colored emission saturated; adding a white ridge term washed out
 // turquoise/rose and violet/cyan into a nearly uniform blue-gray veil.
 vec3 saturated=pow(max(palette,vec3(0)),vec3(1.45));
 saturated*=max(palette.r,max(palette.g,palette.b))/max(.001,max(saturated.r,max(saturated.g,saturated.b)));
 vec3 tint=saturated*(.48+field.z*.92);
 if(uSpectrum==1)return thermalPalette(.22+field.y*.58)*1.4;
 if(uSpectrum==2)return mix(vec3(.09,.22,.75),vec3(.50,.82,1.0),field.z)*.20;
 if(uSpectrum==3)return mix(vec3(.15,.045,.22),vec3(.48,.24,.08),field.z)*.65;
 if(uSpectrum==4)return vec3(.48,.23,.72)*.008*pow(field.z,4.0);
 return tint;
}
void nebulaVolumeSegment(vec3 start,vec3 end,bool other,inout float distance,inout float sampleIndex,inout vec4 cached,inout vec3 color,inout float transmission){
 if(!nebulaVolumeActive())return;
 float range=nebulaVolumeRange(),span=length(end-start);if(span<=1e-20||distance>=range)return;
 float budget=${photo?'mix(24.0,48.0,clamp((uPhotoDetail-1.0)*.5,0.0,1.0))':'clamp(floor(uNebulaVolumeStyle.w+.5),3.0,12.0)'},spacing=range/budget;
 float finish=min(range,distance+span),base=distance;vec3 ray=(end-start)/span;
 // Usually one iteration: curved ray steps reuse their bin's cached field.
 // A skipped exterior / weak-field segment can consume the remaining bins.
 for(int bin=0;bin<${photo?48:12};bin++){
  if(distance>=finish||transmission<.005)break;
  float index=min(budget-1.0,floor((distance+spacing*.00001)/spacing));
  float stop=min(finish,(index+1.0)*spacing),lengthWorld=max(0.0,stop-distance);
  if(index!=sampleIndex){
   // Fixed path-distance boundaries are independent of gravity step size.
   // Midpoints of the first touched segment produced circular seams where
   // short integrated steps joined a long straight exterior continuation.
   cached=nebulaVolumeField(start+ray*max(0.0,distance-base),other);sampleIndex=index;
  }
  // A length-normalized extinction ceiling bounds the whole ray, without
  // another accumulator or another noise lookup. Density .5 allows at most
  // 1-exp(-.4)=33% extinction; deliberate values above 1 can become opaque.
  float density=max(0.0,uNebulaVolume.z),maximumTau=.8*min(density,1.0)+2.4*max(0.0,density-1.0);
  float extinction=min(cached.x/max(uNebulaVolumeWorld.w,1e-20),maximumTau/range);
  float opticalDepth=extinction*lengthWorld;
  // The camera cache is nearly constant across the image. Give later,
  // spatially separated samples the weight while entering the medium softly.
  opticalDepth*=.02+.98*smoothstep(spacing*.75,spacing*1.75,(distance+stop)*.5);
  // Cold dust barely attenuates hard radiation, preserving spectral semantics.
  float band=uSpectrum==2?.14:uSpectrum==3?.32:uSpectrum==4?.012:1.0;
  float opacity=1.0-exp(-min(12.0,opticalDepth*band));
  color+=transmission*nebulaVolumeTint(cached,other)*opacity;${photo&&bodyGravity?`
  // Single dust scattering of local stellar light. Use a bounded stellar
  // solid angle and a forward Henyey–Greenstein phase function; no source,
  // no halo. The rest of this segment still uses Beer–Lambert extinction.
  if(!other&&uSpectrum==0&&opacity>0.00001){
   vec3 samplePoint=start+ray*((distance+stop)*.5-base),illumination=vec3(0.0);
   for(int j=0;j<12;j++){
    if(j>=uObjectCount)break;
    if(uColors[j].a<1.5||uColors[j].a>2.5||uBodyParams[j].z<0.0)continue;
    vec3 delta=uObjects[j].xyz-samplePoint;float d=length(delta);
    float angularRadius=min(1.0,uObjects[j].w/max(d,1e-20));
    float mu=clamp(dot(ray,delta/max(d,1e-20)),-1.0,1.0);
    float phase=.6975/pow(1.3025-1.10*mu,1.5);
    illumination+=uColors[j].rgb*(angularRadius*angularRadius*phase);
   }
   color+=transmission*opacity*.58*min(illumination,vec3(4.0));
  }`:''}transmission*=1.0-opacity;
  distance=stop;
 }
}
`;}
