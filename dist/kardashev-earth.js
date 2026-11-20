// Architectural illustration of a hypothetical planetary civilization.
// Radii and rotation are physical; the width of each line, parcel and station is enlarged.
export const EARTH_RADIUS=6378137;
export const EARTH_DAY=86164.0905;
export const EARTH_MU=3.986004418e14;
export const GEO_RADIUS=Math.cbrt(EARTH_MU*(EARTH_DAY/(2*Math.PI))**2);
export const NETWORK_RADIUS=EARTH_RADIUS*9;
export const ELEVATOR_PORTS=[.12,1.26,2.31,3.47,4.39,5.36];
export const KARDASHEV_EARTH_SCENE={id:'kardashev-1',title:'Kardashev Type I',subtitle:'Needle towers beneath orbital rings',category:'Megastructures',tags:['Planetary energy','Space elevators','Geostationary orbit'],description:'Needle towers rise from Earth’s cities toward two rail rings. Beyond them, six equatorial tethers carry climbers to geostationary ports.',explore:'Orbit Earth to follow the paired rails, inclined truss ring and needle towers. Track the elevator network to see its six geostationary ports and counterweights. Hardware widths are exaggerated.',className:'mini-planet',simulationTimeScale:.2,patch:{blackHole:false,binary:false,planet:false,tidalStar:false,warp:false,disk:false,jets:false,nebula:false,stars:true,starDensity:.85,grid:false,exposure:1.32,primaryTilt:0,primaryAzimuth:0},objects:[
 {type:'planet',key:'terra',name:'Earth',catalogId:'type-i-earth',parentId:'space',placement:'local',radiusMeters:EARTH_RADIUS,massSolar:3.00349e-6,surfaceId:1,planetStyle:'ocean',color:'#3981bc',surfaceTint:'#ffffff',rotationPeriodSeconds:EARTH_DAY,axialTilt:0,dataNote:'Earth in its equatorial frame, with real radius and sidereal rotation; the planetary energy network is hypothetical.'},
 {type:'belt',key:'elevators',name:'Equatorial elevator network',catalogId:'earth-elevator-network',bodyClass:'Planetary infrastructure',parentKey:'terra',radiusMeters:NETWORK_RADIUS,massSolar:0,opacity:1,material:'metallic',color:'#b8b0a4',dataNote:'Six co-rotating ground anchors, tensioned tethers, geostationary transfer ports, moving climbers and counterweights. Actively supported equatorial and inclined transfer rings distribute cargo; neither is a passive geostationary orbit. Surface power fields and hardware widths are enlarged. This design is illustrative, not a requirement for Kardashev Type I.'}
, {type:'star',key:'daylight',name:'Sun',parentId:'space',placement:'local',x:-61500000000,y:98500000000,z:-94250000000,radiusMeters:696340000,massSolar:1,starStyle:'main',color:'#ffe2af',dataNote:'Distant daylight source. The Earth-centered engineering view holds the Sun’s direction fixed over the demonstration.'}
],camera:{focusIndex:0,mode:'track',focusDistance:3.20,yaw:-.95,pitch:.45}};
const TAU=2*Math.PI,G=GEO_RADIUS/EARTH_RADIUS,R=NETWORK_RADIUS/EARTH_RADIUS;
const steel=0,panel=1,hab=2,brass=3,graphite=4,tether=5,light=6,copper=7;
const part=(shape,center,half,material)=>({shape,center,half,material});
const box=(x,y,z,dx,dy,dz,m)=>part('box',[x,y,z],[dx,dy,dz],m);
const egg=(x,y,z,dx,dy,dz,m)=>part('egg',[x,y,z],[dx,dy,dz],m);
const station=[box(0,0,0,.092,.072,.45,steel),egg(-.07,0,0,.19,.14,.23,hab),box(.07,0,0,.048,.44,.036,steel)];
// Photovoltaic leaves are set apart from the occupied drum. Pale structural
// spars and dark radiators have very different silhouettes from the arrays.
for(const side of [-1,1]){
 station.push(egg(.007,.37*side,0,.075,.12,.092,hab),box(.035,.442*side,0,.04,.04,.08,brass));
 for(const end of [-1,1])station.push(box(.01,side*.18,end*.34,.025,.17,.23,panel),box(.01,side*.18,end*.584,.027,.17,.012,steel));
 station.push(box(.12,.19*side,0,.12,.085,.019,graphite));
}
station.push(egg(-.24,0,0,.06,.105,.105,brass),box(.16,.04,.14,.018,.08,.12,copper));
const terminal=[egg(.014,0,0,.08,.23,.26,steel),egg(.070,0,0,.06,.138,.15,hab),egg(.126,0,0,.024,.075,.075,brass)];
for(const side of [-1,1]){
 terminal.push(box(.064,side*.146,0,.09,.032,.052,steel),box(.132,side*.146,0,.02,.036,.056,brass),box(.028,0,side*.22,.027,.076,.065,panel));
}
const weight=[egg(0,0,0,.29,.16,.19,graphite),box(.055,0,0,.050,.157,.17,steel),box(-.14,0,0,.025,.142,.15,brass),box(.213,0,0,.039,.1,.105,steel)];
const cab=[egg(0,0,0,.084,.037,.043,hab),box(.009,0,0,.024,.047,.049,brass)];
const laneDefs=[[1.40,.66,.42,.7],[1.71,-.57,1.47,2.1],[2.03,.81,-.50,4.0]];
const unit=a=>a.map(v=>v/Math.hypot(...a)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const v3=v=>'vec3('+v.map(x=>Number(x).toFixed(7)).join(',')+')';
// Radial dimensions in Earth radii. Taper profiles and both ring planes are
// shared with the Canvas fallback and the orbital map.
export const CIVIL_RINGS=[
 {radius:1.145,halfWidth:.014,depth:.022,normal:[0,1,0],bays:146},
 {radius:1.276,halfWidth:.026,depth:.030,normal:unit([-.783,.448,-.408]),bays:174}
];
export const ELEVATOR_SPIRE=[[0,.030],[.014,.023],[.041,.013],[.112,.007],[.246,.0039],[.43,.0018]];
const HIGH_TOWERS=Array.from({length:18},(_,j)=>{const a=j*2.39996323+.33,lat=(j%2?1:-1)*(.57+.53*((j*7)%11)/10);return {axis:[Math.cos(lat)*Math.cos(a),Math.sin(lat),Math.cos(lat)*Math.sin(a)],scale:.49+.35*((j*11)%13)/12};});
const ringAxes=n=>{const u=unit(cross(n,[0,0,1]));return [u,n,cross(u,n)];};
export function civilRingPoint(index,a){const ring=CIVIL_RINGS[index],[u,,w]=ringAxes(ring.normal);return u.map((v,i)=>(Math.cos(a)*v+Math.sin(a)*w[i])*ring.radius);}
const models={station,terminal,weight,cab};
const assembled=Object.entries(models).map(([name,parts])=>'void k1'+name+'(inout vec4 hit,vec3 o,vec3 d,float mult){\n'+parts.map(p=>'k1Part(hit,o,d,'+v3(p.center)+'*mult,'+v3(p.half)+'*mult,'+p.material+'.0,'+(p.shape==='egg'?'true':'false')+');').join('\n')+'\n}').join('\n');
export const EARTH_NETWORK_GLSL=`
float k1Bounds(vec3 o,vec3 d,vec3 h){
 vec3 inv=mix(vec3(-1.),vec3(1.),step(vec3(0.),d))/max(abs(d),vec3(.0000001)),u=(-h-o)*inv,v=(h-o)*inv;
 vec3 lo=min(u,v),hi=max(u,v);float l=max(lo.x,max(lo.y,lo.z)),r=min(hi.x,min(hi.y,hi.z));
 return r>=max(l,0.)?max(l,.000001):-1.;
}
void k1Part(inout vec4 hit,vec3 o,vec3 d,vec3 center,vec3 halfSize,float m,bool egg){
 vec3 rel=o-center;float t;vec3 n;
 if(egg){
  vec3 p=rel/halfSize,v=d/halfSize;float aa=dot(v,v),b=dot(p,v),c=dot(p,p)-1.,disc=b*b-aa*c;
  if(disc<0.)return;t=(-b-sqrt(disc))/aa;if(t<.000001)t=(-b+sqrt(disc))/aa;if(t<=.000001)return;
  n=normalize((rel+d*t)/(halfSize*halfSize));
 }else{
  t=k1Bounds(rel,d,halfSize);if(t<0.)return;
  vec3 v=(rel+d*t)/halfSize,a=abs(v);n=a.x>a.y&&a.x>a.z?vec3(sign(v.x),0,0):a.y>a.z?vec3(0,sign(v.y),0):vec3(0,0,sign(v.z));
 }
 if(t>=hit.w)return;
 vec3 q=(rel+t*d)/halfSize;float illum=.50+.53*max(0.,dot(n,normalize(vec3(-.4,.67,.62))))+.16*pow(1.-abs(dot(d,n)),2.);
 vec3 col=vec3(.55,.61,.62);float x=q.z,y=q.y;
 if(m<.5){
  float cuts=smoothstep(.040,.102,abs(fract((x+.04)*4.)-.5));
  col=mix(vec3(.20,.26,.27),vec3(.70,.74,.72),cuts);
 }else if(m<1.5){
  vec2 uv=vec2(x,y)*vec2(6.,4.);float edge=min(abs(fract(uv.x)-.5),abs(fract(uv.y)-.5));
  col=mix(vec3(.58,.62,.58),mix(vec3(.115,.215,.33),vec3(.29,.47,.50),.5+.5*cos(4.*x+2.*y)),smoothstep(.025,.072,edge));
  if(max(abs(x),abs(y))>.95)col=vec3(.76,.72,.59);
 }else if(m<2.5){
  col=mix(vec3(.67,.71,.66),vec3(.10,.17,.20),smoothstep(.1,.14,abs(q.x))* (1.-smoothstep(.36,.43,abs(q.x))));
  float windows=step(.45,fract(atan(q.z,q.y)*4.2))*step(abs(q.x),.33)*step(.15,abs(q.x));
  col+=windows*vec3(.85,.62,.29);
 }else if(m<3.5)col=vec3(.81,.57,.25);
 else if(m<4.5)col=mix(vec3(.14,.175,.175),vec3(.32,.37,.36),smoothstep(.28,.75,fract((q.y+.04*q.x)*5.)));
 else if(m<5.5)col=vec3(.64,.67,.64);
 else if(m<6.5)col=vec3(.84,.92,.85);
 else col=vec3(.73,.40,.19);
 hit=vec4(col*illum,t);
}
${assembled}
float k1Hash(vec2 x){return fract(sin(dot(x,vec2(127.1,311.7)))*4375.5453);}
const vec3 k1Sun=vec3(-.411,.659,-.630);
void k1Ground(inout vec4 hit,vec3 o,vec3 d,float phase){
 // A sparse luminous footprint, not an opaque dial laid over the atlas.
 float b=dot(o,d),h=1.002*1.002-dot(cross(o,d),cross(o,d));if(h<0.)return;
 float t=-b-sqrt(h);if(t<=.000001||t>=hit.w)return;
 vec3 n=normalize(o+d*t);float lon=atan(n.z,n.x)-phase,lat=asin(clamp(n.y,-1.,1.));
 float darkness=1.-smoothstep(-.06,.62,dot(n,k1Sun));
 for(int i=0;i<6;i++){
  float id=float(i),home=i==0?.12:i==1?1.26:i==2?2.31:i==3?3.47:i==4?4.39:5.36;
  float dl=atan(sin(lon-home),cos(lon-home));
  if(abs(dl)>.53||abs(lat)>.65)continue;
  for(int j=0;j<3;j++){
   float hand=j==1?1.:-1.,east=j==0?0.:hand*(.155+.05*sin(id)),north=j==0?0.:hand*(.32+.09*cos(id+hand));
   vec2 p=vec2((dl-east)*cos(lat),lat-north);
   float angle=.34+id*1.31+float(j)*.84,ca=cos(angle),sa=sin(angle);
   vec2 s=mat2(ca,-sa,sa,ca)*p;float rho=length(s*vec2(.79,1.3)),size=.125+.035*sin(id*6.+hand);
   if(rho>size)continue;
   vec2 cell=s*410.;vec2 I=floor(cell);float rnd=k1Hash(I+id*8.);
   float cluster=.45+.34*sin(s.x*74.+sin(s.y*57.))+.17*cos(s.y*93.);
   float edge=1.-smoothstep(size*.18,size,rho);
   float avenue=abs(s.y-.006*sin(s.x*115.)-s.x*.18);
   bool gridLight=rnd>.90-.37*edge*cluster&&min(abs(fract(cell.x)-.45),abs(fract(cell.y)-.5))<.27;
   if(gridLight||avenue<.0021&&rnd>.17){
    vec3 night=mix(vec3(.70,.38,.13),vec3(1.75,1.25,.60),rnd);
    vec3 day=mix(vec3(.30,.35,.37),vec3(.71,.69,.59),rnd);
    hit=vec4(mix(day,night,darkness)*(.80+.20*edge),t);return;
   }
  }
 }
}
// A cylindrical wall with two parallel steel chords, open diagonal trusses,
// inset service deck, transverse bulkheads and occasional amber running lights.
// Both intersections are considered, so a gap in the front wall reveals the far wall.
void k1Ring(inout vec4 hit,vec3 o,vec3 d,float r,float w,float depth,float bays){
 float aa=dot(d.xz,d.xz);
 if(aa>.0000001){
  float b=dot(o.xz,d.xz),det=o.x*d.z-o.z*d.x;
  for(int side=0;side<2;side++){
   float rad=side==0?r:r-depth,h=aa*rad*rad-det*det;if(h<0.)continue;
   for(int f=0;f<2;f++){
    float t=(-b+(f==0?-1.:1.)*sqrt(h))/aa;if(t<=.000001||t>=hit.w)continue;
    vec3 p=o+d*t;float y=p.y/w;if(abs(y)>1.)continue;
    float track=(atan(p.z,p.x)/6.2831853+.5)*bays,u=fract(track);
    float pier=min(u,1.-u),strut=min(abs(y-(u*2.-1.)),abs(y+(u*2.-1.)));
    float face=side==0?1.:.73,nearSun=.63+.37*max(0.,dot(normalize(p.xz),normalize(vec2(.36,-.91))));
    vec3 col;
    if(abs(y)>.75)col=(abs(y)>.94?vec3(.83,.91,.99):vec3(.44,.51,.56))*(.79+.21*step(.11,u));
    else if(y<.23&&y>-.50)col=mix(vec3(.12,.155,.18),vec3(.28,.32,.34),step(.20,u))+.08*step(.72,u);
    else if(pier<.072||strut<.105)col=vec3(.63,.66,.66);
    else if(mod(floor(track),8.)<3.)col=vec3(.20,.25,.28);
    else continue;
    if(pier<.11&&abs(y+.36)<.19&&mod(floor(track),3.)<1.)col=vec3(1.70,1.11,.43);
    hit=vec4(col*face*nearSun,t);
   }
  }
 }
 if(abs(d.y)<.00001)return;
 for(int f=0;f<2;f++){
  float t=((f==0?w:-w)-o.y)/d.y;if(t<=.000001||t>=hit.w)continue;vec3 p=o+t*d;
  float rr=length(p.xz),band=(r-rr)/depth;if(band<0.||band>1.)continue;
  float u=(atan(p.z,p.x)/6.2831853+.5)*bays;vec3 col=vec3(.26,.32,.38);
  if(band<.09||band>.87||abs(band-.35)<.047)col=vec3(.85,.88,.87);
  else if(band>.42&&band<.76)col=mix(vec3(.33,.39,.42),vec3(.61,.64,.63),.40+.54*step(.18,fract(u)));
  if(fract(u)<.05)col=vec3(.18,.21,.22);
  if(fract(u*4.)<.25&&band<.2)col=mix(col,vec3(1.23,.91,.57),.35);
  hit=vec4(col*(f==0?1.:.7),t);
 }
}
// Analytic ray/frustum intersection. Height and radius are independent: making a
// cable thinner never shortens the elevator or disconnects its buried foundation.
void k1Taper(inout vec4 hit,vec3 o,vec3 d,float x0,float x1,float r0,float r1,float top){
 float k=(r1-r0)/(x1-x0),r=r0+k*(o.x-x0),s=k*d.x;
 float A=dot(d.yz,d.yz)-s*s,B=dot(o.yz,d.yz)-r*s,C=dot(o.yz,o.yz)-r*r;
 float H=B*B-A*C;if(H<0.||abs(A)<.0000001)return;
 float root=sqrt(H);
 for(int i=0;i<2;i++){
  float t=(-B+(i==0?-1.:1.)*root)/A;if(t<=.000001||t>=hit.w)continue;
  vec3 p=o+d*t;if(p.x<x0||p.x>x1)continue;
  float row=fract((p.x-x0)/max(.006,(x1-x0)*.083)),side=atan(p.y,p.z);
  float flute=.5+.5*cos(side*6.);
  vec3 col=mix(vec3(.25,.29,.32),vec3(.68,.71,.72),.30+.58*flute);
  if(top<.5&&row<.12)col*=.71;
  if(top<.5&&flute>.87&&row>.76)col=vec3(1.31,.78,.31);
  if(top>.5)col=mix(vec3(.39,.47,.50),vec3(.88,.95,.99),flute);
  hit=vec4(col,t);
 }
}
// A sub-pixel cable is sampled by its transverse distance, rather than by
// whether the pixel center happened to strike one razor-thin triangle.
void k1Cable(inout vec4 hit,vec3 o,vec3 d){
 float a=dot(d.yz,d.yz);if(a<.000001)return;
 float t=-dot(o.yz,d.yz)/a;if(t<=.000001||t>=hit.w)return;
 float x=o.x+t*d.x;if(x<1.428||x>8.70)return;
 float width=mix(.0020,.0013,(x-1.43)/7.27),foot=max(.00012,1.58*t/max(uResolution.y,1.));
 float miss=abs(o.y*d.z-o.z*d.y)/sqrt(a),coverage=clamp((width+foot*.65-miss)/foot,0.,1.)*min(1.,2.*width/foot);
 if(coverage<.035)return;
 hit=vec4(vec3(.67,.76,.82)*coverage,t);
}
void k1Needle(inout vec4 hit,vec3 o,vec3 d,float scale){
 if(k1Bounds(o-vec3(.22*scale,0,0),d,vec3(.23,.034,.034)*scale)<0.)return;
 float s=scale;
 ${ELEVATOR_SPIRE.slice(1).map(([x,r],i)=>'k1Taper(hit,o,d,'+ELEVATOR_SPIRE[i][0].toFixed(6)+'*s,'+x.toFixed(6)+'*s,'+ELEVATOR_SPIRE[i][1].toFixed(6)+'*s,'+r.toFixed(6)+'*s,'+(i>2?'1.':'0.')+');').join('\n')}
}
vec4 earthNetworkHit(vec3 o,vec3 d,float phase,float range){
 o*=9.;float limit=min(range,1.e16)*9.;vec4 hit=vec4(0,0,0,limit);
 k1Ground(hit,o,d,phase);
 // Build in the Earth's rotating equatorial frame.
 float ca=cos(phase),sa=sin(phase);o.xz=mat2(ca,-sa,sa,ca)*o.xz;d.xz=mat2(ca,-sa,sa,ca)*d.xz;
 ${CIVIL_RINGS.map((ring,j)=>{const [u,n,w]=ringAxes(ring.normal),pos=x=>'vec3(dot('+x+','+v3(u)+'),dot('+x+','+v3(n)+'),dot('+x+','+v3(w)+'))';return 'k1Ring(hit,'+pos('o')+','+pos('d')+','+ring.radius+','+ring.halfWidth+','+ring.depth+','+ring.bays+'.0);';}).join('\n')}
 for(int i=0;i<6;i++){
  float k=float(i),a=i==0?.12:i==1?1.26:i==2?2.31:i==3?3.47:i==4?4.39:5.36;
  vec3 n=vec3(cos(a),0,sin(a)),along=vec3(-n.z,0,n.x);
  vec3 p=vec3(dot(o,n),o.y,dot(o,along)),v=vec3(dot(d,n),d.y,dot(d,along));
  if(k1Bounds(p-vec3(4.9,0,0),v,vec3(3.96,.11,.13))<0.)continue;
  k1Needle(hit,p-vec3(1.,0,0),v,1.);
  k1Cable(hit,p,v);
  vec3 l=p-vec3(1.,0,0);if(k1Bounds(l,v,vec3(.012,.036,.044))>=0.)k1terminal(hit,l,v,.14);
  l=p-vec3(${G.toFixed(8)},0,0);
  if(k1Bounds(l,v,vec3(.08,.13,.15))>=0.)k1station(hit,l,v,.19);
  l=p-vec3(8.70,0,0);
  if(k1Bounds(l,v,vec3(.09,.05,.07))>=0.)k1weight(hit,l,v,.29);
  for(int j=0;j<2;j++){
   float q=.5-.5*cos(phase*(3.+k*.2)+k*1.85+float(j)*3.14159);l=p-vec3(1.32+5.22*q,0,0);
   if(k1Bounds(l,v,vec3(.023,.012,.013))>=0.)k1cab(hit,l,v,.24);
  }
 }
 // Radial support spires meet the inclined ring rather than ending in midair.
 vec3 ringU=${v3(ringAxes(CIVIL_RINGS[1].normal)[0])},ringW=${v3(ringAxes(CIVIL_RINGS[1].normal)[2])};
 for(int i=0;i<18;i++){
  float a=(float(i)+.32)*6.2831853/18.;
  vec3 n=ringU*cos(a)+ringW*sin(a),e=normalize(vec3(-n.z,0,n.x)),nn=cross(e,n),q=o-n;
  vec3 p=vec3(dot(q,n),dot(q,nn),dot(q,e)),v=vec3(dot(d,n),dot(d,nn),dot(d,e));
  if(k1Bounds(p-vec3(.16,0,0),v,vec3(.18,.022,.022))>=0.)k1Needle(hit,p,v,.64);
 }
 for(int i=0;i<18;i++){
  float j=float(i),a=j*2.39996323+.33,lat=(mod(j,2.)>.5?1.:-1.)*(.57+.53*mod(j*7.,11.)*.1),s=.49+.35*mod(j*11.,13.)/12.;
  vec3 n=vec3(cos(lat)*cos(a),sin(lat),cos(lat)*sin(a)),e=vec3(-sin(a),0,cos(a)),nn=cross(e,n),q=o-n;
  vec3 p=vec3(dot(q,n),dot(q,nn),dot(q,e)),v=vec3(dot(d,n),dot(d,nn),dot(d,e));
  if(k1Bounds(p-vec3(.22*s,0,0),v,vec3(.23,.030,.030)*s)>=0.)k1Needle(hit,p,v,s);
 }
 for(int i=0;i<3;i++){
  float r=i==0?1.40:i==1?1.71:2.03,inc=i==0?.66:i==1?-.57:.81,node=(i==0?.42:i==1?1.47:-.50)-phase;
  float a=phase*pow(${G.toFixed(8)}/r,1.5)+(i==0?.7:i==1?2.1:4.);
  vec3 u=vec3(cos(node),0,sin(node)),w=vec3(-sin(node)*cos(inc),sin(inc),cos(node)*cos(inc));
  vec3 n=u*cos(a)+w*sin(a),along=-u*sin(a)+w*cos(a),pole=normalize(cross(along,n));
  vec3 off=o-n*r,p=vec3(dot(off,n),dot(off,pole),dot(off,along)),v=vec3(dot(d,n),dot(d,pole),dot(d,along));
  if(k1Bounds(p,v,vec3(.027,.047,.06))>=0.)k1station(hit,p,v,.081+.009*float(i));
 }
 return hit.w<limit?vec4(hit.rgb,hit.w/9.):vec4(0,0,0,-1);
}
`;

export function transferOrbit(i,phase){
 const [r,inc,node,a0]=laneDefs[i],a=a0+phase*(G/r)**1.5,c=Math.cos(a),s=Math.sin(a),u=[Math.cos(node),0,Math.sin(node)],w=[-Math.sin(node)*Math.cos(inc),Math.sin(inc),Math.cos(node)*Math.cos(inc)];
 const n=u.map((v,k)=>v*c+w[k]*s),along=u.map((v,k)=>-v*s+w[k]*c);
 return {r,n,along,pole:unit(cross(along,n))};
}
export function networkPhase(timeSeconds){return -timeSeconds*TAU/EARTH_DAY;}
export function networkPort(i,phase){const a=ELEVATOR_PORTS[i]+phase;return {n:[Math.cos(a),0,Math.sin(a)],along:[-Math.sin(a),0,Math.cos(a)]};}
const colors=['#a7aba5','#41788d','#ccccc0','#cc974f','#4d5957','#a8b0a7','#ecf4db','#ba7c58'];
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),up=[0,1,0];
export function earthNetworkLayers(body,observer){
 const phase=body.bodyParams[1],unitR=body.radius/R,out=[],center=body.position;
 const world=(axes,base,p)=>p.map((_,k)=>center[k]+unitR*(base[k]+axes.reduce((v,ax,j)=>v+p[j]*ax[k],0)));
 const layer=(position,parts)=>out.push({type:'swarm-array',opacity:body.opacity??1,position,parts});
 const model=(parts,axes,base,scale=1)=>{
  for(const part of parts){
   const ctr=part.center.map(v=>v*scale),size=part.half.map(v=>v*scale),mid=world(axes,base,ctr),faces=[];
   const toWorld=p=>world(axes,base,ctr.map((v,i)=>v+p[i]*size[i]));
   for(let axis=0;axis<3;axis++){
    const a=(axis+1)%3,b=(axis+2)%3,sign=dot(observer.map((v,k)=>v-mid[k]),axes[axis])>0?1:-1;
    const pt=(y,z,flat=1)=>{const p=[0,0,0];p[axis]=sign*flat;p[a]=y;p[b]=z;return toWorld(p);};
    if(part.shape==='egg'){
     const ring=(v,s)=>Array.from({length:8},(_,i)=>pt(s*Math.cos(i*TAU/8),s*Math.sin(i*TAU/8),v));
     faces.push({points:ring(.70,.72),fill:colors[part.material]});
    }else{
     faces.push({points:[pt(-1,-1),pt(1,-1),pt(1,1),pt(-1,1)],fill:colors[part.material]});
     if(part.material===panel&&axis===0)for(let j=1;j<4;j++){const x=-1+j*.5;faces.push({points:[pt(-1,x-.029),pt(1,x-.029),pt(1,x+.029),pt(-1,x+.029)],fill:'#90a9aa'});}
    }
   }
   layer(mid,faces);
  }
 };
 const spin=n=>[n[0]*Math.cos(phase)-n[2]*Math.sin(phase),n[1],n[0]*Math.sin(phase)+n[2]*Math.cos(phase)];
 const cart=p=>p.map((v,k)=>center[k]+unitR*v),xyz=(n,y,z,r,d,e)=>n.map((v,k)=>v*r+y[k]*d+z[k]*e);
 const frustum=(axis,from,to,r0,r1)=>{
  const east=unit([-axis[2],0,axis[0]]),north=cross(east,axis),pos=(rad,r,a)=>cart(xyz(axis,north,east,rad,r*Math.cos(a),r*Math.sin(a)));
  const mid=cart(axis.map(v=>v*(from+to)/2)),faces=[];
  for(let i=0;i<6;i++){const a=i*TAU/6,b=a+TAU/6,midA=(a+b)/2,normal=north.map((v,k)=>v*Math.cos(midA)+east[k]*Math.sin(midA));
   if(dot(normal,observer.map((v,k)=>v-mid[k]))<0)continue;
   faces.push({points:[pos(from,r0,a),pos(from,r0,b),pos(to,r1,b),pos(to,r1,a)],fill:['#52616b','#c5c9c8','#6d787c','#859096','#515c62','#b0b9bb'][i]});}
  layer(mid,faces);
 };
 const needle=(n,scale)=>{for(let i=1;i<ELEVATOR_SPIRE.length;i++){const x=ELEVATOR_SPIRE[i-1],y=ELEVATOR_SPIRE[i];frustum(n,1+x[0]*scale,1+y[0]*scale,x[1]*scale,y[1]*scale);}};
 const simpleStation=[station[0],station[1],station[2],...station.filter(p=>p.material===panel)],simpleTerminal=terminal.slice(0,3),simpleWeight=weight.slice(0,2),simpleCab=cab.slice(0,1);
 for(const ring of CIVIL_RINGS){
  const [u,normal,z]=ringAxes(ring.normal).map(spin);
  const at=(a,h,r)=>cart(u.map((v,k)=>(v*Math.cos(a)+z[k]*Math.sin(a))*r+normal[k]*h));
  const bays=Math.ceil(ring.bays/2.6);
  for(let j=0;j<bays;j++){
   const a=TAU*j/bays,b=a+TAU/bays,r=ring.radius,w=ring.halfWidth,depth=ring.depth;
   const p=(v,h,rr=r)=>at(a+(b-a)*v,h*w,rr);
   const quad=(a1,y1,a2,y2,c1,z1,c2,z2)=>[p(a1,y1),p(a2,y2),p(c1,z1),p(c2,z2)];
   const parts=[{points:quad(0,.76,1,.76,1,1,0,1),fill:'#b7c1c4'},
    {points:quad(0,-.98,1,-.98,1,-.75,0,-.75),fill:'#667981'},
    {points:quad(0,-.50,1,-.50,1,.23,0,.23),fill:'#35414a'},
    {points:quad(0,-.8,.09,-.8,1,.8,.90,.8),fill:'#99a3a6'},
    {points:[p(0,1),p(1,1),p(1,1,r-depth),p(0,1,r-depth)],fill:j%7===0?'#cad4d5':'#69777e'},
    ];
   if(j%3===0)parts.push({points:quad(.03,-.63,.14,-.63,.14,-.32,.03,-.32),fill:'#f9c278'});
   layer(at((a+b)/2,0,r),parts);
  }
 }
 const hash=x=>{const v=Math.sin(x*12.727)*4375.545;return v-Math.floor(v);};
 const ground=(a,b)=>cart([Math.cos(a)*Math.cos(b)*1.002,Math.sin(b)*1.002,Math.sin(a)*Math.cos(b)*1.002]);
 ELEVATOR_PORTS.forEach((lon,i)=>{
  const {n,along}=networkPort(i,phase),axes=[n,up,along],at=x=>n.map(v=>v*x);
  needle(n,1);model(simpleTerminal,axes,at(1),.14);model(simpleStation,axes,at(G),.19);model(simpleWeight,axes,at(8.70),.29);
  for(let j=0;j<6;j++){const v=j/6,z=(j+1)/6;frustum(n,1.43+7.27*v,1.43+7.27*z,.0020-.0007*v,.0020-.0007*z);}
  for(let j=0;j<2;j++)model(simpleCab,axes,at(1.32+5.22*(.5-.5*Math.cos(phase*(3+i*.2)+i*1.85+j*Math.PI))),.24);
  for(let j=0;j<3;j++){const sign=j===1?1:-1,a=lon+phase+(j===0?0:sign*(.155+.05*Math.sin(i))),b=j===0?0:sign*(.32+.09*Math.cos(i+sign));
   const mid=ground(a,b),outward=mid.map((v,k)=>v-center[k]);if(dot(outward,observer.map((v,k)=>v-mid[k]))<=0)continue;
   const parts=[];for(let k=0;k<19;k++){const rad=.12*Math.sqrt(hash(81*i+41*j+k)),angle=TAU*hash(k*7+2),x=a+rad*Math.cos(angle),y=b+.6*rad*Math.sin(angle),t=.0014+.0015*hash(k+30);
    parts.push({points:[ground(x-t,y-t*.6),ground(x+t,y-t*.6),ground(x+t,y+t*.6),ground(x-t,y+t*.6)],fill:k%3?'#caa465':'#e9cc98'});}
   layer(mid,parts);
  }
 });
 for(const spire of HIGH_TOWERS)needle(spin(spire.axis),spire.scale);
 for(let i=0;i<18;i++){const p=unit(civilRingPoint(1,(i+.32)*TAU/18));needle(spin(p),.64);}
 for(let i=0;i<3;i++){const t=transferOrbit(i,phase);model(simpleStation,[t.n,t.pole,t.along],t.n.map(x=>x*t.r),.081+.009*i);}
 return out;
}
