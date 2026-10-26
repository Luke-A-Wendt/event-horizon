import {effectiveWarpRadius} from './warp-physics.js';

// Match the closed viewport HUD, in CSS pixels. The flight strip itself is
// outside the canvas. Rectangular obstacles avoid throwing away an entire row
// merely because a control occupies its corner.
export function warpViewObstacles(width,height,driving=false,cssWidth=width,cssHeight=height){
 const mobile=cssWidth<=600,landscape=cssWidth>cssHeight&&cssHeight<=520,short=landscape&&cssHeight<=420;
 const rectangles=[[10,12,Math.min(width-90,140),54],[Math.max(10,width-(mobile?218:285)),10,width-10,54]];
 if(mobile&&driving&&!short)rectangles.push([9,58,width-9,106]);
 else if(!(driving&&short))rectangles.push([Math.max(9,(width-470)/2),height-77,Math.min(width-9,(width+470)/2),height-8]);
 if(!(mobile&&driving)&&!(driving&&landscape&&cssHeight<=400))rectangles.push([17,landscape?66:78,Math.min(width-64,landscape?width-255:317),landscape?94:144]);
 {
  const bottom=driving?(mobile?118:82):118;
  if(!(driving&&landscape&&cssHeight<=400)){
   if(landscape)rectangles.push([width-220,66,width-12,102]);
   else rectangles.push([width-58,Math.max(112,height-bottom-216),width-12,height-bottom]);
  }
  if(driving&&!(landscape&&cssHeight<=360))rectangles.push([Math.max(16,width-225),height-(mobile?92:157),width-(mobile?12:68),height-(mobile?9:82)]);
  else if(!driving)rectangles.push([17,height-180,Math.min(width-68,240),height-111]);
 }
 return rectangles.filter(([x0,y0,x1,y1])=>x1>x0&&y1>y0);
}

// Exact perspective extent for the bubble's bounding sphere; projected hull
// bounds at zero warp, so a long, flat Enterprise is not fitted as a sphere.
export function warpSideFraming(width,height,factor=4,{enabled=true,yaw=-Math.PI/2,pitch=0,lookYaw=0,lookPitch=0,driving=false,cssWidth=width,cssHeight=height}={}){
 width=Math.max(1,width);height=Math.max(1,height);
 const aspect=width/height,fov=.83*Math.max(1,1.35/aspect),projection=height/fov,margin=12,cx=width*.5,cy=height*.5,obstacles=warpViewObstacles(width,height,driving,cssWidth,cssHeight);
 const nearest=([x0,y0,x1,y1])=>Math.hypot(Math.max(x0-cx,0,cx-x1),Math.max(y0-cy,0,cy-y1));
 const pixels=Math.max(18,Math.min(cx,cy,...obstacles.map(nearest))-margin),warp=Math.max(0,Math.min(10,Number(factor)||0)),radius=enabled&&warp>0?effectiveWarpRadius(warp)*1.18:0;
 let distance;
 const centered=Math.abs(lookYaw)+Math.abs(lookPitch)<1e-10;
 if(radius&&centered)distance=radius*Math.sqrt(1+(projection/pixels)**2);
 else{
  // Bounds of the procedural TOS hull: exact1.84 normalized length, with a
  // small tolerance around the saucer rim, bridge and engineering hull keel.
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],eye=[Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch),Math.cos(pitch)*Math.cos(yaw)],baseForward=eye.map(x=>-x),baseRight=[Math.cos(yaw),0,-Math.sin(yaw)],baseUp=[-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.cos(yaw)];
  const forward=eye.map((_,i)=>(baseForward[i]*Math.cos(lookYaw)+baseRight[i]*Math.sin(lookYaw))*Math.cos(lookPitch)+baseUp[i]*Math.sin(lookPitch)),right=eye.map((_,i)=>baseRight[i]*Math.cos(lookYaw)-baseForward[i]*Math.sin(lookYaw)),up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]],center=[-dot(eye,right),-dot(eye,up),-dot(eye,forward)],corners=[];
  const clear=([x0,y0,x1,y1])=>x0>=margin&&x1<=width-margin&&y0>=margin&&y1<=height-margin&&!obstacles.some(([a,b,c,d])=>x1+margin>a&&x0-margin<c&&y1+margin>b&&y0-margin<d);
  if(center[2]<=0||!clear([cx+projection*center[0]/center[2],cy-projection*center[1]/center[2],cx+projection*center[0]/center[2],cy-projection*center[1]/center[2]]))return {distance:null,radius,pixels,fov,margin,obstacles};
  for(const x of [-.416,.416])for(const y of [-.264,.194])for(const z of [-.921,.921]){const point=[x,y,z];corners.push([dot(point,right),dot(point,up),dot(point,forward)]);}
  const fits=d=>{
   let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
   if(radius){
    const [x,y,z]=center.map(v=>v*d),den=z*z-radius*radius;if(z<=radius)return false;
    const dx=radius*Math.sqrt(x*x+z*z-radius*radius),dy=radius*Math.sqrt(y*y+z*z-radius*radius);
    x0=cx+projection*(x*z-dx)/den;x1=cx+projection*(x*z+dx)/den;y0=cy-projection*(y*z+dy)/den;y1=cy-projection*(y*z-dy)/den;
   }else for(const [x,y,z]of corners){const depth=z+d*center[2];if(depth<=0)return false;const sx=cx+projection*(x+d*center[0])/depth,sy=cy-projection*(y+d*center[1])/depth;x0=Math.min(x0,sx);x1=Math.max(x1,sx);y0=Math.min(y0,sy);y1=Math.max(y1,sy);}
   return clear([x0,y0,x1,y1]);
  };
  let lo=1.15,hi=1.15;while(!fits(hi)&&hi<1e6)hi*=2;
  if(!fits(hi))return {distance:null,radius,pixels,fov,margin,obstacles};
  for(let i=0;i<28;i++){const mid=(lo+hi)*.5;if(fits(mid))hi=mid;else lo=mid;}distance=hi;
 }
 return {distance,radius,pixels,fov,margin,obstacles};
}

// Capture cone of the renderer's central -3 M h²/r⁴ optical force. Its critical
// ray turns at 3M: E=h²/(54M²), E=1/2-Mh²/r³. This is a cheap smooth guide to
// the apparent silhouette, not a ray aimed at the hidden coordinate horizon.
// Frame dragging and the finite-step optical renderer make the Kerr edge
// approximate; this does not claim an exact Kerr observer/shadow solution.
export function apparentCaptureAngle(radius,mass){
 const r=Math.max(1e-12,radius/Math.max(mass,1e-20));
 const sin=Math.min(1,Math.sqrt(27/(r*r+54/r)));
 const angle=Math.asin(sin);return r>=3?angle:Math.PI-angle;
}
