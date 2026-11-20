// Fictional bed relief relative to the planet's undeformed mean sea level, in
// metres. Sample unit directions in the solid's co-rotating frame. The field
// lives in 3D, so there is no longitude seam or special treatment at a pole.
// Wave vectors, phases and amplitudes are shared by the CPU and fragment shader.
const PELAGIA_WAVES=[
 [3.1,1.35,-2.4,.84,.42],[-1.3,4.55,1.8,-1.51,.35],[2.25,-2.9,3.65,2.43,.26],
 [7.3,-2.0,-5.6,.57,.18],[-5.5,-7.1,1.9,1.37,.14],[1.7,8.3,6.1,-2.9,.10],
 [13.5,7.2,-8.5,1.17,.073],[-10.5,19.8,7.5,1.46,.053],
 [34.3,-20.7,17.4,1.39,.034],[-28.7,11.8,42.9,-.68,.026],
 [68.7,43.4,-17.8,.11,.014],[17.3,-57.6,-80.9,1.12,.008]
];
const SHELF_EDGE=.27;
const shelfBlend=(lo,hi,v)=>{const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t);};
export function pelagiaBedMeters(x,y,z){
 const px=x+.16*Math.sin(3.8*y+1.7*z),py=y+.14*Math.sin(2.9*z-2.4*x),pz=z+.12*Math.sin(3.5*x+2.7*y);
 let h=-SHELF_EDGE;
 for(const [a,b,c,phase,weight] of PELAGIA_WAVES)h+=weight*Math.sin(a*px+b*py+c*pz+phase);
 const trench=1-shelfBlend(-.54,-.07,h),ridge=Math.max(0,1-Math.abs(Math.sin(13.7*px-7.3*py+8.5*pz+1.6*Math.sin(6.1*py+3.4*pz))));
 return 2400*h-4050*trench+3000*ridge**3*shelfBlend(.06,.45,h);
}
const numberGlsl=v=>Number.isInteger(v)?v.toFixed(1):String(v);
export const PELAGIA_BED_GLSL=`
float pelagiaBedMeters(vec3 n){
 vec3 p=n+vec3(.16,.14,.12)*sin(vec3(3.8*n.y+1.7*n.z,2.9*n.z-2.4*n.x,3.5*n.x+2.7*n.y));
 float h=-${numberGlsl(SHELF_EDGE)};
 ${PELAGIA_WAVES.map(([a,b,c,phase,weight])=>'h+='+numberGlsl(weight)+'*sin(dot(p,vec3('+[a,b,c].map(numberGlsl).join(',')+'))+('+numberGlsl(phase)+'));').join('\n ')}
 float trench=1.0-smoothstep(-.54,-.07,h),ridge=max(0.,1.-abs(sin(dot(p,vec3(13.7,-7.3,8.5))+1.6*sin(6.1*p.y+3.4*p.z))));
 return 2400.*h-4050.*trench+3000.*ridge*ridge*ridge*smoothstep(.06,.45,h);
}
`;
