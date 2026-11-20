import {cameraRelative} from './camera-framing.js';
import {REFERENCE_RG_METERS} from './objects.js';
import {pelagiaSurface,CREST_GAIN,CREST_DATUM_METERS,CREST_BLEND_METERS} from './pelagia-tide.js';

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],unit=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
const clip01=x=>Math.max(0,Math.min(1,x)),blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*clip01(t));
const hex=rgb=>'#'+rgb.map(v=>Math.min(255,Math.max(0,Math.round(v))).toString(16).padStart(2,'0')).join('');
// Clip in the tangent patch before projection: mixed cells get an interpolated
// coastline, rather than toggling a whole polygon from rock to water.
function splitFace(poly,field){
 const positive=[],negative=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];
  (a[field]>=0?positive:negative).push(a);
  if((a[field]>=0)===(b[field]>=0))continue;
  const t=a[field]/(a[field]-b[field]),v=a.map((x,k)=>x+(b[k]-x)*t);
  v[field]=0;positive.push(v);negative.push(v);
 }
 return [positive,negative];
}

// Screen-facing tessellation avoids wasting the Canvas command budget on the
// far hemisphere. Each vertex uses the same solid and free-surface radii as
// the ray tracer. All projection uses centre-relative doubles (also for zoom).
export const pelagiaCanvasStages=function*(renderer,body,cpuColor){
 const {cameraFrame:cam,context2d:ctx,state,canvas}=renderer,tide=body.oceanTide,basis=body.tidalBasis;
 if(!tide||!basis||!cam)return;
 const local=v=>basis.map(axis=>dot(v,axis)),eye=local(cameraRelative(body.position,cam)).map(x=>-x*REFERENCE_RG_METERS);
 const dist=Math.hypot(...eye),R=tide.radiusMeters;
 if(!(dist>R*.98))return;
 const pole=unit(eye),right=local(cam.right),up=local(cam.up),forward=local(cam.forward),ar=dot(right,pole);
 let crossX=unit(right.map((x,i)=>x-ar*pole[i]));
 if(Math.abs(ar)>.99999){const au=dot(up,pole);crossX=unit(up.map((x,i)=>x-au*pole[i]));}
 const crossY=[pole[1]*crossX[2]-pole[2]*crossX[1],pole[2]*crossX[0]-pole[0]*crossX[2],pole[0]*crossX[1]-pole[1]*crossX[0]];
 const limit=Math.min(Math.PI*.77,Math.acos(Math.min(1,R/dist))+.82*tide.crestMeters/(.1*R+tide.crestMeters)),w=canvas.width,h=canvas.height,px=h/(.83*Math.max(1,1.35*h/w));
 const radiusPx=px*R/Math.sqrt(Math.max(1,dist*dist-R*R)),quality=renderer.cpuProfile?.ringSegments||16;
 const rings=Math.max(3,Math.min(24,Math.round(quality*.45),Math.ceil(radiusPx/3.5))),cols=4*rings;
 const angles=Array.from({length:cols},(_,j)=>[Math.cos(j*2*Math.PI/cols),Math.sin(j*2*Math.PI/cols)]);
 let source=null,minSq=Infinity;
 for(const star of renderer.objectFrames||[]){
  if(star.type!=='star'||star.collapsed)continue;
  const d=star.position.map((x,i)=>x-body.position[i]),dd=dot(d,d);
  if(dd>0&&dd<minSq){minSq=dd;source=d;}
 }
 const light=unit(local(source||(renderer.holeData?Array.from(renderer.holeData.slice(0,3),(v,i)=>v-body.position[i]+(i===1?1.7*(renderer.massScale||1):0)):[0,1,.5])));
 const geom=state.spectrum==='geometry';
 // Packed patch vertex: depth, camera x/y/z, relief, and radial normal.
 const vertex=(n)=>{
  const {depth,bed,drawMeters}=pelagiaSurface(tide,n),q=n.map((x,i)=>x*drawMeters-eye[i]);
  const x=n[0],head=tide.levelMeters+tide.relativeMeters*(1.5*x*x-.5),slope=3*x*tide.relativeMeters*(CREST_GAIN-1)*clip01((head-CREST_DATUM_METERS)/CREST_BLEND_METERS)/drawMeters;
  const normal=unit(n.map((v,i)=>v-slope*((i===0?1:0)-v*x)));
  return [depth,dot(q,right),dot(q,up),dot(q,forward),bed,...n,...normal];
 };
 const paint=(patch,water)=>{
  if(patch.length<3)return;
  const near=R*1e-8;
  if(patch.some(v=>v[3]<near)){
   if(patch.every(v=>v[3]<near))return;
   patch=splitFace(patch.map(v=>v.map((x,i)=>i===3?x-near:x)),3)[0];
   if(patch.length<3)return;patch=patch.map(v=>v.map((x,i)=>i===3?x+near:x));
  }
  const points=patch.map(v=>[w*.5+px*v[1]/v[3],h*.5-px*v[2]/v[3]]);
  if(points.every(v=>v[0]<0)||points.every(v=>v[0]>w)||points.every(v=>v[1]<0)||points.every(v=>v[1]>h))return;
  const n=unit([5,6,7].map(k=>patch.reduce((s,v)=>s+v[k],0))),mean=k=>patch.reduce((s,v)=>s+v[k],0)/patch.length;
  const look=unit(eye.map((v,i)=>v-n[i]*R)),sn=unit([8,9,10].map(mean));
  if(dot(sn,look)<-.035)return;
  let rgb;
  if(geom){const g=55+110*Math.max(0,dot(sn,unit(look.map((v,i)=>v+up[i]*.5-right[i]*.3))));rgb=[g,g,g];}
  else{
   const depth=mean(0),bed=mean(4),mu=Math.max(0,dot(sn,light)),illum=.058+.94*Math.sqrt(mu);
   const waterRgb=blend([56,142,151],[24,69,104],1-Math.exp(-Math.max(0,depth)/740));
   const rockRgb=blend([144,132,111],[113,97,84],Math.max(0,-depth)/1450);
   let base=water?waterRgb:blend(rockRgb,[178,171,155],(bed-1850)/2100);
   const half=unit(look.map((v,i)=>v+light[i])),glint=water&&mu>0?Math.pow(Math.max(0,dot(sn,half)),70)*Math.min(1,mu*8):0;
   const reflection=water?(1-Math.max(0,dot(sn,look)))**3:0;
   rgb=base.map((v,i)=>v*illum+glint*[151,161,162][i]+reflection*[10,34,51][i]);
  }
  const color=hex(rgb);
  ctx.fillStyle=!geom&&state.spectrum&&state.spectrum!=='visible'&&cpuColor?cpuColor(color,state.spectrum,'surface'):color;
  const cx=points.reduce((s,v)=>s+v[0],0)/points.length,cy=points.reduce((s,v)=>s+v[1],0)/points.length;
  ctx.beginPath();points.forEach(([x,y],i)=>{const dx=x-cx,dy=y-cy,g=.28/(Math.hypot(dx,dy)||1);(i?ctx.lineTo:ctx.moveTo).call(ctx,x+dx*g,y+dy*g);});ctx.closePath();ctx.fill();
 };
 const draw=face=>{
  if(geom||face.every(v=>v[0]>=0)){paint(face,true);return;}
  if(face.every(v=>v[0]<0)){paint(face,false);return;}
  const [water,land]=splitFace(face,0);paint(water,true);paint(land,false);
 };
 // A tall ocean crest can hide part of the rocky limb. Depth sort the strips
 // rather than painting the back edge of the sphere over a nearer crest.
 const visible=[],schedule=face=>visible.push([face,face.reduce((z,v)=>z+v[3],0)/face.length]);
 let prev=[vertex(pole)];
 for(let i=1;i<=rings;i++){
  const a=limit*i/rings,ca=Math.cos(a),sa=Math.sin(a);
  const next=angles.map(([cc,ss])=>vertex(pole.map((p,k)=>ca*p+sa*(cc*crossX[k]+ss*crossY[k]))));
  for(let j=0;j<cols;j++){
   const k=(j+1)%cols;
   if(i===1)schedule([prev[0],next[j],next[k]]);
   else{
    const face=[prev[j],next[j],next[k],prev[k]],wet=face.map(v=>v[0]>=0);
    if(wet[0]===wet[2]&&wet[1]===wet[3]&&wet[0]!==wet[1]){schedule([face[0],face[1],face[2]]);schedule([face[0],face[2],face[3]]);}
    else schedule(face);
   }
  }
  prev=next;yield;
 }
 visible.sort((a,b)=>b[1]-a[1]);
 for(let i=0;i<visible.length;i++){draw(visible[i][0]);if(i%cols===cols-1)yield;}
};
