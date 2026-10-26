// A finite illustrative display radius, in ship bounding radii. Warp factor
// controls this automatically; it is not an Alcubierre engineering prediction.
export function effectiveWarpRadius(factor=0){
 const w=Math.max(0,Math.min(10,Number(factor)||0));
 return 2.4+.18*w+.025*w*w;
}
