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
export function bridgeGLSL({ultra=false,photo=false,photoSteps=3072,probe=false,attachments=false,bodyGravity=false}={}) {
 return `
float bridgeConformalAt(vec3 p){return 1.0+.25/max(dot(p,p),1e-12);}
vec3 bridgeSecondCenter(){return vec3(.72,0,0);}
vec3 bridgeSecondAxis(){return unit(cross(uPrimaryAxis,vec3(1,.001,.001)));}
vec3 bridgeRayForce(vec3 p,vec3 v){
 float r2=max(dot(p,p),1e-12);
 vec3 gradient=-2.0*p/(r2*(4.0*r2+1.0));
 if(uSceneOptions.y>.5){
  // Two perpendicular Ellis comparison charts. This sum of optical
  // gradients is explicitly an illustrative composite, not an intersecting
  // Einstein-equation solution or a demonstrated traversable ER bridge.
  vec3 q=p-bridgeSecondCenter();float second=max(dot(q,q),1e-12);
  gradient+=-2.0*q/(second*(4.0*second+1.0));
 }
 ${bodyGravity?'gradient+=force(p*uBridge.y,v)*uBridge.y;':''}
 return uFlags.z>.5?gradient-v*dot(v,gradient):vec3(0);
}

// Meridians and equal proper-radial intervals on the equatorial chart.
// These are annotations sampled where the INTEGRATED ray crosses the sheet.
vec4 bridgeGridAtAxis(vec3 p,vec3 ray,float travelled,float pixelAngle,vec3 axis){
 vec3 chart=localPoint(p,axis);
 float radius=max(length(chart.xz),1e-6),l=radius-.25/radius;
 float angle=atan(chart.z,chart.x),incidence=abs(dot(ray,axis));
 float footprint=max(.002,travelled*pixelAngle*bridgeConformalAt(p)/max(incidence,.08));
 float spacing=.5*exp2(floor(max(0.0,log2(footprint*14.0/.5))));
 float radial=abs(fract(l/spacing+.5)-.5)*spacing;
 float angular=abs(fract(angle/(PI/16.0)+.5)-.5)*(PI/16.0)*sqrt(l*l+1.0);
 float line=max(1.0-smoothstep(footprint*.35,footprint,radial),1.0-smoothstep(footprint*.35,footprint,angular));
 float throat=1.0-smoothstep(footprint*.4,footprint*1.6,abs(l));
 float resolved=1.0-smoothstep(.025,.09,footprint/max(1.0,sqrt(l*l+1.0)));
 float intensity=(line*.34+throat*.35)*smoothstep(.015,.08,incidence)*resolved;
 return vec4(vec3(.11,.57,.89)*intensity*(uSpectrum==5?1.4:1.0),intensity*.08);
}
vec4 bridgeGridAt(vec3 p,vec3 ray,float travelled,float pixelAngle){return bridgeGridAtAxis(p,ray,travelled,pixelAngle,uPrimaryAxis);}
vec4 bridgeGridSegmentAxis(vec3 a,vec3 b,float travelled,float pixelAngle,vec3 axis){
 float first=dot(a,axis),second=dot(b,axis);
 if(uFlags.x<.5||first*second>0.0||abs(first-second)<1e-12)return vec4(0);
 float t=first/(first-second);
 if(t<=.000001||t>1.0)return vec4(0);
 vec3 delta=b-a;
 return bridgeGridAtAxis(mix(a,b,t),unit(delta),travelled+length(delta)*t,pixelAngle,axis);
}
vec4 bridgeGridSegment(vec3 a,vec3 b,float travelled,float pixelAngle){
 vec4 first=bridgeGridSegmentAxis(a,b,travelled,pixelAngle,uPrimaryAxis);
 if(uSceneOptions.y<.5)return first;
 vec3 offset=bridgeSecondCenter();vec4 other=bridgeGridSegmentAxis(a-offset,b-offset,travelled,pixelAngle,bridgeSecondAxis());
 other.rgb*=vec3(1.3,.65,1.35);
 return vec4(first.rgb+(1.0-first.a)*other.rgb,first.a+(1.0-first.a)*other.a);
}
// Finite worlds in both mouths' outward directions. The traveler stays on
// the common axis and turns around well before either planetary surface.
vec3 bridgeMouthAxis(){
 vec3 helper=abs(uPrimaryAxis.z)<.9?vec3(0,0,1):vec3(1,0,0);
 return cross(unit(cross(uPrimaryAxis,helper)),uPrimaryAxis);
}
vec3 bridgeDepartureCenter(){return bridgeMouthAxis()*${BRIDGE_WORLD_LAYOUT.distance.toFixed(1)};}
vec3 bridgeWorldMaterial(vec3 normal,vec3 ray,bool other){
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
  bool other=end==1;float scale=other?inversion:1.0;
  vec3 center=worldCenter*scale,offset=a-center;float radius=worldRadius*scale,along=dot(offset,ray);
  if(dot(offset,offset)>(span+radius)*(span+radius))continue;
  float discriminant=radius*radius-dot(cross(offset,ray),cross(offset,ray));if(discriminant<0.0)continue;
  float root=sqrt(discriminant),distance=-along-root;if(distance<0.0)distance=-along+root;
  if(distance<0.0||distance>span||distance/span>=fraction)continue;
  fraction=distance/span;vec3 hit=a+ray*distance,point=other?hit/(4.0*dot(hit,hit)):hit;
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
vec3 bridgeTrace(vec3 camera,vec3 original,float pixelAngle){
 float throat=max(uBridge.y,1e-20);
 vec3 p=camera/throat,v=original,color=vec3(0),metricColor=vec3(0);float transmission=1.0,travelled=0.0,transparentMask=0.0;
 bool otherSide=false,object=false;
 // Skip asymptotically empty space, exactly as in the black-hole integrator.
 if(length(p)>18.0){
  float projection=dot(p,v),discriminant=projection*projection-dot(p,p)+324.0;
  if(discriminant<0.0||projection>=0.0)return bridgeRegionSky(v,false);
  float entry=-projection-sqrt(max(0.0,discriminant));
  if(entry>0.0){
   vec3 next=p+v*entry;vec4 guide=bridgeGridSegment(p,next,0.0,pixelAngle);
   color+=guide.rgb;transmission*=1.0-guide.a;travelled+=entry;p=next;
  }
 }
 for(int i=0;i<${photo?photoSteps:ultra?768:288};i++){
  if(i>=uSteps)break;
  float radius=max(length(p),1e-7);
  if(uSceneOptions.y>.5)radius=min(radius,max(length(p-bridgeSecondCenter()),1e-7));
  if(radius<(uBridge.z>.5?.008:.018)){otherSide=true;break;}
  if(radius>18.05&&dot(p,v)>0.0)break;
  // Scale steps in the isotropic chart: this remains smooth at r=b/2,
  // the nonsingular throat, and resolves the increasingly compressed end.
  float step=min(.13*radius,.035+.10*abs(radius-.5))*288.0/float(uSteps);
  step=min(step,.30*radius);
  ${bodyGravity?`// A massive traveler has its own short curvature scale. Ellis-only
  // steps can leap across a foreground hole's strong lensing region.
  for(int j=0;j<12;j++){
   if(j>=uGravityCount)break;if(uBodyMasses[j]<=0.0||uColors[j].a>2.5)continue;
   float bodyRadius=max(uObjects[j].w/throat,1e-12),distance=length(p-uObjects[j].xyz/throat);
   step=min(step,max(bodyRadius*.03,distance*.08)*288.0/float(uSteps));
  }`:''}
  vec3 previous=p,acceleration=bridgeRayForce(p,v),midV=unit(v+acceleration*step*.5),midP=p+v*step*.5;
  v=unit(v+bridgeRayForce(midP,midV)*step);p+=midV*step;
  float fraction=1.0;vec4 body=vec4(0);
  if(uObjectCount>0)body=objectHit(p*throat,previous*throat,v,fraction,transparentMask);
  float planetFraction=1.0;vec4 planet=bridgeDepartureHit(previous,p,planetFraction);
  if(planet.a>.5&&(body.a<=0.0||planetFraction<fraction)){body=planet;fraction=planetFraction;}
  p=mix(previous,p,fraction);
  metricColor=max(metricColor,transmission*diagnosticSegment(previous*throat,p*throat,travelled*throat,pixelAngle));
  vec4 guide=bridgeGridSegment(previous,p,travelled,pixelAngle);
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
  otherSide=otherSide||radius<.5;
  if(otherSide){
   // The second asymptotically flat chart is y=x/(4r²). Transform the
   // tangent by that inversion before sampling its sky; this is not a
   // flat circular portal pasted over the first universe.
   vec3 radial=chartPoint/radius;v=unit(v-2.0*radial*dot(radial,v));
   if(secondary)v=unit(vec3(v.x,-v.z,v.y));
   color+=transmission*bridgeOtherSky(v);
  }else{
   if(uFlags.x>.5&&abs(dot(v,uPrimaryAxis))>1e-7){float distance=-dot(p,uPrimaryAxis)/dot(v,uPrimaryAxis);if(distance>0.0){vec4 guide=bridgeGridAt(p+v*distance,v,travelled+distance,pixelAngle);color+=transmission*guide.rgb;transmission*=1.0-guide.a;}}
   color+=transmission*bridgeRegionSky(v,false);
  }
 }
 return color+metricColor;
}
`;
}
