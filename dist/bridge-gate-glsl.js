import {GATE_VERTICES,GATE_RAIL_SCALE,GATE_NODE_SCALE} from './bridge-gate-layout.js';
// Fold into a mirror half-sector about the flight axis. The nearest skeleton
// feature then belongs to one of these five segments, including the staggered
// pentagon at the far end; all endpoints come from the shared regular solid.
const v=i=>'vec3('+GATE_VERTICES[i].map(x=>x.toFixed(8)).join(',')+')';
const gateRepresentatives=[[0,1],[0,5],[5,10],[10,15],[19,15]];
const banks=gateRepresentatives.map(([i,j])=>'gateNearest(q,'+v(i)+','+v(j)+',best,A,B);').join('\n ');
const covers=[[0,1],[7,12],[14,19]].map(([a,b])=>'gateCover(h,p,'+v(a)+','+v(b)+');').join('\n ');
export const BRIDGE_GATE_GLSL=`
const float railScale=${GATE_RAIL_SCALE.toFixed(4)},nodeScale=${GATE_NODE_SCALE.toFixed(4)};
void gateNearest(vec3 p,vec3 a,vec3 b,inout float best,inout vec3 A,inout vec3 B){
 vec3 ab=b-a,v=p-a;vec3 d=v-ab*clamp(dot(v,ab)/dot(ab,ab),0.0,1.0);
 float d2=dot(d,d);if(d2<best){best=d2;A=a;B=b;}
}
float gateEight(vec2 q){q=abs(q);return max(max(q.x,q.y),.70710678*(q.x+q.y));}
void gatePart(inout vec4 h,float d,float kind,float t,float w){if(d<h.x)h=vec4(d,kind,t,w);}
// A handful of removable inspection shields, raised off the service rack.
// Global coordinates prevent the face-folding trick from mirroring a decal.
void gateCover(inout vec4 h,vec3 p,vec3 a,vec3 b){
 vec3 mid=(a+b)*.5,off=p-mid;
 if(dot(off,off)>.23)return;
 vec3 u=normalize(b-a),n=normalize(mid),v=cross(n,u);
 float x=dot(off,u)/.80,y=dot(off,v)/railScale,z=dot(off,n)/railScale;
 float panel=max(max(abs(x)-.32,abs(y)-.17),abs(z-.204)-.017);
 panel=max(panel,(abs(x)+abs(y)-.45)*.707);
 gatePart(h,panel*railScale,12.,x,y);
}
float gateStroke(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
float gateNasa(vec2 p){
 float glyph=floor(p.x);vec2 q=vec2(fract(p.x),p.y);
 if(glyph<0.||glyph>3.||min(q.y,1.-q.y)<-.1)return 0.;
 float d=1.;
 if(glyph<.5)d=min(min(gateStroke(q,vec2(.13,.04),vec2(.13,.96)),gateStroke(q,vec2(.13,.96),vec2(.82,.04))),gateStroke(q,vec2(.82,.04),vec2(.82,.96)));
 else if(glyph<1.5||glyph>2.5)d=min(gateStroke(q,vec2(.10,.04),vec2(.48,.96)),min(gateStroke(q,vec2(.48,.96),vec2(.84,.04)),gateStroke(q,vec2(.24,.39),vec2(.71,.39))));
 else{
  d=min(gateStroke(q,vec2(.80,.92),vec2(.23,.92)),gateStroke(q,vec2(.23,.92),vec2(.13,.73)));
  d=min(d,min(gateStroke(q,vec2(.13,.73),vec2(.25,.56)),gateStroke(q,vec2(.25,.56),vec2(.72,.43))));
  d=min(d,min(gateStroke(q,vec2(.72,.43),vec2(.83,.24)),gateStroke(q,vec2(.83,.24),vec2(.69,.08))));
  d=min(d,gateStroke(q,vec2(.69,.08),vec2(.12,.08)));
 }
 return 1.-smoothstep(.068,.115,d);
}
vec4 gateField(vec3 p,float open){
 float sector=floor(atan(p.y,p.x)*(.5*5.0/PI)+.5)*(2.0*PI/5.0);
 float c=cos(sector),s=sin(sector);vec3 q=vec3(c*p.x+s*p.y,abs(c*p.y-s*p.x),p.z);
 vec3 A=vec3(0),B=vec3(0);float best=1e6;
 ${banks}
 float lineDist=sqrt(best);
 if(lineDist>.26)return vec4(lineDist-.225,1,0,0);
 vec3 mid=(A+B)*.5,axis=normalize(B-A),outward=normalize(mid),across=cross(axis,outward);
 vec3 off=q-mid;float t=dot(off,axis),x=dot(off,across)/railScale,y=dot(off,outward)/railScale,at=abs(t);
 vec2 xy=vec2(x,y);float radial=length(xy),oct=gateEight(xy);
 // The pressure pipe is visible through open gaps between the magnet drums.
 vec4 h=vec4(max(radial-.077,at-.5*length(B-A)),2.,t,y);
 float slide=.038*open,dt=abs(at-(.44+slide));
 float pack=max(radial-.118,dt-.27);
 gatePart(h,pack,1.,t,atan(y,x));
 // Ribbed raceways and black ceramic saddle clamps on both ends of each winding.
 float ribs=abs(mod(t+.041,.082)-.041);
 gatePart(h,max(max(radial-.135,ribs-.011),dt-.268),3.,t,y);
 gatePart(h,max(oct-.15,abs(dt-.277)-.021),4.,t,y);
 gatePart(h,max(oct-.133,abs(at-.795)-.057),3.,t,y);
 gatePart(h,max(oct-.123,at-.046),2.,t,y);
 // Hollow outer ladder: twin stainless return pipes, supply bus and diagonal
 // gussets. Only the rails are solid; small apertures see right through.
 float pipe=length(vec2(abs(x)-.13,y-.147))-.026;
 gatePart(h,max(pipe,at-.94),5.,t,y);
 float feed=length(vec2(x+.145,y+.051))-.031;
 gatePart(h,max(feed,at-.89),3.,t,y);
 float beam=max(abs(y-.147)-.014,abs(abs(x)-.13)-.029);
 gatePart(h,max(beam,at-.86),5.,t,y);
 float zig=abs(x-(abs(fract(t/.55+.25)-.5)*.52-.13))*.725;
 gatePart(h,max(max(zig-.014,abs(y-.149)-.018),at-.835),4.,t,y);
 // Three coupled RF cells form a scalloped niobium cavity around the beam pipe.
 float cellT=t-clamp(floor(t/.093+.5),-1.,1.)*.093;
 float cavity=(length(vec2(cellT/.061,radial/.192))-1.)*.061;
 gatePart(h,cavity,5.,t,y);
 // Raised instrumentation bus on ceramic standoffs, isolated from the return pipe.
 float pick=length(vec2(x-.08,y-.25))-.017;
 gatePart(h,max(pick,at-.35),5.,t,y);
 float post=max(length(vec2(at-.32,x-.08))-.030,abs(y-.201)-.052);
 gatePart(h,post,5.,t,y);
 float clampRing=length(vec2(abs(x)-.13,y-.147))-.035;
 gatePart(h,max(max(clampRing,abs(mod(t+.095,.19)-.095)-.012),at-.86),2.,t,y);
 // Convert anisotropic rail distances to conservative world steps.
 h.x*=railScale;
 vec4 node=vec4(1e6);
 // Three separately flanged beamlines meet inside a compact valve block.
 vec3 V=t<0.0?A:B;vec3 u=normalize(V),w=normalize(vec3(-u.y,u.x,0)),l=cross(u,w),dv=(q-V)/nodeScale;
 float z=dot(dv,u);vec2 uv=vec2(dot(dv,w),dot(dv,l));float ring=gateEight(uv),r=length(uv),a=atan(uv.y,uv.x);
 float vault=max(ring-.207,abs(z)-.109);vault=max(vault,(ring+abs(z)-.274)*.7071);
 gatePart(node,vault,6.,z,r);
 // Stack of spaced cooling fins and an outer circular diagnostic flange.
 float fin=abs(mod(z+.018,.036)-.018);
 gatePart(node,max(max(ring-.222,fin-.007),abs(z)-.084),5.,z,r);
 gatePart(node,max(abs(z-.128)-.031,r-.158),3.,z,a);
 gatePart(node,max(abs(z-.17)-.018,r-.157),7.,r,a);
 gatePart(node,max(abs(z-.194)-.011,r-.099),8.,r,a);
 // The optical head points inward, down the same axis as the ignition beam.
 gatePart(node,max(abs(z+.158)-.05,r-.108),2.,z,r);
 gatePart(node,max(abs(z+.177)-.026,r-.14),3.,z,r);
 gatePart(node,max(abs(z+.222)-.026,r-.121),5.,z,r);
 gatePart(node,max(abs(z+.252)-.022,r-.112),7.,r,a);
 gatePart(node,max(abs(z+.268)-.0061,r-.096),9.,r,a);
 gatePart(h,node.x*nodeScale,node.y,node.z,node.w);
 ${covers}
 return h;
}
vec3 gatePaint(vec3 n,vec3 rd,vec4 h,float open,bool other){
 float id=h.y,t=h.z,w=h.w;vec3 hue=mix(vec3(.46,.48,.49),vec3(.72,.83,.89),open);
 vec3 white=vec3(.86,.90,.89),steel=vec3(.37,.46,.49),ivory=vec3(.83,.84,.84),dark=vec3(.10,.15,.17),base=steel;
 float em=0.;
 if(id<1.5){
  // Actual foil grooves follow a helical turn around each vacuum jacket.
  float turn=fract(t*30.-w/(2.*PI));float rib=smoothstep(.03,.22,turn)*(1.-smoothstep(.81,.98,turn));
  base=mix(vec3(.22,.24,.26),ivory,.28+.72*rib);
 }else if(id<2.5)base=vec3(.125,.164,.182);
 else if(id<3.5)base=vec3(.20,.22,.24);
 else if(id<4.5)base=vec3(.36,.44,.46);
 else if(id<5.5)base=vec3(.67,.70,.73);
 else if(id<6.5)base=vec3(.66,.69,.70);
 else if(id<7.5){
  float bolts=(1.-smoothstep(.007,.014,abs(t-.13)))*(1.-smoothstep(.18,.35,abs(sin(6.*w))));base=mix(dark,vec3(.76,.81,.81),bolts);
 }else if(id<8.5){
  float bus=1.-smoothstep(.007,.014,abs(t-.074));base=mix(steel,hue,bus);em=.12*bus;
 }else if(id<9.5){
  hue=mix(vec3(.95,.48,.08),vec3(.18,.9,.67),open);float iris=step(.052,t)*step(t,.073)*step(.25,cos(w*8.));
  base=mix(dark,hue,iris);em=.32*iris;
 }else{
  float bolts=1.-smoothstep(.006,.012,length(abs(vec2(t,w))-vec2(.266,.127)));
  base=mix(white,steel,bolts);
  // Flat enamel cover with a single dark-red NASA stencil, never mirrored.
  base=mix(base,vec3(.56,.042,.033),gateNasa(vec2(t/.112+2.,w/.146+.5)));
 }
 vec3 key=normalize(vec3(-.44,.72,.58));float light=max(0.,dot(n,key)),spec=pow(max(0.,dot(reflect(-key,n),-rd)),22.);
 vec3 rgb=base*(.48+.69*light)+.29*spec+hue*em;
 return uSpectrum==5?vec3(.24,.49,.66)*(.55+.65*abs(dot(n,rd))):surfaceSpectrum(rgb,light,.26,.22);
}
vec4 gateLocalSegment(vec3 a,vec3 b,bool other,out float fraction){
 fraction=1.0;vec3 delta=b-a;float span=length(delta);if(span<1e-8)return vec4(0);
 float bound=3.38;vec3 dir=delta/span;
 float away=dot(a,dir),disc=bound*bound-dot(cross(a,dir),cross(a,dir));if(disc<=0.0)return vec4(0);
 float root=sqrt(disc),lo=max(0.0,-away-root),hi=min(span,-away+root);
 if(hi<=lo)return vec4(0);
 vec3 start=a+dir*lo,finish=a+dir*hi;
 // The inscribed flight cylinder remains empty even with the pole shoes deployed.
 if(max(dot(start.xy,start.xy),dot(finish.xy,finish.xy))<1.49)return vec4(0);
 float s=lo,open=clamp(uBridgeStage.x,0.0,1.0);
 for(int j=0;j<64;j++){
  vec3 p=a+dir*s;vec4 hit=gateField(p,open);
  if(hit.x<.0016){
   vec2 e=vec2(.0015,0);
   vec3 n=unit(vec3(gateField(p+e.xyy,open).x-gateField(p-e.xyy,open).x,gateField(p+e.yxy,open).x-gateField(p-e.yxy,open).x,gateField(p+e.yyx,open).x-gateField(p-e.yyx,open).x));
   fraction=s/span;return vec4(gatePaint(n,dir,hit,open,other),1);
  }
  s+=max(.0011,hit.x*.80);if(s>hi)break;
 }
 return vec4(0);
}
vec4 bridgeHardwareSegment(vec3 a,vec3 b,out float fraction){
 fraction=1.0;if(uBridgeStage.z<1.5)return vec4(0);
 float metric=bridgeMetricScale(),nearScale=uBridgeStage.y>.5?metric*metric:1.0;
 float invScale=.25*(uBridgeStage.y>.5?1.0:metric*metric);
 vec3 delta=b-a;float dd=max(dot(delta,delta),1e-24);
 float closest=length(a+delta*clamp(-dot(a,delta)/dd,0.0,1.0)),outer=max(length(a),length(b));
 vec4 nearest=vec4(0);
 for(int j=0;j<2;j++){
  bool other=j==1;
  float inner=other?invScale/3.38:2.27*nearScale,outerBound=other?invScale/2.27:3.38*nearScale;
  if(closest>outerBound||outer<inner)continue;
  vec3 A=localPoint(a,uPrimaryAxis),B=localPoint(b,uPrimaryAxis);
  if(other){A*=invScale/max(dot(a,a),1e-20);B*=invScale/max(dot(b,b),1e-20);}else{A/=nearScale;B/=nearScale;}
  float f;vec4 surf=gateLocalSegment(A,B,other,f);
  if(surf.a>.5){
   if(other){vec3 hit=mix(A,B,f),chart=hit*(invScale/max(dot(hit,hit),1e-20));
    f=clamp(dot(chart-localPoint(a,uPrimaryAxis),localPoint(delta,uPrimaryAxis))/dd,0.0,1.0);}
   if(f<fraction){nearest=surf;fraction=f;}
  }
 }
 return nearest;
}
`;
