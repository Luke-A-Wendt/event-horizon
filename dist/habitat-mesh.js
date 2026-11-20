import {HABITAT_HUB_RADIUS_UNITS,HABITAT_FLOOR_UNITS,HABITAT_AIRLOCK_RADIUS_UNITS,HABITAT_DOCK_FACE_UNITS,HABITAT_DOCK_RING_UNITS,HABITAT_DOCK_BORE_UNITS,HABITAT_HATCH_DEPTH_UNITS} from './habitat-spin.js';
// Wheel in XZ; lengths in render bounds, including the 0.92-radius walking deck.
const tau=2*Math.PI, cache=new Map();
const at=(a,r,y)=>[r*Math.cos(a),y,r*Math.sin(a)];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const mean=ps=>ps[0].map((_,i)=>ps.reduce((s,p)=>s+p[i],0)/ps.length);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

export function habitatMesh(sectors=48){
 if(cache.has(sectors))return cache.get(sectors);
 const vertices=[],faces=[],seen=new Map(),detail=sectors>=32;
 const index=p=>{const k=p.map(x=>Math.round(x*1e6)).join(',');if(!seen.has(k)){seen.set(k,vertices.length);vertices.push(p);}return seen.get(k);};
 const add=(pts,material,out,extra={})=>{
  let n=cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]));
  if(dot(n,out)<0)n=n.map(x=>-x);
  n=n.map(x=>x/(Math.hypot(...n)||1));
  faces.push({ids:pts.map(index),center:mean(pts),normal:n,material,...extra});
 };
 const sweep=(a,b,r,y,R,Y,material,normal,extra={})=>add([at(a,r,y),at(b,r,y),at(b,R,Y),at(a,R,Y)],material,normal,extra);
 const axial=s=>[0,s,0];
 for(let j=0;j<sectors;j++){
  const a=tau*j/sectors,b=tau*(j+1)/sectors,m=(a+b)/2,radial=at(m,1,0),inward=at(m,-1,0);
  const tile=j%6===0?'panel':j%5===2?'warm':'tile';
  // Ablative outer band, dual collar, broadside armour, and a recessed green deck.
  sweep(a,b,.97,-.027,.97,.027,'well',radial);
  for(const s of [-1,1]){
   sweep(a,b,.97,s*.027,.968,s*.05,tile,radial);
   sweep(a,b,.968,s*.05,.95,s*.072,'rim',[radial[0],s,radial[2]]);
   sweep(a,b,.95,s*.072,.86,s*.082,tile,axial(s));
   sweep(a,b,.86,s*.082,.854,s*.079,'well',axial(s));
   // Glazing sweeps inboard toward the open center; each actual deck lies below it.
   sweep(a,b,.854,s*.079,.777,s*.044,'glazing',[inward[0],s,inward[2]],{alpha:.16});
   if(detail){
    const split=a+(b-a)*.055;
    sweep(a,split,.854,s*.08,.777,s*.045,'silver',[inward[0],s,inward[2]]);
    sweep(a+.13*(b-a),a+.78*(b-a),.971,s*.005,.971,s*.017,j%4===0?'gold':'lit',radial);
    // The cutaway shoulder is glazed. Banked terraces remain visible looking down on the wheel.
    sweep(a,b,.858,s*.065,.919,s*.058,j%3===1?'garden':'meadow',axial(s));
    sweep(a,b,.866,s*.066,.871,s*.066,'path',axial(s));
    sweep(a+.14*(b-a),b-.12*(b-a),.881,s*.066,.897,s*.066,j%4===0?'roof':'forest',axial(s));
   }
  }
  // Seal the glass to the corridor collar; no continuous pane across a lift shaft.
  let start=a;
  const roof=(lo,hi)=>{
   if(hi>lo+1e-8)sweep(lo,hi,.777,-.044,.777,.044,'glazing',inward,{alpha:.12});
  };
  for(let dock=0;dock<4;dock++){
   const angle=dock*tau/3,half=.040;
   if(angle+half<=a||angle-half>=b)continue;
   roof(start,Math.max(start,angle-half));start=Math.max(start,Math.min(b,angle+half));
  }
  roof(start,b);
  if(Math.abs(Math.sin(a*1.5))>.07)sweep(a,a+(b-a)*.05,.775,-.045,.775,.045,'silver',inward);
  sweep(a,b,.92,-.061,.92,.061,j%3===0?'garden':'meadow',inward);
  if(detail){
   sweep(a,b,.919,-.01,.919,.002,'path',inward);
   // Different farm plots and recessed neighbourhoods lining the walking surface.
   for(const s of [-1,1]){
    const A=a+(b-a)*.09,B=b-(b-a)*.13;
    sweep(A,B,.915,s*.015,.915,s*.05,j%3===0?'forest':'crops',inward);
    for(let h=0;h<2;h++){
     const A=a+(b-a)*(.13+.43*h),B=A+(b-a)*.23;
     sweep(A,B,.893,s*.02,.893,s*.044,j%3===0?'roof':'leaf',inward);
     sweep(A,B,.893,s*.044,.916,s*.044,'wall',axial(s));
     add([at(A,.893,s*.02),at(A,.893,s*.044),at(A,.916,s*.044),at(A,.916,s*.02)],'wall',[Math.sin(A),0,-Math.cos(A)]);
    }
   }
   // Ceramic identity plaques, one at each spoke on each axial face.
   if(j%Math.round(sectors/3)===0){
    // Keep the nameplate within one armour facet. A decal spanning two
    // neighbouring faces without a depth buffer can be partially overpainted.
    const start=a+(b-a)*.025,end=b-(b-a)*.025;
    for(const s of [-1,1]){
     const mark=(u,v)=>at(s===1?start+u*(end-start):end-u*(end-start),.88+v*.042,s*.088);
     add([mark(0,0),mark(1,0),mark(1,1),mark(0,1)],'rim',axial(s),{decal:{map:mark}});
    }
   }
  }
 }
 // Each pressurized radial shaft carries a restrained lift from the spherical
 // hub, through a gasket in the greenhouse, to a lobby built into the floor.
 const floor=HABITAT_FLOOR_UNITS;
 for(let j=0;j<3;j++){
  const a=j*tau/3,C=Math.cos(a),S=Math.sin(a),p=(r,u,y)=>[r*C-u*S,y,r*S+u*C],n=detail?10:6;
  const sleeve=(lo,hi,r,R,mat,props={})=>{
   for(let i=0;i<n;i++){
    const A=tau*(i+.5)/n,B=tau*(i+1.5)/n,ca=Math.cos(A),cb=Math.cos(B),sa=Math.sin(A),sb=Math.sin(B);
    add([p(lo,r*ca,r*sa),p(lo,r*cb,r*sb),p(hi,R*cb,R*sb),p(hi,R*ca,R*sa)],mat,p(r-R,(ca+cb)*(hi-lo)/2,(sa+sb)*(hi-lo)/2),props);
   }
  };
  const loft=[[.147,.035],[.171,.042],[.182,.034],[.437,.030],[.627,.030],[.755,.031],[.762,.040],[.791,.040],[.799,.033],[.864,.033]];
  for(let k=1;k<loft.length;k++){
   const [lo,r]=loft[k-1],[hi,R]=loft[k];sleeve(lo,hi,r,R,k===1||k===7?'silver':k===6||k===8?'seam':'tile',{liftShaft:j});
  }
  if(detail)for(const r of [.251,.362,.480,.60,.695])sleeve(r,r+.004,.033,.033,'panel');
  const collar=(lo,hi,r,mat,props)=>{
   sleeve(lo,lo+.004,r*.9,r,'silver',props);
   sleeve(lo+.004,hi-.002,r,r,mat,props);
   sleeve(hi-.002,hi,r,r*.93,'silver',props);
  };
  collar(.155,.211,.043,'tile',{transferVestibule:j});
  collar(.854,floor+.002,.055,'panel',{liftLobby:j});
  // Fit door skins and windows to the tangent facet on either side.
  const tangent=r=>r*Math.cos(Math.PI/n)+.00015;
  if(detail)for(const sign of [-1,1]){
   const w=sign*tangent(.043,.012);
   add([p(.179,w,-.012),p(.200,w,-.012),p(.200,w,.012),p(.179,w,.012)],'glass',p(0,sign,0));
  }
  // Side-facing doors have a level threshold at the rotating deck: no
  // unprotected exit at canopy height. Narrow lights mark each jamb.
  for(const side of [-1,1]){
   const w=side*tangent(.055,.019),norm=p(0,side,0),low=.884;
   const door=(lo,hi,z,Z,w,mat,props)=>add([p(lo,w,z),p(lo,w,Z),p(hi,w,Z),p(hi,w,z)],mat,norm,props);
   door(low,floor,-.019,.019,w,'seam',{liftDoor:j});
   for(const sign of [-1,1])door(low+.002,floor,sign*.001,sign*.0165,w*1.002,'tile');
   door(low+.004,low+.012,-.013,.013,w*1.004,'glass');
  }
 }
 const S=HABITAT_HUB_RADIUS_UNITS,R=HABITAT_AIRLOCK_RADIUS_UNITS,face=HABITAT_DOCK_FACE_UNITS,ring=HABITAT_DOCK_RING_UNITS,bore=HABITAT_DOCK_BORE_UNITS,hatch=face-HABITAT_HATCH_DEPTH_UNITS;
 const n=detail?36:18,capLat=Math.atan2(face,R);
 const shellR=y=>Math.sqrt(Math.max(0,S*S-y*y));
 // The collar revolves with the three shafts. Floating vessels, polar locks,
 // and the pressure shell itself need not share that angular velocity.
 const bearingLat=Math.asin(.042/S),halfBand=S*Math.sin(bearingLat),beltR=shellR(halfBand);
 for(let j=0;j<n;j++){
  const a=tau*j/n,b=tau*(j+1)/n;for(const sign of [-1,1]){
   const rows=[[0,.1735],[.031,.1735],[.039,.170],[halfBand,beltR]];
   for(let k=1;k<rows.length;k++){
    const [y,r]=rows[k-1],[Y,R]=rows[k];sweep(a,b,r,sign*y,R,sign*Y,k===1?(Math.cos(3*(a+b)/2)>.82?'panel':'silver'):k===2?'panel':'seam',at((a+b)/2,(r+R)/2,sign*(y+Y)/2),{hubRace:true});
   }
  }
 }
 const coreStart=vertices.length,coreFace=faces.length;
 seen.clear(); // allow the rotating race and fixed shell to have different phases
 const latitudes=[bearingLat,.40,.64,.86,1.08,1.26,1.40,capLat];
 for(let j=0;j<n;j++){
  const a=tau*j/n,b=tau*(j+1)/n,m=(a+b)/2;
  for(const side of [-1,1]){
   for(let k=1;k<latitudes.length;k++){
    const y=S*Math.sin(latitudes[k-1]),Y=k===latitudes.length-1?face:S*Math.sin(latitudes[k]);
    const r=shellR(y),U=k===latitudes.length-1?R:shellR(Y),mid=(r+U)/2;
    const mat=k===1&&j%3!==0?'glass':(j%9===2&&k===4?'warm':'tile');
    sweep(a,b,r,y*side,U,Y*side,mat,at(m,mid,side*(y+Y)/2),{hubShell:true});
   }
  }
 }
 // Short runs of white guidance paint follow the sphere. The stationary
 // perimeter belongs to the shell; the inset hatch markings turn independently.
 for(const side of [-1,1])for(let i=0;i<4;i++)for(const tip of [.021,.039,.057]){
  const a=i*tau/4,to=(angle,r)=>at(angle,r,side*shellR(r)*1.00004);
  for(const sign of [-1,1]){
   const off=sign*.006/(tip+.006),ps=[to(a,tip),to(a+off,tip+.006),to(a+off,tip+.0085),to(a,tip+.0025)];
   add(ps,'rim',mean(ps),{beacon:true});
  }
 }
 const fixedStart=vertices.length,fixedFace=faces.length;
 seen.clear(); // The shell and despun polar plates meet without sharing mesh indices.
 for(let j=0;j<n;j++){
  const a=tau*j/n,b=tau*(j+1)/n,dir=at((a+b)/2,1,0);
  for(const side of [-1,1]){
   const out=axial(side),Y=side*face;
   sweep(a,b,R,Y,R*.91,Y,'seam',out);
   sweep(a,b,R*.91,Y,R*.68,Y,j%6===0?'lit':'panel',out,{bearingMark:true});
   sweep(a,b,R*.68,Y,ring,Y,j===1?'dockAmber':'tile',out);
   sweep(a,b,ring,Y,bore,Y,'rim',out,{captureFace:side});
   sweep(a,b,bore,Y,bore,side*hatch,'seam',dir.map(v=>-v));
   add([at(a,bore,side*hatch),at(b,bore,side*hatch),[0,side*hatch,0]],'silver',out);
  }
 }
 const mesh={vertices,faces,coreStart,coreFace,fixedStart,fixedFace};cache.set(sectors,mesh);return mesh;
}

