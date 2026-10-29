// Illustrative debris centerline, not a hydrodynamic TDE calculation.
// The short wake starts behind the orbiting star. Farther inward, the wake
// relaxes toward radial fallback while spin turns the returning material.
export function tidalStreamBend(progress,spin){
 const u=Math.max(0,Math.min(1,progress));
 return 1.8*u*(1-u)*(1-u)-2.4*spin*u*u;
}
export const TIDAL_STREAM_GLSL=`
float tidalStreamBend(float progress,float spin){
 float u=clamp(progress,0.0,1.0);
 return 1.8*u*(1.0-u)*(1.0-u)-2.4*spin*u*u;
}
`;
