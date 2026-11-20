// A Class A stellar engine: a stationary spherical cap centered on the star.
// Directions use a fixed inertial frame; this is not a rotating Dyson habitat.
export const SHKADOV_HALF_ANGLE=66*Math.PI/180;
export const SHKADOV_COVERAGE=(1-Math.cos(SHKADOV_HALF_ANGLE))/2;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],unit=a=>a.map(x=>x/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const SHKADOV_AXIS=unit([.95,.25,-.19]);
const Y=unit(cross([0,0,1],SHKADOV_AXIS)),Z=cross(SHKADOV_AXIS,Y),tau=Math.PI*2;
const local=v=>[dot(v,SHKADOV_AXIS),dot(v,Y),dot(v,Z)];
const cut=Math.cos(SHKADOV_HALF_ANGLE);
export function shkadovHit(ro,rd,maximum=Infinity){
 const b=dot(ro,rd),perp=cross(ro,rd),disc=1-dot(perp,perp);
 if(disc<0)return null;
 const root=Math.sqrt(disc);
 for(const t of [-b-root,-b+root]){
  if(t<=1e-7||t>maximum)continue;
  const point=ro.map((x,i)=>x+rd[i]*t);
  if(dot(point,SHKADOV_AXIS)>=cut)return {t,point,inside:dot(point,rd)>0};
 }
 return null;
}
// Canvas: the same annular courses and separated mirror facets as the GPU,
// with lightweight, quantized highlights for the capped fallback budget.
export function shkadovPreview(hit,rd,width=0){
 const p=local(hit.point),theta=Math.acos(Math.min(1,Math.max(-1,p[0]))),phi=Math.atan2(p[2],p[1])/tau+.5;
 const rings=theta/SHKADOV_HALF_ANGLE*11,ring=Math.min(10,Math.floor(rings)),n=8+ring*4,lon=phi*n+(ring%2)*.5,fract=x=>x-Math.floor(x),v=fract(rings),u=fract(lon);
 const edge=Math.min(v,1-v,u,1-u),major=Math.min(fract(phi*12),1-fract(phi*12));
 const beam=Math.min(.09,.024+width*3);
 if(theta>SHKADOV_HALF_ANGLE-.018)return '#909da2';
 if(theta<.1)return theta<.055?'#d8af66':'#49515a';
 if(edge<beam||major<.015)return '#42515a';
 const k=(Math.sin((Math.floor(lon)+1)*23.71+ring*4.23)*4375.6)%1;
 if(!hit.inside)return Math.min(Math.abs(u-v),Math.abs(u+v-1))<.035?'#758389':k>.35?'#364550':'#43525b';
 const facing=Math.max(0,dot(hit.point,rd)),t=Math.round(Math.max(0,Math.min(1,.22+.42*(1-facing)+.1*k+.25*Math.cos(phi*tau-theta)*Math.cos(phi*tau-theta)))*13)/13;
 const rgb=[Math.round(114+t*114),Math.round(86+t*112),Math.round(62+t*109)];
 return '#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');
}
const v3=v=>'vec3('+v.map(x=>x.toFixed(9)).join(',')+')';
// Use an analytic bounded spherical intersection so light, other bodies,
// optical labels and the back face all agree when the user orbits the cap.
export const SHKADOV_GLSL=`
vec3 skLocal(vec3 p){return vec3(dot(p,${v3(SHKADOV_AXIS)}),dot(p,${v3(Y)}),dot(p,${v3(Z)}));}
vec4 skMirror(vec3 ro,vec3 rd,float limit,float pix){
 float b=dot(ro,rd);vec3 off=cross(ro,rd);float h=1.-dot(off,off);
 if(h<0.)return vec4(0,0,0,-1);
 float root=sqrt(h);
 for(int side=0;side<2;side++){
  float t=-b+(side==0?-root:root);if(t<=.0000001||t>limit)continue;
  vec3 p=skLocal(ro+t*rd),v=skLocal(rd);
  if(p.x<${cut.toFixed(9)})continue;
  float th=acos(clamp(p.x,-1.,1.)),ph=atan(p.z,p.y)/6.28318530718+.5;
  float row=th*${(11/SHKADOV_HALF_ANGLE).toFixed(9)},i=min(10.,floor(row)),n=8.+4.*i;
  float s=ph*n+.5*mod(i,2.),j=floor(s);vec2 uv=vec2(fract(s),fract(row));
  float w=clamp(pix*7.,.002,.09);
  vec2 border=min(uv,1.-uv);
  float rim=min(border.x,border.y),edge=1.-smoothstep(.01,.026+w,rim);
  float major=abs(fract(ph*12.+.5)-.5),spine=1.-smoothstep(.004,.011+w*.23,major);
  float noise=fract(sin(j*91.13+i*17.35)*4581.47),outer=1.-smoothstep(.006,.015+w*.12,${SHKADOV_HALF_ANGLE.toFixed(9)}-th);
  float junction=(1.-smoothstep(.027,.058+w,border.x))*(1.-smoothstep(.027,.058+w,border.y));
  bool front=dot(p,v)>0.;vec3 color;
  if(front){
   // Light is redirected toward the star. Narrow facet tilts and a weak
   // warm scatter reveal the polished panels without an artificial light beam.
   vec3 q=normalize(vec3(cos((i+.5)*${(SHKADOV_HALF_ANGLE/11).toFixed(9)}),sin((i+.5)*${(SHKADOV_HALF_ANGLE/11).toFixed(9)})*cos(((j+.5-.5*mod(i,2.))/n-.5)*6.28318530718),sin((i+.5)*${(SHKADOV_HALF_ANGLE/11).toFixed(9)})*sin(((j+.5-.5*mod(i,2.))/n-.5)*6.28318530718)));
   float reflection=dot(reflect(-p,q),v),view=abs(dot(p,v));
   float band=.5+.5*sin(3.8*p.y+2.9*p.z+1.5*noise);
   color=mix(vec3(.32,.245,.172),vec3(.97,.83,.61),.26+.40*band+.25*(1.-view));
   color*=.81+.30*noise;color+=vec3(1.9,1.45,.91)*smoothstep(.94,.999,reflection);
   float sub=min(abs(fract(uv.x*4.+.5)-.5),abs(fract(uv.y*3.+.5)-.5));
   color*=1.-.13*(1.-smoothstep(0.,.026+w*2.,sub))*(1.-smoothstep(.03,.08,pix*7.));
   color=mix(color,vec3(.08,.112,.132),edge);
  }else{
   // Graphite thermal backsheets, paired diagonal battens and service runs.
   float diag=min(abs(uv.x-uv.y),abs(uv.x+uv.y-1.));
   color=mix(vec3(.12,.17,.20),vec3(.29,.35,.38),noise*.76+.2*(1.-abs(dot(p,v))));
   color=mix(color,vec3(.44,.52,.54),1.-smoothstep(.014,.029+w,diag));
   color=mix(color,vec3(.065,.085,.101),edge);
  }
  color=mix(color,vec3(.49,.55,.56),max(spine,outer));color=mix(color,vec3(.94,.57,.22),junction*.83);
  if(th<.10){float band0=step(.053,th);color=mix(vec3(.88,.57,.26),vec3(.21,.28,.31),band0);color+=.38*(1.-smoothstep(.002,.009+w*.08,abs(th-.08)));}
  return vec4(color,t);
 }return vec4(0,0,0,-1);
}`;
