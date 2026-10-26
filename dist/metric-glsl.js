// Diagnostic geometry is sampled on the same clipped, curved ray segments as
// matter. No screen-space physics overlay, secondary march, or delayed readback.
export const METRIC_GLSL = `
vec3 metricOctDirection(vec2 oct){
 if(max(abs(oct.x),abs(oct.y))>1.1)return vec3(0);
 vec3 direction=vec3(oct,1.0-abs(oct.x)-abs(oct.y));
 if(direction.z<0.0)direction.xy=(1.0-abs(direction.yx))*sign(direction.xy+vec2(1e-20));
 return unit(direction);
}
vec3 metricPackedDirection(float code){
 if(code<.5)return vec3(0);float value=floor(code+.5)-1.0;
 vec2 oct=vec2(mod(value,1024.0),floor(value/1024.0))/1023.0*2.0-1.0;
 return metricOctDirection(oct);
}
float metricStroke(vec3 a,vec3 b,vec3 c,vec3 d,float width){
 vec3 u=b-a,v=d-c,w=a-c;
 float aa=max(dot(u,u),1e-30),bb=dot(u,v),cc=max(dot(v,v),1e-30),dd=dot(u,w),ee=dot(v,w);
 float denominator=aa*cc-bb*bb;
 float s=denominator>1e-20*aa*cc?clamp((bb*ee-cc*dd)/denominator,0.0,1.0):0.0;
 float t=clamp((bb*s+ee)/cc,0.0,1.0);s=clamp((bb*t-dd)/aa,0.0,1.0);
 float separation=length(w+u*s-v*t);
 return 1.0-smoothstep(width,width*1.8,separation);
}
float metricArrow(vec3 a,vec3 b,vec3 root,vec3 vector,vec3 normal,float width){
 float size=length(vector);if(size<width*2.0)return 0.0;
 vec3 tip=root+vector,back=tip-vector*.19,side=unit(cross(unit(vector),normal))*size*.10;
 return max(metricStroke(a,b,root,tip,width),max(metricStroke(a,b,tip,back+side,width),metricStroke(a,b,tip,back-side,width)));
}
float metricSphereRim(vec3 a,vec3 b,vec3 center,float radius,float width){
 vec3 q=a-center,v=b-a;float d2=max(dot(v,v),1e-30),t=-dot(q,v)/d2;
 // A silhouette is a tangent to the physical sphere. Restrict the closest
 // point to this segment so the same rim is never accumulated for every step.
 if(t<0.0||t>1.0)return 0.0;
 return 1.0-smoothstep(width,width*1.8,abs(length(q+v*t)-radius));
}
float metricRingDistance(vec3 p,vec3 axis,float radius){float h=dot(p,axis);return length(vec2(length(p-axis*h)-radius,h));}
float metricRing(vec3 a,vec3 b,vec3 center,vec3 axis,float radius,float width){
 vec3 p=a-center,q=b-center,v=q-p;float ha=dot(p,axis),hb=dot(q,axis);
 float distance=min(metricRingDistance(p,axis,radius),metricRingDistance(q,axis,radius));
 float plane=abs(ha-hb)>1e-20?clamp(ha/(ha-hb),0.0,1.0):0.0;
 distance=min(distance,metricRingDistance(p+v*plane,axis,radius));
 // Also test intersections with the ring's bounding sphere. These cover
 // grazing/in-plane sight lines without step-sized beads along the circle.
 float aa=max(dot(v,v),1e-30),bb=dot(p,v),cc=dot(p,p)-radius*radius,discriminant=bb*bb-aa*cc;
 if(discriminant>=0.0){float root=sqrt(discriminant);float first=clamp((-bb-root)/aa,0.0,1.0),second=clamp((-bb+root)/aa,0.0,1.0);distance=min(distance,min(metricRingDistance(p+v*first,axis,radius),metricRingDistance(p+v*second,axis,radius)));}
 return 1.0-smoothstep(width,width*1.8,distance);
}
vec3 diagnosticSegment(vec3 a,vec3 b,float travelled,float pixelAngle){
 if(uMetricOptions.x<.5&&uSpectrum!=5)return vec3(0);
 vec3 sum=vec3(0);float pixel=max(travelled+length(b-a)*.5,1e-10)*pixelAngle;
 for(int k=0;k<2;k++){
  if(uWarpFlags.w<.5)break;if(k==1&&uBinary==0)break;
  vec3 center=uHoles[k].xyz,axis=axisFor(k);float mass=max(uHoles[k].w,1e-20),h=horizonFor(k);
  float width=max(mass*.008,pixel*1.25),rim=uMetricOptions.w>.5?metricSphereRim(a,b,center,h,width):0.0;
  sum+=vec3(.46,.85,1.25)*rim;
  if(uMetricOptions.w>.5){
   // A coordinate cutaway, deliberately separate from exterior optics. The
   // inner horizon and singularity cannot be photographed from outside.
   float inner=max(0.0,2.0*mass-h),ring=abs(spinFor(k))*mass;
   sum+=vec3(.14,.57,1.05)*metricSphereRim(a,b,center,inner,width);
   sum+=vec3(.30,.77,1.25)*metricRing(a,b,center,axis,h,width);
   if(inner>width)sum+=vec3(.20,.45,1.0)*metricRing(a,b,center,axis,inner,width);
   if(ring>width)sum+=vec3(1.5,.38,.12)*metricRing(a,b,center,axis,ring,width*1.5);
   else sum+=vec3(1.5,.38,.12)*metricStroke(a,b,center,center,width*1.8);
  }
 }
 // All strokes share the exact ray segments, lens fields and foreground clip.
 if(uMetricOptions.x>.5){
  for(int k=0;k<2;k++){
   if(uWarpFlags.w<.5)break;if(k==1&&uBinary==0)break;
   vec3 center=uHoles[k].xyz;float radius=horizonFor(k),width=max(radius*.012,pixel*1.2);
   float codeValue=floor(fract(k==0?uJetStructure.x:uJetStructure.y)*4194304.0+.5);
   vec3 velocity=metricPackedDirection(codeValue);
   sum+=vec3(.30,1.1,.65)*metricArrow(a,b,center,velocity*radius*2.0,unit(a-center),width);
   if(abs(spinFor(k))>.001)sum+=vec3(.85,.57,1.2)*metricArrow(a,b,center,axisFor(k)*sign(spinFor(k))*radius*2.0,unit(a-center),width);
  }
 }
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;if(j==uHideObjectIndex)continue;
  float kind=uColors[j].a,radius=uObjects[j].w;if(kind>6.5||radius<1e-20)continue;
  // Compact-object boundaries come solely from visible capture/emission.
  if(kind>1.5&&kind<2.5&&uBodyParams[j].z<0.0)continue;
  vec3 center=uObjects[j].xyz;float reach=radius*2.2;
  vec3 segment=b-a;float nearest=clamp(dot(center-a,segment)/max(dot(segment,segment),1e-30),0.0,1.0);
  if(length(a+segment*nearest-center)>reach+pixel*3.0)continue;
  float width=max(radius*.012,pixel*1.25);
  // Spherical bodies draw their silhouette and graticule at their surface hit.
  if(kind>.5&&!(kind>1.5&&kind<2.5))sum+=vec3(.42,.83,1.2)*metricSphereRim(a,b,center,radius,width);
  if(uMetricOptions.x>.5){
   vec3 velocity=kind>.5&&kind<1.5?metricOctDirection(uHeadings[j]):metricPackedDirection(uLuminosities[j]);
   sum+=vec3(.30,1.1,.65)*metricArrow(a,b,center,velocity*radius*2.0,unit(a-center),width);
   if(kind<.5||(kind>1.5&&kind<2.5))sum+=vec3(.85,.57,1.2)*metricArrow(a,b,center,metricOctDirection(uHeadings[j])*radius*2.0,unit(a-center),width);
   else if(j==uDriveIndex&&abs(uFlightMetrics.z)>.00001)sum+=vec3(.85,.57,1.2)*metricArrow(a,b,center,uDriveUp*sign(uFlightMetrics.z)*radius*2.0,unit(a-center),width);
  }
 }

 return min(sum,vec3(2.0));
}
// Constant instantaneous Frenet data gives an osculating helix. This is a
// trajectory guide, not an assertion that curvature deforms the scalar f(r).
vec3 flightCurvePoint(float s){
 float k=clamp(uFlightMetrics.y,-128.0,128.0),angle=k*s;
 if(abs(angle)<.001)return uDriveForward*s+uDriveRight*(.5*k*s*s);
 return uDriveForward*(sin(angle)/k)+uDriveRight*(2.0*pow(sin(angle*.5),2.0)/k);
}
vec3 flightGuideSegment(vec3 a,vec3 b,float travelled,float pixelAngle){
 if(uMetricOptions.x<.5||uFlightMetrics.w<.5)return vec3(0);
 float width=max(.004,travelled*pixelAngle*1.25),line=0.0,start=.12;
 for(int j=0;j<12;j++){if(j==uDriveIndex)start=max(start,uObjects[j].w/max(uWarpRadius,1e-20)*1.08);}
 start=min(start,.94);vec3 previous=flightCurvePoint(start);
 for(int j=1;j<=10;j++){
  vec3 next=flightCurvePoint(mix(start,1.0,float(j)*.1));
  line=max(line,metricStroke(a,b,previous,next,width));previous=next;
 }
 return vec3(.34,1.05,.72)*line;
}
`;
