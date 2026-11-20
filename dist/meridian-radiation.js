// Automatic garden shutter: an illustrative exposure index, not a dosimeter.
// Lengths are in the renderer's world chart. Never use camera distance, the
// screen-space size, background stars, or a dark compact object's gravity.
const candidates=new WeakMap();
const ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
const stellarReach={main:10,dwarf:7,redgiant:7,protostar:8,tzo:7,supergiant:18,whitedwarf:30,neutron:90};
export function meridianRadiationSources(r){
 const s=r.state,k=r.configCache,h=r.holeData,out=[];
 const add=(position,reach,gain=1,axis=null,spread=0)=>{
  if(position&&reach>0&&gain>0&&Number.isFinite(reach)&&Number.isFinite(gain))out.push({position,reach2:reach*reach*gain,axis,spread});
 };
 if(s.blackHole&&h)for(let j=0;j<(s.binary?2:1);j++){
  const i=4*j,m=h[i+3];if(!(m>0))continue;
  const p=[h[i],h[i+1],h[i+2]],outer=k.diskOuter[j];
  if((j?s.secondaryDisk:s.disk)&&outer>(k.isco?.[j]||0)*m)add(p,1.6*outer,j?s.secondaryDiskDensity:s.diskDensity);
  if(j?s.secondaryJets:s.jets)add(p,18*m*(j?s.secondaryJetLength:s.jetLength),j?s.secondaryJetIntensity:s.jetIntensity,j?k.secondaryAxis:k.primaryAxis,.065*(j?s.secondaryJetSpread:s.jetSpread));
 }
 // Index the logical catalog when it changes. Iterate emitters only, even when
 // the scene contains hundreds of moons; update their moving centers every frame.
 let set=candidates.get(r);
 if(!set||set.revision!==r.geometryRevision||set.catalog!==r.objectById||set.objects!==r.objects){
  set={catalog:r.objectById,objects:r.objects,revision:r.geometryRevision,ids:(r.objects||[]).filter(o=>['star','disk','jets'].includes(o.type)).map(o=>o.id)};candidates.set(r,set);
 }
 const addStar=f=>{if(f&&!f.collapsed)add(f.position,f.radius*(stellarReach[f.starStyle]||10));};
 if(s.tidalStar)addStar(r.frameById?.get('tidalStar'));
 for(const id of set.ids){
  const f=r.frameById?.get(id);if(!f)continue;
  if(f.type==='star')addStar(f);
  else if(f.type==='disk')add(f.position,1.6*f.radius,f.diskDensity??1);
  else if(f.type==='jets'){
   const tilt=(f.axialTilt||0)*Math.PI/180,B=k.primaryBasis;
   const axis=B[1].map((v,j)=>v*Math.cos(tilt)+B[2][j]*Math.sin(tilt));
   add(f.position,.9*f.radius,f.jetIntensity??1,axis,.065*(f.jetSpread??1));
  }
 }
 return out;
}

export function meridianIrisDemand(position,sources){
 if(!position)return 0;
 let index=0;
 for(const {position:p,reach2,axis,spread} of sources){
  const x=position[0]-p[0],y=position[1]-p[1],z=position[2]-p[2],d2=x*x+y*y+z*z;
  let gain=1;
  if(axis&&d2>0){
   // Two directed lobes, fading across their width. A jet does not flood
   // every orbit at the same radius with the same radiation.
   const axial=x*axis[0]+y*axis[1]+z*axis[2],perp2=Math.max(0,d2-axial*axial);
   const width=Math.sqrt(reach2)*.008+Math.abs(axial)*spread;
   gain=Math.exp(-perp2/Math.max(1e-30,width*width));
  }
  index+=gain*reach2/Math.max(1e-30,d2);
  if(index>=1)return 1;
 }
 // For a single emitter begin to close at four times its full-closure
 // distance. Interpolate apparent angular radius to make the approach legible.
 return ease((Math.sqrt(index)-.25)/.75);
}
