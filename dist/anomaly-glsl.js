export const ANOMALY_GLSL=`
uniform int uAnomalyCount;
uniform vec4 uAnomalies[4],uAnomalyParams[4];
// Compact, bounded Gaussian/sinusoidal potential. The zero boundary and its
// first derivative match empty space; nothing is a capture surface.
vec3 anomalyGradient(vec3 q,vec3 parameters){
 float rr=dot(q,q);if(rr>=9.0||parameters.x<=0.0)return vec3(0);
 float k=3.2*parameters.y,t=uTime*.35*parameters.z;
 vec3 a=k*q+vec3(t,.4*t,-.7*t);
 float sx=sin(a.x),sz=sin(a.z),cy=cos(a.y),sum=a.x+a.y+a.z;
 float wave=sx*sz+.55*cy+.3*sin(sum),co=.3*cos(sum),fade=1.0-rr/9.0;
 vec3 gradient=k*vec3(cos(a.x)*sz+co,-.55*sin(a.y)+co,sx*cos(a.z)+co);
 return parameters.x*.085*exp(-rr*1.4)*fade*fade*(gradient-wave*q*(2.8+4.0/(9.0-rr)));
}
vec3 anomalyForce(vec3 p,vec3 direction){
 vec3 result=vec3(0);for(int j=0;j<4;j++){
  if(j>=uAnomalyCount)break;float radius=max(uAnomalies[j].w,1e-20);
  vec3 g=anomalyGradient((p-uAnomalies[j].xyz)/radius,uAnomalyParams[j].xyz)/radius;
  result-=2.0*(g-direction*dot(g,direction));
 }return result;
}
vec3 anomalyGridOffset(vec3 p){
 vec3 result=vec3(0);for(int j=0;j<4;j++){
  if(j>=uAnomalyCount)break;float radius=max(uAnomalies[j].w,1e-20);
  result+=anomalyGradient((p-uAnomalies[j].xyz)/radius,uAnomalyParams[j].xyz)*radius*.7;
 }return result;
}
float anomalyStepLimit(vec3 p,float current){
 for(int j=0;j<4;j++){if(j>=uAnomalyCount)break;float radius=max(uAnomalies[j].w,1e-20),distance=length(p-uAnomalies[j].xyz);
  current=min(current,max(radius*.055,abs(distance-radius*2.5)*.3));
 }return current;
}
`;
