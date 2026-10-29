import {speedForWarp,FLIGHT_LIGHT_SPEED,FLIGHT_WARP_MAX} from './flight-dynamics.js';
// A finite illustrative display radius, in ship bounding radii. Warp factor
// controls this automatically; it is not an Alcubierre engineering prediction.
export function effectiveWarpRadius(factor=0){
 const w=Math.max(0,Math.min(10,Number(factor)||0));
 return 2.4+.18*w+.025*w*w;
}

// The metric shift uses beta=v/c. Screen displacement is logarithmically
// compressed to stay readable at fictional superluminal speeds, not substituted
// into the physical Alcubierre equation as an exact geodesic calculation.
export function warpDisplayStrength(factor=0){
 const beta=speedForWarp(factor)/FLIGHT_LIGHT_SPEED;
 return 3*Math.log1p(beta)/Math.log1p(speedForWarp(FLIGHT_WARP_MAX)/FLIGHT_LIGHT_SPEED);
}
// Closed planar Lissajous route, entirely inside the authored anomaly region.
export function anomalyCruise(phase,center,radius){
 const t=Number(phase)||0,R=Math.max(0,radius),x=-.55*R*Math.cos(t),z=.35*R*Math.sin(2*t);
 const tangent=[.55*Math.sin(t),0,.70*Math.cos(2*t)],length=Math.hypot(...tangent)||1;
 return {position:[center[0]+x,center[1],center[2]+z],forward:tangent.map(v=>v/length)};
}
