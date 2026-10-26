// Original procedural spacecraft geometry and materials; no external models.
export const CRAFT_GLSL = `
// Every model is an analytic union of small primitives inside a unit sphere.
// Only segments intersecting that sphere run the model tests, so distant
// spacecraft have a cheap rejection and thin solar panels cannot be stepped over.
struct CraftSurface { float t; vec3 normal; vec3 albedo; float material; };
vec4 ellipsoidHit(vec3 ro,vec3 rd,vec3 center,vec3 radii){
 vec3 q=(ro-center)/radii,d=rd/radii;
 float a=dot(d,d),b=dot(q,d),c=dot(q,q)-1.0,h=b*b-a*c;
 if(h<0.0)return vec4(0,0,0,-1);
 float root=sqrt(h),t=(-b-root)/a;if(t<0.0)t=(-b+root)/a;
 return vec4(unit((ro+rd*t-center)/(radii*radii)),t);
}
vec4 boxHit(vec3 ro,vec3 rd,vec3 center,vec3 halfSize){
 vec3 q=ro-center,safeSign=vec3(rd.x<0.0?-1.0:1.0,rd.y<0.0?-1.0:1.0,rd.z<0.0?-1.0:1.0);
 vec3 inv=vec3(1.0)/(safeSign*max(abs(rd),vec3(.000001)));
 vec3 lo=(-halfSize-q)*inv,hi=(halfSize-q)*inv;
 vec3 entry=min(lo,hi),leave=max(lo,hi);
 float t=max(entry.x,max(entry.y,entry.z)),far=min(leave.x,min(leave.y,leave.z));
 if(far<max(t,0.0))return vec4(0,0,0,-1);
 vec3 n=-sign(rd)*step(vec3(t-.000001),entry);
 if(t<0.0){t=far;n=sign(rd)*step(leave,vec3(t+.000001));}
 return vec4(unit(n),t);
}
vec4 capsuleHit(vec3 ro,vec3 rd,vec3 a,vec3 b,float radius){
 vec3 ba=b-a,oa=ro-a;
 float l2=dot(ba,ba),bv=dot(ba,rd),bo=dot(ba,oa);
 float aa=l2-bv*bv,bb=l2*dot(oa,rd)-bo*bv,cc=l2*dot(oa,oa)-bo*bo-radius*radius*l2;
 float h=bb*bb-aa*cc,t=100000.0;vec3 normal=vec3(0);
 if(h>=0.0&&aa>.000001){
  float candidate=(-bb-sqrt(h))/aa,y=bo+candidate*bv;
  if(candidate>=0.0&&y>0.0&&y<l2){t=candidate;normal=unit(oa+rd*t-ba*y/l2);}
 }
 vec4 cap=ellipsoidHit(ro,rd,a,vec3(radius));if(cap.w>=0.0&&cap.w<t){t=cap.w;normal=cap.xyz;}
 cap=ellipsoidHit(ro,rd,b,vec3(radius));if(cap.w>=0.0&&cap.w<t){t=cap.w;normal=cap.xyz;}
 return vec4(normal,t==100000.0?-1.0:t);
}
void selectSurface(vec4 hit,vec3 albedo,float material,inout CraftSurface surface){
 if(hit.w>=0.0&&hit.w<surface.t){surface.t=hit.w;surface.normal=hit.xyz;surface.albedo=albedo;surface.material=material;}
}
void clipPlane(vec3 ro,vec3 rd,vec3 n,float offset,inout float nearT,inout float farT,inout vec3 normal,inout bool valid){
 float d=dot(n,rd),q=offset-dot(n,ro);
 if(abs(d)<.000001){if(q<0.0)valid=false;return;}
 float t=q/d;
 if(d<0.0){if(t>nearT){nearT=t;normal=n;}}else farT=min(farT,t);
}
vec4 wingHit(vec3 ro,vec3 rd,vec2 a,vec2 b,vec2 c,float thickness){
 float nearT=-100000.0,farT=100000.0;vec3 normal=vec3(0);bool valid=true;
 vec2 center=(a+b+c)/3.0;
 for(int k=0;k<3;k++){
  vec2 p=k==0?a:(k==1?b:c),next=k==0?b:(k==1?c:a),edge=next-p;
  vec2 n=normalize(vec2(edge.y,-edge.x));if(dot(n,center-p)>0.0)n=-n;
  clipPlane(ro,rd,vec3(n.x,0,n.y),dot(n,p),nearT,farT,normal,valid);
 }
 clipPlane(ro,rd,vec3(0,1,0),thickness,nearT,farT,normal,valid);
 clipPlane(ro,rd,vec3(0,-1,0),thickness,nearT,farT,normal,valid);
 if(!valid||farT<max(nearT,0.0)||nearT<0.0)return vec4(0,0,0,-1);
 return vec4(normal,nearT);
}

// Continuous rounded forebody with three inset windscreen facets.
// The roof stays curved: a horizontal clipping plane would make a cylindrical
// cap hovering above the nose, instead of the orbiter's integrated flight deck.
// The side facets wrap the six windows around the cabin, rather than drawing
// six parallel strips on one flat bus-like windscreen.
vec4 shuttleCabinHit(vec3 ro,vec3 rd){
 vec3 center=vec3(0,.010,.405),radii=vec3(.143,.149,.350);
 vec3 q=(ro-center)/radii,d=rd/radii;
 float aa=dot(d,d),bb=dot(q,d),cc=dot(q,q)-1.0,h=bb*bb-aa*cc;
 if(h<0.0)return vec4(0,0,0,-1);
 float root=sqrt(h),nearT=(-bb-root)/aa,farT=(-bb+root)/aa;
 vec3 normal=unit((ro+rd*nearT-center)/(radii*radii));bool valid=true;
 clipPlane(ro,rd,vec3(1,0,0),.132,nearT,farT,normal,valid);
 clipPlane(ro,rd,vec3(-1,0,0),.132,nearT,farT,normal,valid);
 clipPlane(ro,rd,unit(vec3(0,1,.8)),.584/length(vec3(0,1,.8)),nearT,farT,normal,valid);
 clipPlane(ro,rd,unit(vec3(.70,.85,.80)),.615/length(vec3(.70,.85,.80)),nearT,farT,normal,valid);
 clipPlane(ro,rd,unit(vec3(-.70,.85,.80)),.615/length(vec3(.70,.85,.80)),nearT,farT,normal,valid);
 if(!valid||farT<max(nearT,0.0)||nearT<0.0)return vec4(0,0,0,-1);
 return vec4(normal,nearT);
}

// Closed tapered engine bell; axis is the local z direction.
vec4 frustumHit(vec3 ro,vec3 rd,vec3 center,float halfLength,float rearRadius,float frontRadius){
 vec3 q=ro-center;float k=(frontRadius-rearRadius)/(2.0*halfLength),r=(frontRadius+rearRadius)*.5;
 float a=dot(rd.xy,rd.xy)-k*k*rd.z*rd.z,b=dot(q.xy,rd.xy)-(r+k*q.z)*k*rd.z,c=dot(q.xy,q.xy)-(r+k*q.z)*(r+k*q.z);
 float h=b*b-a*c,t=100000.0;vec3 normal=vec3(0);
 if(h>=0.0&&abs(a)>.000001){
  float root=sqrt(h);float aT=(-b-root)/a,bT=(-b+root)/a;
  for(int i=0;i<2;i++){float candidate=i==0?aT:bT,z=q.z+candidate*rd.z;
   if(candidate>=0.0&&candidate<t&&abs(z)<=halfLength){t=candidate;vec3 point=q+rd*t;normal=unit(vec3(point.xy,-k*(r+k*z)));}}
 }
 return vec4(normal,t==100000.0?-1.0:t);
}
CraftSurface craftHit(vec3 ro,vec3 rd,float maximum,float type){
 CraftSurface s;s.t=maximum+max(.001,abs(maximum)*.00001);s.normal=vec3(0);s.albedo=vec3(.8);s.material=0.0;
 vec3 white=vec3(.82,.84,.82),silver=vec3(.48,.54,.58),dark=vec3(.018,.023,.028),blue=vec3(.025,.065,.16),gold=vec3(.92,.63,.19);
 if(type<3.5){
  // ISS: x extent 1.64, representing the 109 m main truss span.
  selectSurface(boxHit(ro,rd,vec3(0),vec3(.82,.016,.018)),silver,0.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(0,0,-.34),vec3(0,0,.33),.051),white,21.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(-.17,0,-.06),vec3(.17,0,-.06),.046),white,21.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(0,0,.33),vec3(0,0,.46),.035),silver,0.0,s);
  for(int wing=0;wing<4;wing++){
   float x=-.66+float(wing)*.44;
   selectSurface(boxHit(ro,rd,vec3(x,0,0),vec3(.010,.014,.48)),gold,0.0,s);
   for(int side=0;side<2;side++){
    float z=side==0?-.28:.28;
    // Eight wings, each formed from two solar blankets and a central mast.
    if(uDetail<1.0)selectSurface(boxHit(ro,rd,vec3(x,.007,z),vec3(.135,.006,.205)),blue,1.0,s);
    else{
     selectSurface(boxHit(ro,rd,vec3(x-.070,.007,z),vec3(.065,.006,.205)),blue,1.0,s);
     selectSurface(boxHit(ro,rd,vec3(x+.070,.007,z),vec3(.065,.006,.205)),blue,1.0,s);
    }
   }
  }
  selectSurface(boxHit(ro,rd,vec3(-.26,-.045,0),vec3(.1,.006,.095)),white,22.0,s);
  selectSurface(boxHit(ro,rd,vec3(.26,-.045,0),vec3(.1,.006,.095)),white,22.0,s);
  if(uDetail>=1.0){
   // Open truss chords and diagonals remain analytic: no mesh/texture downloads.
   for(int chord=0;chord<4;chord++){
    vec2 yz=vec2(chord<2?-.025:.025,mod(float(chord),2.0)<.5?-.028:.028);
    selectSurface(capsuleHit(ro,rd,vec3(-.81,yz),vec3(.81,yz),.004),silver,0.0,s);
   }
   for(int bay=0;bay<12;bay++){
    float x=-.78+float(bay)*.13;
    selectSurface(capsuleHit(ro,rd,vec3(x,-.025,.028),vec3(x+.13,.025,.028),.0035),silver,0.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(x,.025,-.028),vec3(x+.13,-.025,-.028),.0035),silver,0.0,s);
   }
   // Module docking collars, side laboratories, exposed payload platform.
   for(int module=0;module<5;module++){
    float z=-.29+float(module)*.14;
    selectSurface(ellipsoidHit(ro,rd,vec3(0,0,z),vec3(.057,.057,.010)),silver,21.0,s);
   }
   selectSurface(capsuleHit(ro,rd,vec3(-.17,0,-.06),vec3(-.17,0,.12),.037),white,21.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.17,0,-.06),vec3(.17,0,.17),.040),white,21.0,s);
   selectSurface(boxHit(ro,rd,vec3(.17,0,.235),vec3(.050,.016,.065)),silver,0.0,s);
   // Cupola glazing and the bent Canadarm2 silhouette.
   selectSurface(ellipsoidHit(ro,rd,vec3(0,-.057,.17),vec3(.029,.024,.029)),vec3(.025,.075,.10),23.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.05,.04,.10),vec3(.16,.15,.14),.008),white,0.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.16,.15,.14),vec3(.27,.09,.26),.008),white,0.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.16,.15,.14),vec3(.013)),dark,0.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.27,.09,.26),vec3(.014)),silver,0.0,s);
  }
  if(uDetail>=2.0){
   for(int side=0;side<2;side++){
    float x=side==0?-1.0:1.0;
    // Three distinct heat-rejection panels per side and folded utility boxes.
    for(int panel=0;panel<3;panel++)selectSurface(boxHit(ro,rd,vec3(x*(.19+float(panel)*.075),-.058,-.17),vec3(.034,.005,.13)),white,22.0,s);
    selectSurface(boxHit(ro,rd,vec3(x*.44,.038,0),vec3(.026,.018,.029)),vec3(.55,.43,.21),0.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(x*.06,.045,-.17),vec3(x*.10,.125,-.17),.004),silver,0.0,s);
    selectSurface(ellipsoidHit(ro,rd,vec3(x*.10,.135,-.17),vec3(.031,.006,.031)),white,0.0,s);
   }
  }
 }else if(type<4.5){
  // Shuttle: nose-to-engine extent 1.72, span 1.10; 37.24 m x 23.79 m.
  // The cockpit is part of the raised forward cabin, not a bubble canopy.
  // Full cylindrical payload bay, tapering cheeks, then a blunt rounded nose.
  // The forebody closes its short nose cap at the 0.86 forward endpoint;
  // a separate overlapping cap produces an artificial muzzle in front view.
  selectSurface(capsuleHit(ro,rd,vec3(0,.008,-.54),vec3(0,.008,.29),.128),white,2.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.025,.460),vec3(.137,.115,.400)),white,2.0,s);
  selectSurface(shuttleCabinHit(ro,rd),white,12.0,s);
  selectSurface(boxHit(ro,rd,vec3(0,0,-.64),vec3(.14,.125,.08)),white,2.0,s);
  for(int side=0;side<2;side++){
   float x=side==0?-1.0:1.0;
   // Compound-delta planform: steep inner sweep, then the shallower outer edge.
   // Triangulate through the kink B to the rear root D. A-to-tip C would
   // bridge the concavity and erase the double-delta shape entirely.
   selectSurface(wingHit(ro-vec3(0,-.065,0),rd,vec2(.110*x,.42),vec2(.205*x,-.18),vec2(.10*x,-.67),.012),white,2.0,s);
   selectSurface(wingHit(ro-vec3(0,-.065,0),rd,vec2(.205*x,-.18),vec2(.55*x,-.55),vec2(.10*x,-.67),.012),white,2.0,s);
   // OV-101 aerodynamic aft fairings; no operational OMS/RCS is implied.
   selectSurface(ellipsoidHit(ro,rd,vec3(.142*x,.086,-.535),vec3(.065,.074,.195)),white,2.0,s);
   // Forward fuselage chine merges the broad underside into the tapered nose.
   selectSurface(wingHit(ro-vec3(0,-.050,0),rd,vec2(.115*x,.40),vec2(.043*x,.77),vec2(.118*x,.18),.012),white,2.0,s);
  }
  // Swept vertical stabilizer, clipped as a triangular prism in the yz plane.
  // Trapezoidal stabilizer with a clipped tip, broad root and swept leading edge.
  vec4 fin=wingHit(ro.yxz,rd.yxz,vec2(.055,-.69),vec2(.495,-.65),vec2(.515,-.49),.014);
  selectSurface(vec4(fin.yxz,fin.w),white,13.0,s);
  fin=wingHit(ro.yxz,rd.yxz,vec2(.055,-.69),vec2(.515,-.49),vec2(.10,-.22),.014);
  selectSurface(vec4(fin.yxz,fin.w),white,13.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.122,-.47),vec3(.034,.041,.23)),white,2.0,s);
  // Broad body flap below the engine cluster, with a light upper face.
  selectSurface(boxHit(ro,rd,vec3(0,-.109,-.68),vec3(.153,.013,.075)),dark,2.0,s);
  selectSurface(boxHit(ro,rd,vec3(0,-.094,-.68),vec3(.15,.002,.071)),white,2.0,s);
  // Three dummy main-engine bells, as on OV-101's tailcone-off ALT flights.
  // OV-101 was an atmospheric prototype: all space placement is hypothetical.
  for(int engine=0;engine<3;engine++){
   float angle=float(engine)*2.0*PI/3.0+.5*PI;
   vec3 center=vec3(cos(angle)*.083,sin(angle)*.083-.005,-.78);
   selectSurface(frustumHit(ro,rd,center,.08,.058,.033),silver,14.0,s);
   selectSurface(ellipsoidHit(ro,rd,center-vec3(0,0,.077),vec3(.049,.049,.003)),dark,0.0,s);
  }
  if(uDetail>=1.0){
   // Raised payload door hinge rails, nose chine and split elevon surfaces.
   for(int side=0;side<2;side++){
    float x=side==0?-1.0:1.0;
    selectSurface(capsuleHit(ro,rd,vec3(.083*x,.097,-.48),vec3(.083*x,.097,.29),.004),vec3(.58,.61,.60),0.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(.11*x,-.054,.32),vec3(.045*x,-.050,.77),.004),dark,0.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(.18*x,-.052,-.586),vec3(.48*x,-.052,-.562),.002),dark,0.0,s);
    // Simulated tile band over the leading edges, not glowing thrusters.
    selectSurface(capsuleHit(ro,rd,vec3(.112*x,-.065,.41),vec3(.205*x,-.065,-.18),.005),vec3(.10,.105,.11),0.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(.205*x,-.065,-.18),vec3(.547*x,-.065,-.55),.006),vec3(.10,.105,.11),0.0,s);
    // Twin pod nozzles and dark RCS ports distinguish the raised aft shoulders.
    selectSurface(frustumHit(ro,rd,vec3(.146*x,.089,-.734),.032,.026,.015),silver,14.0,s);
    selectSurface(ellipsoidHit(ro,rd,vec3(.146*x,.089,-.765),vec3(.022,.022,.002)),dark,0.0,s);
    for(int port=0;port<3;port++){
     selectSurface(ellipsoidHit(ro,rd,vec3(.204*x,.069,-.50-float(port)*.043),vec3(.003,.010,.012)),dark,0.0,s);
    }
    selectSurface(boxHit(ro,rd,vec3(.15*x,.012,-.727),vec3(.028,.045,.005)),vec3(.22,.24,.23),0.0,s);
   }
   selectSurface(capsuleHit(ro,rd,vec3(0,.49,-.610),vec3(0,.17,-.66),.002),dark,0.0,s);
  }
 }else if(type<5.5){
  // EMU-inspired articulated pressure suit. y extent [-.88,.84] = 1.72.
  selectSurface(boxHit(ro,rd,vec3(0,.08,-.175),vec3(.165,.25,.105)),white,10.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.02,0),vec3(.195,.29,.135)),white,10.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.205,.005),vec3(.225,.237,.155)),white,10.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(0,.37,0),vec3(0,.48,0),.105),white,10.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.451,0),vec3(.145,.027,.145)),silver,0.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.65,0),vec3(.202,.19,.188)),white,10.0,s);
  // Large convex, gold-coated visor; reflection changes with viewpoint.
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.659,.131),vec3(.177,.145,.089)),vec3(.065,.067,.058),0.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.662,.155),vec3(.163,.128,.077)),gold,5.0,s);
  // The white shell and lower locking rim protect the mirrored sun visor.
  selectSurface(boxHit(ro,rd,vec3(0,.105,.157),vec3(.112,.069,.028)),vec3(.55,.59,.58),15.0,s);
  // NASA chest patch sits proud of the suit to keep its full mark legible.
  selectSurface(boxHit(ro,rd,vec3(-.083,.284,.149),vec3(.061,.061,.014)),white,6.0,s);
  for(int side=0;side<2;side++){
   float x=side==0?-1.0:1.0;
   selectSurface(ellipsoidHit(ro,rd,vec3(.225*x,.27,0),vec3(.10,.115,.105)),white,10.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.24*x,.25,0),vec3(.34*x,.025,.015),.077),white,10.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.34*x,.025,.015),vec3(.39*x,-.16,.09),.069),white,10.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.397*x,-.245,.10),vec3(.070,.091,.059)),white,10.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.35*x,-.21,.13),vec3(.35*x,-.265,.15),.024),white,10.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.105*x,-.22,0),vec3(.135*x,-.50,.01),.088),white,10.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.135*x,-.51,.04),vec3(.095,.082,.10)),white,10.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.14*x,-.55,0),vec3(.17*x,-.74,.02),.078),white,10.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.17*x,-.806,.080),vec3(.101,.074,.162)),white,10.0,s);
   selectSurface(boxHit(ro,rd,vec3(.17*x,-.867,.080),vec3(.098,.013,.153)),vec3(.25,.27,.26),0.0,s);
  }
  if(uDetail>=1.0){
   // Helmet camera/light housings, service fittings and dark neck seal.
   selectSurface(ellipsoidHit(ro,rd,vec3(0,.472,0),vec3(.151,.013,.151)),vec3(.16,.18,.17),0.0,s);
   for(int side=0;side<2;side++){
    float x=side==0?-1.0:1.0;
    selectSurface(boxHit(ro,rd,vec3(.184*x,.724,.055),vec3(.029,.034,.045)),white,10.0,s);
    selectSurface(ellipsoidHit(ro,rd,vec3(.184*x,.724,.102),vec3(.020,.022,.007)),vec3(.16,.22,.25),3.0,s);
    selectSurface(ellipsoidHit(ro,rd,vec3(.194*x,.655,.041),vec3(.015,.029,.033)),silver,0.0,s);
    // Cuff rings, elbow articulation, glove fingers and boot reinforcement.
    selectSurface(ellipsoidHit(ro,rd,vec3(.381*x,-.158,.079),vec3(.072,.025,.067)),vec3(.45,.47,.44),0.0,s);
    selectSurface(ellipsoidHit(ro,rd,vec3(.34*x,.023,.021),vec3(.080,.039,.080)),white,24.0,s);
    for(int finger=0;finger<4;finger++){
     float fx=(.361+float(finger)*.023)*x;
     selectSurface(capsuleHit(ro,rd,vec3(fx,-.262,.129),vec3(fx,-.313,.134),.012),white,10.0,s);
    }
    selectSurface(capsuleHit(ro,rd,vec3(.21*x,-.18,.075),vec3(.14*x,-.31,.111),.009),vec3(.35,.37,.34),0.0,s);
   }
   // PLSS layers, oxygen/service connectors and short waist supply hose.
   selectSurface(boxHit(ro,rd,vec3(0,.075,-.287),vec3(.139,.213,.014)),vec3(.73,.76,.73),24.0,s);
   selectSurface(boxHit(ro,rd,vec3(0,-.18,-.185),vec3(.145,.045,.087)),white,10.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.115,-.12,.12),vec3(.18,-.16,.14),.013),silver,24.0,s);
   selectSurface(capsuleHit(ro,rd,vec3(.18,-.16,.14),vec3(.21,-.24,.07),.013),silver,24.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.115,-.12,.137),vec3(.023,.023,.012)),vec3(.18,.25,.29),0.0,s);
   // Waist restraint belt and rectangular fabric pockets break up the pressure shell.
   selectSurface(boxHit(ro,rd,vec3(0,-.115,.137),vec3(.147,.019,.012)),vec3(.61,.63,.59),24.0,s);
   selectSurface(boxHit(ro,rd,vec3(.116,-.397,.087),vec3(.052,.060,.016)),white,10.0,s);
   selectSurface(boxHit(ro,rd,vec3(-.116,-.397,.087),vec3(.052,.060,.016)),white,10.0,s);
  }
  if(uDetail>=2.0){
   // Flat sewn webbing, knee folds, oxygen bottle housings, and suit fittings.
   for(int side=0;side<2;side++){
    float x=side==0?-1.0:1.0;
    selectSurface(capsuleHit(ro,rd,vec3(.145*x,.30,-.213),vec3(.145*x,-.12,-.213),.014),vec3(.62,.65,.60),24.0,s);
    selectSurface(capsuleHit(ro,rd,vec3(.093*x,-.104,-.291),vec3(.093*x,.235,-.291),.043),vec3(.76,.78,.73),24.0,s);
    for(int fold=0;fold<3;fold++){
     float y=-.445-float(fold)*.034;
     selectSurface(ellipsoidHit(ro,rd,vec3(.135*x,y,.015),vec3(.093,.012,.087)),white,10.0,s);
    }
    selectSurface(boxHit(ro,rd,vec3(.181*x,-.758,.186),vec3(.067,.021,.013)),vec3(.54,.56,.52),24.0,s);
    selectSurface(ellipsoidHit(ro,rd,vec3(.079*x,.105,.190),vec3(.013,.014,.008)),vec3(.08,.10,.095),0.0,s);
   }
   selectSurface(boxHit(ro,rd,vec3(0,.168,-.342),vec3(.067,.058,.010)),white,10.0,s);
  }
 }else{
  // TOS studio-model silhouette. The longitudinal extent is exactly 1.84:
  // aft nacelle cap z=-.92 to the forward saucer rim z=.92.
  // Saucer diameter .83 / 1.84 matches the approximately 417 / 947 ft ratio.
  vec3 hull=vec3(.78,.80,.75);
  // A bevelled solid saucer, not a flattened ellipsoid. Its planar rim and
  // shallow conical upper/lower decks reproduce the original stepped profile.
  vec3 saucer=vec3(0,.057,.505);vec4 part;
  part=frustumHit(ro.xzy,rd.xzy,saucer.xzy,.017,.409,.415);
  selectSurface(vec4(part.xzy,part.w),hull,7.0,s);
  part=frustumHit(ro.xzy,rd.xzy,vec3(0,.505,.097),.023,.415,.195);
  selectSurface(vec4(part.xzy,part.w),hull,7.0,s);
  part=frustumHit(ro.xzy,rd.xzy,vec3(0,.505,.014),.026,.165,.409);
  selectSurface(vec4(part.xzy,part.w),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.113,.505),vec3(.198,.027,.198)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.012,.505),vec3(.167,.025,.167)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.036,.505),vec3(.064,.022,.064)),hull,17.0,s);
  // Bridge/B-C decks and the lower sensor/planetary dome.
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.142,.505),vec3(.086,.025,.084)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,.169,.505),vec3(.045,.020,.046)),hull,7.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.054,.505),vec3(.032,.013,.032)),vec3(.95,.84,.58),20.0,s);
  // The dorsal neck joins the forward engineering hull to the underside of
  // the saucer, just aft of its center. Its upper edge stays inside the saucer
  // rim; an aft-mounted neck made the silhouette look unlike the TOS ship.
  part=wingHit(ro.yxz,rd.yxz,vec2(-.135,.005),vec2(-.105,.175),vec2(.060,.455),.022);
  selectSurface(vec4(part.yxz,part.w),hull,19.0,s);
  part=wingHit(ro.yxz,rd.yxz,vec2(-.135,.005),vec2(.060,.455),vec2(.060,.195),.022);
  selectSurface(vec4(part.yxz,part.w),hull,19.0,s);
  // Tapered secondary hull: markedly shorter and farther forward than v4.
  selectSurface(frustumHit(ro,rd,vec3(0,-.17,-.075),.325,.044,.093),hull,16.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,.245),vec3(.093,.093,.037)),hull,16.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,-.40),vec3(.044,.044,.016)),hull,16.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,-.415),vec3(.032,.032,.004)),vec3(.23,.26,.25),18.0,s);
  // Nested copper deflector rings and central antenna, all separate geometry.
  selectSurface(frustumHit(ro,rd,vec3(0,-.17,.275),.019,.081,.072),vec3(.41,.34,.24),17.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,.299),vec3(.070,.070,.011)),vec3(.69,.46,.24),17.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.17,.309),vec3(.049,.049,.006)),vec3(.56,.34,.16),17.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(0,-.17,.312),vec3(0,-.17,.353),.007),vec3(.72,.51,.30),17.0,s);
  for(int side=0;side<2;side++){
   float x=side==0?-1.0:1.0;
   // Flat structural pylons: outboard in front view, nearly vertical in side.
   vec3 pr=ro-vec3(0,0,-.275);
   part=wingHit(pr.xzy,rd.xzy,vec2(.060*x,-.105),vec2(.092*x,-.175),vec2(.300*x,.092),.039);
   selectSurface(vec4(part.xzy,part.w),hull,19.0,s);
   part=wingHit(pr.xzy,rd.xzy,vec2(.060*x,-.105),vec2(.300*x,.092),vec2(.278*x,.151),.039);
   selectSurface(vec4(part.xzy,part.w),hull,19.0,s);
   // Long cylindrical nacelles lie just above the saucer, as in the TOS model.
   selectSurface(frustumHit(ro,rd,vec3(.292*x,.132,-.425),.435,.052,.058),hull,16.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.292*x,.132,-.860),vec3(.052,.052,.060)),vec3(.27,.30,.29),18.0,s);
   selectSurface(frustumHit(ro,rd,vec3(.292*x,.132,-.007),.018,.060,.060),vec3(.40,.40,.34),17.0,s);
   selectSurface(ellipsoidHit(ro,rd,vec3(.292*x,.132,.012),vec3(.056,.056,.058)),vec3(1.0,.27,.055),4.0,s);
   // Raised intercooler ridges and dark side grilles on the aft nacelles.
   selectSurface(boxHit(ro,rd,vec3(.292*x,.185,-.655),vec3(.023,.008,.145)),hull,16.0,s);
   selectSurface(boxHit(ro,rd,vec3(.347*x,.133,-.625),vec3(.004,.020,.142)),vec3(.20,.23,.23),18.0,s);
  }
 }
 return s;
}

// A small analytic decal atlas. Letters are a 5x7 bitmap encoded as row values;
// no image files, fonts, texture downloads, or bitwise GLSL extensions are used.
float nasaGlyph(vec2 p,float glyph){
 if(p.x<0.0||p.x>=1.0||p.y<0.0||p.y>=1.0)return 0.0;
 float row=floor((1.0-p.y)*7.0),bits;
 if(glyph<.5)bits=row<.5?17.0:row<2.5?25.0:row<3.5?21.0:row<5.5?19.0:17.0;
 else if(glyph<1.5)bits=row<.5?14.0:row<2.5?17.0:row<3.5?31.0:17.0;
 else bits=row<.5?15.0:row<2.5?16.0:row<3.5?14.0:row<5.5?1.0:30.0;
 float col=floor(p.x*5.0);return mod(floor(bits/exp2(4.0-col)),2.0);
}
float nasaLetters(vec2 p){
 float ink=0.0;
 for(int j=0;j<4;j++){
  float x=-.81+float(j)*.42;float glyph=j==0?0.0:j==2?2.0:1.0;
  ink=max(ink,nasaGlyph((p-vec2(x,-.255))/vec2(.36,.51),glyph));
 }
 return ink;
}
float line2(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));}
// Smooth, legible NASA lettering for the large Shuttle decals. The small suit
// patch retains its existing bitmap mark, so this does not affect other craft.
float shuttleNasaMark(vec2 p){
 float x=(p.x+.81)/.42,glyph=floor(x),u=fract(x);vec2 q=vec2(u,(p.y+.255)/.51);
 if(x<0.0||x>=4.0||q.y<-.15||q.y>1.15)return 0.0;
 float d=10.0;
 if(glyph<.5){d=min(line2(q,vec2(.10,0),vec2(.10,1)),min(line2(q,vec2(.10,1),vec2(.72,0)),line2(q,vec2(.72,0),vec2(.72,1))));}
 else if(glyph<1.5||glyph>2.5){d=min(line2(q,vec2(.07,0),vec2(.40,1)),min(line2(q,vec2(.40,1),vec2(.73,0)),line2(q,vec2(.20,.40),vec2(.60,.40))));}
 else{
  d=min(line2(q,vec2(.73,.93),vec2(.21,.98)),line2(q,vec2(.21,.98),vec2(.10,.79)));
  d=min(d,line2(q,vec2(.10,.79),vec2(.20,.56)));d=min(d,line2(q,vec2(.20,.56),vec2(.62,.45)));
  d=min(d,line2(q,vec2(.62,.45),vec2(.73,.24)));d=min(d,line2(q,vec2(.73,.24),vec2(.61,.03)));
  d=min(d,line2(q,vec2(.61,.03),vec2(.08,.08)));
 }
 return 1.0-smoothstep(.055,.080,d);
}
vec3 nasaPatch(vec2 p,vec3 under){
 float radius=length(p);if(radius>1.02)return under;
 vec3 color=mix(vec3(.012,.045,.24),vec3(.035,.14,.42),clamp(.5+.45*p.y,0.0,1.0));
 float orbit=abs(length(vec2(p.x+.35*p.y,p.y*1.75))-.69);
 color=mix(color,vec3(.94,.95,.95),(1.0-smoothstep(.012,.027,orbit))*.8);
 vec2 starCell=fract(p*vec2(9,8)+vec2(.17,.63))-.5;
 float stars=step(.79,hash(floor(p*vec2(9,8))))*(1.0-smoothstep(.025,.06,length(starCell)));
 color+=stars*.65;
 // White NASA lettering and the recognizable red vector/airfoil.
 color=mix(color,vec3(.98),nasaLetters(p));
 float swoosh=min(line2(p,vec2(-.93,-.59),vec2(.86,.61)),line2(p,vec2(.86,.61),vec2(.42,-.06)));
 color=mix(color,vec3(.91,.055,.065),1.0-smoothstep(.025,.052,swoosh));
 return mix(under,color,1.0-smoothstep(.985,1.02,radius));
}
float registryGlyph(vec2 p,float glyph){
 if(p.x<0.0||p.x>=1.0||p.y<0.0||p.y>=1.0)return 0.0;
 float row=floor((1.0-p.y)*7.0),bits;
 if(glyph<.5)bits=row<.5?17.0:row<2.5?25.0:row<3.5?21.0:row<5.5?19.0:17.0;
 else if(glyph<1.5)bits=row<.5||row>5.5?14.0:row<1.5||row>4.5?17.0:16.0;
 else if(glyph<2.5)bits=row<2.5||row>3.5?0.0:31.0;
 else if(glyph<3.5)bits=row<.5?4.0:row<1.5?12.0:row>5.5?14.0:4.0;
 else if(glyph<4.5)bits=row<.5?31.0:row<2.5?1.0:row<4.5?2.0:4.0;
 else bits=row<.5||row>5.5?14.0:17.0;
 return mod(floor(bits/exp2(4.0-floor(p.x*5.0))),2.0);
}
float registry(vec2 p){
 float ink=0.0;
 for(int j=0;j<8;j++){
  float glyph=j==0?0.0:j<3?1.0:j==3?2.0:j==4||j==7?3.0:j==5?4.0:5.0;
  ink=max(ink,registryGlyph(vec2(p.x*8.0-float(j),p.y),glyph));
 }
 return ink;
}
// Hull name uses the same tiny procedural bitmap construction as the registry.
float shipNameGlyph(vec2 p,float glyph){
 if(p.x<0.0||p.x>=1.0||p.y<0.0||p.y>=1.0)return 0.0;
 float row=floor((1.0-p.y)*7.0),bits=0.0;
 if(glyph<.5)bits=row>5.5?14.0:17.0; // U
 else if(glyph<1.5)bits=row<.5?15.0:row<2.5?16.0:row<3.5?14.0:row<5.5?1.0:30.0; // S
 else if(glyph<2.5)bits=row<.5||row>5.5?31.0:row>2.5&&row<3.5?30.0:16.0; // E
 else if(glyph<3.5)bits=row<.5?17.0:row<2.5?25.0:row<3.5?21.0:row<5.5?19.0:17.0; // N
 else if(glyph<4.5)bits=row<.5?31.0:4.0; // T
 else if(glyph<5.5)bits=row<.5||row>2.5&&row<3.5?30.0:row<2.5?17.0:row<4.5?20.0:row<5.5?18.0:17.0; // R
 else if(glyph<6.5)bits=row<.5||row>2.5&&row<3.5?30.0:row<2.5?17.0:16.0; // P
 else bits=row<.5||row>5.5?14.0:4.0; // I
 return mod(floor(bits/exp2(4.0-floor(p.x*5.0))),2.0);
}
float shipName(vec2 p){
 float ink=0.0;
 for(int j=0;j<14;j++){
  if(j==3)continue;
  float glyph=j==0?0.0:j==1||j==2||j==12?1.0:j==4||j==7||j==13?2.0:j==5?3.0:j==6?4.0:j==8||j==10?5.0:j==9?6.0:7.0;
  ink=max(ink,shipNameGlyph(vec2(p.x*14.0-float(j),p.y),glyph));
 }
 return ink;
}
vec3 shadeCraft(CraftSurface surface,vec3 hit,vec3 localDirection,vec3 light,vec3 reflectedSky){
 vec3 n=unit(surface.normal),view=unit(-localDirection),albedo=surface.albedo;
 float material=surface.material;
 if(material>9.5&&material<10.5&&uDetail>=1.0){
  // Cloth folds perturb shading only; the physical suit dimensions are fixed.
  float folds=sin(hit.y*95.0+2.0*sin(hit.x*34.0)+hit.z*17.0);
  float creases=sin(hit.y*172.0+4.0*sin(hit.x*27.0)+hit.z*44.0);
  vec3 tangent=vec3(0,1,0)-n*n.y;
  vec3 crossT=vec3(1,0,0)-n*n.x;
  float joint=exp(-pow((hit.y+.49)*17.0,2.0))+exp(-pow((hit.y-.025)*18.0,2.0));
  n=unit(n+tangent*(folds*.075+creases*.018)*(1.0+joint*.8)+crossT*sin(hit.z*75.0+hit.y*21.0)*.022);
 }
 float NdotL=max(0.0,dot(n,light)),NdotV=max(0.0,dot(n,view));
 float emission=0.0;
 float spec=pow(max(0.0,dot(n,unit(light+view))),48.0);
 float fresnel=pow(1.0-NdotV,5.0),rim=pow(1.0-NdotV,3.0);
 if(material>.5&&material<1.5){
  vec2 panelGrid=abs(fract(hit.xz*vec2(70,65)+.5)-.5);
  float line=1.0-smoothstep(.018,.045,min(panelGrid.x,panelGrid.y));
  float cell=hash(floor(hit.xz*vec2(70,65)));
  albedo*=.86+.23*cell;
  albedo=mix(albedo,vec3(.40,.29,.12),line*.7);spec*=1.5;
  if(n.y<0.0)albedo=mix(vec3(.28,.14,.045),vec3(.42,.29,.10),line);
 }
 if((material>1.5&&material<2.5)||(material>11.5&&material<12.5)){
  // Simulated thermal tiles, payload-bay seams and test-era red NASA lettering.
  // The black forebody rises smoothly out of the belly band. A hard z cutoff
  // creates a square black patch in profile and makes the nose look detached.
  float noseBand=-.078+.110*smoothstep(.36,.84,hit.z);
  bool blackNose=hit.z>.29&&hit.y<noseBand;
  if(hit.y<-.075||blackNose){
   vec2 cell=abs(fract(vec2(hit.z,hit.y+hit.x*.4)*vec2(80,105))-.5);
   float gap=step(.465,max(cell.x,cell.y));albedo=mix(vec3(.027,.032,.038),vec3(.065,.070,.075),gap*.55);
   spec*=.08;
  }else{
   float seam=(1.0-smoothstep(.001,.003,abs(hit.x)))*step(.095,hit.y)*step(-.42,hit.z)*step(hit.z,.3);
   albedo*=1.0-seam*.55;
   if(abs(n.x)>.43&&abs(hit.z-.04)<.15&&abs(hit.y-.040)<.036){
    float letters=shuttleNasaMark(vec2(-(hit.z-.04)*sign(n.x)/.18,(hit.y-.040)/.085));
    albedo=mix(albedo,vec3(.72,.035,.045),letters);
   }
   if(n.y>.5&&hit.x>.19&&hit.x<.49&&hit.z<-.29&&hit.z>-.57){
    float letters=shuttleNasaMark(vec2((hit.x-.34)/.17,(hit.z+.43)/.17));albedo=mix(albedo,vec3(.72,.035,.045),letters);
   }
   if(abs(n.x)>.70&&hit.z<-.16&&hit.z>-.29&&hit.y>-.005&&hit.y<.055){
    vec2 flag=vec2((-.16-hit.z)/.13,(hit.y+.005)/.06);
    albedo=mix(vec3(.87),vec3(.64,.06,.065),step(.5,fract(flag.y*6.5)));
    if(flag.x<.42&&flag.y>.46)albedo=vec3(.055,.085,.18);
   }
   // Fine nose blankets and flush access seams follow the curved skin.
   if(hit.z>.34&&hit.z<.79&&hit.y>.035){
    float blankets=1.0-smoothstep(.0006,.0013,min(abs(mod(hit.z,.052)-.026),abs(mod(hit.x,.039)-.0195)));
    albedo*=1.0-.065*blankets;
    vec2 access=vec2((abs(hit.x)-.066)/.017,(hit.z-.670)/.024);
    if(length(access)<1.0&&n.y>.45){float ring=1.0-smoothstep(.06,.10,abs(length(access)-.82));albedo*=1.0-ring*.40;}
   }
   if(uDetail>=2.0){
    float panels=1.0-smoothstep(.0007,.0014,min(abs(mod(hit.z+.45,.126)-.063),abs(abs(hit.x)-.079)));
    albedo*=1.0-panels*.16*step(.09,hit.y)*step(-.46,hit.z)*step(hit.z,.30);
   }
  }
 }
 if(material>11.5&&material<12.5){
  // Six dark cockpit windows: two forward, two angled corners and two sides.
  float ax=abs(hit.x);
  bool forward=n.z>.60&&n.y>.72&&abs(n.x)<.10&&hit.y>.104&&hit.y<.141&&ax>.005&&ax<.050;
  bool corner=abs(n.x)>.45&&abs(n.x)<.60&&n.z>.5&&hit.y>.100&&hit.y<.137&&ax>.056&&ax<.121;
  bool side=abs(n.x)>.60&&hit.y>.079&&hit.y<.130&&hit.z>.420&&hit.z<.515;
  if(n.y>.85&&hit.z>.333&&hit.z<.391&&abs(hit.x)>.020&&abs(hit.x)<.078){albedo=vec3(.017,.037,.047);spec*=2.0;}
  // Black frames surround glass panes; the center mullion stays visible.
  if(n.z>.5&&n.y>.5&&hit.y>.096&&hit.y<.149&&ax<.128)albedo=vec3(.027,.031,.034);
  if(forward||corner||side){albedo=vec3(.018,.039,.050)+reflectedSky*.17;spec*=2.5;}
 }
 if(material>12.5&&material<13.5){
  if(hit.y>.487)albedo*=.18;
  if(abs(n.x)>.4&&hit.y>.17&&hit.y<.41){float letters=shuttleNasaMark(vec2(-(hit.z+.50)*sign(n.x)/.12,(hit.y-.285)/.16));albedo=mix(albedo,vec3(.72,.035,.045),letters);}
 }
 if(material>4.5&&material<5.5){
  // Gold is a colored conductor. The convex visor reflects the actual sky
  // supplied by the scene, plus a broad neutral fill and a sharp highlight.
  vec3 conductor=vec3(1.0,.71,.25);
  float horizon=pow(max(0.0,1.0-abs(reflect(localDirection,n).y+.12)),18.0);
  vec3 reflection=reflectedSky*2.7+vec3(.025,.035,.055)+vec3(.62,.72,.88)*horizon;
  float broad=pow(max(0.0,dot(n,unit(light+view))),12.0);
  reflection+=vec3(.30,.40,.58)*broad;
  if(uDetail>=2.0)reflection*=.985+.015*sin(hit.y*650.0+hit.x*31.0);
  return conductor*(reflection*(.72+.28*fresnel)+vec3(.20,.13,.025)*NdotL)+vec3(1,.9,.63)*spec*2.0;
 }
 if(material>5.5&&material<6.5)albedo=nasaPatch(vec2((hit.x+.083)/.058,(hit.y-.284)/.058),albedo);
 if(material>6.5&&material<7.5){
  // Subtle plating, concentric deck rings, radial joints and curved registry.
  vec2 q=hit.xz-vec2(0,.505);float radial=length(q),angle=atan(q.x,q.y);
  float ringDistance=min(abs(radial-.393),min(abs(radial-.305),abs(radial-.215)));
  float ring=1.0-smoothstep(.0006,.0015,ringDistance);
  float spoke=(1.0-smoothstep(.0006,.0015,abs(sin(angle*18.0))*radial))*step(.14,radial);
  albedo*=1.0-ring*.12-spoke*.075;
  albedo*=.98+.035*hash(floor(vec2(angle*12.0,radial*60.0)));
  if(n.y>.25&&radial>.245&&radial<.296&&abs(angle)<.75){
   float letters=registry(vec2(.5+angle/1.5,(radial-.245)/.051));albedo=mix(albedo,vec3(.025,.031,.029),letters);
  }
  if(n.y>.25&&radial>.196&&radial<.219&&abs(angle)<.70){
   float letters=shipName(vec2(.5+angle/1.4,(radial-.196)/.023));albedo=mix(albedo,vec3(.035,.04,.037),letters);
  }
  if(n.y<-.25&&radial>.255&&radial<.297&&abs(angle)<.74){
   float letters=registry(vec2(.5-angle/1.48,(radial-.255)/.042));albedo=mix(albedo,vec3(.035,.04,.037),letters);
  }
  // Upper bridge windows and the characteristic rectangular rim ports.
  float windows=0.0;
  if(abs(n.y)<.45&&radial>.402&&hit.y>.047&&hit.y<.064)windows=step(.78,fract(angle*24.0));
  if(radial>.038&&radial<.08&&hit.y>.15)windows=max(windows,step(.82,fract(angle*11.0))*.6);
  albedo=mix(albedo,vec3(.90,.85,.62),windows);emission=.4*windows;
  // Paired red pennant arcs beneath the forward registry.
  float redArc=(1.0-smoothstep(.0015,.003,abs(radial-.327)))*step(.58,abs(angle))*step(abs(angle),1.02);
  albedo=mix(albedo,vec3(.43,.055,.035),redArc*.85);

 }
 if(material>9.5&&material<10.5){
  if(uDetail>=2.0){float weave=.018*sin(hit.x*720.0)*sin(hit.y*720.0);albedo*=1.0+weave;}
  float band=step(.316,abs(hit.y+.02))*step(abs(hit.y+.02),.346);
  if(abs(hit.x)>.09&&hit.y<0.0)albedo=mix(albedo,vec3(.56,.065,.055),band*.85);
  float seam=pow(.5+.5*sin(hit.y*145.0),14.0)*.035;albedo*=1.0-seam;
  if(hit.x<-.23&&hit.y>.095&&hit.y<.127)albedo=mix(albedo,vec3(.54,.055,.045),.8);
  if(hit.x>.24&&hit.x<.315&&hit.y>.12&&hit.y<.20&&hit.z>.045){
   vec2 flag=vec2((hit.x-.24)/.075,(hit.y-.12)/.08);
   albedo=mix(vec3(.82),vec3(.58,.055,.045),step(.5,fract(flag.y*6.5)));
   if(flag.x<.42&&flag.y>.46)albedo=vec3(.035,.065,.14);
  }
 }
 if(material>14.5&&material<15.5){
  vec2 q=hit.xy-vec2(0,.105);
  float knobs=min(length(q-vec2(-.065,.02)),min(length(q-vec2(0,.02)),length(q-vec2(.065,.02))));
  albedo=mix(albedo,vec3(.04,.07,.075),1.0-smoothstep(.013,.017,knobs));
  if(abs(q.x)<.078&&q.y>-.042&&q.y<-.020)albedo=vec3(.045,.10,.085);
  if(q.x>.057&&q.y>-.010&&q.y<.002)albedo=vec3(.78,.075,.045);
 }
 if(material>15.5&&material<16.5){
  bool nacelle=abs(hit.x)>.20;
  if(nacelle){
   // Long red pennant and registry on the cylindrical outer faces.
   float side=step(.65,abs(n.x)),stripe=1.0-smoothstep(.003,.006,abs(hit.y-.134));
   float stripeRange=step(-.76,hit.z)*step(hit.z,-.15);
   albedo=mix(albedo,vec3(.48,.035,.028),side*stripe*stripeRange);
   if(side>.5&&hit.y>.147&&hit.y<.169&&hit.z>-.47&&hit.z<-.22){float letters=registry(vec2((-.22-hit.z)/.25,(hit.y-.147)/.022));albedo=mix(albedo,vec3(.025,.035,.03),letters);}
   float band=min(abs(hit.z+.045),abs(hit.z+.83));albedo*=1.0-(1.0-smoothstep(.001,.003,band))*.45;
  }else{
   float rows=min(abs(hit.y+.150),abs(hit.y+.185));
   float window=step(.78,fract(hit.z*39.0))*step(.65,abs(n.x))*(1.0-smoothstep(.003,.005,rows));
   float lit=step(.52,hash(floor(hit.zy*vec2(39,190))));
   albedo=mix(albedo,mix(vec3(.045,.065,.06),vec3(.85,.78,.50),lit),window);emission=window*lit*.35;
   float stripe=(1.0-smoothstep(.002,.004,abs(hit.y+.166)))*step(-.05,hit.z)*step(hit.z,.22)*step(.65,abs(n.x));
   albedo=mix(albedo,vec3(.48,.04,.025),stripe);
  }
 }
 if(material>16.5&&material<17.5){
  float concentric=.5+.5*sin(length(hit.xy-vec2(0,-.17))*570.0);albedo*=.78+.22*concentric;
 }
 if(material>17.5&&material<18.5){albedo*=.65+.35*step(.4,fract(hit.z*140.0));}
 if(material>18.5&&material<19.5){
  float window=step(.72,fract(hit.z*53.0))*step(.69,fract(hit.y*59.0))*step(.8,abs(n.x));
  albedo=mix(albedo,vec3(.84,.81,.59),window*.8);emission=window*.25;
 }
 if(material>19.5&&material<20.5){emission=.8;}
 if(material>20.5&&material<21.5){
  // Multilayer-insulation seams and docking collars on pressure modules.
  float seam=1.0-smoothstep(.001,.003,abs(mod(hit.z+.03,.070)-.035));
  albedo*=1.0-.22*seam;
  if(uDetail>=2.0)albedo*=.96+.04*sin(hit.x*230.0+sin(hit.z*120.0));
 }
 if(material>21.5&&material<22.5){
  float fin=1.0-smoothstep(.001,.002,abs(mod(hit.z,.028)-.014));
  albedo*=1.0-.22*fin;spec*=.3;
 }
 if(material>22.5&&material<23.5){
  float spoke=1.0-smoothstep(.001,.003,abs(sin(atan(hit.x,hit.z-.17)*3.0))*length(hit.xz-vec2(0,.17)));
  albedo=mix(albedo+reflectedSky*.3,vec3(.65,.68,.66),spoke);spec*=2.0;
 }
 if(material>23.5&&material<24.5){
  float rib=.5+.5*sin(hit.y*270.0);albedo*=.78+.22*rib;
 }
 float roughness=material>9.5&&material<10.5?.07:.42;
 vec3 result=albedo*(.24+NdotL*.92)+vec3(.65,.74,.81)*spec*roughness+vec3(.07,.12,.16)*rim;
 if(material>3.5&&material<4.5){
  float blades=.5+.5*sin(atan(hit.y-.132,abs(hit.x)-.292)*12.0+hit.z*30.0);
  result+=albedo*(.7+.55*pow(blades,3.0));
 }
 result+=albedo*emission;
 if(material>2.5&&material<3.5)result+=reflectedSky*(.2+.5*fresnel);
 return result;
}
`;

