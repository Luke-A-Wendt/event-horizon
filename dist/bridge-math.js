// Ellis ultrastatic wormhole in one isotropic chart. This is a traversable
// comparison model, not the nontraversable Einstein–Rosen bridge of vacuum GR.
// World lengths use the renderer's fixed reference gravitational radius.
export function bridgeIsotropicRadius(properRadius, throatRadius) {
 const b=Math.max(Number.MIN_VALUE,Math.abs(throatRadius)),l=Number(properRadius)||0;
 const root=Math.hypot(l,b);
 return l>=0?(l+root)/2:b*b/(2*(root-l));
}
export function bridgeProperRadius(radius, throatRadius) {
 const r=Math.max(Number.MIN_VALUE,Math.abs(radius)),b=Math.abs(throatRadius);
 return r-b*b/(4*r);
}
export function bridgeConformal(radius, throatRadius) {
 const r=Math.max(Number.MIN_VALUE,Math.abs(radius)),b=Math.abs(throatRadius);
 return 1+b*b/(4*r*r);
}
export function bridgeGradient(position, throatRadius) {
 const radius2=Math.max(1e-30,position.reduce((n,x)=>n+x*x,0)),b2=throatRadius*throatRadius;
 const scale=-2*b2/(radius2*(4*radius2+b2));
 return position.map(x=>x*scale);
}
export function bridgePath(time, throatRadius, travel=true) {
 const phase=travel?Math.max(0,time)*.12:0,l=6*throatRadius*Math.cos(phase);
 return {l,r:bridgeIsotropicRadius(l,throatRadius),inward:Math.sin(phase)>=0};
}

// A robust Gaussian line integral used by the jet sampler. This independent
// numerical counterpart makes subpixel, oblique jet crossings testable.
export function gaussianSegmentIntegral(start, end, width) {
 const d=start.map((x,i)=>end[i]-x),d2=d.reduce((s,x)=>s+x*x,0),w=Math.max(1e-12,width);
 if(d2<1e-8*w*w)return Math.exp(-start.reduce((s,x,i)=>s+(x+d[i]*.5)**2,0)/(w*w));
 const center=-start.reduce((s,x,i)=>s+x*d[i],0)/d2;
 const closest=start.map((x,i)=>x+d[i]*center),exponent=-closest.reduce((s,x)=>s+x*x,0)/(w*w),scale=Math.sqrt(d2)/w;
 const erf=x=>{const sign=Math.sign(x),a=Math.abs(x),t=1/(1+.3275911*a);return sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a));};
 return Math.exp(exponent)*Math.sqrt(Math.PI)/(2*scale)*(erf(scale*(1-center))-erf(-scale*center));
}
