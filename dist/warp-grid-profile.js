// The patch is measured in the ship's sheet plane, in bubble radii. The
// optical field is a separate volume and can extend past this finite chart.
export const WARP_GRID_SPACING=.16;
export const WARP_GRID_FADE_START=1.1;
export const WARP_GRID_RADIUS=1.4;
const ease=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

// Canvas samples the same displaced surface and exterior visibility as GLSL.
// Inside the wall the local reference grid remains legible even at zero slope.
export function warpGridSample(x,z,sharp,strength){
 const r=Math.hypot(x,z),e=Math.exp(-(((r-1)*sharp)**2)),k=-.34*strength;
 const h=k*x*e;
 if(r<=1)return {height:h-.35,alpha:1};
 if(r>=WARP_GRID_RADIUS)return {height:h-.35,alpha:0};
 const dr=e*(-2*sharp*sharp*(r-1))*x/r;
 const deformation=Math.max(Math.abs(h),Math.abs(k)*Math.hypot(e+dr*x,dr*z));
 const outer=ease(.012,.10,deformation);
 return {height:h-.35,alpha:(1-ease(WARP_GRID_FADE_START,WARP_GRID_RADIUS,r))*(1+(outer-1)*ease(1,1.04,r))};
}
