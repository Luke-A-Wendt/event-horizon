import {HABITAT_HUB_RADIUS_UNITS,HABITAT_AIRLOCK_RADIUS_UNITS,HABITAT_DOCK_FACE_UNITS,HABITAT_DOCK_RING_UNITS,HABITAT_DOCK_BORE_UNITS,HABITAT_HATCH_DEPTH_UNITS} from './habitat-spin.js';
// A pressure ring built from a revolved, faceted cross-section. All dimensions
// are shared with the Canvas model: floor r=.92, outer hull r=.97, spin about Y.
export const HABITAT_HELPERS = `
vec4 habitatCone(vec3 ro,vec3 rd,float y0,float y1,float r0,float r1,float inward){
 vec4 h=frustumHit(ro.xzy,rd.xzy,vec3(0,0,(y0+y1)*.5),(y1-y0)*.5,r0,r1);
 return vec4(h.xzy*inward,h.w);
}
vec4 habitatCap(vec3 ro,vec3 rd,float y,float lo,float hi,float side){
 if(abs(rd.y)<.000001)return vec4(0,0,0,-1);
 float t=(y-ro.y)/rd.y,r=length(ro.xz+rd.xz*t);
 return vec4(0,side,0,(r>=lo&&r<=hi)?t:-1.0);
}
// Look through the greenhouse canopy. Floor and upper habitat roofs occupy
// separate radii; projection from the glass follows the view ray (parallax).
vec2 habitatUV(vec3 q){return vec2(atan(q.z,q.x)*.15915494+.5,q.y);}
float habitatDepth(vec3 p,vec3 d,float r){
 float a=dot(d.xz,d.xz),b=dot(p.xz,d.xz),c=dot(p.xz,p.xz)-r*r;
 if(a<1e-7)return 50.0;
 return max(0.0,(-b+sqrt(max(0.0,b*b-a*c)))/a);
}
// Unroll both the outer floor and terraced sides into a continuous park map.
vec2 habitatMap(vec3 p,vec3 d,float radius,float side){
 float t=habitatDepth(p,d,radius);
 if(abs(d.y)>.00001)t=min(t,max(0.0,((d.y<0.0?-side:side)-p.y)/d.y));
 vec3 ground=p+t*d;vec2 uv=habitatUV(ground);
 return vec2(uv.x,clamp(.5+uv.y*2.72+sign(uv.y)*max(0.0,radius-length(ground.xz))*1.95,0.0,1.0));
}
// In spoke-local coordinates x points outwards (locally down), z is tangent
// to the ring. The lift arrives inside a closed lobby with a level side exit.
vec3 habitatLiftPoint(vec3 p,vec3 axis){return vec3(dot(p,axis),p.y,dot(p,vec3(-axis.z,0,axis.x)));}
vec4 habitatSleeve(vec3 q,vec3 d,float center,float halfLength,float radius){
 vec4 h=hollowCylinderHit(q.yzx-vec3(0,0,center),d.yzx,halfLength,radius,.030);
 return vec4(h.zxy,h.w);
}
vec4 habitatLobby(vec3 q,vec3 d){return habitatSleeve(q,d,.888,.034,.055);}
vec3 habitatLobbyPaint(vec3 q,vec3 n){
 vec3 shell=vec3(.80,.84,.83),steel=vec3(.26,.34,.37),glass=vec3(.075,.22,.28);
 // On the two tangential walls, the threshold is level with the walking
 // deck; travelers never step out of an opening at greenhouse-roof level.
 if(abs(n.z)>.6){
  float panel=step(abs(q.y),.023)*step(.874,q.x);
  float seam=step(abs(q.y),.0012)+step(abs(q.x-.875),.001);
  shell=mix(shell,mix(steel,glass,step(.878,q.x)*step(q.x,.892)),panel);
  shell=mix(shell,vec3(.12,.18,.20),panel*min(seam,1.));
  shell=mix(shell,vec3(.26,.85,.79),step(abs(q.x-.87),.0016)*step(abs(q.y),.018));
 }else if(abs(n.y)>.6){
  float pane=step(abs(q.z),.036)*step(.862,q.x)*step(q.x,.895);
  shell=mix(shell,glass,pane*step(.002,abs(q.z)));
 }else{
  shell=mix(shell,steel,step(.038,abs(q.z)));
 }
 return mix(shell,steel,step(.914,q.x));
}
vec3 habitatLandscape(vec3 p,vec3 d){
 vec2 uv=habitatMap(p,d,.92,.098);
 float x=uv.x*24.0,y=uv.y;
 float station=floor(x),block=fract(x);
 float creekY=.48+.22*sin(uv.x*2.0*PI*7.0)+.042*sin(uv.x*2.0*PI*17.0);
 float creek=abs(y-creekY);
 float grain=hash(floor(vec2(uv.x*3400.0,y*150.0)));
 vec3 garden=mix(vec3(.13,.27,.068),vec3(.49,.59,.19),.42+.32*sin(station*2.7)+.21*grain);
 // Allotments and lawns change orientation at each landscaped district.
 float crops=step(.36,hash(vec2(station,5.0)))*step(.25,y)*step(y,.86);
 garden*=1.0-.30*crops*smoothstep(.12,.44,abs(fract(block*16.0+y*6.0)-.5));
 float road=min(min(block,1.0-block),abs(y-(creekY+.112)));
 garden=mix(garden,vec3(.79,.69,.47),1.0-smoothstep(.008,.025,road));
 garden=mix(garden,vec3(.055,.43,.56),1.0-smoothstep(.037,.063,creek));
 // Parallax between raised treetops and the grass. Irregular crowns vary
 // in position, radius, and lighting so parks do not read as a flat decal.
 vec2 crown=habitatMap(p,d,.900,.087);
 vec2 grove=vec2(crown.x*155.0,crown.y*6.0),cell=floor(grove);
 vec2 center=vec2(.5)+.28*(vec2(hash(cell),hash(cell.yx+19.0))-.5);
 vec2 q=(fract(grove)-center)/(vec2(.37,.44)*(.8+.45*hash(cell+3.0)));
 if(dot(q,q)<1.0&&creek>.066&&road>.024&&hash(cell+6.0)>.27){
  vec3 leaf=mix(vec3(.035,.16,.064),vec3(.19,.42,.105),hash(cell+33.0));
  float light=clamp(.63+.47*sqrt(max(0.0,1.0-dot(q,q)))-.24*q.x+.16*q.y,.35,1.36);
  garden=leaf*light;
 }
 // White pressure villas and blue skylights alternate between the two banks.
 vec2 roof=habitatMap(p,d,.888,.082);
 float town=roof.x*48.0,phase=floor(town);
 float row=mod(phase,4.0)<2.0?.23:.76;
 vec2 lot=vec2((fract(town)-.5)/.35,(roof.y-row)/.14);
 if(max(abs(lot.x),abs(lot.y))<1.0){
  vec3 ceramic=mix(vec3(.74,.74,.66),vec3(.96,.92,.78),step(lot.y,0.0));
  float opening=step(.19,abs(lot.x))*step(abs(lot.x),.83)*step(abs(lot.y),.58);
  garden=mix(ceramic,vec3(.105,.31,.38),opening);
  garden*=1.0-.19*step(.87,abs(lot.x));
 }
 // The canopy is optically thin in this model, but its shaded surface
 // normally supplies the scenery behind it. Trace the actual interior
 // span of the lift, so glazing does not visually sever it at the sill.
 float a=floor(atan(p.z,p.x)/(2.*PI/3.)+.5)*(2.*PI/3.);
 vec3 axis=vec3(cos(a),0,sin(a)),liftPoint=habitatLiftPoint(p,axis),v=habitatLiftPoint(d,axis);
 float limit=habitatDepth(p,d,.92);
 if(abs(d.y)>1e-5)limit=min(limit,((d.y>0.?.098:-.098)-p.y)/d.y);
 if(limit>0.&&(abs(liftPoint.z)<.064+abs(v.z)*limit)){
  liftPoint+=v*.00001;
  vec4 lobby=habitatLobby(liftPoint,v),lift=capsuleHit(liftPoint,v,vec3(.15,0,0),vec3(.916,0,0),.033);
  bool seeLobby=lobby.w>0.&&lobby.w<limit&&(lift.w<=0.||lobby.w<lift.w);
  if(seeLobby)garden=habitatLobbyPaint(liftPoint+v*lobby.w,lobby.xyz)*(.71+.29*abs(lobby.y));
  else if(lift.w>0.&&lift.w<limit){
   vec3 h=liftPoint+v*lift.w;
   garden=mix(vec3(.78,.83,.84),vec3(.17,.31,.35),step(.69,fract(h.x*49.))*step(.013,abs(h.y))*step(abs(h.y),.020));
  }
 }
 return garden;
}
`;
export const HABITAT_BODY = `
  // Garden Station: a glazed wheel, three pressurised spokes and axial docks.
  vec3 white=vec3(.88,.89,.86),metal=vec3(.40,.46,.49),glass=vec3(.61,.83,.86);
  selectSurface(habitatCone(ro,rd,-.050,.050,.97,.97,1.0),metal,51.0,s);
  selectSurface(habitatCone(ro,rd,-.035,.035,.765,.765,-1.0),glass,50.0,s);
  for(int k=0;k<2;k++){
   float side=k==0?1.0:-1.0;
   vec3 q=ro*vec3(1,side,1),d=rd*vec3(1,side,1);
   vec4 h=habitatCone(q,d,.035,.074,.765,.794,-1.0);
   selectSurface(vec4(h.xyz*vec3(1,side,1),h.w),glass,50.0,s);
   h=habitatCone(q,d,.074,.098,.794,.872,-1.0);
   selectSurface(vec4(h.xyz*vec3(1,side,1),h.w),glass,50.0,s);
   h=habitatCap(q,d,.098,.872,.916,1.0);
   selectSurface(vec4(h.xyz*vec3(1,side,1),h.w),white,51.0,s);
   h=habitatCone(q,d,.050,.098,.970,.916,1.0);
   selectSurface(vec4(h.xyz*vec3(1,side,1),h.w),white,51.0,s);
  }
  // The equatorial passage collar carries the three rotating lifts. Narrow
  // annular seals isolate it from the inertially fixed pressure sphere.
  selectSurface(habitatCone(ro,rd,-.032,.032,.1735,.1735,1.),metal,52.0,s);
  selectSurface(habitatCone(ro,rd,.032,.042,.1735,.158,1.),metal,52.0,s);
  selectSurface(habitatCone(ro,rd,-.042,-.032,.158,.1735,1.),metal,52.0,s);
  for(int j=0;j<3;j++){
   float a=2.0*PI*float(j)/3.0;vec3 axis=vec3(cos(a),0,sin(a)),side=vec3(-axis.z,0,axis.x);
   selectSurface(capsuleHit(ro,rd,axis*.135,axis*.916,.033),white,52.0,s);
   selectSurface(capsuleHit(ro,rd,axis*.749,axis*.772,.039),metal,52.0,s);
   vec3 q=habitatLiftPoint(ro,axis),d=habitatLiftPoint(rd,axis);
   vec4 rootBox=habitatSleeve(q,d,.183,.028,.043);
   selectSurface(vec4(rootBox.x*axis+vec3(0,rootBox.y,0)+rootBox.z*side,rootBox.w),white,52.0,s);
   vec4 lobby=habitatLobby(q,d);
   selectSurface(vec4(lobby.x*axis+vec3(0,lobby.y,0)+lobby.z*side,lobby.w),white,52.0,s);
   if(detail>=1.0){
    for(int k=0;k<2;k++){
     float hand=k==0?1.0:-1.0;
     selectSurface(capsuleHit(ro,rd,axis*.169+vec3(0,.029*hand,0),axis*.42,.011),metal,52.0,s);
     selectSurface(capsuleHit(ro,rd,axis*.22+side*.022*hand,axis*.762+side*.066*hand,.008),metal,52.0,s);
    }
   }
  }
  const float hubR=${HABITAT_HUB_RADIUS_UNITS.toFixed(8)},faceY=${HABITAT_DOCK_FACE_UNITS.toFixed(8)},R=${HABITAT_AIRLOCK_RADIUS_UNITS.toFixed(8)},bore=${HABITAT_DOCK_BORE_UNITS.toFixed(8)};
  vec4 shell=ellipsoidHit(ro,rd,vec3(0),vec3(hubR));
  if(shell.w>=0.&&abs(ro.y+rd.y*shell.w)<=faceY)selectSurface(shell,white,53.0,s);
  for(int k=0;k<2;k++){
   float side=k==0?1.0:-1.0;
   vec3 flip=vec3(1,side,1),q=ro*flip,d=rd*flip;
   vec4 h=habitatCap(q,d,faceY,bore,R,1.);
   selectSurface(vec4(h.xyz*flip,h.w),white,54.0,s);
   h=habitatCone(q,d,faceY-${HABITAT_HATCH_DEPTH_UNITS.toFixed(8)},faceY,bore,bore,-1.);
   selectSurface(vec4(h.xyz*flip,h.w),metal,54.0,s);
   h=habitatCap(q,d,faceY-${HABITAT_HATCH_DEPTH_UNITS.toFixed(8)},0.,bore,1.);
   selectSurface(vec4(h.xyz*flip,h.w),metal,54.0,s);
  }
  if(s.material==54.0)s.detail=irisClosure;
  else if(s.material==53.0)s.detail=dockExtension;
`;
export const HABITAT_FINISH = `
 if(material>49.5&&material<50.5){
  vec2 uv=habitatUV(hit);float ribs=abs(fract(uv.x*72.0+.5)-.5),r=length(hit.xz);
  float crossbar=min(abs(r-.809),abs(abs(hit.y)-.025));
  float sweep=clamp((length(hit.xz)-.765)/.107,0.0,1.0);
  float diag=abs(fract(uv.x*72.0+mix(sweep,1.0-sweep,mod(floor(uv.x*72.0),2.0))+.5)-.5);
  float brace=max((1.0-smoothstep(.010,.030,diag))*.68,max(1.0-smoothstep(.018,.046,ribs),1.0-smoothstep(.001,.003,crossbar)));
  vec3 ground=habitatLandscape(hit,localDirection);
  albedo=mix(ground,vec3(.29,.55,.65)+reflectedSky*.44,.12+.33*fresnel);
  albedo=mix(albedo,vec3(.58,.66,.66),brace);
  emission=(1.0-brace)*.39;spec*=2.5;
 }
 if(material>50.5&&material<51.5){
  vec2 uv=habitatUV(hit);float y=abs(hit.y),a=uv.x;
  float panel=abs(fract(a*72.0+.5)-.5),id=floor(a*72.0);
  if(y<.048){
   albedo=vec3(.145,.178,.198);
   float panes=step(.08,panel)*step(.009,abs(y-.026))*step(y,.042);
   albedo=mix(albedo,mix(vec3(.13,.29,.34),vec3(.99,.78,.44),step(.45,hash(vec2(id,sign(hit.y))))),panes*.84);
   emission=panes*.40;
  }else{
   albedo*=.91+.08*hash(vec2(id,sign(hit.y)));
   float stripe=1.0-smoothstep(.0018,.0036,abs(y-.060));
   albedo=mix(albedo,vec3(.15,.24,.32),stripe);
   // Red NASA worm spaced among the white hull sectors on either flank.
   float local=fract(a*6.0+.5)-.5;
   vec2 mark=vec2(-local*4.2*sign(hit.y),(y-.081)/.047);
   albedo=mix(albedo,vec3(.70,.035,.035),shuttleNasaMark(mark));
  }
  albedo*=1.0-.36*(1.0-smoothstep(.012,.03,panel));spec*=1.45;
 }
 if(material>51.5&&material<52.5){
  float r=length(hit.xz),collar=abs(fract(r*14.0+.5)-.5);
  albedo*=mix(.67,1.0,smoothstep(.025,.065,collar));
  float ports=step(.69,fract(r*49.0))*step(.013,abs(hit.y))*step(abs(hit.y),.020);
  albedo=mix(albedo,vec3(.075,.18,.23),ports*.87);
  if(r<.177){
   float y=abs(hit.y),az=atan(hit.z,hit.x),joint=abs(fract(az*3.8197186+.5)-.5);
   albedo=mix(vec3(.58,.64,.65),vec3(.19,.24,.27),1.-smoothstep(.022,.05,joint));
   albedo=mix(albedo,vec3(.16,.24,.27),1.-smoothstep(.0017,.0033,abs(y-.027)));
   albedo=mix(albedo,vec3(.27,.34,.35),smoothstep(.031,.037,y));
  }
  if(r>.157&&r<.217){
   float a=floor(atan(hit.z,hit.x)/(2.*PI/3.)+.5)*(2.*PI/3.);
   vec3 spoke=vec3(cos(a),0,sin(a)),local=habitatLiftPoint(hit,spoke),n=habitatLiftPoint(surface.normal,spoke);
   if((abs(length(local.yz)-.043)<.0001 || abs(local.x-.211)<.0001)&&local.x>=.155){
    albedo=vec3(.75,.79,.80);
    float v=abs(n.y)>.9?local.z:local.y;
    float frame=step(.176,local.x)*step(local.x,.202)*step(abs(v),.020);
    float pane=frame*step(.0014,abs(local.x-.190))*step(abs(v),.016);
    albedo=mix(albedo,vec3(.32,.40,.43),frame);
    albedo=mix(albedo,vec3(.10,.25,.30),pane);
    albedo=mix(albedo,vec3(.22,.72,.70),step(abs(local.x-.205),.001)*step(abs(v),.012));
   }
  }
  if(r>.852){
   float a=floor(atan(hit.z,hit.x)/(2.*PI/3.)+.5)*(2.*PI/3.);
   vec3 spoke=vec3(cos(a),0,sin(a));
   albedo=habitatLobbyPaint(habitatLiftPoint(hit,spoke),habitatLiftPoint(surface.normal,spoke));
  }
 }
 if(material>53.5&&material<54.5){
  float r=length(hit.xz),rot=atan(hit.z,hit.x)-surface.detail;
  const float R=${HABITAT_AIRLOCK_RADIUS_UNITS.toFixed(8)},seat=${HABITAT_DOCK_RING_UNITS.toFixed(8)};
  // Dark flex seal and indexed fasteners belong to the flush rotary plate.
  albedo=r>R-.0007?vec3(.11,.16,.19):r>seat*1.34?vec3(.71,.76,.77):r>seat?vec3(.14,.19,.22):vec3(.72,.78,.79);
  if(r<seat*.72)albedo=vec3(.23,.30,.32);
  float fastener=(1.-smoothstep(.00018,.00033,abs(r-.0075)))*smoothstep(.92,.99,cos(rot*8.));
  float key=step(.0021,r)*step(r,.0064)*smoothstep(.974,.997,cos(rot));
  albedo=mix(albedo,vec3(.17,.34,.38),max(key,fastener));
  spec*=1.6;
 }
 if(material>52.5&&material<53.5){
  float y=abs(hit.y),az=atan(hit.z,hit.x)-surface.detail,r=length(hit.xz);
  float sector=abs(fract(az*2.864789+.5)-.5);
  float band=1.-smoothstep(.008,.010,abs(y-.064));
  float glass=band*smoothstep(.032,.072,sector);
  albedo=mix(albedo,vec3(.52,.59,.60),band);
  albedo=mix(albedo,vec3(.09,.23,.29)+reflectedSky*.15,glass);
  float seam=max(1.-smoothstep(.0006,.0012,abs(y-.095)),(1.-smoothstep(.002,.007,sector))*step(.02,y));
  albedo*=1.-.21*seam;
  if(r<.072){
   float lateral=abs(sin(az*2.))*.5*r,ink=0.;
   for(int i=0;i<3;i++){
    float tip=.019+float(i)*.017;
    ink=max(ink,(1.-smoothstep(.0009,.0018,abs(r-tip-lateral)))*(1.-smoothstep(.006,.0075,lateral)));
   }
   albedo=mix(albedo*vec3(.80,.84,.87),vec3(.99),ink);emission=.50*ink;
  }
  spec*=1.45;
 }
`;
