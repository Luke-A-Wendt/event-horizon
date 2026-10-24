// Compact Alcubierre-shape-inspired optical visualization, not a null-geodesic
// solution of the metric. The physical warp factor is not used as a ray speed.
export const WARP_FIELD_GLSL = `
bool localWarpPass(){return uWarpObjectIndex>=0&&(uWarpFlags.w<.5||uInspectIndex==uWarpObjectIndex||uHideObjectIndex==uWarpObjectIndex);}
float safeTanh(float x){return 2.0/(1.0+exp(-2.0*clamp(x,-12.0,12.0)))-1.0;}
vec2 warpShape(float radius){
 float s=max(1.0,uWarpThickness),a=safeTanh(s*(radius+1.0)),b=safeTanh(s*(radius-1.0)),denom=2.0*safeTanh(s);
 return vec2((a-b)/denom,s*(b*b-a*a)/denom);
}
// Gradient projected normal to the ray keeps its direction normalized.
// kappa=.3*W, capped at3. This optical strength is not v_s/c.
vec3 warpAcceleration(vec3 q,vec3 direction){
 float radius=max(length(q),1e-12);if(radius>2.5)return vec3(0);
 vec3 n=q/radius,axis=unit(uWarpAxis),d=unit(direction);vec2 shape=warpShape(radius);
 float mu=dot(n,axis);
 vec3 radial=n-d*dot(n,d),axial=axis-d*dot(axis,d);
 return uWarpStrength*shape.y*((.24+.12*mu)*radial+.18*axial);
}
vec3 warpFrame(vec3 q){
 vec3 x=unit(uWarpAxis),up=uPrimaryAxis-x*dot(uPrimaryAxis,x);
 if(length(up)<.01)up=vec3(0,1,0)-x*x.y;
 vec3 y=unit(up),z=unit(cross(x,y));return vec3(dot(q,x),dot(q,y),dot(q,z));
}
float warpGridHeight(vec3 q){
 float r=length(q.xz),s=max(1.0,uWarpThickness);
 return -.34*uWarpStrength*q.x*exp(-pow((r-1.0)*s*.70,2.0))*(1.0-smoothstep(2.0,2.5,r));
}
vec2 warpGridGradient(vec3 q){
 float r=max(length(q.xz),1e-5),b=.70*max(1.0,uWarpThickness);
 float e=exp(-pow((r-1.0)*b,2.0)),t=clamp((r-2.0)*2.0,0.0,1.0);
 float cut=1.0-t*t*(3.0-2.0*t),dc=-12.0*t*(1.0-t);
 float radial=e*(-2.0*b*b*(r-1.0)*cut+dc);
 return -.34*uWarpStrength*(vec2(e*cut,0)+q.x*radial*q.xz/r);
}
vec4 warpAppearance(vec3 a,vec3 b,float travel){
 vec3 q=(a+b)*.5;float radius=length(q);if(radius>2.5)return vec4(0);
 vec3 oriented=warpFrame(q);float front=dot(q,unit(uWarpAxis))/max(radius,.001);
 vec3 hue=mix(vec3(1.0,.36,.075),vec3(.075,.62,1.15),smoothstep(-.18,.18,front));
 float shell=exp(-pow((radius-1.0)*max(2.0,uWarpThickness)*1.4,2.0));
 vec3 color=vec3(0);float opacity=0.0;
 if(uWarpFlags.y>.5){
  float latitude=asin(clamp(oriented.y/max(radius,.001),-1.0,1.0)),longitude=atan(oriented.z,oriented.x);
  float meridians=pow(1.0-abs(sin(longitude*10.0)),16.0),parallels=pow(1.0-abs(sin(latitude*12.0)),18.0);
  float silk=.006+.012*max(meridians,parallels);
  float emission=shell*travel*max(2.0,uWarpThickness)*silk*min(1.4,uWarpStrength);
  color+=hue*emission;opacity+=min(.04,emission*.025);
 }
 return vec4(color,clamp(opacity,0.0,.8));
}
// One connected reference surface extends through the bubble to the flat far
// field. Only its local displacement moves with the ship: grid coordinates
// remain anchored in the world through a CPU-double phase offset.
vec4 warpGridAt(vec3 q,vec3 ro,vec3 rd,float travel){
 float radial=length(q.xz),f=warpShape(radial).x;
 vec2 local=q.xz;local.x+=.20*uWarpStrength*q.x*f;
 vec2 orientation=uWarpGridRotation;
 vec2 position=mat2(orientation.x,orientation.y,-orientation.y,orientation.x)*local+uWarpGridOffset;
 float footprint=max(.0005,travel/uResolution.y*.55);
 vec2 gradient=warpGridGradient(q);vec3 normal=vec3(-gradient.x,1,-gradient.y);
 float incidence=dot(normal,rd),denom=abs(incidence)<.035?(incidence<0.0?-.035:.035):incidence;
 vec3 ex=vec3(orientation.x,0,-orientation.y),ez=vec3(orientation.y,0,orientation.x);
 vec2 widths=footprint*vec2(length(ex-normal*dot(ex,rd)/denom),length(ez-normal*dot(ez,rd)/denom));
 float projected=max(widths.x,widths.y);
 // Dyadic line spacing makes distant cells readable without a separate patch.
 // Cross-fading adjacent resolutions prevents abrupt scale changes on zoom.
 float level=max(0.0,log2(max(1.0,projected*24.0/.25)));
 float spacing=.25*exp2(floor(level)),blend=fract(level);
 vec2 cell0=abs(fract(position/spacing+.5)-.5)*spacing;
 vec2 cell1=abs(fract(position/(spacing*2.0)+.5)-.5)*(spacing*2.0);
 vec2 width=max(vec2(.0018),widths*.80);
 vec2 fineAxes=vec2(1)-smoothstep(width,width*2.1,cell0);
 vec2 coarseAxes=vec2(1)-smoothstep(width,width*2.1,cell1);
 float fine=max(fineAxes.x,fineAxes.y),coarse=max(coarseAxes.x,coarseAxes.y);
 float line=mix(fine,coarse,smoothstep(.15,.85,blend));
 float horizonFade=smoothstep(.015,.10,abs(incidence)/length(normal));
 vec3 hue=mix(vec3(1.0,.36,.075),vec3(.075,.62,1.15),smoothstep(-.18,.18,q.x));
 float wall=exp(-pow((radial-1.0)*2.5,2.0))*min(1.0,uWarpStrength);
 hue=mix(vec3(.17,.28,.41),hue,wall);
 return vec4(hue*line*horizonFade*.43,line*horizonFade*.07);
}
float warpSheet(vec3 q){return q.y+.35-warpGridHeight(q);}
// Sample the sheet along the same curved ray segments as the field. The
// former independent 128-sample straight overlay was both costly and unlensed.
vec4 warpGridSegment(vec3 start,vec3 end,float travelled){
 if(uFlags.x<.5)return vec4(0);
 vec3 a=warpFrame(start),b=warpFrame(end);float ha=warpSheet(a),hb=warpSheet(b);
 if(ha*hb>0.0||abs(ha-hb)<1e-10)return vec4(0);
 float t=clamp(ha/(ha-hb),0.0,1.0);if(t<=.000001)return vec4(0);vec3 hit=mix(a,b,t);
 // A short secant refinement is only reached for a sheet crossing.
 float lo=0.0,hi=1.0;
 for(int j=0;j<3;j++){
  float h=warpSheet(hit);if(abs(h)<.00001)break;
  if(ha*h<=0.0){hi=t;hb=h;}else{lo=t;ha=h;}
  t=mix(lo,hi,clamp(ha/(ha-hb),.0,1.0));hit=mix(a,b,t);
 }
 vec3 direction=unit(b-a);
 vec4 grid=warpGridAt(hit,a,direction,travelled+length(end-start)*t);
 // In a combined scene the common BH chart supplies the distant grid. Keep
 // this precision chart local to the bubble rather than drawing two planes.
 if(uWarpFlags.w>.5)grid*=1.0-smoothstep(1.6,2.5,length(hit.xz));
 return grid;
}
vec4 warpGridExterior(vec3 camera,vec3 direction,float minimum,float maximum,float travelled){
 if(uFlags.x<.5||uWarpFlags.w>.5)return vec4(0);
 vec3 ro=warpFrame(camera),rd=warpFrame(direction);
 if(abs(rd.y)<.00001)return vec4(0);
 float t=(-.35-ro.y)/rd.y;
 if(t<=minimum||t>=maximum)return vec4(0);
 vec3 q=ro+rd*t;
 if(length(q.xz)<2.499)return vec4(0);
 return warpGridAt(q,ro,rd,travelled+t);
}
vec3 warpWorldForce(vec3 p,vec3 d){
 if(uWarpFlags.x<.5||localWarpPass()||uFlags.z<.5||uWarpRadius<1e-20)return vec3(0);
 return warpAcceleration((p-uWarpCenter)/uWarpRadius,d)/uWarpRadius;
}
vec4 warpWorldAppearance(vec3 p,vec3 previous,float dt){
 if(uWarpFlags.x<.5||localWarpPass()||uWarpRadius<1e-20)return vec4(0);
 return warpAppearance((previous-uWarpCenter)/uWarpRadius,(p-uWarpCenter)/uWarpRadius,dt/uWarpRadius);
}
`;

