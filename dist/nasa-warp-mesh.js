import {JANUS_COLORS} from './janus-hull.js';
import {polygonFiller} from './cpu-commands.js';
import {janusMesh,janusExhaust} from './janus-mesh.js';
import {WARP_MAIN_PORTS,WARP_STERN_PORT} from './warp-plumes.js';
import {meridianMesh,meridianDockPort,meridianExhaust,meridianIris} from './meridian-mesh.js';
import {habitatMesh,stabilizeHabitatHub} from './habitat-mesh.js';
// The Canvas preview uses the same hull units and +Z bow as the ray-traced
// craft. Explicit openings, rather than painted dark discs, show the sky and
// the other ring when the viewpoint moves alongside or behind the ship.
const palettes={
 tile:'#dedfd8',warm:'#ccd0ca',panel:'#a3aeb1',rim:'#f0eee4',silver:'#8e9da3',
 lift:'#858889',seam:'#354450',well:'#20323a',blue:'#193c50',glass:'#416f87',cyan:'#66c4cb',
 gold:'#ab8861',copper:'#885c48',engine:'#4d4946',red:'#aa433b'
};
Object.assign(palettes,JANUS_COLORS,{janusGlass:'#91b4b4',jetHalo:'#538cbd',jetCore:'#a7e1ff',irisPearl:'#d8dad2',irisSilver:'#bec4c3',irisEdge:'#747e80',irisLiner:'#a99f91',irisLinerDark:'#989085',dockAmber:'#f3a352',glazing:'#b8dfeb',lit:'#addded',garden:'#66a361',meadow:'#93b45c',path:'#d6c291',forest:'#3d764c',crops:'#a5b06c',roof:'#d7d0bc',leaf:'#5e9153',wall:'#9da7ab'});
const cache=new Map(), TAU=2*Math.PI;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=a=>a.map(x=>x/(Math.hypot(...a)||1));
const mean=a=>a[0].map((_,i)=>a.reduce((sum,p)=>sum+p[i],0)/a.length);
const tile=(j)=>j%7===1?'panel':j%3===0?'warm':'tile';

