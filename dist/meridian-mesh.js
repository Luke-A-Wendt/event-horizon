import {rimJets} from './meridian-rcs.js';
import {MERIDIAN_DOCK_TIP_STOWED,MERIDIAN_DOCK_STROKE,MERIDIAN_DOCK_OUTER,MERIDIAN_DOCK_INNER,MERIDIAN_ROOF_OPENING,MERIDIAN_DOCK_SEAT,MERIDIAN_HATCH_Z} from './meridian-port.js';
// +Z is the bow/thrust axis. Every passenger floor and the planted terrace
// are perpendicular to it. Hull, glass and gardens are separate surfaces.
const cache=new Map(),tau=Math.PI*2;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const mean=ps=>ps[0].map((_,i)=>ps.reduce((s,p)=>s+p[i],0)/ps.length);
const ver=(a,r,z,x=0,y=0)=>[x+r*Math.cos(a),y+r*Math.sin(a),z];
function assembler(){
 const vertices=[],faces=[],keys=new Map();
 function add(pts,material,out,extra={}){
  const a=pts[1].map((x,i)=>x-pts[0][i]),b=pts[2].map((x,i)=>x-pts[0][i]);
  let n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const mag=Math.hypot(...n);if(mag<1e-12)return;n=n.map(v=>v*(dot(n,out)<0?-1:1)/mag);
  const ids=pts.map(p=>{const k=p.map(v=>Math.round(v*1e6)).join(',');if(!keys.has(k)){keys.set(k,vertices.length);vertices.push(p);}return keys.get(k);});
  faces.push({ids,normal:n,material,center:mean(pts),...extra});
 }
 function surface(a,b,r,z,R,Z,x,y,mat,extra={}){
  const mid=(a+b)/2,sign=Math.sign(Z-z);
  add([ver(a,r,z,x,y),ver(b,r,z,x,y),ver(b,R,Z,x,y),ver(a,R,Z,x,y)],mat,
      [sign*Math.cos(mid),sign*Math.sin(mid),r-R],extra);
 }
 function lathe(profile,n,x=0,y=0,extra={}){
  for(let i=0;i<n;i++)for(let k=0;k<profile.length-1;k++){
   const [z,r,m]=profile[k],[Z,R]=profile[k+1];
   surface(tau*i/n,tau*(i+1)/n,r,z,R,Z,x,y,typeof m==='function'?m(i):m,extra);
  }
 }
 return {vertices,faces,add,surface,lathe};
}
export function meridianMesh(n=36){
 if(cache.has(n))return cache.get(n);
 const {vertices,faces,add,surface,lathe}=assembler(),detail=n>=18;
 const tile=i=>i%9===1?'warm':'tile';
 // Utility bus, engine plate, four pressure tanks and four deep copper nozzles.
 lathe([[-.675,.005,'engine'],[-.675,.206,'silver'],[-.64,.235,'well'],[-.58,.235,'panel'],[-.52,.164,'silver'],[-.47,.142,'well'],[.115,.142,'panel'],[.18,.19,'tile']],n);
 for(let j=0;j<4;j++){
  const a=j*tau/4,b=a+Math.PI/4,tx=.145*Math.cos(a),ty=.145*Math.sin(a),dx=.13*Math.sign(Math.cos(b)),dy=.13*Math.sign(Math.sin(b));
  lathe([[-.55,.019,'gold'],[-.515,.072,'warm'],[-.475,.083,'tile'],[-.37,.083,'silver'],[-.353,.084,'tile'],[-.03,.083,'silver'],[-.014,.083,'warm'],[.094,.080,'panel'],[.135,.051,'tile'],[.145,.012,'warm']],detail?12:6,tx,ty);
  lathe([[-.86,.082,'engine'],[-.842,.087,'copper'],[-.725,.05,'silver'],[-.70,.054,'engine'],[-.659,.046,'silver'],[-.63,.052,'panel']],detail?14:6,dx,dy);
  lathe([[-.739,.001,'well'],[-.743,.033,'engine'],[-.86,.075,'copper'],[-.86,.082,'copper']],detail?14:6,dx,dy);
  // Inclined outriggers carry the garden load to the service trunk.
  for(const s of [-1,1]){
   const ang=b+.095*s,ang2=b+.17*s;
   const ps=[...[-1,1].flatMap(t=>[-1,1].map(u=>ver(ang+t*.047,.154+u*.018,-.31))),
             ...[-1,1].flatMap(t=>[-1,1].map(u=>ver(ang2+t*.031,.362+u*.015,.308)))],c=mean(ps);
   for(const ix of [[0,1,5,4],[1,3,7,5],[3,2,6,7],[2,0,4,6]]){const vs=ix.map(i=>ps[i]);add(vs,'silver',mean(vs).map((x,i)=>x-c[i]));}
  }
 }
 // Three occupied deck belts and projecting eaves. Curved glass alternates
 // with ceramic mullions; the largest belt carries the identity plates.
 const profile=[[.18,.19,'warm'],[.31,.40,'silver'],[.35,.46,'rim'],[.364,.462,'glass'],[.401,.469,'silver'],[.416,.471,'tile'],[.429,.467,'well'],[.449,.489,'rim'],[.468,.49,'glass'],[.482,.49,'tile'],[.546,.49,'seam'],[.558,.488,'rim'],[.59,.459,'silver'],[.601,.455,'blue'],[.645,.45,'tile'],[.665,.446,'rim'],[.682,.405,'warm']];
 lathe(profile,n);
 // Elevated command deck with an observation band around the bridge. The
 // opaque grey pressure lift has raised ribs and structural tracks.
 const inDeck={interior:true},bridgeSectors=detail?24:12;
 lathe([[.683,.117,'silver'],[.690,.115,'tile'],[.704,.106,'well'],[.711,.104,i=>i%3===0?'silver':'glass'],[.727,.099,'rim'],[.735,.088,'tile'],[.750,.071,'warm'],[.762,.050,'tile'],[.772,.027,'silver'],[.773,.001,'rim']],bridgeSectors,0,0,inDeck);
 lathe([[.765,.036,'silver'],[.776,.036,'panel'],[.778,.033,'lift'],[.846,.033,'panel'],[.853,.039,'silver']],bridgeSectors,0,0,inDeck);
 for(const z of [.779,.815,.845])lathe([[z-.0015,.034,'panel'],[z+.0015,.034,'panel']],bridgeSectors,0,0,inDeck);
 for(let i=0;i<6;i++){const a=tau*i/6;surface(a,a+.075,.0334,.778,.0334,.846,0,0,'silver',inDeck);}
 // Eight paired axial/lateral cold-gas pods. Axial outlets are opposed
 // on the two ends of the drum; lateral black ceramic throats face out.
 for(let i=0;i<4;i++){
  const a=tau*i/4,axis=[Math.cos(a),Math.sin(a),0],tan=[-axis[1],axis[0],0];
  const bell=[[.209,.035,'well'],[.238,.044,'panel'],[.258,.033,'silver'],[.271,.032,'copper'],[.284,.031,'silver'],[.284,.022,'well'],[.259,.014,'engine'],[.259,0,'well']];
  for(let h=1;h<bell.length;h++)for(let k=0;k<8;k++){
   const at=([d,r],t)=>[axis[0]*d+tan[0]*r*Math.cos(t),axis[1]*d+tan[1]*r*Math.cos(t),-.582+r*Math.sin(t)];
   const A=k*tau/8,B=A+tau/8,ps=[at(bell[h-1],A),at(bell[h-1],B),at(bell[h],B),at(bell[h],A)];
   add(ps,bell[h-1][2],h===5?axis:[tan[0]*Math.cos((A+B)/2),tan[1]*Math.cos((A+B)/2),Math.sin((A+B)/2)]);
  }
  for(const sign of [-1,1]){
   const z=sign>0?.645:.35,r=.473;
   const pt=(R,t,h)=>[R*axis[0]+t*tan[0],R*axis[1]+t*tan[1],z+sign*h];
   const front=sign===1?'warm':'silver';
   for(const ix of [[0,1],[1,2],[2,3],[3,0]]){
    const corners=[[-.027,-.013],[.027,-.013],[.023,.012],[-.023,.012]],xy=ix.map(k=>corners[k]);
    const ps=[pt(r-.023,...xy[0]),pt(r+.009,...xy[0]),pt(r+.009,...xy[1]),pt(r-.023,...xy[1])];
    add(ps,front,mean(ps).map((q,j)=>q-pt(r-.007,0,0)[j]));
   }
   const disk=(outer,inner,axial,mat)=>{
    const at=(ang,rad)=>axial?pt(r+rad*Math.cos(ang),rad*Math.sin(ang),.016):pt(r+.011,rad*Math.cos(ang),rad*Math.sin(ang));
    for(let k=0;k<8;k++){const A=k*tau/8,B=(k+1)*tau/8;
     add([at(A,outer),at(B,outer),at(B,inner),at(A,inner)],mat,axial?[0,0,sign]:axis);}
   };
   disk(.014,.009,true,'copper');disk(.009,.0001,true,'well');
   disk(.014,.009,false,'silver');disk(.009,.0001,false,'well');
   // A small double-ended roll nozzle faces tangentially along each deck rim.
   for(const side of [-1,1])for(let k=0;k<8;k++){
    const at=(rad,angle)=>pt(r+rad*Math.cos(angle),side*.030,rad*Math.sin(angle));
    const A=tau*k/8,B=tau*(k+1)/8,out=tan.map(v=>v*side);
    add([at(.009,A),at(.009,B),at(.005,B),at(.005,A)],'silver',out);
    add([at(.005,A),at(.005,B),at(0,0)],'well',out);
   }
  }
 }
 const up=[0,0,1],glaze=(a,r)=>ver(a,.405*Math.cos(r),.68+.18*Math.sin(r)),roof=(a,r,z=.684)=>ver(a,r,z);
 for(let j=0;j<n;j++){
  const a=tau*j/n,b=tau*(j+1)/n,m=(a+b)/2,norm=[Math.cos(m),Math.sin(m),0];
  for(const [z,r,Z,R] of [[.364,.463,.401,.470],[.468,.491,.482,.491],[.601,.456,.645,.451]])surface(a,a+(b-a)*.09,r,z,R,Z,0,0,'silver');
  if(detail){
   // Subdivide each curved nameplate on the same facet boundaries as the
   // hull. Occluding panels never saw through an adjacent letter.
   const center=Math.round(m/(tau/3))*(tau/3),lo=center-.34,hi=center+.34;
   if(b>lo&&a<hi){
    const start=Math.max(a,lo),end=Math.min(b,hi),mark=(u,v)=>ver(lo+(hi-lo)*u,.492,.484+.061*v);
    const left=(start-lo)/(hi-lo),right=(end-lo)/(hi-lo);
    add([mark(left,0),mark(right,0),mark(right,1),mark(left,1)],'rim',norm,{decal:{map:mark,left,right}});
   }
  }
  const top=(A,B,r,R,z,material)=>add([roof(A,r,z),roof(A,R,z),roof(B,R,z),roof(B,r,z)],material,up,{interior:true});
  top(a,b,.061,.405,.685,j%6===1?'meadow':'garden');
  top(a,b,.194,.214,.686,'path');top(a,b,.362,.372,.686,'path');
  if(j%3===0)top(a,a+(b-a)*.23,.063,.365,.687,'path');
  if(detail){
   top(a+.13*(b-a),b-(b-a)*.10,.228,.31,.688,j%4===0?'crops':'meadow');
   // Low rounded crowns in groves, staggered so the central observation aisle stays clear.
   const tree=(r,z=.692)=>{const x=r*Math.cos(m),y=r*Math.sin(m),h=.028+.009*(j%3),w=.016+.004*(j%2);
    for(let k=0;k<6;k++){
     const A=tau*k/6,B=tau*(k+1)/6;
     add([ver(A,w,z+h*.35,x,y),ver(B,w,z+h*.35,x,y),[x,y,z+h]],k%3===0?'leaf':'forest',[Math.cos((A+B)/2),Math.sin((A+B)/2),1],{interior:true});
    }
   };
   if(j%3!==0)tree(.277+.012*(j%3));if(j%2===0)tree(.141);
  }

  for(let k=0;k<5;k++){
   const t=k*Math.PI/10,T=Math.min((k+1)*Math.PI/10,Math.acos(MERIDIAN_ROOF_OPENING/.405)),pts=[glaze(a,t),glaze(b,t),glaze(b,T),glaze(a,T)],out=[Math.cos(m)*Math.cos(t),Math.sin(m)*Math.cos(t),Math.sin(T)];
   const props={alpha:.13+.05*(j%6===2),interior:true};
   add(pts,'glazing',out,props);
   if(j%Math.max(1,Math.round(n/12))===0) add([glaze(a,t),glaze(a+(b-a)*.08,t),glaze(a+(b-a)*.08,T),glaze(a,T)],'silver',out,{interior:true});
   if(k===2)add([glaze(a,t),glaze(b,t),glaze(b,t+.014),glaze(a,t+.014)],'silver',out,{interior:true});
  }
 }
 cache.set(n,{vertices,faces});return cache.get(n);
}
// The shield runs on the outside of the glazing. Parameterize its panels by
// latitude above the rim and a helical blade coordinate. A slight rake on
// the advancing ends exposes the overlapping leaves around the aperture.
const irisCache=new Map();
export function meridianIris(closure,detail=true){
 const c=Math.max(0,Math.min(1,closure||0)),key=c+':'+detail;
 if(irisCache.has(key))return irisCache.get(key);
 const vertices=[],faces=[];
 if(c>0){
  const steps=Math.max(1,Math.ceil(c*(detail?8:4)));
  const slices=detail?[0,.055,.36,.68,1]:[0,.07,.54,1];
  const latitude=(t,h)=>h*Math.max(0,Math.min(1,c+.085*Math.sin(Math.PI*c)*(.5-t)));
  for(let leaf=0;leaf<12;leaf++){
   const start=vertices.length;
   for(let k=0;k<=steps;k++)for(const t of slices){
    const u=latitude(t,k/steps),theta=Math.min(u*Math.PI/2,Math.acos(MERIDIAN_ROOF_OPENING/.412)),a=(leaf+t-.72*u)*tau/12;
    vertices.push(ver(a,.412*Math.cos(theta),.68+.185*Math.sin(theta)));
   }
   const cols=slices.length;
   for(let k=0;k<steps;k++)for(let j=0;j<cols-1;j++){
    const a=start+k*cols+j,ids=[a,a+1,a+1+cols,a+cols];
    const center=mean(ids.map(i=>vertices[i]));
    const g=[center[0]/(.412**2),center[1]/(.412**2),(center[2]-.68)/(.185**2)],L=Math.hypot(...g);
    faces.push({iris:true,ids,center,normal:g.map(x=>x/L),material:j===0?'irisEdge':(leaf%3===1?'irisSilver':'irisPearl')});
   }
  }
 }
 const mesh={vertices,faces};
 // Reuse settled, paused and repeated passes without retaining an animation's history.
 if(irisCache.size>=5)irisCache.delete(irisCache.keys().next().value);
 irisCache.set(key,mesh);return mesh;
}
// The rigid rim stays flush when stowed; concentric bellows telescope only
// in the direction of the approach axis. All strokes remain inside r = 1.
const portCache=new Map();
export function meridianDockPort(extension=0){
 const e=Math.max(0,Math.min(1,extension));if(portCache.has(e))return portCache.get(e);
 const mesh=assembler();
 const z=MERIDIAN_DOCK_TIP_STOWED,L=MERIDIAN_DOCK_STROKE*e,R=MERIDIAN_DOCK_OUTER,r=MERIDIAN_DOCK_INNER;
 const sectors=32,seat=MERIDIAN_DOCK_SEAT,deck=MERIDIAN_HATCH_Z,tip=z+L;
 mesh.lathe([[.845,r,'silver'],[.845,seat,'panel'],[.857,seat,'silver'],[.857,r,'well'],[.845,r,'well']],sectors);
 const sleeve=[[.851,R-.003,'well']];
 for(let i=0;i<8;i++){
  const span=tip-.006-.851;
  sleeve.push([.851+span*(i+.47)/8,R-.002,'silver'],[.851+span*(i+1)/8,R-.005,'well']);
 }
 sleeve.push([tip-.007,R,'warm'],[tip-.0055,R,i=>i%6<2?'dockAmber':'warm'],[tip-.0035,R,'warm'],[tip,R,'rim'],[tip,r,'well'],[.845,r,'well']);
 mesh.lathe(sleeve,sectors);
 // Pressure bulkhead is fixed to the canopy, below the sliding cup. Its face
 // is fully closed on both sides; no imaginary sky or glass in the bore.
 for(let i=0;i<sectors;i++){
  const a=tau*i/sectors,b=tau*(i+1)/sectors;
  mesh.add([[0,0,deck],ver(a,r,deck),ver(b,r,deck)],'lift',[0,0,1]);
  mesh.add([[0,0,deck],ver(a,r,deck),ver(b,r,deck)],'lift',[0,0,-1]);
  mesh.surface(a,b,r*.84,deck+.00015,r*.81,deck+.00015,0,0,'seam');
  if(i%4===0)mesh.surface(a,a+.055,seat-.010,.85715,seat-.006,.85715,0,0,'well');
 }
 mesh.add([[-.0014,-.8*r,deck+.0002],[.0004,-.8*r,deck+.0002],[.0004,.8*r,deck+.0002],[-.0014,.8*r,deck+.0002]],'seam',[0,0,1]);
 if(e===0||e===1)portCache.set(e,mesh);
 return mesh;
}
// Axial engine jets during burns; the short tangential correction jet appears
// while turning. Each plume uses model coordinates and sorts with the hull.
export function meridianExhaust(power,steer,rcs=null,torque=null){
 const mesh=assembler();
 function plume(center,tip,rad,lateral){
  const u=lateral==='y'?[1,0,0]:lateral?[0,1,0]:[1,0,0],v=lateral?[0,0,1]:[0,1,0];
  for(let i=0;i<6;i++){
   const ang=tau*(i+.5)/6,normal=u.map((x,k)=>x*Math.cos(ang)+v[k]*Math.sin(ang));
   const point=a=>center.map((x,k)=>x+rad*(Math.cos(a)*u[k]+Math.sin(a)*v[k]));
   mesh.add([point(tau*i/6),point(tau*(i+1)/6),tip],'lit',normal,{alpha:.68,exhaust:true});
  }
 }
 if(!rcs)for(const [j,command] of [[0,(rcs?0:steer)+(torque?.[1]||0)],[1,-(torque?.[0]||0)]])if(Math.abs(command)>.001){
  const sign=Math.sign(command),base=[0,0,-.582];base[j]=sign*.284;
  const tip=[...base];tip[j]+=sign*(.07+.12*Math.min(1,Math.abs(command)));
  plume(base,tip,.019,j===0?'x':'y');
 }
 if(rcs){
  for(const {axis:along,position:base,duty:strength} of rimJets(rcs||[0,0,0],torque||[0,0,0])){
   if(strength<.00001)continue;
   const tan=Math.abs(along[2])>.5?[1,0,0]:[-along[1],along[0],0],normalB=Math.abs(along[2])>.5?[0,1,0]:[0,0,1];
   const visible=Math.pow(strength,.43);
   for(const [extent,radius,alpha,color] of [[.115,.012,.36,'cyan'],[.058,.008,.85,'lit']]){
    for(let k=0;k<8;k++){
     const A=tau*k/8,B=tau*(k+1)/8,at=t=>base.map((v,j)=>v+radius*(Math.cos(t)*tan[j]+Math.sin(t)*normalB[j]));
     const tip=base.map((v,j)=>v+along[j]*extent*Math.sqrt(visible));
     mesh.add([at(A),at(B),tip],color,tan.map((v,j)=>v*Math.cos((A+B)/2)+normalB[j]*Math.sin((A+B)/2)),{alpha:alpha*visible,exhaust:true});
    }
   }
  }
  if(rcs)return mesh; // Interlock the main engines only for the close corridor.
 }
 if(power>.001)for(const x of [-.13,.13])for(const y of [-.13,.13])plume([x,y,-.852],[x,y,-.86-.12-.48*Math.min(1,power)],.067,false);
 return mesh;
}
