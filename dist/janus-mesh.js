import {JANUS_RADIUS,JANUS_WINDOW,JANUS_PORT,JANUS_SEAT_X,JANUS_SEAT_PARTS,JANUS_DASH,janusDashPoint,JANUS_COLORS} from './janus-hull.js';
const R=JANUS_RADIUS, W=JANUS_WINDOW;

// Canvas companion to the analytic Janus hull. Actual openings, seats, separate
// depth-sorted glazing, landing struts, and thrusters share the +Z bow chart.
const cache=new Map(),tau=2*Math.PI;
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
function geometry(){
 const vertices=[],faces=[],keys=new Map();
 const vertex=p=>{const k=p.map(v=>Math.round(v*1e6)).join(',');if(!keys.has(k)){keys.set(k,vertices.length);vertices.push(p);}return keys.get(k);};
 const face=(pts,material,interior,props={})=>{
  const c=pts[0].map((_,k)=>pts.reduce((s,p)=>s+p[k],0)/pts.length),n=unit(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])));
  faces.push({ids:pts.map(vertex),normal:interior&&dot(n,sub(c,interior))<0?n.map(v=>-v):n,center:c,material,...props});
 };
 function ellipsoid(o,s,m,n=16,bands=9,choose=null){
  const point=(a,b)=>[o[0]+s[0]*Math.cos(b)*Math.sin(a),o[1]+s[1]*Math.sin(b),o[2]+s[2]*Math.cos(b)*Math.cos(a)];
  for(let j=0;j<bands;j++)for(let i=0;i<n;i++){
   const a=i*tau/n,b=-Math.PI/2+j*Math.PI/bands,h=Math.PI/bands,g=tau/n;
   const mat=choose?choose(point(a+g/2,b+h/2)):m;if(!mat)continue;
   const p=[point(a,b),point(a+g,b),point(a+g,b+h),point(a,b+h)];if(j===0)p.splice(0,1);if(j===bands-1)p.splice(2,1);
   face(p,mat,o);
  }
 }
 function tube(a,b,r0,r1,m,n=12,options={}){
  const axis=unit(sub(b,a)),x=unit(cross(axis,Math.abs(axis[1])<.8?[0,1,0]:[1,0,0])),y=cross(axis,x);
  const point=(o,r,j)=>o.map((p,k)=>p+r*(Math.cos(tau*j/n)*x[k]+Math.sin(tau*j/n)*y[k]));
  const mid=a.map((v,i)=>(v+b[i])*.5);for(let i=0;i<n;i++)face([point(a,r0,i),point(a,r0,i+1),point(b,r1,i+1),point(b,r1,i)],m,mid,options);
 }
 function box(o,h,m,transform=p=>p){
  const corner=(i,j,k)=>transform([o[0]+i*h[0],o[1]+j*h[1],o[2]+k*h[2]]);
  const center=transform(o);
  for(const s of [-1,1]){
   face([corner(s,-1,-1),corner(s,1,-1),corner(s,1,1),corner(s,-1,1)],m,center);
   face([corner(-1,s,-1),corner(1,s,-1),corner(1,s,1),corner(-1,s,1)],m,center);
   face([corner(-1,-1,s),corner(1,-1,s),corner(1,1,s),corner(-1,1,s)],m,center);
  }
 }
 return {vertices,faces,face,ellipsoid,tube,box};
}
export function janusMesh(detailed=true){
 if(cache.has(detailed))return cache.get(detailed);
 const g=geometry(),{face,ellipsoid,tube}=g,z=(x,y)=>Math.sqrt(Math.max(0,R*R-x*x-y*y));
 const aperture=(x,y)=>{const a=Math.abs(x)-W.halfWidth+W.corner,b=Math.abs(y-W.y)-W.halfHeight+W.corner;return Math.hypot(Math.max(a,0),Math.max(b,0))+Math.min(Math.max(a,b),0)-W.corner;};
 const segments=detailed?60:32;
 const onShell=(x,y)=>[x,y,z(x,y)];
 const corner=i=>{const a=tau*i/segments,dx=Math.cos(a),dy=Math.sin(a);let lo=0,hi=.65;
  for(let j=0;j<18;j++){const r=(lo+hi)/2;if(aperture(r*dx,W.y+r*dy)<0)lo=r;else hi=r;}return [dx*lo,W.y+dy*lo];};
 const curve=(v,f)=>[v[0]*f,W.y+(v[1]-W.y)*f];
 const outside=v=>{
  const x=v[0],y=v[1]-W.y,A=x*x+y*y,B=W.y*y;
  const t=(Math.sqrt(B*B+A*(R*R-W.y*W.y))-B)/A;
  return [t*x,W.y+t*y];
 };
 const shell=(v,t)=>{const outer=outside(v),a=Math.sin(t*Math.PI/2),x=v[0]+(outer[0]-v[0])*a,y=v[1]+(outer[1]-v[1])*a;return [x,y,t===1?0:z(x,y)];};
 const back=(v,t)=>{const [x,y]=outside(v),a=t*Math.PI/2;return [x*Math.cos(a),y*Math.cos(a),-R*Math.sin(a)];};
 for(let j=0;j<segments;j++){
  const a=corner(j),b=corner(j+1),h=detailed?12:7;
  for(let k=0;k<h;k++){
   face([shell(a,k/h),shell(a,(k+1)/h),shell(b,(k+1)/h),shell(b,k/h)],'tile',[0,0,0],{hull:true});
   const q=[back(a,k/h),back(b,k/h),back(b,(k+1)/h),back(a,(k+1)/h)];if(k===h-1)q.pop();
   face(q,'tile',[0,0,0],{hull:true});
  }
  face([curve(a,1),curve(b,1),curve(b,.966),curve(a,.966)].map(([x,y])=>onShell(x,y)),'seam',[0,0,0],{hull:true});
  for(let f=0;f<3;f++){
   const i=f/3*.966,o=(f+1)/3*.966;let pts=[curve(a,o),curve(b,o),curve(b,i),curve(a,i)];if(f===0)pts.pop();
   face(pts.map(([x,y])=>onShell(x,y)), 'janusGlass',[0,0,0],{alpha:.13});
  }
 }
 // Every port disk is inscribed on the same outer sphere. Fourfold
 // rotational symmetry leaves the bow and both side banks identical.
 const {across,height,axial,inner,outer}=JANUS_PORT;
 for(const x of [-1,1])for(const y of [-1,1])for(const zSign of [-1,1])for(const side of [false,true]){
  const center=[x*(side?axial:across),y*height,zSign*(side?across:axial)],n=unit(center),u=unit(cross(n,[0,1,0])),v=cross(n,u);
  const at=(a,rad)=>unit(center.map((p,k)=>p+rad*(Math.cos(a)*u[k]+Math.sin(a)*v[k]))).map(p=>p*R);
  const count=detailed?10:7;
  const disk=Array.from({length:count},(_,i)=>at(tau*i/count,inner));face(disk,'well',[0,0,0],{janusPaint:true,port:true});
  for(let i=0;i<count;i++)face([at(tau*i/count,inner),at(tau*i/count,outer),at(tau*(i+1)/count,outer),at(tau*(i+1)/count,inner)],'silver',[0,0,0],{janusPaint:true});
 }
 const start=g.faces.length;
 const tr=p=>janusDashPoint(...p);
 const panel=(points,material,depth=1)=>{
  const z=-Math.sign(depth)*(JANUS_DASH.half[2]+Math.abs(depth)*.00035);
  face(points.map(([x,y])=>tr([x,y,z])),material,JANUS_DASH.center,{sortCenter:tr([0,0,z])});
 };
 const rect=(x1,x2,y1,y2,material,layer)=>panel([[x1,y1],[x2,y1],[x2,y2],[x1,y2]],material,layer);
 const stroke=(x1,y1,x2,y2,width,material)=>{
  const scale=width/Math.hypot(y2-y1,x2-x1),nx=-(y2-y1)*scale,ny=(x2-x1)*scale;
  panel([[x1+nx,y1+ny],[x1-nx,y1-ny],[x2-nx,y2-ny],[x2+nx,y2+ny]],material,3);
 };
 g.box([0,0,0],JANUS_DASH.half,'janusDark',tr);
 for(const side of [-1,1]){
  const x=side*JANUS_SEAT_X;
  for(const part of JANUS_SEAT_PARTS){
   const c=part.center.map((v,i)=>v+(i===0?x:0));
   if(part.kind==='box')g.box(c,part.half,part.material);
   else ellipsoid(c,part.half,part.material,detailed?12:8,detailed?7:5);
  }
  for(const sg of [-1,1])tube([x+sg*.043,-.092,-.117],[x+sg*.065,.149,-.133],.009,.011,'janusHarness',5);
  g.box([x,-.213,.447],[.041,.216,.039],'janusFrame');
  const screen=side*.205;
  rect(screen-.123,screen+.123,-.041,.079,'janusRim',1);
  rect(screen-.117,screen+.117,-.035,.073,'janusScreen',2);
  const cx=screen-.020,cy=.019;
  if(side<0){
   for(let i=0;i<18;i++){
    const a=i*tau/18,b=(i+1)*tau/18;
    stroke(cx+.035*Math.cos(a),cy+.035*Math.sin(a),cx+.035*Math.cos(b),cy+.035*Math.sin(b),.0014,'janusReadout');
   }
   stroke(cx-.054,cy-.003,cx+.054,cy-.003,.0013,'janusReadout');
   for(const s of [-1,1])stroke(cx,cy-.001,cx+s*.019,cy-.005,.0018,'janusAmber');
  }else{
   const trace=z=>cy+.012*Math.sin(z*41)+.005*Math.cos(z*84);
   for(let j=0;j<14;j++){
    const x0=-.085+j*.17/14,x1=x0+.17/14;stroke(cx+x0,trace(x0),cx+x1,trace(x1),.0018,'janusReadout');
   }
  }
  for(let j=0;j<6;j++){
   const y=cy-.04+j*.014;rect(screen+.076,screen+.084+.020*((j*.37+.13)%1),y,y+.0045,'janusReadout',3);
   const k=screen-.09+j*.033;rect(k,k+.018,-.078,-.061,Math.abs(k)<.16?'janusAmber':'janusRim',3);
  }
  for(let j=0;j<7;j++){
   const y=-.049+j*.010;rect(screen-.14,screen+.14,y,y+.003,'janusFrame',-1);
  }
  rect(screen-.175,screen+.175,.067,.071,'janusRim',-1);
 }
 const floorY=-.406,fr=z(0,floorY);
 const floor=Array.from({length:32},(_,i)=>[fr*Math.cos(i*tau/32),floorY,fr*Math.sin(i*tau/32)]);
 face(floor,'janusFloor',[0,-.5,0]);
 for(let i=start;i<g.faces.length;i++)g.faces[i].cabin=true;
 for(let i=0;i<3;i++){
  const a=i*tau/3,pt=(r,y)=>[r*Math.sin(a),y,r*Math.cos(a)];
  const landingStart=g.faces.length;
  tube(pt(.357,-.690),pt(.387,-.843),.021,.021,'silver',8);tube(pt(.454,-.636),pt(.387,-.831),.010,.010,'seam',6);
  ellipsoid(pt(.387,-.843),[.068,.018,.056],'panel',12,6);
  for(let k=landingStart;k<g.faces.length;k++)g.faces[k].landingGear=true;
 }
 const name=(u,v)=>onShell((u-.5)*.331,-.225+v*.105);
 for(let j=0;j<10;j++){const l=j/10,r=(j+1)/10;face([name(l,0),name(r,0),name(r,1),name(l,1)],'tile',[0,0,0],{decal:{map:name,left:l,right:r},janusInk:true});}
 const mesh={vertices:g.vertices,faces:g.faces};cache.set(detailed,mesh);return mesh;
}
export function janusInterior(pane,eye,forward){
 const mesh=janusMesh(false);
 for(const f of mesh.faces){
  if(!f.hull&&!f.cabin)continue;
  const normal=f.hull?f.normal.map(v=>-v):f.normal;
  if(dot(normal,sub(eye,f.center))<=0)continue;
  const points=f.ids.map(i=>mesh.vertices[i]);
  if(points.every(p=>dot(sub(p,eye),forward)<.001))continue;
  const mat=f.hull?(f.material==='seam'?'janusDark':'janusWall'):f.material;
  const data=JANUS_COLORS[mat].slice(1),light=.62+.38*Math.max(0,dot(normal,[-.35,.65,.61]));
  const color='#'+[0,2,4].map(k=>Math.floor(parseInt(data.slice(k,k+2),16)*light).toString(16).padStart(2,'0')).join('');
  pane(points,color,1,f.sortCenter);
 }
}
export function janusExhaust(power,yaw){
 const g=geometry(),p=Math.max(0,Math.min(1,power));
 function plume(start,direction,r,L,strength){
  const point=t=>start.map((v,k)=>v+direction[k]*t);
  for(const [a,b,r0,r1,m,alpha] of [[0,.22,.68,1,'jetCore',.38],[.22,.60,1,.70,'jetHalo',.17],[.60,1,.70,.05,'jetHalo',.06]])g.tube(point(a*L),point(b*L),r*r0,r*r1,m,7,{alpha:alpha*strength,exhaust:true});
 }
 const {across:x,height:y,axial:a,inner}=JANUS_PORT;
 for(const sy of [-1,1])for(const s of [-1,1]){
  if(p>0)plume([s*x,sy*y,-a],[0,0,-1],inner,.07+.13*p,Math.sqrt(p));
  if(Math.abs(yaw)>.01){
   const sign=s*Math.sign(yaw);plume([sign*a,sy*y,s*x],[sign,0,0],inner,.105,Math.sqrt(Math.abs(yaw)));
  }
 }
 return {vertices:g.vertices,faces:g.faces};
}
