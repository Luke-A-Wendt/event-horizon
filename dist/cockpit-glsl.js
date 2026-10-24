// Original procedural flight-deck study. Coordinates share the exterior NASA
// Shuttle's physical model frame: +z forward, +y overhead, x across the cabin.
// Its instruments illustrate the layout; this is not a certified flight deck.
export const SHUTTLE_COCKPIT_EYE = Object.freeze([-.045, .075, .48]);

// Inject after craft-glsl.js only for variants containing the NASA Shuttle.
// Window rays return alpha zero and continue into the ordinary lensed world.
// Opaque cabin rays can return before the expensive metric ray integration.
export const COCKPIT_GLSL = `
vec4 shuttleCockpit(vec3 localEye,vec3 localRay,vec3 environment){
 vec3 ro=localEye,rd=unit(localRay);
 CraftSurface s;s.t=1000.0;s.normal=vec3(0);s.albedo=vec3(.26,.28,.27);s.material=30.0;
 // A bounded interior in the raised cabin, not a camera floating above its hull.
 vec4 enclosure=boxHit(ro,rd,vec3(0,.039,.4675),vec3(.112,.094,.1525));
 selectSurface(enclosure,vec3(.28,.30,.28),30.0,s);
 // Sloping forward windscreen. The center and two outer mullions divide the
 // forward view; clear panes transmit the scene's actual gravitational lensing.
 vec3 windNormal=unit(vec3(0,.5,1));
 float den=dot(windNormal,rd),windT=(.66/sqrt(1.25)-dot(windNormal,ro))/den;
 if(den>.000001&&windT>=0.0&&windT<s.t)selectSurface(vec4(windNormal,windT),vec3(.15,.17,.17),30.0,s);
 vec3 wall=ro+rd*s.t;vec3 wn=s.normal;
 bool window=false;
 if(wn.z>.7){
  bool forward=wall.y>.030&&wall.y<.124&&abs(wall.x)<.104;
  float mullion=min(abs(wall.x),abs(abs(wall.x)-.062));
  window=forward&&mullion>.0032;
 }
 if(abs(wn.x)>.8)window=wall.z>.455&&wall.z<.589&&wall.y>.048&&wall.y<.122&&abs(wall.z-.522)>.003;
 if(wn.y>.9)window=wall.z>.40&&wall.z<.48&&abs(wall.x)>.012&&abs(wall.x)<.087;
 // Two aft-facing flight-deck windows. Looking back still shows seat backs,
 // the aft console and the frame around the real outside view.
 if(wn.z<-.8)window=wall.y>.058&&wall.y<.117&&abs(wall.x)>.009&&abs(wall.x)<.081;
 if(window){s.t=1000.0;s.material=-1.0;}
 // Glare shield, forward instrument panel and center console.
 selectSurface(boxHit(ro,rd,vec3(0,.014,.589),vec3(.106,.035,.023)),vec3(.16,.18,.18),31.0,s);
 selectSurface(boxHit(ro,rd,vec3(0,.051,.589),vec3(.109,.004,.018)),vec3(.055,.063,.063),30.0,s);
 selectSurface(boxHit(ro,rd,vec3(0,-.024,.501),vec3(.018,.028,.074)),vec3(.18,.20,.19),34.0,s);
 // Side and aft consoles give the cockpit a complete local 360-degree frame.
 for(int side=0;side<2;side++){
  float x=side==0?-1.0:1.0;
  selectSurface(boxHit(ro,rd,vec3(.096*x,-.005,.468),vec3(.015,.029,.094)),vec3(.20,.22,.21),34.0,s);
  selectSurface(boxHit(ro,rd,vec3(.046*x,.010,.417),vec3(.027,.053,.012)),vec3(.21,.24,.22),32.0,s);
  selectSurface(boxHit(ro,rd,vec3(.046*x,.068,.412),vec3(.022,.021,.014)),vec3(.18,.20,.18),32.0,s);
  selectSurface(boxHit(ro,rd,vec3(.046*x,-.035,.448),vec3(.028,.012,.036)),vec3(.18,.20,.18),32.0,s);
  selectSurface(capsuleHit(ro,rd,vec3(.046*x,-.015,.533),vec3(.046*x,.019,.525),.0035),vec3(.055,.06,.055),30.0,s);
  selectSurface(ellipsoidHit(ro,rd,vec3(.046*x,.021,.524),vec3(.007,.009,.004)),vec3(.075,.08,.075),30.0,s);
 }
 selectSurface(boxHit(ro,rd,vec3(0,.005,.326),vec3(.104,.043,.009)),vec3(.24,.26,.24),34.0,s);
 if(s.material<0.0)return vec4(environment,0);
 vec3 p=ro+rd*s.t,color=s.albedo;
 if(s.material>30.5&&s.material<31.5){
  // Three green-phosphor CRTs, analog dial rings and individual annunciators.
  vec2 q=p.xy;float crtX=mod(q.x+.093,.062)-.031;
  bool face=p.z<.57;
  if(face&&abs(crtX)<.023&&q.y>-.006&&q.y<.030){
   vec2 uv=vec2(crtX/.023,(q.y-.012)/.018);
   float border=step(.85,max(abs(uv.x),abs(uv.y)));
   color=mix(vec3(.007,.040,.025),vec3(.045,.055,.045),border);
   float horizon=1.0-smoothstep(.025,.045,abs(uv.y));
   float ticks=(1.0-smoothstep(.02,.04,abs(mod(uv.x+.10,.30)-.15)))*step(abs(uv.y),.12);
   float rows=(1.0-smoothstep(.02,.06,abs(mod(uv.y+.1,.24)-.12)))*step(.64,abs(uv.x));
   float ladder=(1.0-smoothstep(.02,.04,abs(mod(uv.y+.15,.3)-.15)))*step(abs(uv.x),.34);
   color+=vec3(.19,.70,.33)*max(horizon*.5,max(ticks,max(rows,ladder*.6)))*(1.0-border);
  }else if(face){
   vec2 cell=vec2(mod(q.x+.105,.021)-.0105,q.y-.039);
   float radius=length(cell),ring=1.0-smoothstep(.0006,.0011,abs(radius-.0055));
   color=mix(color,vec3(.62,.64,.57),ring);
   if(radius<.0049){
    color=vec3(.025,.03,.027);
    float needle=1.0-smoothstep(.0004,.0008,line2(cell,vec2(0),vec2(.002,.003)));
    color+=vec3(.76,.80,.69)*needle;
   }
  }
 }
 if(s.material>33.5){
  vec2 q=abs(s.normal.y)>.5?p.xz:p.xy;
  vec2 cells=fract(q*vec2(170,230))-.5;
  float toggle=1.0-smoothstep(.08,.14,length(cells*vec2(1,1.8)));
  float group=step(.2,fract(q.x*38.0));
  color=mix(color,vec3(.74,.76,.67),toggle*group);
  vec2 leds=abs(fract(q*vec2(81,92))-.5);
  if(max(leds.x,leds.y)<.09)color=vec3(.42,.24,.055);
  vec2 panel=abs(fract(q*vec2(30,24))-.5);
  float seam=step(.478,max(panel.x,panel.y));color*=1.0-seam*.40;
  // Short off-white engraved legends beneath grouped toggle switches.
  float legends=step(.36,cells.y)*step(cells.y,.43)*step(abs(cells.x),.29);
  color=mix(color,vec3(.49,.51,.45),legends);
 }
 if(s.material>31.5&&s.material<32.5){
  float seam=1.0-smoothstep(.0008,.0015,abs(mod(p.y,.018)-.009));
  color*=1.0-.15*seam;
  // A restrained harness strip reads as fabric instead of a shiny seat.
  if(abs(mod(p.x+.046,.092)-.046)<.005)color*=.45;
 }
 // Soft cabin fill keeps controls readable even against an unlit starfield.
 float illumination=.68+.32*abs(dot(s.normal,unit(vec3(.3,.7,.5))));
 color*=illumination;
 if(s.material==30.0){
  // Fine, static panel seams and flush screws around the window structure.
  vec2 q=abs(s.normal.x)>.8?p.zy:abs(s.normal.y)>.8?p.xz:p.xy;
  vec2 panel=abs(fract(q*vec2(28,31))-.5);
  float screw=1.0-smoothstep(.008,.018,length(panel-vec2(.42)));
  color=mix(color,vec3(.13,.15,.14),screw*.35);
 }
 if(s.material==30.0&&abs(s.normal.y)>.8&&p.y<0.0)color*=.42;
 return vec4(color,1.0);
}
`;
