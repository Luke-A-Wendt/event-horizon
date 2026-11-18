import {warpGridSurface} from './warp-glsl.js';
// An Ellis wormhole optical chart, compiled only for the bridge experiment.
// The vacuum Einstein–Rosen bridge cannot be traversed; the UI and math guide
// explicitly identify this exotic-matter comparison model instead.
// Both physical vista spheres sit well beyond their mouth, in the local
// asymptotically flat chart. Inversion sends the far sphere to an exact sphere
// in the shared isotropic chart: no sky decal or arbitrary portal clipping.
export const BRIDGE_WORLD_LAYOUT=Object.freeze({distance:15,radius:3});
export function bridgeWorldSphere(other=false,throat=1,axis=[0,0,1]){
 const {distance,radius}=BRIDGE_WORLD_LAYOUT,scale=other?1/(4*(distance*distance-radius*radius)):1;
 return {center:axis.map(v=>v*distance*scale*throat),radius:radius*scale*throat,other};
}
// A closed arrival gate is flat in its inverted chart. This apparent sphere
// lets the cheap CPU projection use that chart without changing the traveler.
export function bridgeFlatWorldSphere(observer,throat=1,axis=[0,0,1]){
 const r2=Math.max(1e-30,observer.reduce((sum,x)=>sum+x*x,0)),scale=throat*throat/(4*r2),length=Math.sqrt(r2),n=observer.map(x=>x/length);
 const farObserver=observer.map(x=>x*scale),delta=axis.map((x,i)=>x*BRIDGE_WORLD_LAYOUT.distance*throat-farObserver[i]),along=delta.reduce((sum,x,i)=>sum+x*n[i],0);
 return {center:observer.map((x,i)=>x+(delta[i]-2*n[i]*along)/scale),radius:BRIDGE_WORLD_LAYOUT.radius*throat/scale,other:true};
}
export function bridgeGLSL({grid=true,ultra=false,photo=false,photoSteps=3072,probe=false,attachments=false,bodyGravity=false,nebulaVolume=false}={}) {
 return `
float bridgeMetricScale(){float radius=max(uBridgeStage.x,.0001);return uBridgeStage.y>.5?1.0/radius:radius;}
float bridgeConformalAt(vec3 p){float throat=bridgeMetricScale();return 1.0+.25*throat*throat/max(dot(p,p),1e-12);}
vec3 bridgeSecondCenter(){return vec3(.72,0,0);}
vec3 bridgeSecondAxis(){return unit(cross(uBridgeGridAxis,abs(uBridgeGridAxis.x)<.9?vec3(1,0,0):vec3(0,1,0)));}
vec3 bridgeRayForce(vec3 p,vec3 v){
 float r2=max(dot(p,p),1e-12),throat=bridgeMetricScale(),b2=throat*throat;
 vec3 gradient=-2.0*b2*p/(r2*(4.0*r2+b2));
 if(uSceneOptions.y>.5){
  // Two perpendicular Ellis comparison charts. This sum of optical
  // gradients is explicitly an illustrative composite, not an intersecting
  // Einstein-equation solution or a demonstrated traversable ER bridge.
  vec3 q=p-bridgeSecondCenter();float second=max(dot(q,q),1e-12);
  gradient+=-2.0*b2*q/(second*(4.0*second+b2));
 }
 ${bodyGravity?'gradient+=force(p*uBridge.y,v)*uBridge.y;':''}
 if(uBridgeBubble.w>0.0){vec3 q=(p*uBridge.y-uBridgeBubble.xyz)/uBridgeBubble.w;float r=length(q),shell=exp(-pow((r-1.0)*4.0,2.0));gradient+=.08*(uWarpStrength/1.2)*uBridge.y/uBridgeBubble.w*shell*(uBridgeBubbleAxis-q*dot(q,uBridgeBubbleAxis)/max(r*r,.01));}
 return uFlags.z>.5?gradient-v*dot(v,gradient):vec3(0);
}

// Meridians and equal proper-radial intervals on the equatorial chart.
// These are annotations sampled where the INTEGRATED ray crosses the sheet.
vec4 bridgeGridAtAxis(vec3 p,vec3 ray,float travelled,float pixelAngle,vec3 axis,vec3 center){
 vec3 chart=localPoint(p,axis);
 float radius=max(length(chart.xz),1e-6),throatRadius=bridgeMetricScale(),l=radius-.25*throatRadius*throatRadius/radius;
 float angle=atan(chart.z,chart.x),incidence=abs(dot(ray,axis));
 float footprint=max(.002,travelled*pixelAngle*bridgeConformalAt(p)/max(incidence,.08));
 float spacing=.5*exp2(floor(max(0.0,log2(footprint*14.0/.5))));
 float radial=abs(fract(l/spacing+.5)-.5)*spacing;
 float angular=abs(fract(angle/(PI/16.0)+.5)-.5)*(PI/16.0)*sqrt(l*l+throatRadius*throatRadius);
 float line=max(1.0-smoothstep(footprint*.35,footprint,radial),1.0-smoothstep(footprint*.35,footprint,angular));
 float throat=1.0-smoothstep(footprint*.4,footprint*1.6,abs(l));
 float resolved=1.0-smoothstep(.025,.09,footprint/max(throatRadius,sqrt(l*l+throatRadius*throatRadius)));
 float intensity=(line*.34+throat*.35)*smoothstep(.015,.08,incidence)*resolved;
 ${grid?`if(uBridgeBubble.w>0.0)intensity*=1.0-max(warpPatchCoverage,warpPatchWeight(length((p+center)*uBridge.y-uBridgeBubble.xyz)/uBridgeBubble.w));`:''}
 return vec4(vec3(.11,.57,.89)*intensity*(uSpectrum==5?1.4:1.0),intensity*.08);
}
vec4 bridgeGridAt(vec3 p,vec3 ray,float travelled,float pixelAngle){return bridgeGridAtAxis(p,ray,travelled,pixelAngle,uBridgeGridAxis,vec3(0));}
vec4 bridgeGridSegmentAxis(vec3 a,vec3 b,float travelled,float pixelAngle,vec3 axis,vec3 center){
 float first=dot(a,axis),second=dot(b,axis);
 if(uFlags.x<.5||first*second>0.0||abs(first-second)<1e-12)return vec4(0);
 float t=first/(first-second);
 if(t<=.000001||t>1.0)return vec4(0);
 vec3 delta=b-a;
 return bridgeGridAtAxis(mix(a,b,t),unit(delta),travelled+length(delta)*t,pixelAngle,axis,center);
}
vec4 bridgeGridSegment(vec3 a,vec3 b,float travelled,float pixelAngle){
 vec4 first=bridgeGridSegmentAxis(a,b,travelled,pixelAngle,uBridgeGridAxis,vec3(0));
 if(uSceneOptions.y<.5)return first;
 vec3 offset=bridgeSecondCenter();vec4 other=bridgeGridSegmentAxis(a-offset,b-offset,travelled,pixelAngle,bridgeSecondAxis(),offset);
 other.rgb*=vec3(1.3,.65,1.35);
 return vec4(first.rgb+(1.0-first.a)*other.rgb,first.a+(1.0-first.a)*other.a);
}
${bodyGravity&&grid?`
// The traveler's guide is a Cartesian sheet in its motion plane, independent
// of the throat's polar chart. Sample the same integrated, body-clipped rays:
// lensing bends its rectangular lines without turning them into radial labels.
vec4 bridgeBodyGridAt(vec3 point,vec3 direction,float travelled,float pixelAngle){
 vec3 chart=coordinateGridChart(point)/coordinateGridScale();
 float nativeWeight=uBridgeBubble.w>0.0?1.0-max(warpPatchCoverage,warpPatchWeight(length(point-uBridgeBubble.xyz)/uBridgeBubble.w)):1.0;
 return nativeWeight*coordinateGridStroke(vec3(chart.x+uGridAnchor.x,chart.z+uGridAnchor.y,1.0),direction,travelled,pixelAngle);
}
vec4 bridgeBodyGridSegment(vec3 start,vec3 end,float travelled,float pixelAngle){
 if(uFlags.x<.5)return vec4(0);
 float a=coordinateGridSheet(start),b=coordinateGridSheet(end);
 if(a*b>0.0||abs(a-b)<1e-14)return vec4(0);
 float fraction=a/(a-b);
 if(fraction<=.000001||fraction>1.0)return vec4(0);
 vec3 delta=end-start;float distance=length(delta);
 if(distance<1e-14)return vec4(0);
 return bridgeBodyGridAt(mix(start,end,fraction),delta/distance,travelled+distance*fraction,pixelAngle);
}
vec4 bridgeBodyGridEscape(vec3 point,vec3 direction,float travelled,float pixelAngle){
 if(uFlags.x<.5)return vec4(0);
 float denominator=dot(direction,coordinateGridNormal());
 if(abs(denominator)<1e-7)return vec4(0);
 float distance=-coordinateGridSheet(point)/denominator;
 if(distance<=max(1e-12,coordinateGridScale()*.000001))return vec4(0);
 return bridgeBodyGridAt(point+direction*distance,direction,travelled+distance,pixelAngle);
}
`:''}
// Finite worlds in both mouths' outward directions. The traveler stays on
// the common axis and turns around well before either planetary surface.
vec3 bridgeMouthAxis(){
 vec3 helper=abs(uPrimaryAxis.z)<.9?vec3(0,0,1):vec3(1,0,0);
 return cross(unit(cross(uPrimaryAxis,helper)),uPrimaryAxis);
}
vec3 bridgeDepartureCenter(){return bridgeMouthAxis()*${BRIDGE_WORLD_LAYOUT.distance.toFixed(1)};}
// A thin mechanical annulus in the same optical chart as the traveler.
// Segment intersections reuse the curved ray: no screen-space portal decal,
// sphere tracing, shadow rays, texture fetches, or new shader variants.


vec3 bridgeWorldMaterial(vec3 normal,vec3 ray,bool other){
 // Reuse the same rocky material and tint as the Proxima b catalog scene.
 // Its geography is unknown; it must not inherit Arakas's dune texture.
 if(other&&uBridge.w>.5)return bodySurface(normal,ray,vec3(.62353,.50588,.44706),0.0,vec4(0,0,0,.08),unit(-bridgeMouthAxis()+uPrimaryAxis*.65));
 vec3 tex=localPoint(normal,uPrimaryAxis);tex.xz=rot(uTime*.002)*tex.xz;
 float continent=detailedFbm(tex*4.3+vec3(7.1,2.4,9.8));
 float fine=detailedFbm(tex*29.0+vec3(19.1,5.7,11.0));
 float light=.11+.89*max(0.0,dot(normal,unit(-bridgeMouthAxis()+uPrimaryAxis*.65)));
 vec3 ground;
 if(other){
  // Arakas: broad warm dune seas, striated ridges and dark dry uplands.
  float latitude=asin(clamp(tex.y,-1.0,1.0)),longitude=atan(tex.z,tex.x);
  float dunes=.5+.5*sin(longitude*92.0+sin(latitude*18.0+continent*6.0)*4.0+fine*2.0);
  ground=mix(vec3(.27,.085,.028),vec3(.88,.44,.14),.3+continent*.7);
  ground*=.84+.16*dunes;
  ground=mix(ground,vec3(.20,.065,.025),smoothstep(.66,.78,continent)*.7);
 }else{
  // Caladan: near-equal ocean and continent coverage, lush coasts and clouds.
  float land=smoothstep(.47,.53,continent);
  vec3 water=mix(vec3(.008,.065,.15),vec3(.018,.27,.40),smoothstep(.38,.52,continent));
  vec3 forest=mix(vec3(.025,.13,.055),vec3(.18,.34,.12),fine);
  forest=mix(forest,vec3(.35,.36,.28),smoothstep(.63,.74,continent));
  ground=mix(water,forest,land);
  float coast=1.0-smoothstep(.006,.023,abs(continent-.5));ground+=coast*vec3(.025,.055,.028);
  float cloud=smoothstep(.59,.73,detailedFbm(tex*12.0+vec3(18.4,1.2,uTime*.002)))*.62;
  ground=mix(ground,vec3(.75,.83,.88),cloud);
  ground+=(1.0-land)*pow(max(0.0,dot(reflect(bridgeMouthAxis(),normal),-ray)),44.0)*vec3(.14,.21,.25);
 }
 float limb=pow(1.0-max(0.0,dot(normal,-ray)),5.0);
 vec3 atmosphere=other?vec3(.40,.16,.035):vec3(.035,.24,.48);
 // The spectral response applies to terrain and atmosphere together.
 return surfaceSpectrum(ground+limb*atmosphere,light,other?.18:.10,other?.08:.16);
}
vec4 bridgeDepartureHit(vec3 a,vec3 b,out float fraction){
 fraction=1.0;if(uBridge.z<.5)return vec4(0);
 vec3 delta=b-a;float span=length(delta);if(span<1e-12)return vec4(0);
 vec3 ray=delta/span,worldCenter=bridgeDepartureCenter();
 float worldRadius=${BRIDGE_WORLD_LAYOUT.radius.toFixed(1)},inversion=1.0/(4.0*(dot(worldCenter,worldCenter)-worldRadius*worldRadius));
 vec4 nearest=vec4(0);
 for(int end=0;end<2;end++){
  bool other=end==1;if(uBridgeStage.z>.5&&uBridgeStage.x<.001&&other!=(uBridgeStage.y>.5))continue;
  float gate=bridgeMetricScale(),nearScale=uBridgeStage.y>.5?gate*gate:1.0,farScale=uBridgeStage.y>.5?1.0:gate*gate,scale=other?inversion*farScale:nearScale;
  vec3 center=worldCenter*scale,offset=a-center;float radius=worldRadius*scale,along=dot(offset,ray);
  if(dot(offset,offset)>(span+radius)*(span+radius))continue;
  float discriminant=radius*radius-dot(cross(offset,ray),cross(offset,ray));if(discriminant<0.0)continue;
  float root=sqrt(discriminant),distance=-along-root;if(distance<0.0)distance=-along+root;
  if(distance<0.0||distance>span||distance/span>=fraction)continue;
  fraction=distance/span;vec3 hit=a+ray*distance,point=other?hit*farScale/(4.0*dot(hit,hit)):hit/nearScale;
  vec3 radial=unit(hit),tangent=other?unit(ray-2.0*radial*dot(radial,ray)):ray;
  vec3 normal=unit(point-worldCenter);
  if(uSpectrum==5)nearest=vec4(vec3(.20+.55*max(0.0,dot(normal,-tangent))),1);
  else nearest=vec4(bridgeWorldMaterial(normal,tangent,other),1);
 }
 return nearest;
}
vec3 bridgeRegionSky(vec3 direction,bool other){
 if(uSpectrum==5)return vec3(0);
 // Each end has its own cloud morphology, orientation, size and emission color.
 // The broad diffuse envelope is part of the nebula, not a tint on the universe.
 vec3 d=other?unit(vec3(-direction.z,direction.y,-direction.x)):unit(direction);
 vec4 parameters=other?uBridgeSkyParams:uNebulaParams;
 vec3 hue=other?uBridgeSkyColor:uNebulaColor;
 parameters.z*=other?uBridgeOtherNebula:uFlags2.y;
 vec3 result=skyWithEnvironment(d,parameters,hue,other?uBridgeStars.y:uBridgeStars.x,other?uSkyParams.z:uSkyParams.x,other?uSkyParams.w:uSkyParams.y);
 if(other&&uBridge.w>.5){
  // Proxima's angular radius from b uses the catalog's .1542 R_sun/.04848 AU.
  // This red dwarf is part of the destination sky, not an orange desert world.
  vec3 starDirection=unit(-bridgeMouthAxis()+uPrimaryAxis*.65);float mu=dot(unit(direction),starDirection),size=.01479;
  float disc=smoothstep(cos(size*1.025),cos(size*.975),mu),spots=smoothstep(.58,.78,noise(direction*170.0))* .7;
  vec3 star=stellarSpectrum(vec3(1.0,.47059,.32157)*(2.6-spots),.6,2.0);
  result+=star*(disc+.018*exp(-max(0.0,1.0-mu)/(size*size*2.0)));
 }
 if(parameters.z>0.0){
  vec3 cloud=d;cloud.xz=rot(parameters.w)*cloud.xz;
  float diffuse=detailedFbm(cloud*(1.7+parameters.y)+vec3(other?17.3:3.1,7.2,9.8));
  float density=(.08+.32*pow(diffuse,2.0))*parameters.z;
  vec3 emission=hue;
  if(uSpectrum==1)emission=thermalPalette(other?.68:.29);
  if(uSpectrum==2){emission=other?vec3(.72,.37,1):vec3(.13,.66,1);density*=.20;}
  if(uSpectrum==3){emission=other?vec3(.46,.20,.08):vec3(.18,.06,.27);density*=.42;}
  if(uSpectrum==4){emission=vec3(.50,.24,.75);density*=.003*pow(diffuse,4.0);}
  result+=emission*density;
 }

 return result;
}
vec3 bridgeOtherSky(vec3 direction){return bridgeRegionSky(direction,true);}
// The local flat view is used only while the fictional gate opens/closes.
// Craft and endpoint surfaces remain present when the connecting radius is zero.
${nebulaVolume?`
// Each side samples a finite material chart. Inversion maps the destination
// positions and path lengths as well as the sky, so warm/cool clouds parallax.
vec3 bridgeNebulaChart(vec3 p,bool other){
 if(!other)return p*uBridge.y;
 float gate=bridgeMetricScale();return p*(gate*gate*uBridge.y/(4.0*max(dot(p,p),1e-12)));
}
void bridgeNebulaSegment(vec3 a,vec3 b,inout float distance,inout float sampleIndex,inout vec4 cached,inout vec3 color,inout float transmission){
 vec3 center=vec3(0);if(uSceneOptions.y>.5&&length((a+b)*.5-bridgeSecondCenter())<length((a+b)*.5))center=bridgeSecondCenter();
 a-=center;b-=center;bool other=length((a+b)*.5)<.5*bridgeMetricScale();
 nebulaVolumeSegment(bridgeNebulaChart(a,other),bridgeNebulaChart(b,other),other,distance,sampleIndex,cached,color,transmission);
}
`:''}
vec4 bridgeBubbleGrid(vec3 start,vec3 end,float travelled,float pixelAngle);
vec3 bridgeFlatTrace(vec3 camera,vec3 original,float pixelAngle){
 float throat=max(uBridge.y,1e-20);vec3 p=camera/throat,v=original;
 bool far=uBridgeStage.y>.5;vec3 skyDirection=far?unit(v-2.0*unit(p)*dot(unit(p),v)):v;
 float span=far?max(length(p)*3.0,.1):50.0,fraction=1.0,mask=0.0,planetFraction=1.0;
 ${nebulaVolume?'float flatCloudDistance=1e30;':''}
 vec4 body=objectHit((p+v*span)*throat,p*throat,v,fraction,mask),planet=vec4(0);
 if(far&&uBridge.z>.5){
  // At closure the arrival sky and finite world share one flat chart. A
  // straight ray in the compressed departure coordinates would shrink the
  // nearby destination incorrectly as the route gets shorter.
  vec3 arrival=p/(4.0*max(dot(p,p),1e-12)),offset=arrival-bridgeDepartureCenter();
  float along=dot(offset,skyDirection),radius=${BRIDGE_WORLD_LAYOUT.radius.toFixed(1)},discriminant=radius*radius-dot(cross(offset,skyDirection),cross(offset,skyDirection));
  if(discriminant>=0.0){float distance=-along-sqrt(discriminant);if(distance>0.0){vec3 normal=unit(offset+skyDirection*distance);planet=vec4(uSpectrum==5?vec3(.20+.55*max(0.0,dot(normal,-skyDirection))):bridgeWorldMaterial(normal,skyDirection,true),1);}}
  if(body.a<=0.0){body=planet;${nebulaVolume?'if(planet.a>.5)flatCloudDistance=max(0.0,-along-sqrt(max(0.0,discriminant)))*throat;':''}}
 }else{planet=bridgeDepartureHit(p,p+v*span,planetFraction);if(planet.a>.5&&(body.a<=0.0||planetFraction<fraction))body=planet;}
 vec3 result=mix(bridgeRegionSky(skyDirection,far),body.rgb,body.a);
 ${nebulaVolume?`float nebulaDistance=0.0,nebulaSample=-1.0,cloudTransmission=1.0;vec4 nebulaCached=vec4(0);vec3 foreground=vec3(0),cloudStart=bridgeNebulaChart(p,far);
 float cloudStop=body.a>.999?min(flatCloudDistance,length(bridgeNebulaChart(p+v*span*min(fraction,planetFraction),far)-cloudStart)):nebulaVolumeRange();
 nebulaVolumeSegment(cloudStart,cloudStart+skyDirection*min(cloudStop,nebulaVolumeRange()),far,nebulaDistance,nebulaSample,nebulaCached,foreground,cloudTransmission);
 result=foreground+cloudTransmission*result;`:''}
 ${grid?`vec4 localSheet=bridgeBubbleGrid(p,p+v*span*min(fraction,planetFraction),0.0,pixelAngle);result=localSheet.rgb+(1.0-localSheet.a)*result;`:''}
 return result;
}
vec4 bridgeBubbleAppearance(vec3 a,vec3 b){
 if(uBridgeBubble.w<=0.0||uWarpFlags.y<.5||uSpectrum==5)return vec4(0);
 vec3 q=((a+b)*(.5*uBridge.y)-uBridgeBubble.xyz)/uBridgeBubble.w;float r=length(q);if(r>1.6)return vec4(0);
 float shell=exp(-pow((r-1.0)*10.0,2.0)),limb=pow(1.0-abs(dot(unit(q),unit(b-a))),2.0),amount=min(.035,length(b-a)*uBridge.y/uBridgeBubble.w*shell*(.012+.14*limb)*min(1.4,uWarpStrength/1.2));
 vec3 hue=mix(vec3(1,.30,.08),vec3(.10,.60,1),smoothstep(-.2,.2,dot(q,uBridgeBubbleAxis)));
 if(uSpectrum==1)hue=vec3(.9,.3,.08);if(uSpectrum==2)hue=vec3(.2,.55,1);if(uSpectrum==3)hue*=.4;if(uSpectrum==4)hue*=.08;
 return vec4(hue*amount,amount*.025);
}
// The ship carries its own planar chart through the perpendicular mouth chart.
// Both are intersected by the same integrated ray; neither is a screen overlay.
vec3 bridgeBubbleFrame(vec3 q){
 vec3 x=unit(uBridgeBubbleAxis),reference=dot(uDriveUp,uDriveUp)>.5?uDriveUp:uPrimaryAxis,up=reference-x*dot(reference,x);
 if(dot(up,up)<.0001){reference=abs(x.y)<.9?vec3(0,1,0):vec3(1,0,0);up=reference-x*dot(reference,x);}
 vec3 y=unit(up);return vec3(dot(q,x),dot(q,y),dot(q,cross(x,y)));
}
${grid?`
float bridgeSoftTanh(float x){return 2.0/(1.0+exp(-2.0*clamp(x,-12.0,12.0)))-1.0;}
float bridgeBubbleShape(float r){float s=max(1.0,uWarpThickness);return (bridgeSoftTanh(s*(r+1.0))-bridgeSoftTanh(s*(r-1.0)))/(2.0*bridgeSoftTanh(s));}
${warpGridSurface('bridgeBubbleShape(radial)').replaceAll('warpGrid','bridgeWarpGrid').replaceAll('warpSheet','bridgeWarpSheet')}
vec4 bridgeBubbleGrid(vec3 start,vec3 end,float travelled,float pixelAngle){
 if(uFlags.x<.5||uBridgeBubble.w<=0.0)return vec4(0);
 float scale=uBridge.y/uBridgeBubble.w;vec3 a=bridgeBubbleFrame((start*uBridge.y-uBridgeBubble.xyz)/uBridgeBubble.w),b=bridgeBubbleFrame((end*uBridge.y-uBridgeBubble.xyz)/uBridgeBubble.w);
 vec3 delta=b-a,middle=(a+b)*.5;if(length(middle)>4.1+length(delta)*.5)return vec4(0);
 float ha=bridgeWarpSheet(a),hb=bridgeWarpSheet(b);if(ha*hb>0.0||abs(ha-hb)<1e-10)return vec4(0);
 float t=clamp(ha/(ha-hb),0.0,1.0),lo=0.0,hi=1.0;vec3 hit=mix(a,b,t);
 for(int j=0;j<3;j++){float h=bridgeWarpSheet(hit);if(abs(h)<.00001)break;if(ha*h<=0.0){hi=t;hb=h;}else{lo=t;ha=h;}t=mix(lo,hi,clamp(ha/(ha-hb),0.0,1.0));hit=mix(a,b,t);}
 float blend=warpPatchWeight(length(hit.xz));if(blend<=0.0)return vec4(0);warpPatchCoverage=max(warpPatchCoverage,blend);
 return blend*bridgeWarpGridAt(hit,a,unit(delta),travelled*scale+length(delta)*t);
}`:`vec4 bridgeBubbleGrid(vec3 a,vec3 b,float d,float p){return vec4(0);}`}
vec3 bridgeTrace(vec3 camera,vec3 original,float pixelAngle){
 if(uBridgeStage.x<.001)return bridgeFlatTrace(camera,original,pixelAngle);
 float throat=max(uBridge.y,1e-20),gate=bridgeMetricScale();
 vec3 p=camera/throat,v=original,color=vec3(0),metricColor=vec3(0);float transmission=1.0,travelled=0.0,transparentMask=0.0;
 bool otherSide=false,object=false;
 ${nebulaVolume?'float nebulaDistance=0.0,nebulaSample=-1.0;vec4 nebulaCached=vec4(0);':''}
 // Skip asymptotically empty space, exactly as in the black-hole integrator.
 if(length(p)>18.0){
  float projection=dot(p,v),discriminant=projection*projection-dot(p,p)+324.0;
  if(discriminant<0.0||projection>=0.0){
   ${nebulaVolume?'nebulaVolumeSegment(camera,camera+v*nebulaVolumeRange(),false,nebulaDistance,nebulaSample,nebulaCached,color,transmission);return color+transmission*bridgeRegionSky(v,false);':'return bridgeRegionSky(v,false);'}
  }
  float entry=-projection-sqrt(max(0.0,discriminant));
  if(entry>0.0){
   vec3 next=p+v*entry;vec4 guide=bridgeGridSegment(p,next,0.0,pixelAngle);
   ${bodyGravity&&grid?'vec4 bodyGuide=bridgeBodyGridSegment(p*throat,next*throat,0.0,pixelAngle);guide.rgb+=(1.0-guide.a)*bodyGuide.rgb;guide.a+=(1.0-guide.a)*bodyGuide.a;':''}
   ${nebulaVolume?'bridgeNebulaSegment(p,next,nebulaDistance,nebulaSample,nebulaCached,color,transmission);':''}
   color+=transmission*guide.rgb;transmission*=1.0-guide.a;travelled+=entry;p=next;
  }
 }
 for(int i=0;i<${photo?photoSteps:ultra?768:288};i++){
  if(i>=uSteps)break;
  float radius=max(length(p),1e-7);
  if(uSceneOptions.y>.5)radius=min(radius,max(length(p-bridgeSecondCenter()),1e-7));
  if(radius<(uBridge.z>.5?.008:.018)*min(gate,1.0)){otherSide=true;break;}
  if(radius>18.05&&dot(p,v)>0.0)break;
  // Scale steps in the isotropic chart: this remains smooth at r=b/2,
  // the nonsingular throat, and resolves the increasingly compressed end.
  float step=min(.13*radius,.035*gate+.10*abs(radius-.5*gate))*288.0/float(uSteps);
  step=min(step,.30*radius);
  ${bodyGravity?`// A massive traveler has its own short curvature scale. Ellis-only
  // steps can leap across a foreground hole's strong lensing region.
  for(int j=0;j<12;j++){
   if(j>=uGravityCount)break;if(uBodyMasses[j]<=0.0||uColors[j].a>2.5)continue;
   float bodyRadius=max(uObjects[j].w/throat,1e-12),distance=length(p-uObjects[j].xyz/throat);
   step=min(step,max(bodyRadius*.03,distance*.08)*288.0/float(uSteps));
  }`:''}
  ${photo?`vec3 previous=p,k1=bridgeRayForce(p,v),v2=unit(v+k1*(step*.5));
  vec3 k2=bridgeRayForce(p+v*(step*.5),v2),v3=unit(v+k2*(step*.5));
  vec3 k3=bridgeRayForce(p+v2*(step*.5),v3),v4=unit(v+k3*step);
  vec3 k4=bridgeRayForce(p+v3*step,v4);
  p+=(v+2.0*v2+2.0*v3+v4)*(step/6.0);v=unit(v+(k1+2.0*k2+2.0*k3+k4)*(step/6.0));`:`vec3 previous=p,acceleration=bridgeRayForce(p,v),midV=unit(v+acceleration*step*.5),midP=p+v*step*.5;
  v=unit(v+bridgeRayForce(midP,midV)*step);p+=midV*step;`}
  float fraction=1.0;vec4 body=vec4(0);
  if(uObjectCount>0)body=objectHit(p*throat,previous*throat,v,fraction,transparentMask);
  float planetFraction=1.0;vec4 planet=bridgeDepartureHit(previous,p,planetFraction);
  if(planet.a>.5&&(body.a<=0.0||planetFraction<fraction)){body=planet;fraction=planetFraction;}
  p=mix(previous,p,fraction);
  ${nebulaVolume?'bridgeNebulaSegment(previous,p,nebulaDistance,nebulaSample,nebulaCached,color,transmission);':''}
  metricColor=max(metricColor,transmission*diagnosticSegment(previous*throat,p*throat,travelled*throat,pixelAngle));
  vec4 bubble=bridgeBubbleAppearance(previous,p);color+=transmission*bubble.rgb;transmission*=1.0-bubble.a;
  vec4 bubbleGuide=bridgeBubbleGrid(previous,p,travelled,pixelAngle);
  vec4 guide=bridgeGridSegment(previous,p,travelled,pixelAngle);guide.rgb+=(1.0-guide.a)*bubbleGuide.rgb;guide.a+=(1.0-guide.a)*bubbleGuide.a;
  ${bodyGravity&&grid?'vec4 bodyGuide=bridgeBodyGridSegment(previous*throat,p*throat,travelled*throat,pixelAngle);guide.rgb+=(1.0-guide.a)*bodyGuide.rgb;guide.a+=(1.0-guide.a)*bodyGuide.a;':''}
  color+=transmission*guide.rgb;transmission*=1.0-guide.a;travelled+=length(p-previous);
  ${probe?'color+=transmission*probeEmissionSegment(previous*throat,p*throat);':''}
  ${attachments?'vec4 attachment=attachmentEmissionSegment(previous*throat,p*throat,pixelAngle);color+=transmission*attachment.rgb;transmission*=1.0-attachment.a;':''}
  // Keep the same one-surface-per-body alpha rule as the ordinary ray tracer.
  // The mask belongs to the whole ray, including its transit toward the other
  // asymptotic region; it must not be reset at every integration step.
  if(body.a>0.0){color+=transmission*body.rgb*body.a;transmission*=1.0-body.a;if(body.a>.999){object=true;break;}p+=unit(v)*max(1e-9,length(p)*1e-7);}
  if(transmission<.015)break;
 }
 if(!object){
  vec3 chartPoint=p;bool secondary=uSceneOptions.y>.5&&length(p-bridgeSecondCenter())<length(p);
  if(secondary)chartPoint-=bridgeSecondCenter();
  float radius=max(length(chartPoint),1e-8);
  otherSide=otherSide||radius<.5*gate;
  if(otherSide){
   // The second asymptotically flat chart is y=x/(4r²). Transform the
   // tangent by that inversion before sampling its sky; this is not a
   // flat circular portal pasted over the first universe.
   vec3 radial=chartPoint/radius;v=unit(v-2.0*radial*dot(radial,v));
   if(secondary)v=unit(vec3(v.x,-v.z,v.y));
   ${nebulaVolume?'vec3 cloudStart=bridgeNebulaChart(chartPoint,true);nebulaVolumeSegment(cloudStart,cloudStart+v*max(0.0,nebulaVolumeRange()-nebulaDistance),true,nebulaDistance,nebulaSample,nebulaCached,color,transmission);':''}
   color+=transmission*bridgeOtherSky(v);
  }else{
   if(uFlags.x>.5&&abs(dot(v,uBridgeGridAxis))>1e-7){float distance=-dot(p,uBridgeGridAxis)/dot(v,uBridgeGridAxis);if(distance>0.0){vec4 guide=bridgeGridAt(p+v*distance,v,travelled+distance,pixelAngle);color+=transmission*guide.rgb;transmission*=1.0-guide.a;}}
   ${bodyGravity&&grid?'vec4 bodyGuide=bridgeBodyGridEscape(p*throat,v,travelled*throat,pixelAngle);color+=transmission*bodyGuide.rgb;transmission*=1.0-bodyGuide.a;':''}
   ${nebulaVolume?'vec3 cloudStart=p*throat;nebulaVolumeSegment(cloudStart,cloudStart+v*max(0.0,nebulaVolumeRange()-nebulaDistance),false,nebulaDistance,nebulaSample,nebulaCached,color,transmission);':''}
   color+=transmission*bridgeRegionSky(v,false);
  }
 }
 return color+metricColor;
}
`;
}
