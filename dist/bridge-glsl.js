// An Ellis wormhole optical chart, compiled only for the bridge experiment.
// The vacuum Einstein–Rosen bridge cannot be traversed; the UI and math guide
// explicitly identify this exotic-matter comparison model instead.
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
// The departure world is finite foreground geometry in this isotropic chart.
// Its entire bound stays outside r=.5 (the throat). Unlike a sky-painted disc,
// it can occlude the mouth and is hidden by a nearer traveler on the same ray.
// This endpoint placement and material are illustrative, not a second source
// in the Ellis solution. The opposite world remains a distant planetary vista.
vec3 bridgeDepartureCenter(){
 vec3 center=vec3(.95,-.80,1.30);center.xz=rot(uTime*.006)*center.xz;return center;
}
vec4 bridgeDepartureHit(vec3 a,vec3 b,out float fraction){
 fraction=1.0;if(uBridge.z<.5)return vec4(0);
 vec3 center=bridgeDepartureCenter(),delta=b-a;float span=length(delta);
 if(span<1e-12)return vec4(0);
 vec3 ray=delta/span,offset=a-center;float along=dot(offset,ray),radius=.88;
 float discriminant=radius*radius-dot(cross(offset,ray),cross(offset,ray));
 if(discriminant<0.0)return vec4(0);
 float root=sqrt(discriminant),distance=-along-root;
 if(distance<0.0)distance=-along+root;
 if(distance<0.0||distance>span)return vec4(0);
 fraction=distance/span;vec3 normal=unit(a+ray*distance-center);
 if(uSpectrum==5)return vec4(vec3(.52,.88,1.35)*(1.0-smoothstep(.13,.32,abs(dot(normal,ray)))),1);
 float terrain=detailedFbm(normal*6.0+vec3(8.0,5.0,uTime*.003));
 float light=.08+.92*max(0.0,dot(normal,unit(vec3(-.6,.8,-.4))));
 vec3 ground=mix(vec3(.23,.055,.025),vec3(.75,.38,.12),terrain);
 float atmosphere=pow(1.0-max(0.0,dot(normal,-ray)),5.0);
 return vec4(surfaceSpectrum(ground,light,.12,.14)+atmosphere*vec3(.40,.16,.035),1);
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
 // The distant destination is sampled only after the integrated ray reaches
 // the other asymptotic end. The departure planet is intersected above.
 if(uBridge.z>.5&&other){
  vec3 axis=unit(vec3(.12,-.30,1.0));
  axis.xz=rot(uTime*.006)*axis.xz;
  vec3 ray=unit(direction),relative=ray-axis*dot(ray,axis);float angular=length(relative),radius=.38;
  if(dot(ray,axis)>0.0&&angular<radius){
   vec3 normal=unit(relative/radius-axis*sqrt(max(0.0,1.0-angular*angular/(radius*radius))));
   float terrain=detailedFbm(normal*10.0+vec3(31.0,5.0,uTime*.003));
   float light=.08+.92*max(0.0,dot(normal,unit(vec3(-.6,.8,-.4))));
   vec3 ground=mix(vec3(.025,.14,.21),vec3(.68,.86,.91),smoothstep(.38,.65,terrain));
   float atmosphere=pow(1.0-sqrt(max(0.0,1.0-angular*angular/(radius*radius))),5.0);
   result=surfaceSpectrum(ground,light,.12,.14)+atmosphere*vec3(.10,.46,.85);
  }
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
  if(radius<.018){otherSide=true;break;}
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
