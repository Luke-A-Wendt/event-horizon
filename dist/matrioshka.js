// The nominal radii are also used by the thermal inspector. Each tier has an
// independent construction axis, an inner deck and an outer service face.
export const BRAIN_RADIUS=26927616726;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=v=>v.map(n=>n/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const tau=2*Math.PI;
export const BRAIN_TIERS=[
 ['brain-collector','Photonic collectors',.235,'Starlight conversion',[.74,.46,.46],20],
 ['brain-logic','Compute fabric',.46,'Distributed computation',[-.18,-.20,.965],24],
 ['brain-memory','Memory and interconnect',.70,'Storage and optical routing',[-.267,.933,.231],30],
 ['brain-radiator','Radiator envelope',1,'Waste heat rejection',[.80,-.345,.490],36]
].map(([id,name,radius,role,normal,bays],index)=>{
 const axis=unit(normal),u=unit(cross([0,1,0],axis)),v=cross(axis,u);
 return {id,name,radius,role,axis,u,v,bays,index};
});
export const brainTier=id=>BRAIN_TIERS.find(v=>v.id===id);
export const brainTemperature=radiusMeters=>Math.round(5772*Math.sqrt(695700000/radiusMeters));
const subsystemNotes=[
 'Sun-facing collector panels convert starlight into power for the inner computing decks.',
 'Banks of processors exchange energy with the collector tier and radiate waste heat outward.',
 'Optical connections link distributed memory banks. Their decks receive radiation from the warmer compute shell.',
 'Finned radiator banks form the outermost envelope and release the remaining heat to space.'
];
export const brainStructureNote=tier=>subsystemNotes[tier.index]+
 ' Paired decks are connected by a service lattice.';

// The open engineering display enlarges the photosphere only at a distance.
// At approach the actual surface and physical inspection camera agree again.
export function brainStarRadius(radius,range){
 return radius*Math.min(5.8,Math.max(1,(range/radius+9)/19));
}
const shaderAxis=v=>'vec3('+v.map(x=>x.toFixed(7)).join(',')+')';
const tierValue=f=>BRAIN_TIERS.map((t,i)=>i<3?'tier<'+(i+.5)+'?'+f(t)+':':f(t)).join('');
export const BRAIN_GLSL=`
float mbStripe(float x,float width){
 return 1.-smoothstep(width,width*1.5,abs(x));
}
vec3 mbAlloy(float tier){
 return tier<.5?vec3(.56,.32,.12):tier<1.5?vec3(.38,.29,.245):tier<2.5?vec3(.265,.30,.34):vec3(.147,.192,.243);
}
// True openings between deep continuous chords: the solar blankets, circuit
// cabinets and finned banks occupy alternating bays of a diagonal space frame.
bool mbDeck(vec2 uv,float bay,float tier,out float plate,out float web){
 float x=uv.x,y=uv.y,pick=mod(bay+3.*tier,8.);
 float side=mod(floor(bay*.5)+tier,2.)<1.?1.:-1.;
 plate=abs(x)<.90&&abs(y)<.77&&(pick<5.||pick<7.&&side*y>-.32)?1.:0.;
 web=max(mbStripe(abs(x)-1.,.079),max(mbStripe(y,.048),mbStripe(abs(y)-abs(.81*x),.064)));
 return plate>.5||abs(y)>.785||web>.10;
}
vec3 mbPaint(vec2 uv,float bay,float tier,vec3 n,vec3 d,bool inward,float plate,float web,float footprint){
 float x=uv.x,y=uv.y,ax=abs(x),ay=abs(y),variation=fract(bay*.381966+tier*.42);
 vec3 steel=mbAlloy(tier),edge=vec3(.61,.65,.67),brass=vec3(.83,.51,.245),blue=vec3(.095,.15,.205);
 vec3 c=steel;
 float detail=1.-smoothstep(.012,.12,footprint);
 if(plate>.5){
  vec2 panel=vec2((x+.84)/1.68,(y+.74)/1.48);
  float seam=min(abs(fract(panel.x*3.)-.5),abs(fract(panel.y*4.)-.5));
  if(tier<.5){c=mix(vec3(.20,.085,.035),vec3(.47,.225,.064),variation);
   c+=brass*(.15+.48*mbStripe(abs(fract((panel.x+.035*panel.y)*9.)-.5),.08));
  }else if(tier<2.5){
   c=mix(blue,steel*.85,variation);
   vec2 chip=abs(fract(panel*vec2(2.,3.))-.5);
   if(chip.x<.35&&chip.y<.31)c=steel*.45+vec3(.025,.025,.027);
   if(chip.x<.31&&chip.y>.30&&chip.y<.397)c+=brass*.86*step(.52,fract(panel.x*30.));
   c+=brass*.42*mbStripe(seam,.037);
  }else{
   float fin=fract(panel.x*13.+panel.y*.35);
   c=mix(vec3(.074,.114,.155),vec3(.31,.34,.355),smoothstep(.05,.86,fin));
   c+=edge*.28*step(.88,fin);
  }
  // Below a few pixels per panel, filter the fin stripes and traces to
  // their average color. Broad plate fields remain legible as the camera moves.
  vec3 mean=tier<.5?vec3(.44,.21,.074):tier<1.5?vec3(.22,.19,.16):tier<2.5?vec3(.12,.22,.24):vec3(.135,.19,.25);
  c=mix(mean,c,detail)*(.72+.36*variation);
 }
 if(plate<.5&&web>.1)c=mix(steel,edge,.28+.32*web);
 if(ay>.785){c=mix(steel*1.12,vec3(.065,.078,.091),mbStripe(ay-.891,.027));c+=edge*.76*mbStripe(ay-.975,.012);}
 if(ax>.885)c=mix(steel*.70,edge*.72,smoothstep(.92,.97,ax));
 float coupling=mbStripe(ax-.835,.055)*mbStripe(ay-.80,.108);
 float marker=mbStripe(x+.56,.043)*mbStripe(ay-.92,.04);
 // Hot inward faces receive the star. Outboard service decks read as
 // cooler shadowed metal, with grazing highlights along the raised ribs.
 float key=max(0.,dot(n,normalize(vec3(-.39,.78,.46))));
 float grazing=pow(max(0.,1.-abs(dot(n,d))),3.);
 float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.42,.83,.36)),n),-d)),13.);
 vec3 interior=tier<.5?vec3(1.86,1.14,.55):tier<1.5?vec3(1.36,1.02,.84):tier<2.5?vec3(.67,1.25,1.29):vec3(.70,.87,1.19);
 c*=inward?interior*(.43+.94*key):vec3(.69,.80,.97)*(.24+1.59*key);
 c+=vec3(.71,.85,1.0)*spec*(.20+.60*web);
 if(inward){float trim=mbStripe(ay-.79,.04)*(.57+.75*variation);
  c+=(tier<1.5?vec3(1.43,.65,.18):vec3(.33,.62,.79))*(trim*.45*detail+grazing*.15)*(1.-.13*tier);
 }
 c+=grazing*edge*.25+coupling*vec3(.44,.29,.14);
 c+=detail*marker*(mod(bay,4.)<1.?vec3(.53,1.35,1.72):vec3(1.68,.77,.25));
 return c;
}
// Each latitude has nearly square bays. The two decks are separated in
// radius, with a service lattice midway between them. A small inspection
// aperture provides a clear camera path through each assembled envelope.
vec4 brainHit(vec3 o,vec3 d,float epoch,float tier,float maxRange,vec3 eye){
 vec3 axis=${tierValue(t=>shaderAxis(t.axis))};
 vec3 u=normalize(cross(vec3(0,1,0),axis)),v=cross(axis,u);
 float sectors=${tierValue(t=>t.bays.toFixed(1))};
 bool cut=epoch<0.;epoch=abs(epoch)-1.;
 vec3 port=vec3(.2911203,.1986693,.9358309);
 float depth=.033+.006*tier,b=dot(o,d);
 vec3 perp=cross(o,d),color=vec3(0.);float best=maxRange;
 for(int layer=0;layer<3;layer++){
  float level=float(layer),r=1.-level*.5*depth,disc=r*r-dot(perp,perp);
  if(disc<0.)continue;
  for(int side=0;side<2;side++){
   float t=-b+(side==0?-1.:1.)*sqrt(disc);
   if(t<=1.e-7||t>=best)continue;
   vec3 n=normalize(o+t*d);float portCos=dot(n,port);
   if(portCos>.9985||(cut&&side==0&&layer!=1))continue;
   float lat=acos(clamp(dot(n,axis),-1.,1.))/3.14159265;
   float bands=floor(sectors*.47),row=min(floor(lat*bands),bands-1.);
   float columns=max(4.,floor(sectors*sin(3.14159265*(row+.5)/bands)+.5));
   float col=(atan(dot(n,v),dot(n,u))/6.283185307+.5)*columns+epoch+.5*mod(row,2.)+.12*level;
   vec2 uv=vec2(fract(col),fract(lat*bands))*2.-1.;
   float plate,web,bay=floor(col)+row*29.;
   bool deck=mbDeck(uv,bay,tier,plate,web);
   // Circumferential utility trunks tie one neighborhood to the next.
   float trunk=mod(row,4.)<.5?1.-smoothstep(.19,.23,abs(uv.y+.52)):0.;
   if(trunk>.04&&layer!=1){deck=true;plate=1.;}
   if(layer==1){
    web=max(mbStripe(abs(uv.x)-abs(uv.y),.095),mbStripe(uv.x,.07));
    if(cut)web=max(web,mbStripe(abs(uv.y)-1.,.065));
    plate=0.;if(web<.14)continue;
   }else if(!deck)continue;
   float footprint=length(eye-r*n)*sectors/(3.14159*max(uResolution.y,1.)*max(.22,abs(dot(n,d))));
   color=mbPaint(uv,bay,tier,n,d,side==1,plate,web,footprint);
   if(trunk>.04&&layer!=1){
    float edge=1.-smoothstep(.019,.055,abs(abs(uv.y+.52)-.16));
    color=mix(color,mbAlloy(tier)*(.32+.65*max(0.,dot(n,vec3(-.39,.78,.46))))+vec3(.25,.31,.38)*edge,trunk*.90);
   }
   if(portCos>.9982)color+=vec3(.26,.52,.70);
   best=t;
  }
 }
 return best<maxRange?vec4(color,best):vec4(0.,0.,0.,-1.);
}`;

// A lower-density spherical lattice for Canvas. Panel positions are shared
// across frozen and moving camera frames. The rows taper towards the poles.
const meshCache=new Map(),port=[.2911203,.1986693,.9358309];
const plates=['#bb783a','#94715b','#6a7e8e','#526779'];
const trim=['#e4b47b','#cea889','#a3aaaf','#96a8b1'];
const dark=['#553423','#45383b','#344453','#253440'];
export function brainLayers(body,eye){
 const t=brainTier(body.catalogId);if(!t)return [];
 const packed=body.bodyParams[1],cut=packed<0,epoch=Math.abs(packed)-1;
 const key=[...body.position,body.radius,packed].join('/');let cache=meshCache.get(t.id);
 if(cache?.key!==key){
  const bays=[],rows=10+t.index;
  for(let row=0;row<rows;row++){
   const cols=Math.max(4,Math.round((rows*2)*Math.sin(Math.PI*(row+.5)/rows)));
   for(let col=0;col<cols;col++){
    const point=(x,y,r=1)=>{
     const a=(col+x-.5*(row%2)-epoch)*tau/cols-Math.PI,b=(row+y)*Math.PI/rows;
     const X=Math.cos(a)*Math.sin(b),Y=Math.cos(b),Z=Math.sin(a)*Math.sin(b);
     return t.axis.map((v,k)=>body.position[k]+body.radius*r*(Y*v+X*t.u[k]+Z*t.v[k]));
    };
    const position=point(.5,.5),n=unit(position.map((x,k)=>x-body.position[k]));
    if(dot(n,port)>.994)continue;
    const bay=col+row*29,fill=plates[t.index],metal=trim[t.index];
    const parts=[],quad=(p,fill)=>parts.push({points:p,fill});
    const rect=(x,y,X,Y,fill,r=1)=>quad([point(x,y,r),point(X,y,r),point(X,Y,r),point(x,Y,r)],fill);
    rect(0,0,1,.12,metal);rect(0,.12,.12,1,fill);
    quad([point(.08,.16),point(.16,.16),point(.98,.98,.975),point(.86,.98,.975)],metal);
    const frameParts=cut?parts.slice():null;
    const end=bay%5===0?.53:.92;
    rect(.16,.15,.92,end,fill,.985);rect(.22,.20,.85,end-.06,dark[t.index],.985);
    if(bay%4===0)rect(.22,.19,.29,.26,'#b2ced9',.985);
    bays.push({position,parts,frameParts,n});
   }
  }
  cache={key,bays};meshCache.set(t.id,cache);
 }
 return cache.bays.map(bay=>({type:'swarm-array',position:bay.position,parts:cut&&eye&&dot(bay.n,eye.map((x,k)=>x-bay.position[k]))>0?bay.frameParts:bay.parts,opacity:body.opacity??1}));
}
export function paintBrainStar(ctx,x,y,r,body,opacity){
 ctx.save();ctx.translate(x,y);ctx.globalAlpha*=opacity;
 const corona=Math.max(0,Math.min(1,body.corona??.82)),extent=3*r;
 if(corona>0){
  const haze=ctx.createRadialGradient(0,0,r*.92,0,0,extent);
  for(const [t,c] of [[0,'rgba(255,212,125,'+.92*corona+')'],[.067,'rgba(255,172,64,'+.78*corona+')'],[.27,'rgba(245,111,33,'+.27*corona+')'],[1,'rgba(244,102,30,0)']])haze.addColorStop(t,c);
  ctx.fillStyle=haze;ctx.fillRect(-extent,-extent,2*extent,2*extent);
 }
 const surface=ctx.createRadialGradient(-.16*r,-.23*r,.04*r,0,0,r);
 surface.addColorStop(0,'#ffedbd');surface.addColorStop(.66,'#ffd77d');surface.addColorStop(.91,'#ffbf55');surface.addColorStop(1,'#ffe8a0');
 ctx.fillStyle=surface;ctx.beginPath();ctx.arc(0,0,r,0,tau);ctx.fill();
 for(let i=0;i<72;i++){
  const a=i*2.399963,b=r*Math.sqrt((i+.5)/72),wave=.5+.5*Math.sin(i*7.6);
  ctx.fillStyle=i%4?'rgba(255,252,218,'+(.23+.35*wave)+')':'rgba(170,70,24,'+(.16+.19*(body.spots??.66))+')';
  ctx.beginPath();ctx.ellipse(b*Math.cos(a)*.935,b*Math.sin(a)*.935,r*(.021+.039*wave),r*(.012+.018*wave),a+.66,0,tau);ctx.fill();
 }
 ctx.restore();
}
