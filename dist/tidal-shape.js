// Stylized, one-sided displaced water cap over a spherical rocky core.
// This is an illustrative composite surface, not an equilibrium tide prediction.
export function tidalShape(position,primary,basis,amount){
 const delta=primary.map((v,i)=>v-position[i]),length=Math.hypot(...delta)||1;
 const direction=delta.map(v=>v/length),local=basis.map(axis=>axis.reduce((s,v,i)=>s+v*direction[i],0));
 const phase=Math.acos(Math.max(-1,Math.min(1,local[0]))),tilt=Math.atan2(-local[1],local[2]);
 const radiusRatio=.85,offsetRatio=.15+.5*Math.max(0,Math.min(1,Number(amount)||0));
 return {axes:[1,1,1],phase,tilt,boundRatio:Math.max(1,offsetRatio+radiusRatio),waterCap:{direction,radiusRatio,offsetRatio}};
}
