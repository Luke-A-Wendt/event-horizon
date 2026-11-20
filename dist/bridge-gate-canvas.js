import {polygonFiller} from './cpu-commands.js';
import {GATE_VERTICES,GATE_EDGES,GATE_RAIL_SCALE,GATE_NODE_SCALE} from './bridge-gate-layout.js';
// Local chart hardware, projected cheaply by the CPU renderer. The reciprocal
// cage is drawn in the open aperture, without drawing any fictitious face panels.
const TAU=2*Math.PI,dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cache=new Map();
const unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function gateMesh(level){
 if(cache.has(level))return cache.get(level);
 const vertices=[],faces=[],points=new Map();
 const index=p=>{const k=p.map(x=>Math.round(x*1e5)).join(':');if(!points.has(k)){points.set(k,vertices.length);vertices.push(p);}return points.get(k);};
 let normalRef=null;
 const facet=(ps,c,w=0)=>{
  let light=1,plane=null;
  if(!w){const a=ps[1].map((v,i)=>v-ps[0][i]),b=ps[2].map((v,i)=>v-ps[0][i]),n=cross(a,b);
   if(c!=='field')light=.60+.40*Math.abs(dot(n,[.38,.55,.742]))/(Math.hypot(...n)||1);
   if(normalRef){const h=dot(n,ps[0]),sign=h>=dot(n,normalRef)?1:-1;plane=[n[0]*sign,n[1]*sign,n[2]*sign,h*sign];}}
  faces.push([ps.map(index),c,w,Math.round(light*12),plane]);
 };
 const rail=(a,b,c,w)=>facet([a,b],c,w*GATE_RAIL_SCALE);
 const band=(a,b,c)=>{for(let j=0;j<a.length;j++){const k=(j+1)%a.length;facet([a[j],a[k],b[k],b[j]],c);}};
 for(const [i,j] of GATE_EDGES){
  const a=GATE_VERTICES[i],b=GATE_VERTICES[j],length=Math.hypot(...a.map((v,k)=>v-b[k]));
  const mid=a.map((v,k)=>(v+b[k])/2),d=unit(b.map((v,k)=>v-a[k])),u=unit(mid),v=cross(d,u);
  const p=(t,x,y,travel=0)=>[...mid.map((m,k)=>m+d[k]*t+GATE_RAIL_SCALE*(u[k]*x+v[k]*y)),...d.map(m=>m*travel)];
  normalRef=mid;const n=level>0?8:4;
  const ring=(t,r,travel=0)=>Array.from({length:n},(_,k)=>p(t,r*Math.cos(TAU*(k+.5)/n),r*Math.sin(TAU*(k+.5)/n),travel));
  const end=length/2-.13;
  // Unclad magnet train, with spaced winding packs and an open triangular
  // equipment rack on its outer spine. The return pipes bridge the gaps.
  if(level<0){band(ring(-end,.094),ring(end,.094),'winding');continue;}
  band(ring(-.09,.066),ring(.09,.066),'steel');
  for(const t of [-.093,0,.093]){
   const a=ring(t-.053,.095),b=ring(t-.022,.18),c=ring(t+.022,.18),d=ring(t+.053,.095);
   band(a,b,'steel');band(b,c,'coolant');band(c,d,'steel');
  }
  for(const side of [-1,1]){
   for(let k=0;k<3;k++){
    const t=.12+k*.205;
    band(ring(side*t,.100),ring(side*(t+.145),.100),'winding');
    band(ring(side*(t+.145),.074),ring(side*(t+.205),.074),'graphite');
    if(level)band(ring(side*(t+.045),.104),ring(side*(t+.065),.104),'coil');
   }
   band(ring(side*(end-.15),.126,side*.035),ring(side*(end-.055),.126,side*.035),'steel');
  }
  for(const f of [-1,1]){
   rail(p(-end,.06,f*.13),p(end,.06,f*.13),'steel',.029);
   rail(p(-end,.17,f*.081),p(end,.17,f*.081),f<0?'saddle':'coolant',.026);
   for(let k=-1;k<=1;k++){const t=k*.49;rail(p(t-.21,.06,f*.13),p(t+.21,.17,f*.081),'panel',.018);}
  }
  // External RF pickup leads and a pair of ceramic feedthrough supports.
  for(const t of [-.33,.33]){
   rail(p(t,.12,.08),p(t,.25,.08),'shell',.037);
   rail(p(t,.25,.08),p(t+.08,.25,.08),'coolant',.025);
  }
  rail(p(-.085,.111,0),p(.085,.111,0),'field',.028);
  if((i===0&&j===1)||(i===7&&j===12)||(i===14&&j===19)){
   facet([p(-.256,.217,-.17),p(.256,.217,-.17),p(.256,.217,.17),p(-.256,.217,.17)],'shell');
   const strokes=[];faces[faces.length-1][5]=strokes;
   const mark=(a,b)=>strokes.push([index(a),index(b)]);
   // Single-stroke letters applied to the panel in its own 3-D plane.
   const letters=[[[0,0],[0,1],[.65,0],[.65,1]],[[0,0],[.33,1],[.68,0]],[[.67,1],[0,1],[0,.55],[.67,.45],[.67,0],[0,0]],[[0,0],[.33,1],[.68,0]]];
   for(let k=0;k<4;k++){
    const glyph=letters[k],pos=xy=>p(.8*(-.237+k*.127+xy[0]*.127),.22,.082-xy[1]*.164);
    for(let n=1;n<glyph.length;n++)mark(pos(glyph[n-1]),pos(glyph[n]));
    if(k===1||k===3)mark(pos([.15,.4]),pos([.52,.4]));
   }
  }
 }
 for(const center of GATE_VERTICES){
  normalRef=center;const d=unit(center),u=unit(cross(d,[0,0,1])),v=cross(d,u),n=level>0?8:6;
  const rim=(t,r)=>Array.from({length:n},(_,k)=>center.map((m,j)=>m+GATE_NODE_SCALE*(d[j]*t+r*(u[j]*Math.cos(k*TAU/n)+v[j]*Math.sin(k*TAU/n)))));
  // Three beams meet inside a faceted junction with a sealed diagnostic head.
  const lower=rim(-.14,.15),shoulder=rim(-.075,.217),seam=rim(.065,.217),upper=rim(.135,.159),cap=rim(.14,.099);
  if(level<0){band(lower,shoulder,'winding');band(shoulder,upper,'steel');facet(upper,'field');continue;}
  const nozzle=rim(-.24,.130),lip=rim(-.270,.116),optic=rim(-.274,.096);
  band(lower,nozzle,'steel');band(nozzle,lip,'winding');band(lip,optic,'graphite');facet(optic,'graphite');
  band(lower,shoulder,'panel');band(shoulder,seam,'graphite');band(seam,upper,'steel');band(upper,cap,'saddle');facet(cap,'field');
  for(let j=0;j<n;j+=2)rail(lower[j],upper[j],'coolant',.028);
 }
 const mesh={vertices,faces};cache.set(level,mesh);return mesh;
}
const palette={shell:'#dae2e2',coil:'#555c61',saddle:'#686e73',coolant:'#bac0c5',wordmark:'#aa3034',optic:'#3984f3',panel:'#57636a',steel:'#9aaab2',graphite:'#37434c',winding:'#c5c8ca',field:'#cad6dc'};
export function gateChart(frame,throat,stage){
 const obs=frame.observer,sq=dot(obs,obs),f=throat*throat/(4*Math.max(1e-45,sq)),n=obs.map(x=>x/(Math.sqrt(sq)||1));
 const far=stage.open<.001?stage.far:Math.sqrt(sq)<throat*.5*(stage.far?1/Math.max(.0001,stage.open):stage.open);
 const reflect=v=>{const a=2*dot(v,n);return v.map((x,i)=>x-a*n[i]);};
 const origin=far?obs.map(x=>2*x):[0,0,0];
 return {far,origin,scale:far?throat/f:throat,axis:v=>far?reflect(v):v};
}
// Depths are expressed in scene units and can be sorted with planets and
// the ship. Near clipping prevents a passing gantry from filling the canvas.
export function gateCanvasLayers(frame,throat,basis,stage,width,height,detail,color){
 const chart=gateChart(frame,throat,stage),fov=.83*Math.max(1,1.35/(width/height)),f=height/fov;
 const axes=[frame.right,frame.up,frame.forward].map(d=>basis.map(b=>dot(chart.axis(b),d)));
 const localDepth=frame.forward,offset=chart.origin.map((x,i)=>(x-frame.observer[i])/chart.scale);
 const off=[dot(offset,frame.right),dot(offset,frame.up),dot(offset,localDepth)];
 const layers=[],colors={};
 for(const [k,s] of Object.entries(palette)){
  colors[k]=[];
  for(let light=7;light<=12;light++)colors[k][light]=color(k==='field'?(stage.open<.35?'#ac8755':'#8ebba8'):s,k==='field',light/12);
 }
 for(const through of stage.open>.12?[false,true]:[false]){
  if(through&&off[2]<=0)continue;
  const mesh=gateMesh(through?-1:detail?1:0);
  const eye=axes[0].map((_,k)=>-axes.reduce((sum,row,i)=>sum+row[k]*off[i],0));
  const verts=mesh.vertices.map(v=>{
   const p=v.length>3?[v[0]+v[3]*stage.open,v[1]+v[4]*stage.open,v[2]+v[5]*stage.open]:v;
   const k=through?.25*stage.open*stage.open/dot(p,p):1;
   return axes.map((a,i)=>dot(a,p)*k+off[i]);
  });
  for(const [ids,mat,w,light,plane,strokes] of mesh.faces){
   if(!through&&plane&&dot(plane,eye)<plane[3])continue;
   let ps=ids.map(i=>verts[i]);const near=.03;
   if(ps.every(p=>p[2]<=near))continue;
   if(ps.some(p=>p[2]<near)){
    const clipped=[];
    for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];if(a[2]>=near)clipped.push(a);if((a[2]<near)!==(b[2]<near)){const t=(near-a[2])/(b[2]-a[2]);clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),near]);}if(w)break;}
    if(w&&ps[1][2]>=near)clipped.push(ps[1]);ps=clipped;
   }
   if(ps.length<(w?2:3))continue;
   const screen=ps.map(p=>[width*.5+f*p[0]/p[2],height*.5-f*p[1]/p[2]]);
   if(screen.every(p=>p[0]<-2)||screen.every(p=>p[0]>width+2)||screen.every(p=>p[1]<-2)||screen.every(p=>p[1]>height+2))continue;
   const z=ps.reduce((s,p)=>s+p[2],0)/ps.length;
   if(!w){let a=0;for(let i=0;i<screen.length;i++){const p=screen[i],q=screen[(i+1)%screen.length];a+=p[0]*q[1]-q[0]*p[1];}if(Math.abs(a)<.25)continue;}
   // Paint the decal with the panel. Sorting each glyph segment would let
   // the nearer half of its own tilted panel cover the distant letters.
   const mark=strokes&&z>near&&strokes.every(pair=>pair.every(i=>verts[i][2]>near))?strokes.map(pair=>pair.map(i=>[width*.5+f*verts[i][0]/verts[i][2],height*.5-f*verts[i][1]/verts[i][2]])):null;
   layers.push({type:'gate-face',screen,mark,ink:mark?colors.wordmark[light]:null,pen:mark?Math.max(.45,.015*f/z):0,color:colors[mat][light],width:w?Math.max(.45,Math.min(28,w*f/z*(through?.03:1))):0,
    // Reciprocal geometry lies inside the (transparent) aperture and must
    // overlay its sky, not be painted behind the portal's schematic disc.
    gateDepth:chart.scale*(through?off[2]*.99999+(z-off[2])*1e-5:z)});
  }
 }
 return {layers,chart,portalDepth:off[2]*chart.scale};
}
export function paintGateFace(ctx,face,fillPolygon=polygonFiller(ctx)){
 const p=face.screen;
 if(face.width){
  ctx.beginPath();ctx.moveTo(...p[0]);for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);
  ctx.lineWidth=face.width;ctx.strokeStyle=face.color;ctx.stroke();
 }else{
  ctx.fillStyle=face.color;fillPolygon(p);
  if(face.mark){ctx.beginPath();for(const [a,b] of face.mark){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.strokeStyle=face.ink;ctx.lineWidth=face.pen;ctx.stroke();}
 }
}
