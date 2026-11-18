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

// Illustrative shield against the local tidal field. Masses are GM/c² in
// world units; M/r³ is the Schwarzschild tidal scale (not a Kerr solution).
// Calibrate in fixed physical units, so larger holes are gentler at equal r/M.
export const SHIELD_REFERENCE_DISTANCE=21;
function tidalLoad(m,h,dx,dy,dz){
 if(!(m>0&&h>0))return 0;
 const distance=Math.max(h,Math.hypot(dx,dy,dz));
 return m*(SHIELD_REFERENCE_DISTANCE/distance)**3;
}
export function shieldDemand(position,holes,horizons,compactBodies=[],solarMassUnit=4300000){
 let tide=0;
 for(let i=0;i<horizons.length;i++){
  const k=i*4;
  tide+=tidalLoad(holes[k+3],horizons[i],position[0]-holes[k],position[1]-holes[k+1],position[2]-holes[k+2]);
 }
 for(const body of compactBodies)if(body.collapsed){
  const p=body.position;tide+=tidalLoad(body.massSolar/solarMassUnit,body.horizonRadius,position[0]-p[0],position[1]-p[1],position[2]-p[2]);
 }
 // Saturate smoothly toward warp-eight *appearance* only. No shield term
 // changes propulsion speed, heading, clocks, or translation of the grid.
 return 8*(tide/(1+tide));
}
export function protectiveWarpStrength(position,holes,horizons){
 return warpDisplayStrength(shieldDemand(position,holes,horizons));
}
export function combinedWarpEnvelope(warp,shield){
 const base=effectiveWarpRadius(0),driveRadius=effectiveWarpRadius(warp),driveStrength=warpDisplayStrength(warp);
 if(!(shield>0))return {radius:driveRadius,strength:driveStrength};
 return {radius:base+Math.hypot(driveRadius-base,effectiveWarpRadius(shield)-base),
  strength:Math.hypot(driveStrength,warpDisplayStrength(shield))};
}