// Keep the full model geometry for every selected craft, while omitting models
// that are absent from this scene before the driver parses or specializes GLSL.
// Bits: ISS=1, Shuttle=2, astronaut=4, Enterprise=8. Shared materials/primitives
// stay identical, and mask 15 is byte-for-byte the original complete source.
export function createCraftGLSL({mask=15}={}) {
 const selected=Number.isInteger(mask)?mask&15:15;
 if(selected===15)return CRAFT_GLSL;
 const headers=[
  '\n if(type<3.5){\n',
  '\n }else if(type<4.5){\n',
  '\n }else if(type<5.5){\n',
  '\n }else{\n  // TOS studio-model silhouette.'
 ];
 const start=CRAFT_GLSL.indexOf('CraftSurface craftHit(');
 const positions=headers.map(header=>CRAFT_GLSL.indexOf(header,start));
 const end=CRAFT_GLSL.indexOf('\n }\n return s;\n}',positions[3]);
 if(start<0||positions.some((position,i)=>position<start||(i>0&&position<=positions[i-1]))||end<0)throw new Error('Craft shader model boundaries changed');
 const tests=['type>2.5&&type<3.5','type>=3.5&&type<4.5','type>=4.5&&type<5.5','type>=5.5'];
 const branches=[];
 for(let i=0;i<4;i++){
  if(!(selected&(1<<i)))continue;
  // Only remove the branch delimiter. Keep every vertex, marking, dimension,
  // primitive call and material assignment in the selected model unchanged.
  const opening=CRAFT_GLSL.indexOf('{',positions[i])+1;
  const body=CRAFT_GLSL.slice(opening,i<3?positions[i+1]:end);
  branches.push(`\n ${branches.length?'else if':'if'}(${tests[i]}){${body}\n }`);
 }
 return CRAFT_GLSL.slice(0,positions[0])+branches.join('')+CRAFT_GLSL.slice(end+3);
}