export function warpShipMesh(sectors=24){
 if(cache.has(sectors))return cache.get(sectors);
 const vertices=[],faces=[],lookup=new Map(),detailed=sectors>=16;
 const vertex=p=>{
  const key=p.map(n=>Math.round(n*1e6)).join(',');
  if(!lookup.has(key)){lookup.set(key,vertices.length);vertices.push(p);}
  return lookup.get(key);
 };
 function face(points,material,decal=null,solidCenter=null){
  let normal=normalize(cross(sub(points[1],points[0]),sub(points[2],points[0])));
  const center=mean(points);
  if(solidCenter&&dot(normal,sub(center,solidCenter))<0){points=points.slice().reverse();normal=normal.map(n=>-n);}
  faces.push({ids:points.map(vertex),normal,center,material,decal});
 }
 function lathe(profile,sectorCount=sectors,dx=0,dy=0){
  const bands=profile.map(([z,x,y])=>Array.from({length:sectorCount},(_,j)=>{
   const t=j*TAU/sectorCount;return [dx+x*Math.cos(t),dy+y*Math.sin(t),z];
  }));
  for(let k=0;k<bands.length-1;k++)for(let j=0;j<sectorCount;j++){
   const j1=(j+1)%sectorCount,mat=profile[k][3];
   const p=[bands[k][j],bands[k][j1],bands[k+1][j1],bands[k+1][j]];
   face(p,typeof mat==='function'?mat(j,sectorCount):mat);
  }
 }
 // Collar skin with four small blind bores. Each half opening shares its
 // outside edges with the neighboring skin panels; there are no external pods.
 function collar(n){
  const rx=WARP_STERN_PORT[0],ry=.151,z=WARP_STERN_PORT[2],half=.016,step=TAU/n;
  const at=(a,h)=>[rx*Math.cos(a),ry*Math.sin(a),z+h];
  for(let j=0;j<n;j++){
   const a=j*step,b=(j+1)*step,quarter=n/4;
   if(j%quarter!==0&&(j+1)%quarter!==0){face([at(a,-half),at(b,-half),at(b,half),at(a,half)],'silver');continue;}
   const dir=j%quarter===0?1:-1,angle=dir===1?a:b,x=Math.cos(angle),y=Math.sin(angle),tanScale=Math.hypot(rx*y,ry*x);
   const rim=(t,r,depth)=>{const p=at(angle+dir*r*Math.cos(t)/tanScale,r*Math.sin(t));p[0]-=depth*x;p[1]-=depth*y;return p;};
   const edge=(t)=>{const co=Math.cos(t),si=Math.sin(t),f=1/Math.max(co,Math.abs(si));const l=co*f,p=at(angle,half*si*f),q=at(angle+dir*step,half*si*f);return p.map((v,i)=>v+(q[i]-v)*l);};
   for(let k=0;k<8;k++){
    const t=-Math.PI/2+k*Math.PI/8,u=t+Math.PI/8;
    const quad=(ps,mat)=>face(dir>0?ps:ps.reverse(),mat);
    quad([edge(t),edge(u),rim(u,.0115,0),rim(t,.0115,0)],'silver');
    quad([rim(t,.0115,0),rim(u,.0115,0),rim(u,.0085,0),rim(t,.0085,0)],'panel');
    quad([rim(t,.0085,0),rim(u,.0085,0),rim(u,.007,.005),rim(t,.007,.005)],'seam');
    quad([rim(t,.007,.005),rim(u,.007,.005),rim(0,0,.005)],'well');
   }
  }
 }
 function spineWithPorts(profile,n){
  const mid=profile.findIndex(row=>row[0]>-.641);
  lathe([...profile.slice(0,mid),[-.657,.174,.151,'silver']],n);collar(n);
  lathe([[-.625,.174,.151,'silver'],...profile.slice(mid).filter(row=>row[0]>-.625)],n);
 }
 // Untracked background vehicles still have two open rings but need no
 // separate emitter tiles, lettering, or nozzle walls at preview resolution.
 if(sectors<=6){
  for(const z of [-.43,.43])lathe([[-.086,.53,'tile'],[.086,.53,'rim'],[.086,.415,'cyan'],[-.086,.415,'panel'],[-.086,.53]].map(([dz,r,m])=>[z+dz,r,r,m]),8);
  spineWithPorts([[-.915,.006,.006,'engine'],[-.81,.15,.13,'panel'],[.37,.16,.14,'tile'],[.53,.25,.12,'glass'],[.7,.22,.1,'rim'],[.92,.001,.001]],8);
  for(const [x,y] of WARP_MAIN_PORTS)lathe([[-.920,.067,.067,'rim'],[-.915,.055,.055,'engine'],[-.865,.026,.026,'well'],[-.865,.001,.001,'well']],8,x,y);
  const mesh={vertices,faces};cache.set(sectors,mesh);return mesh;
 }
 // Bevels on both rims, segmented ceramic cladding, a graphite inset and
 // alternating active emitter tiles on the inner lining.
 for(const z of [-.43,.43]){
  const active=j=>j%6===0?'seam':'cyan';
  const section=detailed?[
   [-.086,.492,'rim'],[-.073,.518,'warm'],[-.051,.53,tile],[.028,.53,'seam'],
   [.042,.53,'warm'],[.066,.526,'panel'],[.086,.495,'rim'],[.086,.437,'panel'],
   [.067,.415,'well'],[.019,.415,active],[-.011,.415,'seam'],[-.061,.415,'silver'],
   [-.086,.436,'rim'],[-.086,.492]
  ]:[[-.086,.493,'tile'],[-.055,.53,tile],[.055,.53,'warm'],[.086,.493,'rim'],[.086,.415,active],[-.086,.415,'panel'],[-.086,.493]];
  lathe(section.map(([dz,r,m])=>[z+dz,r,r,m]));
  // Four splayed, rectangular load-bearing spokes join each ring to the bus.
  for(let j=0;j<4;j++){
   const a=(j+.5)*TAU/4,u=[Math.cos(a),Math.sin(a)],v=[-u[1],u[0]];
   const points=[];
   for(let k=0;k<2;k++)for(const sign of [-1,1])for(const side of [-1,1]){
    const radial=k?.425:.128,w=k?.022:.032;
    points.push([u[0]*radial+v[0]*side*w,u[1]*radial+v[1]*side*w,z+(k?0:(z>0?-.08:.08))+sign*(k?.027:.041)]);
   }
   const middle=mean(points);
   for(const [ids,mat] of [[[0,1,3,2],'silver'],[[4,6,7,5],'panel'],[[0,4,5,1],'silver'],[[2,3,7,6],'warm'],[[0,2,6,4],'panel'],[[1,5,7,3],'tile']])face(ids.map(i=>points[i]),mat,null,middle);
  }
 }
 // Hull, double shoulder collars, navigation deck and tapered command bow.
 const glass=(j,n)=>Math.sin((j+.5)*TAU/n)>.08&&j%5!==0?'glass':'blue';
 const spine=[
  [-.805,.13,.11,'engine'],[-.758,.17,.137,'silver'],[-.687,.17,.137,'well'],
  [-.64,.16,.13,'panel'],[-.60,.169,.136,'warm'],[-.555,.169,.136,'seam'],
  [-.54,.156,.132,tile],[-.245,.156,.132,'silver'],[-.229,.163,.14,'warm'],
  [.22,.163,.14,'seam'],[.245,.166,.141,'rim'],[.295,.16,.133,'tile'],
  [.439,.171,.14,'silver'],[.478,.237,.122,'warm'],[.547,.261,.118,glass],
  [.665,.241,.099,'rim'],[.752,.194,.085,'panel'],[.837,.125,.064,'tile'],
  [.918,.012,.012,'panel'],[.92,.001,.001]
 ];
 spineWithPorts(spine,detailed?16:8);
 const cap=(z,rx,ry,dx,dy,n,mat,sign)=>{
  face(Array.from({length:n},(_,j)=>[dx+rx*Math.cos(sign*j*TAU/n),dy+ry*Math.sin(sign*j*TAU/n),z]),mat);
 };
 cap(-.805,.13,.11,0,0,detailed?16:8,'engine',-1);
 cap(.92,.001,.001,0,0,detailed?16:8,'rim',1);
 for(const [dx,dy] of WARP_MAIN_PORTS){
  lathe([[-.920,.067,.067,'copper'],[-.88,.036,.035,'engine'],[-.805,.05,.047,'silver'],[-.78,.046,.042,'silver']],detailed?10:6,dx,dy);
  cap(-.868,.022,.022,dx,dy,detailed?10:6,'well',-1);
  // Inward-facing nozzle and a closed, recessed throat.
  lathe([[-.868,.001,.001,'well'],[-.868,.022,.022,'engine'],[-.920,.058,.058,'gold'],[-.920,.067,.067,'gold']],detailed?10:6,dx,dy);
 }
 if(detailed)for(const sign of [-1,1]){
  // Flush identity plates on both flanks. The vector markings are emitted
  // with the owning plate so they obey its orientation and occlusion.
  const decal={sign,x:sign*.168};
  face([[-.208,-.052],[.208,-.052],[.208,.056],[-.208,.056]].map(([z,y])=>[decal.x,y,z]),'rim',decal,[0,0,0]);
 }
 const mesh={vertices,faces};
 cache.set(sectors,mesh);return mesh;
}

