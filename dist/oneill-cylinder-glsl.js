// Analytic visibility: outer pressure hull and end caps are always closed.
// The five internal bulkheads have optically clear, physically sealed panes.
export const CYLINDER_GLSL=`
const float cylR=720.0/2300.0,cylH=2160.0/2300.0;
void cylKeep(inout vec3 h,float t,float kind,float face){
 if(t>1.e-6&&t<h.x)h=vec3(t,kind,face);
}
void cylSide(inout vec3 h,vec3 ro,vec3 rd,float r,float halfZ,float inK,float outK,float cut){
 float a=dot(rd.xy,rd.xy),b=dot(rd.xy,ro.xy),v=b*b-a*(dot(ro.xy,ro.xy)-r*r);
 if(v<0.||a<1.e-12)return;
 float d=sqrt(v),t=(-b-d)/a;if(abs(ro.z+t*rd.z)<=halfZ&&(cut<=0.||ro.x+t*rd.x>=0.))cylKeep(h,t,outK,0.);
 t=(-b+d)/a;if(abs(ro.z+t*rd.z)<=halfZ&&(cut<=0.||ro.x+t*rd.x>=0.))cylKeep(h,t,inK,0.);
}
float cylLine(float x,float w,float f){return 1.-smoothstep(w,w+f,abs(fract(x+.5)-.5));}
vec3 cylGround(float a,float z,float t,vec3 rd){
 vec2 v=vec2(cos(a),sin(a));vec3 g=vec3(v*3.4,z*8.4);
 vec3 drift=vec3(noise(g*.81),noise(g*.81+2.7),noise(g*.81+5.4))-.5;
 float land=.62*noise(g+drift*1.8)+.26*noise(g*2.9+drift)+.12*noise(g*8.3);
 float moisture=noise(g*2.+4.),detail=noise(g*70.),ridge=1.-abs(2.*noise(g*7.7+drift)-1.);
 vec3 woods=mix(vec3(.045,.16,.061),vec3(.22,.38,.13),moisture);
 vec3 hills=mix(vec3(.29,.31,.20),vec3(.64,.62,.48),ridge*ridge*ridge);
 float ag=smoothstep(.41,.53,land)*(1.-smoothstep(.55,.65,land));
 vec2 uv=vec2(a*cylR,z);
 vec2 fieldUV=mat2(.91,.42,-.42,.91)*uv*vec2(145.,225.);
 float field=noise(vec3(floor(fieldUV)*.97,1.2));
 vec3 farms=mix(vec3(.15,.32,.095),vec3(.61,.51,.24),field);
 farms*=.88+.12*min(1.,12.*min(fract(fieldUV.x),fract(fieldUV.y)));
 vec3 c=mix(woods,farms,ag*smoothstep(.30,.59,moisture));
 c=mix(c,hills,smoothstep(.59,.73,land));c*=.89+.29*detail+.23*ridge;
 // Broken forest canopies and windbreaks keep the foreground from reading
 // as a smooth texture. Folds catch light on one side of each ridge.
 float grove=noise(g*49.+drift*1.2),groveShadow=noise(g*49.+drift*1.2+vec3(.39,.16,.10));
 c*=1.+.59*(grove-groveShadow)*(1.-.78*ag);
 float island=land-.43;
 float river=abs(noise(g*1.7+drift*.8)-.5)-(.011+.009*moisture);
 float coast=min(island,river+smoothstep(.48,.65,land)*.08);
 vec3 sea=mix(vec3(.023,.092,.16),vec3(.10,.41,.42),exp(-max(0.,-coast)*40.));
 float glint=pow(max(0.,dot(normalize(vec3(-v,0.)),-rd)),4.);
 sea+=glint*.065*vec3(.9,.85,.55)+noise(g*110.)*.019;
 c=mix(mix(c,vec3(.56,.54,.35),.38*(1.-smoothstep(.002,.012,coast))),sea,1.-smoothstep(-.002,.002,coast));
 // Settlement strings follow the orbital rail viaducts and spread into the
 // coastal plains. Their roofs resolve into blocks on close passes.
 float ringTrack=abs(fract(z/(2.*cylH)*18.+.5)-.5);
 float radialTrack=abs(fract(a/(2.*PI)*24.+.5)-.5);
 float roads=1.-smoothstep(.003,.011,min(ringTrack,radialTrack));
 float town=exp(-7.5*length(vec2(ringTrack,radialTrack)))*smoothstep(.002,.055,coast);
 vec2 cityUV=uv*vec2(490.,850.);
 float roof=step(.29,noise(vec3(floor(cityUV),4.)))*smoothstep(.05,.16,abs(fract(cityUV.x)-.5))*smoothstep(.04,.14,abs(fract(cityUV.y)-.5));
 float developed=smoothstep(.14,.40,town)*smoothstep(.002,.021,coast);
 vec3 roofColor=mix(vec3(.41,.41,.37),vec3(.99,.91,.76),noise(vec3(floor(cityUV)*.75,5.)));
 c=mix(c,vec3(.27,.285,.25),developed*.83);
 c=mix(c,roofColor,developed*roof*.94);
 c=mix(c,vec3(.73,.67,.54),roads*.62*smoothstep(.000,.023,coast));
 if(coast<0.){
  float chop=noise(vec3(uv*vec2(460.,990.),4.));
  c+=vec3(.12,.16,.13)*pow(chop,4.)*(1.-smoothstep(.05,.22,-coast));
 }
 return c;
}
vec4 cylinderHit(vec3 ro,vec3 rd,float limit,float phase,float cut){
 vec3 h=vec3(min(limit,1.e15),0.,0.);
 cylSide(h,ro,rd,cylR,cylH,1.,2.,cut);
 cylSide(h,ro,rd,cylR*1.035,cylH*1.01,2.,2.,cut);
 // Segmented reactor jackets enclose the axial corridor, with a separate
 // thin walkable service gallery running along the side of its diffusers.
 cylSide(h,ro,rd,.0105,cylH,3.,3.,0.);
 vec2 rail=.014*vec2(cos(phase+.82),sin(phase+.82));
 cylSide(h,ro-vec3(rail,0.),rd,.0028,cylH,6.,6.,0.);
 float glass=1.e18,net=0.,rays=0.;
 if(abs(rd.z)>.0000001){
  for(int k=0;k<7;k++){
   float fk=float(k),z=-cylH+2.*cylH*fk/6.,d=(z-ro.z)/rd.z;
   if(d<=1.e-6||d>=h.x)continue;
   vec2 p=ro.xy+rd.xy*d;float r=length(p)/cylR,a=atan(p.y,p.x)-phase;
   if(k==0||k==6){if(r<=1.035&&(cut<=0.||p.x>=0.))cylKeep(h,d,5.,fk);continue;}
   if(r>1.)continue;
   float localA=a-.13*fk;
   float primary=abs(sin(localA*6.))*r;
   float secondary=abs(sin(localA*12.))*r;
   float truss=abs(primary-.020),diagonal=abs(sin(r*156.+localA*6.));
   bool spoke=truss<.007||(primary<.023&&diagonal<.36);
   if(r>.953||r<.103||abs(r-.59)<.0035||spoke||secondary<.0028){
    cylKeep(h,d,4.,fk);
   }else if(d<glass){
    glass=d;net=cylLine(localA*48./(2.*PI),.008,.012)*.25+cylLine(r*15.,.007,.013)*.17;
   }
  }
 }
 if(h.y<.5)return vec4(0,0,0,-1);
 vec3 p=ro+h.x*rd;float a=atan(p.y,p.x)-phase,r=length(p.xy)/cylR,z=p.z;vec3 c;
 if(h.y<1.5)c=cylGround(a,z,h.x,rd);
 else if(h.y<2.5){
  vec2 panel=vec2(a/(2.*PI)*64.,z/cylH*38.);
  float bay=abs(fract(z/(2.*cylH)*6.+.5)-.5);
  float seam=max(cylLine(panel.x,.012,.024),cylLine(panel.y,.012,.024));
  float pick=noise(vec3(floor(panel),3.));
  vec3 plate=mix(vec3(.24,.29,.32),vec3(.41,.44,.46),pick);
  c=mix(plate,vec3(.085,.12,.15),seam+.39*(1.-seam)*step(.75,pick));
  if(bay<.035)c=mix(vec3(.12,.15,.16),vec3(.69,.60,.40),smoothstep(.005,.025,bay));
  if(fract(3.*a/PI)>.78&&bay>.06&&bay<.43){c=mix(vec3(.075,.105,.135),vec3(.31,.33,.34),.48*cylLine(panel.y*3.,.035,.06));}
  c*=.48+.62*max(0.,dot(normalize(vec3(p.xy,0.)),normalize(vec3(-.8,.65,-.32))));
 }else if(h.y<3.5){
  // Diffuse warm daylight comes from windows between the dark containment
  // magnets; the fusion plasma itself is not exposed to the atmosphere.
  float collar=cylLine(z*18.,.092,.026),secondary=cylLine(z*72.,.04,.05);
  float flank=.45+.55*dot(normalize(p.xy),normalize(-rd.xy+vec2(.00001)));
  float slit=smoothstep(.07,.21,abs(sin(6.*a+.2)))*flank;
  c=mix(vec3(.57,.41,.23),vec3(2.9,2.24,1.31),slit);
  c=mix(c,vec3(.18,.21,.22),max(collar,.45*secondary));
 }else if(h.y<4.5){
  float fk=h.z,localA=a-.13*fk,edge=r>.953?smoothstep(.953,.97,r):1.;
  c=mix(vec3(.19,.24,.265),vec3(.57,.64,.64),edge*(.60+.29*cos(localA*24.)));
  if(r>.958){float row=abs(r-.975);c=mix(c,vec3(.14,.19,.20),step(row,.010));float ports=cylLine(localA*200./(2.*PI),.07,.04);c=mix(c,vec3(.96,.79,.46),ports*(1.-smoothstep(.002,.004,row)));}
  if(r<.103)c=mix(vec3(.27,.32,.33),vec3(.81,.67,.41),cylLine(r*39.,.12,.11));
 }else if(h.y<5.5){
  float rings=cylLine(r*12.,.027,.07),struts=cylLine(a*30./(2.*PI),.025,.05);
  c=mix(vec3(.38,.46,.47),vec3(.21,.275,.30),max(rings,struts));if(r<.105)c=r<.045?vec3(.83,.71,.5):vec3(.16,.22,.24);
 }else c=mix(vec3(.25,.31,.32),vec3(.89,.73,.46),cylLine(z*95.,.19,.05));
 if(h.y!=2.&&h.y!=3.&&h.y!=6.){
  // Haze is deliberately stronger along long, grazing sightlines.
  c=mix(c,vec3(.46,.60,.64),.37*(1.-exp(-1.5*h.x)));
 }
 if(glass<h.x)c=mix(c,vec3(.60,.76,.76),.028+net*.18);
 // Forward scattering around the slender illumination spine; it fades with
 // clearance and stops at the first opaque surface.
 float v2=dot(rd.xy,rd.xy);
 if(v2>.000001){float nearT=clamp(-dot(ro.xy,rd.xy)/v2,0.,h.x);
  float dz=abs(ro.z+nearT*rd.z);
  if(dz<cylH&&length(ro.xy)<cylR*.999)c+=vec3(.20,.123,.057)*exp(-max(0.,length(ro.xy+rd.xy*nearT)-.011)*112.);
 }
 return vec4(c,h.x);
}`;