// Compose three coaxial frames in wheel-local coordinates for shared shading
// and depth sorting. Vertex and normal rotations are independent of the eye.
export function stabilizeHabitatHub(mesh,wheel,drum,core){
 if(!wheel||!drum)return mesh;
 const turn=basis=>{
  const xx=dot(wheel[0],basis[0]),xz=dot(wheel[0],basis[2]),zx=dot(wheel[2],basis[0]),zz=dot(wheel[2],basis[2]);
  return Math.abs(1-xx)+Math.abs(xz)<1e-10?null:p=>[p[0]*xx+p[2]*xz,p[1],p[0]*zx+p[2]*zz];
 };
 const shellTurn=turn(core||drum),lockTurn=turn(drum);
 if(!shellTurn&&!lockTurn)return mesh;
 const vs=mesh.vertices.slice(),fs=mesh.faces.slice();
 const apply=(t,v0,v1,f0,f1)=>{
  if(!t)return;
  for(let i=v0;i<v1;i++)vs[i]=t(vs[i]);
  for(let i=f0;i<f1;i++){const f=fs[i];fs[i]={...f,center:t(f.center),normal:t(f.normal)};}
 };
 apply(shellTurn,mesh.coreStart,mesh.fixedStart,mesh.coreFace,mesh.fixedFace);
 apply(lockTurn,mesh.fixedStart,vs.length,mesh.fixedFace,fs.length);
 return {vertices:vs,faces:fs};
}
