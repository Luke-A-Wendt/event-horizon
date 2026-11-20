import {pelagiaBedMeters} from './pelagia-geography.js';

// Lengths in metres. The reference planet already has a relaxed rotational
// figure; a slowly moving tide loads its elastic rock and free sea surface.
// W2/g = R (M/m)(R/d)^3 P2(cos ψ). Bed and geoid responses are different.
// Only the two crests above all possible bed elevations are enlarged for display.
// Ease the display lift in over a broad shoulder. The coast and every
// physical depth remain unchanged.
export const CREST_DATUM_METERS=7000;
export const CREST_GAIN=65;
export const CREST_BLEND_METERS=3200;
export function crestLift(head){
 const h=Math.max(0,head-CREST_DATUM_METERS);
 return (CREST_GAIN-1)*(h<CREST_BLEND_METERS?h*h/(2*CREST_BLEND_METERS):h-CREST_BLEND_METERS*.5);
}
const P2=x=>(3*x*x-1)/2;
const H2=.60,K2=.30,FLUID_H2=1.94,TAU=2*Math.PI;
const GMSUN=1.32712440018e20;
const N=3072;
let samples;
function bedSamples(){
 if(samples)return samples;
 const x=new Float64Array(N),z=new Float64Array(N),bed=new Float64Array(N);
 let inventory=0;
 for(let i=0;i<N;i++){
  const y=1-(i+.5)*2/N,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y);
  x[i]=r*Math.cos(a);z[i]=r*Math.sin(a);bed[i]=pelagiaBedMeters(x[i],y,z[i]);inventory+=Math.max(0,-bed[i]);
 }
 return samples={x,z,bed,columns:new Float64Array(N),inventory};
}
// Match the undeformed inventory on wet cells, including cells that flood or
// drain. Equal-area thin columns, consistent to first order in height/radius.
function seaDatum(amplitude,phase,guess){
 if(amplitude===0)return 0;
 const {x,z,bed,columns,inventory}=bedSamples(),c=Math.cos(phase),s=Math.sin(phase);
 for(let i=0;i<N;i++)columns[i]=amplitude*P2(c*x[i]-s*z[i])-bed[i];
 let level=guess||0;
 for(let step=0;step<10;step++){
  let total=0,wet=0;
  for(let i=0;i<N;i++){const depth=columns[i]+level;if(depth>0){wet++;total+=depth;}}
  if(!wet){level=amplitude;continue;}
  const correction=(inventory-total)/wet;level+=correction;if(Math.abs(correction)<.001)break;
 }
 return level;
}
export function pelagiaTide({radiusMeters:R,planetSolar,holeSolar,separationMeters:d,spinPeriod,rockPhase=0,orbitOK=true,lastLevel=0}){
 const g=GMSUN*planetSolar/(R*R),q=holeSolar/planetSolar*(R/d)**3,omega=spinPeriod?TAU/spinPeriod:0;
 const rocheMeters=planetSolar>0?2.44*R*Math.cbrt(holeSolar/planetSolar):0,spinRatio=omega*omega*R/g;
 const issue=!orbitOK?'Requires a circular equatorial orbit':!(g>0&&d>0&&R>0)?'Undefined gravity':d<=rocheMeters?'Inside fluid Roche estimate':q>.015||spinRatio>.03||d<40*1476.62504*holeSolar?'Outside linear tide model':'';
 const potential=issue?0:R*q,rockMeters=H2*potential,seaMeters=(1+K2)*potential,relativeMeters=seaMeters-rockMeters;
 const levelMeters=seaDatum(relativeMeters,rockPhase,lastLevel);
 // Rotational flattening is common to the reference ocean and bed (permanent
 // figure); it does not masquerade as an extra change in ocean depth.
 const rot=Number.isFinite(spinRatio)&&spinRatio<.03?FLUID_H2*R*spinRatio/3:0;
 const seaAxesMeters=[R+levelMeters+seaMeters+rot*.5,R+levelMeters-seaMeters*.5-rot,R+levelMeters-seaMeters*.5+rot*.5];
 // The bed function is bounded: 2400*sum(weights) + 3000 < 7000 m.
 const baseBoundMeters=Math.max(...seaAxesMeters)+7000+.5*relativeMeters+Math.abs(levelMeters);
 const crestMeters=crestLift(levelMeters+relativeMeters),boundMeters=baseBoundMeters+crestMeters;
 return {radiusMeters:R,separationMeters:d,rocheMeters,issue,rockMeters,relativeMeters,seaMeters,levelMeters,rockPhase,seaAxesMeters,baseBoundMeters,boundMeters,crestMeters};
}
export function pelagiaSurface(t,n){
 const [x,y,z]=n,c=Math.cos(t.rockPhase),s=Math.sin(t.rockPhase);
 const bed=pelagiaBedMeters(c*x+s*z,y,-s*x+c*z),depth=t.levelMeters+t.relativeMeters*P2(x)-bed;
 const axes=t.seaAxesMeters,seaRadius=1/Math.hypot(x/axes[0],y/axes[1],z/axes[2]);
 const surfaceMeters=seaRadius+Math.max(0,-depth),head=t.levelMeters+t.relativeMeters*P2(x);
 return {bed,depth,surfaceMeters,drawMeters:surfaceMeters+crestLift(head)};
}

// First obstruction on a finite ray, in units of the bounding radius. The
// same body-fixed relief is used by picking, label occlusion and the range HUD.
export function pelagiaRayDistance(t,origin,dir,maxT){
 const mid=-origin.reduce((a,v,i)=>a+v*dir[i],0),foot=origin.map((v,i)=>v+mid*dir[i]),impact2=foot.reduce((a,v)=>a+v*v,0);
 if(impact2>1)return null;
 const wing=Math.sqrt(1-impact2),lo=Math.max(0,mid-wing),hi=Math.min(maxT,mid+wing);
 if(lo>hi)return null;
 const gap=d=>{
  const p=foot.map((v,i)=>v+(d-mid)*dir[i]),r=Math.hypot(...p);
  return r>1e-12?r-pelagiaSurface(t,p.map(v=>v/r)).drawMeters/t.boundMeters:-1;
 };
 if(gap(lo)<=0)return lo;
 // The reference sea ellipsoid is wholly inside land or water. Include its
 // entry in the bracket to avoid skipping a narrow intercept on a long ray.
 const axes=t.seaAxesMeters.map(v=>v/t.boundMeters),o=origin.map((v,i)=>v/axes[i]),d=dir.map((v,i)=>v/axes[i]),dd=d.reduce((a,v)=>a+v*v,0),u=-o.reduce((a,v,i)=>a+v*d[i],0)/dd;
 const inner=1-o.reduce((a,v,i)=>a+(v+u*d[i])**2,0),sea=inner>=0?u-Math.sqrt(inner/dd):Infinity,end=sea>=lo&&sea<=hi?sea:hi;
 let left=lo;
 for(let j=1;j<=36;j++){
  let right=lo+(end-lo)*j/36;
  if(gap(right)<=1e-8){
   for(let k=0;k<17;k++){const m=(left+right)/2;if(gap(m)>0)left=m;else right=m;}
   return right;
  }
  left=right;
 }
 return null;
}