// A custom vector stencil, independent of fonts and DOM/OffscreenCanvas.
const letters=[
 [[0,0],[0,1],[.19,1],[.56,.35],[.56,1],[.75,1],[.75,0],[.55,0],[.19,.66],[.19,0]],
 [[0,0],[.31,1],[.54,1],[.85,0],[.63,0],[.55,.25],[.29,.25],[.21,0]],
 [[.75,.98],[.18,1],[0,.79],[.03,.59],[.19,.48],[.5,.40],[.57,.31],[.52,.22],[.03,.22],[0,.02],[.56,0],[.76,.15],[.78,.34],[.71,.49],[.55,.59],[.24,.67],[.22,.75],[.28,.8],[.72,.78]],
 [[0,0],[.31,1],[.54,1],[.85,0],[.63,0],[.55,.25],[.29,.25],[.21,0]]
];

// Two nested low-opacity flame envelopes, depth sorted with the hull (never a
// screen-space halo painted on top of the rings). Cache the small canvas meshes.
const plumeMeshes=new Map();
export function warpExhaustMesh(impulse,yaw){
 const gas=impulse>0?1:0,step=Math.sign(yaw)*Math.min(16,Math.ceil(Math.abs(yaw)*16)),key=gas*40+step;
 if(plumeMeshes.has(key))return plumeMeshes.get(key);
 const vertices=[],faces=[];
 function envelope(base,axis,extent,width,strength,material){
  const out=[axis[2],0,-axis[0]],top=[0,1,0],n=8;
  const end=vertices.length;
  for(const [dist,r] of [[-.09,.32],[.18,1],[.52,.78],[.83,.45],[1,.035]]){
   for(let i=0;i<n;i++)vertices.push(base.map((v,k)=>v+extent*dist*axis[k]+width*r*(Math.cos(i*TAU/n)*out[k]+Math.sin(i*TAU/n)*top[k])));
  }
  for(let j=0;j<4;j++)for(let i=0;i<n;i++){
   const a=end+j*n+i,b=end+j*n+(i+1)%n,ids=[a,b,b+n,a+n],pts=ids.map(i=>vertices[i]),normal=normalize(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])));
   faces.push({ids,normal,center:mean(pts),material,alpha:strength*[.78,1,.58,.24][j],exhaust:true});
  }
 }
 if(gas)for(const p of WARP_MAIN_PORTS){
  envelope(p,[0,0,-1],.206,.061,.19,'jetHalo');envelope(p,[0,0,-1],.115,.041,.54,'jetCore');
 }
 if(step){
  const side=Math.sign(step),strength=Math.pow(Math.abs(step)/16,.38),p=WARP_STERN_PORT.map((v,k)=>k===0?side*v:v);
  envelope(p,[side,0,0],.067,.013,.30*strength,'jetHalo');envelope(p,[side,0,0],.043,.008,.70*strength,'jetCore');
 }
 const mesh={vertices,faces};plumeMeshes.set(key,mesh);return mesh;
}

