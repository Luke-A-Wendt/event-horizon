import {EARTH_OUTLINES} from './earth-outlines.js';
// Bounded vector geography for the worker's Canvas fallback: no texture
// decoding, per-pixel pass or screen-fixed continent shapes.
const tau=2*Math.PI;
const clamp=v=>Math.min(1,Math.max(0,v));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const globe=(lon,lat)=>[Math.cos(lon)*Math.cos(lat),Math.sin(lat),Math.sin(lon)*Math.cos(lat)];
let geometry;
function earthGeometry(){
 if(!geometry){
  const cache=new Map();
  const vertex=code=>{if(!cache.has(code)){cache.set(code,globe((.5-(code%512)/480)*tau,(.5-Math.floor(code/512)/240)*Math.PI));}return cache.get(code);};
  geometry=EARTH_OUTLINES.map(layer=>layer.map(([center,rings])=>[vertex(center),rings.map(loop=>loop.map(vertex))]));
 }
 return geometry;
}
function* earthCanvasStages(ctx,{r,basis,view,light,time,color,coarse}){
 const ex=basis.map(b=>dot(b,view.right)),ey=basis.map(b=>-dot(b,view.up)),ez=basis.map(b=>-dot(b,view.forward));
 const px=p=>r*dot(p,ex),py=p=>r*dot(p,ey);
 ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,tau);ctx.clip();
 ctx.fillStyle=color('#173e64');ctx.fillRect(-r,-r,2*r,2*r);
 const palette=['#687658','#b19668','#dce4e9'],layers=earthGeometry();
 for(let i=0;i<layers.length;i++){
  ctx.fillStyle=color(palette[i]);ctx.beginPath();
  for(const [center,rings] of layers[i]){
   if(dot(center,ez)<-.40)continue;
   for(const loop of rings){
    let a=loop.at(-1),az=dot(a,ez),started=false;
    const add=(x,y)=>{if(started)ctx.lineTo(x,y);else{ctx.moveTo(x,y);started=true;}};
    let lastX=Infinity,lastY=Infinity;
    for(const b of loop){
     const bz=dot(b,ez);
     if((az<0)!==(bz<0)){const t=az/(az-bz),ix=px(a)*(1-t)+px(b)*t,iy=py(a)*(1-t)+py(b)*t;add(ix,iy);}
     if(bz>=0){const x=px(b),y=py(b);if(Math.abs(x-lastX)+Math.abs(y-lastY)>=(coarse?2.4:1)){add(x,y);lastX=x;lastY=y;}}
     a=b;az=bz;
    }
    if(started)ctx.closePath();
   }
  }
  ctx.fill('evenodd');yield;
 }
 // Interrupted fronts and spiral arms follow rotating, body-fixed latitudes.
 const drift=.09*Math.sin(time*.0016);
 function cloudStroke(fn,steps){
  ctx.beginPath();let pen=false;
  for(let j=0;j<=steps;j++){
   const [lon,lat]=fn(j/steps),p=globe(lon+drift,lat);
   if(dot(p,ez)<0){pen=false;continue;}
   if(pen)ctx.lineTo(px(p),py(p));else ctx.moveTo(px(p),py(p));pen=true;
  }
  ctx.stroke();
 }
 for(let i=0;i<(coarse?20:40);i++){
  const lon=i*2.39996,lat=Math.asin(1-2*(i+.5)/(coarse?20:40))*.83;
  ctx.strokeStyle=color(i%3===0?'#f0f3ed':'#c3d2df',.42+(i%5)*.071);
  ctx.lineWidth=Math.max(.45,r*(.006+.003*(i%4)));
  cloudStroke(t=>[lon+(t-.5)*(.35+.17*(i%5)),lat+.064*Math.sin(t*4.7+i)+.012*Math.sin(t*13+i)],12);
 }
 for(let i=0;i<5;i++){
  const lon=i*2.39996+1.2,lat=[.51,-.55,.71,-.79,.42][i];
  ctx.strokeStyle=color('#e7edf2',.78);ctx.lineWidth=Math.max(.5,r*.011);
  for(let arm=0;arm<2;arm++)cloudStroke(t=>{const a=t*4.6*Math.sign(lat)+Math.PI*arm,rr=.012+.16*t;return[lon+Math.cos(a)*rr/Math.cos(lat),lat+Math.sin(a)*rr*.74];},18);
 }
 yield;
 const lx=dot(light,view.right),ly=-dot(light,view.up),lz=-dot(light,view.forward);
 // At projected latitude y, the terminator lies at x=-lz*sqrt(1-y²).
 // Concentric optical bands shade the map and clouds together at every phase.
 ctx.rotate(Math.atan2(ly,lx));
 ctx.fillStyle='rgba(1,8,20,.37)';
 for(let k=0;k<6;k++){
  const edge=Math.max(-1,Math.min(1,-lz+(2.5-k)*.033));
  if(edge<=-.9999)continue;
  ctx.beginPath();ctx.moveTo(0,-r);
  for(let j=1;j<=28;j++){const a=Math.PI*(j/28-.5);ctx.lineTo(r*edge*Math.cos(a),r*Math.sin(a));}
  ctx.arc(0,0,r,Math.PI*.5,Math.PI*1.5);ctx.closePath();ctx.fill();
 }
 ctx.restore();
}
export {earthCanvasStages};
