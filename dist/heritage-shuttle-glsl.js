// Original atmospheric Shuttle retained as an independently placeable model.
export const HERITAGE_SHUTTLE_GEOMETRY = `
  // Shuttle: nose-to-engine extent 1.72, span 1.10; 37.24 m x 23.79 m.
  // The cockpit is part of the raised forward cabin, not a bubble canopy.
  // Full cylindrical payload bay, tapering cheeks, then a blunt rounded nose.
  // The forebody closes its short nose cap at the 0.86 forward endpoint;
  // a separate overlapping cap produces an artificial muzzle in front view.
  selectSurface(capsuleHit(ro,rd,vec3(0,.008,-.54),vec3(0,.008,.29),.128),white,2.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(0,-.025,.460),vec3(.137,.115,.400)),white,2.0,s);
  selectSurface(shuttleCabinHit(ro,rd),white,12.0,s);
  selectSurface(shuttleAftHit(ro,rd),white,2.0,s);
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
  // Three dummy main-engine bells, as on OV-101's tailcone-off ALT flights.
  // OV-101 was an atmospheric prototype: all space placement is hypothetical.
  for(int engine=0;engine<3;engine++){
   float angle=float(engine)*2.0*PI/3.0+.5*PI;
   vec3 center=vec3(cos(angle)*.083,sin(angle)*.083-.005,-.78);
   selectSurface(frustumHit(ro,rd,center,.08,.058,.033),silver,14.0,s);
   selectSurface(ellipsoidHit(ro,rd,center-vec3(0,0,.077),vec3(.049,.049,.003)),dark,0.0,s);
  }
  if(detail>=1.0){
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
    // Flush pod fairing ends; avoid exposed rectangular aft equipment blocks.
   }
   selectSurface(capsuleHit(ro,rd,vec3(0,.49,-.610),vec3(0,.17,-.66),.002),dark,0.0,s);
  }
`;
