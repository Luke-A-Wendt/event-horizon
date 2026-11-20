import {gardenWaterDistance} from './garden-waters.js';
// Dimensions match the GPU cutaway model; all lengths are fractions of the
// inner shell radius. Rays and latitudes use the scene's +Y spin axis.
const TAU=2*Math.PI;
export const DYSON_TUBE_HALF_WIDTH=.075;
const minor=DYSON_TUBE_HALF_WIDTH,base=Math.sqrt(1-minor**2);
const profiles=Array.from({length:9},(_,i)=>{
 const a=(i/8-.5)*Math.PI;return [minor*Math.sin(a),base-minor*Math.cos(a)];
});
const bands=profiles.slice(1).map(([y1,r1],i)=>{
 const [y0,r0]=profiles[i],slope=(r1-r0)/(y1-y0);
 return {y0,y1,slope,offset:r0-y0*slope};
});
export function dysonObserverUnderGlass([x,y,z],cutaway=0){
 const rho=Math.hypot(x,z);
 return Math.hypot(rho,y)<1&&(rho-base)**2+y*y<minor*minor&&(!cutaway||z<=1-2*cutaway);
}
const fract=v=>v-Math.floor(v);
const border=v=>Math.abs(fract(v+.5)-.5);

// Intersect each conical strip of the semicircular canopy. Only its inward
// half exists: the other half would sit below the walking floor. The common
// planar cut keeps the glass and the shell open to the same viewing window.
export function dysonCanopyHit(origin,direction,cutaway=0,maximum=Infinity){
 const [ox,oy,oz]=origin,[dx,dy,dz]=direction;
 const b=ox*dx+oy*dy+oz*dz;
 const cx=oy*dz-oz*dy,cy=oz*dx-ox*dz,cz=ox*dy-oy*dx,d=1-cx*cx-cy*cy-cz*cz;
 if(d<=0)return null;
 const span=Math.sqrt(d),near=Math.max(0,-b-span),far=Math.min(maximum,-b+span);
 if(near>=far)return null;
 const yn=oy+near*dy,yf=oy+far*dy,lo=Math.min(yn,yf),hi=Math.max(yn,yf);
 if(lo>minor||hi< -minor)return null;
 const x=ox+near*dx,z=oz+near*dz,yd=dy*dy,dd=dx*dx+dz*dz,od=x*dx+z*dz,oo=x*x+z*z;
 const cut=1-2*Math.min(.8,Math.max(0,cutaway));
 let best=far-near+1e-9,point=null;
 for(const {y0,y1,slope,offset} of bands){
  if(lo>y1||hi<y0)continue;
  const r=offset+slope*yn,k=slope*dy;
  const A=dd-slope*slope*yd,B=od-r*k,C=oo-r*r,D=B*B-A*C;
  if(D<0)continue;
  let t0,t1;
  if(Math.abs(A)<1e-10){if(Math.abs(B)<1e-10)continue;t0=t1=-C/(2*B);}
  else{const root=Math.sqrt(D);t0=(-B-root)/A;t1=(-B+root)/A;}
  for(const t of [t0,t1]){
   if(t+near<1e-7||t< -1e-8||t>=best)continue;
   const y=yn+t*dy,zHit=z+t*dz;if(y<y0-1e-8||y>y1+1e-8||(cutaway>0&&zHit>cut))continue;
   best=t;point=[x+t*dx,y,zHit];
  }
 }
 if(!point)return null;
 const rho=Math.hypot(point[0],point[2]),nc=(rho-base)/Math.max(rho,1e-8);
 const n=[point[0]*nc,point[1],point[2]*nc],inv=1/(Math.hypot(...n)||1);
 return {point,t:near+best,normal:n.map(v=>v*inv)};
}

function lit(hex,light){
 if(light===1)return hex;
 const s=Math.max(.025,Math.min(1.55,light));
 return '#'+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*s)).toString(16).padStart(2,'0')).join('');
}

// Unlike shell RGB, which fills a pixel, a canopy sample transmits the true
// background under the ray. A ray leaving through the cutaway can show sky.
export function dysonCanopyMaterial(hit,ray,phase=0,illumination=1){
 const [x,y,z]=hit.point,lon=(Math.atan2(z,x)+phase)/TAU;
 const cross=(Math.asin(Math.max(-1,Math.min(1,y/minor)))/Math.PI+.5);
 const arch=border(lon*96),rail=border(cross*8);
 if(arch<.039||rail<.041)return {color:lit(arch<.021?'#e5e1cf':'#a8aaa3',illumination),alpha:.96};
 const facing=Math.abs(hit.normal.reduce((sum,n,i)=>sum+n*ray[i],0));
 const reflected=.055+.56*(1-Math.min(1,facing))**3;
 return {color:lit('#e5e6dd',illumination),alpha:reflected};
}

export function dysonPreviewMaterial(point,inside,illumination=1,phase=0,ring=false){
 const [px,y,pz]=point,co=Math.cos(phase),si=Math.sin(phase);
 const x=px*co-pz*si,z=px*si+pz*co,a=Math.atan2(z,x),lat=Math.asin(Math.max(-1,Math.min(1,y)));
 const u=a/TAU+.5,v=lat/Math.PI+.5;
 if(!inside&&ring){
  const ax=Math.abs(y/minor),bay=u*96;
  return ax>.95?'#363e3e':ax>.78||border(bay)<.04?'#7b8a86':border(y/minor*14)<.14?'#526563':'#38494b';
 }
 if(!inside){
  const n=Math.sin(x*19+Math.sin(z*11))*Math.cos(z*17-y*9)+Math.sin(y*25+x*8)*.35;
  const seam=Math.abs(Math.sin(a/Math.PI*80))<.08||Math.abs(Math.sin(lat/Math.PI*50))<.08;
  return seam?'#232221':n>.15?'#afaca8':'#777470';
 }
 if(Math.abs(y)<=minor){
  const across=y/minor,shore=gardenWaterDistance(u,across),vegetation=Math.sin(46*a+across*9)*Math.cos(21*a-across*7);
  const c=Math.abs(across)>.94?'#939284':shore<-.14?'#1b687e':shore<-.012?'#318c95':shore<.005?'#64adb0':
     shore<.036?'#9ca983':border(u*48)<.016?'#bbba9d':vegetation>.42?'#88a15b':vegetation<-.30?'#416342':'#688647';
  return lit(c,illumination);
 }
 const row=Math.min(25,Math.floor(v*26)),columns=Math.max(6,2*Math.round(30*Math.sin(Math.PI*(row+.5)/26)));
 const seam=border(u*columns+.5*(row%2))<.023||border(v*26)<.023;
 const ribbon=border(v*6)<.008||border(u*12)<.009;
 const c=ribbon?'#707070':seam?'#181818':'#090909';
 return lit(c,illumination);
}
