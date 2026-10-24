// An Ellis wormhole optical chart, compiled only for the bridge experiment.
// The vacuum Einstein–Rosen bridge cannot be traversed; the UI and math guide
// explicitly identify this exotic-matter comparison model instead.
export function bridgeGLSL({ultra=false,photo=false,photoSteps=3072,probe=false}={}) {
 return `
float bridgeConformalAt(vec3 p){return 1.0+.25/max(dot(p,p),1e-12);}
vec3 bridgeRayForce(vec3 p,vec3 v){
 float r2=max(dot(p,p),1e-12);
 vec3 gradient=-2.0*p/(r2*(4.0*r2+1.0));
 return uFlags.z>.5?gradient-v*dot(v,gradient):vec3(0);
}

// Meridians and equal proper-radial intervals on the equatorial chart.
// These are annotations sampled where the INTEGRATED ray crosses the sheet.
vec4 bridgeGridAt(vec3 p,vec3 ray,float travelled,float pixelAngle){
 vec3 chart=localPoint(p,uPrimaryAxis);
 float radius=max(length(chart.xz),1e-6),l=radius-.25/radius;
 float angle=atan(chart.z,chart.x),incidence=abs(dot(ray,uPrimaryAxis));
 float footprint=max(.002,travelled*pixelAngle*bridgeConformalAt(p)/max(incidence,.08));
 float spacing=.5*exp2(floor(max(0.0,log2(footprint*14.0/.5))));
 float radial=abs(fract(l/spacing+.5)-.5)*spacing;
 float angular=abs(fract(angle/(PI/16.0)+.5)-.5)*(PI/16.0)*sqrt(l*l+1.0);
 float line=max(1.0-smoothstep(footprint*.35,footprint,radial),1.0-smoothstep(footprint*.35,footprint,angular));
 float throat=1.0-smoothstep(footprint*.4,footprint*1.6,abs(l));
 float intensity=(line*.34+throat*.35)*smoothstep(.015,.08,incidence);
 return vec4(vec3(.11,.57,.89)*intensity,intensity*.08);
}
vec4 bridgeGridSegment(vec3 a,vec3 b,float travelled,float pixelAngle){
 float first=dot(a,uPrimaryAxis),second=dot(b,uPrimaryAxis);
 if(uFlags.x<.5||first*second>0.0||abs(first-second)<1e-12)return vec4(0);
 float t=first/(first-second);
 if(t<=.000001||t>1.0)return vec4(0);
 vec3 delta=b-a;
 return bridgeGridAt(mix(a,b,t),unit(delta),travelled+length(delta)*t,pixelAngle);
}
vec3 bridgeRegionSky(vec3 direction,bool other){
 // Each end has its own cloud morphology, orientation, size and emission color.
 // The broad diffuse envelope is part of the nebula, not a tint on the universe.
 vec3 d=other?unit(vec3(-direction.z,direction.y,-direction.x)):unit(direction);
 vec4 parameters=other?uBridgeSkyParams:uNebulaParams;
 vec3 hue=other?uBridgeSkyColor:uNebulaColor;
 parameters.z*=other?uBridgeOtherNebula:uFlags2.y;
 vec3 result=skyWithNebula(d,parameters,hue);
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
 vec3 p=camera/throat,v=original,color=vec3(0);float transmission=1.0,travelled=0.0;
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
  if(radius<.018){otherSide=true;break;}
  if(radius>18.05&&dot(p,v)>0.0)break;
  // Scale steps in the isotropic chart: this remains smooth at r=b/2,
  // the nonsingular throat, and resolves the increasingly compressed end.
  float step=min(.13*radius,.035+.10*abs(radius-.5))*288.0/float(uSteps);
  step=min(step,.30*radius);
  vec3 previous=p,acceleration=bridgeRayForce(p,v),midV=unit(v+acceleration*step*.5),midP=p+v*step*.5;
  v=unit(v+bridgeRayForce(midP,midV)*step);p+=midV*step;
  float fraction=1.0;vec4 body=vec4(0);
  if(uObjectCount>0)body=objectHit(p*throat,previous*throat,v,fraction);
  p=mix(previous,p,fraction);
  vec4 guide=bridgeGridSegment(previous,p,travelled,pixelAngle);
  color+=transmission*guide.rgb;transmission*=1.0-guide.a;travelled+=length(p-previous);
  ${probe?'color+=transmission*probeEmissionSegment(previous*throat,p*throat);':''}
  if(body.a>.5){color+=transmission*body.rgb;object=true;break;}
 }
 if(!object){
  float radius=max(length(p),1e-8);
  otherSide=otherSide||radius<.5;
  if(otherSide){
   // The second asymptotically flat chart is y=x/(4r²). Transform the
   // tangent by that inversion before sampling its sky; this is not a
   // flat circular portal pasted over the first universe.
   vec3 radial=p/radius;v=unit(v-2.0*radial*dot(radial,v));
   color+=transmission*bridgeOtherSky(v);
  }else{
   if(uFlags.x>.5&&abs(dot(v,uPrimaryAxis))>1e-7){float distance=-dot(p,uPrimaryAxis)/dot(v,uPrimaryAxis);if(distance>0.0){vec4 guide=bridgeGridAt(p+v*distance,v,travelled+distance,pixelAngle);color+=transmission*guide.rgb;transmission*=1.0-guide.a;}}
   color+=transmission*bridgeRegionSky(v,false);
  }
 }
 return color;
}
`;
}
