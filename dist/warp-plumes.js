import {JANUS_PORT} from './janus-hull.js';
// Physical outlets in the hull chart (+Z forward). Both backends use the
// same bell mouths; roll-free positive yaw pushes the nose toward +X.
export const WARP_MAIN_PORTS=[[-.090,.090,-.920],[.090,.090,-.920],[-.090,-.090,-.920],[.090,-.090,-.920]];
export const WARP_STERN_PORT=[.174,0,-.641];
const v=a=>'vec3('+a.map(n=>n.toFixed(4)).join(',')+')';
// Integrate a compact, smoothly falling emissivity along the actual ray.
// Neighboring ray segments add to the same brightness regardless of step
// count; clipping the integral at the opaque hull hides an occluded nozzle.
export const WARP_JET_GLSL=`
float warpJetColumn(vec3 ro,vec3 rd,float maximum,vec3 center,vec3 radii){
 vec3 p=(ro-center)/radii,d=rd/radii;
 float speed=length(d);vec3 n=d/speed;
 float along=dot(p,n),h2=1.0-dot(cross(p,n),cross(p,n));if(h2<=0.0)return 0.0;
 float h=sqrt(h2),a=clamp(along,-h,h),b=clamp(along+maximum*speed,-h,h);
 return max(0.0,(b-a)*(h2-(a*a+a*b+b*b)/3.0)/speed);
}
vec3 warpJetRay(vec3 ro,vec3 rd,float maximum,vec2 command){
 if(maximum<=0.0||uSpectrum==5||command.x+abs(command.y)<=.000001)return vec3(0);
 float light=0.0;
 if(command.x>.0)for(int j=0;j<4;j++){
  vec3 bell=j==0?${v(WARP_MAIN_PORTS[0])}:j==1?${v(WARP_MAIN_PORTS[1])}:j==2?${v(WARP_MAIN_PORTS[2])}:${v(WARP_MAIN_PORTS[3])};
  light+=warpJetColumn(ro,rd,maximum,bell-vec3(0,0,.064),vec3(.064,.064,.142))*2.5;
  light+=warpJetColumn(ro,rd,maximum,bell-vec3(0,0,.013),vec3(.036,.036,.076))*7.2;
 }
 if(abs(command.y)>.000001){
  float side=sign(command.y),power=pow(abs(command.y),.38);
  vec3 mouth=${v(WARP_STERN_PORT)}*vec3(side,1,1);
  light+=power*warpJetColumn(ro,rd,maximum,mouth+vec3(side*.024,0,0),vec3(.050,.014,.014))*13.3 + power*warpJetColumn(ro,rd,maximum,mouth+vec3(side*.011,0,0),vec3(.021,.008,.008))*17.2;
 }
 vec3 tint=uSpectrum==1?vec3(1.0,.35,.09):uSpectrum==2?vec3(.015,.033,.072):uSpectrum==3?vec3(.025,.012,.007):uSpectrum==4?vec3(.001,.001,.003):vec3(.27,.68,1.12);
 return tint*light;
}
vec3 warpJetSegment(vec3 a,vec3 b,bool includeInspected){
 vec3 delta=b-a;float span=length(delta);if(span<=1e-25||uSpectrum==5)return vec3(0);
 vec3 dir=delta/span,light=vec3(0);
 for(int j=0;j<12;j++){
  if(j>=uObjectCount)break;
  if(uColors[j].a!=6.0||j==uHideObjectIndex||(j==uInspectIndex&&!includeInspected)||(j==uWarpObjectIndex&&localWarpPass()))continue;
  vec2 command=uBodyParams[j].xy;if(command.x+abs(command.y)<=.000001)continue;
  float radius=max(uObjects[j].w,1e-20),extent=span/radius;
  vec3 start=(a-uObjects[j].xyz)/radius,rd=dir,ro;
  if(j==uInspectIndex&&includeInspected&&all(equal(a,uObserver))){
   rd=unit(uInspectRight*dot(dir,uRight)+uInspectUp*dot(dir,uUp)+uInspectForward*dot(dir,uForward));start=uInspectCamera;ro=start;
  }else{
   vec3 perp=cross(start,dir);if(dot(perp,perp)>1.32)continue;
   float along=dot(start,dir),shift=clamp(-along-1.18,0.0,extent);
   start=cross(dir,perp)+dir*(along+shift);extent-=shift;
   if(j==uDriveIndex){ro=vec3(dot(start,uDriveRight),dot(start,uDriveUp),dot(start,uDriveForward));rd=vec3(dot(dir,uDriveRight),dot(dir,uDriveUp),dot(dir,uDriveForward));}
   else{ro=craftFrame(start,uHeadings[j]);rd=craftFrame(dir,uHeadings[j]);}
  }
  if(dot(cross(ro,rd),cross(ro,rd))<=1.32)light+=warpJetRay(ro,rd,extent,command);
 }
 return light;
}
`;

// Recessed nozzles share their centers with the hull's flush port disks.
export const JANUS_JET_RAY=`
vec3 janusJetRay(vec3 ro,vec3 rd,float maximum,vec2 cmd){
 if(maximum<=0.||uSpectrum==5||cmd.x+abs(cmd.y)<.001)return vec3(0);
 float light=0.,p=clamp(cmd.x,0.,1.),yaw=clamp(cmd.y,-1.,1.);
 for(int i=0;i<4;i++){
  float side=mod(float(i),2.)<.5?-1.:1.,y=i<2?-${JANUS_PORT.height}:${JANUS_PORT.height};
  if(p>.001){
   vec3 port=vec3(side*${JANUS_PORT.across},y,-${JANUS_PORT.axial});
   light+=sqrt(p)*warpJetColumn(ro,rd,maximum,port-vec3(0,0,.027+.035*p),vec3(.013,.013,.045+.061*p))*9.0;
  }
  if(abs(yaw)>.01){
   float sg=side*sign(yaw);vec3 port=vec3(sg*${JANUS_PORT.axial},y,side*${JANUS_PORT.across});
   light+=sqrt(abs(yaw))*warpJetColumn(ro,rd,maximum,port+vec3(sg*.035,0,0),vec3(.055,.013,.013))*9.;
  }
 }
 vec3 tint=uSpectrum==1?vec3(1.,.31,.085):uSpectrum==2?vec3(.015,.033,.072):uSpectrum==3?vec3(.025,.012,.007):uSpectrum==4?vec3(.001,.001,.003):vec3(.25,.61,1.09);
 return tint*light;
}
`;
export function hullPlumeGLSL(hasJanus){
 if(!hasJanus)return WARP_JET_GLSL;
 return WARP_JET_GLSL.replace('vec3 warpJetSegment(',JANUS_JET_RAY+'\nvec3 warpJetSegment(')
  .replace('if(uColors[j].a!=6.0||','if((uColors[j].a!=6.0&&uColors[j].a!=18.0)||')
  .replace('light+=warpJetRay(ro,rd,extent,command);','light+=uColors[j].a==18.0?janusJetRay(ro,rd,extent,command):warpJetRay(ro,rd,extent,command);');
}
