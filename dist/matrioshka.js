// The nominal radii are also used by the thermal inspector. Each tier has an
// independent orbital plane, an inner deck and an outer service face.
export const BRAIN_RADIUS=26927616726;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=v=>v.map(n=>n/Math.hypot(...v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const tau=2*Math.PI;
export const BRAIN_TIERS=[
 ['brain-collector','Photonic collectors',.235,'Starlight conversion',[.74,.46,.46],.20,24],
 ['brain-logic','Compute fabric',.46,'Distributed computation',[-.18,-.20,.965],.15,32],
 ['brain-memory','Memory and interconnect',.70,'Storage and optical routing',[-.267,.933,.231],.122,44],
 ['brain-radiator','Radiator envelope',1,'Waste heat rejection',[.80,-.345,.490],.135,52]
].map(([id,name,radius,role,normal,halfHeight,bays],index)=>{
 const axis=unit(normal),u=unit(cross([0,1,0],axis)),v=cross(axis,u);
 return {id,name,radius,role,axis,u,v,halfHeight,bays,index};
});
export const brainTier=id=>BRAIN_TIERS.find(v=>v.id===id);

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
 plate=abs(x)<.84&&abs(y)<.74&&(pick<2.||pick<6.&&side*y>-.02)?1.:0.;
 web=max(mbStripe(abs(x)-1.,.079),max(mbStripe(y,.048),mbStripe(abs(y)-abs(.81*x),.064)));
 return plate>.5||abs(y)>.785||web>.10;
}
vec3 mbPaint(vec2 uv,float bay,float tier,vec3 n,vec3 d,bool inward,float plate,float web){
 float x=uv.x,y=uv.y,ax=abs(x),ay=abs(y),variation=fract(bay*.381966+tier*.42);
 vec3 steel=mbAlloy(tier),edge=vec3(.61,.65,.67),brass=vec3(.83,.51,.245),blue=vec3(.095,.15,.205);
 vec3 c=steel;
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
  c*=.75+.29*variation;
 }
 if(plate<.5&&web>.1)c=mix(steel,edge,.28+.32*web);
 if(ay>.785){c=mix(steel*1.12,vec3(.065,.078,.091),mbStripe(ay-.891,.027));c+=edge*.76*mbStripe(ay-.975,.012);}
 if(ax>.885)c=mix(steel*.70,brass*.8,step(.92,ax));
 float coupling=mbStripe(ax-.835,.055)*mbStripe(ay-.80,.108);
 float marker=mbStripe(x+.56,.043)*mbStripe(ay-.92,.04);
 // Hot inward faces receive the star. Outboard service decks read as
 // cooler shadowed metal, with grazing highlights along the raised ribs.
 float key=max(0.,dot(n,normalize(vec3(-.39,.78,.46))));
 float grazing=pow(max(0.,1.-abs(dot(n,d))),3.);
 float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.42,.83,.36)),n),-d)),13.);
 c*=inward?vec3(2.68,1.46,.65)*(.71+.35*key):vec3(.57,.72,.96)*(.35+1.39*key);
 c+=vec3(.71,.85,1.0)*spec*(.20+.60*web);
 if(inward){float trim=mbStripe(ay-.79,.04)*(.57+.75*variation);
  c+=vec3(1.43,.65,.18)*(trim*.64+grazing*.21)*(1.-.13*tier);
 }
 c+=grazing*edge*.25+coupling*vec3(.44,.29,.14);
 c+=marker*(mod(bay,4.)<1.?vec3(.53,1.35,1.72):vec3(1.68,.77,.25));
 return c;
}
vec4 brainHit(vec3 o,vec3 d,float epoch,float tier,float maxRange){
 vec3 a=${tierValue(t=>shaderAxis(t.axis))};
 vec3 u=normalize(cross(vec3(0,1,0),a)),v=cross(a,u);
 float h=${tierValue(t=>t.halfHeight.toFixed(4))},bays=${tierValue(t=>t.bays.toFixed(1))};
 float outer=sqrt(1.-h*h),inner=outer-(.055-.006*tier);
 float oy=dot(o,a),dy=dot(d,a);vec3 op=o-a*oy,dp=d-a*dy;
 float aa=dot(dp,dp),bb=dot(op,dp),best=maxRange;vec3 color=vec3(0.);
 for(int face=0;face<4;face++){
  float rr=face<2?outer:inner,det=bb*bb-aa*(dot(op,op)-rr*rr);
  if(aa<1.e-9||det<0.)continue;
  float t=(-bb+((face==0||face==2)?-1.:1.)*sqrt(det))/aa;
  if(t<=1.e-7||t>=best)continue;
  float y=(oy+t*dy)/h;if(abs(y)>1.)continue;
  vec3 n=normalize(op+dp*t);
  float sector=fract(atan(dot(n,v),dot(n,u))/6.283185307+epoch/bays)*bays,bay=floor(sector);
  vec2 uv=vec2(fract(sector)*2.-1.,y);float plate,web;
  if(!mbDeck(uv,bay,tier,plate,web))continue;
  best=t;color=mbPaint(uv,bay,tier,n,d,face>=2,plate,web);
 }
 // End plates run along both sides of each deep truss. Grazing views see
 // the same physical metal thickness even where the deck itself is open.
 if(abs(dy)>.0000001)for(int side=0;side<2;side++){
  float t=((side==0?-h:h)-oy)/dy;if(t<=1.e-7||t>=best)continue;
  vec3 p=op+dp*t;float r=length(p);if(r<inner||r>outer)continue;
  float sector=fract(atan(dot(p,v),dot(p,u))/6.283185307+epoch/bays)*bays,z=(r-inner)/(outer-inner);
  float joint=mbStripe(fract(sector)-.5,.045),rib=mbStripe(z-.24,.06)+mbStripe(z-.83,.045);
  vec3 c=mix(mbAlloy(tier)*.56,vec3(.60,.57,.49),rib*.66+joint*.27);
  if(z<.09)c+=vec3(.60,.29,.09);
  if(mod(floor(sector),6.)<1.&&abs(fract(sector)-.28)<.075)c+=vec3(.61,.85,1.05)*mbStripe(z-.53,.11);
  color=c*(.68+.51*abs(dot(d,a)));best=t;
 }
 return best<maxRange?vec4(color,best):vec4(0.,0.,0.,-1.);
}`;

const meshCache=new Map();
const dark=['#673c25','#493d39','#384652','#303b49'],plates=['#ba783d','#86705d','#687783','#5d6b74'];
const strip=['#e4b47b','#c69e7f','#a3aab0','#9caab0'];
function tierMesh(t,phase){
 const key=t.index+':'+phase;if(meshCache.has(key))return meshCache.get(key);
 const h=t.halfHeight,outer=Math.sqrt(1-h*h),inner=outer-(.055-.006*t.index),mesh=[];
 for(let bay=0;bay<t.bays;bay++){
  const parts=[],point=(x,y,r=outer)=>{
   const angle=(bay+(x+1)*.5-phase)*tau/t.bays,ca=r*Math.cos(angle),sa=r*Math.sin(angle);
   return t.axis.map((a,k)=>a*h*y+t.u[k]*ca+t.v[k]*sa);
  };
  const quad=(x,y,X,Y,r,fill)=>parts.push({points:[point(x,y,r),point(X,y,r),point(X,Y,r),point(x,Y,r)],fill});
  for(const [edge,sign] of [[-1,1],[1,-1]]){
   quad(-1,edge,1,edge+.215*sign,outer,plates[t.index]);
   quad(-1,edge+.018*sign,1,edge+.063*sign,outer,strip[t.index]);
   parts.push({points:[point(-1,edge,inner),point(1,edge,inner),point(1,edge,outer),point(-1,edge,outer)],fill:dark[t.index]});
  }
  quad(-1,-.8,-.90,.8,outer,strip[t.index]);quad(-1,-.048,1,.048,outer,plates[t.index]);
  for(const sign of [-1,1])parts.push({points:[point(-1,-.78*sign-.055),point(1,.78*sign-.055),point(1,.78*sign+.055),point(-1,-.78*sign+.055)],fill:strip[t.index]});
  const pick=(bay+3*t.index)%8,sign=(Math.floor(bay*.5)+t.index)%2===0?1:-1;
  if(pick<6){
   const y=pick<2?-.74:sign>0?0:-.74,Y=(pick<2||sign>0) ? .74 : 0;
   quad(-.84,y,.84,Y,outer,plates[t.index]);
   for(const x of [-.57,-.05,.47])quad(x,y+.07,x+.36,Y-.06,outer,dark[t.index]);
  }
  if(bay%3===0)quad(-.60,.847,-.51,.979,outer,bay%2?'#b4d6dd':'#edbe7c');
  mesh.push({position:point(0,0),parts});
 }
 // Phase comes from the authored tier and is fixed in the local frame.
 if(meshCache.size>=8)meshCache.delete(meshCache.keys().next().value);
 meshCache.set(key,mesh);return mesh;
}
// World-space corners for these stationary decks survive camera orbit. Keep a
// warm and a cool version of each bay so depth sorting can select its inward
// face without rebuilding thousands of points on every software frame.
const worldCache=new Map(),keyLight=unit([-.39,.78,.46]);
function deckColor(hex,lit,key,tier){
 const raw=[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16));
 const tint=lit?[1.53,.99,.60]:[.57,.72,.89],gain=lit ? .88+key*.24 : .52+key*.76;
 return '#'+raw.map((v,i)=>Math.max(0,Math.min(255,Math.round(v*tint[i]*gain+(lit?(3-tier)*[4,2,.5][i]:0)))).toString(16).padStart(2,'0')).join('');
}
export function brainLayers(body,observer=[0,0,0]){
 const t=brainTier(body.catalogId);if(!t)return [];
 const phase=body.bodyParams[1],key=[...body.position,body.radius,phase].join('/');
 let cached=worldCache.get(t.id);
 if(cached?.key!==key){
  const world=p=>p.map((v,k)=>body.position[k]+v*body.radius);
  const bays=tierMesh(t,phase).map(bay=>{
   const n=unit(bay.position),key=Math.max(0,dot(n,keyLight)),position=world(bay.position);
   const near=[],far=[];
   for(const part of bay.parts){
    const points=part.points.map(world);
    near.push({points,fill:deckColor(part.fill,false,key,t.index)});
    far.push({points,fill:deckColor(part.fill,true,key,t.index)});
   }
   return {position,n,near,far};
  });
  cached={key,bays};worldCache.set(t.id,cached);
 }
 return cached.bays.map(bay=>({type:'swarm-array',position:bay.position,opacity:body.opacity??1,
  parts:dot(observer.map((v,k)=>v-bay.position[k]),bay.n)>=0?bay.near:bay.far}));
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
