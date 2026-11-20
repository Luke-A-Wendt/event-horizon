// All planetary sizes and orbits come from the shared Solar System catalog.
// In the wide engineering diagram we resolve small sites with enlarged glyphs.
import {SOLAR_PLANETS} from './solar-catalog.js';
export const K2_GRID='k2-solar-network';
export const K2_ROLES=['Heliostat furnaces','Cloud chemistry exchange','Habitat and biosphere exchange','Shipyards and ore refineries','Gas-harvesting relays','Ice and volatile processing','Cryogenic freight terminals','Outer-system relay ports'];
// Rendering support for user-saved scenes from the retired Type II atlas.
export const LEGACY_SOLAR_CAMERA={focusDistance:1.72,yaw:-.10,pitch:1.0};
const keys=['sun',...SOLAR_PLANETS.map(s=>s.catalogId)];
const siteSize=[.150,.052,.067,.078,.067,.115,.100,.090,.090];
// The network is the atlas camera target. A tracked planet always recovers
// the real catalog position/radius and anchors its own physical-size port.
export function applySolarAtlas(frames,grid,focus,time){
 const atlas=!focus||focus===grid.id,ports=new Float32Array(40);ports[36]=Number(atlas);
 grid.isNetworkAtlas=atlas;
 for(const f of frames){
  const i=keys.indexOf(f.catalogId);if(i<0)continue;
  const raw=f.position.map((x,j)=>(x-grid.position[j])/grid.radius),d=Math.hypot(...raw);
  // Keep ephemeris coordinates in doubles for maps, instruments and labels.
  // `p` and the enlarged radii below belong only to the rendered atlas.
  f.physicalPosition=f.position;f.physicalRadius=f.radius;
  let p=raw,R=f.radius/grid.radius*(i?3.8:5.4);
  if(atlas){
   if(i&&d>1e-10){const rad=.13+.80*Math.log1p(d*34)/Math.log(32);p=raw.map(v=>v*rad/d);}
   R=siteSize[i];f.radius=R*grid.radius*(i?.36:.34);
   f.position=p.map((v,j)=>grid.position[j]+grid.radius*v);
  }
  ports.set([...p,R],i*4);
 }
 grid.bodyParams=[7,(time*.02)%8192,atlas?1:0,1];grid.networkPorts=ports;return ports;
}
export const SOLAR_NETWORK_GLSL=`
uniform vec4 uSolarPorts[10];
void k2pick(inout vec4 h,float t,vec3 c){if(t>.000000004&&(h.w<0.||t<h.w))h=vec4(c,t);}
float k2lane(vec2 v){return atan(v.y,v.x)/6.28318531+.5;}
float k2grid(float x,float n,float w){return 1.-smoothstep(w,w*1.8,abs(fract(x*n+.5)-.5));}
vec3 k2normal(float i){if(i==7.)return normalize(vec3(.92,.13,.24));if(i==3.)return normalize(vec3(.12,.71,-.41));if(i==4.)return normalize(vec3(.31,.87,.07));return normalize(vec3(sin(i*2.11+.3)*.37,1.,cos(i*1.34+.95)*.46));}
void k2ring(inout vec4 hit,vec3 o,vec3 d,vec3 normal,float i,float kind,float ep){
 vec3 u=normalize(cross(normal,vec3(0,0,1))),v=cross(normal,u);float dv=dot(d,normal);if(abs(dv)<.00001)return;
 float t=-dot(o,normal)/dv;if(t<0.||hit.w>0.&&t>=hit.w)return;
 vec3 q=o+d*t;vec2 xy=vec2(dot(q,u),dot(q,v));float rad=length(xy),a=k2lane(xy),spin=ep*(.0004+.00006*i),n=kind<.5?18.:i==1.?8.:i==2.?6.:i==3.?14.:i==4.?4.:i==5.?10.:i==6.?12.:i==7.?9.:5.;
 float slot=fract((a+spin)*n),sect=floor((a+spin)*n),inv=abs(slot-.5)*2.;
 vec3 gold=vec3(.89,.61,.26),steel=vec3(.57,.66,.68),dark=vec3(.10,.23,.31),teal=vec3(.32,.76,.73);
 vec3 col=vec3(0.);bool found=false;
 if(i<.5){
  float edge=.90-.075*inv*inv,inner=.58+.14*inv;
  if(rad>.50&&rad<.53){col=gold*.73;found=true;}
  if(rad>.47&&rad<edge&&inv<.085){col=steel;found=true;}
  if(rad>inner&&rad<edge&&inv<.95){
   float bus=max(k2grid(rad,37.,.065),k2grid(slot,5.,.062));
   col=mix(mix(vec3(.42,.25,.085),gold,(rad-inner)/(edge-inner)),vec3(.91,.79,.54),bus*.95);
   if(inv>.89||rad>edge-.012||rad<inner+.01)col=steel*1.18;found=true;
  }
 }else{
  float tech=mod(i,3.),base=kind<1.5?.72:.60,armOffset=kind<1.5?.0:.15;
  // Port identities remain readable as silhouettes even before zooming.
  bool arc=(i!=1.&&i!=4.&&i!=8.)||slot>.16;
  if(i==6.&&kind>1.5&&rad>.47&&rad<.88&&!(rad>.71&&rad<.745)){
   float dust=.6+.35*abs(sin(rad*180.))+.10*sin(rad*460.);
   col=vec3(.78,.68,.49)*dust;found=true;
  }
  if(arc&&rad>base-.054&&rad<base+.025){col=mix(steel*.59,steel,step(.77,fract(a*63.)));if(abs(rad-base)<.011)col=mix(vec3(.13,.26,.28),vec3(1,.77,.43),step(.34,fract(a*118.)));found=true;}
  if(arc&&rad>base+.05&&rad<base+.061){col=teal;found=true;}
  if(rad>base-.10&&rad<.92&&inv<.065){col=steel*1.04;found=true;}
  float deck=.78+.032*mod(sect,2.),halfW=.23-.30*abs(rad-deck);
  if(rad>deck-.071&&rad<deck+.064&&inv<halfW){col=mix(steel,vec3(.96,.87,.62),step(.75,fract(a*140.)));if(abs(rad-deck)<.026)col=vec3(.14,.30,.35)+vec3(.53,.41,.15)*step(.45,fract(a*210.));found=true;}
  // Paired receiver wings sit clear of each pressure drum; contrasting
  // panels identify mirror furnaces, orbital habitats and cryogenic yards.
  if(i==4.&&rad>.45&&rad<.99&&inv<.19-.06*(rad-.45)){
   col=mix(vec3(.51,.30,.18),steel,max(k2grid(rad,34.,.07),k2grid(slot,21.,.07))*.9);found=true;
  }
  if(i==8.&&rad>.65&&rad<.98&&inv<.07){col=teal;found=true;}
  float begin=i==2.?.61:i==1.?.55:.82,tip=i==2.?1.01:.96;
  if(rad>begin&&rad<tip&&inv>.12&&inv<(i==1.||i==2.?.76:.47)-.15*(rad-begin)/(tip-begin)){
   vec3 cell=tech<.5?vec3(.36,.49,.56):tech<1.5?vec3(.55,.37,.22):vec3(.14,.44,.49);
   if(i==1.)cell=vec3(.93,.56,.19);if(i==2.)cell=vec3(.75,.77,.68);if(i==3.)cell=vec3(.24,.67,.78);if(i==6.)cell=vec3(.67,.57,.36);
   col=mix(cell,steel,max(k2grid(rad,45.,.095),k2grid(slot,13.,.095))*.85);found=true;
  }
  if(mod(sect,3.)<.5&&rad>.47&&rad<base&&inv<.032){col=steel;found=true;}
 }
 if(found){col*=.79+.23*abs(dot(normal,normalize(vec3(-.4,.77,.5))));k2pick(hit,t,col);}
}
void k2stations(inout vec4 hit,vec3 ro,vec3 d,vec3 n,float i,float ep){
 vec3 u=normalize(cross(n,vec3(0,0,1))),v=cross(n,u);float den=dot(d,n);if(abs(den)<.0001)return;
 // Four free-flying habitats and depots occupy a lane outside either ring.
 float tp=-dot(ro,n)/den;
 if(tp<-.18)return;vec3 at=ro+d*tp;
 float az=atan(dot(at,v),dot(at,u)),slot=1.57079633,rot=ep*.002+i*.23;
 float index=floor((az-rot)/slot+.5),phase=index*slot+rot;
 vec3 outward=u*cos(phase)+v*sin(phase),along=cross(n,outward);
 vec3 p=ro-outward*.954-n*.019;vec3 r=vec3(dot(p,along),dot(p,n),dot(p,outward)),ray=vec3(dot(d,along),dot(d,n),dot(d,outward));
 if(abs(ray.y)>.00001){
  float j=(-.025-r.y)/ray.y;vec3 q=r+ray*j;float x=abs(q.x),z=abs(q.z);
  if(x>.038&&x<.126&&z<.035){vec3 wing=mix(vec3(.13,.27,.38),vec3(.69,.74,.69),max(k2grid(x,70.,.08),k2grid(z,34.,.085)));k2pick(hit,j,wing);}
  if(x<.123&&z<.005)k2pick(hit,j,vec3(.58,.65,.66));
 }
 vec3 sz=vec3(.053,.038,.044),o=r/sz,e=ray/sz;float A=dot(e,e),B=dot(o,e),disc=B*B-A*(dot(o,o)-1.);
 if(disc>0.){
  float t=(-B-sqrt(disc))/A;vec3 normal=normalize(o+t*e);
  float a=k2lane(normal.xz);vec3 color=mix(vec3(.44,.52,.54),vec3(.86,.88,.78),.5+.5*normal.y);
  if(abs(normal.y)<.25)color=mix(vec3(.13,.26,.30),vec3(1.02,.77,.41),step(.26,fract(a*16.)));
  if(normal.y>.38)color=mix(vec3(.20,.44,.44),vec3(.65,.77,.73),max(k2grid(a,8.,.055),k2grid(normal.y,5.,.05)));
  k2pick(hit,t,color);
 }
}
void k2facility(inout vec4 closest,vec3 o,vec3 d,vec4 site,float i,float ep){
 if(site.w<=0.)return;vec3 ro=(o-site.xyz)/site.w;
 vec3 side=cross(ro,d);if(dot(side,side)>1.20)return;
 vec4 h=vec4(0,0,0,-1);vec3 n=k2normal(i);
 k2ring(h,ro,d,n,i,i<.5?0.:1.,ep);
 if(i<.5){
  k2ring(h,ro,d,normalize(vec3(.73,.42,.5)),0.,0.,-ep);
  // The second bank has the same physical scale; only its orientation changes.
  k2ring(h,ro,d,normalize(vec3(-.75,.51,.28)),0.,0.,ep*.8);
 }else{
  // Counter-inclined orbital yards form two physically separated lanes.
  k2stations(h,ro,d,n,i,ep);
  vec4 inner=vec4(0,0,0,-1);float rr=i==6.?1.04:.75;vec3 n2=i==6.?normalize(vec3(-.23,.56,-.77)):normalize(n+vec3(.79,-.16,-.65));if(i!=4.&&i!=1.&&i!=8.)k2ring(inner,ro/rr,d,n2,i,2.,-ep);if(inner.w>0.)k2pick(h,inner.w*rr,inner.rgb);
 }
 if(h.w>0.)k2pick(closest,h.w*site.w,h.rgb);
}
void k2path(inout vec4 h,vec3 o,vec3 d,vec3 a,vec3 b,float width,float ep,float seed,bool freight){
 vec3 axis=b-a,rel=o-a;float len=length(axis);if(len<.0000001)return;vec3 e=axis/len;
 float q=dot(d,e),den=max(.0000001,1.-q*q),v=clamp((dot(rel,e)-dot(rel,d)*q)/den,0.,len);
 vec3 off=rel-e*v;float t=-dot(off,d);if(t<=0.)return;
 float dist=length(off+d*t);if(dist>width*1.45)return;
 float u=v/len,p=abs(fract(u*(freight?7.:5.)-ep*.026+seed)-.5)*2.;
 float pulse=1.-smoothstep(.02,.18,p);if(dist>width*(freight?.45: .60)+width*pulse*.8)return;
 vec3 col=freight?vec3(.13,.54,.63):vec3(.72,.38,.12);
 col=mix(col,freight?vec3(.51,1.13,1.12):vec3(1.45,1.03,.55),pulse);k2pick(h,t,col);
}
vec3 k2endpoint(vec4 site,vec3 aim,float idx,float ep){
 if(idx<0.)return site.xyz;
 vec3 n=k2normal(idx),u=normalize(cross(n,vec3(0,0,1))),v=cross(n,u);
 float az=atan(dot(aim,v),dot(aim,u)),theta;
 if(idx>.5){
  float rot=ep*.002+idx*.23;
  theta=floor((az-rot)/1.57079633+.5)*1.57079633+rot;
  return site.xyz+site.w*((u*cos(theta)+v*sin(theta))*.954+n*.019);
 }
 // Nearest intact panel in the solar receiver bank; align to its angular slot.
 float spin=ep*.0004;theta=((floor((az/6.2831853+.5+spin)*18.)+.5)/18.-.5-spin)*6.2831853;
 return site.xyz+site.w*.79*(u*cos(theta)+v*sin(theta));
}
void k2route(inout vec4 h,vec3 o,vec3 d,vec4 a,vec4 b,float epoch,float seed,bool freight,float ia,float ib){
 if(a.w<=0.||b.w<=0.)return;vec3 dv=b.xyz-a.xyz;float L=length(dv);if(L<.00001)return;vec3 e=dv/L,side=normalize(cross(e,vec3(0,1,0))),rise=vec3(0,1,0);
 // Segments join independently orbiting relay sites; each line is a route
 // or a beam, not a structure carrying tension over astronomical distances.
 vec3 x=k2endpoint(a,e,ia,epoch),y=k2endpoint(b,-e,ib,epoch);vec3 m=mix(x,y,.53)+side*L*(freight?.105:-.045)+rise*L*(freight?.041:.018);
 float w=min(L*.009,min(a.w,b.w)*(uSolarPorts[9].x>.5?.043:.0075))*(freight?.93:1.);
 k2path(h,o,d,x,m,w,epoch,seed,freight);k2path(h,o,d,m,y,w,epoch,seed+.22,freight);
 vec3 rel=o-m,off=cross(rel,d);float rs=w*2.22,det=rs*rs-dot(off,off);
 if(det>0.)k2pick(h,-dot(rel,d)-sqrt(det),freight?vec3(.62,.87,.91):vec3(.99,.80,.52));
}
void k2relay(inout vec4 h,vec3 o,vec3 d,vec3 p,float r,float seed){
 if(r<=0.)return;vec3 local=(o-p)/r;vec3 c=cross(local,d);if(dot(c,c)>1.2)return;
 float t=abs(d.y)>.0001?-local.y/d.y:-1.;vec3 z=local+d*t;
 float a=seed*1.4;vec2 b=mat2(cos(a),-sin(a),sin(a),cos(a))*z.xz;
 if(t>0.&&abs(b.x)>.19&&abs(b.x)<.97&&abs(b.y)<.32-.08*abs(b.x)){
  vec3 cell=mix(vec3(.32,.59,.66),vec3(.84,.87,.75),max(k2grid(b.x,5.,.065),k2grid(b.y,3.,.07)));k2pick(h,t*r,cell);}
 float dt=.22-dot(c,c);if(dt>0.)k2pick(h,(-dot(local,d)-sqrt(dt))*r,vec3(.87,.78,.54));
}
void k2sails(inout vec4 h,vec3 o,vec3 d,vec4 star,float ep){
 if(star.w<=0.)return;vec3 ro=(o-star.xyz)/star.w,c=cross(ro,d);if(dot(c,c)>3.75)return;
 for(int lane=0;lane<2;lane++){
  vec3 n=lane==0?normalize(vec3(.12,.99,-.08)):normalize(vec3(.64,.72,.36));
  vec3 u=normalize(cross(n,vec3(0,0,1))),v=cross(n,u);
  float den=dot(n,d);if(abs(den)<.0001)continue;
  float tt=-dot(n,ro)/den;if(tt<0.)continue;vec3 p=ro+d*tt;
  float rad=length(p),R=lane==0?1.43:1.76;float dr=abs(rad-R);if(dr>.11)continue;
  float a=k2lane(vec2(dot(p,u),dot(p,v))),k=fract(a*(lane==0?22.:28.)-ep*.0012),g=abs(k-.5);
  if(g<.29&&dr<.078-.13*g){vec3 cols=mix(vec3(.52,.38,.22),vec3(.96,.84,.53),max(k2grid(rad,45.,.09),k2grid(k,9.,.10)));
   if(dr>.054||g>.235)cols=vec3(.68,.75,.73);k2pick(h,tt*star.w,cols);}
  if(dr<.007&&g<.43)k2pick(h,tt*star.w,vec3(.68,.54,.34));
 }
}
vec4 solarNetworkHit(vec3 o,vec3 d,float ep,float maximum){
 vec4 h=vec4(0,0,0,-1);
 k2sails(h,o,d,uSolarPorts[0],ep);
 for(int i=0;i<9;i++){
  vec4 site=uSolarPorts[i];k2facility(h,o,d,site,float(i),ep);
  if(i>0)k2route(h,o,d,uSolarPorts[0],site,ep,float(i)*.19,false,0.,float(i));
  if(i>2)k2route(h,o,d,uSolarPorts[i-2],site,ep,float(i)*.43,true,float(i-2),float(i));
 }
 // Off-plane switching yards tie the spokes into paired freight routes.
 // Site centers are live planet positions: the network re-sights as they orbit.
 for(int j=0;j<4;j++){
  vec4 a=uSolarPorts[1+j],b=uSolarPorts[5+j];if(a.w<=0.||b.w<=0.)continue;
  vec3 m=mix(a.xyz,b.xyz,.59);float L=length(b.xyz-a.xyz),sgn=mod(float(j),2.)<.5?1.:-1.;
  m+=vec3(.07*sgn,.14*sgn,-.075)*L;
  float sr=min(a.w,b.w)*.27;vec4 yard=vec4(m,sr);
  k2relay(h,o,d,m,sr,float(j));
  k2route(h,o,d,a,yard,ep,float(j)*.26,true,float(1+j),-1.);k2route(h,o,d,yard,b,ep,float(j)*.73,true,-1.,float(5+j));
 }
 return h.w>=0.&&h.w<maximum?h:vec4(0,0,0,-1);
}`;
const V=(a,b,k=1)=>a.map((v,i)=>v+k*b[i]),mag=v=>Math.hypot(...v),unit=v=>v.map(q=>q/(mag(v)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function solarNetworkLayers(grid,observer){
 const bank=grid.networkPorts;if(!bank)return [];
 const out=[],site=Array.from({length:9},(_,i)=>({i,c:[...bank.slice(4*i,4*i+3)].map((x,k)=>grid.position[k]+grid.radius*x),r:bank[4*i+3]*grid.radius}));
 const epoch=grid.bodyParams[1],put=(position,parts)=>out.push({type:'swarm-array',position,parts,opacity:1});
 for(let i=0;i<9;i++){
  const {c,r}=site[i];if(!r)continue;
  const n=unit(i===7?[.92,.13,.24]:i===3?[.12,.71,-.41]:i===4?[.31,.87,.07]:[Math.sin(i*2.11+.3)*.37,1,Math.cos(i*1.34+.95)*.46]);
  const banks=i?[[n,1],[unit(V(n,[.79,-.16,-.65])),.75]]:[[n,1],[unit([.73,.42,.5]),1],[unit([-.75,.51,.28]),1]];
  if([1,4,8].includes(i))banks.pop();if(i===6)banks[1]=[unit([-.23,.56,-.77]),1.04];
  if(i){
   const u=unit(cross(n,[0,0,1])),v=cross(n,u);
   for(let j=0;j<4;j++){
    const a=j*Math.PI/2+epoch*.002+i*.23,e=V(u.map(x=>x*Math.cos(a)),v,Math.sin(a)),t=cross(n,e),center=V(V(c,e,r*.954),n,r*.019);
    const point=(x,y)=>V(V(center,t,r*x),e,r*y),quad=(x,y,X,Y,color)=>({fill:color,points:[point(x,y),point(X,y),point(X,Y),point(x,Y)]});
    put(center,[quad(-.124,-.025,-.04,.025,'#6293a2'),quad(.04,-.025,.124,.025,'#6293a2'),quad(-.047,-.038,.047,.038,'#bac5ba'),quad(-.034,-.025,.034,.025,'#749f94')]);
   }
  }
  for(const [normal,rr] of banks){
   const u=unit(cross(normal,[0,0,1])),v=cross(normal,u),count=[18,8,6,14,4,10,12,9,5][i];
   const point=(az,rad)=>V(V(c,u,r*rr*rad*Math.cos(az)),v,r*rr*rad*Math.sin(az));
   for(let j=0;j<count;j++){
    const a=(j/count+epoch*.0004)*2*Math.PI,w=2*Math.PI/count;
    const q=(x,y,X,Y,color)=>({fill:color,points:[point(a+x*w,y),point(a+X*w,y),point(a+X*w,Y),point(a+x*w,Y)]});
    const parts=i?[q(-.5,.66,.5,.73,'#a2b6bb'),q(-.13,.75,.13,.84,'#d9cdae'),q(-.24,.83,-.09,.95,'#4b7783'),q(.09,.83,.24,.95,'#678b97')]:[q(-.45,.65,.45,.89,'#cda067'),q(-.50,.5,.50,.53,'#b2a288'),q(-.032,.50,.032,.86,'#d7ceae')];
    if(i===6&&rr!==1)parts.unshift(q(-.5,.47,.5,.71,'#c3ac81'),q(-.5,.745,.5,.88,'#c9b896'));
    if(i===4)parts.push(q(-.09,.45,.09,.99,'#b88767'));
    if(i===1||i===2)parts.push(q(-.37,.59,.37,.95,i===1?'#d5a14c':'#c5cebd'));
    put(point(a,.76),parts);
   }
  }
 }
 function route(a,b,freight,seed){
  if(!a.r||!b.r)return;const e=unit(V(b.c,a.c,-1)),L=mag(V(b.c,a.c,-1)),v=unit(cross(e,[0,1,0]));
  const endpoint=(site,d)=>{
   const i=site.i;if(i==null)return site.c;
   const n=unit(i===7?[.92,.13,.24]:i===3?[.12,.71,-.41]:i===4?[.31,.87,.07]:[Math.sin(i*2.11+.3)*.37,1,Math.cos(i*1.34+.95)*.46]),u=unit(cross(n,[0,0,1])),v=cross(n,u),dot=(x,y)=>x.reduce((s,v,j)=>s+v*y[j],0);
   const a=Math.atan2(dot(d,v),dot(d,u)),rot=epoch*.002+i*.23,spin=epoch*.0004,th=i?Math.round((a-rot)/(Math.PI/2))*Math.PI/2+rot:((Math.floor((a/(2*Math.PI)+.5+spin)*18)+.5)/18-.5-spin)*2*Math.PI;
   const p=V(V(site.c,u,site.r*(i?.954:.79)*Math.cos(th)),v,site.r*(i?.954:.79)*Math.sin(th));return i?V(p,n,site.r*.019):p;
  };
  const x=endpoint(a,e),y=endpoint(b,e.map(v=>-v)),m=V(V(V(x,V(y,x,-1),.53),v,(freight?.105:-.045)*L),[0,1,0],L*(freight?.041:.018)),w=Math.min(L*.009,Math.min(a.r,b.r)*(grid.isNetworkAtlas?.043:.0075));
  for(const [start,end] of [[x,m],[m,y]]){
   const z=V(end,start,-1),center=V(start,z,.5),t=unit(cross(z,V(observer,center,-1)));
   const quad=(s,e,r,color)=>({fill:color,points:[V(s,t,r),V(e,t,r),V(e,t,-r),V(s,t,-r)]});
   const parts=[quad(start,end,w*.56,freight?'#3f8796':'#ba8449')],u=((epoch*.026+seed)%1+1)%1;
   parts.push(quad(V(start,z,u*.94),V(start,z,u*.94+.06),w*1.2,freight?'#9adad9':'#ffe3a1'));put(center,parts);
  }
 }
 if(site[0].r)for(const [idx,normal] of [[0,unit([.12,.99,-.08])],[1,unit([.64,.72,.36])]]){
  const star=site[0],u=unit(cross(normal,[0,0,1])),v=cross(normal,u),n=idx?28:22,R=idx?1.76:1.43;
  const pt=(a,r)=>V(V(star.c,u,star.r*r*Math.cos(a)),v,star.r*r*Math.sin(a));
  for(let j=0;j<n;j++){const a=2*Math.PI*(j+.5+epoch*.0012)/n,w=1.7/n;
   put(pt(a,R),[{points:[pt(a-w,R-.065),pt(a+w,R-.065),pt(a+w,R+.055),pt(a-w,R+.055)],fill:'#d9c394'}]);}
 }
 for(let i=1;i<9;i++){route(site[0],site[i],false,i*.13);if(i>2)route(site[i-2],site[i],true,i*.32);}
 for(let j=0;j<4;j++){
  const a=site[1+j],b=site[5+j];if(!a.r||!b.r)continue;
  const diff=V(b.c,a.c,-1),L=mag(diff),k=j%2?-1:1,c=V(V(a.c,diff,.59),[.07*k,.14*k,-.075],L),r=Math.min(a.r,b.r)*.27;
  const node={c,r};route(a,node,true,j*.26);route(node,b,true,j*.73);
  const q=(x,y,X,Y,col)=>({fill:col,points:[[x,0,y],[X,0,y],[X,0,Y],[x,0,Y]].map(f=>V(c,f,r))});
  put(c,[q(-.95,-.28,-.18,.28,'#819e9b'),q(.18,-.28,.95,.28,'#9fbfc0'),q(-.30,-.29,.30,.29,'#c9ab7f')]);
 }
 return out;
}
