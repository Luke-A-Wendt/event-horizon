// A formation occupies a small patch of one concentric orbital lane. The lanes
// have distinct radii so that even strongly inclined tracks do not intersect.
// The facing solar arrays and reverse radiator faces are enlarged for display.
const TAU=2*Math.PI;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const SWARM_LANES=[
 [.43,20,12,18,.27],[.53,24,35,65,.55],[.63,28,-46,16,.91],
 [.73,32,62,-18,.36],[.83,36,-21,92,.81],[.95,40,40,135,.07]
].map(([radius,count,inc,node,offset])=>{
 const i=inc*Math.PI/180,l=node*Math.PI/180,u=[Math.cos(l),0,Math.sin(l)],v=[-Math.sin(l)*Math.cos(i),Math.sin(i),Math.cos(l)*Math.cos(i)];
 return {radius,count,u,v,n:cross(u,v),offset,rate:radius**-1.5};
});
// A named location tracks one of the real formations; it does not add a 181st.
export const ASTER_LANE=5;
export const ASTER_BERTH=4;
const TAU_SLOT=TAU/SWARM_LANES[ASTER_LANE].count;
export function formationPose(l,j,epoch){
 const a=epoch*l.rate+(j+l.offset)*TAU/l.count,c=Math.cos(a),s=Math.sin(a);
 const radial=l.u.map((x,i)=>c*x+s*l.v[i]),along=l.u.map((x,i)=>-s*x+c*l.v[i]);
 return {radial,along,n:l.n,size:l.radius*.47*TAU/l.count};
}
export const ASTER_RADIUS_FACTOR=SWARM_LANES[ASTER_LANE].radius*.47*TAU_SLOT;
const fixed=x=>(Math.abs(x)<1e-8?0:x).toFixed(8),vec=v=>'vec3('+v.map(fixed).join(',')+')';
export const SWARM_GLSL=`
void swarmPart(inout vec4 hit,float t,vec3 rgb){if(t>0.0000001&&(hit.w<0.||t<hit.w))hit=vec4(rgb,t);}
float swLine(float x,float n){return 1.-smoothstep(.015,.07,abs(fract(x*n+.5)-.5));}
vec4 islandHardware(vec3 p,vec3 d){
 vec4 hit=vec4(0,0,0,-1);
 // From the core, spoke trusses lead to canted, split photovoltaic leaves.
 float side=d.z>0.?1.:0.;vec3 metal=vec3(.54,.58,.58);
 for(int bank=0;bank<2;bank++){
  float k=bank==0?-1.:1.,tilt=.115*k,h=(.07-tilt*.14-p.z+tilt*p.y)/(d.z-tilt*d.y);
  vec2 v=(p+d*h).xy;float x=abs(v.x),y=k*v.y;
  float span=.35-smoothstep(.72,.98,x)*.095;float edge=min(min(x-.292,.985-x),min(y-.032,span-y));
  if(edge>=0.){
   float u=(x-.292)/.693,w=(y-.032)/.32;
   float cell=floor(u*6.)+7.*floor(w*2.);
   vec3 a=mix(vec3(.15,.28,.40),vec3(.22,.42,.51),fract(cell*.618));
   vec3 col=mix(a,a*vec3(.69,.80,.87)+vec3(.035,.023,.067),side);
   float grid=max(swLine(u,6.),swLine(w,2.));
   col=mix(col,vec3(.69,.76,.73),max(grid*.65,1.-smoothstep(.004,.016,edge)));
   col+=vec3(.045,.05,.05)*swLine(w,15.);
   swarmPart(hit,h,col);
  }
 }
 if(abs(d.z)>.000001){
  float t=(-.01-p.z)/d.z;vec2 v=(p+t*d).xy;float x=abs(v.x),y=abs(v.y),q=length(v);
  if(x<.96&&y<.014||x<.31&&y<.042||x<.035&&y<.386)swarmPart(hit,t,metal*.67);
  // Angled radiator fins and fore/aft docking heads span the transverse spine.
  if(y>.21&&y<.445&&x<.093-(y-.21)*.15)swarmPart(hit,t, mix(vec3(.18,.22,.24),metal*.9,swLine(y,52.)));
  if(q>.184&&q<.24){
   float a=atan(v.y,v.x)/6.2831853;vec3 rim=mix(vec3(.64,.66,.61),vec3(.16,.20,.24),swLine(a,20.)*.79);
   if(q>.195&&q<.214)rim=mix(vec3(.17,.26,.32),vec3(1.,.79,.43),smoothstep(.10,.22,fract(a*28.)));
   swarmPart(hit,t,rim);
  }
 }
 // Hull sidewall: stacked pressure decks and lit windows give a side-on
 // habitat depth. The sunward underside carries a shield, not exposed glazing.
 float rimA=dot(d.xy,d.xy),rimB=dot(p.xy,d.xy),rimDisc=rimB*rimB-rimA*(dot(p.xy,p.xy)-.238*.238);
 if(rimA>.000001&&rimDisc>=0.)for(int sideHit=0;sideHit<2;sideHit++){
  float h=(-rimB+(sideHit==0?-1.:1.)*sqrt(rimDisc))/rimA;vec3 q=p+d*h;
  if(q.z<-.068||q.z>.011)continue;
  float a=atan(q.y,q.x)/6.2831853,z=(q.z+.068)/.079;
  vec3 col=metal*(.60+.22*abs(dot(normalize(q.xy),vec2(.8,.6))));
  if(z>.32&&z<.68)col=mix(vec3(.09,.16,.21),vec3(1.,.78,.41),smoothstep(.12,.31,fract(a*36.)));
  if(z<.16||z>.84)col=metal*1.18;
  swarmPart(hit,h,col);
 }
 if(abs(d.z)>.000001){
  float h=(-.068-p.z)/d.z;vec2 v=(p+d*h).xy;float rr=length(v);
  if(rr<.239){float seam=max(swLine(rr,25.),swLine(atan(v.y,v.x)/6.2831853,14.));
   swarmPart(hit,h,mix(vec3(.31,.29,.25),metal,seam*.7));}
 }
 // Pressurized garden atrium, green terraces beneath a ribbed optical canopy.
 vec3 sz=vec3(.188,.188,.102),o=(p-vec3(0,0,.016))/sz,dd=d/sz;
 float aa=dot(dd,dd),bb=dot(o,dd),disc=bb*bb-aa*(dot(o,o)-1.);
 if(disc>0.){
  float h=(-bb-sqrt(disc))/aa;if(h<=0.)h=(-bb+sqrt(disc))/aa;
  vec3 n=normalize(o+dd*h),q=p+d*h;
  float longitude=atan(n.y,n.x)/6.2831853,rr=length(q.xy)/sz.x;
  float gardens=smoothstep(-.55,.55,sin(32.*q.x+2.*sin(28.*q.y))+cos(34.*q.y-1.7*sin(17.*q.x)));
  vec3 garden=mix(vec3(.065,.24,.25),vec3(.44,.59,.25),gardens);
  vec3 glass=mix(garden,vec3(.42,.68,.70),.15+.25*(1.-abs(n.z)));
  float rib=max(swLine(longitude,12.)*smoothstep(.04,.18,rr),swLine(rr,3.));
  glass=mix(glass,vec3(.69,.72,.68),rib*.87);
  if(n.z<-.35)glass=mix(vec3(.24,.25,.26),vec3(.55,.42,.26),swLine(rr,6.));
  float gloss=pow(max(0.,dot(n,normalize(vec3(-.4,.4,.8)-d))),20.);
  swarmPart(hit,h,glass+vec3(.36,.46,.49)*gloss);
 }
 return hit;
}
void collectorLane(inout vec4 best,vec3 ro,vec3 rd,float range,float b,float d2,float epoch,float r,float count,float speed,float offset,vec3 u,vec3 v,vec3 n){
 float stepA=6.28318530718/count,size=r*.47*stepA,det=(r+.14*size)*(r+.14*size)-d2;if(det<0.)return;
 float root=sqrt(det),last=-1.e9;
 for(int face=0;face<2;face++){
  float t=max(0.,-b+(face==0?-root:root));
  if(t>range+3.*size)continue;
  vec3 ref=ro+rd*t;if(abs(dot(ref,n))>1.1*size)continue;
  float idx=floor((atan(dot(ref,v),dot(ref,u))-epoch*speed)/stepA-offset+.5);
  // Grazing a rounded habitat may enter the bound near its adjacent berth.
  for(int candidate=0;candidate<3;candidate++){
   float j=idx+float(candidate-1);if(j==last)continue;last=j;
   float a=epoch*speed+(j+offset)*stepA;vec3 z=u*cos(a)+v*sin(a),x=-u*sin(a)+v*cos(a);
   vec3 rel=(ro-r*z)/size;vec3 k=cross(rel,rd);
   if(dot(k,k)>1.10)continue;
   vec3 p=vec3(dot(rel,x),dot(rel,n),dot(rel,z)),d=vec3(dot(rd,x),dot(rd,n),dot(rd,z));
   vec4 h=islandHardware(p,d);h.w*=size;if(h.w>0.&&h.w<range)swarmPart(best,h.w,h.rgb);
  }
 }
}
vec4 collectorHit(vec3 ro,vec3 rd,float epoch,float maximum){
 vec4 best=vec4(0,0,0,-1);float b=dot(ro,rd);vec3 off=cross(ro,rd);float d2=dot(off,off);
 ${SWARM_LANES.map(l=>'collectorLane(best,ro,rd,maximum,b,d2,epoch,'+[l.radius,l.count,l.rate,l.offset].map(fixed).join(',')+','+[l.u,l.v,l.n].map(vec).join(',')+');').join('\n')}
 return best;
}`;
export function swarmLayers(body,observer){
 const result=[],epoch=body.bodyParams[1];
 for(const l of SWARM_LANES)for(let j=0;j<l.count;j++){
  const {radial,along,n,size}=formationPose(l,j,epoch),r=l.radius*body.radius,scale=size*body.radius;
  const center=radial.map((v,i)=>body.position[i]+v*r);
  const point=(x,y,z=0)=>center.map((v,i)=>v+scale*(x*along[i]+y*n[i]+z*radial[i]));
  const poly=(points,fill)=>({points:points.map(p=>point(...p)),fill});
  const parts=[];for(const side of [-1,1])for(const k of [-1,1]){
   parts.push(poly([[side*.29,k*.03,.055],[side*.98,k*.03,.055],[side*.98,k*.25,.08],[side*.73,k*.35,.09],[side*.29,k*.35,.09]],'#578298'));
  }
  parts.push(poly([[-.94,-.014],[.94,-.014],[.94,.014],[-.94,.014]],'#aebcbd'),poly([[-.055,-.44],[.055,-.44],[.055,.44],[-.055,.44]],'#9b9b89'));
  const oct=(r,z)=>Array.from({length:12},(_,i)=>[r*Math.cos(i*TAU/12),r*Math.sin(i*TAU/12),z]);
  parts.push(poly(oct(.235,.005),'#d3c4a7'),poly(oct(.18,.04),'#689a89'),poly(oct(.09,.1),'#93ab76'));
  result.push({type:'swarm-array',position:center,opacity:body.opacity??1,parts});
 }
 return result;
}
