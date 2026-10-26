// Original procedural flight-deck study, with NASA's pilot/right-seat layout.
// +z forward, +y overhead, -x to the pilot's right (right = forward × up).
// Geometry shares the exterior
// shuttle frame and physical dimensions; instruments are illustrative.
export const SHUTTLE_COCKPIT_EYE = Object.freeze([-.046, .105, .445]);

// Inject after craft-glsl.js for NASA Shuttle variants. Clear window rays
// continue through the ordinary lensed scene; opaque panels return early.
export const COCKPIT_GLSL = `
vec3 cockpitInstrument(vec2 q,vec3 color){
 // Three 0.45 m display housings occupy the center rack. Small analog
 // instruments flank them in pilot/commander groups; no wall-sized dials.
 float cx=mod(q.x+.039,.026)-.013;
 if(abs(q.x)<.039&&abs(cx)<.0105&&q.y>-.011&&q.y<.015){
  vec2 uv=vec2(cx/.0105,(q.y-.002)/.013);
  float rim=step(.82,max(abs(uv.x),abs(uv.y)));
  color=mix(vec3(.008,.022,.017),vec3(.055,.063,.059),rim);
  float line=1.0-smoothstep(.022,.042,abs(uv.y));
  float ladder=(1.0-smoothstep(.018,.038,abs(mod(uv.y+.15,.30)-.15)))*step(abs(uv.x),.30);
  float ticks=(1.0-smoothstep(.018,.035,abs(mod(uv.x+.10,.30)-.15)))*step(abs(uv.y),.11);
  float rows=(1.0-smoothstep(.025,.055,abs(mod(uv.y+.07,.19)-.095)))*step(.51,abs(uv.x))*step(abs(uv.x),.70);
  color+=vec3(.22,.62,.34)*max(line*.5,max(ladder*.7,max(ticks,rows)))*(1.0-rim);
 }else if(abs(q.x)>.040&&abs(q.x)<.111&&q.y>-.022&&q.y<.036){
  vec2 dial=vec2(mod(abs(q.x)-.043,.022)-.011,mod(q.y+.023,.028)-.014);
  float radius=length(dial),angle=atan(dial.y,dial.x);
  if(radius<.0074){
   color=radius>.0065?vec3(.36,.38,.35):vec3(.016,.021,.021);
   if(radius<.0060&&abs(q.x)<.065&&q.y>.005)color=dial.y>0.0?vec3(.12,.27,.32):vec3(.29,.20,.12);
   float ticks=step(.65,cos(angle*20.0))*step(.0048,radius)*step(radius,.0061);
   float needleAngle=floor(abs(q.x)/.022)*.9+floor(q.y/.028)*.6;
   float needle=1.0-smoothstep(.00025,.00045,line2(dial,vec2(0),vec2(sin(needleAngle),cos(needleAngle))*.0048));
   color=mix(color,vec3(.84,.86,.77),max(ticks,needle));
  }
 }else{
  // A narrow bank of status lights and grouped square pushbuttons.
  vec2 cell=abs(fract(q*vec2(180,245))-.5);
  if(q.y>.023&&abs(q.x)<.038&&max(cell.x,cell.y)<.29)color=cell.x>.21||cell.y>.21?vec3(.34,.36,.31):vec3(.12,.22,.15);
  if(q.y<-.020&&q.y>-.035&&cell.x<.12&&cell.y<.22)color=vec3(.58,.60,.53);
 }
 // Restrained seams/identification lines keep grouped equipment readable.
 float label=step(.018,q.y)*step(q.y,.0195)*step(abs(q.x),.037);
 return mix(color,vec3(.70,.72,.65),label*.7);
}
vec3 cockpitSwitches(vec2 q,vec3 color){
 // Toggle rows are grouped into real panel-sized rectangles with engraved
 // legends, fastener heads and occasional guarded amber annunciators.
 vec2 panel=fract(q*vec2(24,18)),cell=fract(q*vec2(175,235))-.5;
 float group=hash(floor(q*vec2(24,18)));color*=.88+.18*group;
 // Different panel families interrupt the repetition: toggle banks, round
 // rotary selectors and guarded breaker strips with blank label margins.
 float panelActive=step(.12,panel.x)*step(panel.x,.93)*step(.13,panel.y)*step(panel.y,.89);
 float edge=step(.96,max(panel.x,panel.y));color*=1.0-.45*edge;
 float screw=1.0-smoothstep(.015,.035,length(panel-vec2(.08)));
 color=mix(color,vec3(.62,.64,.59),screw);
 float slot=(1.0-smoothstep(.08,.13,abs(cell.x)))*step(abs(cell.y),.22);
 float stalk=(1.0-smoothstep(.045,.085,abs(cell.x)))*step(abs(cell.y-.11),.19);
 if(group<.30){slot=1.0-smoothstep(.17,.21,length(cell));stalk=(1.0-smoothstep(.035,.07,abs(cell.x-cell.y*.35)))*step(length(cell),.15);}
 if(group>.76){slot=step(abs(cell.x),.19)*step(abs(cell.y),.20);stalk=step(abs(cell.x),.11)*step(abs(cell.y-.05),.10);}
 color=mix(color,vec3(.025,.031,.030),slot*panelActive);color=mix(color,vec3(.68,.70,.64),stalk*panelActive);
 float legends=step(.34,cell.y)*step(cell.y,.42)*step(abs(cell.x),.28);
 color=mix(color,vec3(.66,.67,.60),legends*.7*panelActive);
 float header=step(.04,panel.y)*step(panel.y,.065)*step(.15,panel.x)*step(panel.x,.58);
 color=mix(color,vec3(.70,.72,.66),header*.7);
 if(panel.x>.73&&panel.x<.86&&panel.y>.77&&panel.y<.85)color=vec3(.58,.31,.07);
 return color;
}
vec4 shuttleCockpit(vec3 localEye,vec3 localRay,vec3 environment){
 vec3 ro=localEye,rd=unit(localRay);
 CraftSurface s;s.t=1000.0;s.normal=vec3(0);s.albedo=vec3(.30,.32,.29);s.material=30.0;
 vec4 enclosure=boxHit(ro,rd,vec3(0,.054,.460),vec3(.127,.091,.150));
 selectSurface(enclosure,vec3(.31,.33,.30),30.0,s);
 // Same sloped center and wraparound windscreen planes as the outer hull,
 // inset by the shell thickness. Six panes, not a flat bus windscreen.
 for(int facet=0;facet<3;facet++){
  vec3 n=facet==0?vec3(0,1,.8):vec3(facet==1?.70:-.70,.85,.80);
  float offset=facet==0?.580:.611,den=dot(n,rd);
  float t=(offset-dot(n,ro))/den;
  if(den>.000001&&t>=0.0&&t<s.t)selectSurface(vec4(unit(n),t),vec3(.22,.24,.22),30.0,s);
 }
 vec3 wall=ro+rd*s.t;vec3 wn=s.normal;float ax=abs(wall.x);
 bool window=false;
 if(wn.z>.5&&wn.y>.5){
  bool forward=abs(wn.x)<.1&&wall.y>.091&&wall.y<.141&&ax>.0045&&ax<.052;
  bool corner=abs(wn.x)>.45&&wall.y>.088&&wall.y<.136&&ax>.057&&ax<.121;
  window=forward||corner;
 }
 if(abs(wn.x)>.8)window=wall.z>.421&&wall.z<.515&&wall.y>.081&&wall.y<.131;
 if(wn.y>.9)window=wall.z>.333&&wall.z<.391&&ax>.020&&ax<.078;
 if(wn.z<-.8)window=wall.y>.073&&wall.y<.132&&ax>.013&&ax<.090;
 if(window){s.t=1000.0;s.material=-1.0;}
 // Canted forward instrument rack with its padded anti-glare coaming.
 vec3 pr=ro-vec3(0,.039,.571);vec3 pd=rd;
 pr.yz=mat2(.984,.179,-.179,.984)*pr.yz;pd.yz=mat2(.984,.179,-.179,.984)*pd.yz;
 vec4 panel=boxHit(pr,pd,vec3(0),vec3(.118,.043,.017));panel.yz=mat2(.984,-.179,.179,.984)*panel.yz;
 selectSurface(panel,vec3(.24,.26,.23),31.0,s);
 selectSurface(boxHit(ro,rd,vec3(0,.085,.568),vec3(.121,.004,.024)),vec3(.045,.051,.046),30.0,s);
 selectSurface(boxHit(ro,rd,vec3(0,.013,.485),vec3(.019,.025,.073)),vec3(.25,.27,.24),34.0,s);
 // Overhead switch strip, aft instrument rack and the two side consoles.
 selectSurface(boxHit(ro,rd,vec3(0,.140,.502),vec3(.119,.005,.054)),vec3(.28,.30,.27),34.0,s);
 selectSurface(boxHit(ro,rd,vec3(0,.043,.320),vec3(.118,.066,.010)),vec3(.27,.29,.26),34.0,s);
 for(int side=0;side<2;side++){
  float x=side==0?-1.0:1.0;
  selectSurface(boxHit(ro,rd,vec3(.110*x,.031,.459),vec3(.015,.024,.089)),vec3(.25,.27,.24),34.0,s);
  selectSurface(boxHit(ro,rd,vec3(.046*x,.066,.414),vec3(.024,.033,.012)),vec3(.27,.29,.25),32.0,s);
  selectSurface(boxHit(ro,rd,vec3(.046*x,.106,.414),vec3(.019,.014,.012)),vec3(.25,.27,.23),32.0,s);
  selectSurface(boxHit(ro,rd,vec3(.046*x,.034,.447),vec3(.025,.009,.030)),vec3(.24,.26,.22),32.0,s);
  // Rotational hand controllers, boots and shorter pedestal housings.
  selectSurface(boxHit(ro,rd,vec3(.046*x,.032,.523),vec3(.008,.012,.010)),vec3(.13,.15,.13),30.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(.046*x,.044,.523),vec3(.046*x,.060,.516),.0028),vec3(.075,.08,.07),30.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(.046*x,.063,.515),vec3(.006,.008,.004)),vec3(.065,.07,.06),30.0,s);
 }
 if(s.material<0.0)return vec4(environment,0);
 vec3 p=ro+rd*s.t,color=s.albedo;
 if(s.material>30.5&&s.material<31.5){
  vec3 q=p-vec3(0,.039,.571);q.yz=mat2(.984,.179,-.179,.984)*q.yz;
  if(q.z<-.016)color=cockpitInstrument(q.xy,color);
 }
 if(s.material>33.5){vec2 q=abs(s.normal.y)>.5?p.xz:abs(s.normal.x)>.5?p.zy:p.xy;color=cockpitSwitches(q,color);}
 if(s.material>31.5&&s.material<32.5){
  float seam=1.0-smoothstep(.0006,.0012,abs(mod(p.y,.014)-.007));color*=1.0-.19*seam;
  if(abs(mod(p.x+.046,.092)-.046)<.004)color*=.47;
 }
 float illumination=.66+.34*abs(dot(s.normal,unit(vec3(.3,.7,.5))));color*=illumination;
 if(s.material==30.0&&p.y<0.0)color*=.40;
 return vec4(color,1.0);
}
`;
