import {JANUS_RADIUS,JANUS_DASH,JANUS_SEAT_X,JANUS_WINDOW,JANUS_PORT,JANUS_SEAT_PARTS,JANUS_COLORS} from './janus-hull.js';
const DASH=JANUS_DASH, WIN=JANUS_WINDOW, PORT=JANUS_PORT;

const num=v=>Number.isInteger(v)?v.toFixed(1):String(v),vec=a=>'vec3('+a.map(num).join(',')+')';
const rgb=hex=>vec([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
// Positive alpha is an actual interior surface. The clear part of the
// curved bow pane returns zero, so onboard rays see the live optical scene.
export const JANUS_HELPERS=`
float janusRect(vec2 p,vec2 halfSize,float fillet){
 vec2 q=abs(p)-halfSize+fillet;return length(max(q,vec2(0)))+min(max(q.x,q.y),0.0)-fillet;
}
float janusWindow(vec3 p){return janusRect(vec2(p.x,p.y-${WIN.y}),vec2(${WIN.halfWidth},${WIN.halfHeight}),${WIN.corner});}
vec4 janusCabin(vec3 ro,vec3 rd){
 vec4 wall=ellipsoidHit(ro,rd,vec3(0),vec3(${JANUS_RADIUS}));if(wall.w<0.)return vec4(0);
 vec3 p=ro+rd*wall.w;float pane=janusWindow(p);
 CraftSurface cabin;cabin.t=wall.w;cabin.normal=-wall.xyz;cabin.material=0.0;cabin.detail=0.0;cabin.albedo=${rgb(JANUS_COLORS.janusWall)};
 bool openPane=p.z>0.&&pane<0.;
 if(p.z>0.&&pane<.020)cabin.albedo=${rgb(JANUS_COLORS.janusDark)};
 if(abs(p.y-.367)<.012&&p.z<.32)cabin.albedo=${rgb(JANUS_COLORS.janusLight)};
 if(p.y<-.03&&p.z<.39){float a=atan(p.x,p.z);cabin.albedo*=.80+.20*smoothstep(.012,.032,abs(sin(4.*a)));}
 if(rd.y<-.0001){
  float floorT=(-.406-ro.y)/rd.y;
  selectSurface(vec4(0,1,0,floorT),${rgb(JANUS_COLORS.janusFloor)},0.,cabin);
 }
 for(int seat=0;seat<2;seat++){
  float x=seat==0?-${JANUS_SEAT_X}:${JANUS_SEAT_X};
  vec3 o=ro-vec3(x,0,0);
  selectSurface(boxHit(o,rd,vec3(0,-.213,.447),vec3(.041,.216,.039)),${rgb(JANUS_COLORS.janusFrame)},0.,cabin);
  ${JANUS_SEAT_PARTS.map(part=>'selectSurface('+ (part.kind==='box'?'boxHit':'ellipsoidHit')+'(o,rd,'+vec(part.center)+','+vec(part.half)+'),'+rgb(JANUS_COLORS[part.material])+','+(part.material==='janusSeat'?'1.0':'0.0')+',cabin);').join('\n  ')}
 }
 if(cabin.material>.5){
  vec3 h=ro+rd*cabin.t;float x=abs(h.x)-${JANUS_SEAT_X};
  if(h.z>-.174&&h.z<-.102&&h.y>-.099&&abs(abs(x)-(.041+.14*h.y))<.011)cabin.albedo=${rgb(JANUS_COLORS.janusHarness)};
  else if(h.y>-.08&&h.y<.155&&h.z>-.134&&abs(x)<.084)cabin.albedo*=.83+.17*smoothstep(.0007,.003,abs(mod(h.y,.038)-.019));
 }
 vec3 q=ro-${vec(DASH.center)};
 vec3 o=vec3(q.x,dot(q.yz,vec2(${DASH.cos},${DASH.sin})),dot(q.yz,vec2(-${DASH.sin},${DASH.cos})));
 vec3 d=vec3(rd.x,dot(rd.yz,vec2(${DASH.cos},${DASH.sin})),dot(rd.yz,vec2(-${DASH.sin},${DASH.cos})));
 vec4 dash=boxHit(o,d,vec3(0),${vec(DASH.half)});
 if(dash.w>=0.&&dash.w<cabin.t){
  vec3 h=o+d*dash.w;vec3 c=${rgb(JANUS_COLORS.janusDark)};
  if(dash.z<-.5){
   vec2 display=vec2(h.x-sign(h.x)*.205,h.y-.019);
   if(janusRect(display,vec2(.123,.060),.009)<0.)c=${rgb(JANUS_COLORS.janusRim)};
   if(janusRect(display,vec2(.117,.054),.008)<0.){
    c=${rgb(JANUS_COLORS.janusScreen)};vec2 plot=display+vec2(.020,0);
    if(abs(plot.x)<.085&&abs(plot.y)<.043){
     vec2 grid=abs(mod(plot+.010,.020)-.010);if(min(grid.x,grid.y)<.0005)c=${rgb(JANUS_COLORS.janusTick)}*.70;
     if(h.x<0.){
      float radius=length(plot);
      if(abs(radius-.035)<.0013||abs(plot.y+.003)<.0012&&abs(plot.x)<.054||abs(radius-.029)<.004&&abs(sin(atan(plot.y,plot.x)*6.))<.08)c=${rgb(JANUS_COLORS.janusReadout)};
      if(abs(abs(plot.x)-.010)<.009&&abs(plot.y+.001+.22*abs(plot.x))<.0018)c=${rgb(JANUS_COLORS.janusAmber)};
     }else if(abs(plot.y-.012*sin(plot.x*41.)-.005*cos(plot.x*84.))<.0018)c=${rgb(JANUS_COLORS.janusReadout)};
    }
    if(display.x>.076&&display.x<.106&&abs(display.y)<.042){
     float row=floor((display.y+.043)/.014);if(fract((display.y+.043)/.014)<.35&&display.x<.084+.020*fract(.37*row+.13))c=${rgb(JANUS_COLORS.janusReadout)};
    }
   }
   if(abs(h.y+.070)<.009&&abs(abs(h.x)-.204)<.11&&fract((abs(h.x)-.075)*31.)<.57)c=abs(h.x)<.16?${rgb(JANUS_COLORS.janusAmber)}:${rgb(JANUS_COLORS.janusRim)};
  }else if(dash.z>.5){
   if(abs(abs(h.x)-.21)<.14&&abs(h.y+.014)<.036)c=fract(h.y*98.)<.33?${rgb(JANUS_COLORS.janusFrame)}:${rgb(JANUS_COLORS.janusDark)};
   if(abs(h.y-.069)<.003&&abs(h.x)<.392)c=${rgb(JANUS_COLORS.janusRim)};
  }
  return vec4(c*(.82+.18*abs(dash.y)),1.);
 }
 if(openPane&&cabin.t>=wall.w)return vec4(0);
 return vec4(cabin.albedo*(.59+.41*max(0.,dot(cabin.normal,normalize(vec3(-.35,.65,.61))))),1.);
}
`;
export const JANUS_GEOMETRY=`
  vec4 shell=ellipsoidHit(ro,rd,vec3(0),vec3(${JANUS_RADIUS}));
  if(shell.w>=0.){
   vec3 p=ro+rd*shell.w;
   if(p.z>0.&&janusWindow(p)<0.){
    vec4 cabin=janusCabin(p+rd*.0005,rd);selectSurface(shell,cabin.rgb,71.0,s);
   }else selectSurface(shell,vec3(.89,.90,.875),70.0,s);
  }
  for(int leg=0;leg<3;leg++){
   float a=float(leg)*2.0943951;vec3 radial=vec3(sin(a),0,cos(a)),foot=radial*.387+vec3(0,-.843,0);
   selectSurface(capsuleHit(ro,rd,radial*.357+vec3(0,-.690,0),foot,.021),vec3(.33,.37,.375),0.0,s);
   selectSurface(capsuleHit(ro,rd,radial*.454+vec3(0,-.636,0),foot+vec3(0,.012,0),.010),vec3(.20,.25,.265),0.0,s);
   selectSurface(ellipsoidHit(ro,rd,foot,vec3(.068,.018,.056)),vec3(.29,.33,.34),0.0,s);
  }`;
export const JANUS_FINISH=`
 if(material>69.5&&material<70.5){
  vec3 surface=normalize(hit);
  albedo=mix(vec3(.75,.80,.80),vec3(.95,.95,.90),.42+.22*surface.y);
  float w=janusWindow(hit);
  if(hit.z>0.0&&w<.014)albedo=w<.007?vec3(.056,.085,.085):vec3(.42,.48,.47);
  if(hit.z>.32&&abs(hit.x)<.19&&hit.y<-.075)albedo=mix(albedo,vec3(.57,.078,.055),shuttleNasaMark(vec2(hit.x/.18,(hit.y+.167)/.128)));
  float port=min(length(vec2(abs(hit.x)-${PORT.across},abs(hit.y)-${PORT.height})),length(vec2(abs(hit.z)-${PORT.across},abs(hit.y)-${PORT.height})));
  if(port<${PORT.outer})albedo=port<${PORT.inner}?vec3(.012,.022,.026):vec3(.32,.38,.38);
 }
 if(material>70.5&&material<71.5){
  float grazing=pow(1.-max(.0,dot(n,view)),3.0);
  return albedo+reflectedSky*(.022+.20*grazing)+vec3(.66,.77,.79)*spec*.30;
 }
`;