export const WARP_TRACE_GLSL = `
// The tiny physical field is traced in bubble-radius coordinates. uWarpObserver
// is calculated in CPU doubles, so a 300m ship near a million-solar-mass hole
// does not disappear through subtraction of nearly equal shader floats.
void warpLocalTrace(vec3 original,out vec3 direction,out vec3 emission,out float transmission,out bool hitShip){
 direction=original;emission=vec3(0);transmission=1.0;hitShip=false;
 if(!localWarpPass())return;
 vec3 q=uWarpObserver;
 float forward=-dot(q,direction),impact2=dot(cross(q,direction),cross(q,direction));
 float extent=2.5;
 if(impact2>extent*extent){vec4 grid=warpGridExterior(q,direction,0.0,1e20,0.0);emission=grid.rgb;transmission=1.0-grid.a;return;}
 float halfChord=sqrt(max(0.0,extent*extent-impact2));
 float entry=forward-halfChord,leave=forward+halfChord;
 if(leave<0.0){vec4 grid=warpGridExterior(q,direction,0.0,1e20,0.0);emission=grid.rgb;transmission=1.0-grid.a;return;}
 float travelled=max(0.0,entry);
 if(entry>0.0){
  vec4 grid=warpGridExterior(q,direction,0.0,entry,0.0);emission=grid.rgb;transmission=1.0-grid.a;
  q+=direction*(entry+.00001);
 }
 vec4 body=vec4(0),tint=vec4(0);vec2 heading=vec2(1,0);
 for(int j=0;j<12;j++){if(j==uWarpObjectIndex){body=uObjects[j];tint=uColors[j];heading=uHeadings[j];}}
 float conversion=uWarpRadius/max(body.w,1e-20),bodyRadius=1.0/max(conversion,1e-12);
 int budget=int(clamp(float(uSteps)*.5,24.0,float(__WARP_TRACE_BUDGET__)));
 for(int i=0;i<__WARP_TRACE_STEPS__;i++){
  if(i>=budget)break;
  float radius=length(q);if(radius>2.51&&dot(q,direction)>0.0)break;
  float dt=clamp(.022+abs(radius-1.0)*.12,.022,.18)*(144.0/float(budget));
  vec3 previous=q;
  vec3 a=uFlags.z>.5?warpAcceleration(q,direction):vec3(0);
  vec3 midD=unit(direction+a*dt*.5),midP=q+direction*dt*.5;
  direction=unit(direction+(uFlags.z>.5?warpAcceleration(midP,midD):vec3(0))*dt);q+=midD*dt;
  float segment=length(q-previous);vec3 ray=unit(q-previous);
  float nearest=clamp(-dot(previous,ray),0.0,segment);
  vec4 objectColor=vec4(0);
  if(body.w>1e-20&&uHideObjectIndex!=uWarpObjectIndex&&length(previous+ray*nearest)<bodyRadius){
   vec3 ro=craftFrame(previous,heading)*conversion,rd=craftFrame(ray,heading);
   CraftSurface surface=craftHit(ro,rd,segment*conversion,tint.a);
   if(surface.t<=segment*conversion){
    float fraction=surface.t/(segment*conversion);q=mix(previous,q,clamp(fraction,0.0,1.0));dt*=fraction;
    vec3 hit=ro+rd*surface.t,light=unit(vec3(-.4,.85,.65));
    vec3 reflection=craftWorld(reflect(rd,surface.normal),heading);
    objectColor=vec4(surfaceSpectrum(shadeCraft(surface,hit,rd,light,sky(reflection)),max(dot(surface.normal,light),0.0),surface.material>19.5?.72:.35,(surface.material>4.5&&surface.material<5.5)?.98:.5),1);hitShip=true;
   }
  }
  vec4 appearance=warpAppearance(previous,q,dt);emission+=transmission*appearance.rgb;transmission*=1.0-appearance.a;
  vec4 grid=warpGridSegment(previous,q,travelled);emission+=transmission*grid.rgb;transmission*=1.0-grid.a;
  travelled+=dt;
  if(hitShip){emission+=transmission*objectColor.rgb;transmission=0.0;return;}
 }
 vec4 grid=warpGridExterior(q,direction,0.0,1e20,travelled);emission+=transmission*grid.rgb;transmission*=1.0-grid.a;
}
`;

// Grid work is absent from programs where the global grid is off. Replacing
// this contiguous section also keeps the cold compiler from parsing its roots.
export function warpFieldGLSL({grid=false}={}) {
 if(grid)return WARP_FIELD_GLSL;
 const start=WARP_FIELD_GLSL.indexOf('vec4 warpGridAt('),end=WARP_FIELD_GLSL.indexOf('vec3 warpWorldForce(');
 return WARP_FIELD_GLSL.slice(0,start)+`
vec4 warpGridSegment(vec3 start,vec3 end,float travelled){return vec4(0);}
vec4 warpGridExterior(vec3 camera,vec3 direction,float minimum,float maximum,float travelled){return vec4(0);}
`+WARP_FIELD_GLSL.slice(end);
}