function* paintShip(ctx,{radiusPixels:r,relativeCenter,frame,basis,bodyRadius,centerProjection:q,width,height,spectrum,color,featured=true,janus=false,habitat=false,hubBasis,coreBasis,meridian=false,warpImpulse=0,warpYawJet=0,throttle=0,steer=0,irisClosure=0,dockActive=false,dockExtension=0,dockRcs=[0,0,0],dockTorque=null}){
 if(r<1.4){ctx.fillStyle=color(palettes.tile,spectrum);ctx.fillRect(-r*.5,-r*.5,r,r);return;}
 const sectors=featured?(r>=52?24:r>=18?16:8):6;
 let mesh=janus?janusMesh(featured&&r>=25):meridian?meridianMesh(featured?(r>=54?36:r>=18?24:12):12):habitat?habitatMesh(featured?(r>=80?48:r>=32?36:18):12):warpShipMesh(sectors);
 if(!meridian&&!habitat&&spectrum!=='geometry'&&(warpImpulse>0||warpYawJet)){
  const flame=janus?janusExhaust(warpImpulse,warpYawJet):warpExhaustMesh(warpImpulse,warpYawJet),offset=mesh.vertices.length;
  mesh={vertices:mesh.vertices.concat(flame.vertices),faces:mesh.faces.concat(flame.faces.map(f=>({...f,ids:f.ids.map(i=>i+offset)})))};
 }
 if(meridian&&irisClosure>0){
  const shield=meridianIris(irisClosure,featured&&r>=30),offset=mesh.vertices.length;
  // With a sealed roof no interior surface can be seen from outside.
  const base=irisClosure>=1?mesh.faces.filter(f=>!f.interior):mesh.faces;
  mesh={vertices:mesh.vertices.concat(shield.vertices),faces:base.concat(shield.faces.map(f=>({...f,ids:f.ids.map(i=>i+offset)})))};
 }
 if(meridian){
  const port=meridianDockPort(dockExtension),offset=mesh.vertices.length;
  mesh={vertices:mesh.vertices.concat(port.vertices),faces:mesh.faces.concat(port.faces.map(f=>({...f,ids:f.ids.map(i=>i+offset)})))};
 }
 if(meridian&&(dockTorque?.some(v=>Math.abs(v)>.00001)||(dockActive?dockRcs.some(v=>Math.abs(v)>.00001):throttle>.001||Math.abs(steer)>.001))){
  const flame=meridianExhaust(throttle,steer,dockActive?dockRcs:null,dockTorque),offset=mesh.vertices.length;
  mesh={vertices:mesh.vertices.concat(flame.vertices),faces:mesh.faces.concat(flame.faces.map(f=>({...f,ids:f.ids.map(i=>i+offset)})))};
 }
 if(habitat&&hubBasis)mesh=stabilizeHabitatHub(mesh,basis,hubBasis,coreBasis);
 const eye=basis.map(axis=>-dot(relativeCenter,axis)/bodyRadius);
 const right=basis.map(axis=>dot(axis,frame.right)),up=basis.map(axis=>dot(axis,frame.up)),forward=basis.map(axis=>dot(axis,frame.forward));
 const depth=bodyRadius/q.depth,focal=q.depth*q.pixels;
 const xOffset=(q.x-width*.5)/focal,yOffset=(q.y-height*.5)/focal;
 const project=p=>{
  const z=dot(p,forward),den=1+z*depth;
  if(den<=.000001)return null;
  return [(dot(p,right)-z*xOffset)*r/den,(-dot(p,up)-z*yOffset)*r/den];
 };
 const projected=mesh.vertices.map(project);
 const faces=mesh.faces.filter(f=>dot(f.normal,sub(eye,f.center))>0&&f.ids.every(i=>projected[i]));
 if(meridian&&irisClosure>0){
  // Centroid sorting lets an inner pane paint across a closer metal leaf,
  // because their facets have different widths. Use the near edge of the
  // shield and far edge of glazing on this pair of nested convex surfaces.
  const keys=new Map(faces.map(f=>[f,f.iris||f.interior?
   (f.iris?Math.min:Math.max)(...f.ids.map(i=>dot(mesh.vertices[i],forward))):dot(f.center,forward)]));
  faces.sort((a,b)=>keys.get(b)-keys.get(a));
 }else if(janus){const depth=f=>dot(f.sortCenter||f.center,forward)-(f.janusInk ? .065 : f.janusPaint ? .028 : 0);faces.sort((a,b)=>depth(b)-depth(a));}
 else faces.sort((a,b)=>dot(b.center,forward)-dot(a.center,forward));
 const light=normalize(forward.map((v,i)=>-.65*v+.76*up[i]-.45*right[i]));
 const swatches=new Map();
 function swatch(material,shade,alpha=1){
  const key=material+shade+':'+alpha;
  if(!swatches.has(key))swatches.set(key,color(palettes[material],spectrum==='geometry'?'visible':spectrum,'surface',alpha,1,shade/24));
  return swatches.get(key);
 }
 const fill=polygonFiller(ctx);
 let count=0;
 for(const f of faces){
  const shade=Math.round(24*(.42+.58*Math.max(0,dot(f.normal,light))));
  const mat=spectrum==='geometry'?(f.material==='seam'?'seam':'panel'):f.material;
  ctx.fillStyle=swatch(mat,f.exhaust||f.beacon?24:mat==='cyan'?Math.max(shade,20):shade,f.alpha??1);
  fill(f.ids.map(i=>projected[i]));
  if(f.decal&&r>=45){
   const {sign,x}=f.decal,point=(z,y)=>project([x,y,z]);
   ctx.fillStyle=swatch('red',shade);
   const mark=f.decal.map;
   // Optional per-facet clipping for wide nameplates that curve around a drum.
   function stamp(shape,j,glyph){
    if(f.decal.left==null){fill(shape.map(([s,t])=>glyph(s,t)));return;}
    let polygon=shape.map(([s,t])=>[.07+(j*.90+s)*.245,.12+t*.76]);
    for(const [edge,sign] of [[f.decal.left,1],[f.decal.right,-1]]){
     const clipped=[];
     for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=(a[0]-edge)*sign,db=(b[0]-edge)*sign;
      if(da>=0)clipped.push(a);
      if((da>=0)!==(db>=0))clipped.push([edge,a[1]+(b[1]-a[1])*da/(da-db)]);
     }polygon=clipped;
    }
    if(polygon.length>=3)fill(polygon.map(([u,v])=>project(mark(u,v))));
   }
   for(let j=0;j<letters.length;j++){
    const glyph=(s,t)=>f.decal.map?project(f.decal.map(.07+(j*.90+s)*.245,.12+t*.76)):point(sign*(.15-(j*.90+s)*.085),-.031+t*.066);
    stamp(letters[j],j,glyph);
    if(j===1||j===3){ctx.fillStyle=swatch('rim',shade);stamp([[.36,.43],[.49,.43],[.425,.68]],j,glyph);ctx.fillStyle=swatch('red',shade);}
   }
  }
  if(++count%48===0)yield;
 }
}
export const drawJanusPod=(ctx,options)=>paintShip(ctx,{...options,janus:true});
export const drawNasaWarpShip=paintShip;
export const drawNasaMeridian=(ctx,options)=>paintShip(ctx,{...options,meridian:true});
export function meridianInterior(pane,irisClosure=0){
 const mesh=meridianMesh(24);
 for(const f of mesh.faces)if(f.interior)pane(f.ids.map(i=>mesh.vertices[i]),palettes[f.material],f.alpha??1);
 // Only the fixed underside is visible from the lounge. Reuse the same
 // pressure hatch and mounting lip as the exterior, independent of stroke.
 const port=meridianDockPort(0);
 for(const f of port.faces)if(f.normal[2]<-.99)pane(f.ids.map(i=>port.vertices[i]),palettes[f.material],1);
 if(irisClosure>0){
  const shield=meridianIris(irisClosure,true);
  for(const f of shield.faces)pane(f.ids.map(i=>shield.vertices[i]),palettes[f.material==='irisEdge'?'irisEdge':f.material==='irisPearl'?'irisLiner':'irisLinerDark'],1);
 }
}
export const drawNasaHabitat=(ctx,options)=>paintShip(ctx,{...options,habitat:true});

// Original Enterprise drawing for the separately selectable classic vessel.
export function drawLegacyEnterprise(ctx,r,spectrum,cpuColor){
 const tau=Math.PI*2;
 ctx.beginPath();ctx.ellipse(r*.25,-r*.13,r*.57,r*.15,0,0,tau);ctx.fill();ctx.fillRect(-r*.15,0,r*.16,r*.27);ctx.fillRect(-r*.48,r*.2,r*.72,r*.15);ctx.fillRect(-r*.7,-r*.35,r*.73,r*.12);ctx.fillRect(-r*.45,-r*.28,r*.07,r*.5);ctx.fillStyle=cpuColor('#d7723e',spectrum);ctx.fillRect(-r*.02,-r*.35,r*.06,r*.12);
}
