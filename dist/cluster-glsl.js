// A bounded many-hole illustration. Sources arrive in camera-depth order.
// Each lens bends the ray before it encounters the next capture silhouette.
// This is an ordered thin-lens model, not an exact many-hole GR solution.
export const CLUSTER_GLSL = `
uniform int uClusterCount;
uniform vec4 uClusterBodies[24],uClusterParams[24],uClusterColors[24],uClusterAxes[24];
vec3 clusterDiscColor(vec3 point,float inner,float outer,vec3 tint,float mass){
 float radius=length(point.xz),span=max(outer-inner,mass*.1);
 float phase=atan(point.z,point.x),r=clamp((radius-inner)/span,0.0,1.0);
 float spiral=phase*6.0+radius/max(mass,1e-12)*2.1-uTime*.22/sqrt(max(radius/mass,1.0));
 float grain=.7+.3*noise(vec3(cos(phase)*radius/mass,sin(phase)*radius/mass,uTime*.025));
 float bands=.83+.17*sin(spiral+grain*2.0);
 if(uDetail>1.0)bands*=.9+.1*sin(spiral*3.0+grain*5.0);
 vec3 hue=tint*(.75+2.2*pow(1.0-r,.65));
 if(uSpectrum==1)hue=thermalPalette(.36+.5*(1.0-r))*.9;
 if(uSpectrum==2)hue=mix(vec3(.12,.27,.8),vec3(.85,.95,1.3),pow(1.0-r,2.0))*(.2+1.8*pow(1.0-r,3.0));
 if(uSpectrum==3)hue=vec3(.85,.36,.12)*(.16+.25*r);
 if(uSpectrum==4)hue=vec3(.5,.25,1)*.015*pow(1.0-r,6.0);
 return hue*grain*bands;
}
vec4 clusterGrid(vec3 camera,vec3 direction,float maximum,float pixelAngle){
 vec3 normal=unit(uPrimaryAxis),origin=uHoles[0].xyz;
 float denom=dot(direction,normal);if(abs(denom)<.00001)return vec4(0);
 float t=dot(origin-camera,normal)/denom;if(t<=0.0||t>=maximum)return vec4(0);
 vec3 point=camera+direction*t,warped=point-origin;
 float scale=max(uHoles[0].w*3.0,1e-10),flow=mod(uTime,240.0)*.5;
 for(int j=0;j<24;j++){
  if(j>=uClusterCount)break;
  vec3 q=point-uClusterBodies[j].xyz;float radius=max(length(q),uClusterBodies[j].w*1.02),m=uClusterParams[j].x;
  if(length(q)<uClusterBodies[j].w)return vec4(0);
  float fall=pow(pow(radius,1.5)+1.5*sqrt(2.0*m)*flow,.666666667)-radius;
  float weight=1.0/(1.0+radius/max(m*24.0,1e-12));
  warped+=q/radius*(m*2.0+fall)*weight;
  warped+=cross(uClusterAxes[j].xyz,q/radius)*uClusterParams[j].y*m*weight;
 }
 vec2 p=localPoint(warped,normal).xz/scale;
 vec2 cell=abs(fract(p+.5)-.5);float width=clamp(pixelAngle*t/scale*1.1,.025,.25);
 float line=1.0-smoothstep(width*.6,width,min(cell.x,cell.y));
 float fade=1.0/(1.0+max(0.0,t/scale-160.0)*.012);
 return vec4(vec3(.16,.45,.66)*line*fade,line*fade*.65);
}
// Weak deflection tends to 4M/b. The logarithmic strong-deflection term
// introduces the wrapping background close to the capture edge. Secondary
// winding orders are bounded to keep a finite smooth real-time illustration.
float clusterDeflection(float mass,float impact,float shadow){
 float inverse=mass/max(impact,shadow),weak=4.0*inverse+11.78097245*inverse*inverse;
 float strong=-log(max(.0001,impact/max(shadow,1e-20)-1.0))-.40023004;
 return min(3.0,max(weak,strong));
}
vec3 clusterTrace(vec3 camera,vec3 ray,float pixelAngle,out float surfaceDistance,out vec3 backgroundRay){
 vec3 point=camera,direction=ray,surface=vec3(0),viewAxis=unit(uForward);float planeDepth=0.0,distanceTravelled=0.0,surfaceOpacity=0.0;surfaceDistance=1e30;
 for(int j=0;j<24;j++){
  if(j>=uClusterCount)break;
  vec4 body=uClusterBodies[j],params=uClusterParams[j],appearance=uClusterColors[j];
  float depth=dot(body.xyz-camera,viewAxis);if(depth<=0.0)continue;
  float forward=max(dot(direction,viewAxis),.0001);
  float segment=max(0.0,depth-planeDepth)/forward;
  vec3 toward=body.xyz-point;float along=dot(toward,direction),distance=length(toward);
  float m=max(params.x,1e-12),horizon=max(body.w,1e-12);
  vec3 off=body.xyz-(point+direction*segment);float impact=length(off);
  float shadow=mix(horizon,m*(5.196-.24*abs(params.y)),step(.5,uFlags.z));
  shadow=mix(horizon,shadow,smoothstep(shadow*1.15,shadow*2.5,distance));
  float pixel=max(pixelAngle*max(distanceTravelled+along,horizon),horizon*.012),edge=shadow-impact;
  if(edge>-pixel&&along>0.0){
   surfaceDistance=distanceTravelled+along-sqrt(max(0.0,shadow*shadow-impact*impact));
   surfaceOpacity=smoothstep(-pixel,pixel,edge);surface=vec3(0);
   if(surfaceOpacity>.999)break;
  }
  // Optional user-added discs remain possible; the authored cluster is bare.
  // Intersect the incoming segment, so foreground lenses move farther discs
  // along with their owners rather than leaving them at unlensed positions.
  if(uSpectrum!=5&&params.w>params.z&&appearance.w>0.0){
   vec3 normal=unit(uClusterAxes[j].xyz);float denom=dot(direction,normal);
   float depth=abs(denom)>.00001?dot(toward,normal)/denom:-1.0;
   vec3 local=localPoint(point+direction*max(0.0,depth)-body.xyz,normal);
   float radial=length(local.xz),inner=params.z,outer=params.w;
   if(depth>0.0&&radial>inner&&radial<outer&&distanceTravelled+depth<surfaceDistance){
    surface=clusterDiscColor(local,inner,outer,appearance.rgb,m)*min(2.0,appearance.w);
    surfaceOpacity=smoothstep(inner,inner+pixel*2.0,radial)*(1.0-smoothstep(outer-pixel*2.0,outer,radial));
    surfaceDistance=distanceTravelled+depth;if(surfaceOpacity>.999)break;
   }
  }
  // Fixed, parallel lens planes keep every pixel on the same depth chart.
  // Moving each plane to the ray's closest point creates spurious seams.
  point+=direction*segment;distanceTravelled+=segment;planeDepth=depth;
  if(uFlags.z>.5&&impact>1e-20){
   // Multi-plane lens equation in transverse slope coordinates. Advancing
   // to each plane before its deflection also shifts more distant shadows.
   // Strong-field winding is bounded; no artificial luminous rim is added.
   float angle=clusterDeflection(m,impact,shadow);
   direction=unit(direction/forward+off/impact*angle);
  }
 }
 backgroundRay=direction;
 vec3 color=surfaceOpacity>.999?surface:mix(sky(backgroundRay),surface,surfaceOpacity);
 if(uFlags.x>.5){vec4 grid=clusterGrid(camera,ray,surfaceDistance,pixelAngle);color=color*(1.0-grid.a)+grid.rgb;}
 return color;
}
`;
