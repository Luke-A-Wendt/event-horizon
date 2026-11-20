import {MERIDIAN_DOCK_TIP_STOWED,MERIDIAN_DOCK_STROKE,MERIDIAN_DOCK_OUTER,MERIDIAN_DOCK_INNER,MERIDIAN_ROOF_OPENING,MERIDIAN_DOCK_SEAT,MERIDIAN_HATCH_Z} from './meridian-port.js';
// Meridian's Z axis is the thrust axis. The garden, accommodation floors,
// equipment deck and engine bulkheads are all normal to it.
export const MERIDIAN_HELPERS=`
// A separate upper ellipsoid follows the roof, sliding completely below the
// coaming at zero travel. Each overlapping blade has a swept leading edge.
vec3 meridianIrisCoord(vec3 p){
 float u=asin(clamp((p.z-.680)/.185,0.0,1.0))*.6366197724;
 float a=dot(p.xy,p.xy)<1e-12?0.0:atan(p.y,p.x);
 float sector=a*1.909859317+.72*u;
 return vec3(u,fract(sector),mod(floor(sector),12.0));
}
vec4 meridianIrisHit(vec3 ro,vec3 rd,float closure){
 if(closure<=0.0)return vec4(0,0,0,-1);
 vec3 center=vec3(0,0,.680),size=vec3(.412,.412,.185);
 vec3 q=(ro-center)/size,d=rd/size;
 float a=dot(d,d),b=dot(q,d),disc=b*b-a*(dot(q,q)-1.0);
 if(disc<0.0)return vec4(0,0,0,-1);
 float root=sqrt(disc),t=(-b-root)/a;
 // Through the opening a grazing ray may hit the opposite plated lip.
 for(int side=0;side<2;side++){
  vec3 pt=ro+t*rd;
  if(t>=0.0&&pt.z>=.680&&length(pt.xy)>=${MERIDIAN_ROOF_OPENING}){
   vec3 face=meridianIrisCoord(pt);
   float tip=closure+.085*sin(PI*closure)*(.5-face.y);
   if(closure>=1.0||face.x<=tip)return vec4(unit((pt-center)/(size*size)),t);
  }
  t=(-b+root)/a;
 }
 return vec4(0,0,0,-1);
}
vec3 meridianIrisPlate(vec3 pt,float closure){
 vec3 f=meridianIrisCoord(pt);
 vec3 ceramic=mix(vec3(.68,.73,.74),vec3(.92,.90,.83),.48+.16*cos(f.z*4.1)+.34*f.y);
 // An overlapping lip casts a thin shadow along the twisted leaf edge.
 float seam=smoothstep(.005,.035,f.y),lip=smoothstep(.959,.984,f.y);
 vec3 coat=mix(vec3(.21,.26,.29),ceramic,seam);
 coat=mix(coat,vec3(.57,.61,.61),lip);
 float tip=closure+.085*sin(PI*closure)*(.5-f.y);
 if(closure<.999)coat=mix(vec3(.38,.42,.42),coat,smoothstep(0.0,.014,tip-f.x));
 // Fine expansion joint and fasteners are part of the panels, not the glass.
 float joint=abs(f.x-.35);
 coat*=.84+.16*smoothstep(.001,.008,joint);
 vec2 rivet=vec2((f.y-.062)*1.2,abs(fract(f.x*6.0+.5)-.5)*.21);
 return mix(vec3(.28,.32,.32),coat,smoothstep(.002,.009,length(rivet)));
}
vec4 meridianShell(vec3 ro,vec3 rd,float z0,float z1,float r0,float r1){
 return frustumHit(ro,rd,vec3(0,0,.5*(z0+z1)),.5*(z1-z0),r0,r1);
}
// The forward glass reveals a real depth interval. Trace from the surface to
// each layer of the atrium; low-angle views meet its inside wall first.
vec2 gardenLayer(vec3 p,vec3 d,float z){
 float t=(z-p.z)/min(d.z,-.00001);
 vec2 q=p.xy+d.xy*max(0.0,t);float r=length(q);
 return q*min(1.0,.395/max(.0001,r));
}
// The bridge is real, smaller geometry *behind* the main pressure glass.
// Trace that layer after refraction so the bridge/shaft shift against the
// garden when viewed obliquely. Result is unpremultiplied linear color.
vec4 meridianCommandView(vec3 p,vec3 d){
 vec4 dome=ellipsoidHit(p,d,vec3(0,0,.687),vec3(.112,.112,.084));
 float dist=1e5;vec4 result=vec4(0);
 if(dome.w>0.0){
  vec3 q=p+d*dome.w;
  if(q.z>.683){
   dist=dome.w;
   float a=atan(q.y,q.x),joint=1.0-smoothstep(.055,.18,abs(sin(10.0*a)));
   vec3 pearl=mix(vec3(.80,.82,.78),vec3(.59,.65,.66),joint*.31);
   float windows=smoothstep(.703,.708,q.z)*(1.0-smoothstep(.729,.733,q.z));
   vec3 panes=mix(vec3(.087,.18,.22),vec3(.32,.54,.58),clamp(dome.z,0.0,1.0));
   panes=mix(panes,vec3(.83,.67,.39),step(.93,sin(floor(a*10.0/PI)*4.78))*.36);
   result=vec4(mix(pearl,panes,windows*(1.0-joint))*(.68+.32*abs(dot(dome.xyz,unit(vec3(.2,.6,1))))),1.0);
  }
 }
 // Opaque graphite-grey pressure housing stands out against the garden.
 vec4 shaft=meridianShell(p,d,.765,.853,.033,.033);
 if(shaft.w>0.0&&shaft.w<dist){
  vec3 q=p+shaft.w*d;
  float post=1.0-smoothstep(.07,.17,abs(sin(3.0*atan(q.y,q.x))));
  float rib=1.0-smoothstep(.001,.003,min(abs(q.z-.779),min(abs(q.z-.815),abs(q.z-.845))));
  vec3 lift=mix(vec3(.46,.48,.49),vec3(.70,.71,.70),max(.65*post,rib));
  result=vec4(lift*(.64+.36*max(0.0,dot(shaft.xyz,unit(vec3(.20,.62,.76))))),1.0);
 }
 return result;
}
vec3 meridianGarden(vec3 p,vec3 d){
 vec2 xy=gardenLayer(p,d,.684);float radius=length(xy),phi=atan(xy.y,xy.x);
 float edge=abs(fract(phi*3.0/PI+.5)-.5);
 float grit=hash(floor(xy*970.0));
 vec3 grass=mix(vec3(.18,.32,.072),vec3(.40,.54,.13),.45+.22*sin(phi*3.0)+.18*grit);
 // Six planted beds surround the command deck and its access paths.
 float path=min(abs(radius-.294),radius*edge);
 vec3 land=mix(vec3(.75,.68,.53),grass,smoothstep(.009,.016,path));
 if(radius<.117)land=vec3(.67,.69,.65);
 vec2 trees=gardenLayer(p,d,.720)*32.0;
 vec2 cell=floor(trees),q=fract(trees)-.5-.32*(vec2(hash(cell),hash(cell+2.0))-.5);
 float l=dot(q,q);
 if(path>.013&&radius>.107&&radius<.375&&l<.138&&hash(cell+4.0)>.37)
  land=mix(vec3(.043,.18,.060),vec3(.19,.42,.095),hash(cell+7.0))*(.88+sqrt(max(0.0,.138-l))-.33*q.x);
 if(radius>.371)land=mix(vec3(.71,.64,.50),vec3(.13,.23,.24),step(.75,fract(phi*24.0/PI)));
 vec4 bridge=meridianCommandView(p,d);return mix(land,bridge.rgb,bridge.a);
}
`;
export const MERIDIAN_GEOMETRY=`
  // NASA Meridian: pressure decks perpendicular to thrust, no lifting surfaces.
  vec3 ceramic=vec3(.89,.87,.81),alloy=vec3(.49,.55,.56),carbon=vec3(.10,.135,.144);
  if(irisClosure>0.0){
   vec4 cover=meridianIrisHit(ro,rd,irisClosure);
   if(cover.w>=0.0)selectSurface(cover,meridianIrisPlate(ro+cover.w*rd,irisClosure),66.0,s);
  }
  vec4 canopy=ellipsoidHit(ro,rd,vec3(0,0,.680),vec3(.405,.405,.180));
  vec3 pane=ro+canopy.w*rd;
  if(pane.z>=.680&&length(pane.xy)>=${MERIDIAN_ROOF_OPENING})selectSurface(canopy,ceramic,60.0,s);
  float tip=${MERIDIAN_DOCK_TIP_STOWED}+clamp(dockExtension,0.0,1.0)*${MERIDIAN_DOCK_STROKE};
  const float portR=${MERIDIAN_DOCK_OUTER},bore=${MERIDIAN_DOCK_INNER},seat=${MERIDIAN_DOCK_SEAT};
  if(length(cross(ro-vec3(0,0,.91),rd))<.134){
   // Fixed roof flange and recessed pressure hatch remain when the bellows
   // extends. The outer mating face alone touches the station; its witness
   // stripe and sidewall lie behind that plane and remain visible at capture.
   vec4 foot=hollowCylinderHit(ro-vec3(0,0,.851),rd,.006,seat,bore);
   if(foot.w>=0.0){
    vec3 q=ro+foot.w*rd;float r=length(q.xy);
    float bolt=smoothstep(.50,.69,cos(8.0*atan(q.y,q.x)))*(1.0-smoothstep(.001,.0024,abs(r-.070)));
    selectSurface(foot,mix(alloy,carbon,bolt),62.0,s);
   }
   if(abs(rd.z)>.000001){
    float t=(${MERIDIAN_HATCH_Z}-ro.z)/rd.z;vec2 q=ro.xy+rd.xy*t;float r=length(q);
    if(t>=0.0&&r<=bore){
     float seam=1.0-smoothstep(.0007,.0015,min(abs(q.x+.002),abs(r-bore*.83)));
     selectSurface(vec4(0,0,-sign(rd.z),t),mix(vec3(.57,.59,.58),carbon,.8*seam),62.0,s);
    }
   }
   float sleeveStart=.851,sleeveEnd=tip-.006;
   if(sleeveEnd>sleeveStart){
    vec4 sleeve=hollowCylinderHit(ro-vec3(0,0,.5*(sleeveStart+sleeveEnd)),rd,.5*(sleeveEnd-sleeveStart),portR-.003,bore);
    if(sleeve.w>=0.0){
     vec3 pt=ro+sleeve.w*rd;float ribs=.5+.5*cos((pt.z-sleeveStart)/(sleeveEnd-sleeveStart)*50.265);
     selectSurface(sleeve,mix(carbon,alloy,.15+.68*ribs),65.0,s);
    }
   }
   vec4 rim=hollowCylinderHit(ro-vec3(0,0,tip-.0035),rd,.0035,portR,bore);
   if(rim.w>=0.0){
    vec3 q=ro+rim.w*rd;float stripe=(1.0-smoothstep(.0007,.0014,abs(q.z-tip+.0045)))*step(.25,cos(6.0*atan(q.y,q.x)));
    selectSurface(rim,mix(ceramic,vec3(.84,.39,.09),stripe),62.0,s);
   }
  }
  selectSurface(meridianShell(ro,rd,.665,.680,.446,.405),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.600,.665,.455,.446),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.560,.600,.490,.455),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.450,.560,.490,.490),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.420,.450,.470,.490),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.350,.420,.460,.470),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.310,.350,.400,.460),ceramic,61.0,s);
  selectSurface(meridianShell(ro,rd,.175,.310,.160,.400),alloy,62.0,s);
  selectSurface(meridianShell(ro,rd,-.565,.180,.130,.160),ceramic,63.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,0,-.563),vec3(.235,.235,.100)),alloy,62.0,s);
  for(int k=0;k<4;k++){
   vec2 axis=vec2(k==0?1.0:k==2?-1.0:0.0,k==1?1.0:k==3?-1.0:0.0);
   vec2 across=vec2(-axis.y,axis.x);
   vec3 aft=vec3(axis*.224,-.582),offset=ro-aft;
   if(length(cross(offset,rd))<.075){
    selectSurface(ellipsoidHit(ro,rd,aft,vec3(.046,.046,.039)),carbon,62.0,s);
    vec3 local=vec3(dot(offset.xy,across),offset.z,dot(offset.xy,axis)),dir=vec3(dot(rd.xy,across),rd.z,dot(rd.xy,axis));
    vec4 collar=hollowCylinderHit(local-vec3(0,0,.042),dir,.008,.032,.020);
    if(collar.w>=0.0)selectSurface(vec4(collar.x*across+collar.z*axis,collar.y,collar.w),vec3(.45,.32,.23),65.0,s);
    vec4 lip=hollowCylinderHit(local-vec3(0,0,.054),dir,.006,.031,.022);
    if(lip.w>=0.0)selectSurface(vec4(lip.x*across+lip.z*axis,lip.y,lip.w),alloy,65.0,s);
   }
   // Eight maneuvering clusters on opposite edges. Every cluster has a
   // lateral bell and an axial bell; the hot core starts at these exits.
   for(int ring=0;ring<2;ring++){
    float h=ring==0?.350:.645,sgn=ring==0?-1.0:1.0;
    vec3 pod=vec3(axis*.473,h),rel=ro-pod;
    if(length(cross(rel,rd))<.045){
     selectSurface(ellipsoidHit(ro,rd,pod,vec3(abs(axis)*.019+abs(across)*.028,.015)),alloy,62.0,s);
     vec3 aRo=vec3(dot(rel.xy,axis),dot(rel.xy,across),rel.z*sgn),aRd=vec3(dot(rd.xy,axis),dot(rd.xy,across),rd.z*sgn);
     vec4 axial=hollowCylinderHit(aRo-vec3(0,0,.0145),aRd,.0015,.014,.009);
     if(axial.w>=0.0)selectSurface(vec4(axial.x*axis+axial.y*across,axial.z*sgn,axial.w),vec3(.47,.35,.26),65.0,s);
     vec4 side=hollowCylinderHit(aRo.yzx-vec3(0,0,.0185),aRd.yzx,.002,.014,.009);
     if(side.w>=0.0)selectSurface(vec4(side.z*axis+side.x*across,side.y*sgn,side.w),carbon,65.0,s);
     vec4 roll=hollowCylinderHit(aRo.xzy,aRd.xzy,.030,.009,.005);
     if(roll.w>=0.0)selectSurface(vec4(roll.x*axis+roll.z*across,roll.y*sgn,roll.w),carbon,65.0,s);
    }
   }
   selectSurface(ellipsoidHit(ro,rd,vec3(axis*.178,-.216),vec3(.062,.062,.251)),alloy,64.0,s);
   if(detail>=1.0){
    // Tank retaining collars and insulated service line unions stand proud of their pods.
    selectSurface(hollowCylinderHit(ro-vec3(axis*.178,-.358),rd,.009,.054,.048),carbon,62.0,s);
    selectSurface(hollowCylinderHit(ro-vec3(axis*.178,-.084),rd,.009,.058,.050),carbon,62.0,s);
    selectSurface(hollowCylinderHit(ro-vec3(axis*.240,-.280),rd,.012,.012,.006),alloy,62.0,s);
   }
   selectSurface(capsuleHit(ro,rd,vec3(axis*.124,-.515),vec3(axis*.211,-.415),.016),alloy,62.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(axis*.160,-.038),vec3(axis*.379,.320),.018),alloy,62.0,s);
   if(detail>=1.0){
    selectSurface(capsuleHit(ro,rd,vec3(axis*.198,-.443),vec3(axis*.240,-.362),.007),carbon,62.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(axis*.240,-.363),vec3(axis*.240,-.087),.007),carbon,62.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(axis*.239,-.086),vec3(axis*.182,-.003),.007),carbon,62.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(axis*.155,-.050),vec3(axis*.294,.252)+vec3(across*.065,0),.009),alloy,62.0,s);
   }
   vec2 xy=(axis+across)*.130;
   selectSurface(capsuleHit(ro,rd,vec3(xy,-.705),vec3(xy,-.575),.056),carbon,65.0,s);
   selectSurface(frustumHit(ro,rd,vec3(xy,-.763),.091,.090,.046),vec3(.39,.32,.25),65.0,s);
   selectSurface(hollowCylinderHit(ro-vec3(xy,-.853),rd,.007,.091,.079),alloy,62.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(xy,-.725),vec3(.069,.069,.014)),carbon,65.0,s);
  }
`;
export const MERIDIAN_FINISH=`
 if(material>65.5&&material<66.5){
  spec*=1.85;albedo+=.09*reflectedSky*(.2+fresnel);
 }
 if(material>59.5&&material<60.5){
  vec2 xy=hit.xy;float r=length(xy),a=atan(xy.y,xy.x);
  float mullion=(1.0-smoothstep(.0015,.0038,r*abs(sin(8.0*a))*.125));
  float hoops=1.0-smoothstep(.0017,.0037,min(abs(r-.237),abs(r-.352)));
  vec3 transmitted=refract(localDirection,n,.82);
  vec3 park=meridianGarden(hit,transmitted);
  // Sky strip reflected by the convex pressure dome. Its view-dependent
  // curve runs across several panes, separately from beds on the flat floor.
  vec3 reflected=reflect(localDirection,n);
  float glancing=pow(1.0-NdotV,1.7);
  float band=dot(reflected,unit(vec3(.35,.88,.29)));
  float skyRibbon=exp(-pow((band-.52)/.075,2.0));
  float sheen=.09+.56*glancing+.13*skyRibbon;
  vec3 glass=mix(park,vec3(.22,.48,.64)+reflectedSky*.56,sheen)
     +vec3(.16,.24,.28)*skyRibbon*(.25+.75*glancing);
  float metalFoot=1.0-smoothstep(.002,.005,abs(r-.404));
  float trim=max(max(mullion,hoops),metalFoot);
  albedo=mix(glass,vec3(.62,.66,.62),trim);spec*=3.1;emission=(.32+.18*skyRibbon)*(1.0-trim);
 }
 if(material>60.5&&material<61.5){
  float a=atan(hit.y,hit.x)/(2.0*PI)+.5,z=hit.z;
  float seam=abs(fract(a*48.0+.5)-.5),col=floor(a*48.0);
  albedo*=.92+.075*hash(vec2(col,floor(z*50.0)));
  albedo*=mix(.62,1.0,smoothstep(.003,.021,seam));
  // Staggered panorama windows on both accommodation decks. Distinct sills,
  // rub strips and lit bays preserve the floor pattern at normal orbit zoom.
  float band=min(abs(z-.390)/.018,abs(z-.630)/.017);
  if(band<1.22){
   albedo=mix(vec3(.21,.27,.29),vec3(.12,.28,.32)+reflectedSky*.25,
    (1.0-smoothstep(.87,1.0,band))*smoothstep(.045,.088,seam));
   float cabin=hash(vec2(col,step(.50,z)));
   albedo*=.74+.50*cabin;
   albedo+=vec3(.032,.077,.103)*(1.0-band*.65)*smoothstep(.055,.12,seam);
   float warm=step(.75,cabin)*step(band,.80)*smoothstep(.080,.10,seam);
   albedo=mix(albedo,vec3(.87,.73,.49),warm*.74);spec*=1.7;emission=.16;
  }
  float strip=min(abs(z-.439),abs(z-.565));albedo=mix(vec3(.17,.29,.34),albedo,smoothstep(.002,.005,strip));
  if(z>.452&&z<.556){
   float arc=fract(a*4.0+.5)-.5;
   if(abs(arc)>.37&&abs(z-.51)<.014){
    float vent=step(.39,fract(a*640.0));
    albedo=mix(albedo,vec3(.27,.30,.31),vent*.8);
   }
   float ink=shuttleNasaMark(vec2(arc*5.1,(z-.505)/.105));
   albedo=mix(albedo,vec3(.68,.035,.032),ink);
   float hatch=abs(arc-.32);if(hatch<.033&&abs(z-.498)<.027)
    albedo=mix(vec3(.26,.31,.32),vec3(.71,.73,.69),step(hatch,.028)*step(abs(z-.498),.023));
  }
 }
 if(material>61.5&&material<62.5){
  float a=dot(hit.xy,hit.xy)<1e-12?0.0:atan(hit.y,hit.x)/PI,panel=abs(fract(a*12.0+.5)-.5);
  albedo*=mix(.72,1.0,smoothstep(.012,.06,panel));spec*=1.5;
  if(hit.z>.175&&hit.z<.312){
   float rib=abs(fract(a*8.0+.5)-.5);
   albedo=mix(albedo,vec3(.21,.25,.27),1.0-smoothstep(.018,.055,rib));
   albedo*=.86+.14*smoothstep(.035,.145,abs(fract(hit.z*47.0)-.5));
  }
 }
 if(material>62.5&&material<63.5){
  float a=atan(hit.y,hit.x)/PI;
  float module=abs(fract(hit.z*7.5)-.5);
  albedo*=mix(.53,1.0,smoothstep(.014,.05,module));
  float panel=step(.32,abs(fract(a*2.0)-.5))*step(-.42,hit.z)*step(hit.z,.076);
  albedo=mix(albedo,vec3(.115,.155,.165)*(.55+.45*step(.2,fract(hit.z*130.0))),panel);
 }
 if(material>63.5&&material<64.5){
  float hoop=min(abs(hit.z+.36),abs(hit.z+.085));
  vec2 nearest=abs(hit.x)>abs(hit.y)?vec2(sign(hit.x)*.178,0):vec2(0,sign(hit.y)*.178);
  vec2 section=hit.xy-nearest;float theta=atan(section.y,section.x);
  float pleat=abs(fract(theta*2.86+sin(hit.z*76.0)*.27)-.5);
  float gold=.73+.24*sqrt(pleat*2.0)+.08*sin(hit.z*108.0+theta*6.0);
  albedo=mix(vec3(.59,.44,.25)*gold*(.92+.08*hash(floor(hit.xy*460.0))),vec3(.28,.33,.33),1.0-smoothstep(.009,.017,hoop));
  spec*=1.75;
 }
 if(material>64.5&&material<65.5){
  float bands=.80+.20*smoothstep(.03,.21,abs(fract(hit.z*137.0)-.5));
  albedo*=bands;spec*=1.45;
 }
`;
